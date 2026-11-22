-- PAUSAR (inicio da janela, ANTES do congelamento do banco): guarda o estado e desativa os 11 jobs. Comprovado no acc-homolog (22/11/2026):
-- 0 execucoes em 4 min 27 s. Idempotente: se o estado ja foi guardado, NAO e sobrescrito (evita perder o "ativo" original).
-- Nao recupera execucoes perdidas (ver doc 16: os jobs sao varreduras idempotentes).
create table if not exists public.acc_janela_cron_estado as select jobid, jobname, active, now() as salvo_em from cron.job;
revoke all on public.acc_janela_cron_estado from public, anon, authenticated;  -- o padrao do Supabase concederia acesso pela API
alter table public.acc_janela_cron_estado enable row level security;
select count(cron.alter_job(jobid, active := false)) as jobs_pausados from cron.job;
select count(*) filter (where active) as ativos_esperado_0, (select count(*) from cron.job_run_details where status = 'running') as rodando_esperado_0 from cron.job;
