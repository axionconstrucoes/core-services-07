// Descarte de foto SSMA que foi enviada ao Storage mas não chegou a ser registrada.
// O banco só AUTORIZA (authorize_discard_unregistered_ssma_photo); a remoção do objeto é feita pela API do Storage,
// nunca por DELETE em storage.objects (bloqueado por storage.protect_delete).

export type DiscardDeps = {
  /** RPC executada com a sessão do usuário (auth.uid() do próprio técnico). */
  authorize: (submissionId: string, storagePath: string) => Promise<{ data: boolean | null; error: unknown }>;
  /** Remoção pela API do Storage (cliente administrativo do servidor). */
  removeObject: (storagePath: string) => Promise<{ error: unknown }>;
};

export type DiscardResult = { status: 200 | 400 | 403 | 502; body: { discarded: boolean; error?: string } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function discardUnregisteredSsmaPhoto(
  input: { submissionId?: unknown; storagePath?: unknown },
  deps: DiscardDeps
): Promise<DiscardResult> {
  const submissionId = typeof input.submissionId === "string" ? input.submissionId.trim() : "";
  const storagePath = typeof input.storagePath === "string" ? input.storagePath : "";
  if (!UUID.test(submissionId) || storagePath.length === 0 || storagePath.length > 512 || storagePath.split("/").includes("..")) {
    return { status: 400, body: { discarded: false, error: "Pedido inválido." } };
  }

  const authorization = await deps.authorize(submissionId, storagePath);
  if (authorization.error || authorization.data !== true) {
    // Mesma resposta para "não é seu", "já registrado" e "objeto inexistente": nada é revelado nem removido.
    return { status: 403, body: { discarded: false, error: "Descarte não autorizado." } };
  }

  const removal = await deps.removeObject(storagePath);
  if (removal.error) return { status: 502, body: { discarded: false, error: "Falha ao remover o arquivo no Storage." } };
  return { status: 200, body: { discarded: true } };
}
