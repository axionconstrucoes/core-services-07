-- ============================================================
-- 20261125202000_insurance_sources_and_grounds.sql
--
-- FASE 4 / Escopo B (4/5) — FONTE na atualização de fiança/caução e FUNDAMENTAÇÃO nas decisões de sinistro.
--
--  (b) bank_guarantee_update / other_guarantee_update (REDEFINIDAS; corpo vigente de 20261122201000 + a regra nova): toda atualização
--      exige FONTE da mudança (update_source_document_id do projeto OU update_source_ref) e MOTIVO (update_reason, >= 10 caracteres).
--      Cada atualização grava uma linha APPEND-ONLY em insurance_guarantee_updates (antes/depois, fonte, motivo, autor, versão).
--      Códigos: UPDATE_SOURCE_REQUIRED, UPDATE_REASON_REQUIRED, UPDATE_EMPTY.
--  (c) insurance_claim_advance (REDEFINIDA; corpo vigente de 20261123102000 + a regra nova): as etapas DECISAO, INDENIZACAO_CUMPRIMENTO,
--      NEGATIVA e CONTESTACAO exigem FUNDAMENTAÇÃO — nota (>= 20 caracteres; GROUNDS_REQUIRED) e ao menos uma FONTE
--      (documento do projeto e/ou source_refs; GROUNDS_SOURCES_REQUIRED). Etapas Decisão/Indenização sem nota ficam bloqueadas.
--      A nota e as fontes ficam no passo (insurance_claim_steps.source_refs) e na auditoria.
--      Reforço RCC: evento de RC CRUZADA só avança para DECISAO/INDENIZACAO_CUMPRIMENTO com o checklist RCC PRONTO
--      (insurance_rcc_readiness: 10 perguntas com fonte e natureza do bem definida) — RCC_NOT_READY.
-- Autorização inalterada (DECISAO/NEGATIVA/CONTESTACAO/INDENIZACAO/ENCERRADO = MANAGE; demais = REGISTER). Mesmas assinaturas e GRANTs.
-- Idempotente. Reversão: supabase/rollbacks/20261125202000_insurance_sources_and_grounds.rollback.sql
-- ============================================================

create table if not exists public.insurance_guarantee_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  guarantee_kind text not null check (guarantee_kind in ('FIANCA_BANCARIA', 'CAUCAO_OUTRA')),
  guarantee_id uuid not null,
  from_row_version integer not null,
  to_row_version integer not null,
  changed_keys text[] not null,
  before_state jsonb not null,
  after_state jsonb not null,
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  reason text not null check (char_length(btrim(reason)) >= 10 and char_length(reason) <= 2000),
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_guarantee_updates_idx on public.insurance_guarantee_updates (guarantee_kind, guarantee_id, created_at desc);
drop trigger if exists insurance_guarantee_updates_append_only on public.insurance_guarantee_updates;
create trigger insurance_guarantee_updates_append_only before update or delete on public.insurance_guarantee_updates for each row execute function public.f4b_block_mutation();
drop trigger if exists insurance_guarantee_updates_no_truncate on public.insurance_guarantee_updates;
create trigger insurance_guarantee_updates_no_truncate before truncate on public.insurance_guarantee_updates for each statement execute function public.f4b_block_mutation();
alter table public.insurance_guarantee_updates enable row level security;
drop policy if exists insurance_guarantee_updates_select_members on public.insurance_guarantee_updates;
create policy insurance_guarantee_updates_select_members on public.insurance_guarantee_updates for select to authenticated using (public.insurance_access(project_id, 'READ'));
revoke all on public.insurance_guarantee_updates from public, anon, authenticated;
grant select on public.insurance_guarantee_updates to authenticated;
comment on table public.insurance_guarantee_updates is 'Histórico append-only das atualizações de fiança bancária/caução: antes/depois, fonte e motivo da mudança. Escrita só por bank_guarantee_update/other_guarantee_update.';

alter table public.insurance_claim_steps add column if not exists source_refs text[] not null default '{}';
comment on column public.insurance_claim_steps.source_refs is 'Fontes (referências) da fundamentação do passo; DECISAO/INDENIZACAO_CUMPRIMENTO/NEGATIVA/CONTESTACAO exigem ao menos uma fonte (aqui e/ou document_id).';

-- ---------- fiança bancária ----------
create or replace function public.bank_guarantee_update(p_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.bank_guarantees%rowtype;
  a public.bank_guarantees%rowtype;
  v_src uuid := public.insurance_int_uuid(p_data, 'update_source_document_id');
  v_ref text := public.insurance_int_text(p_data, 'update_source_ref');
  v_reason text := public.insurance_int_text(p_data, 'update_reason');
  v_keys text[];
begin
  select * into g from public.bank_guarantees where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(g.project_id, 'MANAGE');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if g.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, g.row_version; end if;
  -- Fase 4/B: a atualização exige FONTE e MOTIVO
  if v_src is null and v_ref is null then raise exception 'UPDATE_SOURCE_REQUIRED: a atualização da fiança exige a fonte da mudança (documento do projeto ou referência)'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'UPDATE_REASON_REQUIRED: informe o motivo da atualização (mínimo de 10 caracteres)'; end if;
  perform public.insurance_int_same_project('documents', v_src, g.project_id);
  perform public.insurance_int_same_project('documents', public.insurance_int_uuid(p_data, 'source_document_id'), g.project_id);
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(p_data) k where k not like 'update\_%';
  if cardinality(v_keys) = 0 then raise exception 'UPDATE_EMPTY: nenhum campo a atualizar'; end if;
  update public.bank_guarantees set
    guarantee_number = case when p_data ? 'guarantee_number' then public.insurance_int_text(p_data, 'guarantee_number') else guarantee_number end,
    amount = case when p_data ? 'amount' then (p_data ->> 'amount')::numeric else amount end,
    start_date = case when p_data ? 'start_date' then (p_data ->> 'start_date')::date else start_date end,
    end_date = case when p_data ? 'end_date' then (p_data ->> 'end_date')::date else end_date end,
    calls_on_first_demand = case when p_data ? 'calls_on_first_demand' then (p_data ->> 'calls_on_first_demand')::boolean else calls_on_first_demand end,
    claim_procedure_note = case when p_data ? 'claim_procedure_note' then public.insurance_int_text(p_data, 'claim_procedure_note') else claim_procedure_note end,
    status = case when p_data ? 'status' then p_data ->> 'status' else status end,
    notes = case when p_data ? 'notes' then public.insurance_int_text(p_data, 'notes') else notes end,
    row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into a;
  insert into public.insurance_guarantee_updates (project_id, guarantee_kind, guarantee_id, from_row_version, to_row_version, changed_keys, before_state, after_state,
    source_document_id, source_ref, reason, created_by)
  values (g.project_id, 'FIANCA_BANCARIA', p_id, g.row_version, a.row_version, v_keys, to_jsonb(g), to_jsonb(a), v_src, v_ref, v_reason, auth.uid());
  perform public.insurance_int_audit(g.project_id, 'BANK_GUARANTEE', p_id, 'BANK_GUARANTEE_UPDATED',
    jsonb_build_object('fromRowVersion', g.row_version, 'changedKeys', to_jsonb(v_keys), 'before', to_jsonb(g), 'updateSourceRef', v_ref, 'updateSourceDocumentId', v_src, 'reason', v_reason));
  return jsonb_build_object('id', p_id, 'rowVersion', g.row_version + 1);
end;
$$;

-- ---------- caução / outras garantias ----------
create or replace function public.other_guarantee_update(p_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.other_guarantees%rowtype;
  a public.other_guarantees%rowtype;
  v_src uuid := public.insurance_int_uuid(p_data, 'update_source_document_id');
  v_ref text := public.insurance_int_text(p_data, 'update_source_ref');
  v_reason text := public.insurance_int_text(p_data, 'update_reason');
  v_keys text[];
begin
  select * into g from public.other_guarantees where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(g.project_id, 'MANAGE');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if g.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, g.row_version; end if;
  if v_src is null and v_ref is null then raise exception 'UPDATE_SOURCE_REQUIRED: a atualização da caução/garantia exige a fonte da mudança (documento do projeto ou referência)'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'UPDATE_REASON_REQUIRED: informe o motivo da atualização (mínimo de 10 caracteres)'; end if;
  perform public.insurance_int_same_project('documents', v_src, g.project_id);
  select coalesce(array_agg(k order by k), '{}') into v_keys from jsonb_object_keys(p_data) k where k not like 'update\_%';
  if cardinality(v_keys) = 0 then raise exception 'UPDATE_EMPTY: nenhum campo a atualizar'; end if;
  update public.other_guarantees set
    amount = case when p_data ? 'amount' then (p_data ->> 'amount')::numeric else amount end,
    start_date = case when p_data ? 'start_date' then (p_data ->> 'start_date')::date else start_date end,
    end_date = case when p_data ? 'end_date' then (p_data ->> 'end_date')::date else end_date end,
    release_conditions = case when p_data ? 'release_conditions' then public.insurance_int_text(p_data, 'release_conditions') else release_conditions end,
    status = case when p_data ? 'status' then p_data ->> 'status' else status end,
    notes = case when p_data ? 'notes' then public.insurance_int_text(p_data, 'notes') else notes end,
    row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id
  returning * into a;
  insert into public.insurance_guarantee_updates (project_id, guarantee_kind, guarantee_id, from_row_version, to_row_version, changed_keys, before_state, after_state,
    source_document_id, source_ref, reason, created_by)
  values (g.project_id, 'CAUCAO_OUTRA', p_id, g.row_version, a.row_version, v_keys, to_jsonb(g), to_jsonb(a), v_src, v_ref, v_reason, auth.uid());
  perform public.insurance_int_audit(g.project_id, 'OTHER_GUARANTEE', p_id, 'OTHER_GUARANTEE_UPDATED',
    jsonb_build_object('fromRowVersion', g.row_version, 'changedKeys', to_jsonb(v_keys), 'before', to_jsonb(g), 'updateSourceRef', v_ref, 'updateSourceDocumentId', v_src, 'reason', v_reason));
  return jsonb_build_object('id', p_id, 'rowVersion', g.row_version + 1);
end;
$$;

-- ---------- sinistro: fundamentação (texto + fontes) e RCC ----------
create or replace function public.insurance_claim_advance(p_claim_id uuid, p_expected_row_version integer, p_to_stage text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.insurance_claims%rowtype;
  v_note text := public.insurance_int_text(p_data, 'note');
  v_doc uuid := public.insurance_int_uuid(p_data, 'document_id');
  v_protocol text := coalesce(public.insurance_int_text(p_data, 'protocol'), null);
  v_outcome text := public.insurance_int_text(p_data, 'decision_outcome');
  v_refs text[] := '{}';
  v_ref text;
  v_rcc jsonb;
begin
  select * into c from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(c.project_id,
    case when p_to_stage in ('DECISAO', 'NEGATIVA', 'CONTESTACAO', 'INDENIZACAO_CUMPRIMENTO', 'ENCERRADO') then 'MANAGE' else 'REGISTER' end);
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if c.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, c.row_version; end if;
  if not public.insurance_claim_transition_allowed(c.stage, p_to_stage) then raise exception 'INVALID_TRANSITION: % -> %', c.stage, p_to_stage; end if;
  perform public.insurance_int_same_project('documents', v_doc, c.project_id);
  if p_to_stage in ('NEGATIVA', 'CONTESTACAO', 'DOC_COMPLEMENTAR', 'ENCERRADO') and char_length(coalesce(v_note, '')) < 10 then raise exception 'NOTE_REQUIRED'; end if;
  if p_data ? 'source_refs' then
    if jsonb_typeof(p_data -> 'source_refs') <> 'array' or jsonb_array_length(p_data -> 'source_refs') > 20 then raise exception 'INVALID_INPUT: source_refs deve ser uma lista de até 20 fontes'; end if;
    for v_ref in select btrim(x) from jsonb_array_elements_text(p_data -> 'source_refs') x loop
      if v_ref <> '' then
        if char_length(v_ref) > 500 then raise exception 'INVALID_INPUT: fonte longa demais'; end if;
        v_refs := array_append(v_refs, v_ref);
      end if;
    end loop;
  end if;
  -- Fase 4/B: decisão, indenização/cumprimento, negativa e contestação exigem FUNDAMENTAÇÃO (nota + fontes)
  if p_to_stage in ('DECISAO', 'INDENIZACAO_CUMPRIMENTO', 'NEGATIVA', 'CONTESTACAO') then
    if char_length(coalesce(v_note, '')) < 20 then
      raise exception 'GROUNDS_REQUIRED: a etapa % exige fundamentação (nota com no mínimo 20 caracteres)', p_to_stage;
    end if;
    if cardinality(v_refs) = 0 and v_doc is null then
      raise exception 'GROUNDS_SOURCES_REQUIRED: a etapa % exige ao menos uma fonte da fundamentação (documento do projeto e/ou referência)', p_to_stage;
    end if;
  end if;
  if p_to_stage = 'DECISAO' then
    if v_outcome is null or v_outcome not in ('DEFERIDO', 'INDEFERIDO', 'PARCIAL') then raise exception 'DECISION_OUTCOME_REQUIRED'; end if;
  end if;
  if p_to_stage = 'INDENIZACAO_CUMPRIMENTO' and coalesce(c.decision_outcome, '') not in ('DEFERIDO', 'PARCIAL') then
    raise exception 'DECISION_DOES_NOT_ALLOW_PAYMENT';
  end if;
  -- Reforço RCC: posição sobre cobertura de RC cruzada só com o checklist de 10 perguntas pronto
  if c.claim_kind = 'RC_CRUZADA' and c.policy_id is not null and p_to_stage in ('DECISAO', 'INDENIZACAO_CUMPRIMENTO') then
    v_rcc := public.insurance_rcc_readiness(c.policy_id, c.id);
    if not (v_rcc ->> 'ready')::boolean then
      raise exception 'RCC_NOT_READY: o checklist RCC (10 perguntas com fonte e natureza do bem definida) não está pronto: respondidas %/10', v_rcc ->> 'answeredWithSource';
    end if;
  end if;
  update public.insurance_claims set stage = p_to_stage,
      protocol = coalesce(v_protocol, protocol),
      decision_outcome = case when p_to_stage = 'DECISAO' then v_outcome when p_to_stage = 'NEGATIVA' then 'INDEFERIDO' else decision_outcome end,
      row_version = row_version + 1, updated_at = now()
   where id = p_claim_id;
  insert into public.insurance_claim_steps (project_id, claim_id, from_stage, stage, protocol, note, document_id, source_refs, created_by)
  values (c.project_id, p_claim_id, c.stage, p_to_stage, v_protocol, v_note, v_doc, v_refs, auth.uid());
  perform public.insurance_int_audit(c.project_id, 'INSURANCE_CLAIM', p_claim_id, 'CLAIM_STAGE_' || p_to_stage,
    jsonb_build_object('fromStage', c.stage, 'toStage', p_to_stage, 'protocol', v_protocol, 'decisionOutcome', v_outcome,
      'groundsNoteLength', char_length(coalesce(v_note, '')), 'sourceRefs', to_jsonb(v_refs), 'documentId', v_doc, 'rccReady', case when v_rcc is null then null else v_rcc -> 'ready' end));
  return jsonb_build_object('id', p_claim_id, 'stage', p_to_stage, 'rowVersion', c.row_version + 1);
end;
$$;

revoke all on function public.bank_guarantee_update(uuid, integer, jsonb), public.other_guarantee_update(uuid, integer, jsonb),
  public.insurance_claim_advance(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.bank_guarantee_update(uuid, integer, jsonb), public.other_guarantee_update(uuid, integer, jsonb),
  public.insurance_claim_advance(uuid, integer, text, jsonb) to authenticated;
