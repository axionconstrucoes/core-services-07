-- =====================================================================
-- PROPOSTA PARA DECISÃO — NÃO APLICAR sem aprovação explícita do Reynaldo.
-- pg_cron NÃO está autorizado. Ver docs/operacao-agendador-sla.md (PR #203).
-- =====================================================================
-- Agendador do ACC no Supabase (pg_cron + pg_net) em duas camadas:
--
--   A) ESCALONAMENTO/ALERTAS (leve, a cada 2 min): chama DIRETAMENTE a rota
--      Vercel GET https://<base>/api/cron/risk-alerts com
--      "Authorization: Bearer <ACC_RISK_ALERTS_CRON_SECRET>". O ciclo calcula
--      escalonamentos (Gestor/Diretoria), planeja e envia pela outbox. Não
--      depende do GitHub.
--   B) COLETA/PROCESSAMENTO (pesado, a cada 10–15 min): dispara
--      POST https://api.github.com/repos/axionconstrucoes/core-services-07/
--           actions/workflows/<arquivo>/dispatches  {"ref":"main","inputs":{…}}
--      (workflow_dispatch). Os jobs rodam no GitHub (Python/Java/heap 6 GB).
--
-- Disparar NÃO comprova execução:
--   * GitHub: 204 = disparo aceito; a execução só é comprovada pelo heartbeat
--     de término gravado pelo próprio workflow (scripts/scheduler-heartbeat.mjs).
--   * Rota Vercel: o status HTTP da resposta (lido de net._http_response na
--     rodada seguinte) é o comprovante: 200 = ciclo concluído.
--
-- Pré-requisitos MANUAIS (fora desta migration; pelo SQL Editor do Supabase,
-- sem colar valores em chat/log/repositório):
--   select vault.create_secret('<token GitHub>', 'acc_github_actions_dispatch_token');
--   select vault.create_secret('<mesmo valor de ACC_RISK_ALERTS_CRON_SECRET da Vercel>', 'acc_risk_alerts_cron_secret');
--   select vault.create_secret('https://acc.axion.com.br', 'acc_app_base_url');
-- Sem esses segredos as funções não chamam nada (o watchdog acusa).
--
-- Reversão: select cron.unschedule(jobname) from cron.job where jobname like 'acc-%';
-- (os workflows mantêm o `schedule` do GitHub como reserva).
-- =====================================================================

-- Extensões: só onde existem (no replay PGlite da CI elas não existem e o
-- agendamento é pulado; tabela e funções continuam testáveis).
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
  expected_interval interval not null,
  last_dispatch_at timestamptz,
  last_dispatch_request_id bigint,
  last_reconciled_request_id bigint,
  last_dispatch_http_status integer,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  updated_at timestamptz not null default now(),
  constraint acc_scheduler_heartbeats_failure_code_len check (last_failure_code is null or length(last_failure_code) <= 64)
);

alter table public.acc_scheduler_heartbeats enable row level security;
-- Sem policies: nenhum usuário (anon/authenticated) lê ou escreve; só
-- postgres (pg_cron) e service_role (aplicação/workflows).
revoke all on public.acc_scheduler_heartbeats from anon, authenticated;

insert into public.acc_scheduler_heartbeats (job, kind, target, expected_interval) values
  ('risk-alerts',     'VERCEL_ROUTE',    '/api/cron/risk-alerts',                interval '2 minutes'),
  ('weekly-all',      'GITHUB_WORKFLOW', 'weekly-schedule-email-ingestion.yml',  interval '10 minutes'),
  ('mpp-worker',      'GITHUB_WORKFLOW', 'mpp-document-worker.yml',              interval '10 minutes'),
  ('document-worker', 'GITHUB_WORKFLOW', 'document-processing-worker.yml',       interval '10 minutes'),
  ('gmail-sync',      'GITHUB_WORKFLOW', 'gmail-inbound-sync.yml',               interval '15 minutes'),
  ('ssma-drive',      'GITHUB_WORKFLOW', 'ssma-drive-photo-sync.yml',            interval '2 hours'),
  ('construmanager',  'GITHUB_WORKFLOW', 'construmanager-content-ingestion.yml', interval '6 hours'),
  ('diario',          'GITHUB_WORKFLOW', 'diario-de-obra-sync.yml',              interval '1 day')
on conflict (job) do nothing;

-- ---------------------------------------------------------------------
-- Leitura de segredo do Vault (somente funções SECURITY DEFINER do
-- agendador; nunca exposta a anon/authenticated/service_role).
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- Reconciliação: lê a resposta do disparo anterior em net._http_response
-- (guardada pelo pg_net por 6 h) e registra falhas com código curto.
-- GitHub: 204 = aceito (sucesso só pelo heartbeat do workflow).
-- Rota:   200 = sucesso; 207 = ciclo com falha parcial; 204 = relatórios
--         semanais desligados; 401 = segredo divergente; 409 = já em
--         execução na mesma instância; 5xx/timeout = falha.
-- ---------------------------------------------------------------------
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

  select status_code, timed_out, error_msg, created into resp
    from net._http_response where id = hb.last_dispatch_request_id;
  if not found then
    -- Ainda em andamento (ou resposta expirada após 6 h).
    if hb.last_dispatch_at < now() - interval '6 hours' then
      update public.acc_scheduler_heartbeats
         set last_reconciled_request_id = hb.last_dispatch_request_id,
             last_failure_at = now(), last_failure_code = 'RESPONSE_EXPIRED', updated_at = now()
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

revoke all on function public.acc_scheduler_reconcile(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- B) Disparo de workflow do GitHub (assíncrono; pg_net envia após o commit).
-- ---------------------------------------------------------------------
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
    return null; -- sem token: nada é chamado; o watchdog acusa.
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

-- ---------------------------------------------------------------------
-- A) Ciclo de alertas/escalonamento direto na rota Vercel.
-- Trava de sobreposição: não chama de novo enquanto a chamada anterior não
-- tiver resposta (até 5 min). A rota ainda tem trava por instância (409) e,
-- entre instâncias, a outbox tem reivindicação atômica (claimed_at,
-- migration 20261029100000) + chave de idempotência única, e o escalonamento
-- usa compare-and-set (escalate_sla_action_system com nível esperado).
-- ---------------------------------------------------------------------
create or replace function public.acc_scheduler_call_risk_alerts()
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
  perform public.acc_scheduler_reconcile('risk-alerts');
  select * into hb from public.acc_scheduler_heartbeats where job = 'risk-alerts';

  if hb.last_dispatch_request_id is not null
     and hb.last_dispatch_request_id is distinct from hb.last_reconciled_request_id
     and hb.last_dispatch_at > now() - interval '5 minutes' then
    return null; -- chamada anterior ainda sem resposta: não sobrepõe.
  end if;

  v_secret := public.acc_scheduler_secret('acc_risk_alerts_cron_secret');
  v_base := public.acc_scheduler_secret('acc_app_base_url');
  if v_secret is null or length(v_secret) = 0 or v_base is null or v_base !~ '^https://[a-z0-9.-]+/?$' then
    return null;
  end if;

  select net.http_get(
    url := rtrim(v_base, '/') || '/api/cron/risk-alerts',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'User-Agent', 'acc-scheduler'),
    timeout_milliseconds := 290000 -- maxDuration da rota = 300 s
  ) into v_request_id;

  update public.acc_scheduler_heartbeats
     set last_dispatch_at = now(), last_dispatch_request_id = v_request_id, updated_at = now()
   where job = 'risk-alerts';
  return v_request_id;
end;
$$;

revoke all on function public.acc_scheduler_call_risk_alerts() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Heartbeat de término chamado pelos workflows (service role, via RPC).
-- ---------------------------------------------------------------------
create or replace function public.acc_scheduler_record_heartbeat(p_job text, p_status text, p_started_at timestamptz default null, p_failure_code text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('success', 'failure', 'cancelled') then
    raise exception 'acc_scheduler: status inválido';
  end if;
  update public.acc_scheduler_heartbeats
     set last_started_at = coalesce(p_started_at, last_started_at),
         last_success_at = case when p_status = 'success' then now() else last_success_at end,
         last_failure_at = case when p_status <> 'success' then now() else last_failure_at end,
         last_failure_code = case when p_status <> 'success' then left(coalesce(p_failure_code, p_status), 64) else last_failure_code end,
         updated_at = now()
   where job = p_job and kind = 'GITHUB_WORKFLOW';
end;
$$;

revoke all on function public.acc_scheduler_record_heartbeat(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.acc_scheduler_record_heartbeat(text, text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------
-- Watchdog (a cada 5 min): incidente quando passa de 3x o intervalo sem
-- sucesso comprovado; resolve quando volta. Não envia e-mail.
-- ---------------------------------------------------------------------
create or replace function public.acc_scheduler_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_project uuid := '00000000-0000-4000-8000-000000000001';
begin
  for r in select job from public.acc_scheduler_heartbeats loop
    perform public.acc_scheduler_reconcile(r.job);
  end loop;

  for r in select * from public.acc_scheduler_heartbeats loop
    if r.last_success_at is null or r.last_success_at < now() - (r.expected_interval * 3) then
      insert into public.acc_system_health_incidents (project_id, source_type, fingerprint, status, summary, first_detected_at, last_detected_at)
      values (v_project, 'SCHEDULER', 'scheduler:' || r.job, 'OPEN',
              'Agendador: ' || r.job || ' sem execução concluída com sucesso há mais de 3x o intervalo esperado'
                || coalesce(' (último código: ' || r.last_failure_code || ')', '') || '.',
              now(), now())
      on conflict (project_id, fingerprint) do update
        set status = 'OPEN', last_detected_at = now(), resolved_at = null, summary = excluded.summary;
    else
      update public.acc_system_health_incidents
         set status = 'RESOLVED', resolved_at = now()
       where project_id = v_project and fingerprint = 'scheduler:' || r.job and status = 'OPEN';
    end if;
  end loop;
end;
$$;

revoke all on function public.acc_scheduler_watchdog() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- Agenda (UTC). Jobs do pg_cron rodam como o dono (postgres); nenhum grant
-- de cron.* ou net.* é concedido a anon/authenticated/service_role.
-- ---------------------------------------------------------------------
do $sched$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('acc-risk-alerts',     '*/2 * * * *',     $$select public.acc_scheduler_call_risk_alerts()$$);
    perform cron.schedule('acc-weekly-all',      '*/10 * * * *',    $$select public.acc_scheduler_dispatch_workflow('weekly-all', '{"phase":"all"}'::jsonb)$$);
    perform cron.schedule('acc-document-worker', '2-59/10 * * * *', $$select public.acc_scheduler_dispatch_workflow('document-worker')$$);
    perform cron.schedule('acc-mpp-worker',      '5-59/10 * * * *', $$select public.acc_scheduler_dispatch_workflow('mpp-worker')$$);
    perform cron.schedule('acc-gmail-sync',      '1-59/15 * * * *', $$select public.acc_scheduler_dispatch_workflow('gmail-sync')$$);
    perform cron.schedule('acc-ssma-drive',      '0 */2 * * *',     $$select public.acc_scheduler_dispatch_workflow('ssma-drive')$$);
    perform cron.schedule('acc-construmanager',  '17 */6 * * *',    $$select public.acc_scheduler_dispatch_workflow('construmanager')$$);
    perform cron.schedule('acc-diario',          '43 0 * * *',      $$select public.acc_scheduler_dispatch_workflow('diario', '{"mode":"incremental"}'::jsonb)$$);
    perform cron.schedule('acc-watchdog',        '*/5 * * * *',     $$select public.acc_scheduler_watchdog()$$);
  else
    raise notice 'acc_scheduler: pg_cron ausente; jobs não agendados.';
  end if;
end;
$sched$;
