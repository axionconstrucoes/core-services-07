-- ROLLBACK (manual, NÃO é migration) de 20261125201000_insurance_subjects_rcc_clause_id.sql.
-- As colunas tax_id_normalized e clause_identifier guardam dado derivado/novo: faça backup antes de removê-las.
-- insurance_policy_clause_add volta ao corpo de 20261122201000 (copie-o do arquivo original e execute).
drop trigger if exists insurance_party_guard_upd on public.insurance_policy_parties;
drop trigger if exists insurance_party_guard_ins on public.insurance_policy_parties;
drop function if exists public.insurance_party_guard();
drop trigger if exists insurance_expected_subject_guard_trg on public.insurance_expected_subjects;
drop function if exists public.insurance_expected_subject_guard();
drop function if exists public.insurance_rcc_readiness(uuid, uuid);
drop function if exists public.insurance_tax_id_valid(text);
alter table public.insurance_policy_parties drop column if exists tax_id_normalized;
alter table public.insurance_policy_clauses drop column if exists clause_identifier;
