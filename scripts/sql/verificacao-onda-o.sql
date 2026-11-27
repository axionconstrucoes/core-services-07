-- VERIFICACAO DE ONDA O (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Estado efetivo das integracoes: nova funcao somente leitura acc_scheduler_status_for_project(uuid) (SECURITY DEFINER, search_path vazio, exige is_project_member; nunca devolve cron.job.command nem segredos). Cauda apos N; nao toca record_risk_alert_action nem SLA. Rollback: drop da funcao
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
    ('20261213100000_scheduler_status_for_project', 'funcao', 'acc_scheduler_status_for_project', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_status_for_project'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261213100000_scheduler_status_for_project', 'funcao', 'acc_scheduler_status_for_project', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_status_for_project'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
