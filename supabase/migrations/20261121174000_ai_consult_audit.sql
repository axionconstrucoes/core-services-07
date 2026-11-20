-- ============================================================
-- 20261121170000_ai_consult_audit.sql
--
-- LOTE 4 (Especialistas de IA e governança) — trilha de auditoria de CADA consulta a um Expert.
--
-- Lacuna fechada: ai_consult_usage só diz "quem/obra/tipo/assunto/Expert/dia" (contagem do limite). Não guardava
-- a pergunta, as fontes consultadas, o resultado (severidade, confiança, revisão humana) nem tokens/custo. Esta
-- migration cria ai_consult_audit (somente acréscimo) com esses campos, gravada pelo servidor DEPOIS da chamada ao
-- provedor, por duas funções:
--   ai_consult_audit_record(...)            — sessão (authenticated): o usuário é auth.uid(), vínculo ATIVO exigido;
--   ai_consult_audit_record_for_actor(...)  — sem sessão (service_role): usuário solicitante explícito (ciclo de
--                                             risco e curadoria automática), vínculo ATIVO exigido.
-- Ambas delegam a ai_consult_audit_record_core (SEM grant a nenhum papel). Nenhuma exceção da auditoria bloqueia a
-- resposta já gerada (o chamador trata a falha como aviso), mas a auditoria nunca grava fora da obra do usuário.
--
-- Isolamento: SELECT só do próprio autor (e vínculo ativo) OU de ADMINISTRADOR da obra; nenhum acesso para anon;
-- INSERT/UPDATE/DELETE revogados de anon/authenticated (só as funções SECURITY DEFINER gravam). Fonte = identificadores
-- (nunca o texto dos documentos) — rastreabilidade sem copiar evidência original.
--
-- Orçamento monetário: NÃO é lido para bloquear nada aqui. O custo estimado só é copiado de
-- ai_consult_budget_settings.estimated_cost_per_call_usd quando configurado (nulo caso contrário). Nenhuma configuração
-- de orçamento é alterada; permanece desligado.
-- Idempotente (if not exists / drop policy if exists / create or replace). Nada é apagado.
-- ============================================================

create table if not exists public.ai_consult_audit (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  expert_id text not null check (expert_id in (
    'commercial-director', 'esg-director', 'legal-consultant', 'planning-director', 'engineering-director', 'ceo'
  )),
  kind text not null check (kind in (
    'ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE', 'AUTOMATIC_CURATION'
  )),
  subject_id text not null,
  scope text,
  question text not null,
  -- Fontes consultadas: lista de referências {type,id} — identificadores, nunca o conteúdo do documento.
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 200),
  outcome text not null check (outcome in ('OK', 'PROVIDER_ERROR')),
  severity text check (severity is null or severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  -- Resposta de IA nunca dispensa revisão humana (fato × inferência × recomendação ficam na resposta; aqui só o resumo).
  requires_human_review boolean not null default true check (requires_human_review = true),
  result_summary jsonb not null default '{}'::jsonb check (jsonb_typeof(result_summary) = 'object'),
  provider_id text,
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  usage_day date not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_consult_audit_project_day_idx on public.ai_consult_audit (project_id, usage_day);
create index if not exists ai_consult_audit_user_day_idx on public.ai_consult_audit (user_id, usage_day);

comment on table public.ai_consult_audit is
  'Trilha de auditoria de cada consulta a Expert de IA (quem, obra, Expert, pergunta, fontes, resultado, tokens/custo). Somente acréscimo; gravada por ai_consult_audit_record*.';

alter table public.ai_consult_audit enable row level security;

drop policy if exists ai_consult_audit_select_author_or_admin on public.ai_consult_audit;
create policy ai_consult_audit_select_author_or_admin on public.ai_consult_audit for select to authenticated
  using (
    (user_id = auth.uid() and public.is_project_member(project_id))
    or public.has_project_permission(project_id, 'ADMINISTRADOR')
  );

revoke all on public.ai_consult_audit from public, anon;
revoke insert, update, delete, truncate on public.ai_consult_audit from authenticated;
grant select on public.ai_consult_audit to authenticated;

-- ---------- Núcleo único (sem grant) ----------

create or replace function public.ai_consult_audit_record_core(
  p_user uuid,
  p_project_id uuid,
  p_kind text,
  p_subject_id text,
  p_expert_id text,
  p_question text,
  p_scope text,
  p_sources jsonb,
  p_outcome text,
  p_severity text,
  p_confidence numeric,
  p_result_summary jsonb,
  p_provider_id text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_day date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cost numeric;
begin
  if p_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('ALERTA', 'RISCO', 'SSMA', 'EXPERT_PANEL', 'CURATION', 'RISK_CYCLE', 'AUTOMATIC_CURATION') then
    raise exception 'INVALID_KIND';
  end if;
  if p_expert_id is null or p_expert_id not in (
    'commercial-director', 'esg-director', 'legal-consultant', 'planning-director', 'engineering-director', 'ceo'
  ) then
    raise exception 'INVALID_EXPERT';
  end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = p_user and pm.status = 'ACTIVE'
  ) then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  -- Estimativa só quando configurada; nunca ativa/consulta o teto monetário.
  select s.estimated_cost_per_call_usd into v_cost from public.ai_consult_budget_settings s where s.scope = 'DEFAULT';

  insert into public.ai_consult_audit (
    project_id, user_id, expert_id, kind, subject_id, scope, question, sources, outcome, severity, confidence,
    result_summary, provider_id, model, input_tokens, output_tokens, estimated_cost_micros, usage_day
  ) values (
    p_project_id, p_user, p_expert_id, p_kind, left(coalesce(p_subject_id, ''), 200), left(p_scope, 40),
    left(coalesce(p_question, ''), 4000), coalesce(p_sources, '[]'::jsonb), p_outcome, p_severity, p_confidence,
    coalesce(p_result_summary, '{}'::jsonb), left(p_provider_id, 80), left(p_model, 120),
    p_input_tokens, p_output_tokens, case when v_cost is null then null else ceil(v_cost * 1000000)::bigint end, v_day
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.ai_consult_audit_record_core(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer)
  from public, anon, authenticated, service_role;

-- ---------- Sessão (authenticated) ----------

create or replace function public.ai_consult_audit_record(
  p_project_id uuid,
  p_kind text,
  p_subject_id text,
  p_expert_id text,
  p_question text,
  p_scope text,
  p_sources jsonb,
  p_outcome text,
  p_severity text,
  p_confidence numeric,
  p_result_summary jsonb,
  p_provider_id text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.ai_consult_audit_record_core(
    auth.uid(), p_project_id, p_kind, p_subject_id, p_expert_id, p_question, p_scope, p_sources, p_outcome,
    p_severity, p_confidence, p_result_summary, p_provider_id, p_model, p_input_tokens, p_output_tokens
  );
end;
$$;

revoke all on function public.ai_consult_audit_record(uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer)
  from public, anon;
grant execute on function public.ai_consult_audit_record(uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer)
  to authenticated;

-- ---------- Sem sessão (service_role): ciclo de risco e curadoria automática ----------

create or replace function public.ai_consult_audit_record_for_actor(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_kind text,
  p_subject_id text,
  p_expert_id text,
  p_question text,
  p_scope text,
  p_sources jsonb,
  p_outcome text,
  p_severity text,
  p_confidence numeric,
  p_result_summary jsonb,
  p_provider_id text,
  p_model text,
  p_input_tokens integer,
  p_output_tokens integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('RISK_CYCLE', 'AUTOMATIC_CURATION') then raise exception 'INVALID_KIND'; end if;
  return public.ai_consult_audit_record_core(
    p_actor_user_id, p_project_id, p_kind, p_subject_id, p_expert_id, p_question, p_scope, p_sources, p_outcome,
    p_severity, p_confidence, p_result_summary, p_provider_id, p_model, p_input_tokens, p_output_tokens
  );
end;
$$;

revoke all on function public.ai_consult_audit_record_for_actor(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.ai_consult_audit_record_for_actor(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer)
  to service_role;
