-- Supervisao do agendador: nenhuma parada do pg_cron pode passar despercebida (incidente de 24/11/2026: 8 de 11 jobs ficaram com
-- active=false apos a janela de congelamento porque 7-pg-cron-retomar.sql nao foi executado; o watchdog nao olhava cron.job.active).
--
-- 1. public.acc_scheduler_authorized_pauses: registro EXPLICITO das paradas AUTORIZADAS (quem, por que, ate quando). Sem acesso
--    pela API (RLS sem politica; anon/authenticated sem privilegio); so service_role e o dono. Sem DELETE para service_role:
--    o registro e evidencia (a retomada so preenche resumed_at/resumed_by).
-- 2. public.acc_scheduler_watchdog(): NOVA versao que preserva INTEGRALMENTE o laco dos heartbeats (mesmos motivos, mesma resolucao
--    de projeto, mesmo upsert/resolucao) e acrescenta, quando o pg_cron existe:
--      JOB_INACTIVE_UNAUTHORIZED       job acc-* com active=false sem pausa autorizada aberta;
--      JOB_INACTIVE_AUTHORIZED_EXPIRED job inativo com pausa autorizada vencida (expires_at no passado);
--      JOB_PAUSED_AUTHORIZED           job inativo com pausa autorizada valida (INFORMATIVO: registrado, sem e-mail);
--      CONSECUTIVE_FAILURES            3 ultimas execucoes concluidas do job em cron.job_run_details com status 'failed';
--      IMPORT_STALE                    heartbeat gmail-sync sem sucesso ha mais de 2 horas (importacao de e-mails parada).
--    Fingerprint: 'scheduler:<job sem o prefixo acc->:<motivo>' (o mesmo nome dos heartbeats: acc-gmail-sync => gmail-sync).
--    NUNCA reativa job (nenhuma chamada a cron.alter_job/schedule/unschedule nesta migration).
-- 3. public.acc_scheduler_watchdog_liveness(): leitura SECURITY DEFINER (somente service_role) para a rota Vercel
--    /api/cron/system-health, independente do pg_cron: ultima execucao bem-sucedida do acc-watchdog, estado dos jobs e pausas.
--
-- Nao altera prazos, escalonamento, destinatarios nem agendamentos. Idempotente (if not exists / create or replace).
-- Rollback: supabase/rollbacks/20261213100000_scheduler_supervision_authorized_pauses.rollback.sql (preserva o registro de pausas).

create table if not exists public.acc_scheduler_authorized_pauses (
  id uuid primary key default gen_random_uuid(),
  jobname text not null check (jobname ~ '^acc-[a-z0-9-]+$'),
  paused_by text not null check (btrim(paused_by) <> '' and char_length(paused_by) <= 200),
  reason text not null check (btrim(reason) <> '' and char_length(reason) <= 1000),
  authorized_at timestamptz not null default now(),
  expires_at timestamptz check (expires_at is null or expires_at > authorized_at),
  resumed_at timestamptz check (resumed_at is null or resumed_at >= authorized_at),
  resumed_by text check (resumed_by is null or char_length(resumed_by) <= 200),
  created_at timestamptz not null default now()
);
-- No maximo UMA pausa aberta por job.
create unique index if not exists acc_scheduler_authorized_pauses_open_uidx
  on public.acc_scheduler_authorized_pauses (jobname) where resumed_at is null;
alter table public.acc_scheduler_authorized_pauses enable row level security;
revoke all on table public.acc_scheduler_authorized_pauses from public, anon, authenticated;
revoke all on table public.acc_scheduler_authorized_pauses from service_role;
grant select, insert, update on table public.acc_scheduler_authorized_pauses to service_role;

create or replace function public.acc_scheduler_watchdog()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.acc_scheduler_heartbeats%rowtype;
  v_project uuid;
  v_reason text;
  v_active text[];
  v_all text[] := array['DISPATCH_FAILED', 'DISPATCH_WITHOUT_START', 'STARTED_WITHOUT_FINISH', 'JOB_FAILED', 'ROUTE_FAILURE', 'NO_RECENT_SUCCESS'];
  v_neg timestamptz := '-infinity';
  -- Supervisao do pg_cron (20261213100000).
  v_cron_all text[] := array['JOB_INACTIVE_UNAUTHORIZED', 'JOB_INACTIVE_AUTHORIZED_EXPIRED', 'JOB_PAUSED_AUTHORIZED', 'CONSECUTIVE_FAILURES'];
  j record;
  v_job text;
  v_pause record;
  v_failed int;
  v_finished int;
  v_summary text;
  v_import_stale boolean;
begin
  for r in select * from public.acc_scheduler_heartbeats loop
    perform public.acc_scheduler_reconcile(r.job);
  end loop;

  -- Resolucao do projeto dos incidentes (project_id e NOT NULL com FK): o id fixo da obra WEG SE existir (producao identica);
  -- senao o projeto mais antigo; sem nenhum projeto, nao ha onde registrar incidente e retorna sem erro.
  select p.id into v_project from public.projects p where p.id = '00000000-0000-4000-8000-000000000001'::uuid;
  if v_project is null then
    select p.id into v_project from public.projects p order by p.start_date, p.id limit 1;
  end if;
  if v_project is null then
    return;
  end if;

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

  -- ---------------------------------------------------------------- IMPORT_STALE (gmail-sync sem sucesso ha mais de 2 h)
  select (h.last_success_at is null or h.last_success_at < now() - interval '2 hours') into v_import_stale
    from public.acc_scheduler_heartbeats h where h.job = 'gmail-sync';
  if coalesce(v_import_stale, false) then
    insert into public.acc_system_health_incidents (project_id, source_type, fingerprint, status, summary, first_detected_at, last_detected_at)
    values (v_project, 'SCHEDULER', 'scheduler:gmail-sync:IMPORT_STALE', 'OPEN',
            'Agendador gmail-sync: IMPORT_STALE (importação de e-mails sem sucesso há mais de 2 horas).', now(), now())
    on conflict (project_id, fingerprint) do update
      set status = 'OPEN', last_detected_at = now(), resolved_at = null, summary = excluded.summary;
  else
    update public.acc_system_health_incidents
       set status = 'RESOLVED', resolved_at = now()
     where project_id = v_project and fingerprint = 'scheduler:gmail-sync:IMPORT_STALE' and status = 'OPEN';
  end if;

  -- ---------------------------------------------------------------- estado dos jobs no pg_cron (somente leitura de cron.*)
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then
    return;
  end if;
  for j in select cj.jobid, cj.jobname, cj.active from cron.job cj where cj.jobname like 'acc-%' order by cj.jobid loop
    v_job := regexp_replace(j.jobname, '^acc-', '');
    v_active := array[]::text[];
    v_summary := null;
    select p.paused_by, p.reason, p.authorized_at, p.expires_at into v_pause
      from public.acc_scheduler_authorized_pauses p
     where p.jobname = j.jobname and p.resumed_at is null
     order by p.authorized_at desc limit 1;
    if not j.active then
      if v_pause.authorized_at is null then
        v_active := array_append(v_active, 'JOB_INACTIVE_UNAUTHORIZED');
        v_summary := 'Agendador ' || v_job || ': JOB_INACTIVE_UNAUTHORIZED (job ' || j.jobname || ' desativado no pg_cron SEM pausa autorizada registrada).';
      elsif v_pause.expires_at is not null and v_pause.expires_at < now() then
        v_active := array_append(v_active, 'JOB_INACTIVE_AUTHORIZED_EXPIRED');
        v_summary := 'Agendador ' || v_job || ': JOB_INACTIVE_AUTHORIZED_EXPIRED (pausa autorizada por ' || left(v_pause.paused_by, 80)
                     || ' venceu em ' || to_char(v_pause.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || ' e o job continua desativado).';
      else
        v_active := array_append(v_active, 'JOB_PAUSED_AUTHORIZED');
        v_summary := 'Agendador ' || v_job || ': JOB_PAUSED_AUTHORIZED (pausa autorizada por ' || left(v_pause.paused_by, 80) || ': '
                     || left(v_pause.reason, 200) || coalesce('; vence em ' || to_char(v_pause.expires_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), '; sem vencimento') || ').';
      end if;
    end if;

    select count(*) filter (where x.status = 'failed'), count(*) into v_failed, v_finished
      from (select d.status from cron.job_run_details d
             where d.jobid = j.jobid and d.status in ('succeeded', 'failed')
             order by d.start_time desc nulls last, d.runid desc limit 3) x;
    if v_finished = 3 and v_failed = 3 then
      v_active := array_append(v_active, 'CONSECUTIVE_FAILURES');
    end if;

    foreach v_reason in array v_cron_all loop
      if v_reason = any(v_active) then
        insert into public.acc_system_health_incidents (project_id, source_type, fingerprint, status, summary, first_detected_at, last_detected_at)
        values (v_project, 'SCHEDULER', 'scheduler:' || v_job || ':' || v_reason, 'OPEN',
                case when v_reason = 'CONSECUTIVE_FAILURES'
                     then 'Agendador ' || v_job || ': CONSECUTIVE_FAILURES (3 últimas execuções de ' || j.jobname || ' falharam no pg_cron).'
                     else v_summary end,
                now(), now())
        on conflict (project_id, fingerprint) do update
          set status = 'OPEN', last_detected_at = now(), resolved_at = null, summary = excluded.summary;
      else
        update public.acc_system_health_incidents
           set status = 'RESOLVED', resolved_at = now()
         where project_id = v_project and fingerprint = 'scheduler:' || v_job || ':' || v_reason and status = 'OPEN';
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on function public.acc_scheduler_watchdog() from public, anon, authenticated, service_role;

-- Prova de vida do supervisor, lida pela rota Vercel /api/cron/system-health (que NAO depende do pg_cron).
create or replace function public.acc_scheduler_watchdog_liveness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_watchdog jsonb := null;
  v_jobs jsonb := '[]'::jsonb;
begin
  select p.id into v_project from public.projects p where p.id = '00000000-0000-4000-8000-000000000001'::uuid;
  if v_project is null then
    select p.id into v_project from public.projects p order by p.start_date, p.id limit 1;
  end if;
  if to_regclass('cron.job') is null or to_regclass('cron.job_run_details') is null then
    return jsonb_build_object('checked_at', now(), 'cron_available', false, 'project_id', v_project, 'watchdog', null, 'jobs', '[]'::jsonb);
  end if;

  select jsonb_build_object(
           'jobname', cj.jobname,
           'active', cj.active,
           'last_success_at', (select max(d.end_time) from cron.job_run_details d where d.jobid = cj.jobid and d.status = 'succeeded'),
           'last_start_at', (select max(d.start_time) from cron.job_run_details d where d.jobid = cj.jobid),
           'last_status', (select d.status from cron.job_run_details d where d.jobid = cj.jobid order by d.start_time desc nulls last, d.runid desc limit 1))
    into v_watchdog
    from cron.job cj where cj.jobname = 'acc-watchdog' order by cj.jobid limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'jobname', cj.jobname,
           'active', cj.active,
           'pause_open', p.id is not null,
           'pause_expires_at', p.expires_at,
           'pause_paused_by', left(p.paused_by, 80)) order by cj.jobid), '[]'::jsonb)
    into v_jobs
    from cron.job cj
    left join lateral (select ap.id, ap.expires_at, ap.paused_by from public.acc_scheduler_authorized_pauses ap
                        where ap.jobname = cj.jobname and ap.resumed_at is null order by ap.authorized_at desc limit 1) p on true
   where cj.jobname like 'acc-%';

  return jsonb_build_object('checked_at', now(), 'cron_available', true, 'project_id', v_project, 'watchdog', v_watchdog, 'jobs', v_jobs);
end;
$$;
revoke all on function public.acc_scheduler_watchdog_liveness() from public, anon, authenticated;
grant execute on function public.acc_scheduler_watchdog_liveness() to service_role;
