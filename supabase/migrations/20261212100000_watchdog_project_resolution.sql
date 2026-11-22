-- Watchdog do agendador: resolucao do projeto dos incidentes (corrige falha de FK em ambientes sem a obra WEG fixa).
-- Antes: v_project fixo 00000000-0000-4000-8000-000000000001 (obra WEG de producao). Em ambiente sem essa obra (ex.: acc-homolog) o INSERT em
-- public.acc_system_health_incidents violava a FK (project_id NOT NULL -> projects.id) e o job acc-watchdog falhava a cada 5 min.
-- Agora: o id fixo SE existir em public.projects (producao: comportamento IDENTICO); senao o projeto mais antigo (start_date, id; public.projects nao tem created_at);
-- sem nenhum projeto, nao registra incidente e retorna sem erro. Restante da logica, SLA, P0 e historico: inalterados.
-- Rollback: supabase/rollbacks/20261212100000_watchdog_project_resolution.rollback.sql. Idempotente (create or replace).

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
end;
$$;
revoke all on function public.acc_scheduler_watchdog() from public, anon, authenticated, service_role;
