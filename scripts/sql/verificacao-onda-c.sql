-- VERIFICACAO DE ONDA C (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Centralizacao de permissao e residual null-safe (a 090000 NAO e reaplicada)
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-c.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-c.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261121100000_centralize_project_permission_rule', 'funcao', 'has_project_permission', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'has_project_permission')),
    ('20261121100000_centralize_project_permission_rule', 'funcao', 'is_project_member', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'is_project_member')),
    ('20261121101000_null_safe_authorization_residual', 'funcao', 'record_risk_alert_action', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_risk_alert_action')),
    ('20261121101000_null_safe_authorization_residual', 'funcao', 'email_alert_action_risk_case_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_alert_action_risk_case_guard')),
    ('20261121101000_null_safe_authorization_residual', 'funcao', 'finalize_ssma_form_submission', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'finalize_ssma_form_submission'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261121100000_centralize_project_permission_rule', 'funcao', 'has_project_permission', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'has_project_permission')),
    ('20261121100000_centralize_project_permission_rule', 'funcao', 'is_project_member', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'is_project_member')),
    ('20261121101000_null_safe_authorization_residual', 'funcao', 'record_risk_alert_action', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_risk_alert_action')),
    ('20261121101000_null_safe_authorization_residual', 'funcao', 'email_alert_action_risk_case_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_alert_action_risk_case_guard')),
    ('20261121101000_null_safe_authorization_residual', 'funcao', 'finalize_ssma_form_submission', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'finalize_ssma_form_submission'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
