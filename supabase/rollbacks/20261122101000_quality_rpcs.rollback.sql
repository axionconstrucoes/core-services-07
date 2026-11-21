-- ROLLBACK (manual, NAO e migration) de 20261122101000_quality_rpcs.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop trigger if exists quality_requirements_code on public.quality_requirements;
drop trigger if exists quality_customer_complaints_code on public.quality_customer_complaints;
drop trigger if exists quality_inspections_code on public.quality_inspections;
drop trigger if exists quality_tests_code on public.quality_tests;
drop function if exists public.quality_assign_code();
drop function if exists public.quality_origin_key(text, text);
drop function if exists public.quality_transition_blockers(text, uuid, text);
drop function if exists public.quality_closure_readiness(text, uuid);
drop function if exists public.quality_alert_resolved_guard(text, uuid);
drop function if exists public.quality_transition_core(text, uuid, text, integer, text, uuid[], uuid);
drop function if exists public.quality_ncr_transition(uuid, text, integer, text, uuid[], uuid);
drop function if exists public.quality_warranty_transition(uuid, text, integer, text, uuid[]);
drop function if exists public.quality_ncr_create(uuid, text, text, text, text, text, uuid, uuid);
drop function if exists public.quality_warranty_create(uuid, text, text, jsonb);
drop function if exists public.quality_find_by_origin(uuid, text, text);
drop function if exists public.quality_warranty_maintenance_status(uuid);
drop index if exists public.quality_warranty_origin_active_uq;
commit;
