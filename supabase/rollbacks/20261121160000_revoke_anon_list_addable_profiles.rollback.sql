-- ROLLBACK (manual, NAO e migration) de 20261121160000_revoke_anon_list_addable_profiles.sql (Fase 6/H5): NO-OP DELIBERADO.
-- A migration so ENDURECE ACL (revoga EXECUTE de anon/PUBLIC em list_addable_profiles_for_project); nao cria objetos nem altera dados. Reabrir anon/PUBLIC seria regressao de seguranca e
-- nao e feito por script de rollback. Se o Dono decidir reabrir, e uma mudanca nova, explicita e auditada (nao um rollback).
begin;
select 1;
commit;
