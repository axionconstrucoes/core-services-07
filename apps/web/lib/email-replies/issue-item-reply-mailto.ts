// Emissão do token POR ITEM + atalhos mailto (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA) dos e-mails de ação SLA,
// resumo semanal e alerta de contrato. Sem "server-only": usado pelos emissores (service_role) e por testes.
//
// - Só tipos com processamento efetivo por e-mail (EMAIL_REPLY_PROCESSABLE_KINDS) recebem atalhos.
// - O hash do token é GRAVADO antes do envio (issueEmailReplyToken); falha de gravação, caixa ausente/inválida ou tipo
//   sem processamento => null: o e-mail sai só com os botões do ACC (nunca um atalho que não seria processado).
// - Nunca bloqueia o envio do alerta.

import { normalizeAlertReplyMailbox } from "@/lib/email/alert-reply-address";

import { buildReplyMailtoLinks, type ReplyMailtoLinks } from "./reply-mailto";
import { isProcessableReplyKind, issueEmailReplyToken, type EmailReplySubjectKind, type EmailReplyTokenStore } from "./reply-tokens";

export type ItemReplySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export const ITEM_REPLY_CODE_PREFIX: Partial<Record<EmailReplySubjectKind, string>> = {
  SLA_ACTION: "ACC-SLA",
  WEEKLY_DIGEST_ITEM: "ACC-RESUMO",
  CONTRACT_ALERT_ITEM: "ACC-CONTRATO",
};

export function itemReplyVisibleCode(kind: EmailReplySubjectKind, id: string): string {
  const prefix = ITEM_REPLY_CODE_PREFIX[kind] ?? "ACC";
  return `${prefix}:${id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase()}`;
}

export const SEVERITY_FROM_ALERT: Record<string, ItemReplySeverity> = { CRITICA: "CRITICAL", ALTA: "HIGH", MEDIA: "MEDIUM", BAIXA: "LOW" };

export async function issueItemReplyMailto(input: {
  store: EmailReplyTokenStore | null | undefined;
  mailbox: string | null | undefined;
  projectId: string;
  kind: EmailReplySubjectKind;
  subjectId: string;
  recipientUserId: string | null;
  severity: ItemReplySeverity;
  nowIso: string;
  /** RESOLVIDO exige anexo (ação SLA ALTO/CRÍTICO) — só muda o texto-guia do corpo. */
  evidenceRequired?: boolean;
}): Promise<ReplyMailtoLinks | null> {
  // Caixa validada ANTES de gravar o token: sem endereço válido não existe atalho (nem token órfão).
  const mailbox = normalizeAlertReplyMailbox(input.mailbox);
  if (!input.store || !mailbox || !isProcessableReplyKind(input.kind)) return null;
  try {
    const issued = await issueEmailReplyToken(input.store, { projectId: input.projectId, subjectKind: input.kind, subjectId: input.subjectId, recipientUserId: input.recipientUserId, nowIso: input.nowIso });
    const tracked = input.severity === "CRITICAL" || input.severity === "HIGH";
    return buildReplyMailtoLinks({
      mailbox,
      token: issued.token,
      visibleCode: itemReplyVisibleCode(input.kind, input.subjectId),
      evidenceAttachment: input.evidenceRequired ? "REQUIRED_FILE" : "OPTIONAL",
      forecastNeedsTime: tracked,
    });
  } catch {
    return null;
  }
}

/**
 * Ação SLA: atalhos só para quem PODE agir pela regra do banco (responsável atual não LEITURA, ou Administrador da obra),
 * ação aberta e sem canal próprio (origem SSMA / vinculada a alerta de risco). Destinatário de escalonamento que não
 * pode agir recebe o e-mail sem atalhos (os botões do ACC continuam com o motivo).
 */
export function slaReplyEligible(input: {
  action: { status: string; responsible_user_id: string | null; related_ssma_corrective_action_id: string | null };
  riskCaseLinked: boolean;
  recipientUserId: string | null;
  recipientPermission: string | null;
}): boolean {
  if (!input.recipientUserId || !input.recipientPermission) return false;
  if (input.action.status === "COMPLETED" || input.action.status === "CANCELLED") return false;
  if (input.action.related_ssma_corrective_action_id || input.riskCaseLinked) return false;
  const permission = input.recipientPermission.toUpperCase();
  if (permission === "LEITURA" || permission === "VIEWER") return false;
  if (permission === "ADMINISTRADOR" || permission === "ADMIN") return true;
  return input.action.responsible_user_id === input.recipientUserId;
}
