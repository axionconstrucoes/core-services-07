-- VERIFICACAO DE ONDA B (SOMENTE LEITURA) - GERADO por scripts/gen-verificacao-onda.mjs; nao edite a mao.
-- Seguranca e permissao de 20/11 (inclui as duas intermediarias de record_risk_alert_action)
-- Uso: psql "$CONN" -v fase=antes  -f scripts/sql/verificacao-onda-b.sql   (esperado: falhas = 0 e todos os objetos novos AUSENTES)
--      psql "$CONN" -v fase=depois -f scripts/sql/verificacao-onda-b.sql   (esperado: falhas = 0 e todos presentes)
-- Sempre rode TAMBEM scripts/sql/p0-verificar-record-risk-alert-action.sql (esperado ok = true).
-- Nada e criado, alterado ou apagado: a transacao e READ ONLY e termina em ROLLBACK.
\if :{?fase}
\else
\set fase depois
\endif
begin read only;
with o(migration, tipo, objeto, existe) as (values
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_authorize_operation', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_authorize_operation')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_assume', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_assume')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_start', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_start')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_complete', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_complete')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_forward')),
    ('20261120110000_risk_case_sla_consistency_guards', 'funcao', 'email_alert_action_risk_case_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_alert_action_risk_case_guard')),
    ('20261120110000_risk_case_sla_consistency_guards', 'funcao', 'audit_sla_action_deadline_changed', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'audit_sla_action_deadline_changed')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'tabela', 'ai_consult_limits', to_regclass('public.ai_consult_limits') is not null),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'tabela', 'ai_consult_usage', to_regclass('public.ai_consult_usage') is not null),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'indice', 'ai_consult_usage_user_day_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ai_consult_usage_user_day_idx')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'indice', 'ai_consult_usage_project_day_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ai_consult_usage_project_day_idx')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'funcao', 'ssma_corrective_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'funcao', 'ai_consult_reserve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve')),
    ('20261120130000_risk_alert_action_server_side_guard', 'funcao', 'record_risk_alert_action', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_risk_alert_action')),
    ('20261120140000_ai_consult_reserve_global_user_lock', 'funcao', 'ai_consult_reserve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve')),
    ('20261120150000_weekly_digest_evidence_and_guards', 'funcao', 'submit_weekly_alert_digest', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_weekly_alert_digest')),
    ('20261120151000_risk_alert_action_no_outbox_authorization', 'funcao', 'record_risk_alert_action', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_risk_alert_action')),
    ('20261120152000_risk_sla_consistency_report_and_email_guards', 'funcao', 'email_alert_action_risk_case_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_alert_action_risk_case_guard')),
    ('20261120153000_null_safe_authorization_checks', 'funcao', 'sla_action_authorize_operation', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_authorize_operation')),
    ('20261120153000_null_safe_authorization_checks', 'funcao', 'ssma_corrective_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'tabela', 'email_reply_tokens', to_regclass('public.email_reply_tokens') is not null),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'tabela', 'email_inbound_attachments', to_regclass('public.email_inbound_attachments') is not null),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'tabela', 'email_reply_inbound_log', to_regclass('public.email_reply_inbound_log') is not null),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'indice', 'email_reply_tokens_subject_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_reply_tokens_subject_idx')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'indice', 'email_inbound_attachments_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_inbound_attachments_project_idx')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'indice', 'email_reply_inbound_log_sender_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_reply_inbound_log_sender_idx')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'project_member_active_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'project_member_active_for')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'project_permission_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'project_permission_for')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_update_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_update_core')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_update', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_update')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_update_by_email', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_update_by_email')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_forward_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward_core')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_forward_by_email', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward_by_email')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_field_record_register_photo_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo_core')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_field_record_register_photo', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_field_record_register_photo_by_email', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo_by_email')),
    ('20261120170000_ai_consult_all_expert_paths', 'coluna', 'ai_consult_usage.expert_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_consult_usage' and column_name = 'expert_id')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve_core')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve_expert', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve_expert')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve_for_actor', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve_for_actor')),
    ('20261120190000_null_safe_ssma_cores', 'funcao', 'ssma_corrective_action_forward_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward_core')),
    ('20261120190000_null_safe_ssma_cores', 'funcao', 'ssma_field_record_register_photo_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo_core'))
)
select migration, tipo, objeto, existe,
       case when existe is null or tipo = 'funcao' then null else existe = (:'fase' = 'depois') end as ok
  from o order by migration, tipo, objeto;
with o(migration, tipo, objeto, existe) as (values
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_authorize_operation', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_authorize_operation')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_assume', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_assume')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_start', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_start')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_complete', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_complete')),
    ('20261120100000_sla_action_operations_by_responsible', 'funcao', 'sla_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_forward')),
    ('20261120110000_risk_case_sla_consistency_guards', 'funcao', 'email_alert_action_risk_case_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_alert_action_risk_case_guard')),
    ('20261120110000_risk_case_sla_consistency_guards', 'funcao', 'audit_sla_action_deadline_changed', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'audit_sla_action_deadline_changed')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'tabela', 'ai_consult_limits', to_regclass('public.ai_consult_limits') is not null),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'tabela', 'ai_consult_usage', to_regclass('public.ai_consult_usage') is not null),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'indice', 'ai_consult_usage_user_day_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ai_consult_usage_user_day_idx')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'indice', 'ai_consult_usage_project_day_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'ai_consult_usage_project_day_idx')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'funcao', 'ssma_corrective_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward')),
    ('20261120120000_ssma_forward_and_ai_consult_limits', 'funcao', 'ai_consult_reserve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve')),
    ('20261120130000_risk_alert_action_server_side_guard', 'funcao', 'record_risk_alert_action', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_risk_alert_action')),
    ('20261120140000_ai_consult_reserve_global_user_lock', 'funcao', 'ai_consult_reserve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve')),
    ('20261120150000_weekly_digest_evidence_and_guards', 'funcao', 'submit_weekly_alert_digest', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_weekly_alert_digest')),
    ('20261120151000_risk_alert_action_no_outbox_authorization', 'funcao', 'record_risk_alert_action', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'record_risk_alert_action')),
    ('20261120152000_risk_sla_consistency_report_and_email_guards', 'funcao', 'email_alert_action_risk_case_guard', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'email_alert_action_risk_case_guard')),
    ('20261120153000_null_safe_authorization_checks', 'funcao', 'sla_action_authorize_operation', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'sla_action_authorize_operation')),
    ('20261120153000_null_safe_authorization_checks', 'funcao', 'ssma_corrective_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'tabela', 'email_reply_tokens', to_regclass('public.email_reply_tokens') is not null),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'tabela', 'email_inbound_attachments', to_regclass('public.email_inbound_attachments') is not null),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'tabela', 'email_reply_inbound_log', to_regclass('public.email_reply_inbound_log') is not null),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'indice', 'email_reply_tokens_subject_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_reply_tokens_subject_idx')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'indice', 'email_inbound_attachments_project_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_inbound_attachments_project_idx')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'indice', 'email_reply_inbound_log_sender_idx', exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'email_reply_inbound_log_sender_idx')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'project_member_active_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'project_member_active_for')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'project_permission_for', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'project_permission_for')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_update_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_update_core')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_update', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_update')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_update_by_email', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_update_by_email')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_forward_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward_core')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_forward', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_corrective_action_forward_by_email', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward_by_email')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_field_record_register_photo_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo_core')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_field_record_register_photo', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo')),
    ('20261120160000_email_reply_tokens_and_ssma_by_email', 'funcao', 'ssma_field_record_register_photo_by_email', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo_by_email')),
    ('20261120170000_ai_consult_all_expert_paths', 'coluna', 'ai_consult_usage.expert_id', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'ai_consult_usage' and column_name = 'expert_id')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve_core')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve_expert', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve_expert')),
    ('20261120170000_ai_consult_all_expert_paths', 'funcao', 'ai_consult_reserve_for_actor', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ai_consult_reserve_for_actor')),
    ('20261120190000_null_safe_ssma_cores', 'funcao', 'ssma_corrective_action_forward_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_corrective_action_forward_core')),
    ('20261120190000_null_safe_ssma_cores', 'funcao', 'ssma_field_record_register_photo_core', exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'ssma_field_record_register_photo_core'))
)
select :'fase' as fase,
       count(*) filter (where tipo <> 'funcao' and existe is not null) as objetos_verificados,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) as falhas,
       count(*) filter (where tipo <> 'funcao' and existe is not null and existe <> (:'fase' = 'depois')) = 0 as ok
  from o;
rollback;
