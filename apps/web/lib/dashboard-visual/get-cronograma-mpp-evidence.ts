// Leitor SOMENTE-LEITURA (select por project_id) da evidência do
// cronograma OFICIAL MPP para o Dashboard. Sem insert/update/delete/rpc.
// Falha => null (o chamador mantém o status armazenado).

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMppDocumentVersion, type CronogramaMppEvidence } from "@/lib/ui/resolve-cronograma-display-status";

type VersionRow = {
  id: string;
  extraction_status: string;
  document_versions: { mime_type: string | null; file_path: string | null; documents: { project_id: string } | null } | null;
};

export async function getCronogramaMppEvidence(supabase: SupabaseClient, projectId: string): Promise<CronogramaMppEvidence | null> {
  try {
    const { data: versions, error } = await supabase
      .from("schedule_versions")
      .select("id, extraction_status, document_versions!inner(mime_type, file_path, documents!inner(project_id))")
      .eq("extraction_status", "EXTRACTED")
      .eq("document_versions.documents.project_id", projectId);
    if (error) return null;

    const mppIds = new Set(
      ((versions ?? []) as unknown as VersionRow[])
        .filter((v) => isMppDocumentVersion(v.document_versions?.mime_type ?? null, v.document_versions?.file_path ?? null))
        .map((v) => v.id)
    );

    const { data: baselines, error: baselineError } = await supabase
      .from("project_schedule_baselines")
      .select("schedule_version_id")
      .eq("project_id", projectId)
      .is("superseded_at", null);
    if (baselineError) return null;

    const hasActiveMppBaseline = (baselines ?? []).some((b: { schedule_version_id: string }) => mppIds.has(b.schedule_version_id));

    const { count: weeklyCount } = await supabase
      .from("weekly_report_workbooks")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);

    return { mppExtractedVersionCount: mppIds.size, hasActiveMppBaseline, weeklyReportWorkbookCount: weeklyCount ?? 0 };
  } catch {
    return null;
  }
}
