-- ============================================================
-- 20261123400000_f3e_persistence_model.sql
--
-- FASE 3 / Agente E — modelo de PERSISTÊNCIA de:
--   (1) pareceres de cobertura de garantia (quality_warranty_coverage_opinions) — APPEND-ONLY, versionados;
--   (2) checklist RCC de 10 perguntas (insurance_rcc_checklists + insurance_rcc_checklist_items) — APPEND-ONLY, versionado;
--   (3) sujeitos ESPERADOS por apólice (insurance_expected_subjects) — APPEND-ONLY, versionado por (apólice, papel).
--
-- Princípios (CLAUDE.md 11/12): fonte rastreável em toda resposta/item; nada é sobrescrito (cada reavaliação é nova versão que
-- aponta para a anterior em supersedes_id); nada é apagado (triggers bloqueiam UPDATE/DELETE/TRUNCATE, inclusive superusuário);
-- RLS por projeto com leitura pelos wrappers centrais (quality_can_read / insurance_access READ) e ZERO escrita direta
-- (toda gravação passa pelas RPCs de 20261123401000 / 20261123402000, que auditam na mesma transação).
-- Sem dado => NULL / SEM DADOS (nunca zero, nunca "não coberto"). Idempotente. Nenhuma migration existente é alterada.
-- ============================================================

-- ---------- Bloqueio de mutação (reuso: insurance_block_mutation já existe em 20261122200000) ----------
create or replace function public.f3e_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'F3E_NO_DELETE: % não admite exclusão (preservação de evidências)', tg_table_name;
  end if;
  raise exception 'F3E_APPEND_ONLY: % é append-only (cada reavaliação é uma nova versão)', tg_table_name;
end;
$$;

-- ============================================================
-- (1) Pareceres de cobertura de garantia
-- ============================================================
create table if not exists public.quality_warranty_coverage_opinions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  warranty_case_id uuid not null,
  version_no integer not null check (version_no >= 1),
  -- versão do código/lista de itens + conjunto de referências usado na avaliação (reprodutibilidade)
  engine_version text not null check (char_length(btrim(engine_version)) > 0),
  -- os 16 itens, na ordem do Bloco 5.3: [{key,status,value,evidence}] (evidence = FONTE; obrigatória se PREENCHIDO)
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) = 16),
  signals jsonb not null check (jsonb_typeof(signals) = 'object'),
  conclusion text not null check (conclusion in (
    'POTENCIALMENTE COBERTO', 'POTENCIALMENTE NÃO COBERTO', 'COBERTURA CONDICIONADA', 'INFORMAÇÕES INSUFICIENTES')),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  missing jsonb not null default '[]'::jsonb check (jsonb_typeof(missing) = 'array'),
  legal_controversy boolean not null,
  -- encaminhamento ao responsável humano (derivado: = legal_controversy)
  route_to_human boolean not null,
  -- ids + estado de verificação das referências no momento da avaliação: [{id,verification,isSecondary}]
  references_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(references_snapshot) = 'array'),
  references_version text,
  -- QUEM derivou a conclusão: o servidor TS recalculou e o banco REVERIFICOU (função quality_warranty_coverage_check)
  derived_by text not null default 'SERVER_TS_SQL_VERIFIED' check (derived_by = 'SERVER_TS_SQL_VERIFIED'),
  note text,
  supersedes_id uuid references public.quality_warranty_coverage_opinions (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (warranty_case_id, version_no),
  unique (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id) on delete restrict,
  check (route_to_human = legal_controversy),
  check ((version_no = 1) = (supersedes_id is null))
);
create index if not exists quality_warranty_opinions_case_idx on public.quality_warranty_coverage_opinions (warranty_case_id, version_no desc);
create index if not exists quality_warranty_opinions_project_idx on public.quality_warranty_coverage_opinions (project_id, created_at desc);

-- ============================================================
-- (2) Checklist RCC (cabeçalho versionado + 10 itens por versão)
-- ============================================================
create table if not exists public.insurance_rcc_checklists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  claim_id uuid references public.insurance_claims (id) on delete restrict,
  version_no integer not null check (version_no >= 1),
  note text,
  supersedes_id uuid references public.insurance_rcc_checklists (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  check ((version_no = 1) = (supersedes_id is null))
);
-- uma sequência de versões por (apólice, evento opcional)
create unique index if not exists insurance_rcc_checklists_scope_version_uq
  on public.insurance_rcc_checklists (project_id, policy_id, coalesce(claim_id, '00000000-0000-0000-0000-000000000000'::uuid), version_no);
create index if not exists insurance_rcc_checklists_policy_idx on public.insurance_rcc_checklists (policy_id, created_at desc);

create table if not exists public.insurance_rcc_checklist_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  checklist_id uuid not null references public.insurance_rcc_checklists (id) on delete restrict,
  question_key text not null check (question_key in (
    'CAUSADOR', 'VITIMA', 'ABRANGENCIA_SEGURADOS', 'OBJETO', 'BENS_TERCEIROS_X_PROPRIA_OBRA',
    'EXCLUSOES', 'SUBLIMITES', 'FRANQUIAS', 'ENDOSSOS', 'AVISO')),
  -- NULL = SEM DADOS (nunca presumido). Resposta exige FONTE (documento ou referência de cláusula).
  answer text check (answer is null or char_length(btrim(answer)) > 0),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  source_page text,
  property_scope text check (property_scope is null or property_scope in ('BENS_TERCEIROS', 'PROPRIA_OBRA', 'AMBOS', 'INDEFINIDO')),
  created_at timestamptz not null default now(),
  unique (checklist_id, question_key),
  foreign key (checklist_id, project_id) references public.insurance_rcc_checklists (id, project_id) on delete restrict,
  -- resposta SEM fonte não é gravada (o checklist puro a trataria só como aviso; aqui a fonte é obrigatória)
  check (answer is null or source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null),
  check (answer is not null or (source_document_id is null and nullif(btrim(coalesce(source_ref, '')), '') is null and property_scope is null)),
  check (property_scope is null or question_key = 'BENS_TERCEIROS_X_PROPRIA_OBRA')
);
create index if not exists insurance_rcc_items_checklist_idx on public.insurance_rcc_checklist_items (checklist_id);

-- ============================================================
-- (3) Sujeitos ESPERADOS por apólice (segurado/beneficiário/titular esperados + a fonte da expectativa)
-- ============================================================
create table if not exists public.insurance_expected_subjects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  party_role text not null check (party_role in (
    'SEGURADO', 'BENEFICIARIO', 'PROPRIETARIO_FINAL', 'TOMADOR', 'TITULAR_INTERESSE_SEGURAVEL')),
  -- ESPERADO = a fonte indica que a pessoa/empresa deveria figurar; NAO_ESPERADO = a fonte indica que NÃO há esse sujeito
  expectation text not null check (expectation in ('ESPERADO', 'NAO_ESPERADO')),
  expected_name text,
  expected_tax_id text,
  source_kind text not null check (source_kind in ('CONTRATO', 'EDITAL', 'INSTRUCAO_CLIENTE', 'OUTRO')),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  version_no integer not null check (version_no >= 1),
  note text,
  supersedes_id uuid references public.insurance_expected_subjects (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (policy_id, party_role, version_no),
  unique (id, project_id),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null),
  check (expectation = 'NAO_ESPERADO' or nullif(btrim(coalesce(expected_name, '')), '') is not null
         or nullif(btrim(coalesce(expected_tax_id, '')), '') is not null),
  check (expectation = 'ESPERADO' or (nullif(btrim(coalesce(expected_name, '')), '') is null and nullif(btrim(coalesce(expected_tax_id, '')), '') is null)),
  check ((version_no = 1) = (supersedes_id is null))
);
create index if not exists insurance_expected_subjects_policy_idx on public.insurance_expected_subjects (policy_id, party_role, version_no desc);

-- ============================================================
-- Triggers: append-only (UPDATE/DELETE/TRUNCATE bloqueados, também para superusuário)
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['quality_warranty_coverage_opinions', 'insurance_rcc_checklists', 'insurance_rcc_checklist_items', 'insurance_expected_subjects'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.f3e_block_mutation()', t || '_append_only', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.f3e_block_mutation()', t || '_no_truncate', t);
  end loop;
end $$;

-- ============================================================
-- RLS: leitura por membro do projeto (wrappers centrais); ZERO escrita direta
-- ============================================================
alter table public.quality_warranty_coverage_opinions enable row level security;
drop policy if exists quality_warranty_opinions_select on public.quality_warranty_coverage_opinions;
create policy quality_warranty_opinions_select on public.quality_warranty_coverage_opinions
  for select to authenticated using (public.quality_can_read(project_id));
revoke all on public.quality_warranty_coverage_opinions from public, anon, authenticated;
grant select on public.quality_warranty_coverage_opinions to authenticated;

do $$
declare t text;
begin
  foreach t in array array['insurance_rcc_checklists', 'insurance_rcc_checklist_items', 'insurance_expected_subjects'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_members', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.insurance_access(project_id, ''READ''))', t || '_select_members', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

comment on table public.quality_warranty_coverage_opinions is
  'Pareceres de cobertura de garantia (16 itens + sinais + conclusão DERIVADA). Append-only; escrita só por quality_warranty_opinion_save. NÃO é parecer jurídico: apoio à decisão humana.';
comment on table public.insurance_rcc_checklists is 'Checklist RCC (10 perguntas do Bloco 10) versionado por apólice/evento. Append-only; escrita só por insurance_rcc_checklist_save.';
comment on table public.insurance_expected_subjects is 'Segurado/beneficiário/titular ESPERADOS por apólice, com a fonte da expectativa. Append-only; escrita só por insurance_expected_subject_save.';
