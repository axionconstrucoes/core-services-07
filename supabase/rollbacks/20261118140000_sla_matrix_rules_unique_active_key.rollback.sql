-- ROLLBACK (manual, NAO e migration) de 20261118140000_sla_matrix_rules_unique_active_key.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop index if exists public.sla_matrix_rules_active_key_unique;  -- indice parcial criado pela migration (so aviso quando havia duplicatas)
commit;
