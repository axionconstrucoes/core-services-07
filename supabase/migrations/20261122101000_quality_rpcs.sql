-- ============================================================
-- 20261122101000_quality_rpcs.sql
--
-- Pilar QUALIDADE (fase 1) — RPCs atômicas:
--   quality_ncr_create               cria RNC com DEDUPE por origem (Qualidade x SSMA)
--   quality_ncr_transition           transição validada pela máquina de estados (auditoria + concorrência otimista)
--   quality_warranty_create          abre caso de garantia/assistência técnica
--   quality_warranty_transition      idem para garantia
--   quality_transition_blockers      por que a transição/encerramento está bloqueado (fonte única das guardas)
--   quality_closure_readiness        pronto para encerrar? (consumido pela fase 2)
--   quality_alert_resolved_guard     GUARDA para a fase 2: alerta RESOLVIDO NUNCA encerra RNC/garantia sozinho
--   quality_find_by_origin           localizar RNC por origem (SSMA consulta antes de abrir caso próprio)
--   quality_warranty_maintenance_status  comprovantes de manutenção (SEM_REGISTRO / SEM_COMPROVANTE / COMPROVADO)
--
-- Regra central: "correção executada" NÃO equivale a conformidade. Encerrar exige verificação de eficácia
-- EFICAZ, com evidência, posterior ao último ciclo de correção/reabertura. Códigos de erro (mensagem inicia com o código):
-- AUTH_REQUIRED, FORBIDDEN, VERSION_REQUIRED, VERSION_CONFLICT, INVALID_TRANSITION, JUSTIFICATION_REQUIRED,
-- EVIDENCE_REQUIRED, EVIDENCE_INVALID, DUPLICATE_TARGET_INVALID, TRANSITION_BLOCKED.
-- ============================================================

-- ---------- códigos automáticos ----------
create or replace function public.quality_assign_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.code is null then
    new.code := public.quality_next_code(new.project_id, tg_argv[0]);
  end if;
  return new;
end;
$$;
revoke all on function public.quality_assign_code() from public, anon, authenticated;

drop trigger if exists quality_requirements_code on public.quality_requirements;
create trigger quality_requirements_code before insert on public.quality_requirements
  for each row execute function public.quality_assign_code('REQ');
drop trigger if exists quality_customer_complaints_code on public.quality_customer_complaints;
create trigger quality_customer_complaints_code before insert on public.quality_customer_complaints
  for each row execute function public.quality_assign_code('REC');
drop trigger if exists quality_inspections_code on public.quality_inspections;
create trigger quality_inspections_code before insert on public.quality_inspections
  for each row execute function public.quality_assign_code('INS');
drop trigger if exists quality_tests_code on public.quality_tests;
create trigger quality_tests_code before insert on public.quality_tests
  for each row execute function public.quality_assign_code('ENS');

-- dedupe de garantia por origem (e-mail/reclamação) no mesmo projeto
create unique index if not exists quality_warranty_origin_active_uq
  on public.quality_warranty_cases (project_id, origin_type, lower(origin_ref))
  where origin_ref is not null and state not in ('CANCELADA');

-- ---------- chave de origem (dedupe) ----------
create or replace function public.quality_origin_key(p_type text, p_ref text)
returns text
language sql
immutable
as $$
  select upper(btrim(p_type)) || ':' || lower(regexp_replace(regexp_replace(btrim(p_ref), '^<', ''), '>$', ''));
$$;

-- ---------- bloqueios / prontidão (fonte única das guardas) ----------
create or replace function public.quality_transition_blockers(p_entity_type text, p_id uuid, p_to text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_state text;
  v_accepted_at timestamptz;
  v_accepted_by text;
  v_blockers text[] := '{}';
  v_ver record;
  v_reset_seq bigint;
  v_actions int;
  v_unexecuted int;
begin
  if p_entity_type = 'NCR' then
    select project_id, state into v_project, v_state from public.quality_ncrs where id = p_id;
  else
    select project_id, state, accepted_at, accepted_by_name into v_project, v_state, v_accepted_at, v_accepted_by
    from public.quality_warranty_cases where id = p_id;
  end if;
  if v_project is null or not public.quality_can_read(v_project) then
    raise exception 'FORBIDDEN';
  end if;

  if p_entity_type = 'NCR' then
    if p_to = 'CONFIRMADA' and not exists (
      select 1 from public.quality_evidence e where e.ncr_id = p_id and e.classification = 'NC_COMPROVADA') then
      v_blockers := array_append(v_blockers, 'CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE'::text);
    end if;
    if p_to = 'PLANO_ACAO' and not exists (
      select 1 from public.quality_corrective_actions a where a.ncr_id = p_id and a.status <> 'CANCELADA') then
      v_blockers := array_append(v_blockers, 'ACTION_PLAN_REQUIRED'::text);
    end if;
    if p_to in ('VERIFICACAO', 'ENCERRADA') then
      select count(*) filter (where a.status <> 'CANCELADA'),
             count(*) filter (where a.status not in ('EXECUTADA', 'CANCELADA'))
        into v_actions, v_unexecuted
      from public.quality_corrective_actions a where a.ncr_id = p_id;
      if v_actions = 0 then v_blockers := array_append(v_blockers, 'NO_CORRECTIVE_ACTION'::text);
      elsif v_unexecuted > 0 then v_blockers := array_append(v_blockers, 'ACTIONS_NOT_EXECUTED'::text); end if;
    end if;
    if p_to = 'ENCERRADA' then
      if v_state is distinct from 'VERIFICACAO' then v_blockers := array_append(v_blockers, 'NOT_IN_VERIFICATION'::text); end if;
      select * into v_ver from public.quality_effectiveness_verifications
        where ncr_id = p_id order by created_at desc, verified_at desc limit 1;
      if not found then
        v_blockers := array_append(v_blockers, 'EFFECTIVENESS_VERIFICATION_REQUIRED'::text);
      else
        if v_ver.result <> 'EFICAZ' then v_blockers := array_append(v_blockers, 'LATEST_VERIFICATION_NOT_EFFECTIVE'::text); end if;
        select max(seq) into v_reset_seq from public.quality_state_events
          where entity_type = 'NCR' and entity_id = p_id and to_state in ('CORRECAO', 'REABERTA');
        if v_reset_seq is not null and v_reset_seq > v_ver.event_seq_at then
          v_blockers := array_append(v_blockers, 'VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN'::text);
        end if;
      end if;
    end if;
  else
    if p_to in ('VERIFICADA', 'ENCERRADA') then
      if p_to = 'VERIFICADA' and v_state is distinct from 'REPARADA' then v_blockers := array_append(v_blockers, 'NOT_REPAIRED'::text); end if;
      if p_to = 'ENCERRADA' and v_state is distinct from 'VERIFICADA' then v_blockers := array_append(v_blockers, 'NOT_VERIFIED'::text); end if;
      select * into v_ver from public.quality_effectiveness_verifications
        where warranty_case_id = p_id order by created_at desc, verified_at desc limit 1;
      if not found then
        v_blockers := array_append(v_blockers, 'EFFECTIVENESS_VERIFICATION_REQUIRED'::text);
      else
        if v_ver.result <> 'EFICAZ' then v_blockers := array_append(v_blockers, 'LATEST_VERIFICATION_NOT_EFFECTIVE'::text); end if;
        select max(seq) into v_reset_seq from public.quality_state_events
          where entity_type = 'WARRANTY' and entity_id = p_id and to_state in ('EM_REPARO', 'REABERTA');
        if v_reset_seq is not null and v_reset_seq > v_ver.event_seq_at then
          v_blockers := array_append(v_blockers, 'VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN'::text);
        end if;
      end if;
    end if;
    if p_to = 'REPARADA' and not exists (
      select 1 from public.quality_warranty_repairs r where r.warranty_case_id = p_id and r.executed_at is not null) then
      v_blockers := array_append(v_blockers, 'REPAIR_RECORD_REQUIRED'::text);
    end if;
    if p_to = 'ENCERRADA' and (v_accepted_at is null or v_accepted_by is null or btrim(v_accepted_by) = '') then
      v_blockers := array_append(v_blockers, 'CUSTOMER_ACCEPTANCE_REQUIRED'::text);
    end if;
  end if;
  return v_blockers;
end;
$$;

create or replace function public.quality_closure_readiness(p_entity_type text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to text := 'ENCERRADA';
  v_state text;
  v_blockers text[];
begin
  if p_entity_type not in ('NCR', 'WARRANTY') then raise exception 'INVALID_ENTITY_TYPE'; end if;
  if p_entity_type = 'NCR' then
    select state into v_state from public.quality_ncrs where id = p_id;
  else
    select state into v_state from public.quality_warranty_cases where id = p_id;
  end if;
  v_blockers := public.quality_transition_blockers(p_entity_type, p_id, v_to);
  return jsonb_build_object('entityType', p_entity_type, 'entityId', p_id, 'state', v_state,
    'ready', cardinality(v_blockers) = 0, 'blockers', to_jsonb(v_blockers));
end;
$$;

-- GUARDA PARA A FASE 2: alerta RESOLVIDO não encerra RNC/garantia. Nunca altera nada; informa o que falta.
create or replace function public.quality_alert_resolved_guard(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_ready jsonb;
begin
  v_ready := public.quality_closure_readiness(p_entity_type, p_entity_id);
  return jsonb_build_object(
    'alertResolutionClosesEntity', false,
    'entityType', p_entity_type,
    'entityId', p_entity_id,
    'entityState', v_ready -> 'state',
    'closureReady', v_ready -> 'ready',
    'blockers', v_ready -> 'blockers',
    'rule', 'RESOLVIDO do alerta é decisão de comunicação/SLA; o encerramento da RNC/garantia exige verificação de eficácia registrada e transição própria (quality_*_transition).');
end;
$$;

-- ---------- núcleo de transição ----------
create or replace function public.quality_transition_core(
  p_entity_type text,
  p_id uuid,
  p_to text,
  p_expected_version integer,
  p_justification text,
  p_evidence_ids uuid[],
  p_duplicate_of uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_state text;
  v_version integer;
  v_t public.quality_state_transitions%rowtype;
  v_just text := nullif(btrim(coalesce(p_justification, '')), '');
  v_ev uuid[] := coalesce(p_evidence_ids, '{}');
  v_ev_ok integer;
  v_blockers text[];
  v_new_version integer;
  v_audit_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_entity_type not in ('NCR', 'WARRANTY') then raise exception 'INVALID_ENTITY_TYPE'; end if;

  -- 1) existência + membership sem vazar existência a quem não é do projeto
  if p_entity_type = 'NCR' then
    select project_id into v_project from public.quality_ncrs where id = p_id;
  else
    select project_id into v_project from public.quality_warranty_cases where id = p_id;
  end if;
  if v_project is null or not public.quality_can_register(v_project) then raise exception 'FORBIDDEN'; end if;

  -- 2) trava a linha: duas transições simultâneas serializam; a segunda reavalia a versão
  if p_entity_type = 'NCR' then
    select state, row_version into v_state, v_version from public.quality_ncrs where id = p_id for update;
  else
    select state, row_version into v_state, v_version from public.quality_warranty_cases where id = p_id for update;
  end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é % (outra transição foi aplicada)', p_expected_version, v_version;
  end if;

  select * into v_t from public.quality_state_transitions
    where entity_type = p_entity_type and from_state = v_state and to_state = p_to;
  if not found then raise exception 'INVALID_TRANSITION: % -> % não é permitida para %', v_state, p_to, p_entity_type; end if;

  if v_t.min_role = 'MANAGE' and not public.quality_can_manage(v_project) then
    raise exception 'FORBIDDEN: a transição % -> % exige perfil de gestão', v_state, p_to;
  end if;
  if v_t.requires_justification and (v_just is null or char_length(v_just) < 10) then
    raise exception 'JUSTIFICATION_REQUIRED: justificativa (mín. 10 caracteres) obrigatória em % -> %', v_state, p_to;
  end if;

  -- evidências informadas devem existir e pertencer ao MESMO caso e projeto
  if cardinality(v_ev) > 0 then
    select count(*) into v_ev_ok from public.quality_evidence e
    where e.id = any(v_ev) and e.project_id = v_project
      and ((p_entity_type = 'NCR' and e.ncr_id = p_id) or (p_entity_type = 'WARRANTY' and e.warranty_case_id = p_id));
    if v_ev_ok <> cardinality(array(select distinct x from unnest(v_ev) x)) then
      raise exception 'EVIDENCE_INVALID: evidência inexistente ou de outro caso/projeto';
    end if;
  end if;
  if v_t.requires_evidence and cardinality(v_ev) = 0 then
    raise exception 'EVIDENCE_REQUIRED: evidência obrigatória em % -> %', v_state, p_to;
  end if;

  if p_entity_type = 'NCR' and p_to = 'DUPLICADA' then
    if p_duplicate_of is null or p_duplicate_of = p_id or not exists (
      select 1 from public.quality_ncrs d where d.id = p_duplicate_of and d.project_id = v_project
        and d.state not in ('DUPLICADA', 'CANCELADA')) then
      raise exception 'DUPLICATE_TARGET_INVALID: informe a RNC original (mesmo projeto, ativa)';
    end if;
  end if;

  v_blockers := public.quality_transition_blockers(p_entity_type, p_id, p_to);
  if cardinality(v_blockers) > 0 then
    raise exception 'TRANSITION_BLOCKED: %', array_to_string(v_blockers, ',');
  end if;

  -- 3) aplica (flag local: o trigger de linha não duplica a auditoria)
  perform set_config('quality.audited_by_rpc', 'on', true);
  if p_entity_type = 'NCR' then
    update public.quality_ncrs set
      state = p_to,
      state_justification = coalesce(v_just, state_justification),
      duplicate_of_id = case when p_to = 'DUPLICADA' then p_duplicate_of else duplicate_of_id end,
      reopen_count = reopen_count + (case when p_to = 'REABERTA' then 1 else 0 end),
      closed_at = case when p_to = 'ENCERRADA' then now() when p_to = 'REABERTA' then null else closed_at end
    where id = p_id
    returning row_version into v_new_version;
  else
    update public.quality_warranty_cases set
      state = p_to,
      state_justification = coalesce(v_just, state_justification),
      reopen_count = reopen_count + (case when p_to = 'REABERTA' then 1 else 0 end),
      closed_at = case when p_to = 'ENCERRADA' then now() when p_to = 'REABERTA' then null else closed_at end
    where id = p_id
    returning row_version into v_new_version;
  end if;

  insert into public.quality_state_events (project_id, entity_type, entity_id, from_state, to_state, actor_user_id,
    justification, evidence_ids, row_version_after)
  values (v_project, p_entity_type, p_id, v_state, p_to, v_uid, v_just, v_ev, v_new_version);

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (v_project, 'USER', v_uid, 'QUALITY_' || p_entity_type || '_TRANSITION', 'QUALITY_' || p_entity_type, p_id::text,
    jsonb_build_object('from', v_state, 'to', p_to, 'justification', v_just, 'evidenceIds', to_jsonb(v_ev),
      'expectedVersion', p_expected_version, 'newVersion', v_new_version,
      'duplicateOf', p_duplicate_of)::text)
  returning id into v_audit_id;

  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'entityType', p_entity_type, 'id', p_id, 'from', v_state, 'to', p_to,
    'rowVersion', v_new_version, 'auditId', v_audit_id);
end;
$$;
revoke all on function public.quality_transition_core(text, uuid, text, integer, text, uuid[], uuid) from public, anon, authenticated;

create or replace function public.quality_ncr_transition(
  p_ncr_id uuid, p_to_state text, p_expected_version integer,
  p_justification text default null, p_evidence_ids uuid[] default null, p_duplicate_of uuid default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.quality_transition_core('NCR', p_ncr_id, p_to_state, p_expected_version, p_justification, p_evidence_ids, p_duplicate_of);
$$;

create or replace function public.quality_warranty_transition(
  p_case_id uuid, p_to_state text, p_expected_version integer,
  p_justification text default null, p_evidence_ids uuid[] default null)
returns jsonb language sql security definer set search_path = '' as $$
  select public.quality_transition_core('WARRANTY', p_case_id, p_to_state, p_expected_version, p_justification, p_evidence_ids, null);
$$;

-- ---------- criação de RNC (dedupe por origem) ----------
create or replace function public.quality_ncr_create(
  p_project_id uuid, p_title text, p_description text, p_origin_type text, p_origin_ref text,
  p_origin_url text default null, p_responsible_user_id uuid default null, p_requirement_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_key text;
  v_existing public.quality_ncrs%rowtype;
  v_id uuid;
  v_code text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if p_origin_ref is null or btrim(p_origin_ref) = '' then
    raise exception 'ORIGIN_REQUIRED: toda RNC aponta para a fonte original (origin_ref)';
  end if;
  v_key := public.quality_origin_key(p_origin_type, p_origin_ref);

  select * into v_existing from public.quality_ncrs where project_id = p_project_id and origin_key = v_key
    and state not in ('DUPLICADA', 'CANCELADA');
  if found then
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
    values (p_project_id, 'USER', v_uid, 'QUALITY_NCR_DEDUPED', 'QUALITY_NCR', v_existing.id::text,
      jsonb_build_object('originKey', v_key, 'note', 'Origem já possui RNC ativa; nenhuma RNC nova criada.')::text);
    return jsonb_build_object('created', false, 'deduplicated', true, 'id', v_existing.id, 'code', v_existing.code,
      'rowVersion', v_existing.row_version);
  end if;

  v_code := public.quality_next_code(p_project_id, 'RNC');
  begin
    insert into public.quality_ncrs (project_id, code, title, description, origin_type, origin_ref, origin_key, origin_url,
      responsible_user_id, requirement_id, created_by)
    values (p_project_id, v_code, p_title, p_description, p_origin_type, btrim(p_origin_ref), v_key, p_origin_url,
      p_responsible_user_id, p_requirement_id, v_uid)
    returning id into v_id;
  exception when unique_violation then
    -- corrida: outra sessão criou a RNC da mesma origem entre o SELECT e o INSERT
    select * into v_existing from public.quality_ncrs where project_id = p_project_id and origin_key = v_key
      and state not in ('DUPLICADA', 'CANCELADA');
    return jsonb_build_object('created', false, 'deduplicated', true, 'id', v_existing.id, 'code', v_existing.code,
      'rowVersion', v_existing.row_version);
  end;

  insert into public.quality_state_events (project_id, entity_type, entity_id, from_state, to_state, actor_user_id, row_version_after)
  values (p_project_id, 'NCR', v_id, null, 'DETECTADA', v_uid, 1);
  return jsonb_build_object('created', true, 'deduplicated', false, 'id', v_id, 'code', v_code, 'rowVersion', 1);
end;
$$;

-- ---------- abertura de garantia ----------
create or replace function public.quality_warranty_create(p_project_id uuid, p_service_system text, p_defect_description text,
  p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_code text;
  v_origin_type text := coalesce(p_data ->> 'origin_type', 'MANUAL');
  v_origin_ref text := nullif(btrim(coalesce(p_data ->> 'origin_ref', '')), '');
  v_existing public.quality_warranty_cases%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_register(p_project_id) then raise exception 'FORBIDDEN'; end if;
  if v_origin_ref is not null then
    select * into v_existing from public.quality_warranty_cases
      where project_id = p_project_id and origin_type = v_origin_type and lower(origin_ref) = lower(v_origin_ref) and state <> 'CANCELADA';
    if found then
      return jsonb_build_object('created', false, 'deduplicated', true, 'id', v_existing.id, 'code', v_existing.code, 'rowVersion', v_existing.row_version);
    end if;
  end if;
  v_code := public.quality_next_code(p_project_id, 'GAR');
  begin
    insert into public.quality_warranty_cases (project_id, code, service_system, defect_description, contract_ref,
      delivered_at, discovered_at, communicated_at, warranty_terms, warranty_terms_ref, customer_complaint,
      cause_category, hidden_defect, solidity_safety, responsible_user_id, due_date, estimated_cost, supplier_name,
      supplier_warranty_until, builder_warranty_until, origin_type, origin_ref, ncr_id, created_by)
    values (p_project_id, v_code, p_service_system, p_defect_description, p_data ->> 'contract_ref',
      (p_data ->> 'delivered_at')::date, (p_data ->> 'discovered_at')::date, (p_data ->> 'communicated_at')::date,
      p_data ->> 'warranty_terms', p_data ->> 'warranty_terms_ref', p_data ->> 'customer_complaint',
      coalesce(p_data ->> 'cause_category', 'A_DEFINIR'), coalesce((p_data ->> 'hidden_defect')::boolean, false),
      coalesce((p_data ->> 'solidity_safety')::boolean, false), (p_data ->> 'responsible_user_id')::uuid,
      (p_data ->> 'due_date')::date, (p_data ->> 'estimated_cost')::numeric, p_data ->> 'supplier_name',
      (p_data ->> 'supplier_warranty_until')::date, (p_data ->> 'builder_warranty_until')::date, v_origin_type, v_origin_ref,
      (p_data ->> 'ncr_id')::uuid, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select * into v_existing from public.quality_warranty_cases
      where project_id = p_project_id and origin_type = v_origin_type and lower(origin_ref) = lower(v_origin_ref) and state <> 'CANCELADA';
    return jsonb_build_object('created', false, 'deduplicated', true, 'id', v_existing.id, 'code', v_existing.code, 'rowVersion', v_existing.row_version);
  end;
  insert into public.quality_state_events (project_id, entity_type, entity_id, from_state, to_state, actor_user_id, row_version_after)
  values (p_project_id, 'WARRANTY', v_id, null, 'ABERTA', v_uid, 1);
  return jsonb_build_object('created', true, 'deduplicated', false, 'id', v_id, 'code', v_code, 'rowVersion', 1);
end;
$$;

-- ---------- consultas ----------
create or replace function public.quality_find_by_origin(p_project_id uuid, p_origin_type text, p_origin_ref text)
returns table (id uuid, code text, state text, row_version integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_project_id is null or not public.quality_can_read(p_project_id) then raise exception 'FORBIDDEN'; end if;
  return query
    select n.id, n.code, n.state, n.row_version from public.quality_ncrs n
    where n.project_id = p_project_id and n.origin_key = public.quality_origin_key(p_origin_type, p_origin_ref)
      and n.state not in ('DUPLICADA', 'CANCELADA');
end;
$$;

create or replace function public.quality_warranty_maintenance_status(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_project uuid; v_total int; v_missing int;
begin
  select project_id into v_project from public.quality_warranty_cases where id = p_case_id;
  if v_project is null or not public.quality_can_read(v_project) then raise exception 'FORBIDDEN'; end if;
  select count(*), count(*) filter (where proof_ref is null or btrim(proof_ref) = '')
    into v_total, v_missing from public.quality_warranty_maintenance where warranty_case_id = p_case_id;
  return jsonb_build_object('records', v_total, 'withoutProof', v_missing,
    'status', case when v_total = 0 then 'SEM_REGISTRO' when v_missing > 0 then 'SEM_COMPROVANTE' else 'COMPROVADO' end,
    'note', 'Constatação factual de dados; não conclui exclusão de garantia (análise jurídica/contratual é separada).');
end;
$$;

-- ---------- privilégios ----------
revoke all on function public.quality_transition_blockers(text, uuid, text), public.quality_closure_readiness(text, uuid),
  public.quality_alert_resolved_guard(text, uuid), public.quality_ncr_transition(uuid, text, integer, text, uuid[], uuid),
  public.quality_warranty_transition(uuid, text, integer, text, uuid[]),
  public.quality_ncr_create(uuid, text, text, text, text, text, uuid, uuid),
  public.quality_warranty_create(uuid, text, text, jsonb), public.quality_find_by_origin(uuid, text, text),
  public.quality_warranty_maintenance_status(uuid), public.quality_origin_key(text, text) from public, anon;
grant execute on function public.quality_transition_blockers(text, uuid, text), public.quality_closure_readiness(text, uuid),
  public.quality_alert_resolved_guard(text, uuid), public.quality_ncr_transition(uuid, text, integer, text, uuid[], uuid),
  public.quality_warranty_transition(uuid, text, integer, text, uuid[]),
  public.quality_ncr_create(uuid, text, text, text, text, text, uuid, uuid),
  public.quality_warranty_create(uuid, text, text, jsonb), public.quality_find_by_origin(uuid, text, text),
  public.quality_warranty_maintenance_status(uuid), public.quality_origin_key(text, text) to authenticated, service_role;
