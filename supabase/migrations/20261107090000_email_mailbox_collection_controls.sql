-- ============================================================
-- 20261107090000_email_mailbox_collection_controls.sql
--
-- RASCUNHO PARA REVISÃO — NÃO APLICAR sem aprovação do conteúdo.
--
-- PROPÓSITO: controle por CAIXA para a coleta do Gmail por delegação em todo o domínio. A delegação do Google
-- não limita o acesso a uma obra nem a uma caixa; quem limita é o ACC. Esta tabela registra, por (obra, caixa) e em
-- estados SEPARADOS: autorização corporativa, aceite individual (quando existir), permissão técnica e coleta ativa,
-- mais período, última sincronização e revogação.
--
-- NÃO habilita nenhuma caixa: toda linha nasce com coleta DESLIGADA e sem autorização. Não há seed. Não altera
-- project_email_ingestion_* (a lista explícita de caixas da obra continua lá e continua exigida), nem email_accounts,
-- nem emails, nem email_access_authorizations. Não registra aceite individual: o estado nasce NAO_REGISTRADO.
--
-- Escrita só por RPC SECURITY DEFINER (sem INSERT/UPDATE/DELETE direto):
--   Administrador da obra (authenticated): register_mailbox_corporate_authorization, set_mailbox_collection,
--     revoke_mailbox_collection — todas auditadas com o autor.
--   service_role (coletor no executor remoto): record_mailbox_technical_check, record_mailbox_sync_result — auditoria SYSTEM.
-- A linha nunca é apagada: revogar marca revoked_at/by/reason e preserva o histórico (também em audit_log_entries).
-- Aditiva e idempotente; não apaga dados.
-- ============================================================

create table if not exists public.email_mailbox_collection_controls (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  mailbox_address text not null check (mailbox_address = lower(btrim(mailbox_address)) and mailbox_address like '%@axion.com.br'),
  auth_mode text not null default 'DOMAIN_DELEGATION' check (auth_mode in ('OAUTH_USUARIO', 'DOMAIN_DELEGATION')),

  -- 1) Autorização corporativa (decisão da empresa de usar a caixa para esta obra), registrada por um Administrador.
  corporate_authorization_status text not null default 'NAO_REGISTRADA'
    check (corporate_authorization_status in ('NAO_REGISTRADA', 'AUTORIZADA', 'REVOGADA')),
  corporate_authorized_by_user_id uuid references public.profiles (id) on delete restrict,
  corporate_authorized_at timestamptz,
  corporate_authorization_ref text check (corporate_authorization_ref is null or char_length(corporate_authorization_ref) between 3 and 300),

  -- 2) Aceite individual do dono da caixa — estado À PARTE; nunca preenchido por padrão nem fictício.
  individual_consent_status text not null default 'NAO_REGISTRADO'
    check (individual_consent_status in ('NAO_APLICAVEL', 'NAO_REGISTRADO', 'ACEITE_REGISTRADO', 'RECUSADO', 'REVOGADO')),
  individual_consent_authorization_id uuid references public.email_access_authorizations (id) on delete set null,

  -- 3) Permissão técnica (o teste real de delegação funcionou). Só o coletor registra.
  technical_permission_status text not null default 'NAO_VERIFICADA'
    check (technical_permission_status in ('NAO_VERIFICADA', 'CONFIRMADA', 'FALHA')),
  technical_checked_at timestamptz,
  technical_check_detail text check (technical_check_detail is null or char_length(technical_check_detail) <= 200),

  -- 4) Coleta ativa + período autorizado da obra.
  collection_enabled boolean not null default false,
  period_start timestamptz,
  period_end timestamptz,

  -- Estado visível da conexão / última sincronização (escrito só pelo coletor).
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status is null or last_sync_status in ('SUCESSO', 'ERRO', 'BLOQUEADA')),
  last_sync_detail text check (last_sync_detail is null or char_length(last_sync_detail) <= 300),
  last_sync_imported integer check (last_sync_imported is null or last_sync_imported >= 0),

  -- Revogação (a linha nunca é apagada).
  revoked_at timestamptz,
  revoked_by_user_id uuid references public.profiles (id) on delete restrict,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) between 3 and 500),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (project_id, mailbox_address),
  check (period_end is null or period_start is null or period_end > period_start),
  check (corporate_authorization_status <> 'AUTORIZADA' or (corporate_authorized_by_user_id is not null and corporate_authorized_at is not null and corporate_authorization_ref is not null)),
  check ((revoked_at is null) = (revoked_by_user_id is null) and (revoked_at is null) = (revoked_reason is null)),
  -- Coleta ligada exige autorização corporativa + permissão técnica confirmada + não revogada.
  check (not collection_enabled or (corporate_authorization_status = 'AUTORIZADA' and technical_permission_status = 'CONFIRMADA' and revoked_at is null))
);

create index if not exists email_mailbox_collection_controls_project_idx on public.email_mailbox_collection_controls (project_id);

alter table public.email_mailbox_collection_controls enable row level security;
alter table public.email_mailbox_collection_controls force row level security;
revoke all on public.email_mailbox_collection_controls from anon, authenticated;
grant select on public.email_mailbox_collection_controls to authenticated;
grant select on public.email_mailbox_collection_controls to service_role;
drop policy if exists email_mailbox_collection_controls_select_admin on public.email_mailbox_collection_controls;
create policy email_mailbox_collection_controls_select_admin on public.email_mailbox_collection_controls
  for select to authenticated using (public.has_project_permission(project_id, 'ADMINISTRADOR'));

-- ---------- Administrador: registrar a autorização corporativa da caixa (exige a caixa na lista habilitada da obra) ----------
create or replace function public.register_mailbox_corporate_authorization(
  p_project_id uuid,
  p_mailbox text,
  p_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_mailbox text := lower(btrim(coalesce(p_mailbox, '')));
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false) then raise exception 'FORBIDDEN'; end if;
  if v_ref is null or char_length(v_ref) < 3 or char_length(v_ref) > 300 then raise exception 'REFERENCE_REQUIRED'; end if;
  if not exists (
    select 1
      from public.project_email_ingestion_mailboxes m
      join public.project_email_ingestion_configs c on c.id = m.config_id
     where c.project_id = p_project_id and lower(m.mailbox_address) = v_mailbox and m.enabled
  ) then
    raise exception 'MAILBOX_NOT_IN_PROJECT_ALLOWLIST';
  end if;

  insert into public.email_mailbox_collection_controls as c
    (project_id, mailbox_address, corporate_authorization_status, corporate_authorized_by_user_id, corporate_authorized_at, corporate_authorization_ref)
  values (p_project_id, v_mailbox, 'AUTORIZADA', v_user, now(), v_ref)
  on conflict (project_id, mailbox_address) do update
     set corporate_authorization_status = 'AUTORIZADA',
         corporate_authorized_by_user_id = v_user,
         corporate_authorized_at = now(),
         corporate_authorization_ref = v_ref,
         -- reautorizar depois de revogar recomeça do zero: coleta desligada e teste técnico a refazer
         collection_enabled = false,
         technical_permission_status = case when c.revoked_at is not null then 'NAO_VERIFICADA' else c.technical_permission_status end,
         revoked_at = null, revoked_by_user_id = null, revoked_reason = null,
         updated_at = now()
  returning id into v_id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_user, null, 'MAILBOX_CORPORATE_AUTHORIZATION_REGISTERED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_id::text,
          format('Autorização corporativa registrada para a caixa %s (referência: %s). A coleta permanece desligada até confirmação técnica e habilitação explícita.', v_mailbox, v_ref));
  return v_id;
end;
$$;

-- ---------- Administrador: habilitar/desabilitar a coleta de UMA caixa, com período ----------
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
                 case when p_enabled then format(' (período %s a %s)', p_period_start, coalesce(p_period_end::text, 'em aberto')) else '' end));
  return v_row.id;
end;
$$;

-- ---------- Administrador: revogar (coleta desligada na hora; histórico preservado) ----------
create or replace function public.revoke_mailbox_collection(
  p_project_id uuid,
  p_mailbox text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_mailbox text := lower(btrim(coalesce(p_mailbox, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_row public.email_mailbox_collection_controls;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false) then raise exception 'FORBIDDEN'; end if;
  if v_reason is null or char_length(v_reason) < 3 or char_length(v_reason) > 500 then raise exception 'REASON_REQUIRED'; end if;
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;
  if v_row.revoked_at is not null then raise exception 'ALREADY_REVOKED'; end if;

  update public.email_mailbox_collection_controls
     set collection_enabled = false,
         corporate_authorization_status = 'REVOGADA',
         revoked_at = now(), revoked_by_user_id = v_user, revoked_reason = v_reason,
         updated_at = now()
   where id = v_row.id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_user, null, 'MAILBOX_COLLECTION_REVOKED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
          format('Autorização e coleta da caixa %s revogadas (histórico preservado). Motivo: %s', v_mailbox, v_reason));
  return v_row.id;
end;
$$;

-- ---------- Coletor (service_role): resultado do teste técnico de delegação. NÃO liga a coleta. ----------
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

-- ---------- Coletor (service_role): estado visível da última sincronização ----------
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

-- Privilégios: administrador chama as 3 primeiras; somente o coletor (service_role) chama as 2 últimas.
revoke all on function public.register_mailbox_corporate_authorization(uuid, text, text) from public, anon;
revoke all on function public.set_mailbox_collection(uuid, text, boolean, timestamptz, timestamptz) from public, anon;
revoke all on function public.revoke_mailbox_collection(uuid, text, text) from public, anon;
revoke all on function public.record_mailbox_technical_check(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.register_mailbox_corporate_authorization(uuid, text, text) to authenticated;
grant execute on function public.set_mailbox_collection(uuid, text, boolean, timestamptz, timestamptz) to authenticated;
grant execute on function public.revoke_mailbox_collection(uuid, text, text) to authenticated;
grant execute on function public.record_mailbox_technical_check(uuid, text, boolean, text) to service_role;
grant execute on function public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamptz) to service_role;
