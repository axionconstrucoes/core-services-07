-- ROLLBACK (manual, NAO e migration) de 20261122200000_seguros_garantias_model.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.insurance_audit_events') is not null then
    select count(*) into n from public.insurance_audit_events;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_audit_events tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_settings') is not null then
    select count(*) into n from public.insurance_settings;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_settings tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_policies') is not null then
    select count(*) into n from public.insurance_policies;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_policies tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_policy_versions') is not null then
    select count(*) into n from public.insurance_policy_versions;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_policy_versions tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_policy_parties') is not null then
    select count(*) into n from public.insurance_policy_parties;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_policy_parties tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_policy_clauses') is not null then
    select count(*) into n from public.insurance_policy_clauses;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_policy_clauses tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.bank_guarantees') is not null then
    select count(*) into n from public.bank_guarantees;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.bank_guarantees tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.other_guarantees') is not null then
    select count(*) into n from public.other_guarantees;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.other_guarantees tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_official_channels') is not null then
    select count(*) into n from public.insurance_official_channels;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_official_channels tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_endorsements') is not null then
    select count(*) into n from public.insurance_endorsements;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_endorsements tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_advances') is not null then
    select count(*) into n from public.insurance_advances;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_advances tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_advance_amortizations') is not null then
    select count(*) into n from public.insurance_advance_amortizations;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_advance_amortizations tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_claims') is not null then
    select count(*) into n from public.insurance_claims;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_claims tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_claim_steps') is not null then
    select count(*) into n from public.insurance_claim_steps;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_claim_steps tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_dossier_items') is not null then
    select count(*) into n from public.insurance_dossier_items;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_dossier_items tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_drafts') is not null then
    select count(*) into n from public.insurance_drafts;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_drafts tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.insurance_drafts;
drop table if exists public.insurance_dossier_items;
drop table if exists public.insurance_claim_steps;
drop table if exists public.insurance_claims;
drop table if exists public.insurance_advance_amortizations;
drop table if exists public.insurance_advances;
drop table if exists public.insurance_endorsements;
drop table if exists public.insurance_official_channels;
drop table if exists public.other_guarantees;
drop table if exists public.bank_guarantees;
drop table if exists public.insurance_policy_clauses;
drop table if exists public.insurance_policy_parties;
drop table if exists public.insurance_policy_versions;
drop table if exists public.insurance_policies;
drop table if exists public.insurance_settings;
drop table if exists public.insurance_audit_events;
drop function if exists public.insurance_access(uuid, text);
drop function if exists public.insurance_block_mutation();
drop index if exists public.insurance_audit_events_project_idx;
drop index if exists public.insurance_audit_events_entity_idx;
drop index if exists public.insurance_policies_project_idx;
drop index if exists public.insurance_policies_end_idx;
drop index if exists public.insurance_policy_parties_policy_idx;
drop index if exists public.insurance_policy_clauses_policy_idx;
drop index if exists public.bank_guarantees_project_idx;
drop index if exists public.other_guarantees_project_idx;
drop index if exists public.insurance_official_channels_project_idx;
drop index if exists public.insurance_endorsements_policy_idx;
drop index if exists public.insurance_advances_project_idx;
drop index if exists public.insurance_advance_amort_idx;
drop index if exists public.insurance_claims_project_idx;
drop index if exists public.insurance_claim_steps_claim_idx;
drop index if exists public.insurance_drafts_project_idx;
commit;
