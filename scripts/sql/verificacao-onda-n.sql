-- VERIFICACAO DE ONDA N (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Correcao do watchdog do agendador (acc_scheduler_watchdog): resolve o projeto dos incidentes (id fixo da obra WEG se existir; senao o projeto mais antigo; sem projeto, nao registra e retorna). Cauda apos M (ultima onda, decisao conservadora); redefine apenas a funcao criada em 20261119034721; nao toca record_risk_alert_action nem SLA (P0 conferido apos o arquivo). Efeito nulo em producao (a obra fixa existe); corrige o job acc-watchdog em ambientes sem ela
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-n.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-n.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261212100000_watchdog_project_resolution', 'funcao', 'acc_scheduler_watchdog', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_watchdog'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261212100000_watchdog_project_resolution', 'funcao', 'acc_scheduler_watchdog', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_scheduler_watchdog'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
