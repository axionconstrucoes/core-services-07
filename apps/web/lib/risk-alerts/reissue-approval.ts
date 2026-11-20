// Aprovação administrativa de reemissão dos alertas de risco — parte PURA (sem I/O, sem "server-only").
//
// A decisão é gravada pela RPC risk_alert_reissue_approve (migration 20261121178000) no formato que o ciclo consome
// (audit_log_entries: RISK_ALERT_REISSUE_APPROVED / RISK_ALERT_CASE / <id do caso> / actor USER). Aprovar NÃO envia
// e-mail: o envio depende do ciclo, das travas do piloto e do interruptor ACC_RISK_ALERT_REISSUE_SEND_ENABLED.

export const REISSUE_JUSTIFICATION_MIN = 20;
export const REISSUE_JUSTIFICATION_MAX = 500;
export const REISSUE_MAX_CASES_PER_CALL = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReissueEligibilityReason =
  | "ELIGIBLE"
  | "CASE_NOT_FOUND"
  | "CASE_NOT_OPEN"
  | "RISK_LEVEL_NOT_ELIGIBLE"
  | "NO_SLA_ACTION"
  | "MANUALLY_SUSPENDED"
  | "ALREADY_APPROVED_AWAITING_SEND"
  | "ALREADY_REISSUED"
  | "NO_COMMUNICATION_GAP";

export const REISSUE_REASON_LABELS: Record<ReissueEligibilityReason, string> = {
  ELIGIBLE: "Elegível: há lacuna de comunicação e nenhuma decisão vigente.",
  CASE_NOT_FOUND: "Caso não encontrado nesta obra.",
  CASE_NOT_OPEN: "Caso não está aberto.",
  RISK_LEVEL_NOT_ELIGIBLE: "Só casos Crítico ou Alto podem ter reemissão aprovada.",
  NO_SLA_ACTION: "Caso sem ação SLA vinculada (nenhuma etapa alcançada).",
  MANUALLY_SUSPENDED: "Comunicação suspensa manualmente: retome o caso antes (nunca é aprovado enquanto suspenso).",
  ALREADY_APPROVED_AWAITING_SEND: "Já aprovado e aguardando o ciclo: nada novo a registrar.",
  ALREADY_REISSUED: "Decisão já utilizada em reemissão: não é aprovada de novo.",
  NO_COMMUNICATION_GAP: "Sem lacuna de comunicação: todos os destinatários exigidos já foram informados.",
};

export interface ReissuePendingRow {
  caseId: string;
  visibleCode: string | null;
  area: string;
  riskLevel: string;
  title: string;
  reference: string;
  ageDays: number;
  stage: string;
  gapRoles: string[];
  manuallySuspended: boolean;
  approvalState: string;
  lastApprovalId: string | null;
  lastApprovedAt: string | null;
  eligible: boolean;
  reason: ReissueEligibilityReason | string;
}

export interface ReissueApprovalOutcome {
  approved: Array<{ caseId: string; visibleCode: string | null; auditId: string }>;
  ignored: Array<{ caseId: string; visibleCode: string | null; reason: ReissueEligibilityReason | string }>;
  emailSent: false;
}

export function reissueReasonLabel(reason: string): string {
  return (REISSUE_REASON_LABELS as Record<string, string>)[reason] ?? reason;
}

export const REISSUE_APPROVAL_STATE_LABELS: Record<string, string> = {
  NONE: "Sem decisão",
  APPROVED_AWAITING_SEND: "Aprovado, aguardando o ciclo",
  REISSUED: "Reemitido",
  REISSUED_NEW_STAGE: "Reemitido (caso subiu de etapa)",
  REISSUE_NOT_DELIVERED: "Reemissão sem entrega (suprimida)",
};

export const REISSUE_ROLE_LABELS: Record<string, string> = { RESPONSAVEL: "Responsável", ESCALAO_1: "Nível 2 · Gestor", DIRETORIA: "Diretoria" };

export function mapReissuePendingRow(row: Record<string, unknown>): ReissuePendingRow {
  return {
    caseId: String(row.case_id),
    visibleCode: row.visible_code == null ? null : String(row.visible_code),
    area: String(row.area),
    riskLevel: String(row.risk_level),
    title: String(row.title ?? ""),
    reference: String(row.reference ?? ""),
    ageDays: Number(row.age_days ?? 0),
    stage: String(row.stage ?? "RESPONSAVEL"),
    gapRoles: Array.isArray(row.gap_roles) ? row.gap_roles.map(String) : [],
    manuallySuspended: row.manually_suspended === true,
    approvalState: String(row.approval_state ?? "NONE"),
    lastApprovalId: row.last_approval_id == null ? null : String(row.last_approval_id),
    lastApprovedAt: row.last_approved_at == null ? null : String(row.last_approved_at),
    eligible: row.eligible === true,
    reason: String(row.reason ?? ""),
  };
}

export function mapReissueApprovalOutcome(raw: unknown): ReissueApprovalOutcome {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const list = (value: unknown) => (Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []);
  return {
    approved: list(obj.approved).map((a) => ({ caseId: String(a.caseId), visibleCode: a.visibleCode == null ? null : String(a.visibleCode), auditId: String(a.auditId) })),
    ignored: list(obj.ignored).map((a) => ({ caseId: String(a.caseId), visibleCode: a.visibleCode == null ? null : String(a.visibleCode), reason: String(a.reason) })),
    emailSent: false,
  };
}

export type ReissueInputValidation = { ok: true; projectId: string; caseIds: string[]; justification: string } | { ok: false; message: string };

/** Validação do servidor (a RPC repete todas as regras: esta só dá resposta amigável antes de chamar o banco). */
export function validateReissueApprovalInput(input: { projectId: unknown; caseIds: unknown; justification: unknown; confirmed: unknown }): ReissueInputValidation {
  const projectId = String(input.projectId ?? "");
  if (!UUID.test(projectId)) return { ok: false, message: "Obra inválida." };
  const caseIds = Array.from(new Set((Array.isArray(input.caseIds) ? input.caseIds : []).map(String)));
  if (caseIds.length === 0) return { ok: false, message: "Selecione ao menos um caso." };
  if (caseIds.length > REISSUE_MAX_CASES_PER_CALL) return { ok: false, message: `Selecione no máximo ${REISSUE_MAX_CASES_PER_CALL} casos por vez.` };
  if (caseIds.some((id) => !UUID.test(id))) return { ok: false, message: "Identificador de caso inválido." };
  const justification = String(input.justification ?? "").trim();
  if (justification.length < REISSUE_JUSTIFICATION_MIN) return { ok: false, message: `A justificativa precisa ter ao menos ${REISSUE_JUSTIFICATION_MIN} caracteres.` };
  if (justification.length > REISSUE_JUSTIFICATION_MAX) return { ok: false, message: `A justificativa pode ter no máximo ${REISSUE_JUSTIFICATION_MAX} caracteres.` };
  if (input.confirmed !== "sim") return { ok: false, message: "Marque a confirmação para registrar a decisão." };
  return { ok: true, projectId, caseIds, justification };
}

const RPC_ERRORS: Record<string, string> = {
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  FORBIDDEN: "Somente administradores da obra podem aprovar reemissões.",
  CASE_IDS_REQUIRED: "Selecione ao menos um caso.",
  TOO_MANY_CASES: `Selecione no máximo ${REISSUE_MAX_CASES_PER_CALL} casos por vez.`,
  JUSTIFICATION_INVALID: `A justificativa precisa ter entre ${REISSUE_JUSTIFICATION_MIN} e ${REISSUE_JUSTIFICATION_MAX} caracteres.`,
  JUSTIFICATION_SENSITIVE: "A justificativa não pode conter e-mail, número longo (documento/telefone) nem credencial: o texto fica na trilha de auditoria.",
};

export function friendlyReissueError(message: string): string {
  const code = Object.keys(RPC_ERRORS).find((key) => message.includes(key));
  return code ? RPC_ERRORS[code] : "Não foi possível concluir a operação. Nada foi registrado.";
}
