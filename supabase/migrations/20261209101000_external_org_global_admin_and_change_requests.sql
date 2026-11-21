-- 20261209101000_external_org_global_admin_and_change_requests.sql
-- Fase 6 / Frente H2b (3): ORGANIZAÇÕES EXTERNAS GLOBAIS. Dados globais (razão social, CNPJ/identificação fiscal, tipo, domínios e
-- contatos da organização) só podem ser alterados por ADMINISTRADOR ativo. GESTOR/GERENTE continuam gerindo os VÍNCULOS do SEU projeto
-- (acc_external_link_save, decisão de candidatos descobertos) e passam a SOLICITAR alteração dos dados globais
-- (tabela external_org_change_requests + RPCs solicitar/decidir/cancelar); a decisão é do ADMINISTRADOR e a aplicação ocorre
-- na própria decisão, com auditoria (external_contacts_audit, append-only).
-- REDEFINE (justificado) acc_external_org_save, acc_external_domain_set e acc_external_contact_set da migration 20261203110000: a
-- única mudança é a autorização (assert_manage => assert_global_admin); assinaturas, retornos, validações e auditoria permanecem.
-- "ADMINISTRADOR" é, no modelo atual, o papel ADMINISTRADOR ativo no projeto de onde a ação parte (acc_project_tier = ADMIN): não há
-- conceito de administrador de tenant (risco registrado em docs/f6-h2b-sinais-oficialidade-organizacoes.md).
-- Depende de 20261203100000/110000. Idempotente. Reversível: supabase/rollbacks/20261209101000_external_org_global_admin_and_change_requests.rollback.sql.

create or replace function public.acc_external_assert_global_admin(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) <> 'ADMIN' then
    raise exception 'FORBIDDEN: dados globais de organização externa só podem ser alterados por ADMINISTRADOR ativo; GESTOR/GERENTE devem solicitar a alteração';
  end if;
end;
$$;
revoke all on function public.acc_external_assert_global_admin(uuid) from public, anon, authenticated;

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
  perform public.acc_external_assert_global_admin(p_project_id);
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
  perform public.acc_external_assert_global_admin(p_project_id);
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
  perform public.acc_external_assert_global_admin(p_project_id);
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

-- ============================================================
-- Solicitações de alteração de dados globais
-- ============================================================
create table if not exists public.external_org_change_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null check (kind in ('ORG_CREATE', 'ORG_UPDATE', 'DOMAIN_SET', 'CONTACT_SET')),
  organization_id uuid references public.external_organizations (id) on delete set null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and char_length(payload::text) <= 4000),
  reason text not null check (char_length(btrim(reason)) >= 5),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_by uuid references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  applied_organization_id uuid,
  check (kind = 'ORG_CREATE' or organization_id is not null),
  check (status = 'PENDING' or decided_at is not null)
);
create index if not exists external_org_change_requests_project_idx on public.external_org_change_requests (project_id, status, requested_at desc);

alter table public.external_org_change_requests enable row level security;
drop policy if exists external_org_change_requests_select on public.external_org_change_requests;
create policy external_org_change_requests_select on public.external_org_change_requests for select to authenticated
  using (public.acc_project_tier(project_id) in ('MANAGE', 'ADMIN'));
revoke all on public.external_org_change_requests from public, anon, authenticated;
grant select on public.external_org_change_requests to authenticated;
grant all on public.external_org_change_requests to service_role;

-- Solicitar (GESTOR/GERENTE/ADMINISTRADOR do projeto). Não altera dado global; só registra o pedido e a auditoria.
create or replace function public.acc_external_change_request(p_project_id uuid, p_kind text, p_org_id uuid, p_payload jsonb, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.external_org_change_requests;
begin
  perform public.acc_external_assert_manage(p_project_id);
  if p_kind is null or p_kind not in ('ORG_CREATE', 'ORG_UPDATE', 'DOMAIN_SET', 'CONTACT_SET') then raise exception 'INVALID_KIND'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or char_length(p_payload::text) > 4000 then raise exception 'INVALID_PAYLOAD'; end if;
  if p_kind = 'ORG_CREATE' then
    if char_length(btrim(coalesce(p_payload ->> 'legal_name', ''))) < 2 or coalesce(p_payload ->> 'org_kind', '') = '' then raise exception 'INVALID_PAYLOAD'; end if;
  else
    if p_org_id is null or not public.acc_external_org_visible(p_org_id) then raise exception 'FORBIDDEN: organização fora do alcance do usuário'; end if;
    if p_kind = 'DOMAIN_SET' and coalesce(p_payload ->> 'domain', '') = '' then raise exception 'INVALID_PAYLOAD'; end if;
    if p_kind = 'CONTACT_SET' and (coalesce(p_payload ->> 'email', '') = '' or coalesce(p_payload ->> 'status', '') not in ('CONFIRMED', 'CANDIDATE', 'REJECTED')) then raise exception 'INVALID_PAYLOAD'; end if;
  end if;
  insert into public.external_org_change_requests (project_id, kind, organization_id, payload, reason, requested_by)
  values (p_project_id, p_kind, case when p_kind = 'ORG_CREATE' then null else p_org_id end, p_payload, btrim(p_reason), auth.uid())
  returning * into v_row;
  perform public.acc_external_audit_write(p_project_id, 'CHANGE_REQUESTED_' || p_kind, 'CHANGE_REQUEST', v_row.id, null, to_jsonb(v_row), p_reason);
  return v_row.id;
end;
$$;

-- Decidir (somente ADMINISTRADOR ativo do projeto da solicitação). APPROVE aplica a alteração pelas RPCs administrativas, na mesma transação.
create or replace function public.acc_external_change_decide(p_request_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.external_org_change_requests;
  v_org uuid;
  v_applied jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_decision is null or p_decision not in ('APPROVE', 'REJECT') then raise exception 'INVALID_DECISION'; end if;
  select * into v_req from public.external_org_change_requests where id = p_request_id for update;
  if not found then raise exception 'NOT_FOUND: solicitação inexistente'; end if;
  perform public.acc_external_assert_global_admin(v_req.project_id);
  if v_req.status <> 'PENDING' then raise exception 'ALREADY_DECIDED: a solicitação já está %', v_req.status; end if;
  if p_decision = 'REJECT' and (p_note is null or char_length(btrim(p_note)) < 5) then raise exception 'NOTE_REQUIRED: informe o motivo da recusa'; end if;

  if p_decision = 'APPROVE' then
    if v_req.kind = 'ORG_CREATE' then
      v_org := public.acc_external_org_save(v_req.project_id, v_req.payload, 'Solicitação ' || v_req.id::text || ' aprovada');
      -- A organização nasce visível ao projeto solicitante por um vínculo CANDIDATO (não confere autoridade; o gestor valida depois).
      perform public.acc_external_link_save(v_req.project_id,
        jsonb_build_object('organization_id', v_org, 'role_in_project', coalesce(nullif(v_req.payload ->> 'role_in_project', ''), v_req.payload ->> 'org_kind'), 'status', 'CANDIDATE'),
        'Vínculo candidato criado pela aprovação da solicitação ' || v_req.id::text);
      v_applied := jsonb_build_object('organization_id', v_org);
    elsif v_req.kind = 'ORG_UPDATE' then
      v_org := public.acc_external_org_save(v_req.project_id, v_req.payload || jsonb_build_object('id', v_req.organization_id), 'Solicitação ' || v_req.id::text || ' aprovada');
      v_applied := jsonb_build_object('organization_id', v_org);
    elsif v_req.kind = 'DOMAIN_SET' then
      v_applied := public.acc_external_domain_set(v_req.project_id, v_req.organization_id, v_req.payload ->> 'domain',
        coalesce((v_req.payload ->> 'active')::boolean, true), 'Solicitação ' || v_req.id::text || ' aprovada');
      v_org := v_req.organization_id;
    else
      perform public.acc_external_contact_set(v_req.project_id, v_req.organization_id, v_req.payload ->> 'email', v_req.payload ->> 'display_name',
        v_req.payload ->> 'status', 'Solicitação ' || v_req.id::text || ' aprovada');
      v_org := v_req.organization_id;
    end if;
  end if;

  update public.external_org_change_requests set
    status = case p_decision when 'APPROVE' then 'APPROVED' else 'REJECTED' end,
    decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), ''), applied_organization_id = v_org
  where id = v_req.id;
  perform public.acc_external_audit_write(v_req.project_id, 'CHANGE_' || p_decision || '_' || v_req.kind, 'CHANGE_REQUEST', v_req.id, to_jsonb(v_req),
    jsonb_build_object('decision', p_decision, 'applied', v_applied), p_note);
  return jsonb_build_object('request_id', v_req.id, 'decision', p_decision, 'applied', v_applied);
end;
$$;

-- Cancelar: quem solicitou (ainda GESTOR/GERENTE/ADMIN do projeto) retira o pedido pendente.
create or replace function public.acc_external_change_cancel(p_request_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.external_org_change_requests;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_req from public.external_org_change_requests where id = p_request_id for update;
  if not found then raise exception 'NOT_FOUND: solicitação inexistente'; end if;
  perform public.acc_external_assert_manage(v_req.project_id);
  if v_req.requested_by is distinct from auth.uid() and public.acc_project_tier(v_req.project_id) <> 'ADMIN' then
    raise exception 'FORBIDDEN: somente quem solicitou ou um ADMINISTRADOR cancela a solicitação';
  end if;
  if v_req.status <> 'PENDING' then raise exception 'ALREADY_DECIDED: a solicitação já está %', v_req.status; end if;
  update public.external_org_change_requests set status = 'CANCELLED', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(btrim(p_note), '')
  where id = v_req.id;
  perform public.acc_external_audit_write(v_req.project_id, 'CHANGE_CANCELLED_' || v_req.kind, 'CHANGE_REQUEST', v_req.id, to_jsonb(v_req), null, p_note);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'acc_external_org_save(uuid, jsonb, text)',
    'acc_external_domain_set(uuid, uuid, text, boolean, text)',
    'acc_external_contact_set(uuid, uuid, text, text, text, text)',
    'acc_external_change_request(uuid, text, uuid, jsonb, text)',
    'acc_external_change_decide(uuid, text, text)',
    'acc_external_change_cancel(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

comment on table public.external_org_change_requests is
  'Fase 6/H2b: pedidos de GESTOR/GERENTE para alterar dados globais de organização externa; decisão e aplicação só por ADMINISTRADOR; auditado.';
