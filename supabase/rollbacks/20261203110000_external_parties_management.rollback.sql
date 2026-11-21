-- ROLLBACK (manual, NÃO é migration) de 20261203110000_external_parties_management.sql. Remove apenas as funções; os dados permanecem.
begin;
drop function if exists public.acc_external_candidate_decide(uuid, uuid, text, uuid, text);
drop function if exists public.acc_external_candidate_register(uuid, text, uuid);
drop function if exists public.acc_external_link_save(uuid, jsonb, text);
drop function if exists public.acc_external_contact_set(uuid, uuid, text, text, text, text);
drop function if exists public.acc_external_domain_set(uuid, uuid, text, boolean, text);
drop function if exists public.acc_external_org_save(uuid, jsonb, text);
drop function if exists public.acc_external_audit_write(uuid, text, text, uuid, jsonb, jsonb, text);
drop function if exists public.acc_external_assert_manage(uuid);
commit;
