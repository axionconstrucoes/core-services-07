-- ROLLBACK (manual, NAO e migration) de 20261123200000_endorsement_dual_review.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare n bigint;
begin
  if to_regclass('public.insurance_endorsements') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'insurance_endorsements' and column_name = 'review_round') then
    -- o backfill legacy_single_review (CONFERIDO sem conferencia) e derivado; classificacao, rodadas e EM_REVISAO sao dados novos
    select count(*) into n from public.insurance_endorsements
     where change_kinds is not null or review_round > 1 or state = 'EM_REVISAO'
        or (requires_dual_review = false and legacy_single_review = false)
        or (legacy_single_review = false and dual_review_reason is distinct from 'SEM_CLASSIFICACAO');
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: insurance_endorsements tem % linha(s) com classificacao/rodada/EM_REVISAO (dados de conferencia); nada foi alterado', n; end if;
  end if;
end $$;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.insurance_endorsement_reviews') is not null then
    select count(*) into n from public.insurance_endorsement_reviews;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_endorsement_reviews tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop trigger if exists insurance_endorsements_guard on public.insurance_endorsements;
drop table if exists public.insurance_endorsement_reviews;
drop function if exists public.insurance_int_endorsement_kinds(jsonb);
drop function if exists public.insurance_int_endorsement_dual_reason(text[], boolean);
drop function if exists public.insurance_endorsement_review_prepare();
drop function if exists public.insurance_endorsement_guard();
drop function if exists public.insurance_endorsement_review(uuid, integer, text, jsonb);
-- restaura insurance_endorsement_request(uuid, jsonb) com o corpo de 20261122201000_seguros_garantias_rpcs
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
-- restaura insurance_endorsement_advance(uuid, integer, text, jsonb) com o corpo de 20261122201000_seguros_garantias_rpcs
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
-- restaura insurance_dashboard_items(uuid, date, integer) com o corpo de 20261122201000_seguros_garantias_rpcs
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
drop index if exists public.insurance_endorsement_reviews_endorsement_idx;
drop index if exists public.insurance_endorsement_reviews_project_idx;
alter table public.insurance_endorsements drop column if exists change_kinds;
alter table public.insurance_endorsements drop column if exists requires_dual_review;
alter table public.insurance_endorsements drop column if exists dual_review_reason;
alter table public.insurance_endorsements drop column if exists legacy_single_review;
alter table public.insurance_endorsements drop column if exists review_round;
-- restaura o CHECK de estado da migration 20261122200000 (sem EM_REVISAO)
alter table public.insurance_endorsements drop constraint if exists insurance_endorsements_state_values_check;
alter table public.insurance_endorsements drop constraint if exists insurance_endorsements_state_check;
alter table public.insurance_endorsements add constraint insurance_endorsements_state_check check (state in ('SOLICITADO', 'EM_ANALISE', 'EMITIDO', 'CONFERIDO', 'RECUSADO'));
alter table public.insurance_endorsements drop constraint if exists insurance_endorsements_change_kinds_known_check;
alter table public.insurance_endorsements drop constraint if exists insurance_endorsements_dual_classification_check;
alter table public.insurance_endorsements drop constraint if exists insurance_endorsements_review_round_check;
commit;
