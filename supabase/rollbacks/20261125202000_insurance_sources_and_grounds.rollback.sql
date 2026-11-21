-- ROLLBACK (manual, NÃO é migration) de 20261125202000_insurance_sources_and_grounds.sql.
-- ATENÇÃO: apaga o histórico append-only de atualizações de fiança/caução e a coluna source_refs dos passos de sinistro.
-- Faça backup antes (pg_dump -t public.insurance_guarantee_updates; select id, source_refs from public.insurance_claim_steps).
-- bank_guarantee_update / other_guarantee_update voltam ao corpo de 20261122201000 e insurance_claim_advance ao corpo de 20261123102000
-- (copie-os dos arquivos originais e execute).
drop table if exists public.insurance_guarantee_updates;
alter table public.insurance_claim_steps drop column if exists source_refs;
