-- ============================================================
-- 20261125203000_insurance_advances_consolidated.sql
--
-- FASE 4 / Escopo B (5/5) — CONSOLIDAÇÃO de adiantamentos: soma de adiantamentos, amortizado e saldo SEM DUPLA CONTAGEM.
--
-- insurance_advances_consolidated(projeto, apólice?) devolve, por apólice e no total:
--   advanced (soma dos adiantamentos), amortized (efetivo: nunca acima do adiantado), unamortized (saldo = adiantado - amortizado),
--   a lista por adiantamento e as DUPLICIDADES detectadas e EXCLUÍDAS das somas.
-- Regras (idênticas às de apps/web/lib/insurance/advances.ts#consolidateAdvances — paridade testada em Postgres real):
--   * ADIANTAMENTO duplicado = mesma apólice + mesmo nº de contrato normalizado + mesma data + mesmo valor + mesma fonte
--     (documento, ou referência normalizada). Conta UMA vez (o mais antigo); as amortizações do duplicado passam ao mantido;
--   * AMORTIZAÇÃO duplicada (no mesmo adiantamento consolidado) = mesmo valor + mesma data + mesma fonte. Conta UMA vez;
--   * amortização acima do adiantado (legado) é sinalizada (overAmortized) e NÃO gera saldo negativo;
--   * saldo informado (balance_due_informed) e valor indenizável (indemnifiable_informed) NÃO são derivados nem somados aqui:
--     adiantado != saldo não amortizado != saldo devido != indenizável;
--   * o teto de garantia por apólice é a importância segurada da apólice (max_amount); os limites por adiantamento
--     (guaranteed_limit) NÃO são somados (evita dupla contagem de teto). Sem teto: SEM_DADOS (nunca "suficiente" por omissão).
-- Somente leitura; security definer com checagem de leitura do projeto. Idempotente.
-- Reversão: supabase/rollbacks/20261125203000_insurance_advances_consolidated.rollback.sql
-- ============================================================

create or replace function public.insurance_advances_consolidated(p_project_id uuid, p_policy_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.insurance_int_require(p_project_id, 'READ');
  if p_policy_id is not null then perform public.insurance_int_same_project('insurance_policies', p_policy_id, p_project_id); end if;

  with adv as (
    select a.id, a.policy_id, a.advanced_amount, a.guaranteed_limit, a.created_at,
           coalesce(a.policy_id::text, '') || '|' || public.f4b_norm_text(a.contract_number) || '|' || coalesce(a.advance_date::text, '') || '|' ||
           to_char(a.advanced_amount, 'FM999999999999990.00') || '|' || coalesce(a.source_document_id::text, public.f4b_norm_text(a.source_ref)) as dedupe_key
      from public.insurance_advances a
     where a.project_id = p_project_id and (p_policy_id is null or a.policy_id = p_policy_id)
  ),
  adv_ranked as (
    select adv.*, row_number() over (partition by dedupe_key order by created_at, id) as rn,
           first_value(id) over (partition by dedupe_key order by created_at, id) as keep_id
      from adv
  ),
  am as (
    select m.id, m.amount, r.keep_id as advance_id, m.created_at,
           to_char(m.amount, 'FM999999999999990.00') || '|' || coalesce(m.amortized_on::text, '') || '|' ||
           coalesce(m.source_document_id::text, public.f4b_norm_text(m.source_ref)) as akey
      from public.insurance_advance_amortizations m
      join adv_ranked r on r.id = m.advance_id
  ),
  am_ranked as (
    select am.*, row_number() over (partition by advance_id, akey order by created_at, id) as rn,
           first_value(id) over (partition by advance_id, akey order by created_at, id) as keep_id
      from am
  ),
  am_sum as (
    select advance_id, coalesce(sum(amount) filter (where rn = 1), 0) as raw_total from am_ranked group by advance_id
  ),
  per as (
    select r.id, r.policy_id, r.advanced_amount as advanced, r.guaranteed_limit,
           coalesce(s.raw_total, 0) as raw_amortized,
           least(coalesce(s.raw_total, 0), r.advanced_amount) as amortized,
           greatest(coalesce(s.raw_total, 0) - r.advanced_amount, 0) as over_amount,
           r.advanced_amount - least(coalesce(s.raw_total, 0), r.advanced_amount) as unamortized,
           p.max_amount as policy_max
      from adv_ranked r
      left join am_sum s on s.advance_id = r.id
      left join public.insurance_policies p on p.id = r.policy_id
     where r.rn = 1
  ),
  per_g as (
    select per.*,
           (select min(x) from unnest(array[per.guaranteed_limit, per.policy_max]) x) as ceiling
      from per
  ),
  pol as (
    select policy_id, sum(advanced) as advanced, sum(amortized) as amortized, sum(unamortized) as unamortized, max(policy_max) as ceiling,
           count(*) as advances
      from per group by policy_id
  )
  select jsonb_build_object(
    'projectId', p_project_id, 'policyId', p_policy_id,
    'totals', jsonb_build_object(
      'advanced', coalesce((select sum(advanced) from per), 0),
      'amortized', coalesce((select sum(amortized) from per), 0),
      'unamortized', coalesce((select sum(unamortized) from per), 0),
      'advances', (select count(*) from per),
      'duplicateAdvances', (select count(*) from adv_ranked where rn > 1),
      'duplicateAmortizations', (select count(*) from am_ranked where rn > 1),
      'overAmortized', (select count(*) from per where over_amount > 0)),
    'advances', coalesce((select jsonb_agg(jsonb_build_object(
        'id', g.id, 'policyId', g.policy_id, 'advanced', g.advanced, 'amortized', g.amortized, 'unamortized', g.unamortized,
        'overAmortized', g.over_amount > 0, 'overAmount', g.over_amount,
        'guarantee', case when g.unamortized <= 0 then 'SUFICIENTE' when g.ceiling is null then 'SEM_DADOS' when g.unamortized > g.ceiling then 'INSUFICIENTE' else 'SUFICIENTE' end,
        'uncoveredExcess', case when g.unamortized <= 0 then 0 when g.ceiling is null then null else greatest(g.unamortized - g.ceiling, 0) end)
        order by g.id) from per_g g), '[]'::jsonb),
    'byPolicy', coalesce((select jsonb_agg(jsonb_build_object(
        'policyId', l.policy_id, 'advances', l.advances, 'advanced', l.advanced, 'amortized', l.amortized, 'unamortized', l.unamortized, 'ceiling', l.ceiling,
        'guarantee', case when l.unamortized <= 0 then 'SUFICIENTE' when l.ceiling is null then 'SEM_DADOS' when l.unamortized > l.ceiling then 'INSUFICIENTE' else 'SUFICIENTE' end,
        'uncoveredExcess', case when l.unamortized <= 0 then 0 when l.ceiling is null then null else greatest(l.unamortized - l.ceiling, 0) end)
        order by l.policy_id nulls first) from pol l), '[]'::jsonb),
    'duplicates', jsonb_build_object(
      'advances', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'duplicateOf', keep_id) order by id) from adv_ranked where rn > 1), '[]'::jsonb),
      'amortizations', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'duplicateOf', keep_id) order by id) from am_ranked where rn > 1), '[]'::jsonb)),
    'note', 'Adiantado != saldo não amortizado != saldo devido (informado) != valor indenizável (informado). Duplicidades ficam fora das somas e são listadas.')
  into v_result;
  return v_result;
end;
$$;
revoke all on function public.insurance_advances_consolidated(uuid, uuid) from public, anon;
grant execute on function public.insurance_advances_consolidated(uuid, uuid) to authenticated;
