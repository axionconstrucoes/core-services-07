// Apenas SELECT pelo cliente de sessão. Nunca lê tokens OAuth ou conteúdo dos e-mails.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatrixAuthorization, MatrixControl, MatrixEvidence, MatrixImport } from "./user-integration-matrix";

export async function getUserIntegrationEvidence(supabase: SupabaseClient, projectId: string): Promise<MatrixEvidence> {
  const warnings: string[] = [];
  const [auth, controls] = await Promise.all([
    supabase.from("email_access_authorizations").select("user_id,account_email,status,requested_at").eq("project_id", projectId).order("requested_at", { ascending: false }),
    supabase.from("email_mailbox_collection_controls").select("mailbox_address,corporate_authorization_status,individual_consent_status,technical_permission_status,collection_enabled,period_start,period_end,revoked_at,last_sync_at,last_sync_status").eq("project_id", projectId),
  ]);
  if (auth.error) warnings.push("Não foi possível conferir os aceites individuais.");
  if (controls.error) warnings.push("A confirmação técnica e o controle individual de coleta ainda não estão disponíveis nesta consulta. Importações já realizadas continuam indicadas como evidência histórica.");
  const imports = new Map<string, MatrixImport>();
  let importsAvailable = true;
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("emails").select("mailbox_address,sent_at")
      .eq("project_id", projectId).eq("provider", "GMAIL").not("mailbox_address", "is", null)
      .order("id").range(offset, offset + 999);
    if (error) { warnings.push("Não foi possível conferir as mensagens importadas por caixa."); importsAvailable = false; break; }
    for (const row of data ?? []) {
      const mailbox = String(row.mailbox_address).trim().toLowerCase();
      const previous = imports.get(mailbox) ?? { mailbox, count: 0, lastMessageAt: null };
      previous.count++;
      if (row.sent_at && (!previous.lastMessageAt || Date.parse(row.sent_at) > Date.parse(previous.lastMessageAt))) previous.lastMessageAt = row.sent_at;
      imports.set(mailbox, previous);
    }
    if (!data || data.length < 1000) break;
  }
  return {
    authorizations: auth.error ? null : auth.data as MatrixAuthorization[],
    controls: controls.error ? null : controls.data as MatrixControl[],
    imports: importsAvailable ? [...imports.values()] : null,
    warnings,
  };
}
