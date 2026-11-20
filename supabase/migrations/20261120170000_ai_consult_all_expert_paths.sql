-- ============================================================
-- 20261120170000_ai_consult_all_expert_paths.sql
--
-- Frente P3 (Experts IA e limite de consultas).
--
-- 1) Limite de consultas de IA em TODOS os caminhos de Expert (antes: só CONSULTAR IA de alerta/risco e SSMA).
--    Novos tipos em ai_consult_usage.kind:
--      EXPERT_PANEL — painéis de consulta direta a um Expert (experts-ia, /juridico, /esg, Diretor Comercial);
--      CURATION     — curadoria multi-Expert: 1 unidade por Expert chamado (cada especialista e a consolidação CEO);
--      RISK_CYCLE   — ESPECIALISTA do caso de risco respondido pelo ciclo do worker (sem sessão).
--    Nova coluna ai_consult_usage.expert_id (trilha de auditoria do consumo por Expert; nula nos registros antigos).
--    Limites (ai_consult_limits) e contagem NÃO mudam: por usuário/dia somando TODAS as obras e por obra/dia,
--    sempre com a trava usuário → obra da migration 20261120140000.
--
--    Funções:
--      ai_consult_reserve_core(...)          — núcleo único (travas, contagem, inserção); SEM grant a nenhum papel.
--      ai_consult_reserve(uuid,text,text)    — mantida (sessão; authenticated); agora delega ao núcleo.
--      ai_consult_reserve_expert(...)        — sessão (authenticated) + Expert consultado.
--      ai_consult_reserve_for_actor(...)     — SEM sessão: usuário solicitante explícito (p_actor_user_id), somente
--                                              tipo RISK_CYCLE, execução concedida SOMENTE a service_role.
--    Em todas: vínculo ATIVO do usuário com a obra é exigido; falha = exceção (a IA não é chamada).
--
-- 2) Expert independente "engineering-director" (Diretor de Engenharia e Construção IA) aceito nos registros do
--    caso de risco (risk_alert_action_events.expert_id e alert_email_messages.expert_id).
--
-- Nenhum dado existente é apagado; nenhum prazo de SLA ou regra de escalonamento é alterado.
-- ============================================================

-- ---------- ai_consult_usage: novos tipos + Expert ----------

alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_kind_check;
alter table public.ai_consult_usage
  add constraint ai_consult_usage_kind_check
  check (kind in ('ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE'));

alter table public.ai_consult_usage add column if not exists expert_id text;
alter table public.ai_consult_usage drop constraint if exists ai_consult_usage_expert_id_check;
alter table public.ai_consult_usage
  add constraint ai_consult_usage_expert_id_check
  check (expert_id is null or expert_id in (
    'commercial-director', 'esg-director', 'legal-consultant', 'planning-director', 'engineering-director', 'ceo'
  ));

comment on column public.ai_consult_usage.expert_id is
  'Expert consultado nesta unidade de consumo (null em registros anteriores a 20261120170000).';

-- ---------- Núcleo único da reserva ----------

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

-- Núcleo nunca é chamado diretamente por nenhum papel da API (só pelas funções abaixo, como owner).
revoke all on function public.ai_consult_reserve_core(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

-- ---------- Sessão (authenticated): assinatura original preservada ----------

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

-- ---------- Sessão (authenticated) + Expert consultado ----------

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

-- ---------- Sem sessão (service_role): ESPECIALISTA do ciclo de alertas ----------

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

-- ---------- Caso de risco: Expert independente engineering-director ----------

alter table public.risk_alert_action_events drop constraint if exists risk_alert_action_events_expert_id_check;
alter table public.risk_alert_action_events
  add constraint risk_alert_action_events_expert_id_check
  check (expert_id is null or expert_id in (
    'planning-director', 'engineering-director', 'commercial-director', 'esg-director', 'legal-consultant', 'ceo'
  ));

alter table public.alert_email_messages drop constraint if exists alert_email_messages_expert_id_check;
alter table public.alert_email_messages
  add constraint alert_email_messages_expert_id_check
  check (expert_id is null or expert_id in (
    'planning-director', 'engineering-director', 'commercial-director', 'esg-director', 'legal-consultant', 'ceo'
  ));
