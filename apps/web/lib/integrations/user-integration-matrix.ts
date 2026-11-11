// Modelo somente de leitura. Cadastro, aceite e credencial são fatos diferentes.
import type { EmailAccount, ProjectEmailIngestionConfig } from "../email/inbound/ingestion-controls/types";

export type MatrixTone = "ok" | "warning" | "error" | "neutral";
export type MatrixFact = { label: string; tone: MatrixTone };
export type MatrixMember = { userId: string; status: string; area: string | null; user: { name: string; email: string } };
export type MatrixAuthorization = { user_id: string; account_email: string; status: string; requested_at: string };
export type MatrixControl = {
  mailbox_address: string; corporate_authorization_status: string; individual_consent_status: string;
  technical_permission_status: string; collection_enabled: boolean; period_start: string | null;
  period_end: string | null; revoked_at: string | null; last_sync_at: string | null; last_sync_status: string | null;
};
export type MatrixImport = { mailbox: string; count: number; lastMessageAt: string | null };
export type MatrixEvidence = { authorizations: MatrixAuthorization[] | null; controls: MatrixControl[] | null; imports: MatrixImport[] | null; warnings: string[] };
export type UserIntegrationRow = {
  userId: string; name: string; email: string; membership: string; area: string | null;
  registration: MatrixFact; consent: MatrixFact; technical: MatrixFact; collection: MatrixFact;
  imported: number | null; lastMessageAt: string | null; lastSyncAt: string | null;
};
const normalize = (value: string) => value.trim().toLowerCase();
const fact = (label: string, tone: MatrixTone = "neutral"): MatrixFact => ({ label, tone });

export function buildUserIntegrationRows(members: MatrixMember[], accounts: EmailAccount[], config: ProjectEmailIngestionConfig | null, evidence: MatrixEvidence, now = new Date()): UserIntegrationRow[] {
  const unique = new Map(members.map((member) => [member.userId, member]));
  return [...unique.values()].map((member) => {
    const email = normalize(member.user.email);
    const account = accounts.find((item) => normalize(item.emailAddress) === email);
    const control = evidence.controls?.find((item) => normalize(item.mailbox_address) === email);
    const authorization = evidence.authorizations?.filter((item) => item.user_id === member.userId && normalize(item.account_email) === email)
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
    const imports = evidence.imports?.find((item) => normalize(item.mailbox) === email);
    const enabledMailboxes = config?.mailboxes.filter((item) => item.enabled) ?? [];
    const mailboxEnabled = enabledMailboxes.some((item) => normalize(item.mailboxAddress) === email);
    let registration = fact("Sem cadastro", "warning");
    if (account) {
      const labels: Record<string, MatrixFact> = {
        CONNECTED: fact("Conta registrada"), SYNCING: fact("Sincronizando", "ok"),
        AUTH_EXPIRED: fact("Autenticação expirada", "error"), ERROR: fact("Erro na conta", "error"),
        NOT_CONNECTED: fact("Conta desconectada", "warning"),
      };
      registration = labels[account.status] ?? fact("Cadastro a verificar", "warning");
    }
    const consentLabels: Record<string, MatrixFact> = {
      AUTORIZADO: fact("Autorizado", "ok"), PENDENTE: fact("Aguardando aceite", "warning"),
      RECUSADO: fact("Recusado", "error"), REVOGADO: fact("Revogado", "error"),
    };
    const consent = evidence.authorizations === null ? fact("Consulta indisponível", "warning") : authorization ? consentLabels[authorization.status] ?? fact("A verificar", "warning") : fact("Não solicitado", "warning");
    const technical = control?.technical_permission_status === "CONFIRMADA" ? fact("Confirmada", "ok")
      : control?.technical_permission_status === "FALHA" ? fact("Falha técnica", "error") : fact("Não comprovada", "warning");
    let collection = fact("Sem confirmação individual", "warning");
    const refused = authorization?.status === "RECUSADO" || authorization?.status === "REVOGADO" || control?.individual_consent_status === "RECUSADO" || control?.individual_consent_status === "REVOGADO";
    if (member.status !== "ACTIVE") collection = fact("Usuário inativo", "warning");
    else if (refused || control?.revoked_at || control?.corporate_authorization_status === "REVOGADA") collection = fact("Bloqueada por revogação/recusa", "error");
    else if (!config?.enabled) collection = fact("Desligada na obra", "warning");
    else if (!mailboxEnabled) collection = fact("Caixa fora da coleta", "warning");
    else if (control) {
      const start = Date.parse(control.period_start ?? ""), end = Date.parse(control.period_end ?? "");
      if (!control.collection_enabled) collection = fact("Coleta individual desligada", "warning");
      else if (control.corporate_authorization_status !== "AUTORIZADA" || control.technical_permission_status !== "CONFIRMADA") collection = fact("Pré-condições pendentes", "warning");
      else if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) collection = fact("Período não confirmado", "warning");
      else if (now.getTime() < start || now.getTime() > end) collection = fact("Fora do período", "warning");
      else if (control.last_sync_status === "ERRO") collection = fact("Última coleta com erro", "error");
      else if (control.last_sync_status === "BLOQUEADA") collection = fact("Última coleta bloqueada", "error");
      else collection = fact("Habilitada no período", "ok");
    }
    return {
      userId: member.userId, name: member.user.name, email, membership: member.status, area: member.area,
      registration, consent, technical, collection,
      imported: evidence.imports === null ? null : imports?.count ?? 0,
      lastMessageAt: imports?.lastMessageAt ?? null,
      // O cursor geral só é atribuível à pessoa quando há uma única caixa habilitada.
      lastSyncAt: control?.last_sync_at ?? (enabledMailboxes.length === 1 && mailboxEnabled ? config?.lastSyncAt ?? null : null),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
