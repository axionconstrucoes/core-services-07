-- ============================================================
-- 20261201100000_email_universal_monitoring.sql
-- Fase 5 / A — monitoramento universal de e-mail e reconciliação.
--
-- Escopo (somente ESTRUTURA; nenhum dado é lido, apagado ou reescrito, nenhuma mensagem é classificada aqui):
--   1) public.emails ganha participantes completos (cc/bcc), domínios envolvidos, chave canônica entre caixas e metadados
--      de anexos; o provedor aceita também 'OUTLOOK' (Microsoft Graph). Colunas existentes e o índice único do Gmail permanecem.
--   2) email_sync_cursors: cursor por projeto + provedor + caixa (somente service_role).
--   3) email_message_sources: em quais caixas a MESMA mensagem foi vista (dedupe entre caixas: uma linha em emails, N origens).
--   4) email_sync_reconciliation_runs: universo x elegível x processado x excluído x falho, com lacunas (append-only).
--   5) email_ingestion_exclusions: motivo de cada mensagem não processada (append-only).
-- A classificação de risco é da Frente B; esta migration só entrega o insumo (emails + exclusões).
-- Idempotente. Rollback: supabase/rollbacks/20261201100000_email_universal_monitoring.rollback.sql
-- ============================================================

-- ---------- 1) public.emails ----------
alter table public.emails
  add column if not exists cc_addresses text[] not null default '{}',
  add column if not exists bcc_addresses text[] not null default '{}',
  add column if not exists involved_domains text[] not null default '{}',
  add column if not exists canonical_message_key text,
  add column if not exists attachments_meta jsonb not null default '[]'::jsonb;

comment on column public.emails.cc_addresses is 'Fase 5/A: endereços em Cc (minúsculos). Vazio quando o provedor não informou.';
comment on column public.emails.bcc_addresses is 'Fase 5/A: endereços em Bcc visíveis na caixa lida (o Bcc só aparece em mensagens enviadas pela própria caixa).';
comment on column public.emails.involved_domains is 'Fase 5/A: domínios distintos de from/to/cc/bcc, minúsculos.';
comment on column public.emails.canonical_message_key is 'Fase 5/A: chave canônica da mensagem entre caixas (Message-ID RFC 5322 normalizado, ou provider:id quando ausente). Mesma chave em duas caixas = mesma mensagem; não duplica risco.';
comment on column public.emails.attachments_meta is 'Fase 5/A: metadados dos anexos [{filename,mime,size,status}] com status AVAILABLE|UNAVAILABLE; anexo indisponível não descarta a mensagem.';

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.emails'::regclass and conname = 'emails_provider_check') then
    alter table public.emails drop constraint emails_provider_check;
  end if;
  alter table public.emails
    add constraint emails_provider_check check (provider is null or provider in ('GMAIL', 'OUTLOOK'));
end $$;

create unique index if not exists emails_outlook_mailbox_message_unique_idx
  on public.emails (project_id, provider, mailbox_address, provider_message_id)
  where provider = 'OUTLOOK' and provider_message_id is not null;

create index if not exists emails_project_canonical_key_idx
  on public.emails (project_id, canonical_message_key)
  where canonical_message_key is not null;

create index if not exists emails_involved_domains_gin_idx
  on public.emails using gin (involved_domains);

-- ---------- 2) cursores por caixa ----------
create table if not exists public.email_sync_cursors (
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null check (provider in ('GMAIL', 'OUTLOOK')),
  mailbox text not null check (mailbox = lower(mailbox) and mailbox like '%@%'),
  cursor jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (project_id, provider, mailbox)
);
comment on table public.email_sync_cursors is 'Fase 5/A: cursor de leitura por projeto + provedor + caixa. Só o coletor (service_role) lê e grava.';

-- ---------- 3) origens da mesma mensagem (dedupe entre caixas) ----------
create table if not exists public.email_message_sources (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  provider text not null check (provider in ('GMAIL', 'OUTLOOK')),
  mailbox text not null check (mailbox = lower(mailbox)),
  provider_message_id text not null,
  first_seen_at timestamptz not null default now(),
  unique (project_id, provider, mailbox, provider_message_id)
);
create index if not exists email_message_sources_email_idx on public.email_message_sources (email_id);
comment on table public.email_message_sources is 'Fase 5/A: caixas em que a mesma mensagem (mesma canonical_message_key) foi vista. Append-only.';

-- ---------- 4) execuções de reconciliação ----------
create table if not exists public.email_sync_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('GMAIL', 'OUTLOOK')),
  mailbox text not null check (mailbox = lower(mailbox)),
  project_id uuid references public.projects (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  universe_count integer not null check (universe_count >= 0),
  eligible_count integer not null check (eligible_count >= 0),
  processed_count integer not null check (processed_count >= 0),
  excluded_count integer not null check (excluded_count >= 0),
  failed_count integer not null check (failed_count >= 0),
  gaps jsonb not null default '[]'::jsonb,
  status text not null check (status in ('COMPLETED', 'PARTIAL', 'FAILED', 'DRY_RUN')),
  mode text not null default 'APPLY' check (mode in ('APPLY', 'DRY_RUN')),
  rule_id text,
  created_at timestamptz not null default now(),
  constraint email_sync_runs_period_check check (period_end >= period_start),
  -- Identidade de reconciliação: cada mensagem do universo termina processada, excluída (com motivo) ou falha.
  constraint email_sync_runs_identity_check check (universe_count = processed_count + excluded_count + failed_count),
  constraint email_sync_runs_eligible_check check (eligible_count <= universe_count and processed_count <= eligible_count)
);
create index if not exists email_sync_runs_project_idx on public.email_sync_reconciliation_runs (project_id, created_at desc);
comment on table public.email_sync_reconciliation_runs is 'Fase 5/A: reconciliação universo x elegível x processado por execução. universe = processed + excluded + failed. Append-only.';

-- ---------- 5) exclusões ----------
create table if not exists public.email_ingestion_exclusions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.email_sync_reconciliation_runs (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  provider text not null check (provider in ('GMAIL', 'OUTLOOK')),
  provider_message_id text not null,
  reason text not null check (reason in (
    'RULE_NOT_MATCHED', 'NO_PARTICIPANTS', 'OUT_OF_PERIOD', 'REMOVED_AT_PROVIDER', 'DUPLICATE_CROSS_MAILBOX',
    'FETCH_FAILED', 'INSERT_FAILED', 'ATTACHMENT_UNAVAILABLE', 'MAILBOX_NOT_AUTHORIZED'
  )),
  detail text,
  -- true = a mensagem FOI ingerida e só o anexo (ou outro detalhe) falhou; não conta em excluded_count.
  message_ingested boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists email_ingestion_exclusions_run_idx on public.email_ingestion_exclusions (run_id);
create index if not exists email_ingestion_exclusions_project_idx on public.email_ingestion_exclusions (project_id, created_at desc);
comment on table public.email_ingestion_exclusions is 'Fase 5/A: motivo de cada mensagem não processada (ou com anexo indisponível). Append-only; não guarda conteúdo da mensagem.';

-- ---------- append-only ----------
create or replace function public.email_ingestion_append_only_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'EMAIL_INGESTION_APPEND_ONLY: % é append-only (reconciliação e exclusões são evidência)', tg_table_name;
end;
$$;

drop trigger if exists email_sync_runs_append_only on public.email_sync_reconciliation_runs;
create trigger email_sync_runs_append_only before update or delete on public.email_sync_reconciliation_runs
  for each row execute function public.email_ingestion_append_only_guard();
drop trigger if exists email_ingestion_exclusions_append_only on public.email_ingestion_exclusions;
create trigger email_ingestion_exclusions_append_only before update or delete on public.email_ingestion_exclusions
  for each row execute function public.email_ingestion_append_only_guard();
drop trigger if exists email_message_sources_append_only on public.email_message_sources;
create trigger email_message_sources_append_only before update on public.email_message_sources
  for each row execute function public.email_ingestion_append_only_guard();

-- ---------- RLS: leitura só por GESTOR/ADMIN do projeto (endereços de caixa são dado pessoal); escrita só service_role ----------
alter table public.email_sync_cursors enable row level security;
alter table public.email_message_sources enable row level security;
alter table public.email_sync_reconciliation_runs enable row level security;
alter table public.email_ingestion_exclusions enable row level security;

revoke all on public.email_sync_cursors, public.email_message_sources, public.email_sync_reconciliation_runs, public.email_ingestion_exclusions from anon, authenticated;
grant select on public.email_message_sources, public.email_sync_reconciliation_runs, public.email_ingestion_exclusions to authenticated;
grant select, insert, update, delete on public.email_sync_cursors, public.email_message_sources, public.email_sync_reconciliation_runs, public.email_ingestion_exclusions to service_role;

drop policy if exists email_message_sources_select_managers on public.email_message_sources;
create policy email_message_sources_select_managers on public.email_message_sources
  for select to authenticated using (public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
drop policy if exists email_sync_runs_select_managers on public.email_sync_reconciliation_runs;
create policy email_sync_runs_select_managers on public.email_sync_reconciliation_runs
  for select to authenticated using (project_id is not null and public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
drop policy if exists email_ingestion_exclusions_select_managers on public.email_ingestion_exclusions;
create policy email_ingestion_exclusions_select_managers on public.email_ingestion_exclusions
  for select to authenticated using (project_id is not null and public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
