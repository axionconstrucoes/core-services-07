import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";

import { getWhatsappConfig } from "./config";
import { notifyDirectorateWhatsapp, type DirectorateWhatsappInput, type DirectorateWhatsappOutcome } from "./notify-directorate";
import { SimulatedWhatsappProvider } from "./simulated-provider";

/**
 * Ponto de entrada do servidor. Canal desligado (padrão) => retorna sem criar cliente nem consultar nada.
 * Nunca lança: uma falha aqui não pode desfazer nem atrasar o escalonamento já aplicado e o e-mail.
 */
export async function notifyDirectorateWhatsappSafely(input: DirectorateWhatsappInput): Promise<DirectorateWhatsappOutcome | { outcome: "ERROR" }> {
  if (!getWhatsappConfig().enabled) return { outcome: "IGNORED", reason: "DISABLED" };
  try {
    const admin = createSupabaseAdminClient();
    return await notifyDirectorateWhatsapp(input, {
      provider: new SimulatedWhatsappProvider(),
      // Resolvido no momento do envio no banco: contato da pessoa + vínculo ativo + papel de Diretoria (service_role).
      loadContact: async (projectId, userId) => {
        const { data, error } = await admin.rpc("whatsapp_dispatch_target", { p_project_id: projectId, p_user_id: userId });
        if (error) throw error;
        const row = (data as Array<{ phone_e164: string | null; channel_authorized: boolean; active_member: boolean; diretoria_member: boolean }> | null)?.[0];
        if (!row) return null;
        return { phoneE164: row.phone_e164, channelAuthorized: row.channel_authorized, activeMember: row.active_member, diretoriaMember: row.diretoria_member };
      },
      record: async (row) => {
        const { data, error } = await admin
          .from("whatsapp_simulated_messages")
          .upsert(
            {
              project_id: row.projectId,
              recipient_user_id: row.recipientUserId,
              source_type: row.sourceType,
              source_id: row.sourceId,
              escalation_level: "DIRETORIA",
              risk_level: "CRITICAL",
              phone_masked: row.phoneMasked,
              status: row.status,
              skip_reason: row.skipReason,
              message_preview: row.messagePreview,
              idempotency_key: row.idempotencyKey,
            },
            { onConflict: "idempotency_key", ignoreDuplicates: true }
          )
          .select("id");
        if (error) throw error;
        return { inserted: (data ?? []).length > 0 };
      },
      audit: async (projectId, action, entityId, detail) => {
        // Ator SYSTEM: o CHECK de audit_log_entries exige actor_user_id e actor_label nulos.
        const { error } = await admin.from("audit_log_entries").insert({
          project_id: projectId,
          actor_type: "SYSTEM",
          actor_user_id: null,
          action,
          entity_type: "WHATSAPP_ESCALATION",
          entity_id: entityId,
          detail,
        });
        if (error) throw error;
      },
    });
  } catch {
    return { outcome: "ERROR" };
  }
}
