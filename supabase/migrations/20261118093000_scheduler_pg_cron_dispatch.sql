-- =====================================================================
-- PROPOSTA PARA DECISÃO — NÃO APLICAR sem aprovação explícita do Reynaldo.
-- Ver docs/operacao-agendador-sla.md (PR draft "agendador SLA").
-- =====================================================================
-- Agendador confiável do ACC no Supabase (pg_cron + pg_net), em vez do
-- `schedule` do GitHub Actions (observado: ~1–30% dos disparos executados
-- entre 14/11 e 18/11, com intervalos de 9–25 h).
--
-- O que faz:
--   1. Instala pg_cron e pg_net (disponíveis e NÃO instalados hoje; o plano
--      Supabase da organização já é Pro — sem custo adicional de extensão).
--   2. Cria public.acc_scheduler_heartbeats: um registro por job com o
--      último disparo aceito e o último término (sucesso/falha) informado
--      pelo próprio workflow. Disparar NÃO comprova execução: só o
--      heartbeat de término comprova.
--   3. Cria public.acc_scheduler_dispatch_workflow(): chama a API
--      workflow_dispatch do GitHub com um token guardado no Supabase Vault
--      (nunca nesta migration, nunca em log). Sem token => não faz nada.
--   4. Cria public.acc_scheduler_record_heartbeat(): RPC chamada pelos
--      workflows ao terminar (service role).
--   5. Cria public.acc_scheduler_watchdog(): marca/resolve incidente em
--      acc_system_health_incidents quando um job passa de 3x o intervalo
--      esperado sem sucesso. Não envia e-mail.
--   6. Agenda os jobs (UTC). A frequência dos alertas é a do ciclo semanal
--      (phase=all), que já contém o job risk-alerts.
--
-- Pré-requisitos MANUAIS (fora da migration, pelo SQL Editor do Supabase,
-- sem colar o valor em chat/log/repositório):
--   select vault.create_secret('<token>', 'acc_github_actions_dispatch_token');
--   Token: fine-grained PAT (ou GitHub App) restrito ao repositório
--   axionconstrucoes/core-services-07 com a permissão "Actions: Read and
--   write" e nada mais.
--
-- Reversão: select cron.unschedule(jobname) from cron.job where jobname like 'acc-%';
--   (os workflows mantêm o `schedule` do GitHub como reserva.)
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create table if not exists public.acc_scheduler_heartbeats (
  job text primary key,
  workflow text not null,
  expected_interval interval not null,
  last_dispatch_at timestamptz,
  last_dispatch_request_id bigint,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  updated_at timestamptz not null default now(),
  constraint acc_scheduler_heartbeats_failure_code_len check (last_failure_code is null or length(last_failure_code) <= 64)
);

alter table public.acc_scheduler_heartbeats enable row level security;
revoke all on public.acc_scheduler_heartbeats from anon, authenticated;
-- Leitura administrativa pela aplicação via service role; nenhuma policy
-- para usuários finais nesta etapa.

insert into public.acc_scheduler_heartbeats (job, workflow, expected_interval) values
  ('weekly-all',        'weekly-schedule-email-ingestion.yml', interval '10 minutes'),
  ('mpp-worker',        'mpp-document-worker.yml',             interval '10 minutes'),
  ('document-worker',   'document-processing-worker.yml',      interval '10 minutes'),
  ('gmail-sync',        'gmail-inbound-sync.yml',              interval '15 minutes'),
  ('ssma-drive',        'ssma-drive-photo-sync.yml',           interval '2 hours'),
  ('construmanager',    'construmanager-content-ingestion.yml',interval '6 hours'),
  ('diario',            'diario-de-obra-sync.yml',             interval '1 day')
on conflict (job) do nothing;

-- ---------------------------------------------------------------------
-- Disparo de workflow (assíncrono; pg_net só envia após o commit).
-- ---------------------------------------------------------------------
create or replace function public.acc_scheduler_dispatch_workflow(p_job text, p_inputs jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_workflow text;
  v_request_id bigint;
begin
  select workflow into v_workflow from public.acc_scheduler_heartbeats where job = p_job;
  if v_workflow is null then
    raise warning 'acc_scheduler: job desconhecido';
    return null;
  end if;

  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'acc_github_actions_dispatch_token'
   limit 1;
  if v_token is null or length(v_token) = 0 then
    -- Sem token: não dispara (e não registra disparo). O watchdog acusará.
    return null;
  end if;

  select net.http_post(
    url := 'https://api.github.com/repos/axionconstrucoes/core-services-07/actions/workflows/' || v_workflow || '/dispatches',
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

revoke all on function public.acc_scheduler_dispatch_workflow(text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Heartbeat de término, chamado pelo workflow (service role).
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
   where job = p_job;
end;
$$;

revoke all on function public.acc_scheduler_record_heartbeat(text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.acc_scheduler_record_heartbeat(text, text, timestamptz, text) to service_role;

-- ---------------------------------------------------------------------
-- Watchdog: incidente quando passa de 3x o intervalo sem sucesso.
-- Incidente fica no projeto piloto WEG (tabela exige project_id).
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
  for r in select * from public.acc_scheduler_heartbeats loop
    if r.last_success_at is null or r.last_success_at < now() - (r.expected_interval * 3) then
      insert into public.acc_system_health_incidents (project_id, source_type, fingerprint, status, summary, first_detected_at, last_detected_at)
      values (v_project, 'SCHEDULER', 'scheduler:' || r.job, 'OPEN',
              'Agendador: job ' || r.job || ' sem execução concluída com sucesso há mais de 3x o intervalo esperado.',
              now(), now())
      on conflict (project_id, fingerprint) do update
        set status = 'OPEN', last_detected_at = now(), resolved_at = null,
            summary = excluded.summary;
    else
      update public.acc_system_health_incidents
         set status = 'RESOLVED', resolved_at = now()
       where project_id = v_project and fingerprint = 'scheduler:' || r.job and status = 'OPEN';
    end if;
  end loop;
end;
$$;

revoke all on function public.acc_scheduler_watchdog() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Agenda (UTC). Escalonada para encadear entrada -> processamento -> alerta.
--   :00/:10/... weekly-all (intake, promote, compare, classify, workbook,
--                alerts, replies + job risk-alerts)
--   :02/:12/... document-worker (planilhas/relatórios semanais)
--   :05/:15/... mpp-worker (cronograma .mpp)
--   :01/:16/... gmail-sync
-- ---------------------------------------------------------------------
select cron.schedule('acc-weekly-all',      '*/10 * * * *',    $$select public.acc_scheduler_dispatch_workflow('weekly-all', '{"phase":"all"}'::jsonb)$$);
select cron.schedule('acc-document-worker', '2-59/10 * * * *', $$select public.acc_scheduler_dispatch_workflow('document-worker')$$);
select cron.schedule('acc-mpp-worker',      '5-59/10 * * * *', $$select public.acc_scheduler_dispatch_workflow('mpp-worker')$$);
select cron.schedule('acc-gmail-sync',      '1-59/15 * * * *', $$select public.acc_scheduler_dispatch_workflow('gmail-sync')$$);
select cron.schedule('acc-ssma-drive',      '0 */2 * * *',     $$select public.acc_scheduler_dispatch_workflow('ssma-drive')$$);
select cron.schedule('acc-construmanager',  '17 */6 * * *',    $$select public.acc_scheduler_dispatch_workflow('construmanager')$$);
select cron.schedule('acc-diario',          '43 0 * * *',      $$select public.acc_scheduler_dispatch_workflow('diario', '{"mode":"incremental"}'::jsonb)$$);
select cron.schedule('acc-watchdog',        '*/15 * * * *',    $$select public.acc_scheduler_watchdog()$$);
