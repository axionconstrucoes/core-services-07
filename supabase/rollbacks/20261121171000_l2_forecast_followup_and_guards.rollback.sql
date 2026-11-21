-- ROLLBACK (manual, NAO e migration) de 20261121171000_l2_forecast_followup_and_guards.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.sla_action_followup_events') is not null then
    select count(*) into n from public.sla_action_followup_events;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.sla_action_followup_events tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.sla_followup_policy') is not null then
    select count(*) into n from public.sla_followup_policy;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.sla_followup_policy tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop trigger if exists risk_alert_action_events_forecast_audit on public.risk_alert_action_events;
drop trigger if exists sla_actions_closed_risk_case_escalation_guard on public.sla_actions;
drop view if exists public.sla_followup_consistency_issues;
drop table if exists public.sla_followup_policy;
drop table if exists public.sla_action_followup_events;
drop function if exists public.sla_followup_notification_allowed(uuid);
drop function if exists public.sla_action_record_forecast_core(uuid, uuid, timestamp with time zone, text, text, text, boolean);
drop function if exists public.sla_action_record_forecast(uuid, timestamp with time zone, text);
drop function if exists public.sla_action_progress_with_forecast_by_email(uuid, uuid, text, timestamp with time zone, text);
drop function if exists public.sla_followup_overdue_forecasts(timestamp with time zone);
drop function if exists public.sla_followup_run(timestamp with time zone);
drop function if exists public.risk_alert_action_event_forecast_audit();
drop function if exists public.sla_action_closed_risk_case_escalation_guard();
drop index if exists public.sla_action_followup_overdue_once_uidx;
drop index if exists public.sla_action_followup_message_uidx;
drop index if exists public.sla_action_followup_action_idx;
commit;
