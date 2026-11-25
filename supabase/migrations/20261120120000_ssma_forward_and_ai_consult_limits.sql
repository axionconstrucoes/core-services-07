-- ============================================================
-- 20261120120000_ssma_forward_and_ai_consult_limits.sql
--
-- 1) ENCAMINHAR (ENVIAR PARA) uma ação corretiva SSMA a outro membro da obra — ssma_corrective_action_forward.
--    Mesma regra de autorização das operações de ação SLA (20261120100000): ADMINISTRADOR ativo na obra ou o
--    RESPONSÁVEL atual pela ação SSMA (perfil diferente de LEITURA). Destino: membro ATIVO da mesma obra, perfil
--    diferente de LEITURA, diferente do atual. Motivo obrigatório para o responsável (mín. 5), opcional para o
--    ADMINISTRADOR.
--    Ação SSMA vinculada a ação SLA: o responsável é trocado NA AÇÃO SLA (ordem de bloqueio SLA → SSMA, a mesma do
--    ssma_corrective_action_update) e o gatilho sla_action_ssma_guard propaga para a ação SSMA e o registro, com o
--    evento REATRIBUIDA. Sem vínculo: troca direta na ação SSMA e no registro, com o mesmo evento.
--    Prazos, nível de escalonamento, status e evidências NÃO mudam. Auditoria SSMA_ACTION_FORWARDED com o motivo.
--
-- 2) Limite de consumo das consultas de IA ao especialista (alerta, risco, SSMA) — ai_consult_reserve.
--    Cada consulta reserva uma unidade ANTES de chamar o provedor: por usuário/dia e por obra/dia (dia civil de
--    America/Sao_Paulo). Atingido o limite, a consulta é recusada sem chamar a IA. Limites em ai_consult_limits
--    (ajustáveis pelo ADMINISTRADOR da plataforma via SQL). O registro de uso é também a trilha de auditoria.
-- ============================================================

create or replace function public.ssma_corrective_action_forward(
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.ssma_corrective_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_permission text;
  v_is_admin boolean;
  v_previous uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  -- Ordem de bloqueio: ação SLA primeiro, depois a ação SSMA (a mesma do ssma_corrective_action_update).
  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;

  select pm.permission into v_permission
  from public.project_memberships pm
  where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE';
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');
  if not (v_is_admin or (v_action.responsible_user_id = v_user and v_permission not in ('LEITURA', 'VIEWER'))) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  v_previous := v_action.responsible_user_id;
  if p_new_responsible_user_id is null then raise exception 'NEW_RESPONSIBLE_REQUIRED'; end if;
  if p_new_responsible_user_id = v_previous then raise exception 'SAME_RESPONSIBLE'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = v_action.project_id and pm.user_id = p_new_responsible_user_id
      and pm.status = 'ACTIVE' and pm.permission not in ('LEITURA', 'VIEWER')
  ) then raise exception 'NEW_RESPONSIBLE_NOT_ELIGIBLE'; end if;
  if not v_is_admin and (v_reason is null or char_length(v_reason) < 5) then raise exception 'FORWARD_REASON_REQUIRED'; end if;

  if v_sla_id is not null then
    -- sla_action_ssma_guard propaga o novo responsável à ação SSMA e ao registro e grava o evento REATRIBUIDA.
    update public.sla_actions set responsible_user_id = p_new_responsible_user_id where id = v_sla_id;
  else
    update public.ssma_corrective_actions set responsible_user_id = p_new_responsible_user_id where id = v_action.id;
    update public.ssma_field_records set responsible_user_id = p_new_responsible_user_id where id = v_action.record_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (v_action.id, v_action.project_id, 'REATRIBUIDA', coalesce(v_reason, 'Encaminhada pelo administrador.'), v_user);
  end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail, occurred_at)
  values (
    v_action.project_id, 'USER', v_user, null, 'SSMA_ACTION_FORWARDED', 'SSMA_CORRECTIVE_ACTION', v_action.id::text,
    format('Ação corretiva SSMA encaminhada de %s para %s. Motivo: %s', coalesce(v_previous::text, 'não atribuído'),
      p_new_responsible_user_id::text, coalesce(v_reason, 'não informado (administrador)')),
    now()
  );

  select * into v_action from public.ssma_corrective_actions where id = p_action_id;
  if v_action.responsible_user_id is distinct from p_new_responsible_user_id then
    raise exception 'FORWARD_NOT_PERSISTED';
  end if;
  return v_action;
end;
$$;

revoke all on function public.ssma_corrective_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.ssma_corrective_action_forward(uuid, uuid, text) to authenticated;

-- ---------- Limites de consulta de IA ----------

create table if not exists public.ai_consult_limits (
  scope text primary key check (scope = 'DEFAULT'),
  per_user_day integer not null check (per_user_day between 0 and 1000),
  per_project_day integer not null check (per_project_day between 0 and 10000),
  updated_at timestamptz not null default now()
);
insert into public.ai_consult_limits (scope, per_user_day, per_project_day) values ('DEFAULT', 20, 100)
on conflict (scope) do nothing;

create table if not exists public.ai_consult_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  kind text not null check (kind in ('ALERTA', 'RISCO', 'SSMA')),
  subject_id text not null,
  usage_day date not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_consult_usage_user_day_idx on public.ai_consult_usage (user_id, usage_day);
create index if not exists ai_consult_usage_project_day_idx on public.ai_consult_usage (project_id, usage_day);

-- Somente leitura para membros da obra (transparência do consumo); escrita só pela função abaixo.
alter table public.ai_consult_limits enable row level security;
alter table public.ai_consult_usage enable row level security;
drop policy if exists ai_consult_usage_select_members on public.ai_consult_usage;
create policy ai_consult_usage_select_members on public.ai_consult_usage for select to authenticated
  using (public.is_project_member(project_id));
drop policy if exists ai_consult_limits_select_authenticated on public.ai_consult_limits;
create policy ai_consult_limits_select_authenticated on public.ai_consult_limits for select to authenticated using (true);
revoke insert, update, delete on public.ai_consult_usage from anon, authenticated;
revoke insert, update, delete on public.ai_consult_limits from anon, authenticated;

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

  -- Serializa as reservas da mesma obra no dia (contagem e inserção atômicas, sem ultrapassar o limite sob concorrência).
  perform pg_advisory_xact_lock(hashtextextended('ai_consult:' || p_project_id::text || ':' || v_day::text, 0));

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
