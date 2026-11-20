-- ============================================================
-- 20261122200000_seguros_garantias_model.sql
--
-- Agente S1 (fase 1, SEM telas) — modelo de dados de SEGUROS, FIANÇAS, CAUÇÕES, ENDOSSOS, ADIANTAMENTOS e SINISTROS.
--
-- Princípios (CLAUDE.md 11/12; brief de qualidade):
--   * Entidades SEPARADAS: insurance_policies (seguro: apólice) != bank_guarantees (fiança bancária) !=
--     other_guarantees (caução / carta de fiança NÃO bancária / outras). Nada é presumido equivalente.
--   * RLS por projeto em TODA tabela nova; leitura para membros ACTIVE; NENHUMA escrita direta (sem INSERT/UPDATE/DELETE
--     para anon/authenticated): toda mutação passa pelas RPCs da migration 20261122201000 (security definer + auditoria
--     + concorrência otimista).
--   * Trilhas append-only (versões da apólice, auditoria, passos de sinistro, amortizações): triggers bloqueiam UPDATE/DELETE.
--   * Pedido de endosso NÃO é endosso emitido: coverage_effective só pode ser true com estado CONFERIDO + documento emitido.
--   * Minutas de comunicação: estados DRAFT / APROVADA_PARA_ENVIO / CANCELADA. NÃO existe estado "enviada": nesta fase
--     nenhum envio real é possível (trava fail-closed em insurance_settings.real_send_enabled = false por padrão e,
--     mesmo ligada, a RPC de tentativa não possui transporte).
--   * Canal oficial de recebimento da seguradora/banco é DADO CADASTRADO (com fonte): nenhum endereço é inventado.
--   * Nenhuma norma, valor ou cobertura é preenchido por padrão: campos desconhecidos ficam NULL ("SEM DADOS").
--
-- Idempotente (if not exists / create or replace). Nada é apagado. Migrations existentes (incl. hotfix P0) intactas.
-- ============================================================

-- ---------- Acesso por papel (não altera has_project_permission nem regras existentes) ----------
-- READ = membro ACTIVE; REGISTER = ADMINISTRADOR/GESTOR/GERENTE/COLABORADOR; MANAGE = ADMINISTRADOR/GESTOR/GERENTE;
-- ADMIN = ADMINISTRADOR. LEITURA só consulta. auth.uid() nulo => false (fail-closed).
create or replace function public.insurance_access(p_project_id uuid, p_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case p_level
      when 'READ' then true
      when 'REGISTER' then pm.permission in ('ADMINISTRADOR', 'ADMIN', 'GESTOR', 'GERENTE', 'COLABORADOR', 'EDITOR')
      when 'MANAGE' then pm.permission in ('ADMINISTRADOR', 'ADMIN', 'GESTOR', 'GERENTE')
      when 'ADMIN' then pm.permission in ('ADMINISTRADOR', 'ADMIN')
      else false
    end
    from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'ACTIVE'
    limit 1
  ), false);
$$;
revoke all on function public.insurance_access(uuid, text) from public, anon;
grant execute on function public.insurance_access(uuid, text) to authenticated;
comment on function public.insurance_access(uuid, text) is
  'Papel do usuário autenticado na obra para o domínio de seguros/garantias (READ/REGISTER/MANAGE/ADMIN). Fail-closed.';

-- ---------- Trigger genérico: append-only / sem delete ----------
create or replace function public.insurance_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'INSURANCE_NO_DELETE: % não admite exclusão (preservação de evidências)', tg_table_name;
  end if;
  raise exception 'INSURANCE_APPEND_ONLY: % é append-only', tg_table_name;
end;
$$;

-- ============================================================
-- Auditoria própria (append-only)
-- ============================================================
create table if not exists public.insurance_audit_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  occurred_at timestamptz not null default now(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  actor_user_id uuid references public.profiles (id) on delete restrict,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists insurance_audit_events_project_idx on public.insurance_audit_events (project_id, occurred_at desc);
create index if not exists insurance_audit_events_entity_idx on public.insurance_audit_events (entity_type, entity_id);

-- ============================================================
-- Configuração por projeto: trava de envio real (fail-closed)
-- ============================================================
create table if not exists public.insurance_settings (
  project_id uuid primary key references public.projects (id) on delete restrict,
  real_send_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete restrict
);
comment on column public.insurance_settings.real_send_enabled is
  'Trava de envio real. Desligada por padrão. Não há RPC que a ligue; e, mesmo ligada, a fase 1 não possui transporte de envio.';

-- ============================================================
-- Apólices (SEGURO) e versões
-- ============================================================
create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  modality text not null check (modality in (
    'SEGURO_GARANTIA_EXECUTANTE', 'ADIANTAMENTO_PAGAMENTO', 'RETENCAO_PAGAMENTOS', 'POS_ENTREGA',
    'RISCOS_ENGENHARIA', 'RC_GERAL', 'RC_CRUZADA', 'RC_PROFISSIONAL', 'MAQUINAS_EQUIPAMENTOS'
  )),
  policy_number text,
  insurer_name text not null check (char_length(btrim(insurer_name)) > 0),
  broker_name text,
  contract_document_id uuid references public.documents (id) on delete restrict,
  contract_number text,
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'VIGENTE', 'VENCIDA', 'CANCELADA', 'SUBSTITUIDA')),
  coverage_start date,
  coverage_end date,
  max_amount numeric(18, 2) check (max_amount is null or max_amount >= 0),
  currency text not null default 'BRL',
  notes text,
  version_no integer not null default 1 check (version_no >= 1),
  row_version integer not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete restrict,
  check (coverage_start is null or coverage_end is null or coverage_end >= coverage_start),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_policies_project_idx on public.insurance_policies (project_id);
create index if not exists insurance_policies_end_idx on public.insurance_policies (project_id, coverage_end);

create table if not exists public.insurance_policy_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  version_no integer not null check (version_no >= 1),
  snapshot jsonb not null,
  change_reason text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  unique (policy_id, version_no)
);

-- Partes da apólice (um papel por linha; vários por papel permitidos)
create table if not exists public.insurance_policy_parties (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  party_role text not null check (party_role in (
    'TOMADOR', 'SEGURADO', 'BENEFICIARIO', 'CONTRATANTE', 'SUBCONTRATANTE', 'PROPRIETARIO_FINAL',
    'TITULAR_INTERESSE_SEGURAVEL', 'SEGURADORA', 'CORRETOR'
  )),
  party_name text,
  tax_id text,
  identification_status text not null default 'IDENTIFICADO' check (identification_status in ('IDENTIFICADO', 'NAO_IDENTIFICADO')),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  active boolean not null default true,
  added_in_version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  check (identification_status = 'NAO_IDENTIFICADO' or nullif(btrim(coalesce(party_name, '')), '') is not null),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_policy_parties_policy_idx on public.insurance_policy_parties (policy_id);

-- Cláusulas, condições, exclusões, sublimites, franquias, prazos de aviso
create table if not exists public.insurance_policy_clauses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  kind text not null check (kind in ('COBERTURA', 'CLAUSULA', 'CONDICAO', 'EXCLUSAO', 'SUBLIMITE', 'FRANQUIA', 'PRAZO_AVISO', 'OUTRO')),
  title text not null check (char_length(btrim(title)) > 0),
  clause_text text,
  amount numeric(18, 2) check (amount is null or amount >= 0),
  deadline_days integer check (deadline_days is null or deadline_days >= 0),
  applies_to text[] not null default '{}',
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  source_page text,
  verified boolean not null default false,
  added_in_version integer not null default 1,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_policy_clauses_policy_idx on public.insurance_policy_clauses (policy_id);

-- ============================================================
-- Fiança bancária (NÃO é seguro) e cauções / cartas de fiança não bancárias / outras garantias
-- ============================================================
create table if not exists public.bank_guarantees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  bank_name text not null check (char_length(btrim(bank_name)) > 0),
  guarantee_number text,
  beneficiary_name text,
  principal_name text,
  amount numeric(18, 2) check (amount is null or amount >= 0),
  currency text not null default 'BRL',
  start_date date,
  end_date date,
  calls_on_first_demand boolean,
  claim_procedure_note text,
  contract_document_id uuid references public.documents (id) on delete restrict,
  contract_number text,
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'VIGENTE', 'VENCIDA', 'CANCELADA', 'EXECUTADA', 'DEVOLVIDA')),
  notes text,
  row_version integer not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete restrict,
  check (start_date is null or end_date is null or end_date >= start_date),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
comment on column public.bank_guarantees.calls_on_first_demand is
  'NULL = SEM DADOS (não presumir pagamento à primeira demanda; depende do texto do instrumento).';
create index if not exists bank_guarantees_project_idx on public.bank_guarantees (project_id);

create table if not exists public.other_guarantees (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  guarantee_type text not null check (guarantee_type in ('CAUCAO', 'CARTA_FIANCA_NAO_BANCARIA', 'OUTRA')),
  caucao_form text check (caucao_form is null or caucao_form in ('DINHEIRO', 'TITULOS', 'BEM', 'OUTRA')),
  issuer_name text,
  beneficiary_name text,
  principal_name text,
  amount numeric(18, 2) check (amount is null or amount >= 0),
  currency text not null default 'BRL',
  start_date date,
  end_date date,
  release_conditions text,
  contract_document_id uuid references public.documents (id) on delete restrict,
  contract_number text,
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  status text not null default 'RASCUNHO' check (status in ('RASCUNHO', 'VIGENTE', 'VENCIDA', 'CANCELADA', 'EXECUTADA', 'DEVOLVIDA')),
  notes text,
  row_version integer not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete restrict,
  check (start_date is null or end_date is null or end_date >= start_date),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists other_guarantees_project_idx on public.other_guarantees (project_id);

-- ============================================================
-- Canais oficiais de recebimento (dado cadastrado com fonte; nunca inventado)
-- ============================================================
create table if not exists public.insurance_official_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid references public.insurance_policies (id) on delete restrict,
  bank_guarantee_id uuid references public.bank_guarantees (id) on delete restrict,
  entity_name text not null check (char_length(btrim(entity_name)) > 0),
  channel_type text not null check (channel_type in ('EMAIL', 'PORTAL', 'ENDERECO_POSTAL', 'TELEFONE', 'OUTRO')),
  channel_value text not null check (char_length(btrim(channel_value)) > 0),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  active boolean not null default true,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  check (policy_id is null or bank_guarantee_id is null),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_official_channels_project_idx on public.insurance_official_channels (project_id);

-- ============================================================
-- Endossos (pedido != emitido) — apenas avanço monotônico
-- ============================================================
create table if not exists public.insurance_endorsements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  endorsement_seq integer not null check (endorsement_seq >= 1),
  state text not null default 'SOLICITADO' check (state in ('SOLICITADO', 'EM_ANALISE', 'EMITIDO', 'CONFERIDO', 'RECUSADO')),
  requested_text text not null check (char_length(btrim(requested_text)) > 0),
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles (id) on delete restrict,
  request_document_id uuid references public.documents (id) on delete restrict,
  request_ref text,
  issued_text text,
  issued_at timestamptz,
  issued_by uuid references public.profiles (id) on delete restrict,
  issued_document_id uuid references public.documents (id) on delete restrict,
  issued_number text,
  texts_match boolean,
  comparison jsonb,
  divergence_note text,
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete restrict,
  coverage_effective boolean not null default false,
  refusal_note text,
  row_version integer not null default 1 check (row_version >= 1),
  updated_at timestamptz not null default now(),
  unique (policy_id, endorsement_seq),
  -- REGRA DE OURO: cobertura ampliada só após emissão formal VERIFICADA.
  check (coverage_effective = false or (state = 'CONFERIDO' and issued_document_id is not null and verified_at is not null and verified_by is not null)),
  check (state not in ('EMITIDO', 'CONFERIDO') or (issued_text is not null and issued_document_id is not null and issued_number is not null and issued_at is not null)),
  check (state <> 'CONFERIDO' or texts_match is not null),
  check (state <> 'RECUSADO' or nullif(btrim(coalesce(refusal_note, '')), '') is not null)
);
create index if not exists insurance_endorsements_policy_idx on public.insurance_endorsements (policy_id);

-- ============================================================
-- Adiantamentos (valor adiantado != saldo devido != valor indenizável)
-- ============================================================
create table if not exists public.insurance_advances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid references public.insurance_policies (id) on delete restrict,
  contract_document_id uuid references public.documents (id) on delete restrict,
  contract_number text,
  advanced_amount numeric(18, 2) not null check (advanced_amount > 0),
  advance_date date,
  purpose text not null check (char_length(btrim(purpose)) > 0),
  application_documented boolean not null default false,
  application_document_id uuid references public.documents (id) on delete restrict,
  guaranteed_limit numeric(18, 2) check (guaranteed_limit is null or guaranteed_limit >= 0),
  balance_due_informed numeric(18, 2) check (balance_due_informed is null or balance_due_informed >= 0),
  indemnifiable_informed numeric(18, 2) check (indemnifiable_informed is null or indemnifiable_informed >= 0),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  notes text,
  row_version integer not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (application_documented = false or application_document_id is not null),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
comment on column public.insurance_advances.balance_due_informed is 'Saldo DEVIDO informado por quem tem a fonte (não calculado). Diferente de saldo não amortizado.';
comment on column public.insurance_advances.indemnifiable_informed is 'Valor INDENIZÁVEL somente se decidido/informado (regulação). Nunca derivado automaticamente.';
create index if not exists insurance_advances_project_idx on public.insurance_advances (project_id);

create table if not exists public.insurance_advance_amortizations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  advance_id uuid not null references public.insurance_advances (id) on delete restrict,
  amount numeric(18, 2) not null check (amount > 0),
  amortized_on date,
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_advance_amort_idx on public.insurance_advance_amortizations (advance_id);

-- ============================================================
-- Sinistros / eventos (expectativa -> ... -> encerrado) e passos append-only
-- ============================================================
create table if not exists public.insurance_claims (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid references public.insurance_policies (id) on delete restrict,
  bank_guarantee_id uuid references public.bank_guarantees (id) on delete restrict,
  other_guarantee_id uuid references public.other_guarantees (id) on delete restrict,
  advance_id uuid references public.insurance_advances (id) on delete restrict,
  claim_kind text not null check (claim_kind in (
    'INADIMPLEMENTO', 'ATRASO', 'ADIANTAMENTO_NAO_AMORTIZADO', 'RC_CRUZADA', 'DANO_PROPRIA_OBRA',
    'DEFEITO_POS_ENTREGA', 'FIANCA_BANCARIA', 'OUTRO'
  )),
  title text not null check (char_length(btrim(title)) > 0),
  stage text not null check (stage in (
    'EXPECTATIVA', 'AVISO', 'RECLAMACAO', 'DOC_COMPLEMENTAR', 'REGULACAO', 'DECISAO',
    'INDENIZACAO_CUMPRIMENTO', 'NEGATIVA', 'CONTESTACAO', 'ENCERRADO'
  )),
  protocol text,
  occurrence_date date,
  claimed_amount numeric(18, 2) check (claimed_amount is null or claimed_amount >= 0),
  notice_deadline_at timestamptz,
  notice_deadline_basis text,
  contractual_basis_clause_id uuid references public.insurance_policy_clauses (id) on delete restrict,
  contractual_basis_note text,
  no_instrument_reason text,
  decision_outcome text check (decision_outcome is null or decision_outcome in ('DEFERIDO', 'INDEFERIDO', 'PARCIAL')),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  row_version integer not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    (case when policy_id is null then 0 else 1 end) + (case when bank_guarantee_id is null then 0 else 1 end)
    + (case when other_guarantee_id is null then 0 else 1 end) <= 1
  ),
  -- apólice/garantia ausente é um estado explícito e justificado, nunca um silêncio
  check (policy_id is not null or bank_guarantee_id is not null or other_guarantee_id is not null
         or nullif(btrim(coalesce(no_instrument_reason, '')), '') is not null),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_claims_project_idx on public.insurance_claims (project_id, stage);

create table if not exists public.insurance_claim_steps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  claim_id uuid not null references public.insurance_claims (id) on delete restrict,
  from_stage text,
  stage text not null,
  occurred_at timestamptz not null default now(),
  protocol text,
  note text,
  document_id uuid references public.documents (id) on delete restrict,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists insurance_claim_steps_claim_idx on public.insurance_claim_steps (claim_id, occurred_at);

-- ============================================================
-- Dossiê (checklist por apólice)
-- ============================================================
create table if not exists public.insurance_dossier_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  item_key text not null check (char_length(btrim(item_key)) > 0),
  label text not null,
  required boolean not null default true,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'ANEXADO', 'DISPENSADO', 'NAO_APLICAVEL')),
  document_id uuid references public.documents (id) on delete restrict,
  note text,
  row_version integer not null default 1 check (row_version >= 1),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete restrict,
  unique (policy_id, item_key),
  check (status <> 'ANEXADO' or document_id is not null),
  check (status not in ('DISPENSADO', 'NAO_APLICAVEL') or nullif(btrim(coalesce(note, '')), '') is not null)
);

-- ============================================================
-- Minutas de comunicação (SEMPRE rascunho; nunca "enviada")
-- ============================================================
create table if not exists public.insurance_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  draft_kind text not null check (draft_kind in ('AVISO_SINISTRO', 'EXPECTATIVA_SINISTRO', 'RECLAMACAO', 'ENDOSSO', 'COBRANCA_FIANCA')),
  policy_id uuid references public.insurance_policies (id) on delete restrict,
  bank_guarantee_id uuid references public.bank_guarantees (id) on delete restrict,
  claim_id uuid references public.insurance_claims (id) on delete restrict,
  endorsement_id uuid references public.insurance_endorsements (id) on delete restrict,
  official_channel_id uuid references public.insurance_official_channels (id) on delete restrict,
  subject text not null check (char_length(btrim(subject)) > 0),
  body text not null,
  basis jsonb not null default '{}'::jsonb,
  generated_by_ai boolean not null default false,
  state text not null default 'DRAFT' check (state in ('DRAFT', 'APROVADA_PARA_ENVIO', 'CANCELADA')),
  approved_by uuid references public.profiles (id) on delete restrict,
  approved_at timestamptz,
  approved_body_hash text,
  row_version integer not null default 1 check (row_version >= 1),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (state <> 'APROVADA_PARA_ENVIO' or (approved_by is not null and approved_at is not null and approved_body_hash = md5(body))),
  check (policy_id is not null or bank_guarantee_id is not null or claim_id is not null or endorsement_id is not null)
);
create index if not exists insurance_drafts_project_idx on public.insurance_drafts (project_id, state);

-- ============================================================
-- Triggers: append-only e sem exclusão
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['insurance_audit_events', 'insurance_policy_versions', 'insurance_claim_steps', 'insurance_advance_amortizations'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.insurance_block_mutation()', t || '_append_only', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.insurance_block_mutation()', t || '_no_truncate', t);
  end loop;
  foreach t in array array['insurance_policies', 'insurance_policy_parties', 'insurance_policy_clauses', 'bank_guarantees', 'other_guarantees',
    'insurance_official_channels', 'insurance_endorsements', 'insurance_advances', 'insurance_claims', 'insurance_dossier_items', 'insurance_drafts', 'insurance_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_no_delete', t);
    execute format('create trigger %I before delete on public.%I for each row execute function public.insurance_block_mutation()', t || '_no_delete', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.insurance_block_mutation()', t || '_no_truncate', t);
  end loop;
end $$;

-- ============================================================
-- RLS: leitura por membro do projeto; ZERO escrita direta
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array[
    'insurance_audit_events', 'insurance_settings', 'insurance_policies', 'insurance_policy_versions', 'insurance_policy_parties',
    'insurance_policy_clauses', 'bank_guarantees', 'other_guarantees', 'insurance_official_channels', 'insurance_endorsements',
    'insurance_advances', 'insurance_advance_amortizations', 'insurance_claims', 'insurance_claim_steps', 'insurance_dossier_items',
    'insurance_drafts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_members', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.insurance_access(project_id, ''READ''))', t || '_select_members', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
