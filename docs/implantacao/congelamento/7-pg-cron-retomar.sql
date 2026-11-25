-- RETOMAR (fim da janela, DEPOIS de reverter o congelamento): restaura exatamente o estado salvo e apaga a tabela auxiliar.
-- Exige 6-pg-cron-pausar.sql executado antes (aborta se nao houver estado: nunca "ativa tudo" as cegas).
do $$
begin
  if to_regclass('public.acc_janela_cron_estado') is null then raise exception 'RETOMADA: sem estado guardado (acc_janela_cron_estado); nada foi alterado.'; end if;
  perform cron.alter_job(e.jobid, active := e.active) from public.acc_janela_cron_estado e;
  drop table public.acc_janela_cron_estado;
end $$;
select jobname, active from cron.job order by jobid;  -- os 11 ativos, como antes
