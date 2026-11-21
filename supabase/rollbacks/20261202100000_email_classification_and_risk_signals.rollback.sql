-- ROLLBACK (manual, NAO e migration) de 20261202100000_email_classification_and_risk_signals.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.email_message_classifications') is not null then
    select count(*) into n from public.email_message_classifications;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_message_classifications tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.email_risk_signals') is not null then
    select count(*) into n from public.email_risk_signals;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_risk_signals tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.email_risk_signals;
drop table if exists public.email_message_classifications;
drop function if exists public.email_risk_signal_project_guard();
drop index if exists public.email_message_classifications_project_idx;
drop index if exists public.email_risk_signals_project_idx;
drop index if exists public.email_risk_signals_email_idx;
commit;
