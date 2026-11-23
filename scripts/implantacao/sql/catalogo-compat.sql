-- Catalogo SOMENTE LEITURA para a compatibilidade do app antigo com o schema novo (docs/implantacao/28).
-- Nenhum dado de tabela e lido: so metadados do catalogo (funcoes, colunas, politicas, grants, gatilhos).
-- Uso: psql -At -d <banco> -f scripts/implantacao/sql/catalogo-compat.sql > catalogo.json
select jsonb_pretty(jsonb_build_object(
  'funcoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'nome', p.proname,
      'args', pg_get_function_identity_arguments(p.oid),
      'nomesArgs', coalesce(to_jsonb(p.proargnames), '[]'::jsonb),
      'retorno', pg_get_function_result(p.oid),
      'argsComDefault', pg_get_function_arguments(p.oid),
      'corpoMd5', md5(replace(p.prosrc, chr(13), '')),
      'securityDefiner', p.prosecdef,
      'volatilidade', p.provolatile,
      'executaAnon', has_function_privilege('anon', p.oid, 'execute'),
      'executaAuthenticated', has_function_privilege('authenticated', p.oid, 'execute'),
      'executaServiceRole', has_function_privilege('service_role', p.oid, 'execute')
    ) order by p.proname, pg_get_function_identity_arguments(p.oid)), '[]'::jsonb)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind in ('f', 'p')),
  'colunas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'coluna', a.attname,
      'tipo', format_type(a.atttypid, a.atttypmod),
      'naoNulo', a.attnotnull,
      'temDefault', a.atthasdef, 'gerada', a.attgenerated <> '',
      'identidade', a.attidentity <> '',
      'tipoRel', c.relkind
    ) order by c.relname, a.attnum), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')),
  'rls', (
    select coalesce(jsonb_agg(jsonb_build_object('tabela', c.relname, 'rls', c.relrowsecurity, 'forcada', c.relforcerowsecurity)
      order by c.relname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')),
  'politicas', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', tablename, 'politica', policyname, 'cmd', cmd, 'permissiva', permissive,
      'papeis', to_jsonb(roles),
      'usingMd5', md5(coalesce(qual, '')), 'checkMd5', md5(coalesce(with_check, ''))
    ) order by tablename, policyname), '[]'::jsonb)
    from pg_policies where schemaname = 'public'),
  'grantsTabela', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'papel', r.rolname,
      'privilegios', (select jsonb_agg(pr order by pr) from unnest(array['SELECT','INSERT','UPDATE','DELETE']) pr
                      where has_table_privilege(r.rolname, c.oid, pr))
    ) order by c.relname, r.rolname), '[]'::jsonb)
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) r
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
      and (has_table_privilege(r.rolname, c.oid, 'SELECT') or has_table_privilege(r.rolname, c.oid, 'INSERT')
        or has_table_privilege(r.rolname, c.oid, 'UPDATE') or has_table_privilege(r.rolname, c.oid, 'DELETE'))),
  'gatilhos', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'gatilho', t.tgname, 'habilitado', t.tgenabled <> 'D',
      'funcao', (select proname from pg_proc where oid = t.tgfoid),
      'defMd5', md5(pg_get_triggerdef(t.oid))
    ) order by c.relname, t.tgname), '[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal),
  'restricoes', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'tabela', c.relname, 'restricao', k.conname, 'tipo', k.contype,
      'defMd5', md5(pg_get_constraintdef(k.oid))
    ) order by c.relname, k.conname), '[]'::jsonb)
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and k.contype in ('c', 'u', 'f', 'p'))
));
