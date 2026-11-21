-- ROLLBACK (manual, NAO e migration) de 20261123400000_f3e_persistence_model.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.quality_warranty_coverage_opinions') is not null then
    select count(*) into n from public.quality_warranty_coverage_opinions;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.quality_warranty_coverage_opinions tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_rcc_checklists') is not null then
    select count(*) into n from public.insurance_rcc_checklists;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_rcc_checklists tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_rcc_checklist_items') is not null then
    select count(*) into n from public.insurance_rcc_checklist_items;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_rcc_checklist_items tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_expected_subjects') is not null then
    select count(*) into n from public.insurance_expected_subjects;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_expected_subjects tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.insurance_expected_subjects;
drop table if exists public.insurance_rcc_checklist_items;
drop table if exists public.insurance_rcc_checklists;
drop table if exists public.quality_warranty_coverage_opinions;
drop function if exists public.f3e_block_mutation();
drop index if exists public.quality_warranty_opinions_case_idx;
drop index if exists public.quality_warranty_opinions_project_idx;
drop index if exists public.insurance_rcc_checklists_scope_version_uq;
drop index if exists public.insurance_rcc_checklists_policy_idx;
drop index if exists public.insurance_rcc_items_checklist_idx;
drop index if exists public.insurance_expected_subjects_policy_idx;
commit;
