-- =====================================================================
-- PROPOSTA PARA DECISÃO — NÃO APLICAR sem aprovação explícita do Reynaldo.
-- pg_cron NÃO está autorizado. Ver docs/operacao-agendador-sla.md (PR #203).
-- =====================================================================
-- Agendador do ACC no Supabase (pg_cron + pg_net):
--
--   ROTAS VERCEL (leves, origem ÚNICA quando instalado):
--     acc-risk-alerts        a cada 2 min   GET https://<base>/api/cron/risk-alerts        Bearer ACC_RISK_ALERTS_CRON_SECRET
--     acc-ssma-notifications a cada 5 min   GET https://<base>/api/cron/ssma-notifications Bearer CRON_SECRET
--     (com ACC_SCHEDULER_PG_CRON_ENABLED=true no GitHub, o job risk-alerts do workflow semanal e o workflow
--      ssma-notifications deixam de chamar essas rotas — ver os YAML.)
--   WORKFLOWS GITHUB (coleta/processamento pesado, inclui a leitura de respostas de riscos e SSMA na fase replies):
--     POST https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/<arquivo>/dispatches
--     {"ref":"main","inputs":{…}}
--
-- Três estados distintos por workflow (nenhum é presumido a partir do anterior):
--   1. DISPARO ACEITO  — HTTP 204 do GitHub, lido de net._http_response (last_dispatch_*).
--   2. INÍCIO REAL     — passo do workflow grava "started" com run_id (last_started_*).
--   3. CONCLUSÃO       — passo final (if: always()) grava "finished" + conclusão + run_id (last_finished_*).
-- Para as rotas, o comprovante é o HTTP da resposta (200 = ciclo concluído).
-- O watchdog (a cada 5 min) abre/resolve incidentes por motivo: falha de disparo, disparo sem início,
-- início sem conclusão, job com falha, rota com falha, ausência de sucesso. Não envia e-mail.
--
-- Segredos (Vault; gravados MANUALMENTE no SQL Editor, nunca nesta migration/chat/log/repositório):
--   acc_github_actions_dispatch_token  PAT fine-grained: só este repositório, só "Actions: Read and write"
--   acc_risk_alerts_cron_secret        = ACC_RISK_ALERTS_CRON_SECRET (Vercel/GitHub)
--   acc_cron_secret                    = CRON_SECRET (Vercel/GitHub) — rota SSMA
--   acc_app_base_url                   https://acc.axion.com.br (não é segredo; só https é aceito)
-- Sem um segredo, a chamada correspondente simplesmente não acontece (o watchdog acusa).
--
-- Reversão: ver docs/operacao-agendador-sla.md §12 (parar cron.unschedule de 'acc-%', confirmar chamadas e workflows, só então variável
-- ACC_SCHEDULER_PG_CRON_ENABLED=false, opcionalmente remover segredos/tabelas).
-- =====================================================================

do $ext$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
  else
    raise notice 'acc_scheduler: pg_cron/pg_net indisponíveis neste ambiente; agendamento não instalado.';
  end if;
end;
$ext$;

create table if not exists public.acc_scheduler_heartbeats (
  job text primary key,
  kind text not null check (kind in ('GITHUB_WORKFLOW', 'VERCEL_ROUTE')),
  target text not null,
  secret_name text,
  expected_interval interval not null,
  start_grace interval not null default interval '15 minutes',
  max_run interval not null default interval '30 minutes',
  last_dispatch_at timestamptz,
  last_dispatch_request_id bigint,
  last_reconciled_request_id bigint,
  last_dispatch_http_status integer,
  last_started_at timestamptz,
  last_started_run_id bigint,
  last_finished_at timestamptz,
  last_finished_run_id bigint,
  last_conclusion text check (last_conclusion is null or last_conclusion in ('success', 'failure', 'cancelled')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text check (last_failure_code is null or length(last_failure_code) <= 64),
  updated_at timestamptz not null default now()
);
alter table public.acc_scheduler_heartbeats enable row level security;
revoke all on public.acc_scheduler_heartbeats from anon, authenticated;

insert into public.acc_scheduler_heartbeats (job, kind, target, secret_name, expected_interval, start_grace, max_run) values
  ('risk-alerts',        'VERCEL_ROUTE',    '/api/cron/risk-alerts',                'acc_risk_alerts_cron_secret', interval '2 minutes',  interval '5 minutes',  interval '5 minutes'),
  ('ssma-notifications', 'VERCEL_ROUTE',    '/api/cron/ssma-notifications',         'acc_cron_secret',             interval '5 minutes' , interval '5 minutes',  interval '5 minutes'),
  ('weekly-all',         'GITHUB_WORKFLOW', 'weekly-schedule-email-ingestion.yml',  null, interval '10 minutes', interval '15 minutes', interval '30 minutes'),
  ('mpp-worker',         'GITHUB_WORKFLOW', 'mpp-document-worker.yml',              null, interval '10 minutes', interval '15 minutes', interval '30 minutes'),
  ('document-worker',    'GITHUB_WORKFLOW', 'document-processing-worker.yml',       null, interval '10 minutes', interval '15 minutes', interval '30 minutes'),
  ('gmail-sync',         'GITHUB_WORKFLOW', 'gmail-inbound-sync.yml',               null, interval '15 minutes', interval '15 minutes', interval '20 minutes'),
  ('ssma-drive',         'GITHUB_WORKFLOW', 'ssma-drive-photo-sync.yml',            null, interval '2 hours',    interval '15 minutes', interval '25 minutes'),
  ('construmanager',     'GITHUB_WORKFLOW', 'construmanager-content-ingestion.yml', null, interval '6 hours',    interval '15 minutes', interval '30 minutes'),
  ('diario',             'GITHUB_WORKFLOW', 'diario-de-obra-sync.yml',              null, interval '1 day',      interval '15 minutes', interval '30 minutes')
on conflict (job) do nothing;

-- Contador de condição repetida (auditoria só na mudança de estado; ver apps/web/lib/risk-alerts/readiness-audit.ts).
create table if not exists public.acc_repeated_conditions (
  project_id uuid not null references public.projects(id) on delete cascade,
  condition_key text not null,
  detail text,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  occurrences bigint not null default 1,
  primary key (project_id, condition_key)
);
alter table public.acc_repeated_conditions enable row level security;
revoke all on public.acc_repeated_conditions from anon, authenticated;

create or replace function public.acc_bump_repeated_condition(p_project_id uuid, p_condition_key text, p_detail text, p_seen_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.acc_repeated_conditions (project_id, condition_key, detail, first_seen_at, last_seen_at, occurrences)
  values (p_project_id, left(p_condition_key, 128), p_detail, p_seen_at, p_seen_at, 1)
  on conflict (project_id, condition_key) do update
    set occurrences   = case when public.acc_repeated_conditions.detail is not distinct from excluded.detail then public.acc_repeated_conditions.occurrences + 1 else 1 end,
        first_seen_at = case when public.acc_repeated_conditions.detail is not distinct from excluded.detail then public.acc_repeated_conditions.first_seen_at else excluded.first_seen_at end,
        detail        = excluded.detail,
        last_seen_at  = excluded.last_seen_at;
end;
$$;
revoke all on function public.acc_bump_repeated_condition(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.acc_bump_repeated_condition(uuid, text, text, timestamptz) to service_role;

-- Leitura do Vault: SOMENTE pelas funções do agendador.
create or replace function public.acc_scheduler_secret(p_name text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return (select decrypted_secret from vault.decrypted_secrets where name = p_name limit 1);
end;
$$;
revoke all on function public.acc_scheduler_secret(text) from public, anon, authenticated, service_role;

-- Reconciliação: resposta do disparo anterior (pg_net guarda 6 h em net._http_response).
create or replace function public.acc_scheduler_reconcile(p_job text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  hb public.acc_scheduler_heartbeats%rowtype;
  resp record;
  v_code text;
begin
  select * into hb from public.acc_scheduler_heartbeats where job = p_job;
  if hb.job is null or hb.last_dispatch_request_id is null
     or hb.last_dispatch_request_id is not distinct from hb.last_reconciled_request_id then
    return;
  end if;

  select status_code, timed_out, error_msg, created into resp from net._http_response where id = hb.last_dispatch_request_id;
  if not found then
    if hb.last_dispatch_at < now() - interval '6 hours' then
      update public.acc_scheduler_heartbeats
         set last_reconciled_request_id = hb.last_dispatch_request_id, last_failure_at = now(), last_failure_code = 'RESPONSE_EXPIRED', updated_at = now()
       where job = p_job;
    end if;
    return;
  end if;

  v_code := case
    when resp.timed_out then 'TIMEOUT'
    when resp.error_msg is not null then 'NET_ERROR'
    when hb.kind = 'GITHUB_WORKFLOW' and resp.status_code = 204 then null
    when hb.kind = 'VERCEL_ROUTE' and resp.status_code = 200 then null
    when hb.kind = 'GITHUB_WORKFLOW' then 'DISPATCH_HTTP_' || coalesce(resp.status_code::text, 'NULL')
    when resp.status_code = 409 then 'ROUTE_IN_FLIGHT'
    when resp.status_code = 204 then 'ROUTE_DISABLED'
    else 'ROUTE_HTTP_' || coalesce(resp.status_code::text, 'NULL')
  end;

  update public.acc_scheduler_heartbeats
     set last_reconciled_request_id = hb.last_dispatch_request_id,
         last_dispatch_http_status = resp.status_code,
         last_success_at = case when v_code is null and hb.kind = 'VERCEL_ROUTE' then resp.created else last_success_at end,
         last_failure_at = case when v_code is not null then resp.created else last_failure_at end,
         last_failure_code = case when v_code is not null then v_code else last_failure_code end,
         updated_at = now()
   where job = p_job;
end;
$$;
revoke all on function public.acc_scheduler_reconcile(text) from public, anon, authenticated, service_role;

-- Disparo de workflow do GitHub (assíncrono; pg_net envia após o commit).
create or replace function public.acc_scheduler_dispatch_workflow(p_job text, p_inputs jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_target text;
  v_request_id bigint;
begin
  perform public.acc_scheduler_reconcile(p_job);
  select target into v_target from public.acc_scheduler_heartbeats where job = p_job and kind = 'GITHUB_WORKFLOW';
  if v_target is null then
    raise warning 'acc_scheduler: job desconhecido';
    return null;
  end if;
  v_token := public.acc_scheduler_secret('acc_github_actions_dispatch_token');
  if v_token is null or length(v_token) = 0 then
    return null;
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/' || v_target || '/dispatches',
    body := jsonb_build_object('ref', 'main', 'inputs', coalesce(p_inputs, '{}'::jsonb)),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'acc-scheduler',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 15000
  ) into v_request_id;

  update public.acc_scheduler_heartbeats
     set last_dispatch_at = now(), last_dispatch_request_id = v_request_id, updated_at = now()
   where job = p_job;
  return v_request_id;
end;
$$;
revoke all on function public.acc_scheduler_dispatch_workflow(text, jsonb) from public, anon, authenticated, service_role;

-- Chamada direta de rota Vercel (riscos/SSMA). Não sobrepõe: enquanto a chamada anterior não tiver resposta
-- (até start_grace), a rodada é pulada. A rota ainda tem trava por instância (409); entre instâncias, a outbox tem
-- reivindicação atômica + chave de idempotência e o escalonamento usa compare-and-set.
create or replace function public.acc_scheduler_call_route(p_job text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  hb public.acc_scheduler_heartbeats%rowtype;
  v_secret text;
  v_base text;
  v_request_id bigint;
begin
  perform public.acc_scheduler_reconcile(p_job);
  select * into hb from public.acc_scheduler_heartbeats where job = p_job and kind = 'VERCEL_ROUTE';
  if hb.job is null then
    raise warning 'acc_scheduler: rota desconhecida';
    return null;
  end if;
  if hb.last_dispatch_request_id is not null
     and hb.last_dispatch_request_id is distinct from hb.last_reconciled_request_id
     and hb.last_dispatch_at > now() - hb.start_grace then
    return null;
  end if;

  v_secret := public.acc_scheduler_secret(hb.secret_name);
  v_base := public.acc_scheduler_secret('acc_app_base_url');
  if v_secret is null or length(v_secret) = 0 or v_base is null or v_base !~ '^https://[a-z0-9.-]+/?$' then
    return null;
  end if;

  select net.http_get(
    url := rtrim(v_base, '/') || hb.target,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'User-Agent', 'acc-scheduler'),
    timeout_milliseconds := 290000
  ) into v_request_id;

  update public.acc_scheduler_heartbeats
     set last_dispatch_at = now(), last_dispatch_request_id = v_request_id, updated_at = now()
   where job = p_job;
  return v_request_id;
end;
$$;
revoke all on function public.acc_scheduler_call_route(text) from public, anon, authenticated, service_role;

-- Início/conclusão REAIS gravados pelo workflow (service_role via RPC).
create or replace function public.acc_scheduler_record_heartbeat(p_job text, p_event text, p_run_id bigint default null, p_run_attempt integer default null, p_conclusion text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event = 'started' then
    update public.acc_scheduler_heartbeats
       set last_started_at = now(), last_started_run_id = p_run_id, updated_at = now()
     where job = p_job and kind = 'GITHUB_WORKFLOW';
  elsif p_event = 'finished' and p_conclusion in ('success', 'failure', 'cancelled') then
    update public.acc_scheduler_heartbeats
       set last_finished_at = now(), last_finished_run_id = p_run_id, last_conclusion = p_conclusion,
           last_success_at = case when p_conclusion = 'success' then now() else last_success_at end,
           last_failure_at = case when p_conclusion <> 'success' then now() else last_failure_at end,
           last_failure_code = case when p_conclusion <> 'success' then 'JOB_' || upper(p_conclusion) else last_failure_code end,
           updated_at = now()
     where job = p_job and kind = 'GITHUB_WORKFLOW';
  else
    raise exception 'acc_scheduler: evento inválido';
  end if;
end;
$$;
revoke all on function public.acc_scheduler_record_heartbeat(text, text, bigint, integer, text) from public, anon, authenticated;
grant execute on function public.acc_scheduler_record_heartbeat(text, text, bigint, integer, text) to service_role;

-- Watchdog: um incidente por (job, motivo); resolve quando o motivo deixa de valer. Não envia e-mail.
create or replace function public.acc_scheduler_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.acc_scheduler_heartbeats%rowtype;
  v_project uuid := '00000000-0000-4000-8000-000000000001';
  v_reason text;
  v_active text[];
  v_all text[] := array['DISPATCH_FAILED', 'DISPATCH_WITHOUT_START', 'STARTED_WITHOUT_FINISH', 'JOB_FAILED', 'ROUTE_FAILURE', 'NO_RECENT_SUCCESS'];
  v_neg timestamptz := '-infinity';
begin
  for r in select * from public.acc_scheduler_heartbeats loop
    perform public.acc_scheduler_reconcile(r.job);
  end loop;

  for r in select * from public.acc_scheduler_heartbeats loop
    v_active := array[]::text[];
    if r.kind = 'GITHUB_WORKFLOW' then
      if r.last_failure_code is not null and r.last_failure_code not like 'JOB_%'
         and r.last_failure_at > coalesce(r.last_started_at, v_neg) then
        v_active := array_append(v_active, 'DISPATCH_FAILED');
      end if;
      if r.last_dispatch_http_status = 204 and r.last_dispatch_at < now() - r.start_grace
         and coalesce(r.last_started_at, v_neg) < r.last_dispatch_at then
        v_active := array_append(v_active, 'DISPATCH_WITHOUT_START');
      end if;
      if r.last_started_at is not null and r.last_started_at > coalesce(r.last_finished_at, v_neg)
         and r.last_started_at < now() - r.max_run then
        v_active := array_append(v_active, 'STARTED_WITHOUT_FINISH');
      end if;
      if r.last_conclusion in ('failure', 'cancelled') then
        v_active := array_append(v_active, 'JOB_FAILED');
      end if;
    else
      if r.last_failure_at is not null and r.last_failure_at > coalesce(r.last_success_at, v_neg) then
        v_active := array_append(v_active, 'ROUTE_FAILURE');
      end if;
    end if;
    if r.last_success_at is null or r.last_success_at < now() - (r.expected_interval * 3) then
      v_active := array_append(v_active, 'NO_RECENT_SUCCESS');
    end if;

    foreach v_reason in array v_all loop
      if v_reason = any(v_active) then
        insert into public.acc_system_health_incidents (project_id, source_type, fingerprint, status, summary, first_detected_at, last_detected_at)
        values (v_project, 'SCHEDULER', 'scheduler:' || r.job || ':' || v_reason, 'OPEN',
                'Agendador ' || r.job || ': ' || v_reason || coalesce(' (último código: ' || r.last_failure_code || ')', '') || '.', now(), now())
        on conflict (project_id, fingerprint) do update
          set status = 'OPEN', last_detected_at = now(), resolved_at = null, summary = excluded.summary;
      else
        update public.acc_system_health_incidents
           set status = 'RESOLVED', resolved_at = now()
         where project_id = v_project and fingerprint = 'scheduler:' || r.job || ':' || v_reason and status = 'OPEN';
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.acc_scheduler_watchdog() from public, anon, authenticated, service_role;

-- Agenda (UTC). Jobs do pg_cron rodam como postgres; nenhum grant de cron.* / net.* a outros papéis.
do $sched$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('acc-risk-alerts',        '*/2 * * * *',     $$select public.acc_scheduler_call_route('risk-alerts')$$);
    perform cron.schedule('acc-ssma-notifications', '3-59/5 * * * *',  $$select public.acc_scheduler_call_route('ssma-notifications')$$);
    perform cron.schedule('acc-weekly-all',         '*/10 * * * *',    $$select public.acc_scheduler_dispatch_workflow('weekly-all', '{"phase":"all"}'::jsonb)$$);
    perform cron.schedule('acc-document-worker',    '2-59/10 * * * *', $$select public.acc_scheduler_dispatch_workflow('document-worker')$$);
    perform cron.schedule('acc-mpp-worker',         '5-59/10 * * * *', $$select public.acc_scheduler_dispatch_workflow('mpp-worker')$$);
    perform cron.schedule('acc-gmail-sync',         '1-59/15 * * * *', $$select public.acc_scheduler_dispatch_workflow('gmail-sync')$$);
    perform cron.schedule('acc-ssma-drive',         '0 */2 * * *',     $$select public.acc_scheduler_dispatch_workflow('ssma-drive')$$);
    perform cron.schedule('acc-construmanager',     '17 */6 * * *',    $$select public.acc_scheduler_dispatch_workflow('construmanager')$$);
    perform cron.schedule('acc-diario',             '43 0 * * *',      $$select public.acc_scheduler_dispatch_workflow('diario', '{"mode":"incremental"}'::jsonb)$$);
    perform cron.schedule('acc-watchdog',           '*/5 * * * *',     $$select public.acc_scheduler_watchdog()$$);
    -- Higiene: histórico do pg_cron (cron.job_run_details) cresce ~2.700 linhas/dia; mantém 7 dias.
    perform cron.schedule('acc-cron-history-cleanup', '30 3 * * *',      $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
  else
    raise notice 'acc_scheduler: pg_cron ausente; jobs não agendados.';
  end if;
end;
$sched$;
