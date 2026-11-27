// Coleta Gmail POR CAIXA (várias caixas autorizadas, cada uma com cursor, estado e erros próprios). Puro: sem rede,
// sem banco, sem segredos. Reaproveita a porta por caixa (gmail-mailbox-gate.mjs) e os controles do banco
// (email_mailbox_collection_controls, migrations 20261107090000 + 20261121110000 + 20261214100000).
//
// Regras (docs/gmail-coleta-por-caixa.md):
//   - Uma caixa só é coletada quando a porta por caixa libera (lista da obra + autorização corporativa + permissão
//     técnica + coleta habilitada + período) E o aceite individual do titular está REGISTRADO (AUTORIZADO).
//     PENDENTE, ausente, RECUSADO ou REVOGADO => a caixa é PULADA e aparece no relatório com o motivo.
//   - Sem credencial (OAuth da própria caixa ou delegação configurada) => PULADA ("SEM_CREDENCIAL").
//   - A caixa legada (GOOGLE_GMAIL_INBOUND_MAILBOX) sem registro de controle continua no caminho histórico
//     (cursor da configuração da obra); com registro de controle passa a ser tratada como qualquer outra caixa.
//   - Migration 20261214100000 ausente => modo histórico de UMA caixa (compatibilidade), com aviso no log.
//   - Perímetro: participantes dos domínios EXTERNOS cadastrados para a obra (cliente, gerenciadora, fornecedores,
//     subcontratadas, seguradoras, corretoras...). E-mail só interno fica FORA, salvo opção explícita
//     (project_email_ingestion_configs.include_internal_only_messages, padrão false; exige autorização do Dono).

import crypto from "node:crypto";
import { evaluateMailboxCollection, mostRestrictiveConsent, normalizeMailbox, deriveIndividualConsent, resolveDelegatedReadWindow } from "./gmail-mailbox-gate.mjs";

export const PER_MAILBOX_MIGRATION = "20261214100000";
export const DEFAULT_MAX_WINDOW_DAYS = 7;
export const DEFAULT_OVERLAP_MS = 10 * 60 * 1000;
export const INTERNAL_DOMAIN_ROLES = new Set(["AXION", "INTERNAL", "INTERNO"]);
export const MAX_TITULAR_SLOTS = 6;

/** Coluna/tabela inexistente (migration não aplicada): PostgreSQL 42703/42P01, PostgREST PGRST204/PGRST205. */
export function isMissingSchemaError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (["42703", "42P01", "PGRST204", "PGRST205"].includes(code)) return true;
  return /does not exist|could not find the|schema cache/i.test(String(error.message ?? ""));
}

/**
 * Modo da execução agendada a partir das sondas do banco (coluna nova do controle + opção da configuração):
 *   PER_MAILBOX     — migration aplicada: percorre as caixas autorizadas;
 *   LEGACY_FALLBACK — migration ausente: UMA caixa (GOOGLE_GMAIL_INBOUND_MAILBOX), comportamento anterior, com aviso;
 *   ERROR           — outra falha de leitura: falha FECHADA (nada é lido do Gmail).
 */
export function decideRunMode({ controlsError = null, configError = null } = {}) {
  if (isMissingSchemaError(controlsError) || isMissingSchemaError(configError)) return { mode: "LEGACY_FALLBACK", reason: `migration ${PER_MAILBOX_MIGRATION} não aplicada` };
  if (controlsError || configError) return { mode: "ERROR", reason: String((controlsError ?? configError)?.message ?? "falha de leitura") };
  return { mode: "PER_MAILBOX", reason: null };
}

/** Identificador opaco para log público (o repositório e os logs do Actions são públicos). */
export function maskMailbox(mailbox) {
  const value = normalizeMailbox(mailbox);
  return `caixa#${crypto.createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
}

// ---------------------------------------------------------------- credenciais (só NOMES de variáveis, nunca valores)

function localPartKey(mailbox) {
  return normalizeMailbox(mailbox).split("@")[0].replace(/[^a-z0-9]+/gi, "_").toUpperCase();
}

const filled = (env, name) => Boolean(env[name]?.trim());

/**
 * De onde vem a credencial OAuth (gmail.readonly) da caixa. Ordem:
 *   1. GOOGLE_GMAIL_<LOCAL>_CLIENT_ID/_CLIENT_SECRET/_REFRESH_TOKEN (convenção histórica do Gmail Inbound Sync);
 *   2. slot neutro GOOGLE_GMAIL_TITULAR_<N>_* cujo _MAILBOX é esta caixa (cliente do slot ou o compartilhado
 *      GOOGLE_GMAIL_INBOUND_CLIENT_ID/_SECRET).
 * @returns {{ source: string, names: { clientId: string, clientSecret: string, refreshToken: string } } | null}
 */
export function resolveOAuthCredentialNames(mailbox, env = process.env) {
  const target = normalizeMailbox(mailbox);
  const key = localPartKey(target);
  const own = { clientId: `GOOGLE_GMAIL_${key}_CLIENT_ID`, clientSecret: `GOOGLE_GMAIL_${key}_CLIENT_SECRET`, refreshToken: `GOOGLE_GMAIL_${key}_REFRESH_TOKEN` };
  if (Object.values(own).every((name) => filled(env, name))) return { source: "OAUTH_CAIXA", names: own };

  for (let slot = 1; slot <= MAX_TITULAR_SLOTS; slot += 1) {
    const prefix = `GOOGLE_GMAIL_TITULAR_${slot}`;
    if (normalizeMailbox(env[`${prefix}_MAILBOX`]) !== target || !filled(env, `${prefix}_REFRESH_TOKEN`)) continue;
    const ownClient = filled(env, `${prefix}_CLIENT_ID`) && filled(env, `${prefix}_CLIENT_SECRET`);
    const names = {
      clientId: ownClient ? `${prefix}_CLIENT_ID` : "GOOGLE_GMAIL_INBOUND_CLIENT_ID",
      clientSecret: ownClient ? `${prefix}_CLIENT_SECRET` : "GOOGLE_GMAIL_INBOUND_CLIENT_SECRET",
      refreshToken: `${prefix}_REFRESH_TOKEN`,
    };
    if (Object.values(names).every((name) => filled(env, name))) return { source: "OAUTH_SLOT_TITULAR", names };
  }
  // GOOGLE_GMAIL_INBOUND_* (sem nome de caixa) NUNCA é usado aqui: só o caminho histórico o usa. Assim uma caixa
  // nunca é lida com a credencial de outra (e o getProfile ainda confere a conta autenticada).
  return null;
}

/** Delegação em todo o domínio só conta quando o controle pede DOMAIN_DELEGATION e o executor tem a conta de serviço. */
export function delegationAvailable(control, env = process.env) {
  return String(control?.auth_mode ?? "").toUpperCase() === "DOMAIN_DELEGATION" && filled(env, "GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT");
}

/** Credencial efetiva da caixa: OAuth da própria caixa tem precedência; depois delegação; senão nenhuma. */
export function resolveMailboxCredential(mailbox, control, env = process.env) {
  const oauth = resolveOAuthCredentialNames(mailbox, env);
  if (oauth) return { mode: "OAUTH_USUARIO", ...oauth };
  if (delegationAvailable(control, env)) return { mode: "DOMAIN_DELEGATION", source: "DOMAIN_DELEGATION", names: null };
  return null;
}

// ---------------------------------------------------------------- seleção das caixas

/**
 * Plano da execução agendada. Nada aqui lê o Gmail.
 * @param {object} input
 * @param {Array<{mailbox_address: string, enabled: boolean}>} input.allowlist  lista explícita da obra
 * @param {Array<object>} input.controls  linhas de email_mailbox_collection_controls da obra
 * @param {Array<object>} input.consents  linhas de email_access_authorizations da obra
 * @param {string|null} input.legacyMailbox  GOOGLE_GMAIL_INBOUND_MAILBOX (compatibilidade)
 * @returns {{ collect: Array<{mailbox, control, credential}>, skipped: Array<{mailbox, reasons: string[]}>, legacy: {mailbox, run: boolean, reason: string}|null }}
 */
export function planMailboxCollection({ allowlist = [], controls = [], consents = [], legacyMailbox = null, env = process.env, now = new Date() }) {
  const allow = new Set((allowlist ?? []).filter((row) => row.enabled === true).map((row) => normalizeMailbox(row.mailbox_address)));
  const byMailbox = new Map((controls ?? []).map((row) => [normalizeMailbox(row.mailbox_address), row]));
  const consentMailboxes = (consents ?? []).map((row) => normalizeMailbox(row.account_email));
  const candidates = [...new Set([...allow, ...byMailbox.keys(), ...consentMailboxes])].filter(Boolean).sort();
  const legacy = normalizeMailbox(legacyMailbox) || null;

  const collect = [];
  const skipped = [];
  let legacyPlan = null;

  for (const mailbox of candidates) {
    const control = byMailbox.get(mailbox) ?? null;
    const consent = deriveIndividualConsent(consents ?? [], mailbox);
    if (!control) {
      if (mailbox === legacy) {
        legacyPlan = allow.has(mailbox)
          ? { mailbox, run: true, reason: "CAIXA_LEGADA_SEM_CONTROLE_POR_CAIXA" }
          : { mailbox, run: false, reason: "CAIXA_LEGADA_FORA_DA_LISTA_DA_OBRA" };
        continue;
      }
      const reasons = ["SEM_REGISTRO_DE_CONTROLE"];
      if (!allow.has(mailbox)) reasons.push("FORA_DA_LISTA_DA_OBRA");
      reasons.push(...consentReasons(consent.status));
      skipped.push({ mailbox, reasons });
      continue;
    }
    const effectiveConsent = mostRestrictiveConsent(control.individual_consent_status, consent.status);
    const effective = { ...control, individual_consent_status: effectiveConsent };
    // Caixa legada em TRANSIÇÃO (controle criado, coleta por caixa ainda não ligada, nada revogado/recusado): continua
    // no caminho histórico para não abrir lacuna; ao ligar a coleta por caixa, sai do caminho histórico.
    if (mailbox === legacy && control.collection_enabled !== true) {
      const denied = control.revoked_at || control.corporate_authorization_status === "REVOGADA" || effectiveConsent === "RECUSADO" || effectiveConsent === "REVOGADO";
      legacyPlan = denied
        ? { mailbox, run: false, reason: "CAIXA_LEGADA_REVOGADA_OU_RECUSADA" }
        : allow.has(mailbox)
          ? { mailbox, run: true, reason: "CAIXA_LEGADA_EM_TRANSICAO_PARA_CONTROLE_POR_CAIXA" }
          : { mailbox, run: false, reason: "CAIXA_LEGADA_FORA_DA_LISTA_DA_OBRA" };
      continue;
    }
    const gate = evaluateMailboxCollection(effective, { now, allowlisted: allow.has(mailbox) });
    const reasons = [...gate.blockers, ...consentReasons(effectiveConsent)];
    const credential = resolveMailboxCredential(mailbox, control, env);
    if (!credential) reasons.push("SEM_CREDENCIAL");
    const unique = [...new Set(reasons)];
    if (unique.length > 0) skipped.push({ mailbox, reasons: unique });
    else collect.push({ mailbox, control: effective, credential });
  }

  if (legacy && !legacyPlan && !byMailbox.has(legacy)) {
    legacyPlan = { mailbox: legacy, run: false, reason: "CAIXA_LEGADA_FORA_DA_LISTA_DA_OBRA" };
  }
  return { collect, skipped, legacy: legacyPlan };
}

/** Aceite individual: só AUTORIZADO (ACEITE_REGISTRADO) libera. Pendente/ausente NÃO é autorização. */
function consentReasons(status) {
  if (status === "ACEITE_REGISTRADO") return [];
  if (status === "RECUSADO" || status === "REVOGADO") return ["ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO"];
  return ["ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE"];
}

// ---------------------------------------------------------------- cursor por caixa

/**
 * Janela da caixa: começa no cursor PRÓPRIO (last_sync_at do controle; sem ele, period_start), com sobreposição que
 * nunca recua para antes do período; termina no agora/fim do período e, para retomada incremental, no máximo
 * `maxWindowDays` depois do início (a carga inicial desde period_start anda em fatias e retoma de onde parou).
 * @returns {{ start: Date, overlapStart: Date, end: Date, capped: boolean, empty: boolean } | null}
 */
export function resolvePerMailboxWindow(control, { now = new Date(), overlapMs = DEFAULT_OVERLAP_MS, maxWindowDays = DEFAULT_MAX_WINDOW_DAYS } = {}) {
  const base = resolveDelegatedReadWindow(control, { now, overlapMs });
  if (!base) return null;
  const limit = maxWindowDays > 0 ? new Date(base.start.getTime() + maxWindowDays * 24 * 3600 * 1000) : null;
  const capped = Boolean(limit && limit < base.end);
  const end = capped ? limit : base.end;
  return { start: base.start, overlapStart: base.overlapStart, end, capped, empty: base.overlapStart >= end };
}

/** Cursor a gravar no fim da execução bem-sucedida: o fim da janela lida (nunca o relógio de parede). */
export function nextCursor(window, { sample = false } = {}) {
  if (!window || sample) return null;
  return window.end.toISOString();
}

// ---------------------------------------------------------------- perímetro (domínios externos)

export function domainOf(address) {
  return String(address ?? "").trim().toLowerCase().split("@")[1] ?? "";
}

/** Domínio igual ou subdomínio legítimo (fronteira de ponto): "x.weg.net" casa "weg.net"; "evilweg.net" não. */
export function domainMatches(domain, registered) {
  const d = String(domain ?? "").toLowerCase();
  const r = String(registered ?? "").toLowerCase();
  return Boolean(d && r) && (d === r || d.endsWith(`.${r}`));
}

/** Separa domínios cadastrados da obra em externos (perímetro) e internos (AXION). */
export function splitPerimeterDomains(domainRows = []) {
  const external = [];
  const internal = [];
  for (const row of domainRows ?? []) {
    if (row.enabled === false) continue;
    const domain = String(row.domain ?? "").trim().toLowerCase();
    if (!domain) continue;
    (INTERNAL_DOMAIN_ROLES.has(String(row.domain_role ?? "").toUpperCase()) ? internal : external).push(domain);
  }
  return { external: [...new Set(external)].sort(), internal: [...new Set(internal)].sort() };
}

/** Consulta Gmail (sem chaves externas): qualquer participante de um domínio externo, nos dois sentidos. */
export function perimeterQueryTerms(externalDomains = []) {
  return externalDomains.flatMap((domain) => ["from", "to", "cc", "bcc"].map((field) => `${field}:${domain}`)).join(" ");
}

/**
 * Classifica a mensagem pelo perímetro. `participants` = From + To + Cc + Bcc.
 * @returns {{ eligible: boolean, reason: "EXTERNO_AUTORIZADO"|"SOMENTE_INTERNO_INCLUIDO"|"SOMENTE_INTERNO_EXCLUIDO"|"FORA_DO_PERIMETRO" }}
 */
export function classifyPerimeter({ participants = [], externalDomains = [], internalDomains = [], includeInternalOnly = false }) {
  const domains = participants.map(domainOf).filter(Boolean);
  if (domains.some((d) => externalDomains.some((r) => domainMatches(d, r)))) return { eligible: true, reason: "EXTERNO_AUTORIZADO" };
  const allInternal = domains.length > 0 && domains.every((d) => internalDomains.some((r) => domainMatches(d, r)));
  if (allInternal) return includeInternalOnly ? { eligible: true, reason: "SOMENTE_INTERNO_INCLUIDO" } : { eligible: false, reason: "SOMENTE_INTERNO_EXCLUIDO" };
  return { eligible: false, reason: "FORA_DO_PERIMETRO" };
}

// ---------------------------------------------------------------- deduplicação por caixa e entre caixas

/**
 * (1) mesmo id do Gmail NESTA caixa (provider_message_id + mailbox; índice único do banco) => duplicada;
 * (2) mesma mensagem já gravada por OUTRA caixa da obra (Message-ID) => não cria outra linha em emails: só registra a
 *     origem (email_message_sources) apontando para a linha existente.
 * @param {Array<object>} rows  linhas candidatas (com provider_message_id, message_id_header, mailbox_address)
 * @param {{ existingSameMailbox: Set<string>, existingByHeader: Map<string, {id: string, mailbox_address: string}> }} known
 */
export function dedupePerMailbox(rows, { existingSameMailbox = new Set(), existingByHeader = new Map() } = {}) {
  const fresh = [];
  const crossMailbox = [];
  let sameMailbox = 0;
  const seenIds = new Set();
  const seenHeaders = new Set();
  for (const row of rows ?? []) {
    const id = String(row.provider_message_id ?? "");
    if (!id) continue;
    if (existingSameMailbox.has(id) || seenIds.has(id)) {
      sameMailbox += 1;
      continue;
    }
    seenIds.add(id);
    const header = normalizeMessageIdHeader(row.message_id_header);
    const other = header ? existingByHeader.get(header) : null;
    if (other && normalizeMailbox(other.mailbox_address) !== normalizeMailbox(row.mailbox_address)) {
      crossMailbox.push({ emailId: other.id, providerMessageId: id, mailbox: normalizeMailbox(row.mailbox_address) });
      continue;
    }
    if (header && seenHeaders.has(header)) {
      sameMailbox += 1;
      continue;
    }
    if (header) seenHeaders.add(header);
    fresh.push(row);
  }
  return { fresh, crossMailbox, sameMailbox };
}

export function normalizeMessageIdHeader(value) {
  const v = String(value ?? "").trim().toLowerCase();
  return v || null;
}

/** Última mensagem importada (mais recente por sent_at) — para o estado visível da caixa. */
export function latestImported(rows = []) {
  let best = null;
  for (const row of rows ?? []) {
    if (!row?.provider_message_id || !row?.sent_at) continue;
    if (!best || new Date(row.sent_at) > new Date(best.sent_at)) best = row;
  }
  return best ? { messageId: best.provider_message_id, at: new Date(best.sent_at).toISOString() } : null;
}

/** Resumo do plano para o log público: nunca o endereço, só o identificador opaco e os motivos. */
export function formatPlanForLog(plan) {
  const lines = [];
  for (const item of plan.collect) lines.push(`COLETAR ${maskMailbox(item.mailbox)} credencial=${item.credential.source}`);
  for (const item of plan.skipped) lines.push(`PULADA  ${maskMailbox(item.mailbox)} motivos=${item.reasons.join(",")}`);
  if (plan.legacy) lines.push(`LEGADA  ${maskMailbox(plan.legacy.mailbox)} executar=${plan.legacy.run} motivo=${plan.legacy.reason}`);
  return lines;
}

// ---------------------------------------------------------------- comparação SÓ DE METADADOS (Gmail x banco)

/**
 * Compara ids do Gmail (messages.list, só ids) com emails.provider_message_id da MESMA caixa. Nada de conteúdo.
 * @returns {{ gmail: number, db: number, matched: number, missingInDb: string[], onlyInDb: string[] }}
 */
export function compareMailboxIds({ gmailIds = [], dbIds = [] } = {}) {
  const g = new Set(gmailIds.filter(Boolean));
  const d = new Set(dbIds.filter(Boolean));
  const missingInDb = [...g].filter((id) => !d.has(id)).sort();
  const onlyInDb = [...d].filter((id) => !g.has(id)).sort();
  return { gmail: g.size, db: d.size, matched: g.size - missingInDb.length, missingInDb, onlyInDb };
}

/** Caixas elegíveis à comparação: na lista da obra, com aceite AUTORIZADO e credencial OAuth própria. */
export function mailboxesForComparison({ allowlist = [], consents = [], controls = [], env = process.env } = {}) {
  const out = [];
  for (const row of allowlist ?? []) {
    if (row.enabled !== true) continue;
    const mailbox = normalizeMailbox(row.mailbox_address);
    const control = (controls ?? []).find((c) => normalizeMailbox(c.mailbox_address) === mailbox) ?? null;
    const derived = deriveIndividualConsent(consents ?? [], mailbox).status;
    const consentState = control ? mostRestrictiveConsent(control.individual_consent_status, derived) : derived;
    const credential = resolveOAuthCredentialNames(mailbox, env);
    if (consentState === "ACEITE_REGISTRADO" && credential && !control?.revoked_at) out.push({ mailbox, credential });
  }
  return out;
}
