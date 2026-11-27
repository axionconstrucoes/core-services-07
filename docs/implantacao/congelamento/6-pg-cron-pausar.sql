-- PAUSAR (inicio da janela, ANTES do congelamento do banco): guarda o estado e desativa os 11 jobs. Comprovado no acc-homolog (22/11/2026):
-- 0 execucoes em 4 min 27 s. Idempotente: se o estado ja foi guardado, NAO e sobrescrito (evita perder o "ativo" original).
-- Nao recupera execucoes perdidas (ver doc 16: os jobs sao varreduras idempotentes).
-- PAUSA AUTORIZADA (migration 20261213100000): cada job ATIVO pausado aqui ganha um registro em public.acc_scheduler_authorized_pauses
-- (quem, motivo, vencimento em 3 horas). Sem esse registro o watchdog acusa JOB_INACTIVE_UNAUTHORIZED; vencido o prazo sem a retomada
-- (7-pg-cron-retomar.sql), acusa JOB_INACTIVE_AUTHORIZED_EXPIRED e a Diretoria e avisada por e-mail. Sem a tabela (migration nao aplicada), so pausa.
create table if not exists public.acc_janela_cron_estado as select jobid, jobname, active, now() as salvo_em from cron.job;
revoke all on public.acc_janela_cron_estado from public, anon, authenticated;  -- o padrao do Supabase concederia acesso pela API
alter table public.acc_janela_cron_estado enable row level security;
do $$
begin
  if to_regclass('public.acc_scheduler_authorized_pauses') is not null then
    insert into public.acc_scheduler_authorized_pauses (jobname, paused_by, reason, expires_at)
    select j.jobname, session_user, 'Janela de congelamento (docs/implantacao/congelamento/6-pg-cron-pausar.sql)', now() + interval '3 hours'
      from cron.job j
     where j.active and j.jobname like 'acc-%'
       and not exists (select 1 from public.acc_scheduler_authorized_pauses p where p.jobname = j.jobname and p.resumed_at is null);
  end if;
end $$;
select count(cron.alter_job(jobid, active := false)) as jobs_pausados from cron.job;
select count(*) filter (where active) as ativos_esperado_0, (select count(*) from cron.job_run_details where status = 'running') as rodando_esperado_0 from cron.job;
