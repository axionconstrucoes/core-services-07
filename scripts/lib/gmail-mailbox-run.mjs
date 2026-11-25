// Decisões de execução por CAIXA no modo delegação (leitura do banco + porta pura). Sem rede Google, sem segredos.
// `supabase` é um cliente Supabase (ou compatível): from(t).select(c).eq(..).maybeSingle() / order() -> { data, error }.
//
// Regras:
//   - Falha FECHADA: se a tabela de controles não existe (migration 20261107090000 não aplicada) ou não pode ser lida,
//     NADA é lido do Gmail e a mensagem diz exatamente o que falta.
//   - O aceite individual vem de email_access_authorizations (fonte do consentimento) e do controle; vale o MAIS restritivo.
//   - Revogação efetiva: o estado é RELIDO imediatamente antes de gravar mensagens; revogada/desligada => nada é gravado.
//   - Cursor por caixa: só o controle desta (obra, caixa) é usado; nunca o de outra caixa nem o da configuração da obra.
import {
  deriveIndividualConsent,
  evaluateMailboxCollection,
  evaluateTechnicalCheck,
  mostRestrictiveConsent,
  normalizeMailbox,
} from "./gmail-mailbox-gate.mjs";

export const CONTROLS_TABLE = "email_mailbox_collection_controls";
export const CONTROLS_MISSING_MESSAGE =
  "Controles por caixa indisponíveis: a tabela email_mailbox_collection_controls não existe neste banco " +
  "(migration 20261107090000 não aplicada). Coleta por delegação BLOQUEADA (falha fechada); nenhuma mensagem foi lida.";

/** Erro de relação/tabela inexistente (PostgreSQL 42P01; PostgREST PGRST205/PGRST204 "schema cache"). */
export function isMissingRelationError(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205") return true;
  return /does not exist|could not find the table|schema cache/i.test(String(error.message ?? ""));
}

async function loadAllowlisted(supabase, projectId, mailbox) {
  const { data: config, error: configError } = await supabase
    .from("project_email_ingestion_configs").select("id").eq("project_id", projectId).maybeSingle();
  if (configError) return { error: `Configuração de ingestão ilegível: ${configError.message}` };
  if (!config) return { allowlisted: false };
  const { data, error } = await supabase
    .from("project_email_ingestion_mailboxes").select("mailbox_address,enabled").eq("config_id", config.id);
  if (error) return { error: `Lista de caixas da obra ilegível: ${error.message}` };
  return { allowlisted: (data ?? []).some((row) => row.enabled === true && normalizeMailbox(row.mailbox_address) === mailbox) };
}

/**
 * Lê o estado ATUAL da caixa: controle, lista da obra e aceite individual. Nunca lança por ausência de tabela:
 * devolve { failClosed: true, reason } para o chamador encerrar sem ler nada.
 */
export async function loadMailboxState(supabase, projectId, rawMailbox) {
  const mailbox = normalizeMailbox(rawMailbox);
  const { data: control, error: controlError } = await supabase
    .from(CONTROLS_TABLE).select("*").eq("project_id", projectId).eq("mailbox_address", mailbox).maybeSingle();
  if (controlError) {
    return { failClosed: true, reason: isMissingRelationError(controlError) ? CONTROLS_MISSING_MESSAGE : `Controle da caixa ilegível (falha fechada): ${controlError.message}` };
  }
  const allow = await loadAllowlisted(supabase, projectId, mailbox);
  if (allow.error) return { failClosed: true, reason: allow.error };
  const { data: authorizations, error: authError } = await supabase
    .from("email_access_authorizations").select("id,account_email,status,requested_at,decided_at")
    .eq("project_id", projectId).eq("account_email", mailbox);
  if (authError) return { failClosed: true, reason: `Aceites individuais ilegíveis (falha fechada): ${authError.message}` };
  const derived = deriveIndividualConsent(authorizations ?? [], mailbox);
  const effective = control
    ? { ...control, individual_consent_status: mostRestrictiveConsent(control.individual_consent_status, derived.status) }
    : null;
  return { failClosed: false, mailbox, control: effective, rawControl: control ?? null, allowlisted: allow.allowlisted, consent: derived };
}

/** Decisão de início da execução. mode: "technical_check" | "collect". */
export async function prepareDelegatedRun({ supabase, projectId, mailbox, mode = "collect", now = new Date() }) {
  const state = await loadMailboxState(supabase, projectId, mailbox);
  if (state.failClosed) return { proceed: false, failClosed: true, reason: state.reason, blockers: ["CONTROLES_INDISPONIVEIS"], state };
  if (mode === "technical_check") {
    const gate = evaluateTechnicalCheck(state.control, { allowlisted: state.allowlisted });
    return { proceed: gate.canCheck, failClosed: false, blockers: gate.blockers, state };
  }
  const gate = evaluateMailboxCollection(state.control, { now, allowlisted: state.allowlisted });
  return { proceed: gate.canCollect, failClosed: false, blockers: gate.blockers, state };
}

/**
 * Releitura imediatamente ANTES de gravar: se a caixa foi revogada, desligada, saiu do período ou da lista durante a
 * execução, a gravação não acontece. Revogar para a coleta na hora, não "na próxima execução".
 */
export async function assertStillCollectable({ supabase, projectId, mailbox, now = new Date() }) {
  const decision = await prepareDelegatedRun({ supabase, projectId, mailbox, mode: "collect", now });
  return { ok: decision.proceed, blockers: decision.blockers, reason: decision.reason ?? null };
}

/**
 * Erro do Gmail que vale nova tentativa (limitada): cota/limite (429, 403 rateLimitExceeded/userRateLimitExceeded)
 * e indisponibilidade (5xx). 401/403 de permissão e 404 NÃO são repetidos — repetir não muda o resultado.
 */
export function isRetryableGmailError(error) {
  const status = Number(error?.status ?? error?.code ?? error?.response?.status);
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  if (status === 403) {
    const reasons = (error?.errors ?? error?.response?.data?.error?.errors ?? []).map((e) => String(e?.reason ?? ""));
    return reasons.some((reason) => /rateLimitExceeded|userRateLimitExceeded|backendError/.test(reason));
  }
  return false;
}

/** Tentativas com espera exponencial e TETO (nunca infinitas). `sleep` injetável para teste. */
export async function withLimitedRetry(fn, { attempts = 5, baseMs = 2000, maxMs = 60000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onRetry } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryableGmailError(error) || attempt >= attempts - 1) throw error;
      const wait = Math.min(maxMs, baseMs * 2 ** attempt);
      onRetry?.(attempt + 1, wait);
      await sleep(wait);
    }
  }
}

/** Texto curto e SEM segredos para registrar no controle (nunca tokens, assertion ou corpo do erro do Google). */
export function safeErrorDetail(error) {
  const message = String(error?.message ?? error ?? "erro desconhecido");
  const code = /DWD_TOKEN_EXCHANGE_FAILED:[a-z_0-9]+/i.exec(message)?.[0];
  if (code) return code;
  const status = error?.status ?? error?.code ?? error?.response?.status;
  return (status ? `HTTP ${status}: ` : "") + message.replace(/ya29\.[\w.-]+|eyJ[\w.-]+/g, "[redigido]").slice(0, 180);
}
