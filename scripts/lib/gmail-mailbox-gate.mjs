// Porta de coleta por CAIXA do Gmail (modo delegação em todo o domínio). Puro: sem rede, sem banco, sem segredos.
//
// A delegação do Google NÃO limita o acesso a uma obra nem a uma caixa: quem limita é o ACC. Uma caixa só é lida
// quando TODAS as condições abaixo valem, e cada estado é mostrado separadamente (nunca fundidos, nunca presumidos):
//   1. lista explícita da obra (project_email_ingestion_mailboxes, enabled);
//   2. autorização corporativa REGISTRADA para a caixa (AUTORIZADA, não revogada);
//   3. permissão técnica CONFIRMADA (o teste real de delegação funcionou);
//   4. coleta explicitamente habilitada (collection_enabled) — nunca ligada em massa;
//   5. dentro do período autorizado da obra (period_start/period_end, quando definido).
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
  if ((start && now < start) || (end && now > end)) blockers.push("FORA_DO_PERIODO_AUTORIZADO");
  return { canCollect: blockers.length === 0, blockers, states };
}

/** Início da janela de leitura desta caixa: nunca antes do início do período autorizado. */
export function resolveMailboxWindowStart(control, fallback) {
  const candidates = [control?.last_sync_at, control?.period_start, fallback].filter(Boolean).map((v) => new Date(v));
  if (candidates.length === 0) return null;
  const base = new Date(candidates[0]);
  const start = control?.period_start ? new Date(control.period_start) : null;
  return start && base < start ? start : base;
}
