-- ROLLBACK (manual, NAO e migration) de 20261125100000_warranty_acceptance_proof.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.quality_warranty_acceptances') is not null then
    select count(*) into n from public.quality_warranty_acceptances;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_acceptances tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quality_warranty_cases' and column_name = 'acceptance_status') then
    select count(*) into n from public.quality_warranty_cases where acceptance_status is distinct from 'NENHUM';
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_cases.acceptance_status tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quality_warranty_cases' and column_name = 'current_acceptance_id') then
    select count(*) into n from public.quality_warranty_cases where current_acceptance_id is distinct from null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_cases.current_acceptance_id tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
end $$;
-- constraints criadas pela migration (em blocos DO): a FK para a tabela precisa sair antes dela
alter table if exists public.quality_warranty_cases drop constraint if exists quality_warranty_cases_current_acceptance_fk;
alter table if exists public.quality_warranty_cases drop constraint if exists quality_warranty_cases_acceptance_status_chk;
drop table if exists public.quality_warranty_acceptances;
drop function if exists public.f4b_block_mutation();
drop function if exists public.quality_warranty_acceptance_prove(uuid, integer, date, text, text, text, uuid, text, text);
drop function if exists public.quality_warranty_acceptances_list(uuid);
-- restaura quality_transition_blockers(text, uuid, text) com o corpo de 20261122101000_quality_rpcs
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
-- restaura quality_warranty_state_guard() com o corpo de 20261123300000_quality_integrity_guards
create or replace function public.quality_warranty_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blockers text[];
begin
  if tg_op = 'INSERT' then
    if new.state is distinct from 'ABERTA' or new.reopen_count <> 0 or new.closed_at is not null
       or new.accepted_at is not null or new.accepted_by_name is not null then
      raise exception 'STATE_GUARD: a garantia nasce em ABERTA, sem reaberturas, sem encerramento e sem aceite (recebido: estado %)', new.state;
    end if;
    return new;
  end if;

  if new.state is distinct from old.state then
    if auth.uid() is null then
      raise exception 'STATE_CHANGE_REQUIRES_ACTOR: mudança de estado da garantia exige usuário autenticado (use quality_warranty_transition)';
    end if;
    if not exists (select 1 from public.quality_state_transitions t
                   where t.entity_type = 'WARRANTY' and t.from_state = old.state and t.to_state = new.state) then
      raise exception 'INVALID_TRANSITION: % -> % não é permitida para WARRANTY (guarda de banco)', old.state, new.state;
    end if;
    v_blockers := public.quality_transition_blockers('WARRANTY', old.id, new.state);
    if cardinality(v_blockers) > 0 then
      raise exception 'TRANSITION_BLOCKED: %', array_to_string(v_blockers, ',');
    end if;
    if (new.state = 'ENCERRADA') <> (new.closed_at is not null) then
      raise exception 'STATE_GUARD: closed_at deve ser preenchido exatamente quando o estado é ENCERRADA';
    end if;
    if new.reopen_count is distinct from old.reopen_count + (case when new.state = 'REABERTA' then 1 else 0 end) then
      raise exception 'STATE_GUARD: reopen_count só aumenta (em 1) na transição para REABERTA';
    end if;
    -- o aceite do cliente vale para UM ciclo: novo reparo ou reabertura exige novo aceite (a trilha fica na auditoria)
    if new.state in ('EM_REPARO', 'REABERTA') then
      new.accepted_at := null;
      new.accepted_by_name := null;
      new.accepted_evidence_id := null;
    end if;
  else
    if new.closed_at is distinct from old.closed_at or new.reopen_count is distinct from old.reopen_count then
      raise exception 'STATE_GUARD: closed_at e reopen_count só mudam junto com a transição de estado';
    end if;
  end if;
  return new;
end;
$$;
-- restaura quality_warranty_acceptance_register(uuid, integer, date, text, uuid) com o corpo de 20261123301000_quality_rpcs_children
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
drop index if exists public.quality_warranty_acceptances_case_idx;
drop index if exists public.quality_warranty_acceptances_project_idx;
alter table public.quality_warranty_cases drop column if exists acceptance_status;
alter table public.quality_warranty_cases drop column if exists current_acceptance_id;
commit;
