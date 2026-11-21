-- 20261203110000_external_parties_management.sql
-- Fase 5 / Frente C: RPCs de GESTÃO de organizações e contatos externos (única via de escrita) + registro de candidatos descobertos.
--   - gestão (organização, domínio, contato, vínculo, decisão de candidato) exige GESTOR, GERENTE ou ADMINISTRADOR ATIVO do projeto
--     (acc_project_tier MANAGE/ADMIN), conforme docs/permissoes-matriz-central.md; COLABORADOR/LEITURA não gravam;
--   - toda escrita grava linha em external_contacts_audit (append-only), com ator, antes/depois e motivo;
--   - registro de candidato (descoberta por e-mail) é permitido a service_role (ingestão server-side) e a REGISTER+;
--   - nada aqui envia e-mail, lê caixa ou confirma autoridade sozinho: vínculo ACTIVE só por decisão humana (confirmed_by/at).
-- Depende de 20261203100000. Não redefine função existente. Reversível: supabase/rollbacks/20261203110000_external_parties_management.rollback.sql.

create or replace function public.acc_external_assert_manage(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) not in ('MANAGE', 'ADMIN') then
    raise exception 'FORBIDDEN: somente GESTOR, GERENTE ou ADMINISTRADOR ativo do projeto gerencia contatos externos';
  end if;
end;
$$;
revoke all on function public.acc_external_assert_manage(uuid) from public, anon, authenticated;

create or replace function public.acc_external_audit_write(
  p_project_id uuid, p_action text, p_entity_type text, p_entity_id uuid, p_before jsonb, p_after jsonb, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.external_contacts_audit (actor_id, project_id, action, entity_type, entity_id, before_state, after_state, reason)
  values (auth.uid(), p_project_id, p_action, p_entity_type, p_entity_id, p_before, p_after, nullif(btrim(p_reason), ''));
$$;
revoke all on function public.acc_external_audit_write(uuid, text, text, uuid, jsonb, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Organização (cria ou atualiza). p_org: {id?, legal_name, tax_id?, org_kind, notes?}
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

-- ------------------------------------------------------------
-- Domínio da organização (adicionar / ativar / desativar). Domínio compartilhado é permitido e sinalizado no retorno.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Contato (status CONFIRMED | CANDIDATE | REJECTED)
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Vínculo organização x projeto. p_link: {id?, organization_id, role_in_project, contract_ref?, delegation_document_id?,
--   delegation_clause_ref?, delegation_scope?[], valid_from?, valid_until?, status}. ACTIVE grava confirmed_by/at = quem decidiu.
-- ------------------------------------------------------------
create or replace function public.acc_external_link_save(p_project_id uuid, p_link jsonb, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p_link ->> 'id', '')::uuid;
  v_org uuid := nullif(p_link ->> 'organization_id', '')::uuid;
  v_status text := coalesce(nullif(p_link ->> 'status', ''), 'CANDIDATE');
  v_scope text[];
  v_before jsonb;
  v_row public.external_org_project_links;
begin
  perform public.acc_external_assert_manage(p_project_id);
  if v_status not in ('ACTIVE', 'CANDIDATE', 'ENDED') then raise exception 'INVALID_STATUS'; end if;
  if p_link ? 'delegation_scope' then
    select coalesce(array_agg(distinct upper(btrim(x))), '{}') into v_scope from jsonb_array_elements_text(p_link -> 'delegation_scope') x where btrim(x) <> '';
  end if;
  if v_id is null then
    if v_org is null or not public.acc_external_org_visible(v_org) then raise exception 'FORBIDDEN: organização fora do alcance do usuário'; end if;
    insert into public.external_org_project_links (organization_id, project_id, role_in_project, contract_ref, delegation_document_id,
      delegation_clause_ref, delegation_scope, valid_from, valid_until, status, confirmed_by, confirmed_at)
    values (v_org, p_project_id, p_link ->> 'role_in_project', nullif(btrim(p_link ->> 'contract_ref'), ''),
      nullif(p_link ->> 'delegation_document_id', '')::uuid, nullif(btrim(p_link ->> 'delegation_clause_ref'), ''), coalesce(v_scope, '{}'),
      coalesce(nullif(p_link ->> 'valid_from', '')::date, current_date), nullif(p_link ->> 'valid_until', '')::date, v_status,
      case when v_status = 'ACTIVE' then auth.uid() end, case when v_status = 'ACTIVE' then now() end)
    returning * into v_row;
    perform public.acc_external_audit_write(p_project_id, 'LINK_CREATE_' || v_status, 'LINK', v_row.id, null, to_jsonb(v_row), p_reason);
  else
    select to_jsonb(l) into v_before from public.external_org_project_links l where l.id = v_id and l.project_id = p_project_id;
    if v_before is null then raise exception 'NOT_FOUND: vínculo inexistente neste projeto'; end if;
    update public.external_org_project_links l set
      role_in_project = coalesce(nullif(p_link ->> 'role_in_project', ''), l.role_in_project),
      contract_ref = case when p_link ? 'contract_ref' then nullif(btrim(p_link ->> 'contract_ref'), '') else l.contract_ref end,
      delegation_document_id = case when p_link ? 'delegation_document_id' then nullif(p_link ->> 'delegation_document_id', '')::uuid else l.delegation_document_id end,
      delegation_clause_ref = case when p_link ? 'delegation_clause_ref' then nullif(btrim(p_link ->> 'delegation_clause_ref'), '') else l.delegation_clause_ref end,
      delegation_scope = case when p_link ? 'delegation_scope' then coalesce(v_scope, '{}') else l.delegation_scope end,
      valid_from = coalesce(nullif(p_link ->> 'valid_from', '')::date, l.valid_from),
      valid_until = case when p_link ? 'valid_until' then nullif(p_link ->> 'valid_until', '')::date else l.valid_until end,
      status = v_status,
      confirmed_by = case when v_status = 'ACTIVE' and l.status <> 'ACTIVE' then auth.uid() else l.confirmed_by end,
      confirmed_at = case when v_status = 'ACTIVE' and l.status <> 'ACTIVE' then now() else l.confirmed_at end
    where l.id = v_id returning * into v_row;
    perform public.acc_external_audit_write(p_project_id, 'LINK_UPDATE_' || v_status, 'LINK', v_id, v_before, to_jsonb(v_row), p_reason);
  end if;
  return v_row.id;
end;
$$;

-- ------------------------------------------------------------
-- Descoberta: registra e-mail visto sem vínculo confirmado (service_role ou REGISTER+). Idempotente por mensagem.
-- Não confirma nada: só deixa PENDING para decisão humana. suggested_org_id só quando o domínio pertence a UMA organização do projeto.
-- ------------------------------------------------------------
create or replace function public.acc_external_candidate_register(p_project_id uuid, p_email text, p_email_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.acc_email_normalize(p_email);
  v_domain text;
  v_sugg uuid;
  v_row public.external_contact_candidates;
begin
  if coalesce(auth.role(), '') <> 'service_role' and (auth.uid() is null or public.acc_project_tier(p_project_id) not in ('REGISTER', 'MANAGE', 'ADMIN')) then
    raise exception 'FORBIDDEN';
  end if;
  if v_email is null then raise exception 'INVALID_EMAIL'; end if;
  v_domain := split_part(v_email, '@', 2);
  select (array_agg(distinct d.organization_id))[1] into v_sugg
  from public.external_org_domains d
  join public.external_org_project_links l on l.organization_id = d.organization_id and l.project_id = p_project_id and l.status <> 'ENDED'
  where d.domain = v_domain and d.active
  having count(distinct d.organization_id) = 1;
  insert into public.external_contact_candidates (project_id, email, domain, first_seen_email_id, suggested_org_id)
  values (p_project_id, v_email, v_domain, p_email_id, v_sugg)
  on conflict (project_id, email) do update set
    last_seen_at = now(),
    message_count = public.external_contact_candidates.message_count
      + case when p_email_id is not null and p_email_id is not distinct from public.external_contact_candidates.first_seen_email_id then 0 else 1 end,
    suggested_org_id = coalesce(public.external_contact_candidates.suggested_org_id, excluded.suggested_org_id)
  returning * into v_row;
  return v_row.id;
end;
$$;

-- ------------------------------------------------------------
-- Decisão humana sobre o candidato: CONFIRM (vira contato CONFIRMED da organização, que precisa ter vínculo no projeto) ou REJECT.
-- ------------------------------------------------------------
create or replace function public.acc_external_candidate_decide(p_project_id uuid, p_candidate_id uuid, p_decision text, p_org_id uuid default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.external_contact_candidates;
  v_contact uuid;
begin
  perform public.acc_external_assert_manage(p_project_id);
  if p_decision not in ('CONFIRM', 'REJECT') then raise exception 'INVALID_DECISION'; end if;
  select * into v_c from public.external_contact_candidates where id = p_candidate_id and project_id = p_project_id for update;
  if not found then raise exception 'NOT_FOUND: candidato inexistente neste projeto'; end if;
  if p_decision = 'CONFIRM' then
    if p_org_id is null then raise exception 'ORG_REQUIRED'; end if;
    if not exists (select 1 from public.external_org_project_links l where l.organization_id = p_org_id and l.project_id = p_project_id and l.status <> 'ENDED') then
      raise exception 'NO_LINK: a organização não tem vínculo ativo ou candidato neste projeto';
    end if;
    insert into public.external_contacts (organization_id, email, status, discovered)
    values (p_org_id, v_c.email, 'CONFIRMED', true)
    on conflict (organization_id, email) do update set status = 'CONFIRMED', discovered = true
    returning id into v_contact;
    update public.external_contact_candidates set status = 'CONFIRMED', suggested_org_id = p_org_id where id = v_c.id;
  else
    if p_org_id is not null and public.acc_external_org_visible(p_org_id) then
      insert into public.external_contacts (organization_id, email, status, discovered)
      values (p_org_id, v_c.email, 'REJECTED', true)
      on conflict (organization_id, email) do update set status = 'REJECTED';
    end if;
    update public.external_contact_candidates set status = 'REJECTED' where id = v_c.id;
  end if;
  perform public.acc_external_audit_write(p_project_id, 'CANDIDATE_' || p_decision, 'CANDIDATE', v_c.id, to_jsonb(v_c),
    jsonb_build_object('organization_id', p_org_id, 'contact_id', v_contact), p_reason);
  return jsonb_build_object('candidate_id', v_c.id, 'decision', p_decision, 'contact_id', v_contact);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'acc_external_org_save(uuid, jsonb, text)',
    'acc_external_domain_set(uuid, uuid, text, boolean, text)',
    'acc_external_contact_set(uuid, uuid, text, text, text, text)',
    'acc_external_link_save(uuid, jsonb, text)',
    'acc_external_candidate_register(uuid, text, uuid)',
    'acc_external_candidate_decide(uuid, uuid, text, uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
