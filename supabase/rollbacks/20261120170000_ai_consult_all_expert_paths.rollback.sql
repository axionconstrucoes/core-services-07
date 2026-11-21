-- ROLLBACK (manual, NAO e migration) de 20261120170000_ai_consult_all_expert_paths.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare n bigint;
begin
  if to_regclass('public.ai_consult_usage') is not null then
    select count(*) into n from public.ai_consult_usage where kind not in ('ALERTA', 'RISCO', 'SSMA');
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: ai_consult_usage tem % linha(s) com kind novo (EXPERT_PANEL/CURATION/RISK_CYCLE...); dados de consumo, nada foi alterado', n; end if;
  end if;
  select count(*) into n from public.risk_alert_action_events where expert_id = 'engineering-director';
  if n > 0 then raise exception 'ROLLBACK_BLOCKED: risk_alert_action_events tem % linha(s) com expert_id engineering-director (evidencia)', n; end if;
  select count(*) into n from public.alert_email_messages where expert_id = 'engineering-director';
  if n > 0 then raise exception 'ROLLBACK_BLOCKED: alert_email_messages tem % linha(s) com expert_id engineering-director (evidencia)', n; end if;
end $$;
do $$
declare r record; n bigint;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_consult_usage' and column_name = 'expert_id') then
    select count(*) into n from public.ai_consult_usage where expert_id is distinct from null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.ai_consult_usage.expert_id tem % linha(s) com valor diferente do default (dados); nada foi alterado', n; end if;
  end if;
end $$;
drop function if exists public.ai_consult_reserve_core(uuid, uuid, text, text, text);
drop function if exists public.ai_consult_reserve_expert(uuid, text, text, text);
drop function if exists public.ai_consult_reserve_for_actor(uuid, uuid, text, text, text);
-- restaura ai_consult_reserve(uuid, text, text) com o corpo de 20261120140000_ai_consult_reserve_global_user_lock
create or replace function public.ai_consult_reserve(p_project_id uuid, p_kind text, p_subject_id text)
returns jsonb
language plpgsql
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
  if p_kind not in ('ALERTA', 'RISCO', 'SSMA') then raise exception 'INVALID_KIND'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = v_user and pm.status = 'ACTIVE'
  ) then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  select * into v_limits from public.ai_consult_limits where scope = 'DEFAULT';
  if not found then raise exception 'AI_CONSULT_LIMITS_MISSING'; end if;

  -- Serializa as reservas do MESMO USUÁRIO no dia (limite por usuário vale para todas as obras, inclusive com consultas
  -- simultâneas em obras diferentes) e depois as da MESMA OBRA no dia. Ordem fixa usuário → obra: sem deadlock.
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:user:' || v_user::text || ':' || v_day::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:project:' || p_project_id::text || ':' || v_day::text, 0));

  select count(*) into v_user_count from public.ai_consult_usage where user_id = v_user and usage_day = v_day;
  if v_user_count >= v_limits.per_user_day then raise exception 'AI_CONSULT_USER_LIMIT'; end if;
  select count(*) into v_project_count from public.ai_consult_usage where project_id = p_project_id and usage_day = v_day;
  if v_project_count >= v_limits.per_project_day then raise exception 'AI_CONSULT_PROJECT_LIMIT'; end if;

  insert into public.ai_consult_usage (project_id, user_id, kind, subject_id, usage_day)
  values (p_project_id, v_user, p_kind, left(coalesce(p_subject_id, ''), 200), v_day);

  return jsonb_build_object(
    'remaining_user', v_limits.per_user_day - v_user_count - 1,
    'remaining_project', v_limits.per_project_day - v_project_count - 1
  );
end;
$$;
revoke all on function public.ai_consult_reserve(uuid, text, text) from public, anon;
grant execute on function public.ai_consult_reserve(uuid, text, text) to authenticated;
alter table public.ai_consult_usage drop column if exists expert_id;
-- restaura as constraints anteriores (definicoes de 20260921090000 e de 20261120120000)
alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_expert_id_check;
alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_kind_check;
alter table public.ai_consult_usage add constraint ai_consult_usage_kind_check check (kind in ('ALERTA', 'RISCO', 'SSMA'));
alter table public.risk_alert_action_events drop constraint if exists risk_alert_action_events_expert_id_check;
alter table public.risk_alert_action_events add constraint risk_alert_action_events_expert_id_check
  check (expert_id is null or expert_id in ('planning-director', 'commercial-director', 'esg-director', 'legal-consultant', 'ceo'));
alter table public.alert_email_messages drop constraint if exists alert_email_messages_expert_id_check;
alter table public.alert_email_messages add constraint alert_email_messages_expert_id_check
  check (expert_id is null or expert_id in ('planning-director', 'commercial-director', 'esg-director', 'legal-consultant', 'ceo'));
commit;
