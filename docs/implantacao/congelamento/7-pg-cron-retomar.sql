-- RETOMAR (fim da janela, DEPOIS de reverter o congelamento): restaura exatamente o estado salvo e apaga a tabela auxiliar.
-- Exige 6-pg-cron-pausar.sql executado antes (aborta se nao houver estado: nunca "ativa tudo" as cegas).
-- PAUSA AUTORIZADA (migration 20261213100000): fecha (resumed_at/resumed_by) as pausas autorizadas abertas dos jobs que voltaram a ficar
-- ativos. Jobs que continuam inativos mantem a pausa aberta (o watchdog segue acusando ao vencer). O registro nunca e apagado.
do $$
begin
  if to_regclass('public.acc_janela_cron_estado') is null then raise exception 'RETOMADA: sem estado guardado (acc_janela_cron_estado); nada foi alterado.'; end if;
  perform cron.alter_job(e.jobid, active := e.active) from public.acc_janela_cron_estado e;
  drop table public.acc_janela_cron_estado;
  if to_regclass('public.acc_scheduler_authorized_pauses') is not null then
    update public.acc_scheduler_authorized_pauses p
       set resumed_at = now(), resumed_by = session_user
     where p.resumed_at is null
       and exists (select 1 from cron.job j where j.jobname = p.jobname and j.active);
  end if;
end $$;
select jobname, active from cron.job order by jobid;  -- os 11 ativos, como antes
