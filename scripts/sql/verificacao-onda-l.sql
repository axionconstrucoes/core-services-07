-- VERIFICACAO DE ONDA L (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Fase 6: revalidacao de competencias e conteudo de envio (H2a), pilares e revisao de sinais (H2b), organizacoes globais so ADMIN (H2b) e area QUALIDADE no SLA (H2c). Cauda apos K e apos o portao P0; nenhuma redefine record_risk_alert_action (P0 conferido apos cada arquivo). Ordem operacional obrigatoria de competencias: aplicar 20261208 -> designar validador -> revalidar -> so entao atos criticos (docs/implantacao/12)
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-l.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-l.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261208100000_competence_revalidation_send_content', 'tabela', 'external_send_preparation_contents', to_regclass('public.external_send_preparation_contents') is not null),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidation_status', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidation_status')),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidated_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidated_by')),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidated_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidated_at')),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidation_note', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidation_note')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_user_has_competence', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_user_has_competence')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_int_require_competence', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_int_require_competence')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'project_competence_revalidate', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'project_competence_revalidate')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_external_send_content_hash', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_send_content_hash')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_external_send_prepare_with_content', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_send_prepare_with_content')),
    ('20261209100000_email_signal_pillars_and_review', 'tabela', 'email_signal_review_audit', to_regclass('public.email_signal_review_audit') is not null),
    ('20261209100000_email_signal_pillars_and_review', 'tabela', 'email_signal_review_delegations', to_regclass('public.email_signal_review_delegations') is not null),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.functional_area', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'functional_area')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.legacy_pillar', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'legacy_pillar')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.review_status', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'review_status')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.reviewed_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'reviewed_by')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.reviewed_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'reviewed_at')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.review_note', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'review_note')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_risk_signals_classification_kind_uidx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_risk_signals_classification_kind_uidx')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_risk_signals_review_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_risk_signals_review_idx')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_signal_review_audit_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_signal_review_audit_project_idx')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_signal_review_delegations_lookup_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_signal_review_delegations_lookup_idx')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_functional_area_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_functional_area_for')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_impact_pillar_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_impact_pillar_for')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_risk_signals_normalize', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_risk_signals_normalize')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_review_audit_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_review_audit_guard')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_review_audit_write', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_review_audit_write')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'acc_email_signal_delegate_grant', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_email_signal_delegate_grant')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'acc_email_signal_delegate_revoke', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_email_signal_delegate_revoke')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_risk_signal_review', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_risk_signal_review')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'tabela', 'external_org_change_requests', to_regclass('public.external_org_change_requests') is not null),
    ('20261209101000_external_org_global_admin_and_change_requests', 'indice', 'external_org_change_requests_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'external_org_change_requests_project_idx')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_assert_global_admin', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_assert_global_admin')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_org_save', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_org_save')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_domain_set', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_domain_set')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_contact_set', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_contact_set')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_change_request', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_change_request')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_change_decide', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_change_decide')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_change_cancel', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_change_cancel')),
    ('20261210100000_quality_alert_area_sla', 'sem-objeto-novo', '(redefine funcoes/politicas/dados: conferir P0 e docs/implantacao/03)', null::boolean)
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261208100000_competence_revalidation_send_content', 'tabela', 'external_send_preparation_contents', to_regclass('public.external_send_preparation_contents') is not null),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidation_status', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidation_status')),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidated_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidated_by')),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidated_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidated_at')),
    ('20261208100000_competence_revalidation_send_content', 'coluna', 'project_competences.revalidation_note', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_competences' and column_name = 'revalidation_note')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_user_has_competence', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_user_has_competence')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_int_require_competence', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_int_require_competence')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'project_competence_revalidate', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'project_competence_revalidate')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_external_send_content_hash', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_send_content_hash')),
    ('20261208100000_competence_revalidation_send_content', 'funcao', 'acc_external_send_prepare_with_content', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_send_prepare_with_content')),
    ('20261209100000_email_signal_pillars_and_review', 'tabela', 'email_signal_review_audit', to_regclass('public.email_signal_review_audit') is not null),
    ('20261209100000_email_signal_pillars_and_review', 'tabela', 'email_signal_review_delegations', to_regclass('public.email_signal_review_delegations') is not null),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.functional_area', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'functional_area')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.legacy_pillar', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'legacy_pillar')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.review_status', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'review_status')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.reviewed_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'reviewed_by')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.reviewed_at', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'reviewed_at')),
    ('20261209100000_email_signal_pillars_and_review', 'coluna', 'email_risk_signals.review_note', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'review_note')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_risk_signals_classification_kind_uidx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_risk_signals_classification_kind_uidx')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_risk_signals_review_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_risk_signals_review_idx')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_signal_review_audit_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_signal_review_audit_project_idx')),
    ('20261209100000_email_signal_pillars_and_review', 'indice', 'email_signal_review_delegations_lookup_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_signal_review_delegations_lookup_idx')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_functional_area_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_functional_area_for')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_impact_pillar_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_impact_pillar_for')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_risk_signals_normalize', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_risk_signals_normalize')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_review_audit_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_review_audit_guard')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_signal_review_audit_write', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_signal_review_audit_write')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'acc_email_signal_delegate_grant', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_email_signal_delegate_grant')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'acc_email_signal_delegate_revoke', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_email_signal_delegate_revoke')),
    ('20261209100000_email_signal_pillars_and_review', 'funcao', 'email_risk_signal_review', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_risk_signal_review')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'tabela', 'external_org_change_requests', to_regclass('public.external_org_change_requests') is not null),
    ('20261209101000_external_org_global_admin_and_change_requests', 'indice', 'external_org_change_requests_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'external_org_change_requests_project_idx')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_assert_global_admin', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_assert_global_admin')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_org_save', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_org_save')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_domain_set', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_domain_set')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_contact_set', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_contact_set')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_change_request', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_change_request')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_change_decide', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_change_decide')),
    ('20261209101000_external_org_global_admin_and_change_requests', 'funcao', 'acc_external_change_cancel', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'acc_external_change_cancel')),
    ('20261210100000_quality_alert_area_sla', 'sem-objeto-novo', '(redefine funcoes/politicas/dados: conferir P0 e docs/implantacao/03)', null::boolean)
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
