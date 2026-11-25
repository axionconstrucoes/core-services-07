-- ============================================================
-- 20261120140000_ai_consult_reserve_global_user_lock.sql
--
-- Correção do limite de consultas de IA (20261120120000): a trava era só por obra+dia, mas o limite por usuário conta
-- TODAS as obras. Duas consultas simultâneas do mesmo usuário em obras diferentes pegavam travas diferentes, liam a
-- mesma contagem e ambas passavam (ex.: 21 > 20). Agora a reserva trava primeiro o usuário+dia e depois a obra+dia,
-- sempre nessa ordem. Corpo da função preservado; só a serialização muda. Limites e tabelas não mudam.
-- ============================================================

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
