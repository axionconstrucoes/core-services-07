-- VERIFICACAO SOMENTE LEITURA do estado de congelamento (rodar durante a janela e apos a reversao). Nada e alterado.
-- Durante a janela: ver a coluna "congelado". Apos reverter: gatilhos = 0, politicas = 0, sem estado.
select 'tabelas_base_public' as item, count(*)::text as valor, '(informativo)' as congelado
  from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p') and c.relname <> 'acc_congelamento_estado'
union all
select 'tabelas_com_gatilho_guarda', count(*)::text, '= tabelas_base_public' from pg_trigger where tgname = 'acc_congelamento_guard' and not tgisinternal
union all
select 'tabelas_views_com_escrita_para_anon_authenticated', count(*)::text, '0' from pg_class c
 where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'f') and c.relname <> 'acc_congelamento_estado'
   and (has_table_privilege('authenticated', c.oid, 'INSERT') or has_table_privilege('authenticated', c.oid, 'UPDATE') or has_table_privilege('authenticated', c.oid, 'DELETE')
     or has_any_column_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'UPDATE')
     or has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE')
     or has_any_column_privilege('anon', c.oid, 'INSERT') or has_any_column_privilege('anon', c.oid, 'UPDATE'))
union all
select 'politicas_restritivas_storage_janela', count(*)::text, '3' from pg_policies where schemaname = 'storage' and policyname like 'acc_janela_congelamento_%'
union all
select 'privilegios_guardados_para_reversao', (select count(*)::text from pg_class where relname = 'acc_congelamento_estado' and relnamespace = 'public'::regnamespace), '1 = estado presente (conteudo: select count(*) from public.acc_congelamento_estado)';
-- pg_cron (rodar a parte, so existe no Supabase): select count(*) filter (where active) as ativos_esperado_0 from cron.job;
