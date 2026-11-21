-- VERIFICACAO DE ONDA J (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Fase 4 D: controles de destinatario externo (apos o portao P0; nao toca record_risk_alert_action)
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-j.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-j.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261127100000_external_recipient_controls', 'tabela', 'acc_recipient_domains', to_regclass('public.acc_recipient_domains') is not null),
    ('20261127100000_external_recipient_controls', 'tabela', 'external_recipient_confirmations', to_regclass('public.external_recipient_confirmations') is not null),
    ('20261127100000_external_recipient_controls', 'indice', 'external_recipient_confirmations_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'external_recipient_confirmations_project_idx')),
    ('20261127100000_external_recipient_controls', 'indice', 'external_recipient_confirmations_lookup_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'external_recipient_confirmations_lookup_idx')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_email_normalize', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_email_normalize')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_recipient_domains_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_recipient_domains_guard')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_recipient_domain_status', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_recipient_domain_status')),
    ('20261127100000_external_recipient_controls', 'funcao', 'external_recipient_confirmations_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'external_recipient_confirmations_guard')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_external_recipient_confirmed', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_recipient_confirmed')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_external_recipient_confirm', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_recipient_confirm')),
    ('20261127100000_external_recipient_controls', 'funcao', 'insurance_channel_recipient_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'insurance_channel_recipient_guard'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261127100000_external_recipient_controls', 'tabela', 'acc_recipient_domains', to_regclass('public.acc_recipient_domains') is not null),
    ('20261127100000_external_recipient_controls', 'tabela', 'external_recipient_confirmations', to_regclass('public.external_recipient_confirmations') is not null),
    ('20261127100000_external_recipient_controls', 'indice', 'external_recipient_confirmations_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'external_recipient_confirmations_project_idx')),
    ('20261127100000_external_recipient_controls', 'indice', 'external_recipient_confirmations_lookup_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'external_recipient_confirmations_lookup_idx')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_email_normalize', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_email_normalize')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_recipient_domains_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_recipient_domains_guard')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_recipient_domain_status', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_recipient_domain_status')),
    ('20261127100000_external_recipient_controls', 'funcao', 'external_recipient_confirmations_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'external_recipient_confirmations_guard')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_external_recipient_confirmed', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_recipient_confirmed')),
    ('20261127100000_external_recipient_controls', 'funcao', 'acc_external_recipient_confirm', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_recipient_confirm')),
    ('20261127100000_external_recipient_controls', 'funcao', 'insurance_channel_recipient_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'insurance_channel_recipient_guard'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
