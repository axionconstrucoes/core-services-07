import { createSupabaseAdminClient } from "@axion/db/admin";
import { createSupabaseServerClient } from "@axion/db/server";
import { isCrossOriginRequest } from "@/lib/http/same-origin";
import { discardUnregisteredSsmaPhoto } from "@/lib/ssma/discard-unregistered-photo";

// Remove do Storage (pela API) uma foto enviada e não registrada. A autorização vem do banco, com a sessão do usuário.
export async function POST(request: Request) {
  if (isCrossOriginRequest(request.headers)) return Response.json({ error: "Origem não permitida." }, { status: 403 });
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return Response.json({ error: "Sessão expirada." }, { status: 401 });

  let payload: { submissionId?: unknown; storagePath?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }

  const result = await discardUnregisteredSsmaPhoto(payload, {
    authorize: async (submissionId, storagePath) => {
      const { data, error } = await supabase.rpc("authorize_discard_unregistered_ssma_photo", {
        p_submission_id: submissionId,
        p_storage_path: storagePath,
      });
      return { data: data as boolean | null, error };
    },
    removeObject: async (storagePath) => {
      const { error } = await createSupabaseAdminClient().storage.from("project-documents").remove([storagePath]);
      return { error };
    },
  });
  return Response.json(result.body, { status: result.status });
}
