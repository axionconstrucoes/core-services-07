-- ============================================================
-- 20261120190000_null_safe_ssma_cores.sql (integração)
--
-- Autorização falha fechada contra NULL nos núcleos com ator explícito criados em 20261120160000 (que copiaram as
-- funções originais): em ssma_field_record_register_photo_core, registro SEM responsável fazia
-- "responsible_user_id = v_user" resultar NULL e "if not (... or NULL)" não recusava — qualquer membro ativo
-- registrava foto no registro (defeito herdado da função original de produção). Em
-- ssma_corrective_action_forward_core, coalesce defensivo (a coluna é NOT NULL hoje), restaurando o ajuste de
-- 20261120153000 que a recriação posterior sobrescreveu. Restante dos corpos idêntico.
-- ============================================================

create or replace function public.ssma_corrective_action_forward_core(
  p_actor uuid,
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.ssma_corrective_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_actor;
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_permission text;
  v_is_admin boolean;
  v_previous uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;

  select pm.permission into v_permission
  from public.project_memberships pm
  where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE';
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');
  if not coalesce(v_is_admin or (coalesce(v_action.responsible_user_id = v_user, false) and v_permission not in ('LEITURA', 'VIEWER')), false) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  v_previous := v_action.responsible_user_id;
  if p_new_responsible_user_id is null then raise exception 'NEW_RESPONSIBLE_REQUIRED'; end if;
  if p_new_responsible_user_id = v_previous then raise exception 'SAME_RESPONSIBLE'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = v_action.project_id and pm.user_id = p_new_responsible_user_id
      and pm.status = 'ACTIVE' and pm.permission not in ('LEITURA', 'VIEWER')
  ) then raise exception 'NEW_RESPONSIBLE_NOT_ELIGIBLE'; end if;
  if not v_is_admin and (v_reason is null or char_length(v_reason) < 5) then raise exception 'FORWARD_REASON_REQUIRED'; end if;

  if v_sla_id is not null then
    update public.sla_actions set responsible_user_id = p_new_responsible_user_id where id = v_sla_id;
    if auth.uid() is null then
      insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
      values (v_action.id, v_action.project_id, 'REATRIBUIDA', 'Responsável alterado pelo módulo Ações e Escalonamentos.', v_user);
    end if;
  else
    update public.ssma_corrective_actions set responsible_user_id = p_new_responsible_user_id where id = v_action.id;
    update public.ssma_field_records set responsible_user_id = p_new_responsible_user_id where id = v_action.record_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (v_action.id, v_action.project_id, 'REATRIBUIDA', coalesce(v_reason, 'Encaminhada pelo administrador.'), v_user);
  end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail, occurred_at)
  values (
    v_action.project_id, 'USER', v_user, null, 'SSMA_ACTION_FORWARDED', 'SSMA_CORRECTIVE_ACTION', v_action.id::text,
    format('Ação corretiva SSMA encaminhada de %s para %s. Motivo: %s', coalesce(v_previous::text, 'não atribuído'),
      p_new_responsible_user_id::text, coalesce(v_reason, 'não informado (administrador)')),
    now()
  );

  select * into v_action from public.ssma_corrective_actions where id = p_action_id;
  if v_action.responsible_user_id is distinct from p_new_responsible_user_id then
    raise exception 'FORWARD_NOT_PERSISTED';
  end if;
  return v_action;
end;
$$;

create or replace function public.ssma_field_record_register_photo_core(
  p_actor uuid,
  p_photo_id uuid,
  p_record_id uuid,
  p_purpose text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_actor;
  v_record public.ssma_field_records%rowtype;
  v_existing public.ssma_field_record_photos%rowtype;
  v_prefix text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_record from public.ssma_field_records where id = p_record_id;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  if not public.project_member_active_for(v_record.project_id, v_user) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if not coalesce(
    coalesce(v_record.reported_by_user_id = v_user, false)
    or coalesce(v_record.responsible_user_id = v_user, false)
    or coalesce(public.project_permission_for(v_record.project_id, v_user, 'GESTOR'), false),
    false
  ) then raise exception 'RECORD_ACCESS_DENIED'; end if;
  if p_purpose = 'REGISTRO' and v_record.reported_by_user_id <> v_user then raise exception 'RECORD_ACCESS_DENIED'; end if;
  if p_purpose not in ('REGISTRO', 'EVIDENCIA_ACAO') then raise exception 'INVALID_PHOTO_PURPOSE'; end if;

  select * into v_existing from public.ssma_field_record_photos where id = p_photo_id;
  if found then
    if v_existing.record_id = p_record_id and v_existing.uploaded_by_user_id = v_user then return v_existing.id; end if;
    raise exception 'PHOTO_ID_CONFLICT';
  end if;

  v_prefix := v_record.project_id::text || '/ssma-registros/' || p_record_id::text || '/' || p_photo_id::text || '-';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then raise exception 'INVALID_STORAGE_PATH'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png') then raise exception 'INVALID_PHOTO_TYPE'; end if;
  if p_file_size_bytes <= 0 or p_file_size_bytes > 15728640 then raise exception 'INVALID_PHOTO_SIZE'; end if;
  if p_sha256_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_PHOTO_HASH'; end if;
  if (select count(*) from public.ssma_field_record_photos where record_id = p_record_id) >= 30 then
    raise exception 'PHOTO_LIMIT_EXCEEDED';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'project-documents' and name = p_storage_path) then
    raise exception 'STORAGE_OBJECT_NOT_FOUND';
  end if;

  insert into public.ssma_field_record_photos (
    id, record_id, project_id, purpose, storage_path, original_file_name, mime_type,
    file_size_bytes, sha256_hash, uploaded_by_user_id
  ) values (
    p_photo_id, p_record_id, v_record.project_id, p_purpose, p_storage_path, p_original_file_name,
    p_mime_type, p_file_size_bytes, lower(p_sha256_hash), v_user
  );
  return p_photo_id;
end;
$$;

revoke all on function public.ssma_corrective_action_forward_core(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ssma_field_record_register_photo_core(uuid, uuid, uuid, text, text, text, text, bigint, text) from public, anon, authenticated;
