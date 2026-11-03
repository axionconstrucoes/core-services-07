-- ============================================================
-- 20261030140000_ssma_photo_discard_authorize_only.sql
--
-- Defeito: discard_unregistered_ssma_photo() apagava a foto com `DELETE FROM storage.objects`. O Storage bloqueia DELETE direto em
-- suas tabelas (gatilho storage.protect_delete: "Use the Storage API instead"), então a limpeza após falha de registro nunca
-- removia o arquivo e deixava objeto órfão no bucket.
--
-- Correção: o banco passa a só AUTORIZAR; quem apaga é a API do Storage, chamada pelo servidor
-- (POST /api/ssma/photos/discard) depois desta autorização. Nada em storage.* é apagado por SQL e storage.protect_delete segue ativo.
--   - nova authorize_discard_unregistered_ssma_photo(submission, path) -> boolean: mesmas regras de antes (técnico dono do envio,
--     envio ainda em UPLOADING, prefixo do caminho, foto não registrada) mais a existência do objeto; não altera nada.
--   - discard_unregistered_ssma_photo(uuid,text) é removida (único chamador era o cliente, atualizado no mesmo conjunto de mudanças).
-- Acesso: somente authenticated (sem anon/PUBLIC), SECURITY DEFINER com search_path vazio e referências qualificadas.
-- ============================================================

begin;

create or replace function public.authorize_discard_unregistered_ssma_photo(
  p_submission_id uuid,
  p_storage_path text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_submission public.ssma_form_submissions%rowtype;
  v_prefix text;
begin
  if auth.uid() is null then return false; end if;
  select * into v_submission from public.ssma_form_submissions where id = p_submission_id;
  if v_submission.id is null or v_submission.technician_user_id <> auth.uid() or v_submission.status <> 'UPLOADING' then
    return false;
  end if;
  v_prefix := v_submission.project_id::text || '/ssma/' || p_submission_id::text || '/';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then return false; end if;
  if exists (select 1 from public.ssma_submission_photos where storage_path = p_storage_path) then return false; end if;
  return exists (
    select 1 from storage.objects where bucket_id = 'project-documents' and name = p_storage_path
  );
end;
$$;

revoke all on function public.authorize_discard_unregistered_ssma_photo(uuid, text) from public, anon;
grant execute on function public.authorize_discard_unregistered_ssma_photo(uuid, text) to authenticated, service_role;

drop function public.discard_unregistered_ssma_photo(uuid, text);

commit;
