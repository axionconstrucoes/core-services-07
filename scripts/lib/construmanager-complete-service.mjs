// Conclusao de um download do Construmanager pelo worker (service_role), SEM usar a RPC de sessao.
// Motivo comprovado: complete_construmanager_content_download_system delega a complete_construmanager_content_download,
// que exige auth.uid() (sempre nulo com service_role) e levanta 'Sessao nao autenticada.' depois que o arquivo ja foi
// baixado e enviado ao Storage. Esta funcao reproduz o mesmo efeito (blob por sha256 + vinculo ARMAZENADO + fim do lease)
// escopado ao projeto, sem migration e sem relaxar a RPC de sessao.
const SHA256 = /^[0-9a-f]{64}$/;
const clean = (v) => { const t = String(v ?? "").trim(); return t === "" ? null : t; };

export async function completeContentDownloadAsService(supabase, a) {
  if (!SHA256.test(String(a.sha256 ?? ""))) throw new Error("SHA-256 invalido.");
  const size = Number(a.sizeBytes);
  if (!Number.isFinite(size) || size < 0) throw new Error("Tamanho de conteudo invalido.");

  const ins = await supabase.from("construmanager_content_blobs")
    .upsert({ sha256: a.sha256, size_bytes: size, storage_bucket: a.storageBucket, storage_path: a.storagePath,
      mime_type: clean(a.mimeType), detected_extension: clean(a.detectedExtension) }, { onConflict: "sha256", ignoreDuplicates: true })
    .select("id");
  if (ins.error) throw new Error(ins.error.message);

  let blobId = ins.data?.[0]?.id ?? null;
  const reused = blobId === null;
  if (reused) {
    const sel = await supabase.from("construmanager_content_blobs").select("id").eq("sha256", a.sha256).maybeSingle();
    if (sel.error) throw new Error(sel.error.message);
    blobId = sel.data?.id ?? null;
  }
  if (!blobId) throw new Error("Falha ao resolver o conteudo armazenado.");

  const now = new Date().toISOString();
  const upd = await supabase.from("construmanager_content_links")
    .update({ content_blob_id: blobId, download_status: "ARMAZENADO", downloaded_at: now, last_checked_at: now, download_error: null,
      zip_entry_path: clean(a.zipEntryPath)?.slice(0, 1000) ?? null, lease_owner: null, lease_expires_at: null, next_attempt_at: null, updated_at: now })
    .eq("id", a.linkId).eq("project_id", a.projectId).select("id");
  if (upd.error) throw new Error(upd.error.message);
  if (!upd.data?.length) throw new Error("Vinculo de conteudo nao encontrado neste projeto.");

  return { blob_id: blobId, blob_reused: reused };
}
