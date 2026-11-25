-- VERIFICACAO DE INTEGRIDADE (SOMENTE LEITURA) apos reverter o congelamento e retomar os jobs. Compare com o baseline registrado antes da janela.
-- Fingerprints: ACL de funcoes e tabelas de public, politicas (public e storage), gatilhos de public, agenda/estado do pg_cron, historico de migrations e corpo do P0.
-- Residuos do congelamento esperados = 0: tabelas auxiliares, politicas de Storage da janela e gatilho-guarda.
select now() as ts,
  (select md5(string_agg(p.oid::regprocedure::text || coalesce(p.proacl::text, ''), ',' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as acl_funcoes,
  (select md5(string_agg(c.oid::regclass::text || coalesce(c.relacl::text, ''), ',' order by c.oid::regclass::text)) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')) as acl_tabelas,
  (select md5(string_agg(schemaname || '.' || tablename || '.' || policyname || coalesce(qual, '') || coalesce(with_check, ''), ',' order by schemaname, tablename, policyname)) from pg_policies where schemaname in ('public', 'storage')) as politicas,
  (select md5(string_agg(c.relname || '.' || t.tgname, ',' order by c.relname, t.tgname)) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal) as gatilhos,
  (select md5(string_agg(jobid || jobname || schedule || active::text, ',' order by jobid)) from cron.job) as cron,
  (select count(*) filter (where active) from cron.job) as cron_ativos,
  (select md5(string_agg(version || '_' || coalesce(name, ''), ',' order by version)) from supabase_migrations.schema_migrations) as historico,
  (select count(*) from supabase_migrations.schema_migrations) as n_migrations,
  (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid = to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)')) as p0,
  (select count(*) from pg_class where relname in ('acc_congelamento_estado', 'acc_janela_cron_estado') and relnamespace = 'public'::regnamespace) as residuo_tabelas_auxiliares,
  (select count(*) from pg_policies where schemaname = 'storage' and policyname like 'acc_janela_congelamento_%') as residuo_politicas_storage,
  (select count(*) from pg_trigger where tgname = 'acc_congelamento_guard' and not tgisinternal) as residuo_gatilhos_guarda,
  (select count(*) from pg_proc where proname = 'acc_congelamento_guard') as residuo_funcao_guarda,
  (select count(*) from public.audit_log_entries) as n_audit,
  (select count(*) from public.project_memberships m join auth.users u on u.id = m.user_id where u.email like 'jwt-teste-%') as vinculos_temporarios;
