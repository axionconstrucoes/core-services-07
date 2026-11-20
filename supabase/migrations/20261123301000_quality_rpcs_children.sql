-- ============================================================
-- 20261123301000_quality_rpcs_children.sql
--
-- FASE 3 / Frente D (2/4) — RPCs TRANSACIONAIS (SECURITY DEFINER, search_path vazio, só authenticated) para os registros-filhos
-- de Qualidade e Garantias que hoje são escritos por INSERT/UPDATE direto sob RLS. Cada RPC: ator obrigatório (AUTH_REQUIRED),
-- autorização por acc_project_tier via quality_can_* (FORBIDDEN, sem vazar existência entre projetos), validação no servidor,
-- travamento da linha-mãe (FOR UPDATE) e controle de concorrência otimista (VERSION_REQUIRED / VERSION_CONFLICT), auditoria na
-- MESMA transação (trigger de linha nos INSERTs; linha própria com antes/depois nos UPDATEs) e códigos de erro estáveis:
-- AUTH_REQUIRED, FORBIDDEN, VERSION_REQUIRED, VERSION_CONFLICT, INVALID_DATA, INVALID_TRANSITION, INVALID_STATE,
-- JUSTIFICATION_REQUIRED, EVIDENCE_REQUIRED, EVIDENCE_INVALID, EVIDENCE_LOCKED, EPISTEMIC_INVALID, CASE_NOT_ACTIVE,
-- COST_SOURCE_REQUIRED, DUPLICATE_EVIDENCE / DUPLICATE_RECORD (SQLSTATE 23505).
--
-- Regras novas (documentadas em docs/permissoes-matriz-central.md):
--   * evidência: o registro (fonte original) é REGISTER; reclassificar/alterar descrição/tipo epistêmico é MANAGE, com justificativa,
--     e é recusado quando a evidência já sustenta uma verificação, um aceite ou uma decisão de transição (EVIDENCE_LOCKED);
--   * NC_COMPROVADA exige tipo epistêmico FATO (inferência/recomendação não comprovam não conformidade);
--   * verificação de eficácia: MANAGE, evidência obrigatória do mesmo caso e FATO, só em VERIFICACAO (RNC) / REPARADA (garantia);
--   * aceite do cliente da garantia: MANAGE, com evidência (FATO) do mesmo caso, só em REPARADA/VERIFICADA; não sobrevive a novo
--     reparo/reabertura (trigger da migration 20261123300000);
--   * CAPA: cancelar é MANAGE com justificativa; registros-filhos não entram em caso encerrado/cancelado (reabrir primeiro);
--   * edição de causa raiz/prazo/responsável da RNC e de causa/prazos/custos/termos da garantia é MANAGE; custo só com fonte.
-- Não redefine funções existentes. Não toca record_risk_alert_action nem SLAs. Idempotente.
-- ============================================================

-- ---------- auxiliares internos (sem EXECUTE para clientes) ----------
create or replace function public.quality_case_lookup(p_ncr_id uuid, p_warranty_case_id uuid, p_lock boolean default false)
returns table (c_type text, c_id uuid, c_project uuid, c_state text, c_version integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if num_nonnulls(p_ncr_id, p_warranty_case_id) <> 1 then
    raise exception 'INVALID_DATA: informe exatamente uma RNC ou um caso de garantia';
  end if;
  if p_ncr_id is not null then
    if p_lock then
      return query select 'NCR'::text, n.id, n.project_id, n.state, n.row_version from public.quality_ncrs n where n.id = p_ncr_id for update;
    else
      return query select 'NCR'::text, n.id, n.project_id, n.state, n.row_version from public.quality_ncrs n where n.id = p_ncr_id;
    end if;
  else
    if p_lock then
      return query select 'WARRANTY'::text, w.id, w.project_id, w.state, w.row_version from public.quality_warranty_cases w where w.id = p_warranty_case_id for update;
    else
      return query select 'WARRANTY'::text, w.id, w.project_id, w.state, w.row_version from public.quality_warranty_cases w where w.id = p_warranty_case_id;
    end if;
  end if;
end;
$$;

create or replace function public.quality_case_accepts_children(p_type text, p_state text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when p_type = 'NCR' then p_state not in ('ENCERRADA', 'CANCELADA', 'DUPLICADA', 'NAO_CONFIRMADA')
              else p_state not in ('ENCERRADA', 'CANCELADA', 'NAO_COBERTA') end;
$$;

create or replace function public.quality_rpc_audit(p_project_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_detail jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p_project_id, case when auth.uid() is null then 'SYSTEM' else 'USER' end, auth.uid(), p_action, p_entity_type,
          p_entity_id::text, p_detail::text)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.quality_member_active(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.project_memberships pm
                 where pm.project_id = p_project_id and pm.user_id = p_user_id and pm.status = 'ACTIVE');
$$;

revoke all on function public.quality_case_lookup(uuid, uuid, boolean), public.quality_case_accepts_children(text, text),
  public.quality_rpc_audit(uuid, text, text, uuid, jsonb), public.quality_member_active(uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- EVIDÊNCIA
-- ============================================================
create or replace function public.quality_evidence_register(
  p_project_id uuid, p_source_type text, p_source_ref text, p_classification text,
  p_epistemic text default 'FATO', p_ncr_id uuid default null, p_warranty_case_id uuid default null,
  p_complaint_id uuid default null, p_inspection_id uuid default null, p_test_id uuid default null,
  p_source_url text default null, p_description text default null, p_captured_at timestamptz default null,
  p_source_table text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_state text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if v_ref is null or char_length(v_ref) > 1000 then
    raise exception 'INVALID_DATA: toda evidência aponta para a fonte original (referência de 1 a 1000 caracteres)';
  end if;
  if p_source_type is null or p_source_type not in ('SSMA_FOTO', 'EMAIL', 'DIARIO_OBRA', 'FISCALIZACAO', 'INSPECAO', 'ENSAIO_LAUDO', 'DOCUMENTO', 'OUTRO') then
    raise exception 'INVALID_DATA: tipo de fonte inválido';
  end if;
  if p_classification is null or p_classification not in ('SUSPEITA', 'INDICIO', 'NC_COMPROVADA', 'RISCO_POTENCIAL') then
    raise exception 'INVALID_DATA: classificação inválida';
  end if;
  if p_epistemic is null or p_epistemic not in ('FATO', 'INFERENCIA', 'RECOMENDACAO') then
    raise exception 'INVALID_DATA: tipo epistêmico inválido';
  end if;
  if p_classification = 'NC_COMPROVADA' and p_epistemic <> 'FATO' then
    raise exception 'EPISTEMIC_INVALID: NC comprovada exige tipo epistêmico FATO (inferência ou recomendação não comprovam uma não conformidade)';
  end if;
  if num_nonnulls(p_ncr_id, p_warranty_case_id, p_complaint_id, p_inspection_id, p_test_id) < 1 then
    raise exception 'INVALID_DATA: a evidência deve estar ligada a uma RNC, garantia, reclamação, inspeção ou ensaio';
  end if;

  -- cada vínculo precisa ser do MESMO projeto (sem revelar a existência em outro projeto)
  if p_ncr_id is not null then
    select n.state into v_state from public.quality_ncrs n where n.id = p_ncr_id and n.project_id = p_project_id;
    if not found then raise exception 'FORBIDDEN'; end if;
    if v_state in ('CANCELADA', 'DUPLICADA') then raise exception 'CASE_NOT_ACTIVE: a RNC está % e não recebe evidências', v_state; end if;
  end if;
  if p_warranty_case_id is not null then
    select w.state into v_state from public.quality_warranty_cases w where w.id = p_warranty_case_id and w.project_id = p_project_id;
    if not found then raise exception 'FORBIDDEN'; end if;
    if v_state = 'CANCELADA' then raise exception 'CASE_NOT_ACTIVE: a garantia está CANCELADA e não recebe evidências'; end if;
  end if;
  if p_complaint_id is not null and not exists (select 1 from public.quality_customer_complaints x where x.id = p_complaint_id and x.project_id = p_project_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_inspection_id is not null and not exists (select 1 from public.quality_inspections x where x.id = p_inspection_id and x.project_id = p_project_id) then
    raise exception 'FORBIDDEN';
  end if;
  if p_test_id is not null and not exists (select 1 from public.quality_tests x where x.id = p_test_id and x.project_id = p_project_id) then
    raise exception 'FORBIDDEN';
  end if;

  begin
    insert into public.quality_evidence (project_id, ncr_id, warranty_case_id, complaint_id, inspection_id, test_id, source_type,
      source_table, source_ref, source_url, description, classification, epistemic, captured_at, created_by)
    values (p_project_id, p_ncr_id, p_warranty_case_id, p_complaint_id, p_inspection_id, p_test_id, p_source_type,
      left(p_source_table, 100), v_ref, nullif(btrim(coalesce(p_source_url, '')), ''), nullif(btrim(coalesce(p_description, '')), ''),
      p_classification, p_epistemic, p_captured_at, v_uid)
    returning id into v_id;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'DUPLICATE_EVIDENCE: esta fonte já foi registrada como evidência neste caso (duplicidade evitada)';
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_evidence_revise(
  p_evidence_id uuid, p_expected_version integer, p_classification text, p_epistemic text, p_description text, p_justification text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_e public.quality_evidence%rowtype;
  v_just text := nullif(btrim(coalesce(p_justification, '')), '');
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_new_version integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_e from public.quality_evidence where id = p_evidence_id;
  if not found or not public.quality_can_manage(v_e.project_id) then raise exception 'FORBIDDEN'; end if;
  select * into v_e from public.quality_evidence where id = p_evidence_id for update;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_e.row_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_e.row_version;
  end if;
  if p_classification is null or p_classification not in ('SUSPEITA', 'INDICIO', 'NC_COMPROVADA', 'RISCO_POTENCIAL')
     or p_epistemic is null or p_epistemic not in ('FATO', 'INFERENCIA', 'RECOMENDACAO') then
    raise exception 'INVALID_DATA: classificação ou tipo epistêmico inválido';
  end if;
  if p_classification = 'NC_COMPROVADA' and p_epistemic <> 'FATO' then
    raise exception 'EPISTEMIC_INVALID: NC comprovada exige tipo epistêmico FATO';
  end if;
  if p_classification = v_e.classification and p_epistemic = v_e.epistemic and v_desc is not distinct from v_e.description then
    raise exception 'INVALID_DATA: nada a alterar';
  end if;
  if v_just is null or char_length(v_just) < 10 then
    raise exception 'JUSTIFICATION_REQUIRED: revisar a classificação de uma evidência exige justificativa (mín. 10 caracteres)';
  end if;
  if exists (select 1 from public.quality_effectiveness_verifications v where v.evidence_id = v_e.id)
     or exists (select 1 from public.quality_state_events s where v_e.id = any (s.evidence_ids))
     or exists (select 1 from public.quality_warranty_cases w where w.accepted_evidence_id = v_e.id) then
    raise exception 'EVIDENCE_LOCKED: a evidência sustenta uma verificação, um aceite ou uma decisão de transição; registre uma nova evidência';
  end if;

  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_evidence set classification = p_classification, epistemic = p_epistemic, description = v_desc
    where id = v_e.id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_e.project_id, 'QUALITY_EVIDENCE_REVISE', 'QUALITY_EVIDENCE', v_e.id,
    jsonb_build_object('before', jsonb_build_object('classification', v_e.classification, 'epistemic', v_e.epistemic, 'description', v_e.description),
      'after', jsonb_build_object('classification', p_classification, 'epistemic', p_epistemic, 'description', v_desc),
      'justification', v_just, 'expectedVersion', p_expected_version, 'newVersion', v_new_version,
      'sourceRef', v_e.source_ref, 'note', 'a fonte original permanece imutável'));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_e.id, 'rowVersion', v_new_version);
end;
$$;

-- ============================================================
-- CAPA (ações corretivas/preventivas)
-- ============================================================
create or replace function public.quality_capa_register(
  p_ncr_id uuid, p_warranty_case_id uuid, p_kind text, p_description text,
  p_due_date date default null, p_responsible_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(p_ncr_id, p_warranty_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar ações)', v_c.c_state;
  end if;
  if p_kind is null or p_kind not in ('CONTENCAO', 'CORRETIVA', 'PREVENTIVA') then raise exception 'INVALID_DATA: tipo de ação inválido'; end if;
  if v_desc is null or char_length(v_desc) < 3 or char_length(v_desc) > 4000 then raise exception 'INVALID_DATA: descreva a ação (3 a 4000 caracteres)'; end if;
  if p_responsible_user_id is not null and not public.quality_member_active(v_c.c_project, p_responsible_user_id) then
    raise exception 'INVALID_DATA: o responsável deve ser membro ativo do projeto';
  end if;
  insert into public.quality_corrective_actions (project_id, ncr_id, warranty_case_id, kind, description, responsible_user_id, due_date, created_by)
  values (v_c.c_project, p_ncr_id, p_warranty_case_id, p_kind, v_desc, p_responsible_user_id, p_due_date, v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_capa_update_status(
  p_action_id uuid, p_expected_version integer, p_status text, p_justification text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a public.quality_corrective_actions%rowtype;
  v_c record;
  v_just text := nullif(btrim(coalesce(p_justification, '')), '');
  v_new_version integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_a from public.quality_corrective_actions where id = p_action_id;
  if not found then raise exception 'FORBIDDEN'; end if;
  select * into v_c from public.quality_case_lookup(v_a.ncr_id, v_a.warranty_case_id, true);   -- trava a mãe antes da filha
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  select * into v_a from public.quality_corrective_actions where id = p_action_id for update;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_a.row_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_a.row_version;
  end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de alterar ações)', v_c.c_state;
  end if;
  if p_status is null or p_status not in ('PLANEJADA', 'EM_ANDAMENTO', 'EXECUTADA', 'CANCELADA') then raise exception 'INVALID_DATA: status inválido'; end if;
  if not ((v_a.status = 'PLANEJADA' and p_status in ('EM_ANDAMENTO', 'EXECUTADA', 'CANCELADA'))
       or (v_a.status = 'EM_ANDAMENTO' and p_status in ('PLANEJADA', 'EXECUTADA', 'CANCELADA'))
       or (v_a.status = 'EXECUTADA' and p_status = 'EM_ANDAMENTO')) then
    raise exception 'INVALID_TRANSITION: ação % -> % não é permitida', v_a.status, p_status;
  end if;
  if p_status = 'CANCELADA' and not public.quality_can_manage(v_c.c_project) then
    raise exception 'FORBIDDEN: cancelar ação exige perfil de gestão';
  end if;
  if (p_status = 'CANCELADA' or v_a.status = 'EXECUTADA') and (v_just is null or char_length(v_just) < 10) then
    raise exception 'JUSTIFICATION_REQUIRED: justificativa (mín. 10 caracteres) obrigatória para cancelar ou desfazer uma ação executada';
  end if;

  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_corrective_actions
    set status = p_status, executed_at = case when p_status = 'EXECUTADA' then now() else null end
    where id = v_a.id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_a.project_id, 'QUALITY_CAPA_STATUS', 'QUALITY_CORRECTIVE_ACTIONS', v_a.id,
    jsonb_build_object('from', v_a.status, 'to', p_status, 'justification', v_just, 'expectedVersion', p_expected_version,
      'newVersion', v_new_version, 'note', 'ação executada NÃO equivale a conformidade: o encerramento exige verificação de eficácia'));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_a.id, 'from', v_a.status, 'to', p_status, 'rowVersion', v_new_version);
end;
$$;

-- ============================================================
-- VERIFICAÇÃO DE EFICÁCIA (append-only; condição de encerramento)
-- ============================================================
create or replace function public.quality_verification_register(
  p_ncr_id uuid, p_warranty_case_id uuid, p_expected_version integer, p_result text, p_criteria text,
  p_evidence_id uuid, p_notes text default null, p_action_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_criteria text := nullif(btrim(coalesce(p_criteria, '')), '');
  v_ev public.quality_evidence%rowtype;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(p_ncr_id, p_warranty_case_id, true);
  if not found or not public.quality_can_manage(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version) do caso'; end if;
  if p_expected_version <> v_c.c_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual do caso é %', p_expected_version, v_c.c_version;
  end if;
  if p_result is null or p_result not in ('EFICAZ', 'INEFICAZ', 'PARCIAL') then raise exception 'INVALID_DATA: resultado da verificação inválido'; end if;
  if v_criteria is null or char_length(v_criteria) < 5 or char_length(v_criteria) > 2000 then
    raise exception 'INVALID_DATA: descreva o critério de verificação (5 a 2000 caracteres)';
  end if;
  if p_evidence_id is null then raise exception 'EVIDENCE_REQUIRED: a verificação de eficácia exige evidência'; end if;
  if v_c.c_type = 'NCR' and v_c.c_state <> 'VERIFICACAO' then
    raise exception 'VERIFICATION_STATE_INVALID: verificação de eficácia só em RNC no estado VERIFICACAO (atual: %)', v_c.c_state;
  end if;
  if v_c.c_type = 'WARRANTY' and v_c.c_state <> 'REPARADA' then
    raise exception 'VERIFICATION_STATE_INVALID: verificação de eficácia só em garantia no estado REPARADA (atual: %)', v_c.c_state;
  end if;
  select * into v_ev from public.quality_evidence e
    where e.id = p_evidence_id and e.project_id = v_c.c_project
      and ((v_c.c_type = 'NCR' and e.ncr_id = v_c.c_id) or (v_c.c_type = 'WARRANTY' and e.warranty_case_id = v_c.c_id));
  if not found then raise exception 'EVIDENCE_INVALID: a evidência deve existir e pertencer ao mesmo caso e projeto'; end if;
  if v_ev.epistemic <> 'FATO' then
    raise exception 'EVIDENCE_INVALID: a evidência da verificação deve ser um FATO (inferência/recomendação não comprovam eficácia)';
  end if;
  if p_action_id is not null and not exists (
       select 1 from public.quality_corrective_actions a
       where a.id = p_action_id and a.project_id = v_c.c_project
         and ((v_c.c_type = 'NCR' and a.ncr_id = v_c.c_id) or (v_c.c_type = 'WARRANTY' and a.warranty_case_id = v_c.c_id))) then
    raise exception 'INVALID_DATA: a ação informada não pertence a este caso';
  end if;

  insert into public.quality_effectiveness_verifications (project_id, ncr_id, warranty_case_id, action_id, result, criteria, notes, evidence_id, verified_by)
  values (v_c.c_project, p_ncr_id, p_warranty_case_id, p_action_id, p_result, v_criteria, nullif(btrim(coalesce(p_notes, '')), ''), p_evidence_id, v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'result', p_result);
end;
$$;

-- ============================================================
-- ACEITE DO CLIENTE (garantia)
-- ============================================================
create or replace function public.quality_warranty_acceptance_register(
  p_case_id uuid, p_expected_version integer, p_accepted_at date, p_accepted_by_name text, p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_name text := nullif(btrim(coalesce(p_accepted_by_name, '')), '');
  v_ev public.quality_evidence%rowtype;
  v_old public.quality_warranty_cases%rowtype;
  v_new_version integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(null, p_case_id, true);
  if not found or not public.quality_can_manage(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_c.c_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_c.c_version;
  end if;
  if v_c.c_state not in ('REPARADA', 'VERIFICADA') then
    raise exception 'INVALID_STATE: o aceite do cliente só é registrado com a garantia REPARADA ou VERIFICADA (atual: %)', v_c.c_state;
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 200 then raise exception 'INVALID_DATA: informe quem aceitou (2 a 200 caracteres)'; end if;
  if p_accepted_at is null or p_accepted_at > current_date + 1 then raise exception 'INVALID_DATA: data do aceite inválida (obrigatória e não futura)'; end if;
  if p_evidence_id is null then raise exception 'EVIDENCE_REQUIRED: o aceite do cliente exige evidência (termo, e-mail, ata)'; end if;
  select * into v_ev from public.quality_evidence e where e.id = p_evidence_id and e.project_id = v_c.c_project and e.warranty_case_id = v_c.c_id;
  if not found then raise exception 'EVIDENCE_INVALID: a evidência deve existir e pertencer a este caso'; end if;
  if v_ev.epistemic <> 'FATO' then raise exception 'EVIDENCE_INVALID: a evidência do aceite deve ser um FATO'; end if;

  select * into v_old from public.quality_warranty_cases where id = v_c.c_id;
  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_warranty_cases
    set accepted_at = (p_accepted_at::timestamp + interval '12 hours') at time zone 'UTC', accepted_by_name = v_name, accepted_evidence_id = v_ev.id
    where id = v_c.c_id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_c.c_project, 'QUALITY_WARRANTY_ACCEPTANCE', 'QUALITY_WARRANTY_CASES', v_c.c_id,
    jsonb_build_object('acceptedAt', p_accepted_at, 'acceptedBy', v_name, 'evidenceId', v_ev.id, 'evidenceSourceRef', v_ev.source_ref,
      'previousAcceptedAt', v_old.accepted_at, 'previousAcceptedBy', v_old.accepted_by_name,
      'expectedVersion', p_expected_version, 'newVersion', v_new_version,
      'note', 'aceite do cliente vale para um ciclo; novo reparo ou reabertura exige novo aceite'));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_c.c_id, 'rowVersion', v_new_version);
end;
$$;

-- ============================================================
-- GARANTIA: reparo / reincidência, vistoria, manutenção
-- ============================================================
create or replace function public.quality_warranty_repair_register(
  p_case_id uuid, p_description text, p_executed_at timestamptz default null, p_performed_by text default null,
  p_estimated_cost numeric default null, p_actual_cost numeric default null, p_cost_source_ref text default null,
  p_is_recurrence boolean default false, p_previous_repair_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_src text := nullif(btrim(coalesce(p_cost_source_ref, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(null, p_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar reparos)', v_c.c_state;
  end if;
  if v_desc is null or char_length(v_desc) < 3 or char_length(v_desc) > 4000 then raise exception 'INVALID_DATA: descreva o reparo (3 a 4000 caracteres)'; end if;
  if (p_estimated_cost is not null and p_estimated_cost < 0) or (p_actual_cost is not null and p_actual_cost < 0) then
    raise exception 'INVALID_DATA: custos não podem ser negativos';
  end if;
  if (p_estimated_cost is not null or p_actual_cost is not null) and v_src is null then
    raise exception 'COST_SOURCE_REQUIRED: valor sem fonte não é aceito (nota, orçamento, medição); sem valor o custo fica SEM DADOS';
  end if;
  if p_executed_at is not null and p_executed_at > now() + interval '1 day' then raise exception 'INVALID_DATA: data de execução futura'; end if;
  if coalesce(p_is_recurrence, false) then
    if p_previous_repair_id is null or not exists (select 1 from public.quality_warranty_repairs r where r.id = p_previous_repair_id and r.warranty_case_id = v_c.c_id) then
      raise exception 'INVALID_DATA: reincidência exige indicar um reparo anterior DESTE caso';
    end if;
  elsif p_previous_repair_id is not null then
    raise exception 'INVALID_DATA: reparo anterior só se aplica a reincidência';
  end if;
  insert into public.quality_warranty_repairs (project_id, warranty_case_id, executed_at, description, performed_by, estimated_cost, actual_cost,
    cost_source_ref, is_recurrence, previous_repair_id, created_by)
  values (v_c.c_project, v_c.c_id, p_executed_at, v_desc, nullif(btrim(coalesce(p_performed_by, '')), ''), p_estimated_cost, p_actual_cost, v_src,
    coalesce(p_is_recurrence, false), case when coalesce(p_is_recurrence, false) then p_previous_repair_id end, v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_warranty_survey_register(
  p_case_id uuid, p_surveyed_at timestamptz, p_findings text, p_report_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_f text := nullif(btrim(coalesce(p_findings, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(null, p_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar vistorias)', v_c.c_state;
  end if;
  if v_f is null or char_length(v_f) < 3 or char_length(v_f) > 4000 then raise exception 'INVALID_DATA: informe as constatações (3 a 4000 caracteres)'; end if;
  if p_surveyed_at is null or p_surveyed_at > now() + interval '1 day' then raise exception 'INVALID_DATA: data da vistoria obrigatória e não futura'; end if;
  insert into public.quality_warranty_surveys (project_id, warranty_case_id, surveyed_at, surveyor_user_id, findings, report_ref, created_by)
  values (v_c.c_project, v_c.c_id, p_surveyed_at, v_uid, v_f, nullif(btrim(coalesce(p_report_ref, '')), ''), v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_warranty_maintenance_register(
  p_case_id uuid, p_description text, p_performed_at date default null, p_performed_by text default null,
  p_proof_ref text default null, p_proof_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_d text := nullif(btrim(coalesce(p_description, '')), '');
  v_url text := nullif(btrim(coalesce(p_proof_url, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(null, p_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar manutenções)', v_c.c_state;
  end if;
  if v_d is null or char_length(v_d) < 3 or char_length(v_d) > 2000 then raise exception 'INVALID_DATA: descreva a manutenção (3 a 2000 caracteres)'; end if;
  if v_url is not null and v_url !~* '^https?://' then raise exception 'INVALID_DATA: link do comprovante deve ser http(s)'; end if;
  insert into public.quality_warranty_maintenance (project_id, warranty_case_id, performed_at, description, performed_by, proof_ref, proof_url, created_by)
  values (v_c.c_project, v_c.c_id, p_performed_at, v_d, nullif(btrim(coalesce(p_performed_by, '')), ''),
    nullif(btrim(coalesce(p_proof_ref, '')), ''), v_url, v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

-- ============================================================
-- CONSEQUÊNCIA POR PILAR, CUSTO DE NÃO QUALIDADE, RECORRÊNCIA
-- ============================================================
create or replace function public.quality_consequence_register(
  p_ncr_id uuid, p_warranty_case_id uuid, p_pillar text, p_severity text, p_source_type text, p_source_ref text,
  p_probability text default null, p_probability_basis text default null, p_description text default null,
  p_measures text default null, p_responsible_user_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_basis text := nullif(btrim(coalesce(p_probability_basis, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(p_ncr_id, p_warranty_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar consequências)', v_c.c_state;
  end if;
  if p_pillar is null or p_pillar not in ('PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE') then raise exception 'INVALID_DATA: pilar inválido'; end if;
  if p_severity is null or p_severity not in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') then raise exception 'INVALID_DATA: severidade inválida'; end if;
  if v_ref is null or char_length(v_ref) > 1000 then
    raise exception 'INVALID_DATA: toda consequência precisa da fonte (documento, foto, laudo ou decisão que a sustenta)';
  end if;
  if p_source_type is null or btrim(p_source_type) = '' then raise exception 'INVALID_DATA: tipo da fonte obrigatório'; end if;
  if p_probability is not null and (p_probability not in ('RARA', 'IMPROVAVEL', 'POSSIVEL', 'PROVAVEL', 'QUASE_CERTA') or v_basis is null or char_length(v_basis) < 5) then
    raise exception 'INVALID_DATA: probabilidade só com valor válido e fundamento (mín. 5 caracteres); sem fundamento fica SEM DADOS';
  end if;
  if p_responsible_user_id is not null and not public.quality_member_active(v_c.c_project, p_responsible_user_id) then
    raise exception 'INVALID_DATA: o responsável deve ser membro ativo do projeto';
  end if;
  insert into public.quality_consequences (project_id, ncr_id, warranty_case_id, pillar, severity, probability, probability_basis, description,
    source_type, source_ref, responsible_user_id, measures, created_by)
  values (v_c.c_project, p_ncr_id, p_warranty_case_id, p_pillar, p_severity, p_probability, case when p_probability is not null then v_basis end,
    nullif(btrim(coalesce(p_description, '')), ''), btrim(p_source_type), v_ref, p_responsible_user_id,
    nullif(btrim(coalesce(p_measures, '')), ''), v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1,
    'criticality', public.quality_compute_criticality(p_ncr_id, p_warranty_case_id));
end;
$$;

create or replace function public.quality_cost_register(
  p_ncr_id uuid, p_warranty_case_id uuid, p_category text, p_description text default null,
  p_estimated_amount numeric default null, p_actual_amount numeric default null, p_source_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_src text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(p_ncr_id, p_warranty_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar custos)', v_c.c_state;
  end if;
  if p_category is null or p_category not in ('RETRABALHO', 'MATERIAL', 'MAO_DE_OBRA', 'MULTA', 'GARANTIA', 'PERDA_PRAZO', 'OUTRO') then
    raise exception 'INVALID_DATA: categoria de custo inválida';
  end if;
  if (p_estimated_amount is not null and p_estimated_amount < 0) or (p_actual_amount is not null and p_actual_amount < 0) then
    raise exception 'INVALID_DATA: valores não podem ser negativos';
  end if;
  if (p_estimated_amount is not null or p_actual_amount is not null) and v_src is null then
    raise exception 'COST_SOURCE_REQUIRED: valor sem fonte não é aceito (nota, orçamento, medição); sem valor o custo fica SEM DADOS';
  end if;
  insert into public.quality_nonquality_costs (project_id, ncr_id, warranty_case_id, category, description, estimated_amount, actual_amount, source_ref, created_by)
  values (v_c.c_project, p_ncr_id, p_warranty_case_id, p_category, nullif(btrim(coalesce(p_description, '')), ''),
    p_estimated_amount, p_actual_amount, v_src, v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_recurrence_register(
  p_ncr_id uuid, p_warranty_case_id uuid, p_related_ncr_id uuid, p_related_warranty_case_id uuid, p_basis text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_basis text := nullif(btrim(coalesce(p_basis, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(p_ncr_id, p_warranty_case_id, true);
  if not found or not public.quality_can_register(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if not public.quality_case_accepts_children(v_c.c_type, v_c.c_state) then
    raise exception 'CASE_NOT_ACTIVE: o caso está % (reabra antes de registrar recorrências)', v_c.c_state;
  end if;
  if num_nonnulls(p_related_ncr_id, p_related_warranty_case_id) <> 1 then raise exception 'INVALID_DATA: informe exatamente um caso relacionado'; end if;
  if p_related_ncr_id is not null and not exists (select 1 from public.quality_ncrs n where n.id = p_related_ncr_id and n.project_id = v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if p_related_warranty_case_id is not null and not exists (select 1 from public.quality_warranty_cases w where w.id = p_related_warranty_case_id and w.project_id = v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if p_related_ncr_id = p_ncr_id or p_related_warranty_case_id = p_warranty_case_id then raise exception 'INVALID_DATA: um caso não pode ser recorrência dele mesmo'; end if;
  if v_basis is null or char_length(v_basis) < 5 or char_length(v_basis) > 2000 then raise exception 'INVALID_DATA: informe o fundamento da recorrência (5 a 2000 caracteres)'; end if;
  insert into public.quality_recurrences (project_id, ncr_id, warranty_case_id, related_ncr_id, related_warranty_case_id, basis, created_by)
  values (v_c.c_project, p_ncr_id, p_warranty_case_id, p_related_ncr_id, p_related_warranty_case_id, v_basis, v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'rowVersion', 1);
end;
$$;

-- ============================================================
-- RECLAMAÇÃO, INSPEÇÃO, ENSAIO, REQUISITO (registros de projeto)
-- ============================================================
create or replace function public.quality_complaint_register(
  p_project_id uuid, p_channel text, p_received_at timestamptz, p_subject text, p_source_ref text,
  p_complainant text default null, p_description text default null, p_source_url text default null,
  p_ncr_id uuid default null, p_warranty_case_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_subject text := nullif(btrim(coalesce(p_subject, '')), '');
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if p_channel is null or p_channel not in ('EMAIL_CLIENTE', 'EMAIL_AXION', 'TELEFONE', 'PORTAL', 'PRESENCIAL', 'OUTRO') then raise exception 'INVALID_DATA: canal inválido'; end if;
  if p_received_at is null then raise exception 'INVALID_DATA: informe a data e hora de recebimento'; end if;
  if v_subject is null or char_length(v_subject) < 3 or char_length(v_subject) > 300 then raise exception 'INVALID_DATA: assunto de 3 a 300 caracteres'; end if;
  if v_ref is null or char_length(v_ref) > 1000 then raise exception 'INVALID_DATA: informe a fonte original (ex.: assunto/ID do e-mail, protocolo)'; end if;
  if p_ncr_id is not null and not exists (select 1 from public.quality_ncrs n where n.id = p_ncr_id and n.project_id = p_project_id) then raise exception 'FORBIDDEN'; end if;
  if p_warranty_case_id is not null and not exists (select 1 from public.quality_warranty_cases w where w.id = p_warranty_case_id and w.project_id = p_project_id) then raise exception 'FORBIDDEN'; end if;
  begin
    insert into public.quality_customer_complaints (project_id, channel, received_at, complainant, subject, description, source_ref, source_url, ncr_id, warranty_case_id, created_by)
    values (p_project_id, p_channel, p_received_at, nullif(btrim(coalesce(p_complainant, '')), ''), v_subject, nullif(btrim(coalesce(p_description, '')), ''),
      v_ref, nullif(btrim(coalesce(p_source_url, '')), ''), p_ncr_id, p_warranty_case_id, v_uid)
    returning id, code into v_id, v_code;
  exception when unique_violation then
    raise exception using errcode = '23505', message = 'DUPLICATE_RECORD: esta reclamação (canal + fonte) já foi registrada';
  end;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_inspection_register(
  p_project_id uuid, p_title text, p_result text, p_inspection_type text default null, p_location text default null,
  p_planned_at timestamptz default null, p_performed_at timestamptz default null, p_notes text default null,
  p_source_ref text default null, p_ncr_id uuid default null, p_requirement_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 300 then raise exception 'INVALID_DATA: título de 3 a 300 caracteres'; end if;
  if p_result is null or p_result not in ('PENDENTE', 'CONFORME', 'NAO_CONFORME', 'PARCIAL') then raise exception 'INVALID_DATA: resultado inválido'; end if;
  if p_ncr_id is not null and not exists (select 1 from public.quality_ncrs n where n.id = p_ncr_id and n.project_id = p_project_id) then raise exception 'FORBIDDEN'; end if;
  if p_requirement_id is not null and not exists (select 1 from public.quality_requirements r where r.id = p_requirement_id and r.project_id = p_project_id) then raise exception 'FORBIDDEN'; end if;
  insert into public.quality_inspections (project_id, title, inspection_type, location, planned_at, performed_at, result, inspector_user_id, requirement_id, ncr_id, notes, source_ref, created_by)
  values (p_project_id, v_title, nullif(btrim(coalesce(p_inspection_type, '')), ''), nullif(btrim(coalesce(p_location, '')), ''), p_planned_at, p_performed_at,
    p_result, v_uid, p_requirement_id, p_ncr_id, nullif(btrim(coalesce(p_notes, '')), ''), nullif(btrim(coalesce(p_source_ref, '')), ''), v_uid)
  returning id, code into v_id, v_code;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_test_register(
  p_project_id uuid, p_test_type text, p_result text, p_laboratory text default null, p_sample_ref text default null,
  p_performed_at timestamptz default null, p_report_ref text default null, p_report_url text default null,
  p_notes text default null, p_ncr_id uuid default null, p_requirement_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := nullif(btrim(coalesce(p_test_type, '')), '');
  v_report text := nullif(btrim(coalesce(p_report_ref, '')), '');
  v_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if v_type is null or char_length(v_type) < 2 or char_length(v_type) > 200 then raise exception 'INVALID_DATA: tipo de ensaio de 2 a 200 caracteres'; end if;
  if p_result is null or p_result not in ('PENDENTE', 'APROVADO', 'REPROVADO', 'INCONCLUSIVO') then raise exception 'INVALID_DATA: resultado inválido'; end if;
  if p_result in ('APROVADO', 'REPROVADO') and v_report is null then
    raise exception 'INVALID_DATA: resultado conclusivo (aprovado/reprovado) exige o laudo ou relatório de origem';
  end if;
  if p_ncr_id is not null and not exists (select 1 from public.quality_ncrs n where n.id = p_ncr_id and n.project_id = p_project_id) then raise exception 'FORBIDDEN'; end if;
  if p_requirement_id is not null and not exists (select 1 from public.quality_requirements r where r.id = p_requirement_id and r.project_id = p_project_id) then raise exception 'FORBIDDEN'; end if;
  insert into public.quality_tests (project_id, test_type, laboratory, sample_ref, performed_at, result, requirement_id, ncr_id, report_ref, report_url, notes, created_by)
  values (p_project_id, v_type, nullif(btrim(coalesce(p_laboratory, '')), ''), nullif(btrim(coalesce(p_sample_ref, '')), ''), p_performed_at, p_result,
    p_requirement_id, p_ncr_id, v_report, nullif(btrim(coalesce(p_report_url, '')), ''), nullif(btrim(coalesce(p_notes, '')), ''), v_uid)
  returning id, code into v_id, v_code;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'rowVersion', 1);
end;
$$;

create or replace function public.quality_requirement_register(
  p_project_id uuid, p_title text, p_source_ref text, p_description text default null, p_source_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_title text := nullif(btrim(coalesce(p_title, '')), '');
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 300 then raise exception 'INVALID_DATA: título de 3 a 300 caracteres'; end if;
  if v_ref is null or char_length(v_ref) > 1000 then raise exception 'INVALID_DATA: todo requisito aponta para a fonte (norma, projeto, especificação, contrato)'; end if;
  insert into public.quality_requirements (project_id, title, description, source_ref, source_url, created_by)
  values (p_project_id, v_title, nullif(btrim(coalesce(p_description, '')), ''), v_ref, nullif(btrim(coalesce(p_source_url, '')), ''), v_uid)
  returning id, code into v_id, v_code;
  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code, 'rowVersion', 1);
end;
$$;

-- ============================================================
-- EDIÇÃO DE CAMPOS: RNC e caso de garantia (diff no servidor; cada campo exige a sua autoridade)
-- ============================================================
create or replace function public.quality_ncr_update_fields(
  p_ncr_id uuid, p_expected_version integer, p_changes jsonb, p_justification text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n public.quality_ncrs%rowtype;
  v_just text := nullif(btrim(coalesce(p_justification, '')), '');
  v_key text;
  v_title text;
  v_description text;
  v_responsible uuid;
  v_requirement uuid;
  v_root text;
  v_due date;
  v_changed text[] := '{}';
  v_manage_changed boolean := false;
  v_needs_just boolean := false;
  v_new_version integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_n from public.quality_ncrs where id = p_ncr_id;
  if not found or not public.quality_can_register(v_n.project_id) then raise exception 'FORBIDDEN'; end if;
  select * into v_n from public.quality_ncrs where id = p_ncr_id for update;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_n.row_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_n.row_version;
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'INVALID_DATA: informe os campos a alterar'; end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if v_key not in ('title', 'description', 'responsible_user_id', 'requirement_id', 'root_cause', 'due_date') then
      raise exception 'INVALID_DATA: campo não editável: %', v_key;
    end if;
  end loop;
  if not public.quality_case_accepts_children('NCR', v_n.state) then
    raise exception 'CASE_NOT_ACTIVE: a RNC está % (reabra antes de editar)', v_n.state;
  end if;

  v_title := v_n.title; v_description := v_n.description; v_responsible := v_n.responsible_user_id;
  v_requirement := v_n.requirement_id; v_root := v_n.root_cause; v_due := v_n.due_date;
  begin
    if p_changes ? 'title' then v_title := nullif(btrim(coalesce(p_changes ->> 'title', '')), ''); end if;
    if p_changes ? 'description' then v_description := nullif(btrim(coalesce(p_changes ->> 'description', '')), ''); end if;
    if p_changes ? 'responsible_user_id' then v_responsible := nullif(p_changes ->> 'responsible_user_id', '')::uuid; end if;
    if p_changes ? 'requirement_id' then v_requirement := nullif(p_changes ->> 'requirement_id', '')::uuid; end if;
    if p_changes ? 'root_cause' then v_root := nullif(btrim(coalesce(p_changes ->> 'root_cause', '')), ''); end if;
    if p_changes ? 'due_date' then v_due := nullif(p_changes ->> 'due_date', '')::date; end if;
  exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    raise exception 'INVALID_DATA: valor inválido (uuid ou data AAAA-MM-DD)';
  end;
  if v_title is null or char_length(v_title) < 3 or char_length(v_title) > 300 then raise exception 'INVALID_DATA: título de 3 a 300 caracteres'; end if;
  if v_responsible is not null and not public.quality_member_active(v_n.project_id, v_responsible) then
    raise exception 'INVALID_DATA: o responsável deve ser membro ativo do projeto';
  end if;
  if v_requirement is not null and not exists (select 1 from public.quality_requirements r where r.id = v_requirement and r.project_id = v_n.project_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_title is distinct from v_n.title then v_changed := array_append(v_changed, 'title'); end if;
  if v_description is distinct from v_n.description then v_changed := array_append(v_changed, 'description'); end if;
  if v_responsible is distinct from v_n.responsible_user_id then v_changed := array_append(v_changed, 'responsible_user_id'); v_manage_changed := true; end if;
  if v_requirement is distinct from v_n.requirement_id then v_changed := array_append(v_changed, 'requirement_id'); v_manage_changed := true; end if;
  if v_root is distinct from v_n.root_cause then
    v_changed := array_append(v_changed, 'root_cause'); v_manage_changed := true;
    if v_n.root_cause is not null then v_needs_just := true; end if;
  end if;
  if v_due is distinct from v_n.due_date then
    v_changed := array_append(v_changed, 'due_date'); v_manage_changed := true;
    if v_n.due_date is not null then v_needs_just := true; end if;
  end if;
  if cardinality(v_changed) = 0 then
    return jsonb_build_object('ok', true, 'unchanged', true, 'id', v_n.id, 'rowVersion', v_n.row_version);
  end if;
  if v_manage_changed and not public.quality_can_manage(v_n.project_id) then
    raise exception 'FORBIDDEN: alterar causa raiz, prazo, responsável ou requisito exige perfil de gestão';
  end if;
  if v_needs_just and (v_just is null or char_length(v_just) < 10) then
    raise exception 'JUSTIFICATION_REQUIRED: alterar causa raiz ou prazo já definidos exige justificativa (mín. 10 caracteres)';
  end if;

  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_ncrs set title = v_title, description = v_description, responsible_user_id = v_responsible,
    requirement_id = v_requirement, root_cause = v_root, due_date = v_due
    where id = v_n.id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_n.project_id, 'QUALITY_NCR_UPDATE', 'QUALITY_NCR', v_n.id,
    jsonb_build_object('changed', to_jsonb(v_changed),
      'before', jsonb_build_object('title', v_n.title, 'description', v_n.description, 'responsible_user_id', v_n.responsible_user_id,
        'requirement_id', v_n.requirement_id, 'root_cause', v_n.root_cause, 'due_date', v_n.due_date),
      'after', jsonb_build_object('title', v_title, 'description', v_description, 'responsible_user_id', v_responsible,
        'requirement_id', v_requirement, 'root_cause', v_root, 'due_date', v_due),
      'justification', v_just, 'expectedVersion', p_expected_version, 'newVersion', v_new_version));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_n.id, 'changed', to_jsonb(v_changed), 'rowVersion', v_new_version);
end;
$$;

create or replace function public.quality_warranty_case_update(
  p_case_id uuid, p_expected_version integer, p_changes jsonb, p_justification text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_w public.quality_warranty_cases%rowtype;
  v_o jsonb;
  v_n jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_rec public.quality_warranty_cases%rowtype;
  v_just text := nullif(btrim(coalesce(p_justification, '')), '');
  v_key text;
  v_val jsonb;
  v_reg_keys constant text[] := array['defect_description', 'customer_complaint', 'supplier_name', 'contract_ref'];
  v_manage_keys constant text[] := array['service_system', 'cause_category', 'cause_notes', 'hidden_defect', 'solidity_safety',
    'responsible_user_id', 'due_date', 'estimated_cost', 'actual_cost', 'cost_source_ref', 'warranty_terms', 'warranty_terms_ref',
    'delivered_at', 'discovered_at', 'communicated_at', 'supplier_warranty_until', 'builder_warranty_until', 'ncr_id'];
  v_sensitive constant text[] := array['cause_category', 'hidden_defect', 'solidity_safety', 'delivered_at', 'discovered_at', 'communicated_at',
    'warranty_terms', 'warranty_terms_ref', 'supplier_warranty_until', 'builder_warranty_until', 'estimated_cost', 'actual_cost', 'ncr_id'];
  v_changed text[] := '{}';
  v_manage_changed boolean := false;
  v_needs_just boolean := false;
  v_cost_changed boolean := false;
  v_text text;
  v_new_version integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_w from public.quality_warranty_cases where id = p_case_id;
  if not found or not public.quality_can_register(v_w.project_id) then raise exception 'FORBIDDEN'; end if;
  select * into v_w from public.quality_warranty_cases where id = p_case_id for update;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_w.row_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_w.row_version;
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then raise exception 'INVALID_DATA: informe os campos a alterar'; end if;
  if not public.quality_case_accepts_children('WARRANTY', v_w.state) then
    raise exception 'CASE_NOT_ACTIVE: a garantia está % (reabra antes de editar)', v_w.state;
  end if;

  v_o := to_jsonb(v_w);
  for v_key, v_val in select * from jsonb_each(p_changes) loop
    if not (v_key = any (v_reg_keys) or v_key = any (v_manage_keys)) then raise exception 'INVALID_DATA: campo não editável: %', v_key; end if;
    -- texto: vazio vira NULL (SEM DADOS); espaços nas pontas são removidos
    if jsonb_typeof(v_val) = 'string' then
      v_val := case when btrim(v_val #>> '{}') = '' then 'null'::jsonb else to_jsonb(btrim(v_val #>> '{}')) end;
    end if;
    v_clean := v_clean || jsonb_build_object(v_key, v_val);
  end loop;

  -- validação de tipos pelo próprio tipo da coluna; v_n é a forma CANÔNICA (mesma tipagem de v_o) para comparar antes/depois
  begin
    v_rec := jsonb_populate_record(v_w, v_clean);
  exception when others then
    raise exception 'INVALID_DATA: valor inválido em algum campo (datas AAAA-MM-DD, números e booleanos)';
  end;
  v_n := to_jsonb(v_rec);
  if (v_n ->> 'hidden_defect') is null or (v_n ->> 'solidity_safety') is null then raise exception 'INVALID_DATA: sinalizadores devem ser verdadeiro ou falso'; end if;
  if (v_n ->> 'defect_description') is null or char_length(v_n ->> 'defect_description') < 3 or char_length(v_n ->> 'defect_description') > 4000 then
    raise exception 'INVALID_DATA: defeito de 3 a 4000 caracteres';
  end if;
  if (v_n ->> 'service_system') is null or char_length(v_n ->> 'service_system') < 2 or char_length(v_n ->> 'service_system') > 200 then
    raise exception 'INVALID_DATA: serviço/sistema de 2 a 200 caracteres';
  end if;
  if (v_n ->> 'cause_category') is null or (v_n ->> 'cause_category') not in ('A_DEFINIR', 'VICIO_OCULTO', 'SOLIDEZ_SEGURANCA', 'EXECUCAO', 'MATERIAL',
      'PROJETO', 'MAU_USO', 'DESGASTE_NORMAL', 'MANUTENCAO_AUSENTE', 'OUTRA') then
    raise exception 'INVALID_DATA: categoria de causa inválida';
  end if;
  if (v_n ->> 'estimated_cost') is not null and (v_n ->> 'estimated_cost')::numeric < 0 or (v_n ->> 'actual_cost') is not null and (v_n ->> 'actual_cost')::numeric < 0 then
    raise exception 'INVALID_DATA: custos não podem ser negativos';
  end if;
  if (v_n ->> 'responsible_user_id') is not null and not public.quality_member_active(v_w.project_id, (v_n ->> 'responsible_user_id')::uuid) then
    raise exception 'INVALID_DATA: o responsável deve ser membro ativo do projeto';
  end if;
  if (v_n ->> 'ncr_id') is not null and not exists (select 1 from public.quality_ncrs n where n.id = (v_n ->> 'ncr_id')::uuid and n.project_id = v_w.project_id) then
    raise exception 'FORBIDDEN';
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if (v_n -> v_key) is distinct from (v_o -> v_key) then
      v_changed := array_append(v_changed, v_key);
      if v_key = any (v_manage_keys) then v_manage_changed := true; end if;
      if v_key = any (v_sensitive) then
        if v_key in ('hidden_defect', 'solidity_safety') or jsonb_typeof(v_o -> v_key) <> 'null' then v_needs_just := true; end if;
      end if;
      if v_key in ('estimated_cost', 'actual_cost') and jsonb_typeof(v_n -> v_key) <> 'null' then v_cost_changed := true; end if;
    end if;
  end loop;
  if cardinality(v_changed) = 0 then
    return jsonb_build_object('ok', true, 'unchanged', true, 'id', v_w.id, 'rowVersion', v_w.row_version);
  end if;
  if v_manage_changed and not public.quality_can_manage(v_w.project_id) then
    raise exception 'FORBIDDEN: alterar causa, prazos, custos, termos ou responsável exige perfil de gestão';
  end if;
  if v_needs_just and (v_just is null or char_length(v_just) < 10) then
    raise exception 'JUSTIFICATION_REQUIRED: alterar dados que definem a cobertura/custos já informados exige justificativa (mín. 10 caracteres)';
  end if;
  v_text := nullif(btrim(coalesce(v_n ->> 'cost_source_ref', '')), '');
  if v_cost_changed and v_text is null then
    raise exception 'COST_SOURCE_REQUIRED: valor de custo sem fonte não é aceito (nota, orçamento, medição); sem valor o custo fica SEM DADOS';
  end if;

  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_warranty_cases set
    service_system = v_n ->> 'service_system',
    defect_description = v_n ->> 'defect_description',
    customer_complaint = v_n ->> 'customer_complaint',
    supplier_name = v_n ->> 'supplier_name',
    contract_ref = v_n ->> 'contract_ref',
    cause_category = v_n ->> 'cause_category',
    cause_notes = v_n ->> 'cause_notes',
    hidden_defect = (v_n ->> 'hidden_defect')::boolean,
    solidity_safety = (v_n ->> 'solidity_safety')::boolean,
    responsible_user_id = (v_n ->> 'responsible_user_id')::uuid,
    due_date = (v_n ->> 'due_date')::date,
    estimated_cost = (v_n ->> 'estimated_cost')::numeric,
    actual_cost = (v_n ->> 'actual_cost')::numeric,
    cost_source_ref = v_n ->> 'cost_source_ref',
    warranty_terms = v_n ->> 'warranty_terms',
    warranty_terms_ref = v_n ->> 'warranty_terms_ref',
    delivered_at = (v_n ->> 'delivered_at')::date,
    discovered_at = (v_n ->> 'discovered_at')::date,
    communicated_at = (v_n ->> 'communicated_at')::date,
    supplier_warranty_until = (v_n ->> 'supplier_warranty_until')::date,
    builder_warranty_until = (v_n ->> 'builder_warranty_until')::date,
    ncr_id = (v_n ->> 'ncr_id')::uuid
    where id = v_w.id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_w.project_id, 'QUALITY_WARRANTY_UPDATE', 'QUALITY_WARRANTY_CASES', v_w.id,
    jsonb_build_object('changed', to_jsonb(v_changed),
      'before', (select coalesce(jsonb_object_agg(k, v_o -> k), '{}'::jsonb) from unnest(v_changed) k),
      'after', (select coalesce(jsonb_object_agg(k, v_n -> k), '{}'::jsonb) from unnest(v_changed) k),
      'justification', v_just, 'expectedVersion', p_expected_version, 'newVersion', v_new_version));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_w.id, 'changed', to_jsonb(v_changed), 'rowVersion', v_new_version);
end;
$$;

-- ---------- privilégios: só authenticated (anon/PUBLIC sem EXECUTE) ----------
do $$
declare f text;
begin
  foreach f in array array[
    'quality_evidence_register(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text)',
    'quality_evidence_revise(uuid,integer,text,text,text,text)',
    'quality_capa_register(uuid,uuid,text,text,date,uuid)',
    'quality_capa_update_status(uuid,integer,text,text)',
    'quality_verification_register(uuid,uuid,integer,text,text,uuid,text,uuid)',
    'quality_warranty_acceptance_register(uuid,integer,date,text,uuid)',
    'quality_warranty_repair_register(uuid,text,timestamptz,text,numeric,numeric,text,boolean,uuid)',
    'quality_warranty_survey_register(uuid,timestamptz,text,text)',
    'quality_warranty_maintenance_register(uuid,text,date,text,text,text)',
    'quality_consequence_register(uuid,uuid,text,text,text,text,text,text,text,text,uuid)',
    'quality_cost_register(uuid,uuid,text,text,numeric,numeric,text)',
    'quality_recurrence_register(uuid,uuid,uuid,uuid,text)',
    'quality_complaint_register(uuid,text,timestamptz,text,text,text,text,text,uuid,uuid)',
    'quality_inspection_register(uuid,text,text,text,text,timestamptz,timestamptz,text,text,uuid,uuid)',
    'quality_test_register(uuid,text,text,text,text,timestamptz,text,text,text,uuid,uuid)',
    'quality_requirement_register(uuid,text,text,text,text)',
    'quality_ncr_update_fields(uuid,integer,jsonb,text)',
    'quality_warranty_case_update(uuid,integer,jsonb,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
