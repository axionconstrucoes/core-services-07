-- ROLLBACK (manual, NAO e migration) de 20261123401000_f3e_warranty_opinion_rpcs.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop function if exists public.quality_warranty_coverage_check(jsonb, jsonb);
drop function if exists public.quality_warranty_opinion_save(uuid, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, text, integer, text);
drop function if exists public.quality_warranty_opinion_versions(uuid);
commit;
