# 08 - Relatorio do ensaio por ondas (PostgreSQL 17.12 local, base descartavel)

Gerado por `scripts/ensaio-implantacao-ondas-realpg.mjs` (somente local; nenhuma aplicacao operacional). Resultado: **105 verificacoes OK, 0 falha(s)**.
Espelho do remoto: 134 migrations registradas + hotfix P0 efetivo + dados representativos sinteticos (2 obras, 8 perfis, regras de SLA como no remoto, 9 acoes MEDIO/BAIXO abertas, acoes concluidas, 1 caso de alerta). Cada arquivo e uma transacao (lock_timeout 5s, statement_timeout 120s). Depois de CADA migration: verificacao estatica P0 (corpo md5 sem CR = 930f6d75898793479b418950b0053bd9, SECURITY DEFINER, search_path vazio, sem EXECUTE para anon/PUBLIC) e sondas reais negativas (LEITURA, COLABORADOR sem papel e anon recusados, caso inalterado).
Tempos sao de banco pequeno e vazio de contencao, em maquina local: servem como ordem de grandeza e como prova de ausencia de locks fortes longos, nao como previsao do remoto.

## Variante LF
| Onda | Migration | Tempo (ms) | Locks fortes em tabelas preexistentes | P0 | Avisos |
|---|---|--:|---|---|---|
| A | 20261107090000_email_mailbox_collection_controls | 15 | email_access_authorizations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | constraint "email_triage_results_event_consistency_check" of relation "email_triage_results" does not exist, skipping policy "project_documents_storage_select_m |
| A | 20261116090000_list_addable_profiles_for_project | 3 | nenhum | protegido |  |
| A | 20261118140000_sla_matrix_rules_unique_active_key | 4 | sla_matrix_rules:ShareLock | protegido |  |
| B | 20261120100000_sla_action_operations_by_responsible | 4 | nenhum | protegido |  |
| B | 20261120110000_risk_case_sla_consistency_guards | 3 | email_alert_actions:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | trigger "email_alert_actions_risk_case_guard" for relation "public.email_alert_actions" does not exist, skipping trigger "sla_actions_audit_deadline_changed" fo |
| B | 20261120120000_ssma_forward_and_ai_consult_limits | 18 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_usage_select_members" for relation "public.ai_consult_usage" does not exist, skipping policy "ai_consult_limits_select_authenticated" for rel |
| B | 20261120130000_risk_alert_action_server_side_guard | 2 | nenhum | protegido |  |
| B | 20261120140000_ai_consult_reserve_global_user_lock | 2 | nenhum | protegido |  |
| B | 20261120150000_weekly_digest_evidence_and_guards | 3 | nenhum | protegido |  |
| B | 20261120151000_risk_alert_action_no_outbox_authorization | 3 | nenhum | protegido |  |
| B | 20261120152000_risk_sla_consistency_report_and_email_guards | 5 | nenhum | protegido |  |
| B | 20261120153000_null_safe_authorization_checks | 3 | nenhum | protegido |  |
| B | 20261120160000_email_reply_tokens_and_ssma_by_email | 21 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| B | 20261120170000_ai_consult_all_expert_paths | 5 | ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido | constraint "ai_consult_usage_expert_id_check" of relation "ai_consult_usage" does not exist, skipping |
| B | 20261120190000_null_safe_ssma_cores | 3 | nenhum | protegido |  |
| C | 20261121100000_centralize_project_permission_rule | 2 | nenhum | protegido |  |
| C | 20261121101000_null_safe_authorization_residual | 5 | nenhum | protegido |  |
| D | 20261121110000_email_mailbox_controls_hardening | 4 | email_access_authorizations:ShareRowExclusiveLock; email_mailbox_collection_controls:AccessExclusiveLock; email_mailbox_collection_controls:ShareRowExclusiveLock | protegido | constraint "email_mailbox_controls_consent_blocks_collection" of relation "email_mailbox_collection_controls" does not exist, skipping trigger "email_mailbox_co |
| D | 20261121120000_email_replies_sla_digest_contract_by_email | 18 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121130000_outbound_delivery_states | 30 | acc_system_health_incidents:ShareRowExclusiveLock; construmanager_version_review_deliveries:AccessExclusiveLock; construmanager_version_review_deliveries:ShareRowExclusiveLock; notification_email_deliveries:AccessExclusiveLock; notification_email_deliveries:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_outbox:AccessExclusiveLock; risk_alert_outbox:ShareRowExclusiveLock; ssma_accident_notification_deliveries:AccessExclusiveLock; ssma_accident_notification_deliveries:ShareRowExclusiveLock; ssma_field_notification_deliveries:AccessExclusiveLock; ssma_field_notification_deliveries:ShareRowExclusiveLock | protegido | trigger "risk_alert_outbox_delivery_guard" for relation "public.risk_alert_outbox" does not exist, skipping trigger "ssma_accident_deliveries_delivery_guard" fo |
| D | 20261121150000_ai_consult_governance | 11 | ai_consult_usage:AccessExclusiveLock | protegido | constraint "ai_consult_usage_estimated_cost_micros_check" of relation "ai_consult_usage" does not exist, skipping |
| D | 20261121160000_revoke_anon_list_addable_profiles | 3 | nenhum | protegido |  |
| D | 20261121170000_l2_revoke_anon_trigger_functions | 2 | nenhum | protegido |  |
| D | 20261121171000_l2_forecast_followup_and_guards | 18 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_action_events:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | policy "sla_action_followup_events_select_members" for relation "public.sla_action_followup_events" does not exist, skipping trigger "risk_alert_action_events_f |
| D | 20261121172000_l2_sla_forward_by_email_audit | 2 | nenhum | protegido |  |
| D | 20261121173000_email_specialist_consultations | 17 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121174000_ai_consult_audit | 10 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_audit_select_author_or_admin" for relation "public.ai_consult_audit" does not exist, skipping |
| D | 20261121175000_audit_delete_proposals_and_findings | 2 | ai_findings:ShareRowExclusiveLock; project_additional_proposals:ShareRowExclusiveLock | protegido | trigger "project_additional_proposals_audit_deleted" for relation "public.project_additional_proposals" does not exist, skipping trigger "ai_findings_audit_dele |
| D | 20261121176000_risk_sla_consistency_closed_by_source | 6 | nenhum | protegido |  |
| F | 20261121178000_reissue_approval_flow | 3 | nenhum | protegido |  |
| G | 20261122100000_quality_foundation | 181 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "quality_state_events_append_only" for relation "public.quality_state_events" does not exist, skipping trigger "quality_requirements_touch" for relation |
| G | 20261122101000_quality_rpcs | 11 | quality_customer_complaints:ShareRowExclusiveLock; quality_inspections:ShareRowExclusiveLock; quality_requirements:ShareRowExclusiveLock; quality_tests:ShareRowExclusiveLock; quality_warranty_cases:ShareLock | protegido | trigger "quality_requirements_code" for relation "public.quality_requirements" does not exist, skipping trigger "quality_customer_complaints_code" for relation  |
| G | 20261122200000_seguros_garantias_model | 129 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_audit_events_append_only" for relation "public.insurance_audit_events" does not exist, skipping trigger "insurance_audit_events_no_truncate"  |
| G | 20261122201000_seguros_garantias_rpcs | 13 | nenhum | protegido |  |
| G | 20261122300000_quality_analyst_expert_id | 27 | ai_consult_audit:AccessExclusiveLock; ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; email_specialist_consultations:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido |  |
| H1 | 20261123100000_acc_project_tier | 2 | nenhum | protegido |  |
| H1 | 20261123101000_unified_permission_wrappers | 3 | nenhum | protegido |  |
| H1 | 20261123102000_insurance_claim_advance_manage_stages | 2 | nenhum | protegido |  |
| H1 | 20261123200000_endorsement_dual_review | 23 | insurance_endorsements:AccessExclusiveLock; insurance_endorsements:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_endorsement_reviews_prepare" for relation "public.insurance_endorsement_reviews" does not exist, skipping trigger "insurance_endorsements_gua |
| H1 | 20261123300000_quality_integrity_guards | 17 | quality_evidence:ShareRowExclusiveLock; quality_ncrs:ShareRowExclusiveLock; quality_state_events:ShareLock; quality_warranty_cases:AccessExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock; quality_warranty_repairs:AccessExclusiveLock | protegido | trigger "quality_ncrs_state_guard_trg" for relation "public.quality_ncrs" does not exist, skipping trigger "quality_warranty_cases_state_guard_trg" for relation |
| H1 | 20261123301000_quality_rpcs_children | 10 | nenhum | protegido |  |
| H1 | 20261123303000_acc_alert_links | 27 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_cases:ShareLock; risk_alert_cases:ShareRowExclusiveLock | protegido | trigger "acc_alert_link_events_append_only" for relation "public.acc_alert_link_events" does not exist, skipping trigger "acc_alert_links_guard_trg" for relatio |
| H1 | 20261123400000_f3e_persistence_model | 45 | documents:ShareRowExclusiveLock; insurance_claims:ShareRowExclusiveLock; insurance_policies:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock | protegido | trigger "quality_warranty_coverage_opinions_append_only" for relation "public.quality_warranty_coverage_opinions" does not exist, skipping trigger "quality_warr |
| H1 | 20261123401000_f3e_warranty_opinion_rpcs | 4 | nenhum | protegido |  |
| H1 | 20261123402000_f3e_insurance_persistence_rpcs | 4 | nenhum | protegido |  |
| P0 | 20261126100000_p0_gate_record_risk_alert_action | 4 | nenhum | protegido |  |

Total de migrations (soma): 727 ms.

## Variante CRLF (checkout Windows)
| Onda | Migration | Tempo (ms) | Locks fortes em tabelas preexistentes | P0 | Avisos |
|---|---|--:|---|---|---|
| A | 20261107090000_email_mailbox_collection_controls | 18 | email_access_authorizations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | constraint "email_triage_results_event_consistency_check" of relation "email_triage_results" does not exist, skipping policy "project_documents_storage_select_m |
| A | 20261116090000_list_addable_profiles_for_project | 2 | nenhum | protegido |  |
| A | 20261118140000_sla_matrix_rules_unique_active_key | 4 | sla_matrix_rules:ShareLock | protegido |  |
| B | 20261120100000_sla_action_operations_by_responsible | 3 | nenhum | protegido |  |
| B | 20261120110000_risk_case_sla_consistency_guards | 3 | email_alert_actions:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | trigger "email_alert_actions_risk_case_guard" for relation "public.email_alert_actions" does not exist, skipping trigger "sla_actions_audit_deadline_changed" fo |
| B | 20261120120000_ssma_forward_and_ai_consult_limits | 17 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_usage_select_members" for relation "public.ai_consult_usage" does not exist, skipping policy "ai_consult_limits_select_authenticated" for rel |
| B | 20261120130000_risk_alert_action_server_side_guard | 2 | nenhum | protegido |  |
| B | 20261120140000_ai_consult_reserve_global_user_lock | 3 | nenhum | protegido |  |
| B | 20261120150000_weekly_digest_evidence_and_guards | 4 | nenhum | protegido |  |
| B | 20261120151000_risk_alert_action_no_outbox_authorization | 3 | nenhum | protegido |  |
| B | 20261120152000_risk_sla_consistency_report_and_email_guards | 6 | nenhum | protegido |  |
| B | 20261120153000_null_safe_authorization_checks | 4 | nenhum | protegido |  |
| B | 20261120160000_email_reply_tokens_and_ssma_by_email | 23 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| B | 20261120170000_ai_consult_all_expert_paths | 6 | ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido | constraint "ai_consult_usage_expert_id_check" of relation "ai_consult_usage" does not exist, skipping |
| B | 20261120190000_null_safe_ssma_cores | 3 | nenhum | protegido |  |
| C | 20261121100000_centralize_project_permission_rule | 1 | nenhum | protegido |  |
| C | 20261121101000_null_safe_authorization_residual | 5 | nenhum | protegido |  |
| D | 20261121110000_email_mailbox_controls_hardening | 7 | email_access_authorizations:ShareRowExclusiveLock; email_mailbox_collection_controls:AccessExclusiveLock; email_mailbox_collection_controls:ShareRowExclusiveLock | protegido | constraint "email_mailbox_controls_consent_blocks_collection" of relation "email_mailbox_collection_controls" does not exist, skipping trigger "email_mailbox_co |
| D | 20261121120000_email_replies_sla_digest_contract_by_email | 23 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121130000_outbound_delivery_states | 31 | acc_system_health_incidents:ShareRowExclusiveLock; construmanager_version_review_deliveries:AccessExclusiveLock; construmanager_version_review_deliveries:ShareRowExclusiveLock; notification_email_deliveries:AccessExclusiveLock; notification_email_deliveries:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_outbox:AccessExclusiveLock; risk_alert_outbox:ShareRowExclusiveLock; ssma_accident_notification_deliveries:AccessExclusiveLock; ssma_accident_notification_deliveries:ShareRowExclusiveLock; ssma_field_notification_deliveries:AccessExclusiveLock; ssma_field_notification_deliveries:ShareRowExclusiveLock | protegido | trigger "risk_alert_outbox_delivery_guard" for relation "public.risk_alert_outbox" does not exist, skipping trigger "ssma_accident_deliveries_delivery_guard" fo |
| D | 20261121150000_ai_consult_governance | 9 | ai_consult_usage:AccessExclusiveLock | protegido | constraint "ai_consult_usage_estimated_cost_micros_check" of relation "ai_consult_usage" does not exist, skipping |
| D | 20261121160000_revoke_anon_list_addable_profiles | 2 | nenhum | protegido |  |
| D | 20261121170000_l2_revoke_anon_trigger_functions | 2 | nenhum | protegido |  |
| D | 20261121171000_l2_forecast_followup_and_guards | 19 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_action_events:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | policy "sla_action_followup_events_select_members" for relation "public.sla_action_followup_events" does not exist, skipping trigger "risk_alert_action_events_f |
| D | 20261121172000_l2_sla_forward_by_email_audit | 3 | nenhum | protegido |  |
| D | 20261121173000_email_specialist_consultations | 15 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121174000_ai_consult_audit | 11 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_audit_select_author_or_admin" for relation "public.ai_consult_audit" does not exist, skipping |
| D | 20261121175000_audit_delete_proposals_and_findings | 4 | ai_findings:ShareRowExclusiveLock; project_additional_proposals:ShareRowExclusiveLock | protegido | trigger "project_additional_proposals_audit_deleted" for relation "public.project_additional_proposals" does not exist, skipping trigger "ai_findings_audit_dele |
| D | 20261121176000_risk_sla_consistency_closed_by_source | 5 | nenhum | protegido |  |
| F | 20261121178000_reissue_approval_flow | 4 | nenhum | protegido |  |
| G | 20261122100000_quality_foundation | 157 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "quality_state_events_append_only" for relation "public.quality_state_events" does not exist, skipping trigger "quality_requirements_touch" for relation |
| G | 20261122101000_quality_rpcs | 13 | quality_customer_complaints:ShareRowExclusiveLock; quality_inspections:ShareRowExclusiveLock; quality_requirements:ShareRowExclusiveLock; quality_tests:ShareRowExclusiveLock; quality_warranty_cases:ShareLock | protegido | trigger "quality_requirements_code" for relation "public.quality_requirements" does not exist, skipping trigger "quality_customer_complaints_code" for relation  |
| G | 20261122200000_seguros_garantias_model | 123 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_audit_events_append_only" for relation "public.insurance_audit_events" does not exist, skipping trigger "insurance_audit_events_no_truncate"  |
| G | 20261122201000_seguros_garantias_rpcs | 13 | nenhum | protegido |  |
| G | 20261122300000_quality_analyst_expert_id | 28 | ai_consult_audit:AccessExclusiveLock; ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; email_specialist_consultations:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido |  |
| H1 | 20261123100000_acc_project_tier | 2 | nenhum | protegido |  |
| H1 | 20261123101000_unified_permission_wrappers | 3 | nenhum | protegido |  |
| H1 | 20261123102000_insurance_claim_advance_manage_stages | 3 | nenhum | protegido |  |
| H1 | 20261123200000_endorsement_dual_review | 26 | insurance_endorsements:AccessExclusiveLock; insurance_endorsements:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_endorsement_reviews_prepare" for relation "public.insurance_endorsement_reviews" does not exist, skipping trigger "insurance_endorsements_gua |
| H1 | 20261123300000_quality_integrity_guards | 13 | quality_evidence:ShareRowExclusiveLock; quality_ncrs:ShareRowExclusiveLock; quality_state_events:ShareLock; quality_warranty_cases:AccessExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock; quality_warranty_repairs:AccessExclusiveLock | protegido | trigger "quality_ncrs_state_guard_trg" for relation "public.quality_ncrs" does not exist, skipping trigger "quality_warranty_cases_state_guard_trg" for relation |
| H1 | 20261123301000_quality_rpcs_children | 11 | nenhum | protegido |  |
| H1 | 20261123303000_acc_alert_links | 28 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_cases:ShareLock; risk_alert_cases:ShareRowExclusiveLock | protegido | trigger "acc_alert_link_events_append_only" for relation "public.acc_alert_link_events" does not exist, skipping trigger "acc_alert_links_guard_trg" for relatio |
| H1 | 20261123400000_f3e_persistence_model | 36 | documents:ShareRowExclusiveLock; insurance_claims:ShareRowExclusiveLock; insurance_policies:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock | protegido | trigger "quality_warranty_coverage_opinions_append_only" for relation "public.quality_warranty_coverage_opinions" does not exist, skipping trigger "quality_warr |
| H1 | 20261123401000_f3e_warranty_opinion_rpcs | 4 | nenhum | protegido |  |
| H1 | 20261123402000_f3e_insurance_persistence_rpcs | 4 | nenhum | protegido |  |
| P0 | 20261126100000_p0_gate_record_risk_alert_action | 4 | nenhum | protegido |  |

Total de migrations (soma): 708 ms.

## Ondas ensaiadas a parte
- H2 (20261123302000, so com o app): 3 ms; locks: nenhum.
- E (20261121177000, decisao do dono; SO ENSAIO): 8 ms; locks: sla_matrix_rules:ShareRowExclusiveLock.

## Verificacoes (saida completa)
```

=== Variante LF: espelho do remoto (134 registradas + hotfix efetivo) e sequencia por ondas ===
OK   [LF] base: hotfix efetivo e P0 verificado (corpo md5 sem CR 930f6d75898793479b418950b0053bd9; bruto 930f6d75898793479b418950b0053bd9)
[LF] dados representativos: 9 acoes MEDIO/BAIXO abertas; funcoes SECURITY DEFINER com EXECUTE para anon no espelho: 8
OK   [LF] onda A 20261107090000_email_mailbox_collection_controls (15 ms): P0 protegido apos a migration
OK   [LF] onda A 20261116090000_list_addable_profiles_for_project (3 ms): P0 protegido apos a migration
OK   [LF] onda A 20261118140000_sla_matrix_rules_unique_active_key (4 ms): P0 protegido apos a migration
[LF] fim da onda A: 47 ms (inclui verificacoes P0)
OK   [LF] onda B 20261120100000_sla_action_operations_by_responsible (4 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120110000_risk_case_sla_consistency_guards (3 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120120000_ssma_forward_and_ai_consult_limits (18 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120130000_risk_alert_action_server_side_guard (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120140000_ai_consult_reserve_global_user_lock (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120150000_weekly_digest_evidence_and_guards (3 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120151000_risk_alert_action_no_outbox_authorization (3 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120152000_risk_sla_consistency_report_and_email_guards (5 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120153000_null_safe_authorization_checks (3 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120160000_email_reply_tokens_and_ssma_by_email (21 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120170000_ai_consult_all_expert_paths (5 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120190000_null_safe_ssma_cores (3 ms): P0 protegido apos a migration
[LF] fim da onda B: 156 ms (inclui verificacoes P0)
OK   [LF] onda C 20261121100000_centralize_project_permission_rule (2 ms): P0 protegido apos a migration
OK   [LF] onda C 20261121101000_null_safe_authorization_residual (5 ms): P0 protegido apos a migration
[LF] fim da onda C: 21 ms (inclui verificacoes P0)
OK   [LF] onda D 20261121110000_email_mailbox_controls_hardening (4 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121120000_email_replies_sla_digest_contract_by_email (18 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121130000_outbound_delivery_states (30 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121150000_ai_consult_governance (11 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121160000_revoke_anon_list_addable_profiles (3 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121170000_l2_revoke_anon_trigger_functions (2 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121171000_l2_forecast_followup_and_guards (18 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121172000_l2_sla_forward_by_email_audit (2 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121173000_email_specialist_consultations (17 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121174000_ai_consult_audit (10 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121175000_audit_delete_proposals_and_findings (2 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121176000_risk_sla_consistency_closed_by_source (6 ms): P0 protegido apos a migration
[LF] fim da onda D: 200 ms (inclui verificacoes P0)
OK   [LF] onda F 20261121178000_reissue_approval_flow (3 ms): P0 protegido apos a migration
[LF] fim da onda F: 10 ms (inclui verificacoes P0)
OK   [LF] onda G 20261122100000_quality_foundation (181 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122101000_quality_rpcs (11 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122200000_seguros_garantias_model (129 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122201000_seguros_garantias_rpcs (13 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122300000_quality_analyst_expert_id (27 ms): P0 protegido apos a migration
[LF] fim da onda G: 429 ms (inclui verificacoes P0)
OK   [LF] onda H1 20261123100000_acc_project_tier (2 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123101000_unified_permission_wrappers (3 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123102000_insurance_claim_advance_manage_stages (2 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123200000_endorsement_dual_review (23 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123300000_quality_integrity_guards (17 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123301000_quality_rpcs_children (10 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123303000_acc_alert_links (27 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123400000_f3e_persistence_model (45 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123401000_f3e_warranty_opinion_rpcs (4 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123402000_f3e_insurance_persistence_rpcs (4 ms): P0 protegido apos a migration
[LF] fim da onda H1: 209 ms (inclui verificacoes P0)
OK   [LF] onda P0 20261126100000_p0_gate_record_risk_alert_action (4 ms): P0 protegido apos a migration
[LF] fim da onda P0: 11 ms (inclui verificacoes P0)
OK   [LF] dados representativos preservados apos todas as ondas (acoes, prazos das 9 abertas, casos, membros, regras de SLA)
OK   [LF] sequencia nao ampliou funcoes SECURITY DEFINER executaveis por anon alem das novas ja revisadas (informativo: antes 8, depois 4)
OK   [LF] portao P0 e idempotente (reaplicar 2x nao altera nada)
OK   [LF] onda H2 (20261123302000, so com o app): aplica, P0 intacto e escrita direta de authenticated revogada
OK   [LF] onda E (20261121177000, SO ENSAIO): MEDIO 2 e BAIXO 5 dias uteis para NOVAS acoes; as 9 abertas mantem o prazo

=== Variante CRLF: espelho do remoto (134 registradas + hotfix efetivo) e sequencia por ondas ===
OK   [CRLF] base: hotfix efetivo e P0 verificado (corpo md5 sem CR 930f6d75898793479b418950b0053bd9; bruto c2f015a91b8f4e94c52a68c3536cb89d)
[CRLF] dados representativos: 9 acoes MEDIO/BAIXO abertas; funcoes SECURITY DEFINER com EXECUTE para anon no espelho: 8
OK   [CRLF] onda A 20261107090000_email_mailbox_collection_controls (18 ms): P0 protegido apos a migration
OK   [CRLF] onda A 20261116090000_list_addable_profiles_for_project (2 ms): P0 protegido apos a migration
OK   [CRLF] onda A 20261118140000_sla_matrix_rules_unique_active_key (4 ms): P0 protegido apos a migration
[CRLF] fim da onda A: 45 ms (inclui verificacoes P0)
OK   [CRLF] onda B 20261120100000_sla_action_operations_by_responsible (3 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120110000_risk_case_sla_consistency_guards (3 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120120000_ssma_forward_and_ai_consult_limits (17 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120130000_risk_alert_action_server_side_guard (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120140000_ai_consult_reserve_global_user_lock (3 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120150000_weekly_digest_evidence_and_guards (4 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120151000_risk_alert_action_no_outbox_authorization (3 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120152000_risk_sla_consistency_report_and_email_guards (6 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120153000_null_safe_authorization_checks (4 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120160000_email_reply_tokens_and_ssma_by_email (23 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120170000_ai_consult_all_expert_paths (6 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120190000_null_safe_ssma_cores (3 ms): P0 protegido apos a migration
[CRLF] fim da onda B: 169 ms (inclui verificacoes P0)
OK   [CRLF] onda C 20261121100000_centralize_project_permission_rule (1 ms): P0 protegido apos a migration
OK   [CRLF] onda C 20261121101000_null_safe_authorization_residual (5 ms): P0 protegido apos a migration
[CRLF] fim da onda C: 21 ms (inclui verificacoes P0)
OK   [CRLF] onda D 20261121110000_email_mailbox_controls_hardening (7 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121120000_email_replies_sla_digest_contract_by_email (23 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121130000_outbound_delivery_states (31 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121150000_ai_consult_governance (9 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121160000_revoke_anon_list_addable_profiles (2 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121170000_l2_revoke_anon_trigger_functions (2 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121171000_l2_forecast_followup_and_guards (19 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121172000_l2_sla_forward_by_email_audit (3 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121173000_email_specialist_consultations (15 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121174000_ai_consult_audit (11 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121175000_audit_delete_proposals_and_findings (4 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121176000_risk_sla_consistency_closed_by_source (5 ms): P0 protegido apos a migration
[CRLF] fim da onda D: 218 ms (inclui verificacoes P0)
OK   [CRLF] onda F 20261121178000_reissue_approval_flow (4 ms): P0 protegido apos a migration
[CRLF] fim da onda F: 11 ms (inclui verificacoes P0)
OK   [CRLF] onda G 20261122100000_quality_foundation (157 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122101000_quality_rpcs (13 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122200000_seguros_garantias_model (123 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122201000_seguros_garantias_rpcs (13 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122300000_quality_analyst_expert_id (28 ms): P0 protegido apos a migration
[CRLF] fim da onda G: 405 ms (inclui verificacoes P0)
OK   [CRLF] onda H1 20261123100000_acc_project_tier (2 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123101000_unified_permission_wrappers (3 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123102000_insurance_claim_advance_manage_stages (3 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123200000_endorsement_dual_review (26 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123300000_quality_integrity_guards (13 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123301000_quality_rpcs_children (11 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123303000_acc_alert_links (28 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123400000_f3e_persistence_model (36 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123401000_f3e_warranty_opinion_rpcs (4 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123402000_f3e_insurance_persistence_rpcs (4 ms): P0 protegido apos a migration
[CRLF] fim da onda H1: 204 ms (inclui verificacoes P0)
OK   [CRLF] onda P0 20261126100000_p0_gate_record_risk_alert_action (4 ms): P0 protegido apos a migration
[CRLF] fim da onda P0: 13 ms (inclui verificacoes P0)
OK   [CRLF] dados representativos preservados apos todas as ondas (acoes, prazos das 9 abertas, casos, membros, regras de SLA)
OK   [CRLF] sequencia nao ampliou funcoes SECURITY DEFINER executaveis por anon alem das novas ja revisadas (informativo: antes 8, depois 4)
OK   [CRLF] portao P0 e idempotente (reaplicar 2x nao altera nada)

=== Cenario negativo: regra de SLA ativa duplicada (LOW geral) ===
OK   [dup] A-bis (20261118140000) NAO falha, apenas avisa e NAO cria o indice unico (conferir a existencia do indice apos aplicar)
OK   [dup] 177000 FALHA com SLA_MATRIX_DUPLICATE_ACTIVE e nao deixa efeito (rollback total)
OK   [controle] corpo INTERMEDIARIO (130000 sem a guarda) e detectado pela verificacao P0 e o portao 20261126100000 falha fechado

105 ok, 0 falha(s) - PostgreSQL 17.12
```
