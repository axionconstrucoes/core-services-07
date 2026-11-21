-- ROLLBACK (manual, NAO e migration) de 20261121110000_email_mailbox_controls_hardening.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'consecutive_errors') then
    select count(*) into n from public.email_mailbox_collection_controls where consecutive_errors is distinct from 0;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_mailbox_collection_controls.consecutive_errors tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'last_error_at') then
    select count(*) into n from public.email_mailbox_collection_controls where last_error_at is distinct from null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_mailbox_collection_controls.last_error_at tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
end $$;
drop trigger if exists email_mailbox_controls_inherit_consent on public.email_mailbox_collection_controls;
drop trigger if exists email_access_authorization_sync_mailbox_control on public.email_access_authorizations;
drop function if exists public.email_mailbox_consent_from_authorization(text);
drop function if exists public.email_mailbox_controls_inherit_consent();
drop function if exists public.email_access_authorization_sync_mailbox_control();
-- restaura set_mailbox_collection(uuid, text, boolean, timestamp with time zone, timestamp with time zone) com o corpo de 20261107090000_email_mailbox_collection_controls
create or replace function public.set_mailbox_collection(
  p_project_id uuid,
  p_mailbox text,
  p_enabled boolean,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_mailbox text := lower(btrim(coalesce(p_mailbox, '')));
  v_row public.email_mailbox_collection_controls;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false) then raise exception 'FORBIDDEN'; end if;
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;
  if p_enabled then
    if v_row.revoked_at is not null then raise exception 'REVOKED'; end if;
    if v_row.corporate_authorization_status <> 'AUTORIZADA' then raise exception 'CORPORATE_AUTHORIZATION_REQUIRED'; end if;
    if v_row.technical_permission_status <> 'CONFIRMADA' then raise exception 'TECHNICAL_PERMISSION_REQUIRED'; end if;
    if p_period_start is null then raise exception 'PERIOD_START_REQUIRED'; end if;
    if p_period_end is null then raise exception 'PERIOD_END_REQUIRED'; end if;
    if p_period_end <= p_period_start then raise exception 'PERIOD_INVALID'; end if;
  end if;

  update public.email_mailbox_collection_controls
     set collection_enabled = p_enabled,
         period_start = case when p_enabled then p_period_start else period_start end,
         period_end = case when p_enabled then p_period_end else period_end end,
         updated_at = now()
   where id = v_row.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_user, null, case when p_enabled then 'MAILBOX_COLLECTION_ENABLED' else 'MAILBOX_COLLECTION_DISABLED' end,
          'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
          format('Coleta da caixa %s %s%s.', v_mailbox, case when p_enabled then 'habilitada' else 'desabilitada' end,
                 case when p_enabled then format(' (período %s a %s)', p_period_start, p_period_end) else '' end));
  return v_row.id;
end;
$$;
revoke all on function public.set_mailbox_collection(uuid, text, boolean, timestamptz, timestamptz) from public, anon;
grant execute on function public.set_mailbox_collection(uuid, text, boolean, timestamptz, timestamptz) to authenticated;
-- restaura record_mailbox_technical_check(uuid, text, boolean, text) com o corpo de 20261107090000_email_mailbox_collection_controls
create or replace function public.record_mailbox_technical_check(
  p_project_id uuid,
  p_mailbox text,
  p_ok boolean,
  p_detail text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mailbox text := lower(btrim(coalesce(p_mailbox, '')));
  v_row public.email_mailbox_collection_controls;
begin
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;
  if v_row.revoked_at is not null then raise exception 'REVOKED'; end if;
  if v_row.corporate_authorization_status <> 'AUTORIZADA' then raise exception 'CORPORATE_AUTHORIZATION_REQUIRED'; end if;

  update public.email_mailbox_collection_controls
     set technical_permission_status = case when p_ok then 'CONFIRMADA' else 'FALHA' end,
         technical_checked_at = now(),
         technical_check_detail = left(nullif(btrim(coalesce(p_detail, '')), ''), 200),
         collection_enabled = case when p_ok then collection_enabled else false end,
         updated_at = now()
   where id = v_row.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, 'SYSTEM', null, null, 'MAILBOX_TECHNICAL_CHECK_RECORDED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
          format('Teste técnico da delegação para a caixa %s: %s.', v_mailbox, case when p_ok then 'CONFIRMADA' else 'FALHA' end));
  return v_row.id;
end;
$$;
revoke all on function public.record_mailbox_technical_check(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_mailbox_technical_check(uuid, text, boolean, text) to service_role;
-- restaura record_mailbox_sync_result(uuid, text, text, text, integer, timestamp with time zone) com o corpo de 20261107090000_email_mailbox_collection_controls
create or replace function public.record_mailbox_sync_result(
  p_project_id uuid,
  p_mailbox text,
  p_status text,
  p_detail text default null,
  p_imported integer default null,
  p_synced_through timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mailbox text := lower(btrim(coalesce(p_mailbox, '')));
  v_row public.email_mailbox_collection_controls;
begin
  if p_status not in ('SUCESSO', 'ERRO', 'BLOQUEADA') then raise exception 'INVALID_STATUS'; end if;
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;

  update public.email_mailbox_collection_controls
     set last_sync_status = p_status,
         last_sync_detail = left(nullif(btrim(coalesce(p_detail, '')), ''), 300),
         last_sync_imported = p_imported,
         -- o ponteiro de leitura só avança em SUCESSO (um erro nunca "pula" mensagens)
         last_sync_at = case when p_status = 'SUCESSO' and p_synced_through is not null then p_synced_through else last_sync_at end,
         updated_at = now()
   where id = v_row.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, 'SYSTEM', null, null, 'MAILBOX_SYNC_RECORDED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
          format('Sincronização da caixa %s: %s (%s importadas).', v_mailbox, p_status, coalesce(p_imported, 0)));
  return v_row.id;
end;
$$;
revoke all on function public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamptz) to service_role;
alter table public.email_mailbox_collection_controls drop constraint if exists email_mailbox_controls_consent_blocks_collection;
alter table public.email_mailbox_collection_controls drop column if exists consecutive_errors;
alter table public.email_mailbox_collection_controls drop column if exists last_error_at;
commit;
