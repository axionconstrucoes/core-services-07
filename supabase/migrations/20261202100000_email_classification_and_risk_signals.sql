-- 20261202100000_email_classification_and_risk_signals.sql
-- Fase 5 / Frente B: classificação de mensagens de e-mail (vínculo a projeto, oficialidade, parte, checagem de autoridade)
-- e SINAIS DE RISCO por pilar derivados de e-mails. Motor determinístico por regra (rule_version); nenhuma IA real.
--   - INDÍCIO não é inadimplemento comprovado: email_risk_signals.is_indication default true, confirmed default false.
--   - A mensagem original (public.emails) nunca é alterada; aqui só se registra a análise derivada, com trecho de evidência e referência.
--   - Escrita somente por service_role (job/servidor); usuários autenticados só LEEM, por membership do projeto (RLS).
--   - Idempotente por mensagem + versão da regra (unique) e por (classificação, pilar, tipo de sinal).
-- Não depende de tabelas da Frente C (organization_id é uuid solto, sem FK, para não acoplar a ordem de implantação).
-- Reversível: supabase/rollbacks/20261202100000_email_classification_and_risk_signals.rollback.sql.

create table if not exists public.email_message_classifications (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails (id) on delete cascade,
  project_id uuid null references public.projects (id) on delete cascade,
  project_link_status text not null
    check (project_link_status in ('LINKED', 'CANDIDATE', 'UNLINKED', 'AMBIGUOUS')),
  project_link_basis text not null default '',
  officiality text not null
    check (officiality in ('OFICIAL_CLIENTE', 'OFICIAL_GERENCIADORA', 'REPRESENTANTE_DELEGADO',
                           'FORNECEDOR_SUBCONTRATADA', 'INTERNA', 'EXTERNA_NAO_CLASSIFICADA')),
  party_kind text not null default 'DESCONHECIDA',
  organization_id uuid null,
  authority_check text not null
    check (authority_check in ('WITHIN_DELEGATION', 'NEEDS_CLIENT_APPROVAL', 'FORMAL_CHANGE',
                               'POSSIBLY_OUT_OF_SCOPE', 'NOT_APPLICABLE')),
  clause_ref text null,
  pillars text[] not null default '{}',
  rule_version text not null,
  analyzed_at timestamptz not null default now(),
  status text not null check (status in ('ANALYZED', 'NO_INDICATION', 'CANNOT_ANALYZE')),
  cannot_reason text null,
  injection_flag boolean not null default false,
  -- projeto vinculado exige status LINKED/CANDIDATE; sem projeto nunca é LINKED
  check (project_link_status <> 'LINKED' or project_id is not null),
  check (status <> 'CANNOT_ANALYZE' or cannot_reason is not null),
  constraint email_message_classifications_email_rule_key unique (email_id, rule_version),
  constraint email_message_classifications_id_project_key unique (id, project_id)
);

create index if not exists email_message_classifications_project_idx
  on public.email_message_classifications (project_id, analyzed_at desc);

create table if not exists public.email_risk_signals (
  id uuid primary key default gen_random_uuid(),
  email_id uuid not null references public.emails (id) on delete cascade,
  classification_id uuid not null references public.email_message_classifications (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  pillar text not null check (pillar in ('PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE', 'JURIDICO')),
  signal_kind text not null,
  summary text not null,
  evidence_excerpt text not null,
  evidence_ref text not null,
  is_indication boolean not null default true,
  confirmed boolean not null default false,
  quantified_impact jsonb null,
  alert_case_id uuid null,
  created_at timestamptz not null default now(),
  -- confirmed nasce false: confirmação é decisão humana posterior
  constraint email_risk_signals_dedupe_key unique (classification_id, pillar, signal_kind)
);

create index if not exists email_risk_signals_project_idx
  on public.email_risk_signals (project_id, created_at desc);
create index if not exists email_risk_signals_email_idx
  on public.email_risk_signals (email_id);

alter table public.email_message_classifications enable row level security;
alter table public.email_risk_signals enable row level security;

revoke all on public.email_message_classifications from public, anon;
revoke all on public.email_risk_signals from public, anon;
revoke insert, update, delete, truncate on public.email_message_classifications from authenticated;
revoke insert, update, delete, truncate on public.email_risk_signals from authenticated;
grant select on public.email_message_classifications to authenticated;
grant select on public.email_risk_signals to authenticated;

drop policy if exists "email_message_classifications_select_members" on public.email_message_classifications;
create policy "email_message_classifications_select_members"
  on public.email_message_classifications for select to authenticated
  using (project_id is not null and public.is_project_member(project_id));

drop policy if exists "email_risk_signals_select_members" on public.email_risk_signals;
create policy "email_risk_signals_select_members"
  on public.email_risk_signals for select to authenticated
  using (public.is_project_member(project_id));

-- Escrita pelo servidor (service_role). Sinal só pode apontar para classificação do MESMO projeto.
create or replace function public.email_risk_signal_project_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project uuid;
begin
  select c.project_id into v_project from public.email_message_classifications c where c.id = new.classification_id;
  if v_project is null or v_project <> new.project_id then
    raise exception 'email_risk_signals: projeto do sinal difere do projeto da classificação (fail-closed)' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.email_risk_signal_project_guard() from public, anon, authenticated;

drop trigger if exists email_risk_signals_project_guard on public.email_risk_signals;
create trigger email_risk_signals_project_guard
  before insert or update of classification_id, project_id on public.email_risk_signals
  for each row execute function public.email_risk_signal_project_guard();

comment on table public.email_message_classifications is
  'Fase 5/B: análise determinística de uma mensagem (vínculo de projeto, oficialidade, autoridade). Derivada; a mensagem original em emails permanece intacta.';
comment on table public.email_risk_signals is
  'Fase 5/B: INDÍCIOS de risco por pilar extraídos de e-mails, com trecho e referência de evidência. Indício não é fato comprovado; confirmação é humana.';
