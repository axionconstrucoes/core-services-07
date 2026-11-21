-- ============================================================
-- 20261205101000_closed_case_material_change_guards.sql
--
-- FASE 5 / Frente E (2/3) — CASO ENCERRADO (RNC, garantia, sinistro) NÃO RECEBE ALTERAÇÃO MATERIAL sem REABERTURA AUDITADA
-- ou REGISTRO COMPLEMENTAR CONTROLADO.
--
-- O que JÁ existia (verificado antes de escrever): as RPCs de Qualidade recusam edição/filhos em caso fechado
-- (quality_case_accepts_children, CASE_NOT_ACTIVE) e a reabertura de RNC/garantia é uma transição auditada (ENCERRADA -> REABERTA, MANAGE,
-- quality_state_events); sinistro ENCERRADO não tem transição de saída. LACUNAS fechadas aqui (defesa em profundidade no BANCO, valendo
-- também para service_role/superusuário/função futura):
--   1) RNC/garantia ENCERRADA: UPDATE sem mudança de estado é recusado (gatilho); só a transição para REABERTA (já guardada) altera.
--   2) Filhos de caso ENCERRADO (ações corretivas, verificações de eficácia, manutenção/vistoria/reparo, custos): INSERT/UPDATE recusado. Evidência NOVA continua aceita (aditiva; é o caminho da reabertura, e a original é imutável).
--   3) Sinistro ENCERRADO: UPDATE do sinistro e novos passos recusados, exceto pela REABERTURA AUDITADA nova
--      insurance_claim_reopen (MANAGE; motivo >= 20 caracteres + fonte; evento append-only + auditoria + passo de histórico).
--   4) REGISTRO COMPLEMENTAR CONTROLADO (acc_closed_case_complement_add): permite acrescentar informação/documento posterior a um caso
--      encerrado SEM alterar nenhum campo original (tabela separada, append-only, MANAGE+, fonte obrigatória, auditoria).
-- Não redefine função existente. Reversível: supabase/rollbacks/20261205101000_closed_case_material_change_guards.rollback.sql. Idempotente.
-- ============================================================

-- ---------- 1) Registro complementar (append-only) ----------
create table if not exists public.closed_case_complements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  entity_type text not null check (entity_type in ('NCR', 'WARRANTY', 'CLAIM')),
  entity_id uuid not null,
  kind text not null check (kind in ('INFORMACAO_COMPLEMENTAR', 'DOCUMENTO_POSTERIOR', 'RETIFICACAO_DE_REGISTRO', 'OBSERVACAO_DE_AUDITORIA')),
  note text not null check (char_length(btrim(note)) between 20 and 2000),
  source_ref text not null check (char_length(btrim(source_ref)) between 1 and 1000),
  document_id uuid references public.documents (id) on delete restrict,
  case_state_at_registration text not null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now()
);
create index if not exists closed_case_complements_entity_idx on public.closed_case_complements (project_id, entity_type, entity_id, created_at);
drop trigger if exists closed_case_complements_append_only on public.closed_case_complements;
create trigger closed_case_complements_append_only before update or delete on public.closed_case_complements
  for each row execute function public.insurance_block_mutation();
drop trigger if exists closed_case_complements_no_truncate on public.closed_case_complements;
create trigger closed_case_complements_no_truncate before truncate on public.closed_case_complements
  for each statement execute function public.insurance_block_mutation();
alter table public.closed_case_complements enable row level security;
drop policy if exists closed_case_complements_select on public.closed_case_complements;
create policy closed_case_complements_select on public.closed_case_complements for select to authenticated
  using (public.acc_project_tier(project_id) <> 'NONE');
revoke all on public.closed_case_complements from public, anon, authenticated;
grant select on public.closed_case_complements to authenticated;

-- ---------- 2) Eventos de reabertura de sinistro (append-only; a transação do evento libera a alteração do sinistro) ----------
create table if not exists public.insurance_claim_reopen_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  claim_id uuid not null references public.insurance_claims (id) on delete restrict,
  from_stage text not null,
  to_stage text not null,
  reason text not null check (char_length(btrim(reason)) >= 20),
  source_ref text not null check (char_length(btrim(source_ref)) between 1 and 1000),
  reopened_by uuid not null references public.profiles (id) on delete restrict,
  tx_id bigint not null default txid_current(),
  created_at timestamptz not null default now()
);
create index if not exists insurance_claim_reopen_events_claim_idx on public.insurance_claim_reopen_events (claim_id, created_at);
drop trigger if exists insurance_claim_reopen_events_append_only on public.insurance_claim_reopen_events;
create trigger insurance_claim_reopen_events_append_only before update or delete on public.insurance_claim_reopen_events
  for each row execute function public.insurance_block_mutation();
drop trigger if exists insurance_claim_reopen_events_no_truncate on public.insurance_claim_reopen_events;
create trigger insurance_claim_reopen_events_no_truncate before truncate on public.insurance_claim_reopen_events
  for each statement execute function public.insurance_block_mutation();
alter table public.insurance_claim_reopen_events enable row level security;
drop policy if exists insurance_claim_reopen_events_select on public.insurance_claim_reopen_events;
create policy insurance_claim_reopen_events_select on public.insurance_claim_reopen_events for select to authenticated
  using (public.acc_project_tier(project_id) <> 'NONE');
revoke all on public.insurance_claim_reopen_events from public, anon, authenticated;
grant select on public.insurance_claim_reopen_events to authenticated;

-- ---------- 3) Gatilhos: RNC / garantia ENCERRADA não muda sem transição de estado ----------
create or replace function public.quality_closed_case_parent_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'ENCERRADA' and new.state = old.state and to_jsonb(new) is distinct from to_jsonb(old) then
    raise exception 'CLOSED_CASE_IMMUTABLE: caso ENCERRADO não recebe alteração material; reabra (REABERTA, auditado) ou registre complemento (acc_closed_case_complement_add)';
  end if;
  return new;
end;
$$;
revoke all on function public.quality_closed_case_parent_guard() from public, anon, authenticated;
drop trigger if exists quality_ncrs_closed_guard_trg on public.quality_ncrs;
create trigger quality_ncrs_closed_guard_trg before update on public.quality_ncrs
  for each row execute function public.quality_closed_case_parent_guard();
drop trigger if exists quality_warranty_cases_closed_guard_trg on public.quality_warranty_cases;
create trigger quality_warranty_cases_closed_guard_trg before update on public.quality_warranty_cases
  for each row execute function public.quality_closed_case_parent_guard();

-- ---------- 4) Gatilho: filhos de caso ENCERRADO ----------
create or replace function public.quality_closed_case_children_guard()
returns trigger
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  j jsonb := to_jsonb(new);
  v_ncr uuid := nullif(j ->> 'ncr_id', '')::uuid;
  v_w uuid := nullif(j ->> 'warranty_case_id', '')::uuid;
begin
  if v_ncr is not null and exists (select 1 from public.quality_ncrs n where n.id = v_ncr and n.state = 'ENCERRADA') then
    raise exception 'CLOSED_CASE_IMMUTABLE: a RNC está ENCERRADA; reabra (auditado) ou registre complemento (acc_closed_case_complement_add)';
  end if;
  if v_w is not null and exists (select 1 from public.quality_warranty_cases w where w.id = v_w and w.state = 'ENCERRADA') then
    raise exception 'CLOSED_CASE_IMMUTABLE: a garantia está ENCERRADA; reabra (auditado) ou registre complemento (acc_closed_case_complement_add)';
  end if;
  return new;
end;
$$;
revoke all on function public.quality_closed_case_children_guard() from public, anon, authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['quality_corrective_actions', 'quality_effectiveness_verifications', 'quality_warranty_maintenance',
                           'quality_warranty_surveys', 'quality_warranty_repairs', 'quality_nonquality_costs'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_closed_guard_trg', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.quality_closed_case_children_guard()',
                   t || '_closed_guard_trg', t);
  end loop;
end $$;

-- ---------- 5) Gatilhos: sinistro ENCERRADO ----------
create or replace function public.insurance_claim_closed_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.stage = 'ENCERRADO' and not exists (
       select 1 from public.insurance_claim_reopen_events e where e.claim_id = old.id and e.tx_id = txid_current()) then
    raise exception 'CLOSED_CASE_IMMUTABLE: sinistro ENCERRADO não recebe alteração; use a reabertura auditada (insurance_claim_reopen) ou registre complemento (acc_closed_case_complement_add)';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_claim_closed_guard() from public, anon, authenticated;
drop trigger if exists insurance_claims_closed_guard_trg on public.insurance_claims;
create trigger insurance_claims_closed_guard_trg before update on public.insurance_claims
  for each row execute function public.insurance_claim_closed_guard();

create or replace function public.insurance_claim_steps_closed_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stage text;
begin
  select c.stage into v_stage from public.insurance_claims c where c.id = new.claim_id;
  -- o passo de ENCERRAMENTO é gravado depois do UPDATE do sinistro (já ENCERRADO): permitido só se veio de outro estágio
  if v_stage = 'ENCERRADO' and not (new.stage = 'ENCERRADO' and new.from_stage is distinct from 'ENCERRADO') then
    raise exception 'CLOSED_CASE_IMMUTABLE: sinistro ENCERRADO não recebe novos passos; use a reabertura auditada (insurance_claim_reopen)';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_claim_steps_closed_guard() from public, anon, authenticated;
drop trigger if exists insurance_claim_steps_closed_guard_trg on public.insurance_claim_steps;
create trigger insurance_claim_steps_closed_guard_trg before insert on public.insurance_claim_steps
  for each row execute function public.insurance_claim_steps_closed_guard();

-- ---------- 6) Reabertura auditada de sinistro ----------
create or replace function public.insurance_claim_reopen(p_claim_id uuid, p_expected_row_version integer, p_to_stage text, p_reason text, p_source_ref text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.insurance_claims%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(c.project_id, 'MANAGE');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if c.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, c.row_version; end if;
  if c.stage <> 'ENCERRADO' then raise exception 'NOT_CLOSED: só sinistro ENCERRADO é reaberto'; end if;
  if p_to_stage is null or p_to_stage not in ('DOC_COMPLEMENTAR', 'REGULACAO', 'CONTESTACAO') then raise exception 'INVALID_TRANSITION: a reabertura vai para DOC_COMPLEMENTAR, REGULACAO ou CONTESTACAO'; end if;
  if v_reason is null or char_length(v_reason) < 20 then raise exception 'REASON_REQUIRED: motivo da reabertura (mín. 20 caracteres)'; end if;
  if v_ref is null or char_length(v_ref) > 1000 then raise exception 'SOURCE_REQUIRED: informe a fonte que justifica a reabertura'; end if;
  insert into public.insurance_claim_reopen_events (project_id, claim_id, from_stage, to_stage, reason, source_ref, reopened_by)
  values (c.project_id, c.id, c.stage, p_to_stage, v_reason, v_ref, auth.uid());
  update public.insurance_claims set stage = p_to_stage, row_version = row_version + 1, updated_at = now() where id = c.id;
  insert into public.insurance_claim_steps (project_id, claim_id, from_stage, stage, note, created_by)
  values (c.project_id, c.id, 'ENCERRADO', p_to_stage, 'REABERTURA: ' || v_reason, auth.uid());
  perform public.insurance_int_audit(c.project_id, 'INSURANCE_CLAIM', c.id, 'CLAIM_REOPENED',
    jsonb_build_object('fromStage', 'ENCERRADO', 'toStage', p_to_stage, 'sourceRef', v_ref));
  return jsonb_build_object('id', c.id, 'stage', p_to_stage, 'rowVersion', c.row_version + 1, 'reopened', true);
end;
$$;
revoke all on function public.insurance_claim_reopen(uuid, integer, text, text, text) from public, anon;
grant execute on function public.insurance_claim_reopen(uuid, integer, text, text, text) to authenticated;

-- ---------- 7) Registro complementar controlado ----------
create or replace function public.acc_closed_case_complement_add(
  p_project_id uuid, p_entity_type text, p_entity_id uuid, p_kind text, p_note text, p_source_ref text, p_document_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_state text;
  v_proj uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) not in ('MANAGE', 'ADMIN') then raise exception 'FORBIDDEN: registro complementar de caso encerrado é ato de gestão'; end if;
  if p_entity_type = 'NCR' then select n.state, n.project_id into v_state, v_proj from public.quality_ncrs n where n.id = p_entity_id;
  elsif p_entity_type = 'WARRANTY' then select w.state, w.project_id into v_state, v_proj from public.quality_warranty_cases w where w.id = p_entity_id;
  elsif p_entity_type = 'CLAIM' then select c.stage, c.project_id into v_state, v_proj from public.insurance_claims c where c.id = p_entity_id;
  else raise exception 'INVALID_ENTITY_TYPE'; end if;
  if v_proj is null or v_proj <> p_project_id then raise exception 'FORBIDDEN: caso inexistente ou de outro projeto'; end if;
  if v_state not in ('ENCERRADA', 'ENCERRADO') then raise exception 'CASE_NOT_CLOSED: o caso está %; use o fluxo normal (o complemento é só para caso encerrado)', v_state; end if;
  if p_kind is null or p_kind not in ('INFORMACAO_COMPLEMENTAR', 'DOCUMENTO_POSTERIOR', 'RETIFICACAO_DE_REGISTRO', 'OBSERVACAO_DE_AUDITORIA') then raise exception 'INVALID_KIND'; end if;
  if v_note is null or char_length(v_note) < 20 or char_length(v_note) > 2000 then raise exception 'NOTE_REQUIRED: descreva o complemento (20 a 2000 caracteres)'; end if;
  if v_ref is null or char_length(v_ref) > 1000 then raise exception 'SOURCE_REQUIRED: todo complemento aponta para a fonte'; end if;
  if p_document_id is not null and not exists (select 1 from public.documents d where d.id = p_document_id and d.project_id = p_project_id) then
    raise exception 'REFERENCE_OUT_OF_PROJECT: documento inexistente ou de outro projeto';
  end if;
  insert into public.closed_case_complements (project_id, entity_type, entity_id, kind, note, source_ref, document_id, case_state_at_registration, created_by)
  values (p_project_id, p_entity_type, p_entity_id, p_kind, v_note, v_ref, p_document_id, v_state, v_uid) returning id into v_id;
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_uid, 'CLOSED_CASE_COMPLEMENT_ADDED', 'CLOSED_CASE_COMPLEMENT', v_id::text,
          jsonb_build_object('entityType', p_entity_type, 'entityId', p_entity_id, 'kind', p_kind, 'sourceRef', v_ref)::text);
  return jsonb_build_object('id', v_id, 'entityType', p_entity_type, 'entityId', p_entity_id, 'original_unchanged', true);
end;
$$;
revoke all on function public.acc_closed_case_complement_add(uuid, text, uuid, text, text, text, uuid) from public, anon;
grant execute on function public.acc_closed_case_complement_add(uuid, text, uuid, text, text, text, uuid) to authenticated;

comment on table public.closed_case_complements is
  'Registro complementar controlado de caso ENCERRADO (RNC, garantia, sinistro): acrescenta informação sem alterar nenhum campo original. Append-only. Fase 5/E.';
comment on table public.insurance_claim_reopen_events is
  'Reabertura auditada de sinistro ENCERRADO (motivo, fonte, autor). Append-only; libera o UPDATE do sinistro só na própria transação. Fase 5/E.';
