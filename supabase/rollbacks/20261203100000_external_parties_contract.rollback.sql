-- ROLLBACK (manual, NAO e migration) de 20261203100000_external_parties_contract.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.external_organizations') is not null then
    select count(*) into n from public.external_organizations;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_organizations tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.external_org_domains') is not null then
    select count(*) into n from public.external_org_domains;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_org_domains tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.external_contacts') is not null then
    select count(*) into n from public.external_contacts;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_contacts tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.external_org_project_links') is not null then
    select count(*) into n from public.external_org_project_links;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_org_project_links tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.external_contact_candidates') is not null then
    select count(*) into n from public.external_contact_candidates;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_contact_candidates tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.external_contacts_audit') is not null then
    select count(*) into n from public.external_contacts_audit;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_contacts_audit tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.external_contacts_audit;
drop table if exists public.external_contact_candidates;
drop table if exists public.external_org_project_links;
drop table if exists public.external_contacts;
drop table if exists public.external_org_domains;
drop table if exists public.external_organizations;
drop function if exists public.external_contacts_audit_guard();
drop function if exists public.acc_external_org_visible(uuid);
drop function if exists public.acc_resolve_external_party(uuid, text);
drop index if exists public.external_organizations_tax_id_uidx;
drop index if exists public.external_org_domains_domain_idx;
drop index if exists public.external_contacts_email_idx;
drop index if exists public.external_org_project_links_uidx;
drop index if exists public.external_org_project_links_project_idx;
drop index if exists public.external_contact_candidates_status_idx;
drop index if exists public.external_contacts_audit_project_idx;
commit;
