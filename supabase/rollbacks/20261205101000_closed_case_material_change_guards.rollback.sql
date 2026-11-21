-- Rollback de 20261205101000_closed_case_material_change_guards.sql (Fase 5/E).
-- Complementos e eventos de reabertura são EVIDÊNCIA: o script RECUSA apagar se houver registro; exporte antes e decida.
do $$
begin
  if exists (select 1 from public.closed_case_complements) or exists (select 1 from public.insurance_claim_reopen_events) then
    raise exception 'ROLLBACK_BLOCKED: há complementos/reaberturas registrados; exporte-os (evidência) e remova manualmente com autorização';
  end if;
end $$;
drop trigger if exists quality_ncrs_closed_guard_trg on public.quality_ncrs;
drop trigger if exists quality_warranty_cases_closed_guard_trg on public.quality_warranty_cases;
drop trigger if exists quality_corrective_actions_closed_guard_trg on public.quality_corrective_actions;
drop trigger if exists quality_effectiveness_verifications_closed_guard_trg on public.quality_effectiveness_verifications;
drop trigger if exists quality_warranty_maintenance_closed_guard_trg on public.quality_warranty_maintenance;
drop trigger if exists quality_warranty_surveys_closed_guard_trg on public.quality_warranty_surveys;
drop trigger if exists quality_warranty_repairs_closed_guard_trg on public.quality_warranty_repairs;
drop trigger if exists quality_nonquality_costs_closed_guard_trg on public.quality_nonquality_costs;
drop trigger if exists insurance_claims_closed_guard_trg on public.insurance_claims;
drop trigger if exists insurance_claim_steps_closed_guard_trg on public.insurance_claim_steps;
drop function if exists public.quality_closed_case_parent_guard();
drop function if exists public.quality_closed_case_children_guard();
drop function if exists public.insurance_claim_closed_guard();
drop function if exists public.insurance_claim_steps_closed_guard();
drop function if exists public.insurance_claim_reopen(uuid, integer, text, text, text);
drop function if exists public.acc_closed_case_complement_add(uuid, text, uuid, text, text, text, uuid);
drop table if exists public.closed_case_complements;
drop table if exists public.insurance_claim_reopen_events;
