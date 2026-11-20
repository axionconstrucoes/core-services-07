-- ROLLBACK (manual, NÃO é migration; nunca aplicado automaticamente) de 20261123302000_quality_revoke_direct_writes.sql.
-- Devolve a `authenticated` exatamente os GRANTs da fase 1 (20261122100000). As policies nunca foram removidas.
do $$
declare t text;
begin
  foreach t in array array[
    'quality_requirements', 'quality_customer_complaints', 'quality_inspections', 'quality_tests',
    'quality_corrective_actions', 'quality_warranty_maintenance', 'quality_warranty_surveys', 'quality_warranty_repairs',
    'quality_recurrences', 'quality_nonquality_costs', 'quality_consequences']
  loop
    execute format('grant insert, update on table public.%I to authenticated', t);
  end loop;
end $$;
grant insert on table public.quality_evidence to authenticated;
grant update (classification, epistemic, description) on table public.quality_evidence to authenticated;
grant insert on table public.quality_effectiveness_verifications to authenticated;
grant update (title, description, responsible_user_id, due_date, root_cause, requirement_id) on table public.quality_ncrs to authenticated;
grant update (contract_ref, service_system, delivered_at, discovered_at, communicated_at, warranty_terms,
  warranty_terms_ref, customer_complaint, defect_description, cause_category, cause_notes, hidden_defect,
  solidity_safety, responsible_user_id, due_date, estimated_cost, actual_cost, supplier_name,
  supplier_warranty_until, builder_warranty_until, accepted_at, accepted_by_name, ncr_id)
  on table public.quality_warranty_cases to authenticated;
