-- VERIFICACAO DE ONDA F (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Fluxo de aprovacao de reemissao
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-f.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-f.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261121178000_reissue_approval_flow', 'funcao', 'risk_alert_reissue_evaluate', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'risk_alert_reissue_evaluate')),
    ('20261121178000_reissue_approval_flow', 'funcao', 'risk_alert_reissue_pending', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'risk_alert_reissue_pending')),
    ('20261121178000_reissue_approval_flow', 'funcao', 'risk_alert_reissue_approve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'risk_alert_reissue_approve'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261121178000_reissue_approval_flow', 'funcao', 'risk_alert_reissue_evaluate', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'risk_alert_reissue_evaluate')),
    ('20261121178000_reissue_approval_flow', 'funcao', 'risk_alert_reissue_pending', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'risk_alert_reissue_pending')),
    ('20261121178000_reissue_approval_flow', 'funcao', 'risk_alert_reissue_approve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'risk_alert_reissue_approve'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
