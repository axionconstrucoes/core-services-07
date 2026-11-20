-- ============================================================
-- 20261121110000_email_mailbox_controls_hardening.sql
--
-- RASCUNHO PARA REVISÃO — NÃO APLICAR sem aprovação. Depende de 20261107090000 (também NÃO aplicada em produção):
-- as duas devem ser aplicadas juntas, nesta ordem.
--
-- PROPÓSITO: fechar lacunas do controle por caixa sem criar arquitetura paralela.
--   1. Aceite individual (email_access_authorizations) passa a refletir no controle da caixa, nos DOIS sentidos:
--      controle criado depois do aceite herda o estado; recusa/revogação do aceite DESLIGA a coleta na hora.
--   2. Coleta ligada nunca convive com aceite individual RECUSADO/REVOGADO (constraint + RPC com erro claro).
--   3. Retentativa LIMITADA entre execuções: erros seguidos contados; no 5º a coleta é suspensa (auditado) e só volta
--      com nova habilitação explícita do Administrador.
--   4. Cursor por caixa só avança com SUCESSO de caixa ainda habilitada e não revogada; nunca passa do fim do período
--      e nunca recua.
--   5. Teste técnico não confirma caixa com aceite individual recusado/revogado.
-- Não cria nem habilita caixas, não registra aceites, não toca em emails/email_accounts. Aditiva e idempotente.
-- ============================================================

alter table public.email_mailbox_collection_controls
  add column if not exists consecutive_errors integer not null default 0 check (consecutive_errors >= 0),
  add column if not exists last_error_at timestamptz;

alter table public.email_mailbox_collection_controls
  drop constraint if exists email_mailbox_controls_consent_blocks_collection;
alter table public.email_mailbox_collection_controls
  add constraint email_mailbox_controls_consent_blocks_collection
  check (not collection_enabled or individual_consent_status not in ('RECUSADO', 'REVOGADO'));

-- Mapeamento único do aceite (email_access_authorizations.status) para o estado do controle. PENDENTE não é aceite.
create or replace function public.email_mailbox_consent_from_authorization(p_status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'AUTORIZADO' then 'ACEITE_REGISTRADO'
    when 'RECUSADO' then 'RECUSADO'
    when 'REVOGADO' then 'REVOGADO'
    else 'NAO_REGISTRADO'
  end;
$$;

-- ---------- Controle novo herda o aceite individual vigente (decisão mais recente da obra + conta) ----------
create or replace function public.email_mailbox_controls_inherit_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth record;
begin
  select a.id, a.status into v_auth
    from public.email_access_authorizations a
   where a.project_id = new.project_id and a.account_email = new.mailbox_address
   order by coalesce(a.decided_at, a.requested_at) desc
   limit 1;
  if v_auth.id is not null then
    new.individual_consent_status := public.email_mailbox_consent_from_authorization(v_auth.status);
    new.individual_consent_authorization_id := v_auth.id;
  end if;
  return new;
end;
$$;

drop trigger if exists email_mailbox_controls_inherit_consent on public.email_mailbox_collection_controls;
create trigger email_mailbox_controls_inherit_consent
  before insert on public.email_mailbox_collection_controls
  for each row execute function public.email_mailbox_controls_inherit_consent();

-- ---------- Decisão do aceite propaga para o controle; recusa/revogação desliga a coleta NA HORA ----------
create or replace function public.email_access_authorization_sync_mailbox_control()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text := public.email_mailbox_consent_from_authorization(new.status);
  v_row public.email_mailbox_collection_controls;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return new; end if;
  -- Só a decisão MAIS RECENTE da obra + conta vale (uma solicitação antiga não sobrescreve a atual).
  if exists (
    select 1 from public.email_access_authorizations a
     where a.project_id = new.project_id and a.account_email = new.account_email and a.id <> new.id
       and coalesce(a.decided_at, a.requested_at) > coalesce(new.decided_at, new.requested_at)
  ) then
    return new;
  end if;

  select * into v_row from public.email_mailbox_collection_controls
   where project_id = new.project_id and mailbox_address = new.account_email for update;
  if v_row.id is null then return new; end if;

  update public.email_mailbox_collection_controls
     set individual_consent_status = v_state,
         individual_consent_authorization_id = new.id,
         collection_enabled = case when v_state in ('RECUSADO', 'REVOGADO') then false else collection_enabled end,
         updated_at = now()
   where id = v_row.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (new.project_id, 'SYSTEM', null, null, 'MAILBOX_INDIVIDUAL_CONSENT_SYNCED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
          format('Aceite individual da caixa %s: %s (autorização %s).%s', new.account_email, v_state, new.id,
                 case when v_state in ('RECUSADO', 'REVOGADO') and v_row.collection_enabled then ' Coleta DESLIGADA imediatamente.' else '' end));
  return new;
end;
$$;

drop trigger if exists email_access_authorization_sync_mailbox_control on public.email_access_authorizations;
create trigger email_access_authorization_sync_mailbox_control
  after insert or update of status on public.email_access_authorizations
  for each row execute function public.email_access_authorization_sync_mailbox_control();

-- ---------- Administrador: habilitar/desabilitar (agora recusa aceite individual negado e zera o contador de erros) ----------
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
    if v_row.individual_consent_status in ('RECUSADO', 'REVOGADO') then raise exception 'INDIVIDUAL_CONSENT_DENIED'; end if;
    if v_row.technical_permission_status <> 'CONFIRMADA' then raise exception 'TECHNICAL_PERMISSION_REQUIRED'; end if;
    if p_period_start is null then raise exception 'PERIOD_START_REQUIRED'; end if;
    if p_period_end is null then raise exception 'PERIOD_END_REQUIRED'; end if;
    if p_period_end <= p_period_start then raise exception 'PERIOD_INVALID'; end if;
  end if;

  update public.email_mailbox_collection_controls
     set collection_enabled = p_enabled,
         period_start = case when p_enabled then p_period_start else period_start end,
         period_end = case when p_enabled then p_period_end else period_end end,
         consecutive_errors = case when p_enabled then 0 else consecutive_errors end,
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

-- ---------- Coletor: teste técnico (não confirma caixa com aceite individual negado) ----------
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
  if p_ok and v_row.individual_consent_status in ('RECUSADO', 'REVOGADO') then raise exception 'INDIVIDUAL_CONSENT_DENIED'; end if;

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

-- ---------- Coletor: resultado da sincronização (cursor protegido + retentativa limitada) ----------
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
  v_status text := p_status;
  v_detail text := left(nullif(btrim(coalesce(p_detail, '')), ''), 300);
  v_cursor timestamptz;
  v_errors integer;
  v_suspend boolean := false;
begin
  if p_status not in ('SUCESSO', 'ERRO', 'BLOQUEADA') then raise exception 'INVALID_STATUS'; end if;
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;

  -- Sucesso de uma caixa revogada/desligada durante a execução não conta: vira BLOQUEADA e o cursor não anda.
  if v_status = 'SUCESSO' and (v_row.revoked_at is not null or not v_row.collection_enabled) then
    v_status := 'BLOQUEADA';
    v_detail := left('REVOGADA_OU_DESLIGADA_DURANTE_A_EXECUCAO; ' || coalesce(v_detail, ''), 300);
  end if;

  -- Cursor: só em SUCESSO; nunca além do fim do período; nunca para trás.
  v_cursor := v_row.last_sync_at;
  if v_status = 'SUCESSO' and p_synced_through is not null then
    v_cursor := least(p_synced_through, coalesce(v_row.period_end, p_synced_through));
    if v_row.last_sync_at is not null and v_cursor < v_row.last_sync_at then v_cursor := v_row.last_sync_at; end if;
  end if;

  v_errors := case when v_status = 'SUCESSO' then 0 when v_status = 'ERRO' then v_row.consecutive_errors + 1 else v_row.consecutive_errors end;
  v_suspend := v_status = 'ERRO' and v_errors >= 5 and v_row.collection_enabled;

  update public.email_mailbox_collection_controls
     set last_sync_status = v_status,
         last_sync_detail = v_detail,
         last_sync_imported = p_imported,
         last_sync_at = v_cursor,
         consecutive_errors = v_errors,
         last_error_at = case when v_status = 'ERRO' then now() else last_error_at end,
         collection_enabled = case when v_suspend then false else collection_enabled end,
         updated_at = now()
   where id = v_row.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, 'SYSTEM', null, null, 'MAILBOX_SYNC_RECORDED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
          format('Sincronização da caixa %s: %s (%s importadas).', v_mailbox, v_status, coalesce(p_imported, 0)));
  if v_suspend then
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
    values (p_project_id, 'SYSTEM', null, null, 'MAILBOX_COLLECTION_SUSPENDED_AFTER_ERRORS', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
            format('Coleta da caixa %s suspensa após %s erros seguidos. Requer nova habilitação do Administrador.', v_mailbox, v_errors));
  end if;
  return v_row.id;
end;
$$;

revoke all on function public.email_mailbox_consent_from_authorization(text) from public, anon;
revoke all on function public.email_mailbox_controls_inherit_consent() from public, anon, authenticated;
revoke all on function public.email_access_authorization_sync_mailbox_control() from public, anon, authenticated;
revoke all on function public.set_mailbox_collection(uuid, text, boolean, timestamptz, timestamptz) from public, anon;
revoke all on function public.record_mailbox_technical_check(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.set_mailbox_collection(uuid, text, boolean, timestamptz, timestamptz) to authenticated;
grant execute on function public.record_mailbox_technical_check(uuid, text, boolean, text) to service_role;
grant execute on function public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamptz) to service_role;
