-- ROLLBACK (manual, NAO e migration) de 20261120100000_sla_action_operations_by_responsible.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop function if exists public.sla_action_authorize_operation(uuid, text);
drop function if exists public.sla_action_assume(uuid);
drop function if exists public.sla_action_start(uuid);
drop function if exists public.sla_action_complete(uuid, text, uuid, uuid);
drop function if exists public.sla_action_forward(uuid, uuid, text);
commit;
