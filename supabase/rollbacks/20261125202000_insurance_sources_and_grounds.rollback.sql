-- ROLLBACK (manual, NAO e migration) de 20261125202000_insurance_sources_and_grounds.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.insurance_guarantee_updates') is not null then
    select count(*) into n from public.insurance_guarantee_updates;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_guarantee_updates tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'insurance_claim_steps' and column_name = 'source_refs') then
    select count(*) into n from public.insurance_claim_steps where source_refs is distinct from '{}';
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_claim_steps.source_refs tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
end $$;
drop table if exists public.insurance_guarantee_updates;
-- restaura bank_guarantee_update(uuid, integer, jsonb) com o corpo de 20261122201000_seguros_garantias_rpcs
create or replace function public.bank_guarantee_update(p_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.bank_guarantees%rowtype;
begin
  select * into g from public.bank_guarantees where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(g.project_id, 'MANAGE');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if g.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, g.row_version; end if;
  perform public.insurance_int_same_project('documents', public.insurance_int_uuid(p_data, 'source_document_id'), g.project_id);
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
  where id = p_id;
  perform public.insurance_int_audit(g.project_id, 'BANK_GUARANTEE', p_id, 'BANK_GUARANTEE_UPDATED',
    jsonb_build_object('fromRowVersion', g.row_version, 'changedKeys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k), 'before', to_jsonb(g)));
  return jsonb_build_object('id', p_id, 'rowVersion', g.row_version + 1);
end;
$$;
-- restaura other_guarantee_update(uuid, integer, jsonb) com o corpo de 20261122201000_seguros_garantias_rpcs
create or replace function public.other_guarantee_update(p_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.other_guarantees%rowtype;
begin
  select * into g from public.other_guarantees where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(g.project_id, 'MANAGE');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if g.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, g.row_version; end if;
  update public.other_guarantees set
    amount = case when p_data ? 'amount' then (p_data ->> 'amount')::numeric else amount end,
    start_date = case when p_data ? 'start_date' then (p_data ->> 'start_date')::date else start_date end,
    end_date = case when p_data ? 'end_date' then (p_data ->> 'end_date')::date else end_date end,
    release_conditions = case when p_data ? 'release_conditions' then public.insurance_int_text(p_data, 'release_conditions') else release_conditions end,
    status = case when p_data ? 'status' then p_data ->> 'status' else status end,
    notes = case when p_data ? 'notes' then public.insurance_int_text(p_data, 'notes') else notes end,
    row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
  where id = p_id;
  perform public.insurance_int_audit(g.project_id, 'OTHER_GUARANTEE', p_id, 'OTHER_GUARANTEE_UPDATED',
    jsonb_build_object('fromRowVersion', g.row_version, 'changedKeys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k), 'before', to_jsonb(g)));
  return jsonb_build_object('id', p_id, 'rowVersion', g.row_version + 1);
end;
$$;
-- restaura insurance_claim_advance(uuid, integer, text, jsonb) com o corpo de 20261123102000_insurance_claim_advance_manage_stages
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
begin
  select * into c from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- Fase 3/B: registrar andamento operacional = REGISTER; registrar a DECISÃO da seguradora, a negativa, a contestação,
  -- a indenização/cumprimento ou o ENCERRAMENTO do evento = ato de gestão (MANAGE). Antes (20261122201000) tudo era REGISTER.
  perform public.insurance_int_require(c.project_id,
    case when p_to_stage in ('DECISAO', 'NEGATIVA', 'CONTESTACAO', 'INDENIZACAO_CUMPRIMENTO', 'ENCERRADO') then 'MANAGE' else 'REGISTER' end);
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if c.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, c.row_version; end if;
  if not public.insurance_claim_transition_allowed(c.stage, p_to_stage) then raise exception 'INVALID_TRANSITION: % -> %', c.stage, p_to_stage; end if;
  perform public.insurance_int_same_project('documents', v_doc, c.project_id);
  if p_to_stage in ('NEGATIVA', 'CONTESTACAO', 'DOC_COMPLEMENTAR', 'ENCERRADO') and char_length(coalesce(v_note, '')) < 10 then raise exception 'NOTE_REQUIRED'; end if;
  if p_to_stage = 'DECISAO' then
    if v_outcome is null or v_outcome not in ('DEFERIDO', 'INDEFERIDO', 'PARCIAL') then raise exception 'DECISION_OUTCOME_REQUIRED'; end if;
  end if;
  if p_to_stage = 'INDENIZACAO_CUMPRIMENTO' and coalesce(c.decision_outcome, '') not in ('DEFERIDO', 'PARCIAL') then
    raise exception 'DECISION_DOES_NOT_ALLOW_PAYMENT';
  end if;
  update public.insurance_claims set stage = p_to_stage,
      protocol = coalesce(v_protocol, protocol),
      decision_outcome = case when p_to_stage = 'DECISAO' then v_outcome when p_to_stage = 'NEGATIVA' then 'INDEFERIDO' else decision_outcome end,
      row_version = row_version + 1, updated_at = now()
   where id = p_claim_id;
  insert into public.insurance_claim_steps (project_id, claim_id, from_stage, stage, protocol, note, document_id, created_by)
  values (c.project_id, p_claim_id, c.stage, p_to_stage, v_protocol, v_note, v_doc, auth.uid());
  perform public.insurance_int_audit(c.project_id, 'INSURANCE_CLAIM', p_claim_id, 'CLAIM_STAGE_' || p_to_stage,
    jsonb_build_object('fromStage', c.stage, 'toStage', p_to_stage, 'protocol', v_protocol, 'decisionOutcome', v_outcome));
  return jsonb_build_object('id', p_claim_id, 'stage', p_to_stage, 'rowVersion', c.row_version + 1);
end;
$$;
revoke all on function public.insurance_claim_advance(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.insurance_claim_advance(uuid, integer, text, jsonb) to authenticated;
drop index if exists public.insurance_guarantee_updates_idx;
alter table public.insurance_claim_steps drop column if exists source_refs;
commit;
