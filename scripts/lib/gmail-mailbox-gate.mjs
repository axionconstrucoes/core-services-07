// Porta de coleta por CAIXA do Gmail (modo delegação em todo o domínio). Puro: sem rede, sem banco, sem segredos.
//
// A delegação do Google NÃO limita o acesso a uma obra nem a uma caixa: quem limita é o ACC. Uma caixa só é lida
// quando TODAS as condições abaixo valem, e cada estado é mostrado separadamente (nunca fundidos, nunca presumidos):
//   1. lista explícita da obra (project_email_ingestion_mailboxes, enabled);
//   2. autorização corporativa REGISTRADA para a caixa (AUTORIZADA, não revogada);
//   3. permissão técnica CONFIRMADA (o teste real de delegação funcionou);
//   4. coleta explicitamente habilitada (collection_enabled) — nunca ligada em massa;
//   5. período EXPLÍCITO (period_start E period_end definidos) e o instante atual dentro dele.
// Pré-cadastro, papel ADMINISTRADOR e cadastro na lista da obra NÃO autorizam nada por si: só o registro de controle desta caixa.
// O aceite individual é um estado À PARTE: NAO_APLICAVEL | NAO_REGISTRADO | ACEITE_REGISTRADO | RECUSADO | REVOGADO.
// Não bloqueia quando inexistente, mas RECUSADO/REVOGADO bloqueia. Nunca é inferido nem preenchido por padrão.

export const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CORPORATE_DOMAIN = "axion.com.br";

export const CORPORATE_AUTHORIZATION_STATES = ["NAO_REGISTRADA", "AUTORIZADA", "REVOGADA"];
export const INDIVIDUAL_CONSENT_STATES = ["NAO_APLICAVEL", "NAO_REGISTRADO", "ACEITE_REGISTRADO", "RECUSADO", "REVOGADO"];
export const TECHNICAL_PERMISSION_STATES = ["NAO_VERIFICADA", "CONFIRMADA", "FALHA"];

export function normalizeMailbox(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function isCorporateMailbox(value) {
  const mailbox = normalizeMailbox(value);
  return /^[a-z0-9._%+-]+@[a-z0-9.-]+$/.test(mailbox) && mailbox.endsWith(`@${CORPORATE_DOMAIN}`);
}

/**
 * @param {object|null|undefined} control  linha de email_mailbox_collection_controls
 * @param {{ now?: Date, allowlisted?: boolean }} ctx  allowlisted = a caixa está na lista habilitada da obra
 */
export function evaluateMailboxCollection(control, { now = new Date(), allowlisted = false } = {}) {
  const states = {
    corporateAuthorization: control?.corporate_authorization_status ?? "NAO_REGISTRADA",
    individualConsent: control?.individual_consent_status ?? "NAO_REGISTRADO",
    technicalPermission: control?.technical_permission_status ?? "NAO_VERIFICADA",
    collectionActive: control?.collection_enabled === true && !control?.revoked_at,
  };
  const blockers = [];
  if (!control) {
    blockers.push("SEM_REGISTRO_DE_CONTROLE");
    return { canCollect: false, blockers, states };
  }
  if (!isCorporateMailbox(control.mailbox_address)) blockers.push("CAIXA_FORA_DO_DOMINIO_CORPORATIVO");
  if (!allowlisted) blockers.push("FORA_DA_LISTA_DA_OBRA");
  if (control.revoked_at) blockers.push("REVOGADA");
  if (states.corporateAuthorization !== "AUTORIZADA") blockers.push("SEM_AUTORIZACAO_CORPORATIVA");
  if (states.individualConsent === "RECUSADO" || states.individualConsent === "REVOGADO") blockers.push("ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO");
  if (states.technicalPermission !== "CONFIRMADA") blockers.push("PERMISSAO_TECNICA_NAO_CONFIRMADA");
  if (control.collection_enabled !== true) blockers.push("COLETA_NAO_HABILITADA");
  const start = control.period_start ? new Date(control.period_start) : null;
  const end = control.period_end ? new Date(control.period_end) : null;
  if (!start || !end) blockers.push("PERIODO_NAO_DEFINIDO");
  else if (now < start || now > end) blockers.push("FORA_DO_PERIODO_AUTORIZADO");
  if (Number(control.consecutive_errors ?? 0) >= MAX_CONSECUTIVE_SYNC_ERRORS) blockers.push("RETENTATIVAS_ESGOTADAS");
  return { canCollect: blockers.length === 0, blockers, states };
}

/**
 * Retentativa LIMITADA entre execuções: depois de N erros seguidos a caixa para (o banco também desliga a coleta,
 * migration 20261121110000) e só volta com nova habilitação explícita do Administrador.
 */
export const MAX_CONSECUTIVE_SYNC_ERRORS = 5;

/**
 * Porta do TESTE TÉCNICO (prova da delegação, sem ler mensagens). Roda ANTES de a coleta ser habilitada, então não
 * exige permissão técnica, coleta ligada nem período — mas exige a caixa na lista da obra, a autorização corporativa
 * registrada, nenhuma revogação e nenhum aceite individual recusado/revogado.
 */
export function evaluateTechnicalCheck(control, { allowlisted = false } = {}) {
  const blockers = [];
  if (!control) return { canCheck: false, blockers: ["SEM_REGISTRO_DE_CONTROLE"] };
  if (!isCorporateMailbox(control.mailbox_address)) blockers.push("CAIXA_FORA_DO_DOMINIO_CORPORATIVO");
  if (!allowlisted) blockers.push("FORA_DA_LISTA_DA_OBRA");
  if (control.revoked_at) blockers.push("REVOGADA");
  if ((control.corporate_authorization_status ?? "NAO_REGISTRADA") !== "AUTORIZADA") blockers.push("SEM_AUTORIZACAO_CORPORATIVA");
  const consent = control.individual_consent_status ?? "NAO_REGISTRADO";
  if (consent === "RECUSADO" || consent === "REVOGADO") blockers.push("ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO");
  return { canCheck: blockers.length === 0, blockers };
}

/**
 * Aceite individual DERIVADO de email_access_authorizations (fonte do consentimento): a decisão mais recente desta
 * obra + conta. Nunca fabrica aceite: sem linha => NAO_REGISTRADO; PENDENTE => NAO_REGISTRADO.
 * @param {Array<{ account_email: string, status: string, requested_at?: string, decided_at?: string|null, id?: string }>} rows
 */
export function deriveIndividualConsent(rows, mailbox) {
  const target = normalizeMailbox(mailbox);
  const mine = (rows ?? []).filter((row) => normalizeMailbox(row.account_email) === target);
  if (mine.length === 0) return { status: "NAO_REGISTRADO", authorizationId: null };
  const latest = [...mine].sort((a, b) => String(b.decided_at ?? b.requested_at ?? "").localeCompare(String(a.decided_at ?? a.requested_at ?? "")))[0];
  const map = { AUTORIZADO: "ACEITE_REGISTRADO", RECUSADO: "RECUSADO", REVOGADO: "REVOGADO", PENDENTE: "NAO_REGISTRADO" };
  return { status: map[latest.status] ?? "NAO_REGISTRADO", authorizationId: latest.id ?? null };
}

/** O estado MAIS RESTRITIVO entre o registrado no controle e o derivado do consentimento (nunca o mais permissivo). */
export function mostRestrictiveConsent(a, b) {
  const rank = { REVOGADO: 4, RECUSADO: 3, NAO_REGISTRADO: 2, NAO_APLICAVEL: 1, ACEITE_REGISTRADO: 1 };
  const x = a ?? "NAO_REGISTRADO", y = b ?? "NAO_REGISTRADO";
  if ((rank[x] ?? 2) !== (rank[y] ?? 2)) return (rank[x] ?? 2) > (rank[y] ?? 2) ? x : y;
  return x === "ACEITE_REGISTRADO" || y === "ACEITE_REGISTRADO" ? "ACEITE_REGISTRADO" : x;
}

/**
 * Janela de leitura da caixa no modo delegação: começa no cursor PRÓPRIO da caixa (ou no início do período), com
 * sobreposição de segurança, mas a sobreposição NUNCA recua para antes do início do período autorizado; termina
 * no agora ou no fim do período, o que vier primeiro.
 */
export function resolveDelegatedReadWindow(control, { now = new Date(), overlapMs = 10 * 60 * 1000 } = {}) {
  const start = resolveMailboxWindowStart(control, null);
  if (!start) return null;
  const end = resolveMailboxWindowEnd(control, now);
  const periodStart = control?.period_start ? new Date(control.period_start) : null;
  let overlapStart = new Date(start.getTime() - overlapMs);
  if (periodStart && overlapStart < periodStart) overlapStart = periodStart;
  return { start, overlapStart, end, empty: overlapStart >= end };
}

/** Fim da janela: nunca depois do fim do período autorizado. */
export function resolveMailboxWindowEnd(control, now = new Date()) {
  const end = control?.period_end ? new Date(control.period_end) : null;
  return end && end < now ? end : now;
}

/** Início da janela de leitura desta caixa: nunca antes do início do período autorizado. */
export function resolveMailboxWindowStart(control, fallback) {
  const candidates = [control?.last_sync_at, control?.period_start, fallback].filter(Boolean).map((v) => new Date(v));
  if (candidates.length === 0) return null;
  const base = new Date(candidates[0]);
  const start = control?.period_start ? new Date(control.period_start) : null;
  return start && base < start ? start : base;
}
