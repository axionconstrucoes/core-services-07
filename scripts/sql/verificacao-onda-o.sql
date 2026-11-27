-- VERIFICACAO DE ONDA O (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Coleta Gmail por caixa (estado visivel por caixa: ultima importada, origem da credencial e escopos; opcao de e-mail somente interno DESLIGADA; RPCs record_mailbox_collection_progress, record_mailbox_oauth_state e add_project_ingestion_mailbox). Cauda apos N; depende de 20261107090000/20261121110000/20261201100000 (ja aplicadas no remoto); sem publicacao de app obrigatoria (o coletor detecta a ausencia e volta ao modo historico).
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-o.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-o.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.last_imported_message_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'last_imported_message_id')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.last_imported_message_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'last_imported_message_at')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.credential_source', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'credential_source')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.granted_scopes', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'granted_scopes')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.oauth_checked_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'oauth_checked_at')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'project_email_ingestion_configs.include_internal_only_messages', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_email_ingestion_configs' and column_name = 'include_internal_only_messages')),
    ('20261214100000_gmail_per_mailbox_collection', 'funcao', 'record_mailbox_collection_progress', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_collection_progress')),
    ('20261214100000_gmail_per_mailbox_collection', 'funcao', 'record_mailbox_oauth_state', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_oauth_state')),
    ('20261214100000_gmail_per_mailbox_collection', 'funcao', 'add_project_ingestion_mailbox', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'add_project_ingestion_mailbox'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.last_imported_message_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'last_imported_message_id')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.last_imported_message_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'last_imported_message_at')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.credential_source', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'credential_source')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.granted_scopes', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'granted_scopes')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'email_mailbox_collection_controls.oauth_checked_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'oauth_checked_at')),
    ('20261214100000_gmail_per_mailbox_collection', 'coluna', 'project_email_ingestion_configs.include_internal_only_messages', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_email_ingestion_configs' and column_name = 'include_internal_only_messages')),
    ('20261214100000_gmail_per_mailbox_collection', 'funcao', 'record_mailbox_collection_progress', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_collection_progress')),
    ('20261214100000_gmail_per_mailbox_collection', 'funcao', 'record_mailbox_oauth_state', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_oauth_state')),
    ('20261214100000_gmail_per_mailbox_collection', 'funcao', 'add_project_ingestion_mailbox', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'add_project_ingestion_mailbox'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
