-- CONGELAMENTO INTEGRAL DE ESCRITA NO BANCO (Fase 2 do piloto WEG) - aplicar no INICIO da janela, depois de pausar os jobs
-- (6-pg-cron-pausar.sql) e de pausar o aplicativo. Reversivel por 2-reverter-congelamento.sql. NAO foi executado fora do PostgreSQL local
-- descartavel (scripts/test-congelamento-realpg.mjs). Ver docs/implantacao/16-congelamento-integral.md.
--
-- O que faz (uma transacao: ou tudo, ou nada):
--  A) GATILHO-GUARDA em TODA tabela base de public (statement-level, INSERT/UPDATE/DELETE/TRUNCATE): recusa com SQLSTATE 42501 qualquer
--     gravacao feita em nome de anon/authenticated (papel da sessao OU claim 'role' do JWT). Isto cobre tambem as RPCs SECURITY DEFINER
--     (que rodam como dono e escapam de GRANT/RLS) sem precisar classificar as ~180 RPCs. service_role (claim) e o dono/SQL direto
--     (postgres) NAO sao afetados.
--  B) REVOKE INSERT/UPDATE/DELETE/TRUNCATE (tabela e coluna) de anon/authenticated/PUBLIC em tabelas e views de public. Os privilegios
--     removidos ficam guardados em public.acc_congelamento_estado e voltam EXATOS na reversao. Leitura (SELECT) nao muda.
--  C) Auditoria: 1 linha por obra em audit_log_entries (project_id e NOT NULL).
-- Storage e pg_cron tem scripts proprios (4/5 e 6/7). Idempotente: aplicar 2x nao muda nada alem do ja aplicado.

create table if not exists public.acc_congelamento_estado (
  kind text not null check (kind in ('TABLE_PRIV', 'COLUMN_PRIV')),
  relname text not null,
  attname text not null default '',
  grantee text not null,
  privilege text not null,
  grantable boolean not null,
  salvo_em timestamptz not null default now(),
  primary key (kind, relname, attname, grantee, privilege)
);
revoke all on public.acc_congelamento_estado from public, anon, authenticated;  -- o padrao do Supabase concederia acesso pela API
alter table public.acc_congelamento_estado enable row level security;           -- sem politicas: ninguem alem do dono/service_role

create or replace function public.acc_congelamento_guard() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role text;
begin
  begin
    v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role');
  exception when others then
    v_role := null;
  end;
  if current_user in ('anon', 'authenticated') or v_role in ('anon', 'authenticated') then
    -- Mensagem sem codigos de erro permanentes da fila offline do SSMA: o item fica na fila e e reenviado depois.
    raise exception 'ACC_JANELA_CONGELAMENTO: gravacao suspensa durante a janela de manutencao. Nada foi perdido; tente novamente mais tarde.' using errcode = '42501';
  end if;
  return null;
end $$;
revoke all on function public.acc_congelamento_guard() from public, anon, authenticated;

do $$
declare
  r record;
  v_tabelas int := 0;
  v_revogadas int := 0;
begin
  -- B.1) foto dos privilegios de escrita (tabela/view) de anon/authenticated/PUBLIC, antes de revogar
  insert into public.acc_congelamento_estado (kind, relname, attname, grantee, privilege, grantable)
  select 'TABLE_PRIV', c.relname, '', case when a.grantee = 0 then 'public' else a.grantee::regrole::text end, a.privilege_type, a.is_grantable
    from pg_class c
    cross join lateral aclexplode(c.relacl) a
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'f')
     and c.relname <> 'acc_congelamento_estado'
     and a.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated'))
  on conflict do nothing;
  -- B.2) idem por coluna (GRANT UPDATE (col) nao e removido pelo REVOKE da tabela)
  insert into public.acc_congelamento_estado (kind, relname, attname, grantee, privilege, grantable)
  select 'COLUMN_PRIV', c.relname, t.attname, case when a.grantee = 0 then 'public' else a.grantee::regrole::text end, a.privilege_type, a.is_grantable
    from pg_class c
    join pg_attribute t on t.attrelid = c.oid and t.attnum > 0 and not t.attisdropped and t.attacl is not null
    cross join lateral aclexplode(t.attacl) a
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'f')
     and a.privilege_type in ('INSERT', 'UPDATE')
     and (a.grantee = 0 or a.grantee::regrole::text in ('anon', 'authenticated'))
  on conflict do nothing;

  -- B.3) revogar (tabelas/views)
  for r in select c.oid::regclass::text as rel, c.relkind from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'f') and c.relname <> 'acc_congelamento_estado'
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    if r.relkind = 'v' then
      execute format('revoke insert, update, delete on table %s from public, anon, authenticated', r.rel);
    else
      execute format('revoke insert, update, delete, truncate on table %s from public, anon, authenticated', r.rel);
    end if;
    v_revogadas := v_revogadas + 1;
  end loop;
  -- B.4) revogar por coluna o que estava guardado
  for r in select distinct relname, attname from public.acc_congelamento_estado where kind = 'COLUMN_PRIV' loop
    execute format('revoke insert (%I), update (%I) on table public.%I from public, anon, authenticated', r.attname, r.attname, r.relname);
  end loop;

  -- A) gatilho-guarda em toda tabela base de public
  for r in select c.oid::regclass::text as rel, c.oid as relid from pg_class c
            where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'acc_congelamento_estado'
              and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e') loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = r.relid and t.tgname = 'acc_congelamento_guard' and not t.tgisinternal) then
      execute format('create trigger acc_congelamento_guard before insert or update or delete or truncate on %s for each statement execute function public.acc_congelamento_guard()', r.rel);
    end if;
    v_tabelas := v_tabelas + 1;
  end loop;

  -- C) auditoria (project_id NOT NULL: 1 linha por obra)
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  select pr.id, 'SYSTEM', null, null, 'WRITE_FREEZE_APPLIED', 'Database', 'congelamento-janela-fase2',
         'Congelamento integral de escrita aplicado: gatilho-guarda em ' || v_tabelas || ' tabelas; privilegios de escrita revogados de anon/authenticated em ' || v_revogadas || ' tabelas/views.'
    from public.projects pr;
end $$;

-- CONFERENCIA 1 (esperado: tabelas_sem_guarda = 0)
select count(*) as tabelas_base, count(*) filter (where not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = 'acc_congelamento_guard' and not t.tgisinternal)) as tabelas_sem_guarda_esperado_0
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'acc_congelamento_estado'
   and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e');
-- CONFERENCIA 2 (esperado: 0 tabelas/views com escrita para anon/authenticated)
select count(*) as com_escrita_esperado_0 from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'f') and c.relname <> 'acc_congelamento_estado'
   and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE')
     or has_any_column_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
     or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')
     or has_any_column_privilege('anon', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'UPDATE'));
