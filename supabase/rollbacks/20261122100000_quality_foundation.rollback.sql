-- ROLLBACK (manual, NAO e migration) de 20261122100000_quality_foundation.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.quality_counters') is not null then
    select count(*) into n from public.quality_counters;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_counters tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_requirements') is not null then
    select count(*) into n from public.quality_requirements;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_requirements tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_ncrs') is not null then
    select count(*) into n from public.quality_ncrs;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_ncrs tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_warranty_cases') is not null then
    select count(*) into n from public.quality_warranty_cases;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_cases tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_customer_complaints') is not null then
    select count(*) into n from public.quality_customer_complaints;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_customer_complaints tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_inspections') is not null then
    select count(*) into n from public.quality_inspections;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_inspections tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_tests') is not null then
    select count(*) into n from public.quality_tests;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_tests tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_evidence') is not null then
    select count(*) into n from public.quality_evidence;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_evidence tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_corrective_actions') is not null then
    select count(*) into n from public.quality_corrective_actions;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_corrective_actions tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_warranty_maintenance') is not null then
    select count(*) into n from public.quality_warranty_maintenance;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_maintenance tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_warranty_surveys') is not null then
    select count(*) into n from public.quality_warranty_surveys;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_surveys tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_warranty_repairs') is not null then
    select count(*) into n from public.quality_warranty_repairs;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_repairs tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_effectiveness_verifications') is not null then
    select count(*) into n from public.quality_effectiveness_verifications;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_effectiveness_verifications tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_recurrences') is not null then
    select count(*) into n from public.quality_recurrences;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_recurrences tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_nonquality_costs') is not null then
    select count(*) into n from public.quality_nonquality_costs;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_nonquality_costs tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_consequences') is not null then
    select count(*) into n from public.quality_consequences;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_consequences tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_state_transitions') is not null then
    select count(*) into n from public.quality_state_transitions where false; -- seed de referencia da propria migration (matriz de transicoes, regenerada ao reaplicar); nao e evidencia
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_state_transitions tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.quality_state_events') is not null then
    select count(*) into n from public.quality_state_events;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_state_events tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.quality_state_events;
drop table if exists public.quality_state_transitions;
drop table if exists public.quality_consequences;
drop table if exists public.quality_nonquality_costs;
drop table if exists public.quality_recurrences;
drop table if exists public.quality_effectiveness_verifications;
drop table if exists public.quality_warranty_repairs;
drop table if exists public.quality_warranty_surveys;
drop table if exists public.quality_warranty_maintenance;
drop table if exists public.quality_corrective_actions;
drop table if exists public.quality_evidence;
drop table if exists public.quality_tests;
drop table if exists public.quality_inspections;
drop table if exists public.quality_customer_complaints;
drop table if exists public.quality_warranty_cases;
drop table if exists public.quality_ncrs;
drop table if exists public.quality_requirements;
drop table if exists public.quality_counters;
drop function if exists public.quality_role_for(uuid);
drop function if exists public.quality_can_read(uuid);
drop function if exists public.quality_can_register(uuid);
drop function if exists public.quality_can_manage(uuid);
drop function if exists public.quality_next_code(uuid, text);
drop function if exists public.quality_prevent_mutation();
drop function if exists public.quality_touch();
drop function if exists public.quality_audit_row();
drop function if exists public.quality_evidence_guard();
drop function if exists public.quality_verification_guard();
drop function if exists public.quality_verification_immutable();
drop function if exists public.quality_criticality_rank(text);
drop function if exists public.quality_compute_criticality(uuid, uuid);
drop function if exists public.quality_consequence_sync();
drop index if exists public.quality_ncrs_origin_active_uq;
drop index if exists public.quality_ncrs_project_state_idx;
drop index if exists public.quality_warranty_project_state_idx;
drop index if exists public.quality_evidence_ncr_source_uq;
drop index if exists public.quality_evidence_warranty_source_uq;
drop index if exists public.quality_evidence_project_idx;
drop index if exists public.quality_actions_ncr_idx;
drop index if exists public.quality_verif_ncr_idx;
drop index if exists public.quality_verif_warranty_idx;
drop index if exists public.quality_conseq_ncr_idx;
drop index if exists public.quality_conseq_warranty_idx;
drop index if exists public.quality_state_events_entity_idx;
commit;
