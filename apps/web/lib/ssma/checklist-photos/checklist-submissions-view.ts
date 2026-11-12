// Mapeamento puro dos checklists SSMA enviados (linha do banco -> item de tela). Sem I/O.
import { SSMA_CHECKLISTS, checklistTitle } from "../checklist-definitions";
import { checklistPhotoPath } from "./resolve-checklist-photo";

export const CHECKLIST_SUBMISSIONS_LIMIT = 50;

export interface ChecklistSubmissionRow {
  id: string;
  project_id: string;
  checklist_slug: string;
  checklist_number: number | null;
  checklist_title: string | null;
  occurred_at: string;
  technician_user_id: string | null;
  ssma_submission_photos: Array<{ id: string; action_label: string | null; original_file_name: string | null; mime_type: string | null }> | null;
}

export interface ChecklistPhotoView {
  id: string;
  url: string;
  alt: string;
  label: string;
}

export interface ChecklistSubmissionView {
  id: string;
  title: string;
  number: number | null;
  occurredAt: string;
  technicianName: string | null;
  photos: ChecklistPhotoView[];
}

const IMAGE = /^image\//i;

export function mapChecklistSubmission(row: ChecklistSubmissionRow, names: Map<string, string>, projectId: string): ChecklistSubmissionView {
  const definition = SSMA_CHECKLISTS.find((item) => item.slug === row.checklist_slug);
  const title = definition ? checklistTitle(definition) : row.checklist_title ?? row.checklist_slug;
  const number = definition?.number ?? row.checklist_number ?? null;
  const date = new Date(row.occurred_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const photos = (row.ssma_submission_photos ?? [])
    .filter((photo) => !photo.mime_type || IMAGE.test(photo.mime_type))
    .map((photo, index) => {
      const label = photo.action_label?.trim() || `Foto ${index + 1}`;
      return { id: photo.id, url: checklistPhotoPath(projectId, photo.id), label, alt: `${label} — ${title}, ${date}` };
    });
  return {
    id: row.id,
    title,
    number,
    occurredAt: row.occurred_at,
    technicianName: row.technician_user_id ? names.get(row.technician_user_id) ?? null : null,
    photos,
  };
}
