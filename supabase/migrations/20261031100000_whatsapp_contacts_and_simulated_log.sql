-- ============================================================
-- 20261031100000_whatsapp_contacts_and_simulated_log.sql
--
-- Canal WhatsApp (SIMULADO, desativado por padrão) para alertas CRÍTICOS que chegam à DIRETORIA.
--
-- Modelo (requisito aprovado): telefone e autorização do canal pertencem à PESSOA (uma linha por usuário, reaproveitada em todos
-- os projetos); o vínculo com o projeto (membership ativa), a área e a Diretoria só decidem a ELEGIBILIDADE no momento do envio.
--
-- 1. person_whatsapp_contacts — telefone internacional (E.164) e autorização do canal, por pessoa.
--    Leitura: a própria pessoa ou um ADMINISTRADOR de projeto em que ela tem vínculo ativo. Nenhuma escrita direta:
--    set_person_whatsapp_contact() exige ADMINISTRADOR do projeto informado e vínculo ATIVO da pessoa nele, e audita no projeto
--    (telefone mascarado). Trocar o número NÃO herda a autorização: ela precisa ser reafirmada na mesma operação.
-- 2. whatsapp_dispatch_target() — resolve, NO MOMENTO DO ENVIO, telefone, autorização, vínculo ativo e papel de Diretoria
--    (membership.area = 'DIRETORIA' ou board_user_id da matriz de responsáveis). Somente service_role.
-- 3. whatsapp_simulated_messages — registro idempotente (chave única) do que o provedor SIMULADO "enviou" ou por que não enviou.
--    Escrito apenas pelo servidor (service_role); leitura para ADMINISTRADOR do projeto. Nenhuma mensagem real existe.
-- ============================================================

begin;

create table public.person_whatsapp_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  phone_e164 text not null,
  channel_authorized boolean not null default false,
  channel_authorized_at timestamptz,
  channel_authorized_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null references public.profiles(id),
  constraint whatsapp_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint whatsapp_authorization_consistent_check check (
    (channel_authorized and channel_authorized_at is not null and channel_authorized_by is not null)
    or (not channel_authorized and channel_authorized_at is null and channel_authorized_by is null)
  )
);

-- Administrador de algum projeto em que a pessoa tem vínculo ativo (usada pela RLS; definer para não depender da RLS de memberships).
create or replace function public.is_admin_of_person_project(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships target
    join public.project_memberships admin_m
      on admin_m.project_id = target.project_id
    where target.user_id = p_user_id
      and target.status = 'ACTIVE'
      and admin_m.user_id = auth.uid()
      and admin_m.status = 'ACTIVE'
      and admin_m.permission in ('ADMINISTRADOR', 'ADMIN')
  );
$$;

revoke all on function public.is_admin_of_person_project(uuid) from public, anon;
grant execute on function public.is_admin_of_person_project(uuid) to authenticated, service_role;

alter table public.person_whatsapp_contacts enable row level security;
revoke all on public.person_whatsapp_contacts from public, anon, authenticated;
grant select on public.person_whatsapp_contacts to authenticated;

create policy person_whatsapp_contacts_select_self_or_admin on public.person_whatsapp_contacts
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin_of_person_project(user_id));

create table public.whatsapp_simulated_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  recipient_user_id uuid references public.profiles(id) on delete set null,
  source_type text not null,
  source_id text not null,
  escalation_level text not null check (escalation_level = 'DIRETORIA'),
  risk_level text not null check (risk_level = 'CRITICAL'),
  phone_masked text,
  provider text not null default 'simulated' check (provider = 'simulated'),
  status text not null check (status in ('SIMULATED', 'SKIPPED', 'FAILED')),
  skip_reason text,
  message_preview text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_simulated_messages enable row level security;
revoke all on public.whatsapp_simulated_messages from public, anon, authenticated;
grant select on public.whatsapp_simulated_messages to authenticated;

create policy whatsapp_simulated_select_admin on public.whatsapp_simulated_messages
  for select to authenticated
  using (public.has_project_permission(project_id, 'ADMINISTRADOR'));

create or replace function public.set_person_whatsapp_contact(
  p_project_id uuid,
  p_user_id uuid,
  p_phone text,
  p_channel_authorized boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_phone text;
  v_existing public.person_whatsapp_contacts%rowtype;
  v_authorized boolean := coalesce(p_channel_authorized, false);
  v_masked text;
  v_auth_at timestamptz;
  v_auth_by uuid;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.has_project_permission(p_project_id, 'ADMINISTRADOR') then raise exception 'ADMIN_REQUIRED'; end if;
  -- O vínculo vigente com o projeto é o que dá autoridade para cadastrar; o dado em si é da pessoa.
  if not exists (
    select 1 from public.project_memberships m
    where m.project_id = p_project_id and m.user_id = p_user_id and m.status = 'ACTIVE'
  ) then raise exception 'MEMBER_NOT_ACTIVE'; end if;

  -- Normaliza: remove espaços, pontos, hífens e parênteses; aceita o prefixo internacional "00" como "+".
  v_phone := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
  if left(v_phone, 2) = '00' then v_phone := '+' || substr(v_phone, 3); end if;

  select * into v_existing from public.person_whatsapp_contacts where user_id = p_user_id;

  -- Telefone vazio remove o contato da pessoa (e, com ele, a autorização).
  if v_phone = '' then
    if v_authorized then raise exception 'PHONE_REQUIRED_FOR_AUTHORIZATION'; end if;
    if v_existing.user_id is not null then
      delete from public.person_whatsapp_contacts where user_id = p_user_id;
      insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
      values (p_project_id, 'USER', v_actor, 'MEMBER_WHATSAPP_CONTACT_REMOVED', 'person_whatsapp_contacts', p_user_id::text,
        format('Contato WhatsApp da pessoa removido (%s%s).',
               left(v_existing.phone_e164, 3) || repeat('*', greatest(length(v_existing.phone_e164) - 7, 0)) || right(v_existing.phone_e164, 4),
               case when v_existing.channel_authorized then '; autorização do canal encerrada' else '' end));
    end if;
    return jsonb_build_object('removed', v_existing.user_id is not null);
  end if;

  if v_phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'INVALID_INTERNATIONAL_PHONE'; end if;
  v_masked := left(v_phone, 3) || repeat('*', length(v_phone) - 7) || right(v_phone, 4);

  if v_authorized then
    if v_existing.channel_authorized and v_existing.phone_e164 = v_phone then
      -- já autorizado para este número: mantém quem autorizou e quando
      v_auth_at := v_existing.channel_authorized_at;
      v_auth_by := v_existing.channel_authorized_by;
    else
      v_auth_at := now();
      v_auth_by := v_actor;
    end if;
  end if;

  insert into public.person_whatsapp_contacts
    (user_id, phone_e164, channel_authorized, channel_authorized_at, channel_authorized_by, updated_at, updated_by)
  values (p_user_id, v_phone, v_authorized, v_auth_at, v_auth_by, now(), v_actor)
  on conflict (user_id) do update
    set phone_e164 = excluded.phone_e164,
        channel_authorized = excluded.channel_authorized,
        channel_authorized_at = excluded.channel_authorized_at,
        channel_authorized_by = excluded.channel_authorized_by,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_actor, 'MEMBER_WHATSAPP_CONTACT_SET', 'person_whatsapp_contacts', p_user_id::text,
    format('Telefone internacional WhatsApp da pessoa definido (%s)%s.', v_masked,
           case when v_existing.user_id is not null and v_existing.phone_e164 <> v_phone then '; número alterado' else '' end));

  if v_authorized and not (coalesce(v_existing.channel_authorized, false) and v_existing.phone_e164 = v_phone) then
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
    values (p_project_id, 'USER', v_actor, 'MEMBER_WHATSAPP_CHANNEL_AUTHORIZED', 'person_whatsapp_contacts', p_user_id::text,
      format('Canal WhatsApp autorizado para %s (somente alertas CRÍTICOS que chegam à Diretoria).', v_masked));
  elsif not v_authorized and coalesce(v_existing.channel_authorized, false) then
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
    values (p_project_id, 'USER', v_actor, 'MEMBER_WHATSAPP_CHANNEL_REVOKED', 'person_whatsapp_contacts', p_user_id::text,
      format('Autorização do canal WhatsApp encerrada para %s%s.', v_masked,
             case when v_existing.phone_e164 <> v_phone then ' (número alterado sem nova autorização)' else '' end));
  end if;

  return jsonb_build_object('removed', false, 'authorized', v_authorized, 'phone', v_masked);
end;
$$;

revoke all on function public.set_person_whatsapp_contact(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_person_whatsapp_contact(uuid, uuid, text, boolean) to authenticated, service_role;

-- Elegibilidade resolvida no momento do envio (não em cache): contato da pessoa + vínculo ativo + papel de Diretoria no projeto.
create or replace function public.whatsapp_dispatch_target(p_project_id uuid, p_user_id uuid)
returns table (phone_e164 text, channel_authorized boolean, active_member boolean, diretoria_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.phone_e164,
    coalesce(c.channel_authorized, false),
    exists (
      select 1 from public.project_memberships m
      where m.project_id = p_project_id and m.user_id = p_user_id and m.status = 'ACTIVE'
    ),
    exists (
      select 1 from public.project_memberships m
      where m.project_id = p_project_id and m.user_id = p_user_id and m.status = 'ACTIVE' and m.area = 'DIRETORIA'
    ) or exists (
      select 1 from public.sla_area_responsibles r
      where r.project_id = p_project_id and r.board_user_id = p_user_id
    )
  from (select 1) as one
  left join public.person_whatsapp_contacts c on c.user_id = p_user_id;
$$;

revoke all on function public.whatsapp_dispatch_target(uuid, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_dispatch_target(uuid, uuid) to service_role;

commit;
