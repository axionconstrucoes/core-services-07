// Leitor SOMENTE-LEITURA (apenas .select, sempre filtrado por project_id e
// sob a RLS da sessão) dos fatos operacionais do Dashboard executivo:
// casos de risco, registros de escalonamento, divergências caso × ação SLA,
// outbox de alertas, e-mails persistidos, coleta individual e baseline.
// Cada leitura falha de forma isolada => null ("indisponível"), nunca zero.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SlaEscalationLevel } from "@/lib/sla/types";

import type { RiskAlertCaseRow } from "./risk-alert-cases-summary";

export interface DashboardOperationalFacts {
  riskCases: RiskAlertCaseRow[] | null;
  escalations: Array<{ actionId: string; toLevel: SlaEscalationLevel; notifiedUserId: string | null }> | null;
  /** Contagem por issue_code da view risk_sla_consistency_issues (null = view indisponível). */
  consistencyIssues: Record<string, number> | null;
  outbox: { sent: number; suppressed: number; pending: number; failed: number; skipped: number } | null;
  emailReplyOrigins: number | null;
  persistedEmails: number | null;
  latestEmailAt: string | null;
  /** null quando o perfil não é Administrador (RLS esconde a tabela) ou a leitura falhou. */
  individualCollections: { enabled: number; total: number } | null;
  weeklyConfig: { read: boolean; baselineScheduleVersionId: string | null };
}

async function safe<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export async function getDashboardOperationalFacts(
  supabase: SupabaseClient,
  projectId: string,
  options: { isAdmin: boolean }
): Promise<DashboardOperationalFacts> {
  const [riskCases, escalations, consistencyIssues, outboxRows, emailCount, latestEmail, collections, weeklyConfig] = await Promise.all([
    safe(async () => {
      const { data, error } = await supabase
        .from("risk_alert_cases")
        .select("id,status,state,risk_level,title,reference,sla_action_id")
        .eq("project_id", projectId);
      return error ? null : ((data ?? []) as unknown as RiskAlertCaseRow[]);
    }),
    safe(async () => {
      const { data, error } = await supabase.from("sla_action_escalations").select("action_id,to_level,notified_user_id").eq("project_id", projectId);
      if (error) return null;
      return ((data ?? []) as Array<{ action_id: string; to_level: SlaEscalationLevel; notified_user_id: string | null }>).map((row) => ({
        actionId: row.action_id,
        toLevel: row.to_level,
        notifiedUserId: row.notified_user_id,
      }));
    }),
    safe(async () => {
      const { data, error } = await supabase.from("risk_sla_consistency_issues").select("issue_code").eq("project_id", projectId);
      if (error) return null;
      const counts: Record<string, number> = {};
      for (const row of (data ?? []) as Array<{ issue_code: string }>) counts[row.issue_code] = (counts[row.issue_code] ?? 0) + 1;
      return counts;
    }),
    safe(async () => {
      const { data, error } = await supabase.from("risk_alert_outbox").select("status,origin").eq("project_id", projectId);
      return error ? null : ((data ?? []) as Array<{ status: string; origin: string | null }>);
    }),
    safe(async () => {
      const { count, error } = await supabase.from("emails").select("id", { count: "exact", head: true }).eq("project_id", projectId);
      return error ? null : (count ?? 0);
    }),
    safe(async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("sent_at")
        .eq("project_id", projectId)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return error ? null : { sentAt: ((data as { sent_at: string | null } | null)?.sent_at ?? null) as string | null };
    }),
    options.isAdmin
      ? safe(async () => {
          const { data, error } = await supabase.from("email_mailbox_collection_controls").select("collection_enabled,revoked_at").eq("project_id", projectId);
          if (error) return null;
          const rows = (data ?? []) as Array<{ collection_enabled: boolean; revoked_at: string | null }>;
          return { enabled: rows.filter((row) => row.collection_enabled && !row.revoked_at).length, total: rows.length };
        })
      : Promise.resolve(null),
    safe(async () => {
      // Baseline oficial ATIVA = project_schedule_baselines sem superseded_at (definida por set_project_schedule_baseline;
      // mesma leitura de getActiveBaselineScheduleVersionId em lib/schedule/weekly-ingestion/supabase-store.ts).
      const { data, error } = await supabase
        .from("project_schedule_baselines")
        .select("schedule_version_id")
        .eq("project_id", projectId)
        .is("superseded_at", null)
        .limit(1)
        .maybeSingle();
      if (error) return { read: false, baselineScheduleVersionId: null };
      return { read: true, baselineScheduleVersionId: ((data as { schedule_version_id: string | null } | null)?.schedule_version_id ?? null) };
    }),
  ]);

  let outbox: DashboardOperationalFacts["outbox"] = null;
  let emailReplyOrigins: number | null = null;
  if (outboxRows) {
    outbox = { sent: 0, suppressed: 0, pending: 0, failed: 0, skipped: 0 };
    emailReplyOrigins = 0;
    for (const row of outboxRows) {
      if (row.status === "SENT") outbox.sent += 1;
      else if (row.status === "SUPPRESSED") outbox.suppressed += 1;
      else if (row.status === "PENDING") outbox.pending += 1;
      else if (row.status === "FAILED") outbox.failed += 1;
      else if (row.status === "SKIPPED") outbox.skipped += 1;
      if (row.origin === "EMAIL_REPLY") emailReplyOrigins += 1;
    }
  }

  return {
    riskCases,
    escalations,
    consistencyIssues,
    outbox,
    emailReplyOrigins,
    persistedEmails: emailCount,
    latestEmailAt: latestEmail?.sentAt ?? null,
    individualCollections: collections,
    weeklyConfig: weeklyConfig ?? { read: false, baselineScheduleVersionId: null },
  };
}
