-- 20261203100000_external_parties_contract.sql
-- Fase 5 / Frente C: CONTRATO de organizações e contatos externos (clientes, gerenciadoras, fornecedores, subcontratadas, seguradoras...).
--   Tabelas globais do tenant, ligadas a projetos por VÍNCULO; RLS por membership ativa; auditoria append-only;
--   RPC acc_resolve_external_party(projeto, e-mail) -> quem é o remetente/destinatário e com que autoridade (fail-closed).
-- Esta migration NÃO envia nada, NÃO lê caixa de e-mail e NÃO altera linha existente. Depende de 20261127100000 (acc_email_normalize)
-- e 20261123100000 (acc_project_tier). Escrita só por RPC (migration 20261203110000); aqui a aplicação só lê.
-- Reversível: supabase/rollbacks/20261203100000_external_parties_contract.rollback.sql.

-- ============================================================
-- 1) Organizações e domínios
-- ============================================================
create table if not exists public.external_organizations (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (char_length(btrim(legal_name)) between 2 and 300),
  tax_id text check (tax_id is null or char_length(tax_id) between 5 and 32),
  org_kind text not null check (org_kind in ('CLIENTE','GERENCIADORA','FORNECEDOR','SUBCONTRATADA','PRESTADOR','PROJETISTA','CONSULTOR','FISCALIZACAO','SEGURADORA','CORRETOR','BANCO','OUTRO')),
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists external_organizations_tax_id_uidx
  on public.external_organizations (tax_id) where tax_id is not null;
comment on table public.external_organizations is
  'Organização externa do tenant (global, ligada a projetos por external_org_project_links). Escrita só por RPC. Fase 5/C.';

create table if not exists public.external_org_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.external_organizations (id) on delete cascade,
  domain text not null check (domain = lower(domain) and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  active boolean not null default true,
  unique (organization_id, domain)
);
create index if not exists external_org_domains_domain_idx on public.external_org_domains (domain) where active;
comment on table public.external_org_domains is
  'Domínios de e-mail da organização. Um domínio PODE pertencer a várias organizações (compartilhado): nesse caso nunca basta para vincular projeto.';

-- ============================================================
-- 2) Contatos
-- ============================================================
create table if not exists public.external_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.external_organizations (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 6 and 254),
  display_name text,
  status text not null default 'CANDIDATE' check (status in ('CONFIRMED','CANDIDATE','REJECTED')),
  discovered boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, email)
);
create index if not exists external_contacts_email_idx on public.external_contacts (email);

-- ============================================================
-- 3) Vínculo organização x projeto (papel, contrato, delegação, vigência)
-- ============================================================
create table if not exists public.external_org_project_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.external_organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  role_in_project text not null check (role_in_project in ('CLIENTE','GERENCIADORA','FORNECEDOR','SUBCONTRATADA','PRESTADOR','PROJETISTA','CONSULTOR','FISCALIZACAO','SEGURADORA','CORRETOR','BANCO','OUTRO')),
  contract_ref text,
  delegation_document_id uuid,
  delegation_clause_ref text,
  delegation_scope text[] not null default '{}',
  valid_from date not null default current_date,
  valid_until date,
  status text not null default 'CANDIDATE' check (status in ('ACTIVE','CANDIDATE','ENDED')),
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  check (valid_until is null or valid_until >= valid_from),
  check (status <> 'ACTIVE' or (confirmed_by is not null and confirmed_at is not null))
);
-- Mesma organização pode ter VÁRIOS vínculos no mesmo projeto (ex.: contratos distintos), mas não duplicados.
create unique index if not exists external_org_project_links_uidx
  on public.external_org_project_links (organization_id, project_id, role_in_project, coalesce(contract_ref, ''), valid_from);
create index if not exists external_org_project_links_project_idx on public.external_org_project_links (project_id, status);
comment on column public.external_org_project_links.delegation_scope is
  'Limites de competência delegados (ex.: {OS_ROTINA,NOTIFICACAO_PRAZO}). Vazio = NENHUMA delegação: a oficialidade nunca autoriza escopo, aditivo, prazo, reajuste ou preço.';

-- ============================================================
-- 4) Candidatos descobertos (e-mails vistos que ainda não têm vínculo confirmado)
-- ============================================================
create table if not exists public.external_contact_candidates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 6 and 254),
  domain text not null,
  first_seen_email_id uuid,
  last_seen_at timestamptz not null default now(),
  message_count integer not null default 1 check (message_count >= 1),
  suggested_org_id uuid references public.external_organizations (id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','CONFIRMED','REJECTED')),
  unique (project_id, email)
);
create index if not exists external_contact_candidates_status_idx on public.external_contact_candidates (project_id, status);

-- ============================================================
-- 5) Auditoria append-only
-- ============================================================
create table if not exists public.external_contacts_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  project_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  reason text
);
create index if not exists external_contacts_audit_project_idx on public.external_contacts_audit (project_id, at desc);

create or replace function public.external_contacts_audit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'EXTERNAL_CONTACTS_AUDIT_APPEND_ONLY: a trilha de auditoria de contatos externos não admite alteração nem exclusão';
end;
$$;
drop trigger if exists external_contacts_audit_no_update on public.external_contacts_audit;
create trigger external_contacts_audit_no_update before update or delete on public.external_contacts_audit
  for each row execute function public.external_contacts_audit_guard();
drop trigger if exists external_contacts_audit_no_truncate on public.external_contacts_audit;
create trigger external_contacts_audit_no_truncate before truncate on public.external_contacts_audit
  for each statement execute function public.external_contacts_audit_guard();

-- ============================================================
-- 6) Visibilidade (RLS) — membership ATIVA em algum projeto ligado à organização
-- ============================================================
create or replace function public.acc_external_org_visible(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (select 1 from public.external_organizations o where o.id = p_org_id and o.created_by = auth.uid())
    or exists (
      select 1
      from public.external_org_project_links l
      join public.project_memberships pm on pm.project_id = l.project_id and pm.user_id = auth.uid() and pm.status = 'ACTIVE'
      where l.organization_id = p_org_id
    )
  );
$$;
revoke all on function public.acc_external_org_visible(uuid) from public, anon;
grant execute on function public.acc_external_org_visible(uuid) to authenticated;

alter table public.external_organizations enable row level security;
alter table public.external_org_domains enable row level security;
alter table public.external_contacts enable row level security;
alter table public.external_org_project_links enable row level security;
alter table public.external_contact_candidates enable row level security;
alter table public.external_contacts_audit enable row level security;

drop policy if exists external_organizations_select on public.external_organizations;
create policy external_organizations_select on public.external_organizations for select to authenticated
  using (public.acc_external_org_visible(id));
drop policy if exists external_org_domains_select on public.external_org_domains;
create policy external_org_domains_select on public.external_org_domains for select to authenticated
  using (public.acc_external_org_visible(organization_id));
drop policy if exists external_contacts_select on public.external_contacts;
create policy external_contacts_select on public.external_contacts for select to authenticated
  using (public.acc_external_org_visible(organization_id));
drop policy if exists external_org_project_links_select on public.external_org_project_links;
create policy external_org_project_links_select on public.external_org_project_links for select to authenticated
  using (public.acc_project_tier(project_id) <> 'NONE');
drop policy if exists external_contact_candidates_select on public.external_contact_candidates;
create policy external_contact_candidates_select on public.external_contact_candidates for select to authenticated
  using (public.acc_project_tier(project_id) <> 'NONE');
drop policy if exists external_contacts_audit_select on public.external_contacts_audit;
create policy external_contacts_audit_select on public.external_contacts_audit for select to authenticated
  using (project_id is not null and public.acc_project_tier(project_id) in ('MANAGE','ADMIN'));

-- Sem escrita direta pela aplicação (somente RPC SECURITY DEFINER); service_role (ingestão server-side) mantém acesso.
revoke all on public.external_organizations, public.external_org_domains, public.external_contacts,
  public.external_org_project_links, public.external_contact_candidates, public.external_contacts_audit from public, anon, authenticated;
grant select on public.external_organizations, public.external_org_domains, public.external_contacts,
  public.external_org_project_links, public.external_contact_candidates, public.external_contacts_audit to authenticated;
grant all on public.external_organizations, public.external_org_domains, public.external_contacts,
  public.external_org_project_links, public.external_contact_candidates, public.external_contacts_audit to service_role;

-- ============================================================
-- 7) RPC de resolução — fail-closed
-- ============================================================
-- Retorno: {"matches":[{organization_id, org_kind, link_status, role_in_project, delegation_scope, valid_now}],
--           "ambiguous":bool, "domain_shared":bool, "known":bool}
--  - e-mail inválido, chamador sem acesso ao projeto, ou nenhum vínculo => known=false, matches=[] (nunca presume autoridade);
--  - candidato REJEITADO para a organização não casa;
--  - casa por CONTATO CONFIRMADO exato OU por domínio ativo da organização; vínculos ENDED nunca casam;
--  - domain_shared = o domínio está ativo em mais de uma organização (no tenant);
--  - ambiguous = mais de uma organização casa, ou domínio compartilhado SEM contato confirmado exato que desempate;
--  - known = existe ao menos um vínculo ACTIVE casando (CANDIDATE aparece em matches mas não é "known");
--  - valid_now = vínculo ACTIVE e hoje dentro de [valid_from, valid_until].
-- Quem chama precisa ser membro ATIVO do projeto (acc_project_tier <> NONE) ou service_role (ingestão server-side).
create or replace function public.acc_resolve_external_party(p_project_id uuid, p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := public.acc_email_normalize(p_email);
  v_domain text;
  v_allowed boolean;
  v_shared boolean;
  v_matches jsonb;
  v_n integer;
  v_exact integer;
  v_known boolean;
begin
  if v_email is null or p_project_id is null then
    return jsonb_build_object('matches', '[]'::jsonb, 'ambiguous', false, 'domain_shared', false, 'known', false);
  end if;
  v_allowed := coalesce(auth.role(), '') = 'service_role' or public.acc_project_tier(p_project_id) <> 'NONE';
  if not v_allowed then
    return jsonb_build_object('matches', '[]'::jsonb, 'ambiguous', false, 'domain_shared', false, 'known', false);
  end if;
  v_domain := split_part(v_email, '@', 2);

  select (count(distinct d.organization_id) > 1) into v_shared
  from public.external_org_domains d where d.domain = v_domain and d.active;

  with cand as (
    select l.organization_id, o.org_kind, l.status as link_status, l.role_in_project, l.delegation_scope,
           (l.status = 'ACTIVE' and l.valid_from <= current_date and (l.valid_until is null or l.valid_until >= current_date)) as valid_now,
           exists (select 1 from public.external_contacts c
                    where c.organization_id = l.organization_id and c.email = v_email and c.status = 'CONFIRMED') as exact_contact,
           exists (select 1 from public.external_contacts c
                    where c.organization_id = l.organization_id and c.email = v_email and c.status = 'REJECTED') as rejected,
           exists (select 1 from public.external_org_domains d
                    where d.organization_id = l.organization_id and d.domain = v_domain and d.active) as domain_hit
    from public.external_org_project_links l
    join public.external_organizations o on o.id = l.organization_id
    where l.project_id = p_project_id and l.status <> 'ENDED'
  ), hit as (
    select * from cand where not rejected and (exact_contact or domain_hit)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'organization_id', organization_id, 'org_kind', org_kind, 'link_status', link_status,
           'role_in_project', role_in_project, 'delegation_scope', to_jsonb(delegation_scope), 'valid_now', valid_now)
           order by organization_id, role_in_project), '[]'::jsonb),
         count(distinct organization_id)::int,
         count(distinct organization_id) filter (where exact_contact)::int,
         coalesce(bool_or(link_status = 'ACTIVE'), false)
    into v_matches, v_n, v_exact, v_known
  from hit;

  return jsonb_build_object(
    'matches', v_matches,
    'ambiguous', (v_n > 1) or (coalesce(v_shared, false) and v_n >= 1 and v_exact = 0),
    'domain_shared', coalesce(v_shared, false),
    'known', v_known
  );
end;
$$;
revoke all on function public.acc_resolve_external_party(uuid, text) from public, anon;
grant execute on function public.acc_resolve_external_party(uuid, text) to authenticated, service_role;
comment on function public.acc_resolve_external_party(uuid, text) is
  'Resolve organização/papel/delegação de um e-mail no projeto. Fail-closed (sem vínculo ativo => known=false). Domínio compartilhado/ambíguo nunca vincula por coincidência. Espelho: apps/web/lib/external-parties/resolve.ts. Fase 5/C.';
