-- ROLLBACK (manual, NAO e migration) de 20261120110000_risk_case_sla_consistency_guards.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop trigger if exists email_alert_actions_risk_case_guard on public.email_alert_actions;
drop trigger if exists sla_actions_audit_deadline_changed on public.sla_actions;
drop function if exists public.email_alert_action_risk_case_guard();
drop function if exists public.audit_sla_action_deadline_changed();
commit;
