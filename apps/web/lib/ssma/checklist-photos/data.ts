import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";
import {
  CHECKLIST_SUBMISSIONS_LIMIT,
  mapChecklistSubmission,
  type ChecklistSubmissionRow,
  type ChecklistSubmissionView,
} from "./checklist-submissions-view";

/** Últimos checklists ENVIADOS da obra, lidos com a sessão do usuário (RLS); nunca usa cliente administrativo. */
export async function getRecentChecklistSubmissions(
  projectId: string,
  names: Map<string, string>
): Promise<{ available: boolean; submissions: ChecklistSubmissionView[] }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ssma_form_submissions")
    .select("id, project_id, checklist_slug, checklist_number, checklist_title, occurred_at, technician_user_id, ssma_submission_photos(id, action_label, original_file_name, mime_type)")
    .eq("project_id", projectId)
    .eq("status", "SUBMITTED")
    .order("occurred_at", { ascending: false })
    .limit(CHECKLIST_SUBMISSIONS_LIMIT);
  if (error) return { available: false, submissions: [] };
  return {
    available: true,
    submissions: ((data ?? []) as unknown as ChecklistSubmissionRow[]).map((row) => mapChecklistSubmission(row, names, projectId)),
  };
}
