import "server-only";

import type { createSupabaseAdminClient } from "@axion/db/admin";

import { INFORMATIVE_LEASE_MS, INFORMATIVE_MAX_ATTEMPTS, type InformativeDeliveryRow, type InformativeDeliveryStore } from "./informative-delivery";
import type { PersistedFailureClass } from "./outbound-delivery";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

/**
 * Tabelas de entrega das rotinas especiais (todas com status PENDING/SENT/FAILED, attempt_count, claimed_at,
 * failure_class e delivery_state — migration 20261121130000_outbound_delivery_states). A chave única é
 * (eventColumn, recipient_email).
 */
export type InformativeDeliveryTable =
  | { table: "ssma_accident_notification_deliveries"; eventColumn: "submission_id"; extra: { project_id: string } }
  | { table: "construmanager_version_review_deliveries"; eventColumn: "review_id"; extra: { project_id: string } }
  | { table: "acc_system_health_alert_deliveries"; eventColumn: "incident_id"; extra: { project_id: string } };

const COLUMNS = "id,status,attempt_count,failure_class";

function mapRow(row: Record<string, unknown>): InformativeDeliveryRow {
  return {
    id: String(row.id),
    status: row.status as InformativeDeliveryRow["status"],
    attemptCount: Number(row.attempt_count ?? 0),
    failureClass: (row.failure_class as PersistedFailureClass | null) ?? null,
  };
}

export function createInformativeDeliveryStore(admin: Admin, target: InformativeDeliveryTable, eventId: string): InformativeDeliveryStore {
  const { table, eventColumn } = target;
  return {
    async ensure(recipient) {
      const email = recipient.email.trim().toLowerCase();
      const base: Record<string, unknown> = { ...target.extra, [eventColumn]: eventId, recipient_email: email, status: "PENDING" };
      if (table === "ssma_accident_notification_deliveries") base.recipient_name = recipient.name;
      const { error: upsertError } = await admin.from(table).upsert(base, { onConflict: `${eventColumn},recipient_email`, ignoreDuplicates: true });
      if (upsertError) throw new Error("Falha ao registrar a entrega na outbox.");
      const { data, error } = await admin.from(table).select(COLUMNS).eq(eventColumn, eventId).eq("recipient_email", email).single();
      if (error || !data) throw new Error("Falha ao reler a entrega na outbox.");
      return mapRow(data as Record<string, unknown>);
    },
    async claim(id, nowIso) {
      const { data: row } = await admin.from(table).select(COLUMNS).eq("id", id).maybeSingle();
      if (!row) return false;
      const current = mapRow(row as Record<string, unknown>);
      if (current.status === "SENT" || current.attemptCount >= INFORMATIVE_MAX_ATTEMPTS) return false;
      if (current.failureClass && current.failureClass !== "RETRYABLE") return false;
      const stale = new Date(Date.parse(nowIso) - INFORMATIVE_LEASE_MS).toISOString();
      const { data, error } = await admin
        .from(table)
        .update({ attempt_count: current.attemptCount + 1, claimed_at: nowIso })
        .eq("id", id)
        .eq("attempt_count", current.attemptCount)
        .in("status", ["PENDING", "FAILED"])
        .or(`claimed_at.is.null,claimed_at.lt.${stale}`)
        .select("id");
      if (error) return false;
      return (data ?? []).length === 1;
    },
    async markAccepted(id, accepted) {
      // delivery_state ACCEPTED_BY_PROVIDER: o aceite do provedor NÃO é entrega comprovada.
      const { error } = await admin
        .from(table)
        .update({ status: "SENT", sent_at: accepted.sentAt, provider_message_id: accepted.providerMessageId, provider: accepted.provider, delivery_state: "ACCEPTED_BY_PROVIDER", last_error: null, failure_class: null, claimed_at: null })
        .eq("id", id);
      if (error) throw new Error("Falha ao gravar o aceite do provedor.");
    },
    async markFailed(id, input) {
      // Nunca regride uma linha já aceita (o banco também recusa: trigger acc_outbound_delivery_guard).
      const { error } = await admin
        .from(table)
        .update({ status: "FAILED", last_error: input.error.slice(0, 500), failure_class: input.failureClass, claimed_at: null })
        .eq("id", id)
        .neq("status", "SENT");
      if (error) throw new Error("Falha ao registrar a falha de envio.");
    },
  };
}
