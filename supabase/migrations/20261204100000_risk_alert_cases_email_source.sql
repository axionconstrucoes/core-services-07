-- Fase 5 / Frente D: nova fonte de caso de risco "EMAIL" (sinais de risco de e-mails classificados pela Frente B).
-- Só amplia o CHECK de risk_alert_cases.source_type (SCHEDULE_COMPARISON | WEEKLY_REPORT_SHEET | INGESTION_ALERT | EMAIL).
-- NÃO redefine nenhuma função (record_risk_alert_action / proteção P0 intactas), NÃO altera SLA nem dados existentes.
-- Idempotente: localiza a constraint pela definição (independe do nome automático) e só troca se faltar EMAIL.
-- source_id continua uuid: para EMAIL é o id de email_risk_signals (um caso por sinal; rastreável até o e-mail original).
do $$
declare
  v_name text;
  v_def text;
begin
  select c.conname, pg_get_constraintdef(c.oid)
    into v_name, v_def
  from pg_constraint c
  where c.conrelid = 'public.risk_alert_cases'::regclass
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) like '%source_type%'
    and pg_get_constraintdef(c.oid) like '%INGESTION_ALERT%'
  limit 1;

  if v_name is not null and v_def like '%''EMAIL''%' then
    return; -- já ampliada
  end if;
  if v_name is not null then
    execute format('alter table public.risk_alert_cases drop constraint %I', v_name);
  end if;
  alter table public.risk_alert_cases
    add constraint risk_alert_cases_source_type_check
    check (source_type in ('SCHEDULE_COMPARISON', 'WEEKLY_REPORT_SHEET', 'INGESTION_ALERT', 'EMAIL'));
end $$;
