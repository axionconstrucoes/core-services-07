-- VERIFICACAO DE ONDA A (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Fora de ordem (versao menor que a ultima remota)
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-a.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-a.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261107090000_email_mailbox_collection_controls', 'tabela', 'email_mailbox_collection_controls', to_regclass('public.email_mailbox_collection_controls') is not null),
    ('20261107090000_email_mailbox_collection_controls', 'indice', 'email_mailbox_collection_controls_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_mailbox_collection_controls_project_idx')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'register_mailbox_corporate_authorization', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'register_mailbox_corporate_authorization')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'set_mailbox_collection', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'set_mailbox_collection')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'revoke_mailbox_collection', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'revoke_mailbox_collection')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'record_mailbox_technical_check', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_technical_check')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'record_mailbox_sync_result', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_sync_result')),
    ('20261116090000_list_addable_profiles_for_project', 'funcao', 'list_addable_profiles_for_project', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'list_addable_profiles_for_project')),
    ('20261118140000_sla_matrix_rules_unique_active_key', 'indice', 'sla_matrix_rules_active_key_unique', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'sla_matrix_rules_active_key_unique'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261107090000_email_mailbox_collection_controls', 'tabela', 'email_mailbox_collection_controls', to_regclass('public.email_mailbox_collection_controls') is not null),
    ('20261107090000_email_mailbox_collection_controls', 'indice', 'email_mailbox_collection_controls_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_mailbox_collection_controls_project_idx')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'register_mailbox_corporate_authorization', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'register_mailbox_corporate_authorization')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'set_mailbox_collection', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'set_mailbox_collection')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'revoke_mailbox_collection', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'revoke_mailbox_collection')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'record_mailbox_technical_check', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_technical_check')),
    ('20261107090000_email_mailbox_collection_controls', 'funcao', 'record_mailbox_sync_result', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_mailbox_sync_result')),
    ('20261116090000_list_addable_profiles_for_project', 'funcao', 'list_addable_profiles_for_project', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'list_addable_profiles_for_project')),
    ('20261118140000_sla_matrix_rules_unique_active_key', 'indice', 'sla_matrix_rules_active_key_unique', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'sla_matrix_rules_active_key_unique'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
