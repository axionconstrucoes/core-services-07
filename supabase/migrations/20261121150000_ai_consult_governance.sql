-- ============================================================
-- 20261121150000_ai_consult_governance.sql
--
-- Frente N6 (governança, custos e verificação dos Experts IA).
--
-- 1) Curadoria AUTOMÁTICA (sem sessão) passa a consumir o limite de IA:
--    novo tipo AUTOMATIC_CURATION em ai_consult_usage.kind, aceito SOMENTE pela variante service_role
--    ai_consult_reserve_for_actor (usuário solicitante explícito, vínculo ATIVO exigido). As variantes de sessão
--    (ai_consult_reserve / ai_consult_reserve_expert) continuam recusando os tipos exclusivos do worker.
--
-- 2) Pré-verificação SOMENTE LEITURA (ai_consult_precheck): a reserva passou a acontecer na fronteira do provedor
--    (depois dos guards determinísticos e da montagem de contexto — ver docs/ai/governanca-consumo-ia.md). Para que um
--    usuário que já esgotou o limite não force a montagem de contexto repetidamente, as telas fazem esta checagem
--    barata ANTES dos guards. Ela não grava nada e não substitui a reserva (que continua sendo a única autoridade).
--
-- 3) Opções de ORÇAMENTO MONETÁRIO (US$) por usuário, obra e global, por dia e por mês — DESATIVADAS:
--    tabela ai_consult_budget_settings com a chave `enabled = false` e TODOS os tetos nulos. Enquanto `enabled` for
--    false nada muda no comportamento. A ativação é decisão da Diretoria (docs/ai/orcamento-monetario-ia.md).
--
-- NÃO altera os limites vigentes (ai_consult_limits: 20 por usuário/dia, 100 por obra/dia), não apaga dados,
-- não cria função de estorno (a política escolhida dispensa estorno — nenhuma unidade é devolvida).
-- ============================================================

-- ---------- 1) Novo tipo + custo estimado por unidade ----------

alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_kind_check;
alter table public.ai_consult_usage
  add constraint ai_consult_usage_kind_check
  check (kind in ('ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE', 'AUTOMATIC_CURATION'));

alter table public.ai_consult_usage add column if not exists estimated_cost_micros bigint;
alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_estimated_cost_micros_check;
alter table public.ai_consult_usage
  add constraint ai_consult_usage_estimated_cost_micros_check
  check (estimated_cost_micros is null or estimated_cost_micros >= 0);

comment on column public.ai_consult_usage.estimated_cost_micros is
  'Custo ESTIMADO (micro-dólares) da unidade, gravado só quando ai_consult_budget_settings.estimated_cost_per_call_usd '
  'estiver configurado. Estimativa conservadora por chamada (como a AXIA em axia_chat_budget) — nunca custo real.';

-- ---------- 3) Orçamento monetário (DESATIVADO) ----------

create table if not exists public.ai_consult_budget_settings (
  scope text primary key check (scope = 'DEFAULT'),
  -- CHAVE DE ATIVAÇÃO. false = nenhum teto monetário é aplicado (estado atual, aprovado).
  enabled boolean not null default false,
  -- Estimativa por chamada (pior caso: tokens máximos de entrada e saída × preço do modelo configurado).
  estimated_cost_per_call_usd numeric(12, 6) check (estimated_cost_per_call_usd is null or estimated_cost_per_call_usd > 0),
  per_user_day_usd numeric(12, 2) check (per_user_day_usd is null or per_user_day_usd > 0),
  per_user_month_usd numeric(12, 2) check (per_user_month_usd is null or per_user_month_usd > 0),
  per_project_day_usd numeric(12, 2) check (per_project_day_usd is null or per_project_day_usd > 0),
  per_project_month_usd numeric(12, 2) check (per_project_month_usd is null or per_project_month_usd > 0),
  global_day_usd numeric(12, 2) check (global_day_usd is null or global_day_usd > 0),
  global_month_usd numeric(12, 2) check (global_month_usd is null or global_month_usd > 0),
  -- Referência da decisão da Diretoria (ata, e-mail) que ativou/alterou os tetos. Obrigatória para ativar.
  decision_reference text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint ai_consult_budget_settings_enable_requires_decision
    check (not enabled or (decision_reference is not null and length(trim(decision_reference)) > 0)),
  constraint ai_consult_budget_settings_enable_requires_estimate
    check (not enabled or estimated_cost_per_call_usd is not null)
);

insert into public.ai_consult_budget_settings (scope, enabled) values ('DEFAULT', false)
on conflict (scope) do nothing;

comment on table public.ai_consult_budget_settings is
  'Opções de orçamento monetário (US$) das consultas aos Experts IA. DESATIVADO por padrão (enabled = false). '
  'Ativação é decisão da Diretoria — ver docs/ai/orcamento-monetario-ia.md. Só service_role altera.';

alter table public.ai_consult_budget_settings enable row level security;
revoke all on public.ai_consult_budget_settings from public, anon, authenticated;
grant select, update on public.ai_consult_budget_settings to service_role;

-- ---------- Núcleo único da reserva (contagem inalterada + orçamento opcional) ----------

create or replace function public.ai_consult_reserve_core(
  p_user uuid,
  p_project_id uuid,
  p_kind text,
  p_subject_id text,
  p_expert_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_month date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_limits public.ai_consult_limits%rowtype;
  v_budget public.ai_consult_budget_settings%rowtype;
  v_user_count integer;
  v_project_count integer;
  v_cost bigint := null;
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE', 'AUTOMATIC_CURATION') then
    raise exception 'INVALID_KIND';
  end if;
  if p_expert_id is not null and p_expert_id not in (
    'commercial-director', 'esg-director', 'legal-consultant', 'planning-director', 'engineering-director', 'ceo'
  ) then
    raise exception 'INVALID_EXPERT';
  end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = p_user and pm.status = 'ACTIVE'
  ) then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  select * into v_limits from public.ai_consult_limits where scope = 'DEFAULT';
  if not found then raise exception 'AI_CONSULT_LIMITS_MISSING'; end if;

  -- Trava usuário → obra (migration 20261120140000), inalterada.
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:user:' || p_user::text || ':' || v_day::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:project:' || p_project_id::text || ':' || v_day::text, 0));

  select count(*) into v_user_count from public.ai_consult_usage where user_id = p_user and usage_day = v_day;
  if v_user_count >= v_limits.per_user_day then raise exception 'AI_CONSULT_USER_LIMIT'; end if;
  select count(*) into v_project_count from public.ai_consult_usage where project_id = p_project_id and usage_day = v_day;
  if v_project_count >= v_limits.per_project_day then raise exception 'AI_CONSULT_PROJECT_LIMIT'; end if;

  -- Orçamento monetário: só registra a estimativa / só aplica tetos quando configurado. Desativado = sem efeito.
  select * into v_budget from public.ai_consult_budget_settings where scope = 'DEFAULT';
  if found and v_budget.estimated_cost_per_call_usd is not null then
    v_cost := ceil(v_budget.estimated_cost_per_call_usd * 1000000)::bigint;
  end if;
  if found and v_budget.enabled then
    -- Teto global: serializa todas as reservas do dia (só quando o orçamento estiver ATIVO).
    perform pg_advisory_xact_lock(hashtextextended('ai_consult:budget:global:' || v_day::text, 0));
    if v_budget.per_user_day_usd is not null and
       (select coalesce(sum(estimated_cost_micros), 0) from public.ai_consult_usage where user_id = p_user and usage_day = v_day) + v_cost
         > v_budget.per_user_day_usd * 1000000 then raise exception 'AI_CONSULT_BUDGET_USER_DAY'; end if;
    if v_budget.per_user_month_usd is not null and
       (select coalesce(sum(estimated_cost_micros), 0) from public.ai_consult_usage where user_id = p_user and usage_day >= v_month) + v_cost
         > v_budget.per_user_month_usd * 1000000 then raise exception 'AI_CONSULT_BUDGET_USER_MONTH'; end if;
    if v_budget.per_project_day_usd is not null and
       (select coalesce(sum(estimated_cost_micros), 0) from public.ai_consult_usage where project_id = p_project_id and usage_day = v_day) + v_cost
         > v_budget.per_project_day_usd * 1000000 then raise exception 'AI_CONSULT_BUDGET_PROJECT_DAY'; end if;
    if v_budget.per_project_month_usd is not null and
       (select coalesce(sum(estimated_cost_micros), 0) from public.ai_consult_usage where project_id = p_project_id and usage_day >= v_month) + v_cost
         > v_budget.per_project_month_usd * 1000000 then raise exception 'AI_CONSULT_BUDGET_PROJECT_MONTH'; end if;
    if v_budget.global_day_usd is not null and
       (select coalesce(sum(estimated_cost_micros), 0) from public.ai_consult_usage where usage_day = v_day) + v_cost
         > v_budget.global_day_usd * 1000000 then raise exception 'AI_CONSULT_BUDGET_GLOBAL_DAY'; end if;
    if v_budget.global_month_usd is not null and
       (select coalesce(sum(estimated_cost_micros), 0) from public.ai_consult_usage where usage_day >= v_month) + v_cost
         > v_budget.global_month_usd * 1000000 then raise exception 'AI_CONSULT_BUDGET_GLOBAL_MONTH'; end if;
  end if;

  insert into public.ai_consult_usage (project_id, user_id, kind, subject_id, usage_day, expert_id, estimated_cost_micros)
  values (p_project_id, p_user, p_kind, left(coalesce(p_subject_id, ''), 200), v_day, p_expert_id, v_cost);

  return jsonb_build_object(
    'remaining_user', v_limits.per_user_day - v_user_count - 1,
    'remaining_project', v_limits.per_project_day - v_project_count - 1
  );
end;
$$;

revoke all on function public.ai_consult_reserve_core(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

-- ---------- Sessão: tipos exclusivos do worker continuam recusados ----------

create or replace function public.ai_consult_reserve(p_project_id uuid, p_kind text, p_subject_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind in ('RISK_CYCLE', 'AUTOMATIC_CURATION') then raise exception 'INVALID_KIND'; end if;
  return public.ai_consult_reserve_core(auth.uid(), p_project_id, p_kind, p_subject_id, null);
end;
$$;

revoke all on function public.ai_consult_reserve(uuid, text, text) from public, anon;
grant execute on function public.ai_consult_reserve(uuid, text, text) to authenticated;

create or replace function public.ai_consult_reserve_expert(p_project_id uuid, p_kind text, p_subject_id text, p_expert_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind in ('RISK_CYCLE', 'AUTOMATIC_CURATION') then raise exception 'INVALID_KIND'; end if;
  if p_expert_id is null then raise exception 'INVALID_EXPERT'; end if;
  return public.ai_consult_reserve_core(auth.uid(), p_project_id, p_kind, p_subject_id, p_expert_id);
end;
$$;

revoke all on function public.ai_consult_reserve_expert(uuid, text, text, text) from public, anon;
grant execute on function public.ai_consult_reserve_expert(uuid, text, text, text) to authenticated;

-- ---------- Sem sessão (service_role): ciclo de risco E curadoria automática ----------

create or replace function public.ai_consult_reserve_for_actor(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_subject_id text,
  p_expert_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sem solicitante identificável não há reserva (e o chamador não chama a IA).
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('RISK_CYCLE', 'AUTOMATIC_CURATION') then raise exception 'INVALID_KIND'; end if;
  if p_expert_id is null then raise exception 'INVALID_EXPERT'; end if;
  return public.ai_consult_reserve_core(p_actor_user_id, p_project_id, p_kind, p_subject_id, p_expert_id);
end;
$$;

revoke all on function public.ai_consult_reserve_for_actor(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_consult_reserve_for_actor(uuid, uuid, text, text, text) to service_role;

-- ---------- 2) Pré-verificação somente leitura (sessão) ----------

create or replace function public.ai_consult_precheck(p_project_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_limits public.ai_consult_limits%rowtype;
  v_user_count integer;
  v_project_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = v_user and pm.status = 'ACTIVE'
  ) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  select * into v_limits from public.ai_consult_limits where scope = 'DEFAULT';
  if not found then raise exception 'AI_CONSULT_LIMITS_MISSING'; end if;
  select count(*) into v_user_count from public.ai_consult_usage where user_id = v_user and usage_day = v_day;
  if v_user_count >= v_limits.per_user_day then raise exception 'AI_CONSULT_USER_LIMIT'; end if;
  select count(*) into v_project_count from public.ai_consult_usage where project_id = p_project_id and usage_day = v_day;
  if v_project_count >= v_limits.per_project_day then raise exception 'AI_CONSULT_PROJECT_LIMIT'; end if;
  return jsonb_build_object(
    'remaining_user', v_limits.per_user_day - v_user_count,
    'remaining_project', v_limits.per_project_day - v_project_count
  );
end;
$$;

revoke all on function public.ai_consult_precheck(uuid) from public, anon;
grant execute on function public.ai_consult_precheck(uuid) to authenticated;
