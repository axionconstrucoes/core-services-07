-- ROLLBACK (manual, NAO e migration) de 20261123402000_f3e_insurance_persistence_rpcs.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop function if exists public.insurance_rcc_checklist_save(uuid, uuid, jsonb, integer, text);
drop function if exists public.insurance_rcc_checklist_get(uuid, uuid);
drop function if exists public.insurance_expected_subject_save(uuid, jsonb, integer);
drop function if exists public.insurance_expected_subjects_get(uuid);
commit;
