-- 20261127100000_external_recipient_controls.sql
-- Fase 4 / Frente D (item 7): destinatários externos de e-mail.
--   1) validação SERVER-SIDE de endereço (sintaxe, normalização, domínio plausível, sem injeção de cabeçalho, limites);
--   2) lista de domínios (TENANT = da própria Axion; PERMITIDO = autorizado por decisão do dono). Domínio fora da lista = EXTERNO;
--   3) CONFIRMAÇÃO explícita do destinatário externo, com TRILHA DE AUDITORIA append-only (quem, quando, destinatário, motivo);
--   4) trava no banco: canal oficial de Seguros do tipo EMAIL com domínio EXTERNO só entra com confirmação recente do mesmo usuário.
-- Envio real de e-mail continua impossível por este arquivo: nada aqui envia nada. Nenhuma função existente é redefinida; nenhuma
-- linha existente é alterada (canais legados permanecem válidos: o gatilho só dispara em INSERT ou em UPDATE de tipo/valor do canal).
-- Reversível: supabase/rollbacks/20261127100000_external_recipient_controls.rollback.sql.

-- ============================================================
-- 1) Normalização e validação do endereço
-- ============================================================
-- Devolve o endereço normalizado (aparado + minúsculas) ou NULL se inválido. Mantém espelho em
-- apps/web/lib/email/recipient-validation.ts (paridade testada). Regras:
--   - até 254 caracteres; parte local 1..64, só [a-z0-9._%+-], sem ponto inicial/final/duplo;
--   - domínio com ao menos 2 rótulos de 1..63 caracteres ([a-z0-9-], sem hífen nas pontas), TLD alfabético de 2..24 letras;
--   - sem espaço, vírgula, ponto e vírgula, <>, aspas, controle (CR/LF) => impossível injetar cabeçalho ou lista de destinatários;
--   - domínios reservados/não roteáveis (example.*, *.invalid, *.test, *.localhost, *.local, *.example) são recusados.
create or replace function public.acc_email_normalize(p_email text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
  v_local text;
  v_domain text;
begin
  if p_email is null then return null; end if;
  v := lower(btrim(p_email, E' \t'));
  if char_length(v) < 6 or char_length(v) > 254 then return null; end if;
  if v !~ '^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$' then return null; end if;
  v_local := split_part(v, '@', 1);
  v_domain := split_part(v, '@', 2);
  if left(v_local, 1) = '.' or right(v_local, 1) = '.' or position('..' in v_local) > 0 then return null; end if;
  if v_domain ~ '(^|\.)(example\.(com|net|org)|example|invalid|test|localhost|local)$' then return null; end if;
  return v;
end;
$$;
revoke all on function public.acc_email_normalize(text) from public, anon;
grant execute on function public.acc_email_normalize(text) to authenticated;
comment on function public.acc_email_normalize(text) is
  'Normaliza e valida endereço de e-mail de destinatário (NULL = inválido). Espelho: apps/web/lib/email/recipient-validation.ts.';

-- ============================================================
-- 2) Lista de domínios do tenant e permitidos
-- ============================================================
create table if not exists public.acc_recipient_domains (
  domain text primary key check (domain = lower(domain) and domain ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$'),
  kind text not null check (kind in ('TENANT', 'PERMITIDO')),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.acc_recipient_domains is
  'Domínios que NÃO exigem confirmação de destinatário externo: TENANT (Axion) e PERMITIDO (decisão do dono). Fora da lista = EXTERNO. Sem escrita pela aplicação.';

insert into public.acc_recipient_domains (domain, kind, note)
values ('axion.com.br', 'TENANT', 'Domínio corporativo da Axion (tenant do ACC).')
on conflict (domain) do nothing;

create or replace function public.acc_recipient_domains_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'RECIPIENT_DOMAINS_NO_DELETE: desative (active = false) em vez de apagar';
  end if;
  return new;
end;
$$;
drop trigger if exists acc_recipient_domains_no_delete on public.acc_recipient_domains;
create trigger acc_recipient_domains_no_delete before delete on public.acc_recipient_domains
  for each row execute function public.acc_recipient_domains_guard();
drop trigger if exists acc_recipient_domains_no_truncate on public.acc_recipient_domains;
create trigger acc_recipient_domains_no_truncate before truncate on public.acc_recipient_domains
  for each statement execute function public.acc_recipient_domains_guard();

alter table public.acc_recipient_domains enable row level security;
drop policy if exists acc_recipient_domains_select on public.acc_recipient_domains;
create policy acc_recipient_domains_select on public.acc_recipient_domains for select to authenticated using (true);
revoke all on public.acc_recipient_domains from public, anon;
revoke insert, update, delete, truncate on public.acc_recipient_domains from authenticated;
grant select on public.acc_recipient_domains to authenticated;

-- INVALID | INTERNO (TENANT) | PERMITIDO | EXTERNO. Casamento EXATO do domínio (subdomínio de um domínio listado NÃO herda: fail-closed).
create or replace function public.acc_recipient_domain_status(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text := public.acc_email_normalize(p_email);
  v_kind text;
begin
  if v is null then return 'INVALID'; end if;
  select d.kind into v_kind from public.acc_recipient_domains d where d.domain = split_part(v, '@', 2) and d.active;
  if v_kind = 'TENANT' then return 'INTERNO'; end if;
  if v_kind = 'PERMITIDO' then return 'PERMITIDO'; end if;
  return 'EXTERNO';
end;
$$;
revoke all on function public.acc_recipient_domain_status(text) from public, anon;
grant execute on function public.acc_recipient_domain_status(text) to authenticated;

-- ============================================================
-- 3) Confirmação de destinatário externo — trilha append-only
-- ============================================================
create table if not exists public.external_recipient_confirmations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  context text not null check (context in ('SEGUROS_CANAL', 'SEGUROS_MINUTA', 'GARANTIAS', 'QUALIDADE', 'SOLICITACAO_ACAO', 'OUTRO')),
  entity_type text,
  entity_id uuid,
  recipient_email text not null check (recipient_email = lower(recipient_email) and char_length(recipient_email) between 6 and 254),
  recipient_domain text not null,
  domain_status text not null default 'EXTERNO' check (domain_status = 'EXTERNO'),
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  source_ref text,
  confirmed_by uuid not null references public.profiles (id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  tier_at_confirmation text not null check (tier_at_confirmation in ('MANAGE', 'ADMIN'))
);
create index if not exists external_recipient_confirmations_project_idx on public.external_recipient_confirmations (project_id, confirmed_at desc);
create index if not exists external_recipient_confirmations_lookup_idx on public.external_recipient_confirmations (project_id, context, recipient_email, confirmed_by, confirmed_at desc);
comment on table public.external_recipient_confirmations is
  'Trilha append-only de confirmação de destinatário externo (quem confirmou, quando, destinatário, motivo). Só a RPC acc_external_recipient_confirm grava.';

create or replace function public.external_recipient_confirmations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'EXTERNAL_RECIPIENT_AUDIT_APPEND_ONLY: a trilha de confirmação de destinatário externo não admite alteração nem exclusão';
end;
$$;
drop trigger if exists external_recipient_confirmations_append_only on public.external_recipient_confirmations;
create trigger external_recipient_confirmations_append_only before update or delete on public.external_recipient_confirmations
  for each row execute function public.external_recipient_confirmations_guard();
drop trigger if exists external_recipient_confirmations_no_truncate on public.external_recipient_confirmations;
create trigger external_recipient_confirmations_no_truncate before truncate on public.external_recipient_confirmations
  for each statement execute function public.external_recipient_confirmations_guard();

alter table public.external_recipient_confirmations enable row level security;
drop policy if exists external_recipient_confirmations_select on public.external_recipient_confirmations;
create policy external_recipient_confirmations_select on public.external_recipient_confirmations for select to authenticated
  using (public.acc_project_tier(project_id) in ('MANAGE', 'ADMIN'));
revoke all on public.external_recipient_confirmations from public, anon;
revoke insert, update, delete, truncate on public.external_recipient_confirmations from authenticated;
grant select on public.external_recipient_confirmations to authenticated;

-- Confirmação recente (24 h) do MESMO usuário, no MESMO projeto/contexto, para o MESMO endereço normalizado.
create or replace function public.acc_external_recipient_confirmed(p_project_id uuid, p_context text, p_email text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.external_recipient_confirmations c
    where c.project_id = p_project_id
      and c.context = p_context
      and c.recipient_email = public.acc_email_normalize(p_email)
      and c.confirmed_by = p_user
      and c.confirmed_at > now() - interval '24 hours'
  );
$$;
revoke all on function public.acc_external_recipient_confirmed(uuid, text, text, uuid) from public, anon, authenticated;

-- RPC de confirmação: gestão (MANAGE ou ADMIN) do projeto; endereço válido e EXTERNO; motivo >= 10 caracteres.
create or replace function public.acc_external_recipient_confirm(
  p_project_id uuid, p_context text, p_entity_type text, p_entity_id uuid, p_email text, p_reason text, p_source_ref text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_email text;
  v_status text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  v_tier := public.acc_project_tier(p_project_id);
  if v_tier not in ('MANAGE', 'ADMIN') then raise exception 'FORBIDDEN'; end if;
  v_email := public.acc_email_normalize(p_email);
  if v_email is null then raise exception 'INVALID_RECIPIENT_EMAIL'; end if;
  v_status := public.acc_recipient_domain_status(v_email);
  if v_status <> 'EXTERNO' then raise exception 'CONFIRMATION_NOT_REQUIRED'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'REASON_REQUIRED'; end if;
  insert into public.external_recipient_confirmations
    (project_id, context, entity_type, entity_id, recipient_email, recipient_domain, reason, source_ref, confirmed_by, tier_at_confirmation)
  values (p_project_id, p_context, nullif(btrim(coalesce(p_entity_type, '')), ''), p_entity_id, v_email, split_part(v_email, '@', 2),
    btrim(p_reason), nullif(btrim(coalesce(p_source_ref, '')), ''), v_uid, v_tier)
  returning id into v_id;
  -- Seguros mantém também a sua própria trilha (insurance_audit_events), sem repetir o endereço no detalhe.
  if p_context like 'SEGUROS%' then
    perform public.insurance_int_audit(p_project_id, 'EXTERNAL_RECIPIENT', v_id, 'EXTERNAL_RECIPIENT_CONFIRMED',
      jsonb_build_object('context', p_context, 'domain', split_part(v_email, '@', 2)));
  end if;
  return jsonb_build_object('id', v_id, 'email', v_email, 'domain', split_part(v_email, '@', 2));
end;
$$;
revoke all on function public.acc_external_recipient_confirm(uuid, text, text, uuid, text, text, text) from public, anon;
grant execute on function public.acc_external_recipient_confirm(uuid, text, text, uuid, text, text, text) to authenticated;

-- ============================================================
-- 4) Trava no canal oficial de Seguros (tipo EMAIL)
-- ============================================================
create or replace function public.insurance_channel_recipient_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.channel_type <> 'EMAIL' then return new; end if;
  v_email := public.acc_email_normalize(new.channel_value);
  if v_email is null then raise exception 'INVALID_RECIPIENT_EMAIL: o endereço do canal não é um e-mail válido'; end if;
  new.channel_value := v_email;
  if public.acc_recipient_domain_status(v_email) = 'EXTERNO'
     and not public.acc_external_recipient_confirmed(new.project_id, 'SEGUROS_CANAL', v_email, coalesce(new.created_by, auth.uid())) then
    raise exception 'EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED: confirme o destinatário externo antes de cadastrar o canal';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_channel_recipient_guard() from public, anon, authenticated;
drop trigger if exists insurance_official_channels_recipient_guard on public.insurance_official_channels;
create trigger insurance_official_channels_recipient_guard
  before insert or update of channel_type, channel_value on public.insurance_official_channels
  for each row execute function public.insurance_channel_recipient_guard();
