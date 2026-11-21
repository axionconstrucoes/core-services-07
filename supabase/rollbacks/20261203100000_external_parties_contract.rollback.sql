-- ROLLBACK (manual, NÃO é migration) de 20261203100000_external_parties_contract.sql.
-- ATENÇÃO: apaga organizações, contatos, vínculos, candidatos e a trilha de auditoria de contatos externos.
-- Faça backup antes (pg_dump -t public.external_*). Se a migration 20261203110000 foi aplicada, reverta-a ANTES.
drop function if exists public.acc_resolve_external_party(uuid, text);
drop table if exists public.external_contact_candidates;
drop table if exists public.external_org_project_links;
drop table if exists public.external_contacts;
drop table if exists public.external_org_domains;
drop table if exists public.external_organizations;
drop table if exists public.external_contacts_audit;
drop function if exists public.external_contacts_audit_guard();
drop function if exists public.acc_external_org_visible(uuid);
