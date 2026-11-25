-- ROLLBACK (manual, NÃO é migration) de 20261125203000_insurance_advances_consolidated.sql. Somente leitura: nenhum dado é afetado.
begin;
drop function if exists public.insurance_advances_consolidated(uuid, uuid);
commit;
