-- ============================================================
-- 20261214100000_gmail_per_mailbox_collection.sql
--
-- RASCUNHO PARA REVISÃO — NÃO APLICAR sem aprovação do Dono. Depende de 20261107090000 + 20261121110000 (controles
-- por caixa) e 20261201100000 (email_message_sources), já aplicadas em produção.
--
-- PROPÓSITO: coleta Gmail POR CAIXA (docs/gmail-coleta-por-caixa.md). A execução agendada deixa de depender de UMA
-- caixa fixa e passa a percorrer as caixas autorizadas da obra (scripts/gmail-multi-mailbox-sync.mjs), cada uma com
-- cursor, estado, erros e revogação próprios — tudo já existente em email_mailbox_collection_controls. Esta migration
-- só COMPLETA o que faltava:
--   1. Estado visível da caixa: última mensagem importada (id + data), origem da credencial e escopos concedidos
--      (nomes curtos; NUNCA tokens) e quando o estado OAuth foi conferido.
--   2. Opção de incluir e-mail SOMENTE interno no perímetro: project_email_ingestion_configs.include_internal_only_messages,
--      padrão FALSE (desligado). Ligar exige decisão do Dono; esta migration não liga.
--   3. RPCs do coletor (service_role): record_mailbox_collection_progress (última importada; só avança) e
--      record_mailbox_oauth_state (origem + escopos; auditado).
--   4. RPC add_project_ingestion_mailbox: coloca uma caixa @axion.com.br na lista explícita da obra (pré-requisito para
--      a autorização corporativa). Só Administrador da obra (sessão) ou o Dono no SQL Editor; auditada.
--      NÃO cria controle, NÃO autoriza, NÃO liga coleta, NÃO registra aceite.
-- Não cria nem habilita caixas, não registra aceites, não toca em emails nem em email_accounts. Aditiva e idempotente.
-- Rollback: supabase/rollbacks/20261214100000_gmail_per_mailbox_collection.rollback.sql
-- ============================================================

-- ---------- 1) estado visível por caixa ----------
alter table public.email_mailbox_collection_controls
  add column if not exists last_imported_message_id text check (last_imported_message_id is null or char_length(last_imported_message_id) between 1 and 200),
  add column if not exists last_imported_message_at timestamptz,
  add column if not exists credential_source text check (credential_source is null or credential_source in ('OAUTH_CAIXA', 'OAUTH_SLOT_TITULAR', 'DOMAIN_DELEGATION')),
  add column if not exists granted_scopes text[] not null default '{}',
  add column if not exists oauth_checked_at timestamptz;

comment on column public.email_mailbox_collection_controls.last_imported_message_id is '20261214100000: id Gmail da última mensagem importada desta caixa (só avança).';
comment on column public.email_mailbox_collection_controls.credential_source is '20261214100000: origem da credencial usada na última conferência (OAUTH_CAIXA | OAUTH_SLOT_TITULAR | DOMAIN_DELEGATION). Nunca o valor.';
comment on column public.email_mailbox_collection_controls.granted_scopes is '20261214100000: escopos concedidos (nomes curtos, ex.: gmail.readonly). Nunca tokens.';

-- ---------- 2) perímetro: e-mail somente interno fica FORA por padrão ----------
alter table public.project_email_ingestion_configs
  add column if not exists include_internal_only_messages boolean not null default false;
comment on column public.project_email_ingestion_configs.include_internal_only_messages is
  '20261214100000: coleta por caixa inclui mensagens SOMENTE entre domínios internos. Padrão false; ligar exige autorização do Dono.';

-- ---------- 3a) coletor: última mensagem importada (só avança) ----------
create or replace function public.record_mailbox_collection_progress(
  p_project_id uuid,
  p_mailbox text,
  p_last_message_id text,
  p_last_message_at timestamptz
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
  if p_last_message_id is null or char_length(p_last_message_id) not between 1 and 200 then raise exception 'MESSAGE_ID_INVALID'; end if;
  if p_last_message_at is null then raise exception 'MESSAGE_AT_REQUIRED'; end if;
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;
  if v_row.last_imported_message_at is not null and p_last_message_at <= v_row.last_imported_message_at then
    return v_row.id; -- nunca recua
  end if;
  update public.email_mailbox_collection_controls
     set last_imported_message_id = p_last_message_id,
         last_imported_message_at = p_last_message_at,
         updated_at = now()
   where id = v_row.id;
  return v_row.id;
end;
$$;

-- ---------- 3b) coletor: estado OAuth (origem + escopos), auditado ----------
create or replace function public.record_mailbox_oauth_state(
  p_project_id uuid,
  p_mailbox text,
  p_credential_source text,
  p_scopes text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mailbox text := lower(btrim(coalesce(p_mailbox, '')));
  v_scopes text[] := coalesce(p_scopes, '{}');
  v_row public.email_mailbox_collection_controls;
begin
  if p_credential_source not in ('OAUTH_CAIXA', 'OAUTH_SLOT_TITULAR', 'DOMAIN_DELEGATION') then raise exception 'INVALID_CREDENTIAL_SOURCE'; end if;
  if exists (select 1 from unnest(v_scopes) s where s !~ '^[a-z._]{1,60}$') then raise exception 'INVALID_SCOPE_NAME'; end if;
  select * into v_row from public.email_mailbox_collection_controls where project_id = p_project_id and mailbox_address = v_mailbox for update;
  if v_row.id is null then raise exception 'CONTROL_NOT_FOUND'; end if;

  update public.email_mailbox_collection_controls
     set credential_source = p_credential_source,
         granted_scopes = v_scopes,
         oauth_checked_at = now(),
         updated_at = now()
   where id = v_row.id;

  if v_row.credential_source is distinct from p_credential_source or v_row.granted_scopes is distinct from v_scopes then
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
    values (p_project_id, 'SYSTEM', null, null, 'MAILBOX_OAUTH_STATE_RECORDED', 'EMAIL_MAILBOX_COLLECTION_CONTROL', v_row.id::text,
            format('Credencial da caixa %s: %s; escopos: %s.', v_mailbox, p_credential_source, coalesce(nullif(array_to_string(v_scopes, ','), ''), '(nenhum informado)')));
  end if;
  return v_row.id;
end;
$$;

-- ---------- 4) Administrador (sessão) ou Dono (SQL Editor): caixa na lista explícita da obra ----------
create or replace function public.add_project_ingestion_mailbox(
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
  v_config uuid;
  v_id uuid;
  v_existing boolean;
begin
  if v_user is null then
    -- Sem sessão: só o Dono no SQL Editor (papel postgres) pode chamar; service_role (coletor) NÃO.
    if session_user not in ('postgres', 'supabase_admin') then raise exception 'AUTH_REQUIRED'; end if;
  elsif not coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false) then
    raise exception 'FORBIDDEN';
  end if;
  if v_mailbox !~ '^[a-z0-9._%+-]+@axion\.com\.br$' then raise exception 'MAILBOX_NOT_CORPORATE'; end if;
  if v_ref is null or char_length(v_ref) < 3 or char_length(v_ref) > 300 then raise exception 'REFERENCE_REQUIRED'; end if;
  select id into v_config from public.project_email_ingestion_configs where project_id = p_project_id;
  if v_config is null then raise exception 'CONFIG_NOT_FOUND'; end if;

  select true into v_existing from public.project_email_ingestion_mailboxes where config_id = v_config and lower(mailbox_address) = v_mailbox;
  insert into public.project_email_ingestion_mailboxes (config_id, mailbox_address, enabled)
  values (v_config, v_mailbox, true)
  on conflict (config_id, mailbox_address) do update set enabled = true
  returning id into v_id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (p_project_id, case when v_user is null then 'SYSTEM' else 'USER' end, v_user, null,
          'PROJECT_INGESTION_MAILBOX_ADDED', 'PROJECT_EMAIL_INGESTION_MAILBOX', v_id::text,
          format('Caixa %s %s na lista da obra por %s (referência: %s). Nada é coletado sem autorização corporativa, aceite individual AUTORIZADO, credencial, teste técnico e coleta habilitada.',
                 v_mailbox, case when coalesce(v_existing, false) then 'reabilitada' else 'incluída' end,
                 case when v_user is null then 'Dono (SQL Editor)' else 'Administrador da obra' end, v_ref));
  return v_id;
end;
$$;

revoke all on function public.record_mailbox_collection_progress(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.record_mailbox_oauth_state(uuid, text, text, text[]) from public, anon, authenticated;
revoke all on function public.add_project_ingestion_mailbox(uuid, text, text) from public, anon, service_role;
grant execute on function public.record_mailbox_collection_progress(uuid, text, text, timestamptz) to service_role;
grant execute on function public.record_mailbox_oauth_state(uuid, text, text, text[]) to service_role;
grant execute on function public.add_project_ingestion_mailbox(uuid, text, text) to authenticated;
