-- Rollback de 20261209101000_external_org_global_admin_and_change_requests.sql (Fase 6/H2b).
-- Restaura as três RPCs ao corpo da migration 20261203110000 (gestão por GESTOR/GERENTE/ADMIN) e remove as solicitações.
-- As solicitações são EVIDÊNCIA de auditoria: o script RECUSA apagar se houver registro; exporte antes e decida com autorização.
-- funcao TEMPORARIA (pg_temp; some ao fim da sessao): torna a guarda idempotente (tabela ja removida => sem linhas)
begin;
create or replace function pg_temp.rb_has_rows(p_table text, p_where text default 'true') returns boolean
language plpgsql as $f$
declare r boolean;
begin
  if to_regclass('public.' || p_table) is null then return false; end if;
  execute format('select exists (select 1 from public.%I where %s)', p_table, p_where) into r;
  return r;
exception when undefined_column then return false;
end $f$;
do $$
begin
  if pg_temp.rb_has_rows('external_org_change_requests') then
    raise exception 'ROLLBACK_BLOCKED: há solicitações de alteração registradas; exporte-as (evidência) e remova manualmente com autorização';
  end if;
end $$;
drop function if exists public.acc_external_change_request(uuid, text, uuid, jsonb, text);
drop function if exists public.acc_external_change_decide(uuid, text, text);
drop function if exists public.acc_external_change_cancel(uuid, text);
drop table if exists public.external_org_change_requests;

-- ------------------------------------------------------------
-- Organização (cria ou atualiza) — agora somente ADMINISTRADOR. p_org: {id?, legal_name, tax_id?, org_kind, notes?}
-- ------------------------------------------------------------
create or replace function public.acc_external_org_save(p_project_id uuid, p_org jsonb, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_org ->> 'id', '')::uuid;
  v_before jsonb;
  v_row public.external_organizations;
begin
  perform public.acc_external_assert_manage(p_project_id);
  if v_id is null then
    insert into public.external_organizations (legal_name, tax_id, org_kind, notes, created_by)
    values (btrim(p_org ->> 'legal_name'), nullif(btrim(p_org ->> 'tax_id'), ''), p_org ->> 'org_kind', nullif(btrim(p_org ->> 'notes'), ''), auth.uid())
    returning * into v_row;
    perform public.acc_external_audit_write(p_project_id, 'ORG_CREATE', 'ORGANIZATION', v_row.id, null, to_jsonb(v_row), p_reason);
  else
    if not public.acc_external_org_visible(v_id) then raise exception 'FORBIDDEN: organização fora do alcance do usuário'; end if;
    select to_jsonb(o) into v_before from public.external_organizations o where o.id = v_id;
    if v_before is null then raise exception 'NOT_FOUND: organização inexistente'; end if;
    update public.external_organizations o set
      legal_name = coalesce(nullif(btrim(p_org ->> 'legal_name'), ''), o.legal_name),
      tax_id = case when p_org ? 'tax_id' then nullif(btrim(p_org ->> 'tax_id'), '') else o.tax_id end,
      org_kind = coalesce(nullif(p_org ->> 'org_kind', ''), o.org_kind),
      notes = case when p_org ? 'notes' then nullif(btrim(p_org ->> 'notes'), '') else o.notes end
    where o.id = v_id returning * into v_row;
    perform public.acc_external_audit_write(p_project_id, 'ORG_UPDATE', 'ORGANIZATION', v_id, v_before, to_jsonb(v_row), p_reason);
  end if;
  return v_row.id;
end;
$$;

create or replace function public.acc_external_domain_set(p_project_id uuid, p_org_id uuid, p_domain text, p_active boolean default true, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := lower(btrim(p_domain));
  v_row public.external_org_domains;
  v_shared boolean;
begin
  perform public.acc_external_assert_manage(p_project_id);
  if not public.acc_external_org_visible(p_org_id) then raise exception 'FORBIDDEN: organização fora do alcance do usuário'; end if;
  if v_domain is null or v_domain !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' then raise exception 'INVALID_DOMAIN'; end if;
  insert into public.external_org_domains (organization_id, domain, active)
  values (p_org_id, v_domain, coalesce(p_active, true))
  on conflict (organization_id, domain) do update set active = excluded.active
  returning * into v_row;
  select count(distinct d.organization_id) > 1 into v_shared from public.external_org_domains d where d.domain = v_domain and d.active;
  perform public.acc_external_audit_write(p_project_id, case when v_row.active then 'DOMAIN_SET_ACTIVE' else 'DOMAIN_SET_INACTIVE' end,
    'DOMAIN', v_row.id, null, to_jsonb(v_row) || jsonb_build_object('domain_shared', v_shared), p_reason);
  return jsonb_build_object('id', v_row.id, 'domain_shared', v_shared);
end;
$$;

create or replace function public.acc_external_contact_set(p_project_id uuid, p_org_id uuid, p_email text, p_display_name text, p_status text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.acc_email_normalize(p_email);
  v_before jsonb;
  v_row public.external_contacts;
begin
  perform public.acc_external_assert_manage(p_project_id);
  if v_email is null then raise exception 'INVALID_EMAIL'; end if;
  if p_status not in ('CONFIRMED', 'CANDIDATE', 'REJECTED') then raise exception 'INVALID_STATUS'; end if;
  if not public.acc_external_org_visible(p_org_id) then raise exception 'FORBIDDEN: organização fora do alcance do usuário'; end if;
  select to_jsonb(c) into v_before from public.external_contacts c where c.organization_id = p_org_id and c.email = v_email;
  insert into public.external_contacts (organization_id, email, display_name, status)
  values (p_org_id, v_email, nullif(btrim(p_display_name), ''), p_status)
  on conflict (organization_id, email) do update
    set status = excluded.status, display_name = coalesce(excluded.display_name, public.external_contacts.display_name)
  returning * into v_row;
  perform public.acc_external_audit_write(p_project_id, 'CONTACT_SET_' || p_status, 'CONTACT', v_row.id, v_before, to_jsonb(v_row), p_reason);
  return v_row.id;
end;
$$;


drop function if exists public.acc_external_assert_global_admin(uuid);
commit;
