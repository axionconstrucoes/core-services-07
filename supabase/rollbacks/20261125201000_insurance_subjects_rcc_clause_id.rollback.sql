-- ROLLBACK (manual, NAO e migration) de 20261125201000_insurance_subjects_rcc_clause_id.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'insurance_policy_parties' and column_name = 'tax_id_normalized') then
    select count(*) into n from public.insurance_policy_parties where tax_id_normalized is distinct from null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_policy_parties.tax_id_normalized tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'insurance_policy_clauses' and column_name = 'clause_identifier') then
    select count(*) into n from public.insurance_policy_clauses where clause_identifier is distinct from null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_policy_clauses.clause_identifier tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
end $$;
drop trigger if exists insurance_party_guard_ins on public.insurance_policy_parties;
drop trigger if exists insurance_party_guard_upd on public.insurance_policy_parties;
drop trigger if exists insurance_expected_subject_guard_trg on public.insurance_expected_subjects;
drop function if exists public.insurance_tax_id_valid(text);
drop function if exists public.insurance_party_guard();
drop function if exists public.insurance_expected_subject_guard();
drop function if exists public.insurance_rcc_readiness(uuid, uuid);
-- restaura insurance_policy_clause_add(uuid, integer, jsonb) com o corpo de 20261122201000_seguros_garantias_rpcs
create or replace function public.insurance_policy_clause_add(p_policy_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  p public.insurance_policies%rowtype;
  v_proj uuid;
  v_id uuid;
  v_no integer;
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'MANAGE');
  p := public.insurance_int_lock_policy(p_policy_id, p_expected_row_version);
  perform public.insurance_int_same_project('documents', v_src, v_proj);
  insert into public.insurance_policy_clauses (project_id, policy_id, kind, title, clause_text, amount, deadline_days, applies_to, source_document_id, source_ref, source_page, verified, added_in_version, created_by)
  values (v_proj, p_policy_id, p_data ->> 'kind', coalesce(p_data ->> 'title', ''), public.insurance_int_text(p_data, 'clause_text'),
    (p_data ->> 'amount')::numeric, (p_data ->> 'deadline_days')::integer,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'applies_to', '[]'::jsonb)) x), '{}'),
    v_src, public.insurance_int_text(p_data, 'source_ref'), public.insurance_int_text(p_data, 'source_page'),
    coalesce((p_data ->> 'verified')::boolean, false), p.version_no + 1, v_uid)
  returning id into v_id;
  v_no := public.insurance_int_bump_policy(p_policy_id, 'Cláusula adicionada: ' || coalesce(p_data ->> 'kind', '?'));
  perform public.insurance_int_audit(v_proj, 'INSURANCE_POLICY_CLAUSE', v_id, 'CLAUSE_ADDED',
    jsonb_build_object('policyId', p_policy_id, 'kind', p_data ->> 'kind', 'versionNo', v_no));
  return jsonb_build_object('id', v_id, 'versionNo', v_no, 'rowVersion', p_expected_row_version + 1);
end;
$$;
alter table public.insurance_policy_parties drop column if exists tax_id_normalized;
alter table public.insurance_policy_clauses drop column if exists clause_identifier;
commit;
