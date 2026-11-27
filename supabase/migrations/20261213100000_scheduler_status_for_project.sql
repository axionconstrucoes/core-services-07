-- =====================================================================
-- Estado EFETIVO do agendador para a tela de Integrações / Dashboard.
-- NÃO APLICAR em produção sem aprovação explícita do responsável.
-- =====================================================================
-- Problema: a UI exibia apenas project_integrations.status (estado
-- declarado). Uma fonte "conectada" cujo job do pg_cron está pausado
-- aparecia como ATIVA. O schema cron não é exposto ao PostgREST e
-- acc_scheduler_heartbeats não tem grant para authenticated; esta função
-- SECURITY DEFINER expõe, SOMENTE LEITURA, o que a UI precisa:
--   * cron.job: jobname, schedule, active (NUNCA command — pode conter
--     chamadas com nomes de segredos);
--   * cron.job_run_details: último início/fim/estado, último sucesso e
--     última falha (agregado; sem return_message);
--   * acc_scheduler_heartbeats: kind, expected_interval e marcos
--     (despacho, início, fim, sucesso, falha, código da falha) — sem
--     target/secret_name;
--   * acc_janela_cron_estado (se existir): estado salvo pela janela de
--     congelamento, para explicar POR QUE um job está desligado;
--   * acc_system_health_incidents (SCHEDULER, OPEN) deste projeto.
-- Os jobs são globais (não pertencem a um projeto): qualquer membro
-- ativo do projeto informado pode lê-los; incidentes são filtrados pelo
-- projeto. Nenhuma escrita, nenhuma alteração de cron.
-- Reversão: drop function public.acc_scheduler_status_for_project(uuid);
-- =====================================================================

create or replace function public.acc_scheduler_status_for_project(p_project uuid)
returns table (
  jobname text,
  schedule text,
  active boolean,
  heartbeat_job text,
  kind text,
  expected_interval_seconds integer,
  last_dispatch_at timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_failure_code text,
  last_conclusion text,
  last_run_started_at timestamptz,
  last_run_ended_at timestamptz,
  last_run_status text,
  last_run_succeeded_at timestamptz,
  last_run_failed_at timestamptz,
  frozen_saved_active boolean,
  frozen_saved_at timestamptz,
  open_incidents integer,
  open_incident_summary text
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_has_cron boolean := to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null;
  v_janela text;
begin
  if p_project is null or auth.uid() is null or not public.is_project_member(p_project) then
    raise exception 'acc_scheduler_status_for_project: acesso negado' using errcode = '42501';
  end if;

  if not v_has_cron then
    -- pg_cron ausente neste ambiente: só os heartbeats (active = null => UI mostra "indisponível").
    return query
      select ('acc-' || h.job)::text, null::text, null::boolean, h.job, h.kind,
             extract(epoch from h.expected_interval)::integer,
             h.last_dispatch_at, h.last_started_at, h.last_finished_at, h.last_success_at, h.last_failure_at,
             h.last_failure_code, h.last_conclusion,
             null::timestamptz, null::timestamptz, null::text, null::timestamptz, null::timestamptz,
             null::boolean, null::timestamptz, 0, null::text
        from public.acc_scheduler_heartbeats h
       order by 1;
    return;
  end if;

  v_janela := case
    when to_regclass('public.acc_janela_cron_estado') is not null then
      'left join lateral (select w.active as saved_active, w.salvo_em as saved_at
                            from public.acc_janela_cron_estado w
                           where w.jobname = j.jobname
                           order by w.salvo_em desc nulls last
                           limit 1) w on true'
    else
      'left join lateral (select null::boolean as saved_active, null::timestamptz as saved_at) w on true'
  end;

  return query execute format($q$
    with runs as (
      select d.jobid,
             (array_agg(d.start_time order by d.runid desc))[1] as last_start,
             (array_agg(d.end_time   order by d.runid desc))[1] as last_end,
             (array_agg(d.status     order by d.runid desc))[1] as last_status,
             max(d.end_time) filter (where d.status = 'succeeded') as last_ok,
             max(coalesce(d.end_time, d.start_time)) filter (where d.status = 'failed') as last_fail
        from cron.job_run_details d
       group by d.jobid
    ),
    inc as (
      select split_part(i.fingerprint, ':', 2) as job,
             count(*)::integer as n,
             (array_agg(i.summary order by i.last_detected_at desc))[1] as summary
        from public.acc_system_health_incidents i
       where i.project_id = $1
         and i.source_type = 'SCHEDULER'
         and i.status = 'OPEN'
       group by 1
    )
    select j.jobname::text, j.schedule::text, j.active,
           h.job, h.kind,
           extract(epoch from h.expected_interval)::integer,
           h.last_dispatch_at, h.last_started_at, h.last_finished_at, h.last_success_at, h.last_failure_at,
           h.last_failure_code, h.last_conclusion,
           r.last_start, r.last_end, r.last_status::text, r.last_ok, r.last_fail,
           w.saved_active, w.saved_at,
           coalesce(inc.n, 0), inc.summary
      from cron.job j
      left join public.acc_scheduler_heartbeats h on 'acc-' || h.job = j.jobname
      left join runs r on r.jobid = j.jobid
      left join inc on inc.job = coalesce(h.job, substr(j.jobname, 5))
      %s
     where j.jobname like 'acc-%%'
     order by j.jobname
  $q$, v_janela)
  using p_project;
end;
$fn$;

comment on function public.acc_scheduler_status_for_project(uuid) is
  'Somente leitura: estado efetivo dos jobs acc-* (pg_cron + heartbeats + janela de congelamento + incidentes SCHEDULER do projeto). Exige membro ativo do projeto. Nunca retorna cron.job.command nem segredos — 20261213100000.';

revoke all on function public.acc_scheduler_status_for_project(uuid) from public, anon;
grant execute on function public.acc_scheduler_status_for_project(uuid) to authenticated;
