-- VERIFICACAO DE ONDA novas (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Migrations novas ainda fora do JSON (ex.: H2a/H2b/H2c); ver procedimento em docs/implantacao/12
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-novas.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-novas.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261213100000_scheduler_supervision_authorized_pauses', 'tabela', 'acc_scheduler_authorized_pauses', to_regclass('public.acc_scheduler_authorized_pauses') is not null),
    ('20261213100000_scheduler_supervision_authorized_pauses', 'indice', 'acc_scheduler_authorized_pauses_open_uidx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'acc_scheduler_authorized_pauses_open_uidx')),
    ('20261213100000_scheduler_supervision_authorized_pauses', 'funcao', 'acc_scheduler_watchdog', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_watchdog')),
    ('20261213100000_scheduler_supervision_authorized_pauses', 'funcao', 'acc_scheduler_watchdog_liveness', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_watchdog_liveness'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261213100000_scheduler_supervision_authorized_pauses', 'tabela', 'acc_scheduler_authorized_pauses', to_regclass('public.acc_scheduler_authorized_pauses') is not null),
    ('20261213100000_scheduler_supervision_authorized_pauses', 'indice', 'acc_scheduler_authorized_pauses_open_uidx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'acc_scheduler_authorized_pauses_open_uidx')),
    ('20261213100000_scheduler_supervision_authorized_pauses', 'funcao', 'acc_scheduler_watchdog', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_watchdog')),
    ('20261213100000_scheduler_supervision_authorized_pauses', 'funcao', 'acc_scheduler_watchdog_liveness', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_watchdog_liveness'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
