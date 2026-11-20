-- ============================================================
-- 20261121171000_l2_forecast_followup_and_guards.sql  (LOTE 2 — acompanhamento por EVENTOS, previsão e guardas)
--
-- NÃO altera record_risk_alert_action (hotfix P0), has_project_permission, is_project_member, prazos, níveis, motor de
-- escalonamento nem a Matriz de SLA. Nenhum dado existente é alterado. Nenhum e-mail é enviado por nada aqui.
--
-- 1) PREVISÃO DE TÉRMINO de ação SLA (não vinculada a caso de risco): sla_action_followup_events registra, de forma
--    estruturada e auditada, "EM ANDAMENTO + Previsão" informado pela tela (RPC sla_action_record_forecast, usuário
--    autenticado) ou por e-mail (sla_action_progress_with_forecast_by_email, service_role). Antes a previsão por e-mail
--    ficava só como texto da providência.
-- 2) AUDITORIA da previsão do alerta de risco registrada pela TELA: o gatilho abaixo grava RISK_ALERT_FORECAST_RECORDED
--    (o caminho por e-mail já era auditado pelo app; origem EMAIL não é duplicada aqui).
-- 3) ACOMPANHAMENTO após o último nível (DIRETORIA): previsão vencida de ação ainda aberta vira o EVENTO FORECAST_OVERDUE
--    (único por previsão, auditado). É só registro: não escalona, não cria e-mail, não altera a ação. Notificação nova
--    DESLIGADA por política (sla_followup_policy.notify_enabled = false; sla_followup_notification_allowed devolve false
--    sem decisão registrada) e, se um dia ligada, só pela outbox existente respeitando as travas do piloto.
-- 4) GUARDA de consistência: sla_actions não pode ESCALAR (status ESCALATED ou nível mais alto) se o caso de risco
--    vinculado já está RESOLVIDO/FECHADO (recusa a transição; não corrige nada retroativamente).
-- 5) Relatório sla_followup_consistency_issues (somente leitura, security invoker).
-- ============================================================

create table if not exists public.sla_action_followup_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  sla_action_id uuid not null references public.sla_actions (id) on delete cascade,
  event_type text not null check (event_type in ('FORECAST_RECORDED', 'FORECAST_OVERDUE')),
  forecast_at timestamptz,
  forecast_event_id uuid references public.sla_action_followup_events (id) on delete cascade,
  origin text not null check (origin in ('WEB', 'EMAIL', 'SYSTEM')),
  actor_user_id uuid references public.profiles (id) on delete set null,
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  note text check (note is null or char_length(note) <= 4000),
  created_at timestamptz not null default now(),
  check (event_type <> 'FORECAST_RECORDED' or (forecast_at is not null and origin in ('WEB', 'EMAIL'))),
  check (event_type <> 'FORECAST_OVERDUE' or (forecast_event_id is not null and origin = 'SYSTEM'))
);
create unique index if not exists sla_action_followup_overdue_once_uidx
  on public.sla_action_followup_events (forecast_event_id) where event_type = 'FORECAST_OVERDUE';
create unique index if not exists sla_action_followup_message_uidx
  on public.sla_action_followup_events (sla_action_id, provider_message_id) where provider_message_id is not null;
create index if not exists sla_action_followup_action_idx
  on public.sla_action_followup_events (sla_action_id, created_at desc);

alter table public.sla_action_followup_events enable row level security;
drop policy if exists sla_action_followup_events_select_members on public.sla_action_followup_events;
create policy sla_action_followup_events_select_members on public.sla_action_followup_events
  for select to authenticated using (public.is_project_member(project_id));
revoke all on table public.sla_action_followup_events from public, anon, authenticated;
grant select on table public.sla_action_followup_events to authenticated;
grant select on table public.sla_action_followup_events to service_role;

-- Política de notificação do acompanhamento: DESLIGADA por padrão; sem consumidor de envio nesta migration.
create table if not exists public.sla_followup_policy (
  project_id uuid primary key references public.projects (id) on delete cascade,
  notify_enabled boolean not null default false,
  decided_by_user_id uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  note text
);
alter table public.sla_followup_policy enable row level security;
revoke all on table public.sla_followup_policy from public, anon, authenticated;
grant select on table public.sla_followup_policy to service_role;

create or replace function public.sla_followup_notification_allowed(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.notify_enabled from public.sla_followup_policy p where p.project_id = p_project_id), false)
$$;

-- ---------- núcleo: registra a previsão (autoriza pelo ator; mesma regra de "iniciar" a ação) ----------
create or replace function public.sla_action_record_forecast_core(
  p_actor uuid,
  p_action_id uuid,
  p_forecast_at timestamptz,
  p_note text,
  p_origin text,
  p_provider_message_id text,
  p_require_future boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_forecast_at is null then raise exception 'FORECAST_REQUIRED'; end if;
  if p_origin is null or p_origin not in ('WEB', 'EMAIL') then raise exception 'INVALID_ORIGIN'; end if;
  if coalesce(p_require_future, true) and p_forecast_at <= now() then raise exception 'FORECAST_IN_PAST'; end if;
  v_action := public.sla_action_authorize_operation_for(p_actor, p_action_id, 'START');
  if v_action.acknowledged_at is null then raise exception 'ACTION_NOT_ASSUMED'; end if;

  insert into public.sla_action_followup_events (project_id, sla_action_id, event_type, forecast_at, origin, actor_user_id, provider_message_id, note)
  values (v_action.project_id, v_action.id, 'FORECAST_RECORDED', p_forecast_at, p_origin, p_actor, nullif(p_provider_message_id, ''), left(v_note, 4000))
  returning id into v_id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_action.project_id, 'USER', p_actor, null, 'SLA_ACTION_FORECAST_RECORDED', 'SLA_ACTION', v_action.id::text,
    format('Previsão de término %s registrada por %s%s. Prazos e escalonamento preservados (só registro).',
      to_char(p_forecast_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      case when p_origin = 'EMAIL' then 'resposta de e-mail' else 'tela' end,
      case when p_provider_message_id is not null then format(' (mensagem %s)', p_provider_message_id) else '' end)
  );
  return v_id;
end;
$$;

create or replace function public.sla_action_record_forecast(p_action_id uuid, p_forecast_at timestamptz, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.sla_action_record_forecast_core(v_user, p_action_id, p_forecast_at, p_note, 'WEB', null, true);
end;
$$;

-- EM ANDAMENTO por e-mail + previsão: reaproveita sla_action_progress_by_email (idempotência por mensagem, autorização,
-- auditoria) e grava a previsão estruturada na MESMA transação. Previsão no passado é aceita aqui (a resposta foi
-- lida com atraso); o validador do app já a checou contra a data de recebimento.
create or replace function public.sla_action_progress_with_forecast_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_note text,
  p_forecast_at timestamptz,
  p_provider_message_id text
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  v_action := public.sla_action_progress_by_email(p_actor_user_id, p_action_id, p_note, p_provider_message_id);
  if p_forecast_at is not null then
    perform public.sla_action_record_forecast_core(p_actor_user_id, p_action_id, p_forecast_at, p_note, 'EMAIL', p_provider_message_id, false);
  end if;
  return v_action;
end;
$$;

-- ---------- acompanhamento: previsão vencida = EVENTO (sem escalonar, sem e-mail) ----------
create or replace function public.sla_followup_overdue_forecasts(p_now timestamptz default now())
returns table (sla_action_id uuid, project_id uuid, forecast_event_id uuid, forecast_at timestamptz, current_escalation_level text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.project_id, f.id, f.forecast_at, a.current_escalation_level, a.status
  from public.sla_actions a
  join lateral (
    select e.id, e.forecast_at
    from public.sla_action_followup_events e
    where e.sla_action_id = a.id and e.event_type = 'FORECAST_RECORDED'
    order by e.created_at desc, e.id desc
    limit 1
  ) f on true
  where a.status not in ('COMPLETED', 'CANCELLED')
    and f.forecast_at < coalesce(p_now, now())
    and not exists (select 1 from public.sla_action_followup_events o where o.event_type = 'FORECAST_OVERDUE' and o.forecast_event_id = f.id)
$$;

create or replace function public.sla_followup_run(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_inserted uuid;
begin
  for v_row in select * from public.sla_followup_overdue_forecasts(coalesce(p_now, now())) loop
    insert into public.sla_action_followup_events (project_id, sla_action_id, event_type, forecast_at, forecast_event_id, origin)
    values (v_row.project_id, v_row.sla_action_id, 'FORECAST_OVERDUE', v_row.forecast_at, v_row.forecast_event_id, 'SYSTEM')
    on conflict (forecast_event_id) where event_type = 'FORECAST_OVERDUE' do nothing
    returning id into v_inserted;
    if v_inserted is not null then
      insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
      values (
        v_row.project_id, 'SYSTEM', null, null, 'SLA_ACTION_FORECAST_OVERDUE', 'SLA_ACTION', v_row.sla_action_id::text,
        format('Previsão de término %s vencida sem conclusão (nível %s, status %s). Registro para revisão humana; nenhum escalonamento ou e-mail foi criado.',
          to_char(v_row.forecast_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), v_row.current_escalation_level, v_row.status)
      );
      v_count := v_count + 1;
    end if;
    v_inserted := null;
  end loop;
  return v_count;
end;
$$;

-- ---------- auditoria da previsão do alerta de risco registrada pela TELA (gatilho; não toca record_risk_alert_action) ----------
create or replace function public.risk_alert_action_event_forecast_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.forecast_at is not null and new.origin = 'WEB' and new.actor_user_id is not null then
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
    values (
      new.project_id, 'USER', new.actor_user_id, null, 'RISK_ALERT_FORECAST_RECORDED', 'RISK_ALERT_CASE', new.case_id::text,
      format('Previsão de conclusão %s informada pela tela (evento %s). Prazos SLA inalterados.',
        to_char(new.forecast_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), new.id)
    );
  end if;
  return new;
end;
$$;
drop trigger if exists risk_alert_action_events_forecast_audit on public.risk_alert_action_events;
create trigger risk_alert_action_events_forecast_audit
  after insert on public.risk_alert_action_events
  for each row execute function public.risk_alert_action_event_forecast_audit();

-- ---------- guarda: ação SLA não escala se o caso de risco vinculado já foi resolvido/fechado ----------
create or replace function public.sla_action_closed_risk_case_escalation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rank_old int := case old.current_escalation_level when 'RESPONSAVEL' then 0 when 'ESCALAO_1' then 1 when 'ESCALAO_2' then 1 when 'DIRETORIA' then 2 else 0 end;
  v_rank_new int := case new.current_escalation_level when 'RESPONSAVEL' then 0 when 'ESCALAO_1' then 1 when 'ESCALAO_2' then 1 when 'DIRETORIA' then 2 else 0 end;
begin
  if (new.status = 'ESCALATED' and old.status is distinct from 'ESCALATED') or v_rank_new > v_rank_old then
    if exists (
      select 1 from public.risk_alert_cases c
      where c.sla_action_id = new.id and (c.state = 'RESOLVED' or c.status = 'CLOSED')
    ) then
      raise exception 'ESCALATION_RISK_CASE_CLOSED: o alerta de risco vinculado já foi resolvido/encerrado; a ação não é escalonada.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists sla_actions_closed_risk_case_escalation_guard on public.sla_actions;
create trigger sla_actions_closed_risk_case_escalation_guard
  before update of status, current_escalation_level on public.sla_actions
  for each row execute function public.sla_action_closed_risk_case_escalation_guard();

-- ---------- relatório de consistência (somente leitura; cada usuário vê o que a RLS já permite) ----------
create or replace view public.sla_followup_consistency_issues
with (security_invoker = true)
as
select a.id as sla_action_id, a.project_id, 'ESCALATED_RISK_CASE_CLOSED'::text as issue_code,
       format('Ação %s (nível %s) com alerta de risco %s já resolvido/encerrado.', a.status, a.current_escalation_level, c.id) as detail
from public.sla_actions a
join public.risk_alert_cases c on c.sla_action_id = a.id
where a.status in ('ESCALATED', 'OVERDUE') and (c.state = 'RESOLVED' or c.status = 'CLOSED')
union all
select a.id, a.project_id, 'ESCALATED_LEVEL_NOT_RAISED',
       'Status ESCALATED com nível RESPONSAVEL (status e nível divergem).'
from public.sla_actions a
where a.status = 'ESCALATED' and a.current_escalation_level = 'RESPONSAVEL'
union all
select a.id, a.project_id, 'TOP_LEVEL_NO_FORECAST',
       'Ação aberta no último nível (DIRETORIA) sem previsão de término registrada.'
from public.sla_actions a
where a.status not in ('COMPLETED', 'CANCELLED') and a.current_escalation_level = 'DIRETORIA'
  and not exists (select 1 from public.sla_action_followup_events e where e.sla_action_id = a.id and e.event_type = 'FORECAST_RECORDED')
  and not exists (
    select 1 from public.risk_alert_cases c
    join public.risk_alert_action_events ev on ev.case_id = c.id
    where c.sla_action_id = a.id and ev.forecast_at is not null)
union all
select a.id, a.project_id, 'FORECAST_OVERDUE_OPEN',
       format('Previsão %s vencida; ação ainda %s.', to_char(e.forecast_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), a.status)
from public.sla_actions a
join public.sla_action_followup_events e on e.sla_action_id = a.id and e.event_type = 'FORECAST_OVERDUE'
where a.status not in ('COMPLETED', 'CANCELLED')
  and e.created_at = (select max(e2.created_at) from public.sla_action_followup_events e2 where e2.sla_action_id = a.id and e2.event_type = 'FORECAST_OVERDUE')
union all
select a.id, a.project_id, 'RISK_LEVEL_DIVERGENT',
       format('Nível de risco do caso %s; nível da ação SLA %s.', c.risk_level, a.risk_level)
from public.sla_actions a
join public.risk_alert_cases c on c.sla_action_id = a.id
where c.state <> 'RESOLVED' and c.risk_level in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') and c.risk_level <> a.risk_level;

-- ---------- privilégios ----------
revoke all on public.sla_followup_consistency_issues from public, anon;
grant select on public.sla_followup_consistency_issues to authenticated, service_role;
revoke all on function public.sla_followup_notification_allowed(uuid) from public, anon, authenticated;
grant execute on function public.sla_followup_notification_allowed(uuid) to service_role;
revoke all on function public.sla_action_record_forecast_core(uuid, uuid, timestamptz, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.sla_action_record_forecast(uuid, timestamptz, text) from public, anon;
grant execute on function public.sla_action_record_forecast(uuid, timestamptz, text) to authenticated, service_role;
revoke all on function public.sla_action_progress_with_forecast_by_email(uuid, uuid, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.sla_action_progress_with_forecast_by_email(uuid, uuid, text, timestamptz, text) to service_role;
revoke all on function public.sla_followup_overdue_forecasts(timestamptz) from public, anon, authenticated;
grant execute on function public.sla_followup_overdue_forecasts(timestamptz) to service_role;
revoke all on function public.sla_followup_run(timestamptz) from public, anon, authenticated;
grant execute on function public.sla_followup_run(timestamptz) to service_role;
revoke all on function public.risk_alert_action_event_forecast_audit() from public, anon, authenticated;
revoke all on function public.sla_action_closed_risk_case_escalation_guard() from public, anon, authenticated;
