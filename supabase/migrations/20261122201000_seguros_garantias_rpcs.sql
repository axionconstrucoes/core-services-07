-- ============================================================
-- 20261122201000_seguros_garantias_rpcs.sql
--
-- Agente S1 (fase 1) — RPCs atômicas do domínio de seguros/garantias.
-- Todas: security definer, search_path = '', EXECUTE só para authenticated (anon/public sem acesso), auth.uid() obrigatório,
-- papel validado por insurance_access (fail-closed), AUDITORIA em insurance_audit_events na MESMA transação e
-- CONCORRÊNCIA OTIMISTA (p_expected_row_version + SELECT ... FOR UPDATE: duas transições simultâneas => uma vence, a
-- outra recebe VERSION_CONFLICT).
--
-- Nenhuma RPC envia e-mail/mensagem. insurance_draft_attempt_send NUNCA envia: apenas registra a tentativa bloqueada.
-- ============================================================

-- ---------- Núcleos internos (sem grant) ----------
create or replace function public.insurance_int_require(p_project_id uuid, p_level text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.insurance_access(p_project_id, p_level) then raise exception 'FORBIDDEN'; end if;
  return v_uid;
end;
$$;

create or replace function public.insurance_int_audit(p_project_id uuid, p_entity_type text, p_entity_id uuid, p_action text, p_detail jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.insurance_audit_events (project_id, entity_type, entity_id, action, actor_user_id, detail)
  values (p_project_id, p_entity_type, p_entity_id, p_action, auth.uid(), coalesce(p_detail, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

-- Garante que a referência (documento/apólice/...) existe E pertence ao mesmo projeto (sem vazar existência).
create or replace function public.insurance_int_same_project(p_table text, p_id uuid, p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_proj uuid;
begin
  if p_id is null then return; end if;
  if p_table not in ('documents', 'insurance_policies', 'bank_guarantees', 'other_guarantees', 'insurance_advances',
                     'insurance_claims', 'insurance_endorsements', 'insurance_policy_clauses', 'insurance_official_channels') then
    raise exception 'INVALID_REFERENCE_TABLE';
  end if;
  execute format('select project_id from public.%I where id = $1', p_table) into v_proj using p_id;
  if v_proj is distinct from p_project_id then raise exception 'REFERENCE_OUT_OF_PROJECT'; end if;
end;
$$;

create or replace function public.insurance_int_text(p_data jsonb, p_key text)
returns text
language sql
immutable
set search_path = ''
as $$ select nullif(btrim(coalesce(p_data ->> p_key, '')), ''); $$;

create or replace function public.insurance_int_uuid(p_data jsonb, p_key text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare v text := nullif(btrim(coalesce(p_data ->> p_key, '')), '');
begin
  if v is null then return null; end if;
  return v::uuid;
exception when invalid_text_representation then raise exception 'INVALID_UUID_%', upper(p_key);
end;
$$;

create or replace function public.insurance_int_norm_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$ select lower(regexp_replace(btrim(coalesce(p_text, '')), '\s+', ' ', 'g')); $$;

-- Snapshot da apólice (versões preservadas; nunca sobrescritas)
create or replace function public.insurance_int_policy_snapshot(p_policy_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare p public.insurance_policies%rowtype;
begin
  select * into p from public.insurance_policies where id = p_policy_id;
  insert into public.insurance_policy_versions (project_id, policy_id, version_no, snapshot, change_reason, created_by)
  values (p.project_id, p.id, p.version_no, jsonb_build_object(
      'policy', to_jsonb(p),
      'parties', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from public.insurance_policy_parties x where x.policy_id = p.id), '[]'::jsonb),
      'clauses', coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at, x.id) from public.insurance_policy_clauses x where x.policy_id = p.id), '[]'::jsonb)
    ), p_reason, auth.uid());
end;
$$;

-- Trava a apólice, confere a versão otimista e devolve a linha
create or replace function public.insurance_int_lock_policy(p_policy_id uuid, p_expected integer)
returns public.insurance_policies
language plpgsql
security definer
set search_path = ''
as $$
declare p public.insurance_policies%rowtype;
begin
  select * into p from public.insurance_policies where id = p_policy_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p_expected is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p.row_version <> p_expected then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected, p.row_version; end if;
  return p;
end;
$$;

create or replace function public.insurance_int_bump_policy(p_policy_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_no integer;
begin
  update public.insurance_policies
     set version_no = version_no + 1, row_version = row_version + 1, updated_at = now(), updated_by = auth.uid()
   where id = p_policy_id returning version_no into v_no;
  perform public.insurance_int_policy_snapshot(p_policy_id, p_reason);
  return v_no;
end;
$$;

-- Transições permitidas do sinistro (espelhadas em apps/web/lib/insurance/claim-stages.ts)
create or replace function public.insurance_claim_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_from
    when 'EXPECTATIVA' then p_to in ('AVISO', 'ENCERRADO')
    when 'AVISO' then p_to in ('RECLAMACAO', 'DOC_COMPLEMENTAR', 'REGULACAO', 'ENCERRADO')
    when 'RECLAMACAO' then p_to in ('DOC_COMPLEMENTAR', 'REGULACAO', 'DECISAO', 'NEGATIVA', 'ENCERRADO')
    when 'DOC_COMPLEMENTAR' then p_to in ('REGULACAO', 'DECISAO', 'NEGATIVA', 'ENCERRADO')
    when 'REGULACAO' then p_to in ('DOC_COMPLEMENTAR', 'DECISAO', 'NEGATIVA', 'ENCERRADO')
    when 'DECISAO' then p_to in ('INDENIZACAO_CUMPRIMENTO', 'NEGATIVA', 'CONTESTACAO', 'ENCERRADO')
    when 'NEGATIVA' then p_to in ('CONTESTACAO', 'ENCERRADO')
    when 'CONTESTACAO' then p_to in ('REGULACAO', 'DECISAO', 'NEGATIVA', 'ENCERRADO')
    when 'INDENIZACAO_CUMPRIMENTO' then p_to in ('CONTESTACAO', 'ENCERRADO')
    else false
  end;
$$;
grant execute on function public.insurance_claim_transition_allowed(text, text) to authenticated;

revoke all on function public.insurance_int_require(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_audit(uuid, text, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_same_project(text, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_policy_snapshot(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_lock_policy(uuid, integer) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_bump_policy(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_text(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_uuid(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function public.insurance_int_norm_text(text) from public, anon, authenticated, service_role;

-- ============================================================
-- Apólices
-- ============================================================
create or replace function public.insurance_policy_create(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'MANAGE');
  v_id uuid;
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ctr uuid := public.insurance_int_uuid(p_data, 'contract_document_id');
begin
  perform public.insurance_int_same_project('documents', v_src, p_project_id);
  perform public.insurance_int_same_project('documents', v_ctr, p_project_id);
  insert into public.insurance_policies (project_id, modality, policy_number, insurer_name, broker_name, contract_document_id, contract_number,
    source_document_id, source_ref, status, coverage_start, coverage_end, max_amount, currency, notes, created_by, updated_by)
  values (p_project_id, p_data ->> 'modality', public.insurance_int_text(p_data, 'policy_number'), coalesce(p_data ->> 'insurer_name', ''),
    public.insurance_int_text(p_data, 'broker_name'), v_ctr, public.insurance_int_text(p_data, 'contract_number'),
    v_src, public.insurance_int_text(p_data, 'source_ref'), coalesce(public.insurance_int_text(p_data, 'status'), 'RASCUNHO'),
    (p_data ->> 'coverage_start')::date, (p_data ->> 'coverage_end')::date, (p_data ->> 'max_amount')::numeric,
    coalesce(public.insurance_int_text(p_data, 'currency'), 'BRL'), public.insurance_int_text(p_data, 'notes'), v_uid, v_uid)
  returning id into v_id;
  perform public.insurance_int_policy_snapshot(v_id, 'Criação da apólice');
  perform public.insurance_int_audit(p_project_id, 'INSURANCE_POLICY', v_id, 'POLICY_CREATED',
    jsonb_build_object('modality', p_data ->> 'modality', 'sourceDocumentId', v_src, 'sourceRef', public.insurance_int_text(p_data, 'source_ref')));
  return jsonb_build_object('id', v_id, 'versionNo', 1, 'rowVersion', 1);
end;
$$;

create or replace function public.insurance_policy_new_version(p_policy_id uuid, p_expected_row_version integer, p_data jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  p public.insurance_policies%rowtype;
  v_proj uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_no integer;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'MANAGE');
  if char_length(v_reason) < 10 then raise exception 'REASON_REQUIRED'; end if;
  p := public.insurance_int_lock_policy(p_policy_id, p_expected_row_version);
  perform public.insurance_int_same_project('documents', public.insurance_int_uuid(p_data, 'source_document_id'), v_proj);
  perform public.insurance_int_same_project('documents', public.insurance_int_uuid(p_data, 'contract_document_id'), v_proj);
  update public.insurance_policies set
    policy_number = case when p_data ? 'policy_number' then public.insurance_int_text(p_data, 'policy_number') else policy_number end,
    insurer_name = case when p_data ? 'insurer_name' then coalesce(p_data ->> 'insurer_name', '') else insurer_name end,
    broker_name = case when p_data ? 'broker_name' then public.insurance_int_text(p_data, 'broker_name') else broker_name end,
    contract_document_id = case when p_data ? 'contract_document_id' then public.insurance_int_uuid(p_data, 'contract_document_id') else contract_document_id end,
    contract_number = case when p_data ? 'contract_number' then public.insurance_int_text(p_data, 'contract_number') else contract_number end,
    source_document_id = case when p_data ? 'source_document_id' then public.insurance_int_uuid(p_data, 'source_document_id') else source_document_id end,
    source_ref = case when p_data ? 'source_ref' then public.insurance_int_text(p_data, 'source_ref') else source_ref end,
    status = case when p_data ? 'status' then p_data ->> 'status' else status end,
    coverage_start = case when p_data ? 'coverage_start' then (p_data ->> 'coverage_start')::date else coverage_start end,
    coverage_end = case when p_data ? 'coverage_end' then (p_data ->> 'coverage_end')::date else coverage_end end,
    max_amount = case when p_data ? 'max_amount' then (p_data ->> 'max_amount')::numeric else max_amount end,
    notes = case when p_data ? 'notes' then public.insurance_int_text(p_data, 'notes') else notes end
  where id = p_policy_id;
  v_no := public.insurance_int_bump_policy(p_policy_id, v_reason);
  perform public.insurance_int_audit(v_proj, 'INSURANCE_POLICY', p_policy_id, 'POLICY_NEW_VERSION',
    jsonb_build_object('fromVersion', p.version_no, 'toVersion', v_no, 'reason', v_reason, 'changedKeys', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(p_data) k)));
  return jsonb_build_object('id', p_policy_id, 'versionNo', v_no, 'rowVersion', p_expected_row_version + 1);
end;
$$;

create or replace function public.insurance_policy_party_add(p_policy_id uuid, p_expected_row_version integer, p_data jsonb)
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
  insert into public.insurance_policy_parties (project_id, policy_id, party_role, party_name, tax_id, identification_status, source_document_id, source_ref, added_in_version, created_by)
  values (v_proj, p_policy_id, p_data ->> 'party_role', public.insurance_int_text(p_data, 'party_name'), public.insurance_int_text(p_data, 'tax_id'),
    coalesce(public.insurance_int_text(p_data, 'identification_status'), 'IDENTIFICADO'), v_src, public.insurance_int_text(p_data, 'source_ref'), p.version_no + 1, v_uid)
  returning id into v_id;
  v_no := public.insurance_int_bump_policy(p_policy_id, 'Parte adicionada: ' || coalesce(p_data ->> 'party_role', '?'));
  perform public.insurance_int_audit(v_proj, 'INSURANCE_POLICY_PARTY', v_id, 'PARTY_ADDED',
    jsonb_build_object('policyId', p_policy_id, 'role', p_data ->> 'party_role', 'identificationStatus', coalesce(p_data ->> 'identification_status', 'IDENTIFICADO'), 'versionNo', v_no));
  return jsonb_build_object('id', v_id, 'versionNo', v_no, 'rowVersion', p_expected_row_version + 1);
end;
$$;

create or replace function public.insurance_policy_party_set_active(p_party_id uuid, p_expected_row_version integer, p_active boolean, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy uuid;
  v_proj uuid;
  v_no integer;
begin
  select policy_id, project_id into v_policy, v_proj from public.insurance_policy_parties where id = p_party_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(v_proj, 'MANAGE');
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'REASON_REQUIRED'; end if;
  perform public.insurance_int_lock_policy(v_policy, p_expected_row_version);
  update public.insurance_policy_parties set active = coalesce(p_active, true) where id = p_party_id;
  v_no := public.insurance_int_bump_policy(v_policy, 'Parte ' || case when p_active then 'reativada' else 'desativada' end || ': ' || btrim(p_reason));
  perform public.insurance_int_audit(v_proj, 'INSURANCE_POLICY_PARTY', p_party_id, 'PARTY_SET_ACTIVE', jsonb_build_object('active', p_active, 'reason', btrim(p_reason), 'versionNo', v_no));
  return jsonb_build_object('id', p_party_id, 'versionNo', v_no, 'rowVersion', p_expected_row_version + 1);
end;
$$;

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

-- ============================================================
-- Canal oficial de recebimento (dado cadastrado com fonte)
-- ============================================================
create or replace function public.insurance_channel_register(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'MANAGE');
  v_id uuid;
  v_pol uuid := public.insurance_int_uuid(p_data, 'policy_id');
  v_bank uuid := public.insurance_int_uuid(p_data, 'bank_guarantee_id');
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
begin
  perform public.insurance_int_same_project('insurance_policies', v_pol, p_project_id);
  perform public.insurance_int_same_project('bank_guarantees', v_bank, p_project_id);
  perform public.insurance_int_same_project('documents', v_src, p_project_id);
  insert into public.insurance_official_channels (project_id, policy_id, bank_guarantee_id, entity_name, channel_type, channel_value, source_document_id, source_ref, created_by)
  values (p_project_id, v_pol, v_bank, coalesce(p_data ->> 'entity_name', ''), p_data ->> 'channel_type', coalesce(p_data ->> 'channel_value', ''), v_src, public.insurance_int_text(p_data, 'source_ref'), v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(p_project_id, 'INSURANCE_CHANNEL', v_id, 'CHANNEL_REGISTERED',
    jsonb_build_object('channelType', p_data ->> 'channel_type', 'entityName', p_data ->> 'entity_name', 'policyId', v_pol, 'bankGuaranteeId', v_bank));
  return jsonb_build_object('id', v_id, 'verified', false);
end;
$$;

create or replace function public.insurance_channel_verify(p_channel_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_uid uuid;
begin
  select project_id into v_proj from public.insurance_official_channels where id = p_channel_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(v_proj, 'MANAGE');
  update public.insurance_official_channels set verified_at = now(), verified_by = v_uid where id = p_channel_id;
  perform public.insurance_int_audit(v_proj, 'INSURANCE_CHANNEL', p_channel_id, 'CHANNEL_VERIFIED', '{}'::jsonb);
  return jsonb_build_object('id', p_channel_id, 'verified', true);
end;
$$;

-- ============================================================
-- Fiança bancária e outras garantias (entidades próprias, NÃO seguro)
-- ============================================================
create or replace function public.bank_guarantee_register(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'MANAGE');
  v_id uuid;
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ctr uuid := public.insurance_int_uuid(p_data, 'contract_document_id');
begin
  perform public.insurance_int_same_project('documents', v_src, p_project_id);
  perform public.insurance_int_same_project('documents', v_ctr, p_project_id);
  insert into public.bank_guarantees (project_id, bank_name, guarantee_number, beneficiary_name, principal_name, amount, currency, start_date, end_date,
    calls_on_first_demand, claim_procedure_note, contract_document_id, contract_number, source_document_id, source_ref, status, notes, created_by, updated_by)
  values (p_project_id, coalesce(p_data ->> 'bank_name', ''), public.insurance_int_text(p_data, 'guarantee_number'), public.insurance_int_text(p_data, 'beneficiary_name'),
    public.insurance_int_text(p_data, 'principal_name'), (p_data ->> 'amount')::numeric, coalesce(public.insurance_int_text(p_data, 'currency'), 'BRL'),
    (p_data ->> 'start_date')::date, (p_data ->> 'end_date')::date, (p_data ->> 'calls_on_first_demand')::boolean, public.insurance_int_text(p_data, 'claim_procedure_note'),
    v_ctr, public.insurance_int_text(p_data, 'contract_number'), v_src, public.insurance_int_text(p_data, 'source_ref'),
    coalesce(public.insurance_int_text(p_data, 'status'), 'RASCUNHO'), public.insurance_int_text(p_data, 'notes'), v_uid, v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(p_project_id, 'BANK_GUARANTEE', v_id, 'BANK_GUARANTEE_REGISTERED', jsonb_build_object('sourceDocumentId', v_src, 'sourceRef', public.insurance_int_text(p_data, 'source_ref')));
  return jsonb_build_object('id', v_id, 'rowVersion', 1);
end;
$$;

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

create or replace function public.other_guarantee_register(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'MANAGE');
  v_id uuid;
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ctr uuid := public.insurance_int_uuid(p_data, 'contract_document_id');
begin
  perform public.insurance_int_same_project('documents', v_src, p_project_id);
  perform public.insurance_int_same_project('documents', v_ctr, p_project_id);
  insert into public.other_guarantees (project_id, guarantee_type, caucao_form, issuer_name, beneficiary_name, principal_name, amount, currency, start_date, end_date,
    release_conditions, contract_document_id, contract_number, source_document_id, source_ref, status, notes, created_by, updated_by)
  values (p_project_id, p_data ->> 'guarantee_type', public.insurance_int_text(p_data, 'caucao_form'), public.insurance_int_text(p_data, 'issuer_name'),
    public.insurance_int_text(p_data, 'beneficiary_name'), public.insurance_int_text(p_data, 'principal_name'), (p_data ->> 'amount')::numeric,
    coalesce(public.insurance_int_text(p_data, 'currency'), 'BRL'), (p_data ->> 'start_date')::date, (p_data ->> 'end_date')::date,
    public.insurance_int_text(p_data, 'release_conditions'), v_ctr, public.insurance_int_text(p_data, 'contract_number'), v_src,
    public.insurance_int_text(p_data, 'source_ref'), coalesce(public.insurance_int_text(p_data, 'status'), 'RASCUNHO'), public.insurance_int_text(p_data, 'notes'), v_uid, v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(p_project_id, 'OTHER_GUARANTEE', v_id, 'OTHER_GUARANTEE_REGISTERED', jsonb_build_object('guaranteeType', p_data ->> 'guarantee_type'));
  return jsonb_build_object('id', v_id, 'rowVersion', 1);
end;
$$;

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

-- ============================================================
-- Endossos: SOLICITADO -> EM_ANALISE -> EMITIDO -> CONFERIDO (ou RECUSADO). Pedido != emitido.
-- ============================================================
create or replace function public.insurance_endorsement_request(p_policy_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_uid uuid;
  v_id uuid;
  v_seq integer;
  v_doc uuid := public.insurance_int_uuid(p_data, 'request_document_id');
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'REGISTER');
  perform public.insurance_int_same_project('documents', v_doc, v_proj);
  perform 1 from public.insurance_policies where id = p_policy_id for update; -- serializa a numeração
  select coalesce(max(endorsement_seq), 0) + 1 into v_seq from public.insurance_endorsements where policy_id = p_policy_id;
  insert into public.insurance_endorsements (project_id, policy_id, endorsement_seq, state, requested_text, requested_by, request_document_id, request_ref)
  values (v_proj, p_policy_id, v_seq, 'SOLICITADO', coalesce(p_data ->> 'requested_text', ''), v_uid, v_doc, public.insurance_int_text(p_data, 'request_ref'))
  returning id into v_id;
  perform public.insurance_int_audit(v_proj, 'INSURANCE_ENDORSEMENT', v_id, 'ENDORSEMENT_REQUESTED',
    jsonb_build_object('policyId', p_policy_id, 'seq', v_seq, 'coverageEffective', false, 'note', 'Pedido de endosso NÃO é endosso emitido; sem efeito de cobertura.'));
  return jsonb_build_object('id', v_id, 'seq', v_seq, 'state', 'SOLICITADO', 'coverageEffective', false, 'rowVersion', 1);
end;
$$;

create or replace function public.insurance_endorsement_advance(p_id uuid, p_expected_row_version integer, p_to_state text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.insurance_endorsements%rowtype;
  v_uid uuid;
  v_match boolean;
  v_issued_doc uuid;
  v_note text;
begin
  select * into e from public.insurance_endorsements where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(e.project_id, case when p_to_state = 'EM_ANALISE' then 'REGISTER' else 'MANAGE' end);
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if e.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, e.row_version; end if;
  if not (
    (e.state = 'SOLICITADO' and p_to_state in ('EM_ANALISE', 'EMITIDO', 'RECUSADO'))
    or (e.state = 'EM_ANALISE' and p_to_state in ('EMITIDO', 'RECUSADO'))
    or (e.state = 'EMITIDO' and p_to_state = 'CONFERIDO')
  ) then
    raise exception 'INVALID_TRANSITION: % -> %', e.state, p_to_state;
  end if;

  if p_to_state = 'EM_ANALISE' then
    update public.insurance_endorsements set state = 'EM_ANALISE', row_version = row_version + 1, updated_at = now() where id = p_id;
  elsif p_to_state = 'EMITIDO' then
    v_issued_doc := public.insurance_int_uuid(p_data, 'issued_document_id');
    if v_issued_doc is null then raise exception 'ISSUED_DOCUMENT_REQUIRED'; end if;
    perform public.insurance_int_same_project('documents', v_issued_doc, e.project_id);
    if public.insurance_int_text(p_data, 'issued_text') is null then raise exception 'ISSUED_TEXT_REQUIRED'; end if;
    if public.insurance_int_text(p_data, 'issued_number') is null then raise exception 'ISSUED_NUMBER_REQUIRED'; end if;
    v_match := public.insurance_int_norm_text(e.requested_text) = public.insurance_int_norm_text(p_data ->> 'issued_text');
    update public.insurance_endorsements set state = 'EMITIDO', issued_text = p_data ->> 'issued_text', issued_at = coalesce((p_data ->> 'issued_at')::timestamptz, now()),
      issued_by = v_uid, issued_document_id = v_issued_doc, issued_number = p_data ->> 'issued_number', texts_match = v_match,
      row_version = row_version + 1, updated_at = now() where id = p_id;
  elsif p_to_state = 'CONFERIDO' then
    v_note := public.insurance_int_text(p_data, 'divergence_note');
    if not coalesce(e.texts_match, false) and (v_note is null or char_length(v_note) < 20) then raise exception 'DIVERGENCE_NOTE_REQUIRED'; end if;
    update public.insurance_endorsements set state = 'CONFERIDO', verified_at = now(), verified_by = v_uid, divergence_note = v_note,
      comparison = coalesce(p_data -> 'comparison', jsonb_build_object('textsMatch', e.texts_match, 'source', 'sql-normalized-compare')),
      coverage_effective = true, row_version = row_version + 1, updated_at = now() where id = p_id;
  else -- RECUSADO
    if char_length(coalesce(public.insurance_int_text(p_data, 'refusal_note'), '')) < 10 then raise exception 'REFUSAL_NOTE_REQUIRED'; end if;
    update public.insurance_endorsements set state = 'RECUSADO', refusal_note = p_data ->> 'refusal_note', row_version = row_version + 1, updated_at = now() where id = p_id;
  end if;

  perform public.insurance_int_audit(e.project_id, 'INSURANCE_ENDORSEMENT', p_id, 'ENDORSEMENT_' || p_to_state,
    jsonb_build_object('fromState', e.state, 'toState', p_to_state, 'policyId', e.policy_id, 'textsMatch', v_match,
      'coverageEffective', p_to_state = 'CONFERIDO'));
  return (select jsonb_build_object('id', id, 'state', state, 'coverageEffective', coverage_effective, 'textsMatch', texts_match, 'rowVersion', row_version)
          from public.insurance_endorsements where id = p_id);
end;
$$;

-- ============================================================
-- Adiantamentos
-- ============================================================
create or replace function public.insurance_advance_register(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'REGISTER');
  v_id uuid;
  v_pol uuid := public.insurance_int_uuid(p_data, 'policy_id');
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ctr uuid := public.insurance_int_uuid(p_data, 'contract_document_id');
  v_app uuid := public.insurance_int_uuid(p_data, 'application_document_id');
begin
  perform public.insurance_int_same_project('insurance_policies', v_pol, p_project_id);
  perform public.insurance_int_same_project('documents', v_src, p_project_id);
  perform public.insurance_int_same_project('documents', v_ctr, p_project_id);
  perform public.insurance_int_same_project('documents', v_app, p_project_id);
  insert into public.insurance_advances (project_id, policy_id, contract_document_id, contract_number, advanced_amount, advance_date, purpose,
    application_documented, application_document_id, guaranteed_limit, balance_due_informed, indemnifiable_informed, source_document_id, source_ref, notes, created_by)
  values (p_project_id, v_pol, v_ctr, public.insurance_int_text(p_data, 'contract_number'), (p_data ->> 'advanced_amount')::numeric, (p_data ->> 'advance_date')::date,
    coalesce(p_data ->> 'purpose', ''), v_app is not null, v_app, (p_data ->> 'guaranteed_limit')::numeric, (p_data ->> 'balance_due_informed')::numeric,
    (p_data ->> 'indemnifiable_informed')::numeric, v_src, public.insurance_int_text(p_data, 'source_ref'), public.insurance_int_text(p_data, 'notes'), v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(p_project_id, 'INSURANCE_ADVANCE', v_id, 'ADVANCE_REGISTERED',
    jsonb_build_object('advancedAmount', p_data ->> 'advanced_amount', 'applicationDocumented', v_app is not null, 'policyId', v_pol));
  return jsonb_build_object('id', v_id, 'rowVersion', 1);
end;
$$;

create or replace function public.insurance_advance_amortize(p_advance_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.insurance_advances%rowtype;
  v_amount numeric(18, 2) := (p_data ->> 'amount')::numeric;
  v_done numeric(18, 2);
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_id uuid;
begin
  select * into a from public.insurance_advances where id = p_advance_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(a.project_id, 'REGISTER');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if a.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, a.row_version; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'AMOUNT_INVALID'; end if;
  perform public.insurance_int_same_project('documents', v_src, a.project_id);
  select coalesce(sum(amount), 0) into v_done from public.insurance_advance_amortizations where advance_id = p_advance_id;
  if v_done + v_amount > a.advanced_amount then raise exception 'AMORTIZATION_EXCEEDS_BALANCE: saldo %', a.advanced_amount - v_done; end if;
  insert into public.insurance_advance_amortizations (project_id, advance_id, amount, amortized_on, source_document_id, source_ref, note, created_by)
  values (a.project_id, p_advance_id, v_amount, (p_data ->> 'amortized_on')::date, v_src, public.insurance_int_text(p_data, 'source_ref'), public.insurance_int_text(p_data, 'note'), auth.uid())
  returning id into v_id;
  update public.insurance_advances set row_version = row_version + 1, updated_at = now() where id = p_advance_id;
  perform public.insurance_int_audit(a.project_id, 'INSURANCE_ADVANCE', p_advance_id, 'ADVANCE_AMORTIZED',
    jsonb_build_object('amortizationId', v_id, 'amount', v_amount, 'unamortizedAfter', a.advanced_amount - v_done - v_amount));
  return jsonb_build_object('id', v_id, 'unamortized', a.advanced_amount - v_done - v_amount, 'rowVersion', a.row_version + 1);
end;
$$;

-- Saldos (security invoker: RLS vale). valor adiantado != saldo devido (informado) != valor indenizável (informado).
create or replace function public.insurance_advance_balance(p_advance_id uuid)
returns table (advance_id uuid, advanced_amount numeric, amortized_amount numeric, unamortized_amount numeric,
               guaranteed_limit numeric, uncovered_excess numeric, balance_due_informed numeric, indemnifiable_informed numeric)
language sql
stable
set search_path = ''
as $$
  select a.id, a.advanced_amount,
         coalesce(s.total, 0), a.advanced_amount - coalesce(s.total, 0),
         a.guaranteed_limit,
         case when a.guaranteed_limit is null then null else greatest(a.advanced_amount - coalesce(s.total, 0) - a.guaranteed_limit, 0) end,
         a.balance_due_informed, a.indemnifiable_informed
  from public.insurance_advances a
  left join lateral (select sum(m.amount) total from public.insurance_advance_amortizations m where m.advance_id = a.id) s on true
  where a.id = p_advance_id;
$$;

-- ============================================================
-- Sinistros / eventos
-- ============================================================
create or replace function public.insurance_claim_open(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'REGISTER');
  v_id uuid;
  v_stage text := coalesce(public.insurance_int_text(p_data, 'stage'), 'AVISO');
  v_pol uuid := public.insurance_int_uuid(p_data, 'policy_id');
  v_bank uuid := public.insurance_int_uuid(p_data, 'bank_guarantee_id');
  v_oth uuid := public.insurance_int_uuid(p_data, 'other_guarantee_id');
  v_adv uuid := public.insurance_int_uuid(p_data, 'advance_id');
  v_clause uuid := public.insurance_int_uuid(p_data, 'contractual_basis_clause_id');
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_clause_pol uuid;
begin
  if v_stage not in ('EXPECTATIVA', 'AVISO', 'RECLAMACAO') then raise exception 'INVALID_INITIAL_STAGE'; end if;
  perform public.insurance_int_same_project('insurance_policies', v_pol, p_project_id);
  perform public.insurance_int_same_project('bank_guarantees', v_bank, p_project_id);
  perform public.insurance_int_same_project('other_guarantees', v_oth, p_project_id);
  perform public.insurance_int_same_project('insurance_advances', v_adv, p_project_id);
  perform public.insurance_int_same_project('insurance_policy_clauses', v_clause, p_project_id);
  perform public.insurance_int_same_project('documents', v_src, p_project_id);
  if v_stage = 'EXPECTATIVA' then
    -- expectativa de sinistro só quando contratualmente prevista: exige a cláusula (da própria apólice) ou nota fundamentada
    if v_clause is not null then
      select policy_id into v_clause_pol from public.insurance_policy_clauses where id = v_clause;
      if v_pol is null or v_clause_pol is distinct from v_pol then raise exception 'EXPECTATIVA_BASIS_MISMATCH'; end if;
    elsif char_length(coalesce(public.insurance_int_text(p_data, 'contractual_basis_note'), '')) < 10 then
      raise exception 'EXPECTATIVA_BASIS_REQUIRED';
    end if;
  end if;
  insert into public.insurance_claims (project_id, policy_id, bank_guarantee_id, other_guarantee_id, advance_id, claim_kind, title, stage, protocol, occurrence_date,
    claimed_amount, notice_deadline_at, notice_deadline_basis, contractual_basis_clause_id, contractual_basis_note, no_instrument_reason, source_document_id, source_ref, created_by)
  values (p_project_id, v_pol, v_bank, v_oth, v_adv, p_data ->> 'claim_kind', coalesce(p_data ->> 'title', ''), v_stage, public.insurance_int_text(p_data, 'protocol'),
    (p_data ->> 'occurrence_date')::date, (p_data ->> 'claimed_amount')::numeric, (p_data ->> 'notice_deadline_at')::timestamptz, public.insurance_int_text(p_data, 'notice_deadline_basis'),
    v_clause, public.insurance_int_text(p_data, 'contractual_basis_note'), public.insurance_int_text(p_data, 'no_instrument_reason'), v_src, public.insurance_int_text(p_data, 'source_ref'), v_uid)
  returning id into v_id;
  insert into public.insurance_claim_steps (project_id, claim_id, from_stage, stage, protocol, note, created_by)
  values (p_project_id, v_id, null, v_stage, public.insurance_int_text(p_data, 'protocol'), 'Abertura do evento', v_uid);
  perform public.insurance_int_audit(p_project_id, 'INSURANCE_CLAIM', v_id, 'CLAIM_OPENED',
    jsonb_build_object('stage', v_stage, 'claimKind', p_data ->> 'claim_kind', 'instrumentMissing', v_pol is null and v_bank is null and v_oth is null));
  return jsonb_build_object('id', v_id, 'stage', v_stage, 'rowVersion', 1);
end;
$$;

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
  perform public.insurance_int_require(c.project_id, 'REGISTER');
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

-- ============================================================
-- Dossiê (checklist por apólice)
-- ============================================================
create or replace function public.insurance_dossier_sync(p_policy_id uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_n integer := 0;
  it jsonb;
  v_rows integer;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  perform public.insurance_int_require(v_proj, 'MANAGE');
  if jsonb_typeof(p_items) <> 'array' then raise exception 'ITEMS_MUST_BE_ARRAY'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.insurance_dossier_items (project_id, policy_id, item_key, label, required, updated_by)
    values (v_proj, p_policy_id, it ->> 'key', coalesce(it ->> 'label', it ->> 'key'), coalesce((it ->> 'required')::boolean, true), auth.uid())
    on conflict (policy_id, item_key) do nothing;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  perform public.insurance_int_audit(v_proj, 'INSURANCE_POLICY', p_policy_id, 'DOSSIER_SYNCED', jsonb_build_object('created', v_n, 'offered', jsonb_array_length(p_items)));
  return jsonb_build_object('created', v_n);
end;
$$;

create or replace function public.insurance_dossier_item_set(p_item_id uuid, p_expected_row_version integer, p_status text, p_document_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_dossier_items%rowtype;
begin
  select * into d from public.insurance_dossier_items where id = p_item_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(d.project_id, 'REGISTER');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if d.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, d.row_version; end if;
  perform public.insurance_int_same_project('documents', p_document_id, d.project_id);
  update public.insurance_dossier_items set status = p_status, document_id = p_document_id, note = nullif(btrim(coalesce(p_note, '')), ''),
      row_version = row_version + 1, updated_at = now(), updated_by = auth.uid() where id = p_item_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DOSSIER_ITEM', p_item_id, 'DOSSIER_ITEM_SET',
    jsonb_build_object('policyId', d.policy_id, 'itemKey', d.item_key, 'from', d.status, 'to', p_status, 'documentId', p_document_id));
  return jsonb_build_object('id', p_item_id, 'rowVersion', d.row_version + 1);
end;
$$;

-- ============================================================
-- Minutas: SEMPRE DRAFT; aprovação humana expressa (ADMINISTRADOR); envio real BLOQUEADO
-- ============================================================
create or replace function public.insurance_draft_create(p_project_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.insurance_int_require(p_project_id, 'REGISTER');
  v_id uuid;
  v_pol uuid := public.insurance_int_uuid(p_data, 'policy_id');
  v_bank uuid := public.insurance_int_uuid(p_data, 'bank_guarantee_id');
  v_claim uuid := public.insurance_int_uuid(p_data, 'claim_id');
  v_end uuid := public.insurance_int_uuid(p_data, 'endorsement_id');
  v_chan uuid := public.insurance_int_uuid(p_data, 'official_channel_id');
begin
  perform public.insurance_int_same_project('insurance_policies', v_pol, p_project_id);
  perform public.insurance_int_same_project('bank_guarantees', v_bank, p_project_id);
  perform public.insurance_int_same_project('insurance_claims', v_claim, p_project_id);
  perform public.insurance_int_same_project('insurance_endorsements', v_end, p_project_id);
  perform public.insurance_int_same_project('insurance_official_channels', v_chan, p_project_id);
  insert into public.insurance_drafts (project_id, draft_kind, policy_id, bank_guarantee_id, claim_id, endorsement_id, official_channel_id, subject, body, basis, generated_by_ai, state, created_by)
  values (p_project_id, p_data ->> 'draft_kind', v_pol, v_bank, v_claim, v_end, v_chan, coalesce(p_data ->> 'subject', ''), coalesce(p_data ->> 'body', ''),
    coalesce(p_data -> 'basis', '{}'::jsonb), coalesce((p_data ->> 'generated_by_ai')::boolean, false), 'DRAFT', v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(p_project_id, 'INSURANCE_DRAFT', v_id, 'DRAFT_CREATED', jsonb_build_object('draftKind', p_data ->> 'draft_kind', 'state', 'DRAFT'));
  return jsonb_build_object('id', v_id, 'state', 'DRAFT', 'rowVersion', 1);
end;
$$;

create or replace function public.insurance_draft_update(p_id uuid, p_expected_row_version integer, p_subject text, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
  v_revoked boolean;
begin
  select * into d from public.insurance_drafts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(d.project_id, 'REGISTER');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if d.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, d.row_version; end if;
  if d.state = 'CANCELADA' then raise exception 'DRAFT_CANCELLED'; end if;
  v_revoked := d.state = 'APROVADA_PARA_ENVIO';
  -- editar o texto invalida a aprovação: volta a DRAFT (nada aprovado é alterado em silêncio)
  update public.insurance_drafts set subject = coalesce(nullif(btrim(coalesce(p_subject, '')), ''), subject), body = coalesce(p_body, body),
      state = 'DRAFT', approved_by = null, approved_at = null, approved_body_hash = null,
      row_version = row_version + 1, updated_at = now() where id = p_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_id, case when v_revoked then 'DRAFT_EDITED_APPROVAL_REVOKED' else 'DRAFT_EDITED' end,
    jsonb_build_object('previousState', d.state, 'bodyHashBefore', md5(d.body)));
  return jsonb_build_object('id', p_id, 'state', 'DRAFT', 'approvalRevoked', v_revoked, 'rowVersion', d.row_version + 1);
end;
$$;

create or replace function public.insurance_draft_approve(p_id uuid, p_expected_row_version integer, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
  v_uid uuid;
begin
  select * into d from public.insurance_drafts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(d.project_id, 'ADMIN');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if d.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, d.row_version; end if;
  if d.state <> 'DRAFT' then raise exception 'INVALID_TRANSITION: % -> APROVADA_PARA_ENVIO', d.state; end if;
  if coalesce(p_confirmation, '') <> 'APROVO O CONTEUDO PARA ENVIO' then raise exception 'EXPRESS_CONFIRMATION_REQUIRED'; end if;
  if char_length(btrim(d.body)) < 20 then raise exception 'DRAFT_BODY_TOO_SHORT'; end if;
  if d.body ~ '\[(PREENCHER|SEM DADOS)[^\]]*\]' then raise exception 'DRAFT_HAS_PLACEHOLDERS'; end if;
  update public.insurance_drafts set state = 'APROVADA_PARA_ENVIO', approved_by = v_uid, approved_at = now(), approved_body_hash = md5(body),
      row_version = row_version + 1, updated_at = now() where id = p_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_id, 'DRAFT_APPROVED_FOR_SEND',
    jsonb_build_object('bodyHash', md5(d.body), 'realSendPerformed', false, 'note', 'Aprovação humana expressa registrada. NÃO envia: trava de envio real permanece fail-closed.'));
  return jsonb_build_object('id', p_id, 'state', 'APROVADA_PARA_ENVIO', 'sent', false, 'rowVersion', d.row_version + 1);
end;
$$;

create or replace function public.insurance_draft_cancel(p_id uuid, p_expected_row_version integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
begin
  select * into d from public.insurance_drafts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(d.project_id, 'REGISTER');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if d.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, d.row_version; end if;
  if d.state = 'CANCELADA' then raise exception 'DRAFT_CANCELLED'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'REASON_REQUIRED'; end if;
  update public.insurance_drafts set state = 'CANCELADA', row_version = row_version + 1, updated_at = now() where id = p_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_id, 'DRAFT_CANCELLED', jsonb_build_object('previousState', d.state, 'reason', btrim(p_reason)));
  return jsonb_build_object('id', p_id, 'state', 'CANCELADA', 'rowVersion', d.row_version + 1);
end;
$$;

-- Tentativa de envio: SEMPRE bloqueada nesta fase. Registra a tentativa e devolve os motivos (sent = false).
create or replace function public.insurance_draft_attempt_send(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
  v_reasons text[] := '{}';
  v_flag boolean;
  ch public.insurance_official_channels%rowtype;
begin
  select * into d from public.insurance_drafts where id = p_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform public.insurance_int_require(d.project_id, 'REGISTER');
  select real_send_enabled into v_flag from public.insurance_settings where project_id = d.project_id;
  if not coalesce(v_flag, false) then v_reasons := array_append(v_reasons, 'FLAG_OFF'); end if;
  if d.state <> 'APROVADA_PARA_ENVIO' then v_reasons := array_append(v_reasons, 'NOT_APPROVED'); end if;
  if d.state = 'APROVADA_PARA_ENVIO' and d.approved_body_hash is distinct from md5(d.body) then v_reasons := array_append(v_reasons, 'APPROVAL_STALE'); end if;
  if d.official_channel_id is null then
    v_reasons := array_append(v_reasons, 'NO_OFFICIAL_CHANNEL');
  else
    select * into ch from public.insurance_official_channels where id = d.official_channel_id;
    if not found or not ch.active then v_reasons := array_append(v_reasons, 'NO_OFFICIAL_CHANNEL');
    elsif ch.verified_at is null then v_reasons := array_append(v_reasons, 'CHANNEL_NOT_VERIFIED'); end if;
  end if;
  -- Fase 1: não existe transporte de envio. Mesmo com todas as condições satisfeitas, o resultado é bloqueio.
  v_reasons := array_append(v_reasons, 'PHASE1_NO_SEND_TRANSPORT');
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_id, 'DRAFT_SEND_BLOCKED', jsonb_build_object('reasons', to_jsonb(v_reasons)));
  return jsonb_build_object('sent', false, 'blocked', true, 'reasons', to_jsonb(v_reasons));
end;
$$;

-- ============================================================
-- Listagem para o dashboard da fase 2 (security INVOKER: a RLS por projeto continua valendo)
-- ============================================================
create or replace function public.insurance_dashboard_items(p_project_id uuid default null, p_today date default current_date, p_horizon_days integer default 30)
returns table (kind text, project_id uuid, entity_type text, entity_id uuid, title text, due_date date, days_to_due integer, severity text, detail jsonb)
language sql
stable
set search_path = ''
as $$
  -- VENCIMENTO: apólices / fianças / outras garantias com fim de vigência vencido ou dentro do horizonte
  select 'VENCIMENTO', p.project_id, 'INSURANCE_POLICY', p.id, p.modality || coalesce(' ' || p.policy_number, ''), p.coverage_end,
         (p.coverage_end - p_today), case when p.coverage_end < p_today then 'VENCIDO' else 'A_VENCER' end,
         jsonb_build_object('insurer', p.insurer_name, 'status', p.status)
    from public.insurance_policies p
   where (p_project_id is null or p.project_id = p_project_id) and p.status in ('RASCUNHO', 'VIGENTE') and p.coverage_end is not null
     and p.coverage_end <= p_today + greatest(coalesce(p_horizon_days, 30), 0)
  union all
  select 'VENCIMENTO', g.project_id, 'BANK_GUARANTEE', g.id, 'FIANCA_BANCARIA' || coalesce(' ' || g.guarantee_number, ''), g.end_date,
         (g.end_date - p_today), case when g.end_date < p_today then 'VENCIDO' else 'A_VENCER' end, jsonb_build_object('bank', g.bank_name, 'status', g.status)
    from public.bank_guarantees g
   where (p_project_id is null or g.project_id = p_project_id) and g.status in ('RASCUNHO', 'VIGENTE') and g.end_date is not null
     and g.end_date <= p_today + greatest(coalesce(p_horizon_days, 30), 0)
  union all
  select 'VENCIMENTO', o.project_id, 'OTHER_GUARANTEE', o.id, o.guarantee_type || coalesce(' ' || o.issuer_name, ''), o.end_date,
         (o.end_date - p_today), case when o.end_date < p_today then 'VENCIDO' else 'A_VENCER' end, jsonb_build_object('status', o.status)
    from public.other_guarantees o
   where (p_project_id is null or o.project_id = p_project_id) and o.status in ('RASCUNHO', 'VIGENTE') and o.end_date is not null
     and o.end_date <= p_today + greatest(coalesce(p_horizon_days, 30), 0)
  union all
  -- ENDOSSO_PENDENTE: pedido/analisado/emitido ainda NÃO conferido (sem efeito de cobertura)
  select 'ENDOSSO_PENDENTE', e.project_id, 'INSURANCE_ENDORSEMENT', e.id, 'Endosso ' || e.endorsement_seq || ' (' || e.state || ')', null::date, null::integer,
         case e.state when 'EMITIDO' then 'CONFERENCIA_PENDENTE' else 'AGUARDANDO_SEGURADORA' end,
         jsonb_build_object('policyId', e.policy_id, 'state', e.state, 'coverageEffective', e.coverage_effective, 'requestedAt', e.requested_at)
    from public.insurance_endorsements e
   where (p_project_id is null or e.project_id = p_project_id) and e.state in ('SOLICITADO', 'EM_ANALISE', 'EMITIDO')
  union all
  -- GARANTIA_INSUFICIENTE: saldo não amortizado acima do limite garantido (fato) ou do valor máximo da apólice vinculada
  select 'GARANTIA_INSUFICIENTE', a.project_id, 'INSURANCE_ADVANCE', a.id, 'Adiantamento: ' || left(a.purpose, 60), null::date, null::integer, 'INSUFICIENTE',
         jsonb_build_object('unamortized', a.advanced_amount - coalesce(s.total, 0), 'guaranteedLimit', a.guaranteed_limit, 'policyMaxAmount', pp.max_amount)
    from public.insurance_advances a
    left join lateral (select sum(m.amount) total from public.insurance_advance_amortizations m where m.advance_id = a.id) s on true
    left join public.insurance_policies pp on pp.id = a.policy_id
   where (p_project_id is null or a.project_id = p_project_id) and (a.advanced_amount - coalesce(s.total, 0)) > 0
     and ((a.guaranteed_limit is not null and (a.advanced_amount - coalesce(s.total, 0)) > a.guaranteed_limit)
       or (pp.max_amount is not null and (a.advanced_amount - coalesce(s.total, 0)) > pp.max_amount))
  union all
  -- GARANTIA_SEM_DADOS: saldo aberto sem como comparar (sem limite e sem apólice com valor máximo) — "SEM DADOS", não inferir
  select 'GARANTIA_SEM_DADOS', a.project_id, 'INSURANCE_ADVANCE', a.id, 'Adiantamento: ' || left(a.purpose, 60), null::date, null::integer, 'SEM_DADOS',
         jsonb_build_object('unamortized', a.advanced_amount - coalesce(s.total, 0))
    from public.insurance_advances a
    left join lateral (select sum(m.amount) total from public.insurance_advance_amortizations m where m.advance_id = a.id) s on true
    left join public.insurance_policies pp on pp.id = a.policy_id
   where (p_project_id is null or a.project_id = p_project_id) and (a.advanced_amount - coalesce(s.total, 0)) > 0
     and a.guaranteed_limit is null and pp.max_amount is null
  union all
  -- SINISTRO_EM_ANDAMENTO
  select 'SINISTRO_EM_ANDAMENTO', c.project_id, 'INSURANCE_CLAIM', c.id, c.title, c.notice_deadline_at::date,
         case when c.notice_deadline_at is null then null else (c.notice_deadline_at::date - p_today) end,
         case when c.stage in ('NEGATIVA', 'CONTESTACAO') then 'ATENCAO' else 'EM_ANDAMENTO' end,
         jsonb_build_object('stage', c.stage, 'protocol', c.protocol, 'claimKind', c.claim_kind, 'instrumentMissing', c.policy_id is null and c.bank_guarantee_id is null and c.other_guarantee_id is null)
    from public.insurance_claims c
   where (p_project_id is null or c.project_id = p_project_id) and c.stage <> 'ENCERRADO'
  union all
  -- PRAZO_AVISO: expectativa ainda não avisada com prazo cadastrado
  select 'PRAZO_AVISO', c.project_id, 'INSURANCE_CLAIM', c.id, c.title, c.notice_deadline_at::date, (c.notice_deadline_at::date - p_today),
         case when c.notice_deadline_at::date < p_today then 'VENCIDO' else 'A_VENCER' end,
         jsonb_build_object('stage', c.stage, 'basis', c.notice_deadline_basis)
    from public.insurance_claims c
   where (p_project_id is null or c.project_id = p_project_id) and c.stage = 'EXPECTATIVA' and c.notice_deadline_at is not null;
$$;

-- ============================================================
-- Privilégios: somente authenticated executa as RPCs públicas; anon/public nada
-- ============================================================
do $$
declare f text;
begin
  foreach f in array array[
    'insurance_policy_create(uuid,jsonb)', 'insurance_policy_new_version(uuid,integer,jsonb,text)', 'insurance_policy_party_add(uuid,integer,jsonb)',
    'insurance_policy_party_set_active(uuid,integer,boolean,text)', 'insurance_policy_clause_add(uuid,integer,jsonb)',
    'insurance_channel_register(uuid,jsonb)', 'insurance_channel_verify(uuid)',
    'bank_guarantee_register(uuid,jsonb)', 'bank_guarantee_update(uuid,integer,jsonb)',
    'other_guarantee_register(uuid,jsonb)', 'other_guarantee_update(uuid,integer,jsonb)',
    'insurance_endorsement_request(uuid,jsonb)', 'insurance_endorsement_advance(uuid,integer,text,jsonb)',
    'insurance_advance_register(uuid,jsonb)', 'insurance_advance_amortize(uuid,integer,jsonb)', 'insurance_advance_balance(uuid)',
    'insurance_claim_open(uuid,jsonb)', 'insurance_claim_advance(uuid,integer,text,jsonb)',
    'insurance_dossier_sync(uuid,jsonb)', 'insurance_dossier_item_set(uuid,integer,text,uuid,text)',
    'insurance_draft_create(uuid,jsonb)', 'insurance_draft_update(uuid,integer,text,text)', 'insurance_draft_approve(uuid,integer,text)',
    'insurance_draft_cancel(uuid,integer,text)', 'insurance_draft_attempt_send(uuid)',
    'insurance_dashboard_items(uuid,date,integer)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
