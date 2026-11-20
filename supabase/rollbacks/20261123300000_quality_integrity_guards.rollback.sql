-- ROLLBACK (manual, NÃO é migration) de 20261123300000_quality_integrity_guards.sql. Só remove triggers/funções novos;
-- as colunas aditivas (cost_source_ref, accepted_evidence_id) ficam (não se apaga dado nem coluna).
drop trigger if exists quality_ncrs_state_guard_trg on public.quality_ncrs;
drop trigger if exists quality_warranty_cases_state_guard_trg on public.quality_warranty_cases;
drop trigger if exists quality_evidence_lock_trg on public.quality_evidence;
drop trigger if exists quality_evidence_nodelete_trg on public.quality_evidence;
drop function if exists public.quality_closure_integrity_report(uuid);
drop function if exists public.quality_ncr_state_guard();
drop function if exists public.quality_warranty_state_guard();
drop function if exists public.quality_evidence_lock();
