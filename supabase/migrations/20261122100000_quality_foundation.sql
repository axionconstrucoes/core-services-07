-- ============================================================
-- 20261122100000_quality_foundation.sql
--
-- Pilar QUALIDADE (fase 1 — modelo de dados, sem telas).
--
-- Tabelas (todas com RLS por projeto; isolamento também por FK composta (id, project_id)):
--   quality_requirements            requisitos técnicos
--   quality_ncrs                    RNC (relatório de não conformidade) — máquina de estados via RPC
--   quality_evidence                evidências ligadas à FONTE ORIGINAL (nunca alteram a fonte)
--   quality_inspections             inspeções
--   quality_customer_complaints     reclamações de clientes
--   quality_tests                   ensaios e laudos
--   quality_corrective_actions      ações corretivas / preventivas (CAPA)
--   quality_warranty_cases          assistência técnica pós-entrega e garantias
--   quality_warranty_maintenance    histórico de manutenção (com/sem comprovante)
--   quality_warranty_surveys        vistorias
--   quality_warranty_repairs        reparos / reincidências
--   quality_effectiveness_verifications  verificação de eficácia (condição de encerramento)
--   quality_recurrences             recorrências
--   quality_nonquality_costs        custos de não qualidade
--   quality_consequences            consequências por pilar (PRAZO/CUSTO/SEGURANCA/QUALIDADE)
--   quality_state_transitions       catálogo da máquina de estados (espelhado em apps/web/lib/quality)
--   quality_state_events            histórico de transições (append-only)
--   quality_counters                numeração por projeto
--
-- Regras de segurança:
--   * quality_ncrs e quality_warranty_cases NÃO aceitam INSERT/UPDATE de estado direto: só RPC (migration seguinte).
--   * Nenhuma tabela aceita DELETE por authenticated (evidência/dado importante nunca é apagado).
--   * Toda mutação gera linha em audit_log_entries (append-only, já existente) via trigger.
--   * Concorrência otimista: row_version incrementa a cada UPDATE real.
-- Papéis (padrão ESG existente): ler = membro ACTIVE; registrar = ADMINISTRADOR/GERENTE/GESTOR/COLABORADOR;
-- gerir (decidir/encerrar/reabrir) = ADMINISTRADOR/GERENTE/GESTOR. LEITURA só consulta.
-- ============================================================

-- ---------- helpers de papel ----------
create or replace function public.quality_role_for(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pm.permission
  from public.project_memberships pm
  where pm.project_id = p_project_id and pm.user_id = auth.uid() and pm.status = 'ACTIVE'
  limit 1;
$$;

create or replace function public.quality_can_read(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.quality_role_for(p_project_id) is not null, false);
$$;

create or replace function public.quality_can_register(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.quality_role_for(p_project_id) in ('ADMINISTRADOR', 'GERENTE', 'GESTOR', 'COLABORADOR'), false);
$$;

create or replace function public.quality_can_manage(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.quality_role_for(p_project_id) in ('ADMINISTRADOR', 'GERENTE', 'GESTOR'), false);
$$;

revoke all on function public.quality_role_for(uuid), public.quality_can_read(uuid),
  public.quality_can_register(uuid), public.quality_can_manage(uuid) from public, anon;
grant execute on function public.quality_role_for(uuid), public.quality_can_read(uuid),
  public.quality_can_register(uuid), public.quality_can_manage(uuid) to authenticated, service_role;

-- ---------- numeração por projeto ----------
create table if not exists public.quality_counters (
  project_id uuid not null references public.projects (id) on delete restrict,
  kind text not null check (kind in ('RNC', 'GAR', 'INS', 'REC', 'ENS', 'REQ', 'CAPA')),
  last_value integer not null default 0,
  primary key (project_id, kind)
);

create or replace function public.quality_next_code(p_project_id uuid, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer;
begin
  insert into public.quality_counters (project_id, kind, last_value) values (p_project_id, p_kind, 1)
  on conflict (project_id, kind) do update set last_value = public.quality_counters.last_value + 1
  returning last_value into v_n;
  return p_kind || '-' || lpad(v_n::text, 4, '0');
end;
$$;
revoke all on function public.quality_next_code(uuid, text) from public, anon, authenticated;

-- ---------- requisitos técnicos ----------
create table if not exists public.quality_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  code text not null,
  title text not null check (char_length(title) between 3 and 300),
  description text,
  source_ref text not null check (char_length(source_ref) between 1 and 1000),
  source_url text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (project_id, code),
  unique (id, project_id)
);

-- ---------- RNC ----------
create table if not exists public.quality_ncrs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  code text not null,
  title text not null check (char_length(title) between 3 and 300),
  description text,
  state text not null default 'DETECTADA' check (state in (
    'DETECTADA', 'TRIAGEM', 'INVESTIGACAO', 'CONFIRMADA', 'PLANO_ACAO', 'CORRECAO', 'VERIFICACAO',
    'ENCERRADA', 'NAO_CONFIRMADA', 'DUPLICADA', 'CANCELADA', 'REABERTA')),
  origin_type text not null check (origin_type in (
    'SSMA_FOTO', 'EMAIL', 'DIARIO_OBRA', 'FISCALIZACAO', 'INSPECAO', 'ENSAIO_LAUDO', 'DOCUMENTO',
    'RECLAMACAO_CLIENTE', 'GARANTIA', 'MANUAL')),
  origin_ref text not null check (char_length(origin_ref) between 1 and 1000),
  origin_key text not null,
  origin_url text,
  requirement_id uuid,
  duplicate_of_id uuid,
  responsible_user_id uuid references public.profiles (id),
  due_date date,
  root_cause text,
  criticality text not null default 'SEM_DADOS' check (criticality in ('SEM_DADOS', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  reopen_count integer not null default 0,
  state_justification text,
  closed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (project_id, code),
  unique (id, project_id),
  foreign key (requirement_id, project_id) references public.quality_requirements (id, project_id),
  foreign key (duplicate_of_id, project_id) references public.quality_ncrs (id, project_id),
  check (duplicate_of_id is null or duplicate_of_id <> id)
);
-- DEDUPE Qualidade x SSMA (e demais origens): a mesma origem não gera duas RNC ativas no projeto.
create unique index if not exists quality_ncrs_origin_active_uq
  on public.quality_ncrs (project_id, origin_key)
  where state not in ('DUPLICADA', 'CANCELADA');
create index if not exists quality_ncrs_project_state_idx on public.quality_ncrs (project_id, state);

-- ---------- garantias / assistência técnica ----------
create table if not exists public.quality_warranty_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  code text not null,
  contract_ref text,
  service_system text not null check (char_length(service_system) between 2 and 200),
  state text not null default 'ABERTA' check (state in (
    'ABERTA', 'EM_VISTORIA', 'EM_ANALISE', 'COBERTA', 'NAO_COBERTA', 'EM_REPARO', 'REPARADA',
    'VERIFICADA', 'ENCERRADA', 'REABERTA', 'CANCELADA')),
  delivered_at date,
  discovered_at date,
  communicated_at date,
  warranty_terms text,
  warranty_terms_ref text,
  customer_complaint text,
  defect_description text not null check (char_length(defect_description) between 3 and 4000),
  cause_category text not null default 'A_DEFINIR' check (cause_category in (
    'A_DEFINIR', 'VICIO_OCULTO', 'SOLIDEZ_SEGURANCA', 'EXECUCAO', 'MATERIAL', 'PROJETO', 'MAU_USO',
    'DESGASTE_NORMAL', 'MANUTENCAO_AUSENTE', 'OUTRA')),
  cause_notes text,
  hidden_defect boolean not null default false,
  solidity_safety boolean not null default false,
  responsible_user_id uuid references public.profiles (id),
  due_date date,
  estimated_cost numeric(14, 2) check (estimated_cost is null or estimated_cost >= 0),
  actual_cost numeric(14, 2) check (actual_cost is null or actual_cost >= 0),
  supplier_name text,
  supplier_warranty_until date,
  builder_warranty_until date,
  origin_type text not null default 'MANUAL' check (origin_type in (
    'EMAIL', 'RECLAMACAO_CLIENTE', 'DOCUMENTO', 'DIARIO_OBRA', 'INSPECAO', 'MANUAL')),
  origin_ref text,
  ncr_id uuid,
  criticality text not null default 'SEM_DADOS' check (criticality in ('SEM_DADOS', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  accepted_at timestamptz,
  accepted_by_name text,
  state_justification text,
  closed_at timestamptz,
  reopen_count integer not null default 0,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (project_id, code),
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id)
);
create index if not exists quality_warranty_project_state_idx on public.quality_warranty_cases (project_id, state);

-- ---------- reclamações de clientes ----------
create table if not exists public.quality_customer_complaints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  code text not null,
  channel text not null check (channel in ('EMAIL_CLIENTE', 'EMAIL_AXION', 'TELEFONE', 'PORTAL', 'PRESENCIAL', 'OUTRO')),
  received_at timestamptz not null,
  complainant text,
  subject text not null check (char_length(subject) between 3 and 300),
  description text,
  source_ref text not null check (char_length(source_ref) between 1 and 1000),
  source_url text,
  status text not null default 'RECEBIDA' check (status in ('RECEBIDA', 'EM_ANALISE', 'PROCEDENTE', 'IMPROCEDENTE', 'ENCERRADA')),
  ncr_id uuid,
  warranty_case_id uuid,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (project_id, code),
  unique (project_id, channel, source_ref),
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id)
);

-- ---------- inspeções ----------
create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  code text not null,
  title text not null check (char_length(title) between 3 and 300),
  inspection_type text,
  location text,
  planned_at timestamptz,
  performed_at timestamptz,
  result text not null default 'PENDENTE' check (result in ('PENDENTE', 'CONFORME', 'NAO_CONFORME', 'PARCIAL')),
  inspector_user_id uuid references public.profiles (id),
  requirement_id uuid,
  ncr_id uuid,
  notes text,
  source_ref text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (project_id, code),
  unique (id, project_id),
  foreign key (requirement_id, project_id) references public.quality_requirements (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id)
);

-- ---------- ensaios e laudos ----------
create table if not exists public.quality_tests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  code text not null,
  test_type text not null check (char_length(test_type) between 2 and 200),
  laboratory text,
  sample_ref text,
  performed_at timestamptz,
  result text not null default 'PENDENTE' check (result in ('PENDENTE', 'APROVADO', 'REPROVADO', 'INCONCLUSIVO')),
  requirement_id uuid,
  ncr_id uuid,
  report_ref text,
  report_url text,
  notes text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (project_id, code),
  unique (id, project_id),
  foreign key (requirement_id, project_id) references public.quality_requirements (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  -- resultado conclusivo exige laudo/relatório rastreável
  check (result in ('PENDENTE', 'INCONCLUSIVO') or report_ref is not null)
);

-- ---------- evidências ----------
create table if not exists public.quality_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ncr_id uuid,
  warranty_case_id uuid,
  complaint_id uuid,
  inspection_id uuid,
  test_id uuid,
  source_type text not null check (source_type in (
    'SSMA_FOTO', 'EMAIL', 'DIARIO_OBRA', 'FISCALIZACAO', 'INSPECAO', 'ENSAIO_LAUDO', 'DOCUMENTO', 'OUTRO')),
  source_table text,
  source_ref text not null check (char_length(source_ref) between 1 and 1000),
  source_url text,
  description text,
  classification text not null check (classification in ('SUSPEITA', 'INDICIO', 'NC_COMPROVADA', 'RISCO_POTENCIAL')),
  epistemic text not null default 'FATO' check (epistemic in ('FATO', 'INFERENCIA', 'RECOMENDACAO')),
  captured_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  foreign key (complaint_id, project_id) references public.quality_customer_complaints (id, project_id),
  foreign key (inspection_id, project_id) references public.quality_inspections (id, project_id),
  foreign key (test_id, project_id) references public.quality_tests (id, project_id),
  check (num_nonnulls(ncr_id, warranty_case_id, complaint_id, inspection_id, test_id) >= 1)
);
create unique index if not exists quality_evidence_ncr_source_uq
  on public.quality_evidence (ncr_id, source_type, source_ref) where ncr_id is not null;
create unique index if not exists quality_evidence_warranty_source_uq
  on public.quality_evidence (warranty_case_id, source_type, source_ref) where warranty_case_id is not null;
create index if not exists quality_evidence_project_idx on public.quality_evidence (project_id);

-- ---------- ações corretivas / preventivas (CAPA) ----------
create table if not exists public.quality_corrective_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ncr_id uuid,
  warranty_case_id uuid,
  kind text not null check (kind in ('CONTENCAO', 'CORRETIVA', 'PREVENTIVA')),
  description text not null check (char_length(description) between 3 and 4000),
  responsible_user_id uuid references public.profiles (id),
  due_date date,
  status text not null default 'PLANEJADA' check (status in ('PLANEJADA', 'EM_ANDAMENTO', 'EXECUTADA', 'CANCELADA')),
  executed_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  check (num_nonnulls(ncr_id, warranty_case_id) >= 1),
  check (status <> 'EXECUTADA' or executed_at is not null)
);
create index if not exists quality_actions_ncr_idx on public.quality_corrective_actions (ncr_id);

-- ---------- histórico de manutenção / vistorias / reparos (garantia) ----------
create table if not exists public.quality_warranty_maintenance (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  warranty_case_id uuid not null,
  performed_at date,
  description text not null check (char_length(description) between 3 and 2000),
  performed_by text,
  proof_ref text,   -- comprovante (documento/nota/ordem de serviço); NULL = SEM COMPROVANTE
  proof_url text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id)
);

create table if not exists public.quality_warranty_surveys (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  warranty_case_id uuid not null,
  surveyed_at timestamptz not null,
  surveyor_user_id uuid references public.profiles (id),
  findings text not null check (char_length(findings) between 3 and 4000),
  report_ref text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id)
);

create table if not exists public.quality_warranty_repairs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  warranty_case_id uuid not null,
  executed_at timestamptz,
  description text not null check (char_length(description) between 3 and 4000),
  performed_by text,
  estimated_cost numeric(14, 2) check (estimated_cost is null or estimated_cost >= 0),
  actual_cost numeric(14, 2) check (actual_cost is null or actual_cost >= 0),
  is_recurrence boolean not null default false,
  previous_repair_id uuid,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  foreign key (previous_repair_id, project_id) references public.quality_warranty_repairs (id, project_id),
  check (previous_repair_id is null or previous_repair_id <> id),
  check (not is_recurrence or previous_repair_id is not null)
);

-- ---------- verificação de eficácia ----------
create table if not exists public.quality_effectiveness_verifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ncr_id uuid,
  warranty_case_id uuid,
  action_id uuid,
  result text not null check (result in ('EFICAZ', 'INEFICAZ', 'PARCIAL')),
  criteria text not null check (char_length(criteria) between 5 and 2000),
  notes text,
  evidence_id uuid not null,          -- evidência obrigatória
  verified_by uuid not null default auth.uid() references public.profiles (id),
  verified_at timestamptz not null default now(),
  event_seq_at bigint not null default 0,   -- último evento de estado conhecido no momento da verificação
  created_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  foreign key (action_id, project_id) references public.quality_corrective_actions (id, project_id),
  foreign key (evidence_id, project_id) references public.quality_evidence (id, project_id),
  check (num_nonnulls(ncr_id, warranty_case_id) = 1)
);
create index if not exists quality_verif_ncr_idx on public.quality_effectiveness_verifications (ncr_id, created_at desc);
create index if not exists quality_verif_warranty_idx on public.quality_effectiveness_verifications (warranty_case_id, created_at desc);

-- ---------- recorrências ----------
create table if not exists public.quality_recurrences (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ncr_id uuid,
  warranty_case_id uuid,
  related_ncr_id uuid,
  related_warranty_case_id uuid,
  basis text not null check (char_length(basis) between 5 and 2000),
  detected_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  foreign key (related_ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (related_warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  check (num_nonnulls(ncr_id, warranty_case_id) = 1),
  check (num_nonnulls(related_ncr_id, related_warranty_case_id) = 1),
  check (ncr_id is null or related_ncr_id is null or ncr_id <> related_ncr_id),
  check (warranty_case_id is null or related_warranty_case_id is null or warranty_case_id <> related_warranty_case_id)
);

-- ---------- custos de não qualidade ----------
create table if not exists public.quality_nonquality_costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ncr_id uuid,
  warranty_case_id uuid,
  category text not null check (category in ('RETRABALHO', 'MATERIAL', 'MAO_DE_OBRA', 'MULTA', 'GARANTIA', 'PERDA_PRAZO', 'OUTRO')),
  description text,
  estimated_amount numeric(14, 2) check (estimated_amount is null or estimated_amount >= 0),
  actual_amount numeric(14, 2) check (actual_amount is null or actual_amount >= 0),
  currency text not null default 'BRL',
  source_ref text,
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  check (num_nonnulls(ncr_id, warranty_case_id) >= 1),
  -- valor sem fonte não é aceito (não inventar número); sem valor = SEM DADOS
  check ((estimated_amount is null and actual_amount is null) or source_ref is not null)
);

-- ---------- consequências por pilar ----------
create table if not exists public.quality_consequences (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  ncr_id uuid,
  warranty_case_id uuid,
  pillar text not null check (pillar in ('PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE')),
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  probability text check (probability is null or probability in ('RARA', 'IMPROVAVEL', 'POSSIVEL', 'PROVAVEL', 'QUASE_CERTA')),
  probability_basis text,
  description text,
  source_type text not null,
  source_ref text not null check (char_length(source_ref) between 1 and 1000),
  responsible_user_id uuid references public.profiles (id),
  measures text,
  status text not null default 'ABERTA' check (status in ('ABERTA', 'EM_TRATAMENTO', 'MITIGADA', 'ACEITA', 'ENCERRADA')),
  created_by uuid default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1,
  unique (id, project_id),
  foreign key (ncr_id, project_id) references public.quality_ncrs (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id),
  check (num_nonnulls(ncr_id, warranty_case_id) >= 1),
  -- probabilidade só com fundamento registrado
  check (probability is null or (probability_basis is not null and char_length(probability_basis) >= 5))
);
create index if not exists quality_conseq_ncr_idx on public.quality_consequences (ncr_id);
create index if not exists quality_conseq_warranty_idx on public.quality_consequences (warranty_case_id);

-- ---------- catálogo da máquina de estados + histórico ----------
create table if not exists public.quality_state_transitions (
  entity_type text not null check (entity_type in ('NCR', 'WARRANTY')),
  from_state text not null,
  to_state text not null,
  min_role text not null check (min_role in ('REGISTER', 'MANAGE')),
  requires_justification boolean not null default false,
  requires_evidence boolean not null default false,
  primary key (entity_type, from_state, to_state)
);

create table if not exists public.quality_state_events (
  seq bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete restrict,
  entity_type text not null check (entity_type in ('NCR', 'WARRANTY')),
  entity_id uuid not null,
  from_state text,
  to_state text not null,
  actor_user_id uuid,
  justification text,
  evidence_ids uuid[] not null default '{}',
  row_version_after integer not null,
  occurred_at timestamptz not null default now()
);
create index if not exists quality_state_events_entity_idx on public.quality_state_events (entity_type, entity_id, seq);

create or replace function public.quality_prevent_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only: UPDATE and DELETE are not allowed', tg_table_name;
end;
$$;
drop trigger if exists quality_state_events_append_only on public.quality_state_events;
create trigger quality_state_events_append_only before update or delete on public.quality_state_events
  for each row execute function public.quality_prevent_mutation();

-- ---------- triggers genéricos: versão otimista, imutabilidade, auditoria ----------
create or replace function public.quality_touch()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id or new.project_id is distinct from old.project_id then
    raise exception 'IMMUTABLE_KEY: id/project_id não podem ser alterados';
  end if;
  -- mudança só do cache de criticidade não consome versão (não invalida transição concorrente)
  if (to_jsonb(new) - 'criticality' - 'row_version' - 'updated_at')
     = (to_jsonb(old) - 'criticality' - 'row_version' - 'updated_at') then
    new.row_version := old.row_version;
    new.updated_at := old.updated_at;
  else
    new.row_version := old.row_version + 1;
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function public.quality_audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_changed text[];
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
begin
  -- mudanças feitas pelas RPCs de transição já gravam a própria linha de auditoria (com justificativa)
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    select coalesce(array_agg(k order by k), '{}') into v_changed
    from jsonb_object_keys(v_new) k
    where v_new -> k is distinct from v_old -> k and k not in ('updated_at', 'row_version', 'criticality');
    if coalesce(current_setting('quality.audited_by_rpc', true), '') = 'on' or cardinality(v_changed) = 0 then
      return new;
    end if;
  end if;
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (
    new.project_id,
    case when v_uid is null then 'SYSTEM' else 'USER' end,
    v_uid,
    'QUALITY_' || upper(tg_table_name) || '_' || tg_op,
    upper(tg_table_name),
    (v_new ->> 'id'),
    jsonb_build_object('op', tg_op, 'changedColumns', coalesce(to_jsonb(v_changed), '[]'::jsonb),
      'rowVersion', v_new -> 'row_version', 'code', v_new -> 'code')::text
  );
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'quality_requirements', 'quality_ncrs', 'quality_warranty_cases', 'quality_customer_complaints',
    'quality_inspections', 'quality_tests', 'quality_evidence', 'quality_corrective_actions',
    'quality_warranty_maintenance', 'quality_warranty_surveys', 'quality_warranty_repairs',
    'quality_recurrences', 'quality_nonquality_costs', 'quality_consequences']
  loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.quality_touch()', t, t);
  end loop;
  foreach t in array array[
    'quality_requirements', 'quality_ncrs', 'quality_warranty_cases', 'quality_customer_complaints',
    'quality_inspections', 'quality_tests', 'quality_evidence', 'quality_corrective_actions',
    'quality_warranty_maintenance', 'quality_warranty_surveys', 'quality_warranty_repairs',
    'quality_recurrences', 'quality_nonquality_costs', 'quality_consequences',
    'quality_effectiveness_verifications']
  loop
    execute format('drop trigger if exists %I_audit on public.%I', t, t);
    execute format('create trigger %I_audit after insert or update on public.%I for each row execute function public.quality_audit_row()', t, t);
  end loop;
end $$;

-- ---------- evidência: a FONTE ORIGINAL é imutável ----------
create or replace function public.quality_evidence_guard()
returns trigger
language plpgsql
as $$
begin
  if new.source_type is distinct from old.source_type
     or new.source_table is distinct from old.source_table
     or new.source_ref is distinct from old.source_ref
     or new.source_url is distinct from old.source_url
     or new.captured_at is distinct from old.captured_at
     or new.ncr_id is distinct from old.ncr_id
     or new.warranty_case_id is distinct from old.warranty_case_id
     or new.complaint_id is distinct from old.complaint_id
     or new.inspection_id is distinct from old.inspection_id
     or new.test_id is distinct from old.test_id then
    raise exception 'EVIDENCE_SOURCE_IMMUTABLE: a referência da fonte original não pode ser alterada';
  end if;
  return new;
end;
$$;
drop trigger if exists quality_evidence_guard_trg on public.quality_evidence;
create trigger quality_evidence_guard_trg before update on public.quality_evidence
  for each row execute function public.quality_evidence_guard();

-- evidência só pode ser vinculada a RNC/garantia coerentes (mesma obra já garantido por FK composta)
-- verificação: exige RNC em VERIFICACAO (ou garantia em REPARADA) e registra o ponto do histórico
create or replace function public.quality_verification_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_state text; v_ev_ok boolean;
begin
  if new.evidence_id is null then
    raise exception 'VERIFICATION_EVIDENCE_REQUIRED: a verificação de eficácia exige evidência';
  end if;
  if new.ncr_id is not null then
    select state into v_state from public.quality_ncrs where id = new.ncr_id;
    if v_state is distinct from 'VERIFICACAO' then
      raise exception 'VERIFICATION_STATE_INVALID: verificação de eficácia só em RNC no estado VERIFICACAO (atual: %)', v_state;
    end if;
    select exists (select 1 from public.quality_evidence e where e.id = new.evidence_id and e.ncr_id = new.ncr_id) into v_ev_ok;
  else
    select state into v_state from public.quality_warranty_cases where id = new.warranty_case_id;
    if v_state is distinct from 'REPARADA' then
      raise exception 'VERIFICATION_STATE_INVALID: verificação de eficácia só em garantia no estado REPARADA (atual: %)', v_state;
    end if;
    select exists (select 1 from public.quality_evidence e where e.id = new.evidence_id and e.warranty_case_id = new.warranty_case_id) into v_ev_ok;
  end if;
  if not v_ev_ok then
    raise exception 'VERIFICATION_EVIDENCE_INVALID: a evidência da verificação deve pertencer ao mesmo caso';
  end if;
  new.event_seq_at := coalesce((select max(seq) from public.quality_state_events
    where entity_id = coalesce(new.ncr_id, new.warranty_case_id)), 0);
  new.verified_by := coalesce(auth.uid(), new.verified_by);
  return new;
end;
$$;
drop trigger if exists quality_verification_guard_trg on public.quality_effectiveness_verifications;
create trigger quality_verification_guard_trg before insert on public.quality_effectiveness_verifications
  for each row execute function public.quality_verification_guard();

create or replace function public.quality_verification_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'quality_effectiveness_verifications is append-only: UPDATE and DELETE are not allowed';
end;
$$;
drop trigger if exists quality_verification_append_only on public.quality_effectiveness_verifications;
create trigger quality_verification_append_only before update or delete on public.quality_effectiveness_verifications
  for each row execute function public.quality_verification_immutable();

-- ---------- criticidade: PIOR PILAR DOMINA (nunca média) ----------
create or replace function public.quality_criticality_rank(p_severity text)
returns integer language sql immutable as $$
  select case p_severity when 'CRITICAL' then 4 when 'HIGH' then 3 when 'MEDIUM' then 2 when 'LOW' then 1 else 0 end;
$$;

create or replace function public.quality_compute_criticality(p_ncr uuid, p_warranty uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case max(public.quality_criticality_rank(c.severity))
      when 4 then 'CRITICAL' when 3 then 'HIGH' when 2 then 'MEDIUM' when 1 then 'LOW' end
    from public.quality_consequences c
    where (p_ncr is not null and c.ncr_id = p_ncr) or (p_warranty is not null and c.warranty_case_id = p_warranty)
  ), 'SEM_DADOS');
$$;
revoke all on function public.quality_compute_criticality(uuid, uuid) from public, anon;
grant execute on function public.quality_compute_criticality(uuid, uuid) to authenticated, service_role;

create or replace function public.quality_consequence_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ncr_id is not null then
    update public.quality_ncrs set criticality = public.quality_compute_criticality(new.ncr_id, null) where id = new.ncr_id;
  end if;
  if new.warranty_case_id is not null then
    update public.quality_warranty_cases set criticality = public.quality_compute_criticality(null, new.warranty_case_id)
    where id = new.warranty_case_id;
  end if;
  return new;
end;
$$;
drop trigger if exists quality_consequence_sync_trg on public.quality_consequences;
create trigger quality_consequence_sync_trg after insert or update on public.quality_consequences
  for each row execute function public.quality_consequence_sync();

-- funções de gatilho SECURITY DEFINER não são chamáveis por clientes (nem anon)
revoke all on function public.quality_audit_row(), public.quality_consequence_sync(),
  public.quality_verification_guard() from public, anon, authenticated;

-- ---------- RLS + grants ----------
do $$
declare t text;
begin
  foreach t in array array[
    'quality_requirements', 'quality_ncrs', 'quality_warranty_cases', 'quality_customer_complaints',
    'quality_inspections', 'quality_tests', 'quality_evidence', 'quality_corrective_actions',
    'quality_warranty_maintenance', 'quality_warranty_surveys', 'quality_warranty_repairs',
    'quality_effectiveness_verifications', 'quality_recurrences', 'quality_nonquality_costs',
    'quality_consequences', 'quality_state_events', 'quality_counters', 'quality_state_transitions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- select: membro ACTIVE do projeto
do $$
declare t text;
begin
  foreach t in array array[
    'quality_requirements', 'quality_ncrs', 'quality_warranty_cases', 'quality_customer_complaints',
    'quality_inspections', 'quality_tests', 'quality_evidence', 'quality_corrective_actions',
    'quality_warranty_maintenance', 'quality_warranty_surveys', 'quality_warranty_repairs',
    'quality_effectiveness_verifications', 'quality_recurrences', 'quality_nonquality_costs',
    'quality_consequences', 'quality_state_events']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_members', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.quality_can_read(project_id))',
      t || '_select_members', t);
  end loop;
end $$;

-- catálogo de transições: leitura para qualquer autenticado (é regra de negócio, sem dado de projeto)
drop policy if exists quality_state_transitions_select_all on public.quality_state_transitions;
create policy quality_state_transitions_select_all on public.quality_state_transitions
  for select to authenticated using (true);

-- escrita direta (registrar) em tabelas "filhas": INSERT por quem registra; UPDATE por quem registra (colunas limitadas)
do $$
declare t text;
begin
  foreach t in array array[
    'quality_requirements', 'quality_customer_complaints', 'quality_inspections', 'quality_tests',
    'quality_evidence', 'quality_corrective_actions', 'quality_warranty_maintenance',
    'quality_warranty_surveys', 'quality_warranty_repairs', 'quality_recurrences',
    'quality_nonquality_costs', 'quality_consequences']
  loop
    execute format('grant insert on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_register', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.quality_can_register(project_id) and created_by = auth.uid())',
      t || '_insert_register', t);
    execute format('grant update on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_register', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.quality_can_register(project_id)) with check (public.quality_can_register(project_id))',
      t || '_update_register', t);
  end loop;
end $$;

-- UPDATE limitado por coluna: a fonte original da evidência e as chaves não são editáveis
revoke update on table public.quality_evidence from authenticated;
grant update (classification, epistemic, description) on table public.quality_evidence to authenticated;

-- RNC e garantia: sem INSERT direto; UPDATE só de campos descritivos (estado/versão/criticidade/encerramento via RPC)
grant update (title, description, responsible_user_id, due_date, root_cause, requirement_id)
  on table public.quality_ncrs to authenticated;
drop policy if exists quality_ncrs_update_register on public.quality_ncrs;
create policy quality_ncrs_update_register on public.quality_ncrs
  for update to authenticated using (public.quality_can_register(project_id)) with check (public.quality_can_register(project_id));
grant update (contract_ref, service_system, delivered_at, discovered_at, communicated_at, warranty_terms,
  warranty_terms_ref, customer_complaint, defect_description, cause_category, cause_notes, hidden_defect,
  solidity_safety, responsible_user_id, due_date, estimated_cost, actual_cost, supplier_name,
  supplier_warranty_until, builder_warranty_until, accepted_at, accepted_by_name, ncr_id)
  on table public.quality_warranty_cases to authenticated;
drop policy if exists quality_warranty_cases_update_manage on public.quality_warranty_cases;
create policy quality_warranty_cases_update_manage on public.quality_warranty_cases
  for update to authenticated using (public.quality_can_register(project_id)) with check (public.quality_can_register(project_id));

-- verificação de eficácia: só quem GERE registra (append-only)
grant insert on table public.quality_effectiveness_verifications to authenticated;
drop policy if exists quality_verif_insert_manage on public.quality_effectiveness_verifications;
create policy quality_verif_insert_manage on public.quality_effectiveness_verifications
  for insert to authenticated with check (public.quality_can_manage(project_id));

-- consequências e custos: sem DELETE (encerrar = status), colunas de chave imutáveis via trigger
-- criticidade só muda pelo trigger; projeto/ids imutáveis (quality_touch)

-- ---------- catálogo da máquina de estados ----------
insert into public.quality_state_transitions (entity_type, from_state, to_state, min_role, requires_justification, requires_evidence) values
  ('NCR', 'DETECTADA', 'TRIAGEM', 'REGISTER', false, false),
  ('NCR', 'DETECTADA', 'CANCELADA', 'MANAGE', true, false),
  ('NCR', 'DETECTADA', 'DUPLICADA', 'MANAGE', true, false),
  ('NCR', 'TRIAGEM', 'INVESTIGACAO', 'REGISTER', false, false),
  ('NCR', 'TRIAGEM', 'NAO_CONFIRMADA', 'MANAGE', true, true),
  ('NCR', 'TRIAGEM', 'DUPLICADA', 'MANAGE', true, false),
  ('NCR', 'TRIAGEM', 'CANCELADA', 'MANAGE', true, false),
  ('NCR', 'INVESTIGACAO', 'CONFIRMADA', 'MANAGE', true, true),
  ('NCR', 'INVESTIGACAO', 'NAO_CONFIRMADA', 'MANAGE', true, true),
  ('NCR', 'INVESTIGACAO', 'CANCELADA', 'MANAGE', true, false),
  ('NCR', 'CONFIRMADA', 'PLANO_ACAO', 'REGISTER', false, false),
  ('NCR', 'CONFIRMADA', 'CANCELADA', 'MANAGE', true, false),
  ('NCR', 'PLANO_ACAO', 'CORRECAO', 'REGISTER', false, false),
  ('NCR', 'PLANO_ACAO', 'CANCELADA', 'MANAGE', true, false),
  ('NCR', 'CORRECAO', 'VERIFICACAO', 'REGISTER', false, false),
  ('NCR', 'CORRECAO', 'CANCELADA', 'MANAGE', true, false),
  ('NCR', 'VERIFICACAO', 'ENCERRADA', 'MANAGE', true, false),
  ('NCR', 'VERIFICACAO', 'CORRECAO', 'MANAGE', true, false),
  ('NCR', 'NAO_CONFIRMADA', 'REABERTA', 'MANAGE', true, true),
  ('NCR', 'ENCERRADA', 'REABERTA', 'MANAGE', true, true),
  ('NCR', 'REABERTA', 'INVESTIGACAO', 'REGISTER', false, false),
  ('NCR', 'REABERTA', 'CANCELADA', 'MANAGE', true, false),
  ('WARRANTY', 'ABERTA', 'EM_VISTORIA', 'REGISTER', false, false),
  ('WARRANTY', 'ABERTA', 'CANCELADA', 'MANAGE', true, false),
  ('WARRANTY', 'EM_VISTORIA', 'EM_ANALISE', 'REGISTER', false, false),
  ('WARRANTY', 'EM_VISTORIA', 'CANCELADA', 'MANAGE', true, false),
  ('WARRANTY', 'EM_ANALISE', 'COBERTA', 'MANAGE', true, true),
  ('WARRANTY', 'EM_ANALISE', 'NAO_COBERTA', 'MANAGE', true, true),
  ('WARRANTY', 'EM_ANALISE', 'CANCELADA', 'MANAGE', true, false),
  ('WARRANTY', 'COBERTA', 'EM_REPARO', 'REGISTER', false, false),
  ('WARRANTY', 'EM_REPARO', 'REPARADA', 'REGISTER', false, false),
  ('WARRANTY', 'REPARADA', 'VERIFICADA', 'MANAGE', true, false),
  ('WARRANTY', 'REPARADA', 'EM_REPARO', 'MANAGE', true, false),
  ('WARRANTY', 'VERIFICADA', 'ENCERRADA', 'MANAGE', true, false),
  ('WARRANTY', 'VERIFICADA', 'EM_REPARO', 'MANAGE', true, false),
  ('WARRANTY', 'ENCERRADA', 'REABERTA', 'MANAGE', true, true),
  ('WARRANTY', 'NAO_COBERTA', 'REABERTA', 'MANAGE', true, true),
  ('WARRANTY', 'REABERTA', 'EM_VISTORIA', 'REGISTER', false, false),
  ('WARRANTY', 'REABERTA', 'CANCELADA', 'MANAGE', true, false)
on conflict (entity_type, from_state, to_state) do update
  set min_role = excluded.min_role,
      requires_justification = excluded.requires_justification,
      requires_evidence = excluded.requires_evidence;

comment on table public.quality_ncrs is
  'RNC. Estado/versão/criticidade/encerramento só mudam pela RPC quality_ncr_transition (RLS + grant por coluna).';
comment on table public.quality_evidence is
  'Evidências ligadas à fonte original (source_table/source_ref/source_url imutáveis). Nunca alteram a fonte.';
