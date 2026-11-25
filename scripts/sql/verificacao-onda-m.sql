-- VERIFICACAO DE ONDA M (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Fase 7 (H6e): papel TENANT_ADMIN (tenant_admins, tenant_admin_audit append-only, acc_is_tenant_admin) e dados globais de organizacoes externas so por TENANT_ADMIN. Cauda apos L (redefine acc_external_assert_global_admin e acc_external_org_visible criadas em 20261203*/20261209101000); nao toca record_risk_alert_action (P0 conferido apos o arquivo). Sem TENANT_ADMIN registrado as alteracoes globais ficam bloqueadas (fail-closed); bootstrap por manutencao, a parte (docs/permissoes-matriz-central.md)
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-m.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-m.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261211100000_tenant_admin_global_external_data', 'tabela', 'tenant_admins', to_regclass('public.tenant_admins') is not null),
    ('20261211100000_tenant_admin_global_external_data', 'tabela', 'tenant_admin_audit', to_regclass('public.tenant_admin_audit') is not null),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'tenant_admins_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'tenant_admins_guard')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'tenant_admin_audit_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'tenant_admin_audit_guard')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'acc_is_tenant_admin', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_is_tenant_admin')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'acc_external_assert_global_admin', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_assert_global_admin')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'acc_external_org_visible', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_org_visible'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261211100000_tenant_admin_global_external_data', 'tabela', 'tenant_admins', to_regclass('public.tenant_admins') is not null),
    ('20261211100000_tenant_admin_global_external_data', 'tabela', 'tenant_admin_audit', to_regclass('public.tenant_admin_audit') is not null),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'tenant_admins_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'tenant_admins_guard')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'tenant_admin_audit_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'tenant_admin_audit_guard')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'acc_is_tenant_admin', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_is_tenant_admin')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'acc_external_assert_global_admin', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_assert_global_admin')),
    ('20261211100000_tenant_admin_global_external_data', 'funcao', 'acc_external_org_visible', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_org_visible'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
