-- ROLLBACK (manual, NÃO é migration) de 20261125100000_warranty_acceptance_proof.sql.
-- ATENÇÃO: apaga o histórico append-only de aceites (quality_warranty_acceptances). Faça backup antes
-- (pg_dump -t public.quality_warranty_acceptances). Depois do rollback o encerramento volta a exigir apenas accepted_at/accepted_by_name:
-- reaplique as definições de quality_transition_blockers (20261122101000), quality_warranty_state_guard (20261123300000) e
-- quality_warranty_acceptance_register (20261123301000) a partir dos arquivos originais (copie o corpo de cada um e execute).
drop function if exists public.quality_warranty_acceptances_list(uuid);
drop function if exists public.quality_warranty_acceptance_prove(uuid, integer, date, text, text, text, uuid, text, text);
alter table public.quality_warranty_cases drop constraint if exists quality_warranty_cases_current_acceptance_fk;
alter table public.quality_warranty_cases drop constraint if exists quality_warranty_cases_acceptance_status_chk;
alter table public.quality_warranty_cases drop column if exists current_acceptance_id;
alter table public.quality_warranty_cases drop column if exists acceptance_status;
drop table if exists public.quality_warranty_acceptances;
-- f4b_block_mutation() é compartilhada com as demais migrations 20261125*: remova só se nenhuma outra a usar.
