import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";
import { decideRecipient, type RecipientDecision, type RecipientDomainEntry } from "./recipient-validation";

// Aplicação SERVER-SIDE do controle de destinatário externo. Fluxo: validar/normalizar -> classificar domínio (lista do banco) ->
// se EXTERNO, exigir confirmação explícita + motivo e GRAVAR a trilha append-only (RPC acc_external_recipient_confirm, só gestão)
// ANTES de qualquer solicitação. Fail-closed: qualquer falha ao ler a lista ou gravar a trilha bloqueia. Nada aqui envia e-mail.

export type ExternalRecipientContext = "SEGUROS_CANAL" | "SEGUROS_MINUTA" | "GARANTIAS" | "QUALIDADE" | "SOLICITACAO_ACAO" | "OUTRO";

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function loadDomains(supabase: Supabase): Promise<RecipientDomainEntry[] | null> {
  const { data, error } = await supabase.from("acc_recipient_domains").select("domain,kind,active");
  if (error || !data) return null;
  return data as RecipientDomainEntry[];
}

const CONFIRM_ERRORS: Record<string, string> = {
  FORBIDDEN: "Somente gestão (GESTOR, GERENTE ou ADMINISTRADOR) do projeto pode confirmar destinatário externo.",
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  INVALID_RECIPIENT_EMAIL: "O e-mail do destinatário não é válido.",
  REASON_REQUIRED: "Informe o motivo do envio a destinatário externo (mínimo de 10 caracteres).",
  CONFIRMATION_NOT_REQUIRED: "Este destinatário não é externo.",
};

export type PreparedRecipient =
  | { ok: true; email: string; domain: string; status: "INTERNO" | "PERMITIDO" | "EXTERNO"; confirmationId: string | null }
  | { ok: false; code: string; message: string };

/** Valida o destinatário e, quando externo, registra a confirmação. Só retorna ok depois da trilha gravada. */
export async function prepareRecipient(input: {
  projectId: string;
  context: ExternalRecipientContext;
  entityType?: string | null;
  entityId?: string | null;
  email: unknown;
  confirmed: boolean;
  reason: string;
  sourceRef?: string | null;
}): Promise<PreparedRecipient> {
  const supabase = await createSupabaseServerClient();
  const domains = await loadDomains(supabase);
  if (!domains) return { ok: false, code: "DOMAINS_UNAVAILABLE", message: "Não foi possível conferir a lista de domínios permitidos. Nada foi solicitado." };
  const decision: RecipientDecision = decideRecipient(input.email, domains, { confirmed: input.confirmed, reason: input.reason });
  if (!decision.ok) return { ok: false, code: decision.code, message: decision.message };
  if (!decision.needsConfirmation) return { ok: true, email: decision.email, domain: decision.domain, status: decision.status, confirmationId: null };

  const { data, error } = await supabase.rpc("acc_external_recipient_confirm", {
    p_project_id: input.projectId,
    p_context: input.context,
    p_entity_type: input.entityType ?? null,
    p_entity_id: input.entityId ?? null,
    p_email: decision.email,
    p_reason: decision.reason,
    p_source_ref: input.sourceRef ?? null,
  });
  if (error) {
    const code = Object.keys(CONFIRM_ERRORS).find((k) => (error.message ?? "").includes(k)) ?? "CONFIRM_FAILED";
    return { ok: false, code, message: CONFIRM_ERRORS[code] ?? "Não foi possível registrar a confirmação do destinatário externo. Nada foi solicitado." };
  }
  const id = (data as { id?: string } | null)?.id;
  if (typeof id !== "string") return { ok: false, code: "CONFIRM_FAILED", message: "Confirmação do destinatário externo não registrada. Nada foi solicitado." };
  return { ok: true, email: decision.email, domain: decision.domain, status: "EXTERNO", confirmationId: id };
}
