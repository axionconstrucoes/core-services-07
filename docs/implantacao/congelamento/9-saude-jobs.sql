-- SAUDE DOS JOBS pg_cron (SOMENTE LEITURA): execucoes, falhas e ultima execucao por job nos ultimos 25 minutos.
select j.jobname, j.active,
       count(d.*) filter (where d.start_time > now() - interval '25 minutes')::int as execs_25min,
       count(d.*) filter (where d.start_time > now() - interval '25 minutes' and d.status = 'failed')::int as falhas_25min,
       max(d.start_time) as ultima_execucao
  from cron.job j left join cron.job_run_details d on d.jobid = j.jobid
 group by j.jobname, j.active
 order by falhas_25min desc, j.jobname;
