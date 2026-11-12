import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@axion/db/server";
import { resolveChecklistPhoto, type ChecklistPhotoRow } from "@/lib/ssma/checklist-photos/resolve-checklist-photo";

// Abre a foto/anexo de imagem de um checklist SSMA a partir do ORIGINAL no Storage do ACC, por URL
// assinada de curta duração. Autorização = sessão e RLS do próprio usuário (membro ativo da obra);
// confere foto × formulário × obra antes de assinar. Somente leitura; não toca no Google Drive.
// `?verificar=1` devolve JSON com o status (sem redirecionar) para a tela mostrar a mensagem certa.
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; photoId: string }> }) {
  const { projectId, photoId } = await params;
  const verify = new URL(request.url).searchParams.get("verificar") === "1";
  const supabase = await createSupabaseServerClient();

  const outcome = await resolveChecklistPhoto(
    {
      async getUserId() {
        const { data } = await supabase.auth.getUser();
        return data.user?.id ?? null;
      },
      async loadPhoto(id) {
        const { data, error } = await supabase
          .from("ssma_submission_photos")
          .select("id, project_id, submission_id, storage_bucket, storage_path, ssma_form_submissions(id, project_id, status)")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return null;
        return data as unknown as ChecklistPhotoRow;
      },
      async signUrl(bucket, path, expiresIn) {
        const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
        if (error || !data?.signedUrl) return null;
        return data.signedUrl;
      },
    },
    { projectId, photoId }
  );

  const headers = { "cache-control": "private, no-store" };
  if (verify) {
    return NextResponse.json(
      outcome.status === 302 ? { ok: true } : { ok: false, reason: outcome.reason },
      { status: outcome.status === 302 ? 200 : outcome.status, headers }
    );
  }
  if (outcome.status === 302) return NextResponse.redirect(outcome.url, { status: 302, headers });
  return new NextResponse(outcome.message, { status: outcome.status, headers });
}
