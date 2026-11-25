-- ROLLBACK (manual, NÃO é migration) de 20261123300000_quality_integrity_guards.sql. Só remove triggers/funções novos;
-- H5: as colunas aditivas (cost_source_ref, accepted_evidence_id), a FK e o indice tambem saem, mas SO se nao houver valor gravado (guarda ROLLBACK_BLOCKED).
begin;
drop trigger if exists quality_ncrs_state_guard_trg on public.quality_ncrs;
drop trigger if exists quality_warranty_cases_state_guard_trg on public.quality_warranty_cases;
drop trigger if exists quality_evidence_lock_trg on public.quality_evidence;
drop trigger if exists quality_evidence_nodelete_trg on public.quality_evidence;
drop function if exists public.quality_closure_integrity_report(uuid);
drop function if exists public.quality_ncr_state_guard();
drop function if exists public.quality_warranty_state_guard();
drop function if exists public.quality_evidence_lock();
do $$
declare n bigint;
begin
  if to_regclass('public.quality_warranty_cases') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quality_warranty_cases' and column_name = 'accepted_evidence_id') then
    select count(*) into n from public.quality_warranty_cases where accepted_evidence_id is not null or cost_source_ref is not null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: quality_warranty_cases tem % linha(s) com accepted_evidence_id/cost_source_ref (dado); nada foi alterado', n; end if;
  end if;
  if to_regclass('public.quality_warranty_repairs') is not null and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'quality_warranty_repairs' and column_name = 'cost_source_ref') then
    select count(*) into n from public.quality_warranty_repairs where cost_source_ref is not null;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: quality_warranty_repairs tem % linha(s) com cost_source_ref (dado); nada foi alterado', n; end if;
  end if;
end $$;
alter table if exists public.quality_warranty_cases drop constraint if exists quality_warranty_cases_accepted_evidence_fk;
drop index if exists public.quality_state_events_evidence_gin;
alter table if exists public.quality_warranty_cases drop column if exists cost_source_ref;
alter table if exists public.quality_warranty_cases drop column if exists accepted_evidence_id;
alter table if exists public.quality_warranty_repairs drop column if exists cost_source_ref;
commit;
