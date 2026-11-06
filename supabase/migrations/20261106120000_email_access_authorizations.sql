-- ============================================================
-- 20261106120000_email_access_authorizations.sql
--
-- NÃO APLICADA EM PRODUÇÃO. Decisão pendente do Administrador (ver docs/autorizacao-acesso-email-preparo.md).
--
-- PROPÓSITO: registrar a AUTORIZAÇÃO INDIVIDUAL de cada colaborador para acesso à sua caixa de e-mail corporativa.
-- Diferente de public.email_access_authorizations (20261029120000: autorização POR OBRA), aqui o titular é a PESSOA.
--
-- Modelo (histórico imutável, só INSERT):
--   collaborator_email_access_requests    a solicitação enviada (colaborador, caixa, finalidade, versão do texto, prazos)
--   collaborator_email_access_replies     cada resposta recebida, ORIGINAL preservada (message_id, in_reply_to, references,
--                                         remetente, hash SHA-256 do corpo), com a classificação e se vale (vinculada)
--   collaborator_email_access_technical   confirmação técnica (OAuth/Workspace) — distinta do aceite
--   collaborator_email_access_revocations revogação = nova linha; nunca apaga nem altera a solicitação
--
-- Regras:
--   - Aceite por e-mail NÃO é autorização técnica; a coleta exige as duas e ausência de revogação/expiração
--     (regra aplicada em apps/web/lib/email-access-authorizations; aqui o banco só guarda os fatos).
--   - RLS: somente Administrador (public.is_any_project_admin()) lê e insere; anon/authenticated comuns não têm acesso;
--     service_role grava (rotina server-side). Ninguém atualiza nem apaga: triggers bloqueiam UPDATE/DELETE
--     inclusive para service_role.
--   - Sem RPC SECURITY DEFINER: o INSERT direto sob RLS basta. Aditiva e idempotente; não apaga dados.
-- ============================================================

create table if not exists public.collaborator_email_access_requests (
  id uuid primary key default gen_random_uuid(),
  collaborator_user_id uuid references public.profiles (id) on delete restrict,
  collaborator_email text not null check (collaborator_email = lower(btrim(collaborator_email)) and char_length(collaborator_email) between 3 and 320),
  mailbox text not null check (mailbox = lower(btrim(mailbox)) and char_length(mailbox) between 3 and 320),
  folders text[] not null default '{}',
  purpose text not null check (char_length(purpose) between 5 and 1000),
  text_version text not null check (char_length(text_version) between 1 and 40),
  request_message_id text not null check (char_length(btrim(request_message_id)) > 0),
  requested_by_user_id uuid references public.profiles (id) on delete restrict,
  requested_at timestamptz not null default now(),
  request_expires_at timestamptz not null,
  access_duration_days integer not null check (access_duration_days between 1 and 730),
  check (request_expires_at > requested_at)
);

create unique index if not exists collaborator_email_access_requests_msgid_uidx
  on public.collaborator_email_access_requests (lower(btrim(request_message_id)));
create index if not exists collaborator_email_access_requests_collab_idx
  on public.collaborator_email_access_requests (collaborator_email, requested_at desc);

create table if not exists public.collaborator_email_access_replies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.collaborator_email_access_requests (id) on delete restrict,
  message_id text not null check (char_length(btrim(message_id)) > 0),
  in_reply_to text,
  references_header text[] not null default '{}',
  from_email text not null check (char_length(from_email) > 0),
  headers jsonb not null default '{}'::jsonb,
  body_sha256 text not null check (body_sha256 ~ '^[0-9a-f]{64}$'),
  received_at timestamptz not null,
  classification text not null check (classification in ('AUTORIZO', 'NAO_AUTORIZO', 'PENDENTE_REVISAO')),
  linked_to_request boolean not null,
  link_reason text,
  recorded_at timestamptz not null default now(),
  check (not linked_to_request or request_id is not null)
);

create unique index if not exists collaborator_email_access_replies_msgid_uidx
  on public.collaborator_email_access_replies (lower(btrim(message_id)));
create index if not exists collaborator_email_access_replies_request_idx
  on public.collaborator_email_access_replies (request_id, received_at);

create table if not exists public.collaborator_email_access_technical (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.collaborator_email_access_requests (id) on delete restrict,
  authorization_kind text not null default 'OAUTH_CONFIRMADA' check (authorization_kind = 'OAUTH_CONFIRMADA'),
  confirmed_by_user_id uuid references public.profiles (id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  note text check (note is null or char_length(note) <= 500)
);

create unique index if not exists collaborator_email_access_technical_request_uidx
  on public.collaborator_email_access_technical (request_id);

create table if not exists public.collaborator_email_access_revocations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.collaborator_email_access_requests (id) on delete restrict,
  revoked_by_user_id uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz not null default now(),
  reason text not null check (char_length(reason) between 3 and 500)
);

create unique index if not exists collaborator_email_access_revocations_request_uidx
  on public.collaborator_email_access_revocations (request_id);

-- histórico imutável: nenhum UPDATE/DELETE, nem para service_role
create or replace function public.collaborator_email_access_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'COLLABORATOR_EMAIL_ACCESS_IMMUTABLE: % em % não é permitido; registre um novo fato.', tg_op, tg_table_name;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'collaborator_email_access_requests',
    'collaborator_email_access_replies',
    'collaborator_email_access_technical',
    'collaborator_email_access_revocations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', t || '_immutable', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.collaborator_email_access_immutable()', t || '_immutable', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.collaborator_email_access_immutable()', t || '_no_truncate', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert on public.%I to authenticated', t);
    execute format('grant select, insert on public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_any_project_admin())', t || '_admin_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_any_project_admin())', t || '_admin_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_service_all', t);
    execute format('create policy %I on public.%I for all to service_role using (true) with check (true)', t || '_service_all', t);
  end loop;
end
$$;

comment on table public.collaborator_email_access_requests is
  'Solicitação INDIVIDUAL de acesso à caixa de e-mail do colaborador. Imutável; estado derivado das tabelas filhas. Aceite por e-mail não é autorização técnica.';
comment on table public.collaborator_email_access_replies is
  'Respostas originais (message_id, in_reply_to, references, remetente, hash do corpo) preservadas; vale só se linked_to_request.';
