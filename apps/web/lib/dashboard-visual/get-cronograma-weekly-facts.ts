// Leitor SOMENTE-LEITURA (apenas .select, sempre filtrado por project_id)
// dos fatos da regra semanal do cronograma para o Dashboard.
// Sem insert/update/delete/upsert/rpc. Qualquer falha => null (o chamador
// mantem o status armazenado — fail-safe).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMppDocumentVersion, type WeeklyCronogramaFacts } from "@/lib/schedule/weekly-ingestion/resolve-weekly-cronograma-status";

/** Janela de leitura (dias) — cobre a semana esperada com folga; o resolvedor filtra pela semana exata. */
const LOOKBACK_DAYS = 35;

type ConfigRow = { enabled: boolean; deadline_weekday: number; deadline_time: string; timezone: string };
type IntakeRow = {
  id: string;
  week_start: string;
  status: string;
  document_version_id: string | null;
  duplicate_of_document_version_id: string | null;
  selected_sha256_hash: string | null;
};
type WorkbookRow = { id: string; file_sha256: string | null; emails: { sent_at: string | null } | null };
type VersionRow = {
  document_version_id: string;
  extraction_status: string;
  document_versions: { mime_type: string | null; file_path: string | null; original_file_name: string | null } | null;
};

export async function getCronogramaWeeklyFacts(
  supabase: SupabaseClient,
  projectId: string,
  now: Date = new Date()
): Promise<WeeklyCronogramaFacts | null> {
  try {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000);

    const { data: config, error: configError } = await supabase
      .from("project_weekly_schedule_ingestion_configs")
      .select("enabled, deadline_weekday, deadline_time, timezone")
      .eq("project_id", projectId)
      .maybeSingle();
    if (configError) return null;

    const { data: intakeRows, error: intakeError } = await supabase
      .from("weekly_schedule_email_intakes")
      .select("id, week_start, status, document_version_id, duplicate_of_document_version_id, selected_sha256_hash")
      .eq("project_id", projectId)
      .gte("week_start", since.toISOString().slice(0, 10));
    if (intakeError) return null;
    const intakes = (intakeRows ?? []) as unknown as IntakeRow[];

    const { data: workbookRows, error: workbookError } = await supabase
      .from("weekly_report_workbooks")
      .select("id, file_sha256, emails(sent_at)")
      .eq("project_id", projectId)
      .gte("created_at", since.toISOString());
    if (workbookError) return null;

    const documentVersionIds = [
      ...new Set(
        intakes
          .flatMap((row) => [row.document_version_id, row.duplicate_of_document_version_id])
          .filter((id): id is string => Boolean(id))
      ),
    ];
    let versions: VersionRow[] = [];
    if (documentVersionIds.length > 0) {
      const { data: versionRows, error: versionError } = await supabase
        .from("schedule_versions")
        .select("document_version_id, extraction_status, document_versions!inner(mime_type, file_path, original_file_name, project_id)")
        .in("document_version_id", documentVersionIds)
        .eq("document_versions.project_id", projectId);
      if (versionError) return null;
      versions = (versionRows ?? []) as unknown as VersionRow[];
    }

    const cfg = config as ConfigRow | null;
    return {
      config: cfg
        ? {
            enabled: Boolean(cfg.enabled),
            deadlineWeekday: Number(cfg.deadline_weekday),
            deadlineTime: String(cfg.deadline_time),
            timezone: String(cfg.timezone),
          }
        : null,
      intakes: intakes.map((row) => ({
        id: row.id,
        weekStart: row.week_start,
        status: row.status,
        mppDocumentVersionId: row.document_version_id ?? row.duplicate_of_document_version_id,
        sha256: row.selected_sha256_hash,
      })),
      workbooks: ((workbookRows ?? []) as unknown as WorkbookRow[]).map((row) => ({
        id: row.id,
        emailSentAt: row.emails?.sent_at ?? null,
        sha256: row.file_sha256,
      })),
      scheduleVersions: versions.map((row) => ({
        documentVersionId: row.document_version_id,
        extractionStatus: row.extraction_status,
        isMpp: isMppDocumentVersion(
          row.document_versions?.mime_type ?? null,
          row.document_versions?.original_file_name ?? row.document_versions?.file_path ?? null
        ),
      })),
    };
  } catch {
    return null;
  }
}
