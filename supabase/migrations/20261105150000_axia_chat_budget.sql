-- AXIA conversacional: controle financeiro GLOBAL e CONCORRENTE da IA (PR #135).
--
-- O contador em memória por instância não garante teto global em serverless. Esta migration usa o próprio Postgres do ACC
-- (sem serviço novo): reserva atômica com UPDATE condicional (o teto diário e o limite por usuário são checados na mesma
-- instrução que incrementa, sob o bloqueio da linha) e contabilidade CONSERVADORA (ordem de bloqueio fixa: linha do usuário
-- e depois a linha global, em reserve e em release, para não haver deadlock):
--
--   reserve  : reserva o pior caso da chamada (em micro-dólares) antes de falar com o provedor; nega se estourar o teto.
--   settle   : troca a reserva pelo custo real (tokens informados pela API). Idempotente.
--   release  : devolve a reserva SÓ quando a chamada certamente não foi cobrada (pedido rejeitado antes de executar).
--   mark_uncertain : timeout/queda/erro 5xx — a chamada pode ter sido cobrada: a reserva do pior caso PERMANECE no total.
--   late_settle    : se a conclusão tardia de uma chamada incerta chegar com os tokens reais, ajusta o total.
--   reconcile      : reservas "reserved" paradas há mais de 15 min (processo interrompido) viram "uncertain" (o total já as
--                    conta no pior caso). O total diário zera naturalmente no dia seguinte (UTC): é a expiração.
--
-- Acesso: SOMENTE service_role (código do servidor do ACC). As tabelas têm RLS forçada, sem política, e as funções não são
-- executáveis por anon/authenticated. Nenhum dado de usuário além do id (uuid) é guardado: nem pergunta, nem resposta.
-- A migration NÃO altera nenhuma tabela existente.

create table if not exists public.axia_chat_budget_day (
  day date primary key,
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  calls integer not null default 0 check (calls >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.axia_chat_budget_user_day (
  day date not null,
  user_id uuid not null,
  calls integer not null default 0 check (calls >= 0),
  primary key (day, user_id)
);

create table if not exists public.axia_chat_reservations (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  user_id uuid,
  reserved_micros bigint not null check (reserved_micros > 0),
  actual_micros bigint,
  state text not null default 'reserved' check (state in ('reserved', 'settled', 'uncertain', 'released')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
create index if not exists axia_chat_reservations_state_idx on public.axia_chat_reservations (state, created_at);

-- RLS ligada e SEM política: anon/authenticated não têm nem privilégio (revoke abaixo) nem política. NÃO se usa FORCE: com FORCE
-- o dono da função SECURITY DEFINER (que pode não ter BYPASSRLS) também seria barrado e as seis funções deixariam de funcionar
-- (verificado em teste com dono sem BYPASSRLS). O service_role tem BYPASSRLS.
alter table public.axia_chat_budget_day enable row level security;
alter table public.axia_chat_budget_user_day enable row level security;
alter table public.axia_chat_reservations enable row level security;

revoke all on public.axia_chat_budget_day from public, anon, authenticated;
revoke all on public.axia_chat_budget_user_day from public, anon, authenticated;
revoke all on public.axia_chat_reservations from public, anon, authenticated;
grant select, insert, update on public.axia_chat_budget_day to service_role;
grant select, insert, update on public.axia_chat_budget_user_day to service_role;
grant select, insert, update on public.axia_chat_reservations to service_role;

-- ───────────────────────── reserve ─────────────────────────
-- Devolve o id da reserva, ou NULL se o teto diário ou o limite do usuário seria ultrapassado.
create or replace function public.axia_chat_reserve(
  p_user uuid,
  p_reserve_micros bigint,
  p_daily_budget_micros bigint,
  p_user_daily_calls integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_id uuid;
  v_ok integer;
begin
  if p_reserve_micros is null or p_reserve_micros <= 0 or p_daily_budget_micros is null or p_daily_budget_micros <= 0 then
    raise exception 'axia_chat_reserve: parâmetros inválidos';
  end if;

  -- Recuperação oportunista: reservas paradas viram "uncertain" (o total já as conta no pior caso).
  update public.axia_chat_reservations
     set state = 'uncertain'
   where state = 'reserved' and created_at < now() - interval '15 minutes';

  insert into public.axia_chat_budget_day (day) values (v_day) on conflict (day) do nothing;

  -- 1) limite do usuário (condicional e atômico)
  if p_user is not null then
    insert into public.axia_chat_budget_user_day (day, user_id) values (v_day, p_user) on conflict (day, user_id) do nothing;
    update public.axia_chat_budget_user_day
       set calls = calls + 1
     where day = v_day and user_id = p_user and calls < p_user_daily_calls;
    get diagnostics v_ok = row_count;
    if v_ok = 0 then
      return null;
    end if;
  end if;

  -- 2) teto global (condicional e atômico: a linha fica bloqueada até o fim desta transação)
  update public.axia_chat_budget_day
     set spent_micros = spent_micros + p_reserve_micros, calls = calls + 1, updated_at = now()
   where day = v_day and spent_micros + p_reserve_micros <= p_daily_budget_micros;
  get diagnostics v_ok = row_count;
  if v_ok = 0 then
    if p_user is not null then
      update public.axia_chat_budget_user_day set calls = calls - 1 where day = v_day and user_id = p_user;
    end if;
    return null;
  end if;

  insert into public.axia_chat_reservations (day, user_id, reserved_micros)
  values (v_day, p_user, p_reserve_micros)
  returning id into v_id;
  return v_id;
end;
$$;

-- ───────────────────────── settle ─────────────────────────
-- Troca a reserva pelo custo real. Só age sobre "reserved" (idempotente); devolve o valor aplicado ou NULL.
create or replace function public.axia_chat_settle(p_id uuid, p_actual_micros bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.axia_chat_reservations%rowtype;
begin
  if p_actual_micros is null or p_actual_micros < 0 then
    raise exception 'axia_chat_settle: custo inválido';
  end if;
  update public.axia_chat_reservations
     set state = 'settled', actual_micros = p_actual_micros, settled_at = now()
   where id = p_id and state = 'reserved'
   returning * into r;
  if not found then
    return null;
  end if;
  update public.axia_chat_budget_day
     set spent_micros = greatest(0, spent_micros - r.reserved_micros + p_actual_micros), updated_at = now()
   where day = r.day;
  return p_actual_micros;
end;
$$;

-- ───────────────────────── release ─────────────────────────
-- SÓ para chamadas que certamente não foram cobradas (pedido rejeitado). Devolve reserva e a chamada do usuário.
create or replace function public.axia_chat_release(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.axia_chat_reservations%rowtype;
begin
  update public.axia_chat_reservations
     set state = 'released', settled_at = now()
   where id = p_id and state = 'reserved'
   returning * into r;
  if not found then
    return false;
  end if;
  -- mesma ordem de bloqueio de axia_chat_reserve: usuário primeiro, global depois (evita deadlock entre reserve e release)
  if r.user_id is not null then
    update public.axia_chat_budget_user_day set calls = greatest(0, calls - 1) where day = r.day and user_id = r.user_id;
  end if;
  update public.axia_chat_budget_day
     set spent_micros = greatest(0, spent_micros - r.reserved_micros), calls = greatest(0, calls - 1), updated_at = now()
   where day = r.day;
  return true;
end;
$$;

-- ───────────────────────── mark_uncertain ─────────────────────────
-- Timeout, queda de rede ou erro do servidor: a chamada PODE ter sido cobrada. A reserva do pior caso permanece no total.
create or replace function public.axia_chat_mark_uncertain(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.axia_chat_reservations set state = 'uncertain', settled_at = now() where id = p_id and state = 'reserved';
  return found;
end;
$$;

-- ───────────────────────── late_settle ─────────────────────────
-- Conclusão tardia de uma chamada incerta, agora com os tokens reais: ajusta o total (para menos ou para mais).
create or replace function public.axia_chat_late_settle(p_id uuid, p_actual_micros bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.axia_chat_reservations%rowtype;
begin
  if p_actual_micros is null or p_actual_micros < 0 then
    raise exception 'axia_chat_late_settle: custo inválido';
  end if;
  update public.axia_chat_reservations
     set state = 'settled', actual_micros = p_actual_micros, settled_at = now()
   where id = p_id and state = 'uncertain'
   returning * into r;
  if not found then
    return null;
  end if;
  update public.axia_chat_budget_day
     set spent_micros = greatest(0, spent_micros - r.reserved_micros + p_actual_micros), updated_at = now()
   where day = r.day;
  return p_actual_micros;
end;
$$;

-- ───────────────────────── reconcile ─────────────────────────
create or replace function public.axia_chat_reconcile()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  update public.axia_chat_reservations set state = 'uncertain'
   where state = 'reserved' and created_at < now() - interval '15 minutes';
  get diagnostics v = row_count;
  return v;
end;
$$;

-- Execução SOMENTE pelo service_role (padrão das migrations 20261030150000 e 20261101100000).
revoke all on function public.axia_chat_reserve(uuid, bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.axia_chat_settle(uuid, bigint) from public, anon, authenticated;
revoke all on function public.axia_chat_release(uuid) from public, anon, authenticated;
revoke all on function public.axia_chat_mark_uncertain(uuid) from public, anon, authenticated;
revoke all on function public.axia_chat_late_settle(uuid, bigint) from public, anon, authenticated;
revoke all on function public.axia_chat_reconcile() from public, anon, authenticated;
grant execute on function public.axia_chat_reserve(uuid, bigint, bigint, integer) to service_role;
grant execute on function public.axia_chat_settle(uuid, bigint) to service_role;
grant execute on function public.axia_chat_release(uuid) to service_role;
grant execute on function public.axia_chat_mark_uncertain(uuid) to service_role;
grant execute on function public.axia_chat_late_settle(uuid, bigint) to service_role;
grant execute on function public.axia_chat_reconcile() to service_role;

comment on table public.axia_chat_budget_day is 'Gasto diário estimado (micro-dólares) da conversa com IA da AXIA. Só service_role.';
comment on table public.axia_chat_reservations is 'Reservas de custo da IA da AXIA (sem pergunta/resposta). Só service_role.';
