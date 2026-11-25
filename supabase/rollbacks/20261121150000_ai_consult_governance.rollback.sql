-- ROLLBACK (manual, NAO e migration) de 20261121150000_ai_consult_governance.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare n bigint;
begin
  if to_regclass('public.ai_consult_usage') is not null then
    select count(*) into n from public.ai_consult_usage where kind = 'AUTOMATIC_CURATION';
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: ai_consult_usage tem % linha(s) AUTOMATIC_CURATION (dados de consumo); nada foi alterado', n; end if;
  end if;
end $$;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.ai_consult_budget_settings') is not null then
    select count(*) into n from public.ai_consult_budget_settings where scope <> 'DEFAULT' or enabled or estimated_cost_per_call_usd is not null or per_user_day_usd is not null or per_user_month_usd is not null or per_project_day_usd is not null; -- so o seed DEFAULT desativado da propria migration; orcamento configurado e dado de decisao
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.ai_consult_budget_settings tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_consult_usage' and column_name = 'estimated_cost_micros') then
    select count(*) into n from public.ai_consult_usage where estimated_cost_micros is distinct from null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.ai_consult_usage.estimated_cost_micros tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
end $$;
drop table if exists public.ai_consult_budget_settings;
drop function if exists public.ai_consult_precheck(uuid);
-- restaura ai_consult_reserve_core(uuid, uuid, text, text, text) com o corpo de 20261120170000_ai_consult_all_expert_paths
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
  v_limits public.ai_consult_limits%rowtype;
  v_user_count integer;
  v_project_count integer;
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE') then
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

  -- Serializa as reservas do MESMO USUÁRIO no dia (limite por usuário vale para todas as obras, inclusive com consultas
  -- simultâneas em obras diferentes) e depois as da MESMA OBRA no dia. Ordem fixa usuário → obra: sem deadlock.
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:user:' || p_user::text || ':' || v_day::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:project:' || p_project_id::text || ':' || v_day::text, 0));

  select count(*) into v_user_count from public.ai_consult_usage where user_id = p_user and usage_day = v_day;
  if v_user_count >= v_limits.per_user_day then raise exception 'AI_CONSULT_USER_LIMIT'; end if;
  select count(*) into v_project_count from public.ai_consult_usage where project_id = p_project_id and usage_day = v_day;
  if v_project_count >= v_limits.per_project_day then raise exception 'AI_CONSULT_PROJECT_LIMIT'; end if;

  insert into public.ai_consult_usage (project_id, user_id, kind, subject_id, usage_day, expert_id)
  values (p_project_id, p_user, p_kind, left(coalesce(p_subject_id, ''), 200), v_day, p_expert_id);

  return jsonb_build_object(
    'remaining_user', v_limits.per_user_day - v_user_count - 1,
    'remaining_project', v_limits.per_project_day - v_project_count - 1
  );
end;
$$;
revoke all on function public.ai_consult_reserve_core(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
-- restaura ai_consult_reserve(uuid, text, text) com o corpo de 20261120170000_ai_consult_all_expert_paths
create or replace function public.ai_consult_reserve(p_project_id uuid, p_kind text, p_subject_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  -- RISK_CYCLE é exclusivo do worker (ai_consult_reserve_for_actor).
  if p_kind = 'RISK_CYCLE' then raise exception 'INVALID_KIND'; end if;
  return public.ai_consult_reserve_core(auth.uid(), p_project_id, p_kind, p_subject_id, null);
end;
$$;
revoke all on function public.ai_consult_reserve(uuid, text, text) from public, anon;
grant execute on function public.ai_consult_reserve(uuid, text, text) to authenticated;
-- restaura ai_consult_reserve_expert(uuid, text, text, text) com o corpo de 20261120170000_ai_consult_all_expert_paths
create or replace function public.ai_consult_reserve_expert(p_project_id uuid, p_kind text, p_subject_id text, p_expert_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind = 'RISK_CYCLE' then raise exception 'INVALID_KIND'; end if;
  if p_expert_id is null then raise exception 'INVALID_EXPERT'; end if;
  return public.ai_consult_reserve_core(auth.uid(), p_project_id, p_kind, p_subject_id, p_expert_id);
end;
$$;
revoke all on function public.ai_consult_reserve_expert(uuid, text, text, text) from public, anon;
grant execute on function public.ai_consult_reserve_expert(uuid, text, text, text) to authenticated;
-- restaura ai_consult_reserve_for_actor(uuid, uuid, text, text, text) com o corpo de 20261120170000_ai_consult_all_expert_paths
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
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is distinct from 'RISK_CYCLE' then raise exception 'INVALID_KIND'; end if;
  if p_expert_id is null then raise exception 'INVALID_EXPERT'; end if;
  -- Mesma contagem por usuário (todas as obras) e por obra; o vínculo ativo do solicitante é conferido no núcleo.
  return public.ai_consult_reserve_core(p_actor_user_id, p_project_id, p_kind, p_subject_id, p_expert_id);
end;
$$;
revoke all on function public.ai_consult_reserve_for_actor(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.ai_consult_reserve_for_actor(uuid, uuid, text, text, text) to service_role;
alter table public.ai_consult_usage drop column if exists estimated_cost_micros;
-- restaura o CHECK de kind da migration 20261120170000
alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_estimated_cost_micros_check;
alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_kind_check;
alter table public.ai_consult_usage add constraint ai_consult_usage_kind_check check (kind in ('ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE'));
commit;
