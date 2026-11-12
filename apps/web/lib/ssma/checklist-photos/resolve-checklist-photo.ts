// Abertura de foto/anexo de imagem de checklist SSMA a partir do ORIGINAL no Storage do ACC.
// Puro (dependências injetadas) para poder ser testado sem rede. A rota HTTP liga as dependências ao
// cliente Supabase do PRÓPRIO usuário (RLS): sem cliente administrativo e sem acesso ao Google Drive.
//
// Regras (fail-closed):
// - sem sessão => 401;
// - ids malformados, foto invisível pela RLS, foto de outra obra, submissão de outra obra ou não enviada
//   => 404 genérico (não revela se a foto existe em outra obra);
// - objeto ausente no Storage => 404 "Arquivo indisponível";
// - sucesso => URL assinada temporária (o bucket continua privado).

export const CHECKLIST_PHOTO_SIGNED_URL_SECONDS = 120;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChecklistPhotoRow {
  id: string;
  project_id: string;
  submission_id: string;
  storage_bucket: string;
  storage_path: string;
  ssma_form_submissions:
    | { id: string; project_id: string; status: string }
    | Array<{ id: string; project_id: string; status: string }>
    | null;
}

export interface ChecklistPhotoDeps {
  getUserId(): Promise<string | null>;
  /** Leitura COM a sessão do usuário (RLS). Deve devolver null quando a linha não é visível. */
  loadPhoto(photoId: string): Promise<ChecklistPhotoRow | null>;
  signUrl(bucket: string, path: string, expiresInSeconds: number): Promise<string | null>;
}

export type ChecklistPhotoOutcome =
  | { status: 302; url: string }
  | { status: 401 | 404; message: string; reason: "SEM_SESSAO" | "NAO_ENCONTRADO" | "ARQUIVO_AUSENTE" };

export const CHECKLIST_PHOTO_MESSAGES = {
  SEM_SESSAO: "Não autenticado",
  NAO_ENCONTRADO: "Não encontrado",
  ARQUIVO_AUSENTE: "Arquivo indisponível",
} as const;

function notFound(): ChecklistPhotoOutcome {
  return { status: 404, message: CHECKLIST_PHOTO_MESSAGES.NAO_ENCONTRADO, reason: "NAO_ENCONTRADO" };
}

export async function resolveChecklistPhoto(
  deps: ChecklistPhotoDeps,
  params: { projectId: string; photoId: string }
): Promise<ChecklistPhotoOutcome> {
  const userId = await deps.getUserId();
  if (!userId) return { status: 401, message: CHECKLIST_PHOTO_MESSAGES.SEM_SESSAO, reason: "SEM_SESSAO" };
  if (!UUID.test(params.projectId) || !UUID.test(params.photoId)) return notFound();

  const photo = await deps.loadPhoto(params.photoId);
  if (!photo) return notFound();

  const projectId = params.projectId.toLowerCase();
  const submission = Array.isArray(photo.ssma_form_submissions) ? photo.ssma_form_submissions[0] : photo.ssma_form_submissions;
  if (
    !submission ||
    photo.project_id.toLowerCase() !== projectId ||
    submission.project_id.toLowerCase() !== projectId ||
    submission.id !== photo.submission_id ||
    submission.status !== "SUBMITTED"
  ) {
    return notFound();
  }
  // O caminho do objeto também precisa estar sob a pasta da obra (mesma regra da política do Storage).
  if (photo.storage_path.split("/")[0]?.toLowerCase() !== projectId) return notFound();

  const url = await deps.signUrl(photo.storage_bucket, photo.storage_path, CHECKLIST_PHOTO_SIGNED_URL_SECONDS);
  if (!url) return { status: 404, message: CHECKLIST_PHOTO_MESSAGES.ARQUIVO_AUSENTE, reason: "ARQUIVO_AUSENTE" };
  return { status: 302, url };
}

/** Rota interna que serve a foto (miniatura e ampliação usam a mesma URL assinada). */
export function checklistPhotoPath(projectId: string, photoId: string): string {
  return `/api/ssma/checklists/${projectId}/photos/${photoId}`;
}

/** Mensagem exibida na tela a partir da resposta da rota no modo de verificação (?verificar=1). */
export function checklistPhotoErrorMessage(status: number, reason?: string | null): string {
  if (status === 401 || status === 403 || reason === "SEM_SESSAO") return "Acesso negado (sessão expirada ou sem permissão)";
  if (reason === "ARQUIVO_AUSENTE") return "Foto indisponível (arquivo ausente)";
  if (status === 404) return "Acesso negado ou foto inexistente nesta obra";
  return "Não foi possível abrir a foto";
}
