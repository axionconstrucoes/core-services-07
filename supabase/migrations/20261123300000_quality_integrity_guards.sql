-- ============================================================
-- 20261123300000_quality_integrity_guards.sql
--
-- FASE 3 / Frente D (1/4) — INTEGRIDADE no banco para Qualidade e Garantias: "impossibilidade de encerramento indevido".
--
-- Defesa em profundidade: a máquina de estados já vive nas RPCs quality_*_transition (fase 1), mas qualquer caminho que
-- escreva a tabela (service_role, superusuário, função futura) passa a ser barrado por TRIGGERS que reavaliam a mesma regra:
--   * RNC/garantia nascem no estado inicial; o estado só muda por transição existente no catálogo quality_state_transitions;
--   * toda mudança de estado exige ATOR (auth.uid()) e passa pelas mesmas guardas de quality_transition_blockers
--     (encerrar exige verificação de eficácia EFICAZ, com evidência, posterior à última correção/reabertura; garantia exige
--     aceite do cliente) — logo UPDATE direto, RPC ou função nova não encerram sem a verificação/aceite;
--   * closed_at / reopen_count só mudam junto com a transição correspondente;
--   * o aceite do cliente NÃO sobrevive a novo reparo/reabertura (cada ciclo exige novo aceite);
--   * evidência nunca é apagada; evidência já usada por verificação de eficácia ou por decisão de transição não pode ter
--     classificação/tipo epistêmico/descrição alterados (a fonte original já era imutável, inclusive para superusuário).
--
-- Também (aditivo, sem apagar nada): colunas de rastreabilidade (fonte do custo, evidência do aceite) e o relatório de
-- integridade quality_closure_integrity_report (somente leitura) que lista RNC/garantias ENCERRADAS cujas condições de
-- encerramento não se sustentam (detecta adulteração feita por quem desativou os triggers).
--
-- NÃO redefine nenhuma função existente (nomes novos), NÃO toca record_risk_alert_action nem SLAs. Idempotente.
-- Reversão: supabase/rollbacks/20261123300000_quality_integrity_guards.rollback.sql
-- ============================================================

-- ---------- colunas aditivas (rastreabilidade) ----------
alter table public.quality_warranty_cases add column if not exists cost_source_ref text;
alter table public.quality_warranty_cases add column if not exists accepted_evidence_id uuid;
alter table public.quality_warranty_repairs add column if not exists cost_source_ref text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quality_warranty_cases_accepted_evidence_fk') then
    alter table public.quality_warranty_cases
      add constraint quality_warranty_cases_accepted_evidence_fk
      foreign key (accepted_evidence_id, project_id) references public.quality_evidence (id, project_id);
  end if;
end $$;

comment on column public.quality_warranty_cases.cost_source_ref is
  'Fonte (nota, orçamento, medição) dos valores estimated_cost/actual_cost do caso. Obrigatória nas RPCs quando há valor; sem valor = SEM DADOS.';
comment on column public.quality_warranty_cases.accepted_evidence_id is
  'Evidência (do próprio caso) que sustenta o aceite do cliente registrado por quality_warranty_acceptance_register. Null em aceites legados.';
comment on column public.quality_warranty_repairs.cost_source_ref is
  'Fonte dos custos do reparo (nota, orçamento, medição). Obrigatória nas RPCs quando há valor.';

create index if not exists quality_state_events_evidence_gin on public.quality_state_events using gin (evidence_ids);

-- ---------- estado: guardas por trigger (RNC) ----------
create or replace function public.quality_ncr_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blockers text[];
begin
  if tg_op = 'INSERT' then
    if new.state is distinct from 'DETECTADA' or new.reopen_count <> 0 or new.closed_at is not null then
      raise exception 'STATE_GUARD: a RNC nasce em DETECTADA, sem reaberturas e sem encerramento (recebido: estado %, reaberturas %)',
        new.state, new.reopen_count;
    end if;
    return new;
  end if;

  if new.state is distinct from old.state then
    if auth.uid() is null then
      raise exception 'STATE_CHANGE_REQUIRES_ACTOR: mudança de estado da RNC exige usuário autenticado (use quality_ncr_transition)';
    end if;
    if not exists (select 1 from public.quality_state_transitions t
                   where t.entity_type = 'NCR' and t.from_state = old.state and t.to_state = new.state) then
      raise exception 'INVALID_TRANSITION: % -> % não é permitida para NCR (guarda de banco)', old.state, new.state;
    end if;
    v_blockers := public.quality_transition_blockers('NCR', old.id, new.state);
    if cardinality(v_blockers) > 0 then
      raise exception 'TRANSITION_BLOCKED: %', array_to_string(v_blockers, ',');
    end if;
    if (new.state = 'ENCERRADA') <> (new.closed_at is not null) then
      raise exception 'STATE_GUARD: closed_at deve ser preenchido exatamente quando o estado é ENCERRADA';
    end if;
    if new.reopen_count is distinct from old.reopen_count + (case when new.state = 'REABERTA' then 1 else 0 end) then
      raise exception 'STATE_GUARD: reopen_count só aumenta (em 1) na transição para REABERTA';
    end if;
  else
    if new.closed_at is distinct from old.closed_at or new.reopen_count is distinct from old.reopen_count then
      raise exception 'STATE_GUARD: closed_at e reopen_count só mudam junto com a transição de estado';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists quality_ncrs_state_guard_trg on public.quality_ncrs;
create trigger quality_ncrs_state_guard_trg before insert or update on public.quality_ncrs
  for each row execute function public.quality_ncr_state_guard();

-- ---------- estado: guardas por trigger (garantia) ----------
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

drop trigger if exists quality_warranty_cases_state_guard_trg on public.quality_warranty_cases;
create trigger quality_warranty_cases_state_guard_trg before insert or update on public.quality_warranty_cases
  for each row execute function public.quality_warranty_state_guard();

-- ---------- evidência: nunca apagada; usada em verificação/decisão => bloqueada ----------
create or replace function public.quality_evidence_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'EVIDENCE_DELETE_FORBIDDEN: evidência nunca é apagada (rastreabilidade até a fonte original)';
  end if;
  if (new.classification is distinct from old.classification
      or new.epistemic is distinct from old.epistemic
      or new.description is distinct from old.description)
     and (exists (select 1 from public.quality_effectiveness_verifications v where v.evidence_id = old.id)
          or exists (select 1 from public.quality_state_events e where old.id = any (e.evidence_ids))
          or exists (select 1 from public.quality_warranty_cases w where w.accepted_evidence_id = old.id)) then
    raise exception 'EVIDENCE_LOCKED: a evidência sustenta uma verificação, um aceite ou uma decisão de transição; registre uma nova evidência em vez de reclassificá-la';
  end if;
  return new;
end;
$$;

drop trigger if exists quality_evidence_lock_trg on public.quality_evidence;
create trigger quality_evidence_lock_trg before update on public.quality_evidence
  for each row execute function public.quality_evidence_lock();
drop trigger if exists quality_evidence_nodelete_trg on public.quality_evidence;
create trigger quality_evidence_nodelete_trg before delete on public.quality_evidence
  for each row execute function public.quality_evidence_lock();

-- ---------- relatório de integridade (somente leitura) ----------
-- Lista RNC/garantias ENCERRADAS cujas condições de encerramento não se sustentam (ex.: triggers desativados por alguém com
-- poder de superusuário e estado forçado). Ignora apenas as pendências que dependem do estado ATUAL (NOT_IN_VERIFICATION/NOT_VERIFIED).
create or replace function public.quality_closure_integrity_report(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  v_blockers text[];
  v_violations jsonb := '[]'::jsonb;
  v_checked integer := 0;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not public.quality_can_read(p_project_id) then raise exception 'FORBIDDEN'; end if;
  for r in
    select 'NCR'::text as entity_type, n.id, n.code, n.state, n.closed_at from public.quality_ncrs n
      where n.project_id = p_project_id and n.state = 'ENCERRADA'
    union all
    select 'WARRANTY', w.id, w.code, w.state, w.closed_at from public.quality_warranty_cases w
      where w.project_id = p_project_id and w.state = 'ENCERRADA'
  loop
    v_checked := v_checked + 1;
    select coalesce(array_agg(b), '{}') into v_blockers
    from unnest(public.quality_transition_blockers(r.entity_type, r.id, 'ENCERRADA')) b
    where b not in ('NOT_IN_VERIFICATION', 'NOT_VERIFIED');
    if cardinality(v_blockers) > 0 or r.closed_at is null then
      v_violations := v_violations || jsonb_build_array(jsonb_build_object(
        'entityType', r.entity_type, 'id', r.id, 'code', r.code, 'state', r.state,
        'blockers', to_jsonb(case when r.closed_at is null then array_append(v_blockers, 'CLOSED_AT_MISSING') else v_blockers end)));
    end if;
  end loop;
  return jsonb_build_object('projectId', p_project_id, 'checked', v_checked, 'violations', v_violations,
    'consistent', jsonb_array_length(v_violations) = 0);
end;
$$;

revoke all on function public.quality_ncr_state_guard(), public.quality_warranty_state_guard(), public.quality_evidence_lock()
  from public, anon, authenticated;
revoke all on function public.quality_closure_integrity_report(uuid) from public, anon;
grant execute on function public.quality_closure_integrity_report(uuid) to authenticated;

comment on function public.quality_closure_integrity_report(uuid) is
  'Somente leitura (READ): RNC/garantias ENCERRADAS cujas condições de encerramento não se sustentam. consistent=true quando nenhuma violação. Fase 3/D.';
