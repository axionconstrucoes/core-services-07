-- ROLLBACK (manual, NAO e migration) de 20261120160000_email_reply_tokens_and_ssma_by_email.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.email_reply_tokens') is not null then
    select count(*) into n from public.email_reply_tokens;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_reply_tokens tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.email_inbound_attachments') is not null then
    select count(*) into n from public.email_inbound_attachments;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_inbound_attachments tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.email_reply_inbound_log') is not null then
    select count(*) into n from public.email_reply_inbound_log;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_reply_inbound_log tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.email_reply_inbound_log;
drop table if exists public.email_inbound_attachments;
drop table if exists public.email_reply_tokens;
drop function if exists public.project_member_active_for(uuid, uuid);
drop function if exists public.project_permission_for(uuid, uuid, text);
drop function if exists public.ssma_corrective_action_update_core(uuid, uuid, text, text, uuid);
drop function if exists public.ssma_corrective_action_update_by_email(uuid, uuid, text, text, uuid);
drop function if exists public.ssma_corrective_action_forward_core(uuid, uuid, uuid, text);
drop function if exists public.ssma_corrective_action_forward_by_email(uuid, uuid, uuid, text);
drop function if exists public.ssma_field_record_register_photo_core(uuid, uuid, uuid, text, text, text, text, bigint, text);
drop function if exists public.ssma_field_record_register_photo_by_email(uuid, uuid, uuid, text, text, text, bigint, text);
-- restaura ssma_corrective_action_update(uuid, text, text, uuid) com o corpo de 20261111042824_ssma_esg_acoes_perfis_notificacoes
create or replace function public.ssma_corrective_action_update(
  p_action_id uuid,
  p_event text,
  p_note text default null,
  p_evidence_photo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_is_manager boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(p_event, '') not in ('ANDAMENTO', 'CONCLUIDA') then raise exception 'INVALID_EVENT'; end if;

  -- Ordem de bloqueio: ação SLA primeiro, depois a ação SSMA (a mesma do trigger do SLA).
  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if not public.is_project_member(v_action.project_id) then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  v_is_manager := coalesce(public.has_project_permission(v_action.project_id, 'GESTOR'), false);
  if not (v_is_manager or coalesce(v_action.responsible_user_id = v_user, false)) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  perform set_config('acc.ssma_sync', 'on', true);

  if p_event = 'ANDAMENTO' then
    if v_note is null then raise exception 'NOTE_REQUIRED'; end if;
    update public.ssma_corrective_actions set status = 'EM_ANDAMENTO' where id = p_action_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (p_action_id, v_action.project_id, 'ANDAMENTO', v_note, v_user);
    if v_sla_id is not null then
      update public.sla_actions
      set status = case when status in ('PENDING', 'ACKNOWLEDGED', 'OVERDUE', 'ESCALATED') then 'IN_PROGRESS' else status end,
          acknowledged_at = coalesce(acknowledged_at, now()),
          acknowledged_by_user_id = coalesce(acknowledged_by_user_id, (
            select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user))
      where id = v_sla_id and status <> 'COMPLETED' and status <> 'CANCELLED';
    end if;
    perform set_config('acc.ssma_sync', 'off', true);
    return;
  end if;

  if p_evidence_photo_id is not null then
    if not exists (
      select 1 from public.ssma_field_record_photos p
      where p.id = p_evidence_photo_id and p.record_id = v_action.record_id and p.purpose = 'EVIDENCIA_ACAO'
    ) then raise exception 'EVIDENCE_NOT_FOUND'; end if;
  elsif not v_is_manager then
    raise exception 'EVIDENCE_REQUIRED';
  elsif v_note is null or char_length(v_note) < 10 then
    raise exception 'JUSTIFICATION_REQUIRED';
  end if;

  update public.ssma_corrective_actions
  set status = 'CONCLUIDA', concluded_at = now(), concluded_by_user_id = v_user
  where id = p_action_id;
  insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, evidence_photo_id, actor_user_id)
  values (p_action_id, v_action.project_id, 'CONCLUIDA', v_note, p_evidence_photo_id, v_user);

  if v_sla_id is not null then
    update public.sla_actions
    set status = 'COMPLETED',
        completed_at = now(),
        completed_by_user_id = (select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user),
        completion_note = coalesce(v_note, 'Concluída com foto de evidência (registro SSMA).'),
        acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, (
          select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user))
    where id = v_sla_id and status <> 'COMPLETED' and status <> 'CANCELLED'
      and exists (select 1 from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user);
  end if;
  perform set_config('acc.ssma_sync', 'off', true);
end;
$$;
revoke all on function public.ssma_corrective_action_update(uuid,text,text,uuid) from public;
grant execute on function public.ssma_corrective_action_update(uuid,text,text,uuid) to authenticated;
-- restaura ssma_corrective_action_forward(uuid, uuid, text) com o corpo de 20261120153000_null_safe_authorization_checks
create or replace function public.ssma_corrective_action_forward(
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
  v_user uuid := auth.uid();
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_permission text;
  v_is_admin boolean;
  v_previous uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Ordem de bloqueio: ação SLA primeiro, depois a ação SSMA (a mesma do ssma_corrective_action_update).
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
    -- sla_action_ssma_guard propaga o novo responsável à ação SSMA e ao registro e grava o evento REATRIBUIDA.
    update public.sla_actions set responsible_user_id = p_new_responsible_user_id where id = v_sla_id;
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
revoke all on function public.ssma_corrective_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.ssma_corrective_action_forward(uuid, uuid, text) to authenticated;
-- restaura ssma_field_record_register_photo(uuid, uuid, uuid, text, text, text, text, bigint, text) com o corpo de 20261028130000_ssma_field_records
create or replace function public.ssma_field_record_register_photo(
  p_claimed_user_id uuid,
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
  v_user uuid := auth.uid();
  v_record public.ssma_field_records%rowtype;
  v_existing public.ssma_field_record_photos%rowtype;
  v_prefix text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_claimed_user_id is distinct from v_user then raise exception 'USER_MISMATCH'; end if;

  select * into v_record from public.ssma_field_records where id = p_record_id;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  if not public.is_project_member(v_record.project_id) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if not (
    v_record.reported_by_user_id = v_user
    or v_record.responsible_user_id = v_user
    or public.has_project_permission(v_record.project_id, 'GESTOR')
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
revoke all on function public.ssma_field_record_register_photo(uuid,uuid,uuid,text,text,text,text,bigint,text) from public;
grant execute on function public.ssma_field_record_register_photo(uuid,uuid,uuid,text,text,text,text,bigint,text) to authenticated;
drop index if exists public.email_reply_tokens_subject_idx;
drop index if exists public.email_inbound_attachments_project_idx;
drop index if exists public.email_reply_inbound_log_sender_idx;
commit;
