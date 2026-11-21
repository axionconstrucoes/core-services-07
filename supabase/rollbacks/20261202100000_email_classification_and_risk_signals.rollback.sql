-- Rollback da 20261202100000. Reversível antes do uso; depois, faça pg_dump das duas tabelas (derivadas, reproduzíveis pelo motor).
drop trigger if exists email_risk_signals_project_guard on public.email_risk_signals;
drop function if exists public.email_risk_signal_project_guard();
drop table if exists public.email_risk_signals;
drop table if exists public.email_message_classifications;
