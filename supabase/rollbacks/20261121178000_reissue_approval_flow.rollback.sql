-- ROLLBACK (manual, NAO e migration) de 20261121178000_reissue_approval_flow.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop function if exists public.risk_alert_reissue_evaluate(uuid, uuid[]);
drop function if exists public.risk_alert_reissue_pending(uuid);
drop function if exists public.risk_alert_reissue_approve(uuid, uuid[], text);
commit;
