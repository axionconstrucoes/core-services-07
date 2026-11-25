-- ROLLBACK (manual, NAO e migration) de 20261116090000_list_addable_profiles_for_project.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop function if exists public.list_addable_profiles_for_project(uuid);
commit;
