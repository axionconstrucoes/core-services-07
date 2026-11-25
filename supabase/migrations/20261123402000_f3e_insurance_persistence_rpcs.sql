-- ============================================================
-- 20261123402000_f3e_insurance_persistence_rpcs.sql
--
-- FASE 3 / Agente E — RPCs do checklist RCC (10 perguntas) e dos sujeitos ESPERADOS por apólice.
-- Todas: security definer, search_path = '', EXECUTE só authenticated, auth.uid() obrigatório, papel por insurance_access
-- (fail-closed), AUDITORIA em insurance_audit_events na MESMA transação, versionamento append-only com CONCORRÊNCIA
-- OTIMISTA (p_expected_version = última versão conhecida; 0 = ainda não existe) serializada por advisory lock.
--
--   insurance_rcc_checklist_save(apólice, evento?, itens, versão esperada, nota)   REGISTER+
--   insurance_rcc_checklist_get(apólice, evento?)                                  READ+
--   insurance_expected_subject_save(apólice, dados, versão esperada)               MANAGE+ (altera o parâmetro da auditoria de sujeitos)
--   insurance_expected_subjects_get(apólice)                                       READ+
--
-- Regras: toda RESPOSTA do RCC exige FONTE (documento do mesmo projeto ou referência de cláusula); sem resposta = SEM DADOS (NULL);
-- nada presume que RCC cubra defeito de execução ou danos à própria obra; nada presume que o beneficiário final seja segurado.
-- Reutiliza insurance_int_* de 20261122201000. Nenhuma migration existente é alterada. Idempotente.
-- ============================================================

create or replace function public.insurance_rcc_checklist_save(
  p_policy_id uuid, p_claim_id uuid, p_items jsonb, p_expected_version integer, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_uid uuid;
  v_keys constant text[] := array['CAUSADOR', 'VITIMA', 'ABRANGENCIA_SEGURADOS', 'OBJETO', 'BENS_TERCEIROS_X_PROPRIA_OBRA',
    'EXCLUSOES', 'SUBLIMITES', 'FRANQUIAS', 'ENDOSSOS', 'AVISO'];
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_claim_policy uuid;
  v_prev_id uuid;
  v_prev_no integer;
  v_id uuid;
  v_el jsonb;
  v_seen text[] := '{}';
  v_key text;
  v_answer text;
  v_doc uuid;
  v_ref text;
  v_page text;
  v_scope text;
  v_answered integer := 0;
  v_k text;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'REGISTER');
  if p_expected_version is null or p_expected_version < 0 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 or octet_length(p_items::text) > 200000 then
    raise exception 'INVALID_ITEMS: lista de até 10 respostas';
  end if;
  if v_note is not null and char_length(v_note) > 4000 then raise exception 'INVALID_INPUT: nota longa demais'; end if;
  if p_claim_id is not null then
    perform public.insurance_int_same_project('insurance_claims', p_claim_id, v_proj);
    select policy_id into v_claim_policy from public.insurance_claims where id = p_claim_id;
    if v_claim_policy is distinct from p_policy_id then raise exception 'CLAIM_POLICY_MISMATCH: o evento não pertence a esta apólice'; end if;
  end if;

  -- validação ANTES de gravar (nada parcial)
  for v_el in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(v_el) <> 'object' then raise exception 'INVALID_ITEMS: item inválido'; end if;
    v_key := v_el ->> 'key';
    if v_key is null or not (v_key = any (v_keys)) then raise exception 'INVALID_ITEMS: pergunta desconhecida (%)', coalesce(v_key, '?'); end if;
    if v_key = any (v_seen) then raise exception 'INVALID_ITEMS: pergunta duplicada (%)', v_key; end if;
    v_seen := array_append(v_seen, v_key);
    v_answer := public.insurance_int_text(v_el, 'answer');
    v_doc := public.insurance_int_uuid(v_el, 'sourceDocumentId');
    v_ref := public.insurance_int_text(v_el, 'sourceRef');
    v_scope := public.insurance_int_text(v_el, 'propertyScope');
    if v_doc is not null then perform public.insurance_int_same_project('documents', v_doc, v_proj); end if;
    if v_answer is not null then
      if v_doc is null and v_ref is null then raise exception 'SOURCE_REQUIRED: a resposta de % exige fonte (documento ou referência da cláusula)', v_key; end if;
      if char_length(v_answer) > 4000 then raise exception 'INVALID_ITEMS: resposta longa demais (%)', v_key; end if;
      if v_key = 'BENS_TERCEIROS_X_PROPRIA_OBRA' and (v_scope is null or v_scope not in ('BENS_TERCEIROS', 'PROPRIA_OBRA', 'AMBOS', 'INDEFINIDO')) then
        raise exception 'PROPERTY_SCOPE_REQUIRED: informe se o dano atinge bens de terceiros, a própria obra, ambos ou indefinido';
      end if;
      v_answered := v_answered + 1;
    elsif v_doc is not null or v_ref is not null or v_scope is not null then
      raise exception 'INVALID_ITEMS: % tem fonte/escopo sem resposta (sem resposta = SEM DADOS)', v_key;
    end if;
    if v_key <> 'BENS_TERCEIROS_X_PROPRIA_OBRA' and v_scope is not null then raise exception 'INVALID_ITEMS: escopo do bem só vale para a pergunta de bens de terceiros x própria obra'; end if;
  end loop;

  perform pg_advisory_xact_lock(hashtextextended('f3e-rcc:' || p_policy_id::text || ':' || coalesce(p_claim_id::text, '-'), 0));
  select id, version_no into v_prev_id, v_prev_no from public.insurance_rcc_checklists
   where policy_id = p_policy_id and claim_id is not distinct from p_claim_id order by version_no desc limit 1;
  if p_expected_version <> coalesce(v_prev_no, 0) then
    raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_version, coalesce(v_prev_no, 0);
  end if;

  insert into public.insurance_rcc_checklists (project_id, policy_id, claim_id, version_no, note, supersedes_id, created_by)
  values (v_proj, p_policy_id, p_claim_id, coalesce(v_prev_no, 0) + 1, v_note, v_prev_id, v_uid)
  returning id into v_id;

  foreach v_k in array v_keys loop
    select e into v_el from jsonb_array_elements(p_items) e where e ->> 'key' = v_k limit 1;
    v_answer := case when v_el is null then null else public.insurance_int_text(v_el, 'answer') end;
    v_doc := case when v_el is null then null else public.insurance_int_uuid(v_el, 'sourceDocumentId') end;
    v_ref := case when v_el is null then null else public.insurance_int_text(v_el, 'sourceRef') end;
    v_page := case when v_el is null then null else public.insurance_int_text(v_el, 'sourcePage') end;
    v_scope := case when v_el is null then null else public.insurance_int_text(v_el, 'propertyScope') end;
    insert into public.insurance_rcc_checklist_items (project_id, checklist_id, question_key, answer, source_document_id, source_ref, source_page, property_scope)
    values (v_proj, v_id, v_k, v_answer, v_doc, v_ref, v_page, v_scope);
    v_el := null;
  end loop;

  perform public.insurance_int_audit(v_proj, 'INSURANCE_RCC_CHECKLIST', v_id, 'RCC_CHECKLIST_SAVED',
    jsonb_build_object('policyId', p_policy_id, 'claimId', p_claim_id, 'versionNo', coalesce(v_prev_no, 0) + 1, 'supersedesId', v_prev_id,
      'answeredWithSource', v_answered, 'total', 10,
      'note', 'Registro de respostas com fonte; não decide cobertura nem presume que a RCC cubra defeito de execução ou danos à própria obra.'));
  return jsonb_build_object('ok', true, 'id', v_id, 'versionNo', coalesce(v_prev_no, 0) + 1, 'supersedesId', v_prev_id,
    'answeredWithSource', v_answered, 'total', 10);
end;
$$;

create or replace function public.insurance_rcc_checklist_get(p_policy_id uuid, p_claim_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_latest public.insurance_rcc_checklists%rowtype;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  perform public.insurance_int_require(v_proj, 'READ');
  select * into v_latest from public.insurance_rcc_checklists
   where policy_id = p_policy_id and project_id = v_proj and claim_id is not distinct from p_claim_id order by version_no desc limit 1;
  return jsonb_build_object(
    'latest', case when v_latest.id is null then null else jsonb_build_object(
      'id', v_latest.id, 'versionNo', v_latest.version_no, 'policyId', v_latest.policy_id, 'claimId', v_latest.claim_id, 'note', v_latest.note,
      'supersedesId', v_latest.supersedes_id, 'createdBy', v_latest.created_by, 'createdAt', v_latest.created_at,
      'items', coalesce((select jsonb_agg(jsonb_build_object('key', i.question_key, 'answer', i.answer, 'sourceDocumentId', i.source_document_id,
          'sourceRef', i.source_ref, 'sourcePage', i.source_page, 'propertyScope', i.property_scope) order by i.question_key)
        from public.insurance_rcc_checklist_items i where i.checklist_id = v_latest.id), '[]'::jsonb)) end,
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'versionNo', c.version_no, 'createdBy', c.created_by, 'createdAt', c.created_at,
        'answered', (select count(*) from public.insurance_rcc_checklist_items i where i.checklist_id = c.id and i.answer is not null))
        order by c.version_no desc)
      from public.insurance_rcc_checklists c
      where c.policy_id = p_policy_id and c.project_id = v_proj and c.claim_id is not distinct from p_claim_id), '[]'::jsonb));
end;
$$;

-- ---------- Sujeitos ESPERADOS ----------
create or replace function public.insurance_expected_subject_save(p_policy_id uuid, p_data jsonb, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_uid uuid;
  v_role text := public.insurance_int_text(p_data, 'party_role');
  v_expect text := public.insurance_int_text(p_data, 'expectation');
  v_name text := public.insurance_int_text(p_data, 'expected_name');
  v_tax text := public.insurance_int_text(p_data, 'expected_tax_id');
  v_kind text := public.insurance_int_text(p_data, 'source_kind');
  v_doc uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ref text := public.insurance_int_text(p_data, 'source_ref');
  v_note text := public.insurance_int_text(p_data, 'note');
  v_prev_id uuid;
  v_prev_no integer;
  v_id uuid;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'MANAGE');
  if p_expected_version is null or p_expected_version < 0 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'INVALID_INPUT: dados ausentes'; end if;
  if v_role is null or v_role not in ('SEGURADO', 'BENEFICIARIO', 'PROPRIETARIO_FINAL', 'TOMADOR', 'TITULAR_INTERESSE_SEGURAVEL') then raise exception 'INVALID_INPUT: papel esperado inválido'; end if;
  if v_expect is null or v_expect not in ('ESPERADO', 'NAO_ESPERADO') then raise exception 'INVALID_INPUT: expectativa deve ser ESPERADO ou NAO_ESPERADO'; end if;
  if v_kind is null or v_kind not in ('CONTRATO', 'EDITAL', 'INSTRUCAO_CLIENTE', 'OUTRO') then raise exception 'INVALID_INPUT: tipo de fonte inválido'; end if;
  if v_doc is null and v_ref is null then raise exception 'SOURCE_REQUIRED: a expectativa exige a fonte (contrato, edital, instrução do cliente)'; end if;
  if v_expect = 'ESPERADO' and v_name is null and v_tax is null then raise exception 'INVALID_INPUT: informe nome e/ou CNPJ do sujeito esperado'; end if;
  if v_expect = 'NAO_ESPERADO' and (v_name is not null or v_tax is not null) then raise exception 'INVALID_INPUT: NAO_ESPERADO não leva nome/CNPJ'; end if;
  if char_length(coalesce(v_name, '')) > 300 or char_length(coalesce(v_tax, '')) > 40 or char_length(coalesce(v_note, '')) > 4000 then raise exception 'INVALID_INPUT: campo longo demais'; end if;
  perform public.insurance_int_same_project('documents', v_doc, v_proj);

  perform pg_advisory_xact_lock(hashtextextended('f3e-subject:' || p_policy_id::text || ':' || v_role, 0));
  select id, version_no into v_prev_id, v_prev_no from public.insurance_expected_subjects
   where policy_id = p_policy_id and party_role = v_role order by version_no desc limit 1;
  if p_expected_version <> coalesce(v_prev_no, 0) then
    raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_version, coalesce(v_prev_no, 0);
  end if;

  insert into public.insurance_expected_subjects (project_id, policy_id, party_role, expectation, expected_name, expected_tax_id, source_kind,
    source_document_id, source_ref, version_no, note, supersedes_id, created_by)
  values (v_proj, p_policy_id, v_role, v_expect, v_name, v_tax, v_kind, v_doc, v_ref, coalesce(v_prev_no, 0) + 1, v_note, v_prev_id, v_uid)
  returning id into v_id;

  perform public.insurance_int_audit(v_proj, 'INSURANCE_EXPECTED_SUBJECT', v_id, 'EXPECTED_SUBJECT_SAVED',
    jsonb_build_object('policyId', p_policy_id, 'partyRole', v_role, 'expectation', v_expect, 'versionNo', coalesce(v_prev_no, 0) + 1,
      'supersedesId', v_prev_id, 'sourceKind', v_kind,
      'note', 'Expectativa registrada com fonte; não presume que o beneficiário final deva ser segurado.'));
  return jsonb_build_object('ok', true, 'id', v_id, 'versionNo', coalesce(v_prev_no, 0) + 1, 'supersedesId', v_prev_id);
end;
$$;

create or replace function public.insurance_expected_subjects_get(p_policy_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_proj uuid;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  perform public.insurance_int_require(v_proj, 'READ');
  return jsonb_build_object(
    'current', coalesce((select jsonb_agg(row_to_json_obj order by party_role) from (
        select distinct on (s.party_role) s.party_role, jsonb_build_object(
          'id', s.id, 'partyRole', s.party_role, 'expectation', s.expectation, 'expectedName', s.expected_name, 'expectedTaxId', s.expected_tax_id,
          'sourceKind', s.source_kind, 'sourceDocumentId', s.source_document_id, 'sourceRef', s.source_ref, 'versionNo', s.version_no,
          'note', s.note, 'createdBy', s.created_by, 'createdAt', s.created_at) as row_to_json_obj
          from public.insurance_expected_subjects s
         where s.policy_id = p_policy_id and s.project_id = v_proj
         order by s.party_role, s.version_no desc) latest), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'partyRole', s.party_role, 'expectation', s.expectation,
        'expectedName', s.expected_name, 'expectedTaxId', s.expected_tax_id, 'sourceKind', s.source_kind, 'sourceDocumentId', s.source_document_id,
        'sourceRef', s.source_ref, 'versionNo', s.version_no, 'note', s.note, 'supersedesId', s.supersedes_id, 'createdBy', s.created_by,
        'createdAt', s.created_at) order by s.party_role, s.version_no desc)
      from public.insurance_expected_subjects s where s.policy_id = p_policy_id and s.project_id = v_proj), '[]'::jsonb));
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'insurance_rcc_checklist_save(uuid,uuid,jsonb,integer,text)', 'insurance_rcc_checklist_get(uuid,uuid)',
    'insurance_expected_subject_save(uuid,jsonb,integer)', 'insurance_expected_subjects_get(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
