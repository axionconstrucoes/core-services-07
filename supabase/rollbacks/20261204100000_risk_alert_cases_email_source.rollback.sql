-- ROLLBACK (manual, NÃO é migration) de 20261204100000_risk_alert_cases_email_source.sql.
-- Recusa-se a voltar se já existirem casos de origem EMAIL (evidência/rastreabilidade: nada é apagado aqui).
-- Para reverter com casos EMAIL existentes, exporte-os (pg_dump -t public.risk_alert_cases) e decida com o dono.
begin;
do $$
begin
  if exists (select 1 from public.risk_alert_cases where source_type = 'EMAIL') then
    raise exception 'ROLLBACK_BLOCKED: existem casos de risco com source_type EMAIL; nada foi alterado';
  end if;
  alter table public.risk_alert_cases drop constraint if exists risk_alert_cases_source_type_check;
  alter table public.risk_alert_cases
    add constraint risk_alert_cases_source_type_check
    check (source_type in ('SCHEDULE_COMPARISON', 'WEEKLY_REPORT_SHEET', 'INGESTION_ALERT'));
end $$;
commit;
