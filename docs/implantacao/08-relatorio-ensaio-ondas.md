# 08 - Relatorio do ensaio por ondas (PostgreSQL 17.12 local, base descartavel)

Gerado por `scripts/ensaio-implantacao-ondas-realpg.mjs` (somente local; nenhuma aplicacao operacional). Resultado: **384 verificacoes OK, 0 falha(s)**.
Espelho do remoto: 134 migrations registradas + hotfix P0 efetivo + dados representativos sinteticos (2 obras, 8 perfis, regras de SLA como no remoto, 9 acoes MEDIO/BAIXO abertas, acoes concluidas, 1 caso de alerta). Cada arquivo e uma transacao (lock_timeout 5s, statement_timeout 120s). Depois de CADA migration: verificacao estatica P0 (corpo md5 sem CR = 930f6d75898793479b418950b0053bd9, SECURITY DEFINER, search_path vazio, sem EXECUTE para anon/PUBLIC) e sondas reais negativas (LEITURA, COLABORADOR sem papel e anon recusados, caso inalterado).
Tempos sao de banco pequeno e vazio de contencao, em maquina local: servem como ordem de grandeza e como prova de ausencia de locks fortes longos, nao como previsao do remoto.

## Variante LF
| Onda | Migration | Tempo (ms) | Locks fortes em tabelas preexistentes | P0 | Avisos |
|---|---|--:|---|---|---|
| A | 20261107090000_email_mailbox_collection_controls | 11 | email_access_authorizations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | constraint "email_triage_results_event_consistency_check" of relation "email_triage_results" does not exist, skipping policy "project_documents_storage_select_m |
| A | 20261116090000_list_addable_profiles_for_project | 1 | nenhum | protegido |  |
| A | 20261118140000_sla_matrix_rules_unique_active_key | 4 | sla_matrix_rules:ShareLock | protegido |  |
| B | 20261120100000_sla_action_operations_by_responsible | 3 | nenhum | protegido |  |
| B | 20261120110000_risk_case_sla_consistency_guards | 2 | email_alert_actions:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | trigger "email_alert_actions_risk_case_guard" for relation "public.email_alert_actions" does not exist, skipping trigger "sla_actions_audit_deadline_changed" fo |
| B | 20261120120000_ssma_forward_and_ai_consult_limits | 12 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_usage_select_members" for relation "public.ai_consult_usage" does not exist, skipping policy "ai_consult_limits_select_authenticated" for rel |
| B | 20261120130000_risk_alert_action_server_side_guard | 2 | nenhum | protegido |  |
| B | 20261120140000_ai_consult_reserve_global_user_lock | 1 | nenhum | protegido |  |
| B | 20261120150000_weekly_digest_evidence_and_guards | 2 | nenhum | protegido |  |
| B | 20261120151000_risk_alert_action_no_outbox_authorization | 2 | nenhum | protegido |  |
| B | 20261120152000_risk_sla_consistency_report_and_email_guards | 4 | nenhum | protegido |  |
| B | 20261120153000_null_safe_authorization_checks | 2 | nenhum | protegido |  |
| B | 20261120160000_email_reply_tokens_and_ssma_by_email | 20 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| B | 20261120170000_ai_consult_all_expert_paths | 3 | ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido | constraint "ai_consult_usage_expert_id_check" of relation "ai_consult_usage" does not exist, skipping |
| B | 20261120190000_null_safe_ssma_cores | 2 | nenhum | protegido |  |
| C | 20261121100000_centralize_project_permission_rule | 2 | nenhum | protegido |  |
| C | 20261121101000_null_safe_authorization_residual | 3 | nenhum | protegido |  |
| D | 20261121110000_email_mailbox_controls_hardening | 4 | email_access_authorizations:ShareRowExclusiveLock; email_mailbox_collection_controls:AccessExclusiveLock; email_mailbox_collection_controls:ShareRowExclusiveLock | protegido | constraint "email_mailbox_controls_consent_blocks_collection" of relation "email_mailbox_collection_controls" does not exist, skipping trigger "email_mailbox_co |
| D | 20261121120000_email_replies_sla_digest_contract_by_email | 17 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121130000_outbound_delivery_states | 24 | acc_system_health_incidents:ShareRowExclusiveLock; construmanager_version_review_deliveries:AccessExclusiveLock; construmanager_version_review_deliveries:ShareRowExclusiveLock; notification_email_deliveries:AccessExclusiveLock; notification_email_deliveries:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_outbox:AccessExclusiveLock; risk_alert_outbox:ShareRowExclusiveLock; ssma_accident_notification_deliveries:AccessExclusiveLock; ssma_accident_notification_deliveries:ShareRowExclusiveLock; ssma_field_notification_deliveries:AccessExclusiveLock; ssma_field_notification_deliveries:ShareRowExclusiveLock | protegido | trigger "risk_alert_outbox_delivery_guard" for relation "public.risk_alert_outbox" does not exist, skipping trigger "ssma_accident_deliveries_delivery_guard" fo |
| D | 20261121150000_ai_consult_governance | 8 | ai_consult_usage:AccessExclusiveLock | protegido | constraint "ai_consult_usage_estimated_cost_micros_check" of relation "ai_consult_usage" does not exist, skipping |
| D | 20261121160000_revoke_anon_list_addable_profiles | 1 | nenhum | protegido |  |
| D | 20261121170000_l2_revoke_anon_trigger_functions | 1 | nenhum | protegido |  |
| D | 20261121171000_l2_forecast_followup_and_guards | 18 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_action_events:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | policy "sla_action_followup_events_select_members" for relation "public.sla_action_followup_events" does not exist, skipping trigger "risk_alert_action_events_f |
| D | 20261121172000_l2_sla_forward_by_email_audit | 1 | nenhum | protegido |  |
| D | 20261121173000_email_specialist_consultations | 14 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121174000_ai_consult_audit | 9 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_audit_select_author_or_admin" for relation "public.ai_consult_audit" does not exist, skipping |
| D | 20261121175000_audit_delete_proposals_and_findings | 2 | ai_findings:ShareRowExclusiveLock; project_additional_proposals:ShareRowExclusiveLock | protegido | trigger "project_additional_proposals_audit_deleted" for relation "public.project_additional_proposals" does not exist, skipping trigger "ai_findings_audit_dele |
| D | 20261121176000_risk_sla_consistency_closed_by_source | 5 | nenhum | protegido |  |
| F | 20261121178000_reissue_approval_flow | 2 | nenhum | protegido |  |
| G | 20261122100000_quality_foundation | 129 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "quality_state_events_append_only" for relation "public.quality_state_events" does not exist, skipping trigger "quality_requirements_touch" for relation |
| G | 20261122101000_quality_rpcs | 10 | quality_customer_complaints:ShareRowExclusiveLock; quality_inspections:ShareRowExclusiveLock; quality_requirements:ShareRowExclusiveLock; quality_tests:ShareRowExclusiveLock; quality_warranty_cases:ShareLock | protegido | trigger "quality_requirements_code" for relation "public.quality_requirements" does not exist, skipping trigger "quality_customer_complaints_code" for relation  |
| G | 20261122200000_seguros_garantias_model | 105 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_audit_events_append_only" for relation "public.insurance_audit_events" does not exist, skipping trigger "insurance_audit_events_no_truncate"  |
| G | 20261122201000_seguros_garantias_rpcs | 10 | nenhum | protegido |  |
| G | 20261122300000_quality_analyst_expert_id | 23 | ai_consult_audit:AccessExclusiveLock; ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; email_specialist_consultations:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido |  |
| H1 | 20261123100000_acc_project_tier | 2 | nenhum | protegido |  |
| H1 | 20261123101000_unified_permission_wrappers | 1 | nenhum | protegido |  |
| H1 | 20261123102000_insurance_claim_advance_manage_stages | 1 | nenhum | protegido |  |
| H1 | 20261123200000_endorsement_dual_review | 18 | insurance_endorsements:AccessExclusiveLock; insurance_endorsements:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_endorsement_reviews_prepare" for relation "public.insurance_endorsement_reviews" does not exist, skipping trigger "insurance_endorsements_gua |
| H1 | 20261123300000_quality_integrity_guards | 9 | quality_evidence:ShareRowExclusiveLock; quality_ncrs:ShareRowExclusiveLock; quality_state_events:ShareLock; quality_warranty_cases:AccessExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock; quality_warranty_repairs:AccessExclusiveLock | protegido | trigger "quality_ncrs_state_guard_trg" for relation "public.quality_ncrs" does not exist, skipping trigger "quality_warranty_cases_state_guard_trg" for relation |
| H1 | 20261123301000_quality_rpcs_children | 9 | nenhum | protegido |  |
| H1 | 20261123303000_acc_alert_links | 23 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_cases:ShareLock; risk_alert_cases:ShareRowExclusiveLock | protegido | trigger "acc_alert_link_events_append_only" for relation "public.acc_alert_link_events" does not exist, skipping trigger "acc_alert_links_guard_trg" for relatio |
| H1 | 20261123400000_f3e_persistence_model | 33 | documents:ShareRowExclusiveLock; insurance_claims:ShareRowExclusiveLock; insurance_policies:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock | protegido | trigger "quality_warranty_coverage_opinions_append_only" for relation "public.quality_warranty_coverage_opinions" does not exist, skipping trigger "quality_warr |
| H1 | 20261123401000_f3e_warranty_opinion_rpcs | 3 | nenhum | protegido |  |
| H1 | 20261123402000_f3e_insurance_persistence_rpcs | 3 | nenhum | protegido |  |
| I | 20261124100000_project_competences | 18 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "project_competence_events_append_only" for relation "public.project_competence_events" does not exist, skipping trigger "project_competence_events_no_t |
| I | 20261124101000_competence_enforcement | 3 | insurance_claim_steps:ShareRowExclusiveLock; insurance_drafts:ShareRowExclusiveLock; quality_state_events:ShareRowExclusiveLock | protegido | trigger "insurance_claim_steps_competence" for relation "public.insurance_claim_steps" does not exist, skipping trigger "insurance_drafts_approval_competence" f |
| I | 20261124102000_endorsement_review_requester_competence | 5 | insurance_endorsement_reviews:AccessExclusiveLock; insurance_endorsement_reviews:ShareRowExclusiveLock | protegido | trigger "insurance_endorsement_reviews_zcompetence" for relation "public.insurance_endorsement_reviews" does not exist, skipping |
| I | 20261125100000_warranty_acceptance_proof | 15 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_evidence:ShareRowExclusiveLock; quality_warranty_cases:AccessExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock | protegido | trigger "quality_warranty_acceptances_append_only" for relation "public.quality_warranty_acceptances" does not exist, skipping trigger "quality_warranty_accepta |
| I | 20261125200000_insurance_coherence | 18 | documents:ShareRowExclusiveLock; insurance_drafts:ShareRowExclusiveLock; insurance_policies:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_instrument_terms_append_only" for relation "public.insurance_instrument_terms" does not exist, skipping trigger "insurance_instrument_terms_n |
| I | 20261125201000_insurance_subjects_rcc_clause_id | 4 | insurance_expected_subjects:ShareRowExclusiveLock; insurance_policy_clauses:AccessExclusiveLock; insurance_policy_parties:AccessExclusiveLock; insurance_policy_parties:ShareRowExclusiveLock | protegido | trigger "insurance_party_guard_ins" for relation "public.insurance_policy_parties" does not exist, skipping trigger "insurance_party_guard_upd" for relation "pu |
| I | 20261125202000_insurance_sources_and_grounds | 9 | documents:ShareRowExclusiveLock; insurance_claim_steps:AccessExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_guarantee_updates_append_only" for relation "public.insurance_guarantee_updates" does not exist, skipping trigger "insurance_guarantee_update |
| I | 20261125203000_insurance_advances_consolidated | 2 | nenhum | protegido |  |
| P0 | 20261126100000_p0_gate_record_risk_alert_action | 3 | nenhum | protegido |  |
| J | 20261127100000_external_recipient_controls | 15 | insurance_official_channels:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "acc_recipient_domains_no_delete" for relation "public.acc_recipient_domains" does not exist, skipping trigger "acc_recipient_domains_no_truncate" for r |
| K | 20261201100000_email_universal_monitoring | 27 | emails:AccessExclusiveLock; emails:ShareLock; emails:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "email_sync_runs_append_only" for relation "public.email_sync_reconciliation_runs" does not exist, skipping trigger "email_ingestion_exclusions_append_o |
| K | 20261202100000_email_classification_and_risk_signals | 15 | emails:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "email_message_classifications_select_members" for relation "public.email_message_classifications" does not exist, skipping policy "email_risk_signals_se |
| K | 20261203100000_external_parties_contract | 33 | projects:ShareRowExclusiveLock; users:ShareRowExclusiveLock | protegido | trigger "external_contacts_audit_no_update" for relation "public.external_contacts_audit" does not exist, skipping trigger "external_contacts_audit_no_truncate" |
| K | 20261203110000_external_parties_management | 4 | nenhum | protegido |  |
| K | 20261204100000_risk_alert_cases_email_source | 3 | risk_alert_cases:AccessExclusiveLock | protegido |  |
| K | 20261205100000_competence_validation_requests | 34 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; project_competences:AccessExclusiveLock; project_competences:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "project_competence_governance_events_append_only" for relation "public.project_competence_governance_events" does not exist, skipping trigger "project_ |
| K | 20261205101000_closed_case_material_change_guards | 16 | documents:ShareRowExclusiveLock; insurance_claim_steps:ShareRowExclusiveLock; insurance_claims:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_corrective_actions:ShareRowExclusiveLock; quality_effectiveness_verifications:ShareRowExclusiveLock; quality_ncrs:ShareRowExclusiveLock; quality_nonquality_costs:ShareRowExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock; quality_warranty_maintenance:ShareRowExclusiveLock; quality_warranty_repairs:ShareRowExclusiveLock; quality_warranty_surveys:ShareRowExclusiveLock | protegido | trigger "closed_case_complements_append_only" for relation "public.closed_case_complements" does not exist, skipping trigger "closed_case_complements_no_truncat |
| K | 20261205102000_external_send_single_use_confirmation | 18 | external_recipient_confirmations:AccessExclusiveLock; external_recipient_confirmations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "external_send_preparations_guard_trg" for relation "public.external_send_preparations" does not exist, skipping trigger "external_send_preparations_no_ |
| L | 20261208100000_competence_revalidation_send_content | 11 | external_send_preparations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; project_competence_governance_events:AccessExclusiveLock; project_competences:AccessExclusiveLock; project_competences:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "external_send_preparation_contents_append_only" for relation "public.external_send_preparation_contents" does not exist, skipping trigger "external_sen |
| L | 20261209100000_email_signal_pillars_and_review | 23 | email_risk_signals:AccessExclusiveLock; email_risk_signals:ShareLock; email_risk_signals:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; users:ShareRowExclusiveLock | protegido | constraint "email_risk_signals_pillar_four_check" of relation "email_risk_signals" does not exist, skipping constraint "email_risk_signals_functional_area_check |
| L | 20261209101000_external_org_global_admin_and_change_requests | 9 | external_organizations:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; users:ShareRowExclusiveLock | protegido | policy "external_org_change_requests_select" for relation "public.external_org_change_requests" does not exist, skipping |
| L | 20261210100000_quality_alert_area_sla | 13 | risk_alert_cases:AccessExclusiveLock; sla_actions:AccessExclusiveLock; sla_area_responsibles:AccessExclusiveLock; sla_matrix_rules:AccessExclusiveLock; sla_matrix_rules:ShareRowExclusiveLock | protegido | sla_matrix_rules: 4 regra(s) QUALIDADE semeada(s) (prospectivo; sla_actions intactas). |

Total de migrations (soma): 858 ms.

## Variante CRLF (checkout Windows)
| Onda | Migration | Tempo (ms) | Locks fortes em tabelas preexistentes | P0 | Avisos |
|---|---|--:|---|---|---|
| A | 20261107090000_email_mailbox_collection_controls | 10 | email_access_authorizations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | constraint "email_triage_results_event_consistency_check" of relation "email_triage_results" does not exist, skipping policy "project_documents_storage_select_m |
| A | 20261116090000_list_addable_profiles_for_project | 1 | nenhum | protegido |  |
| A | 20261118140000_sla_matrix_rules_unique_active_key | 3 | sla_matrix_rules:ShareLock | protegido |  |
| B | 20261120100000_sla_action_operations_by_responsible | 3 | nenhum | protegido |  |
| B | 20261120110000_risk_case_sla_consistency_guards | 2 | email_alert_actions:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | trigger "email_alert_actions_risk_case_guard" for relation "public.email_alert_actions" does not exist, skipping trigger "sla_actions_audit_deadline_changed" fo |
| B | 20261120120000_ssma_forward_and_ai_consult_limits | 12 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_usage_select_members" for relation "public.ai_consult_usage" does not exist, skipping policy "ai_consult_limits_select_authenticated" for rel |
| B | 20261120130000_risk_alert_action_server_side_guard | 2 | nenhum | protegido |  |
| B | 20261120140000_ai_consult_reserve_global_user_lock | 1 | nenhum | protegido |  |
| B | 20261120150000_weekly_digest_evidence_and_guards | 2 | nenhum | protegido |  |
| B | 20261120151000_risk_alert_action_no_outbox_authorization | 2 | nenhum | protegido |  |
| B | 20261120152000_risk_sla_consistency_report_and_email_guards | 4 | nenhum | protegido |  |
| B | 20261120153000_null_safe_authorization_checks | 2 | nenhum | protegido |  |
| B | 20261120160000_email_reply_tokens_and_ssma_by_email | 22 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| B | 20261120170000_ai_consult_all_expert_paths | 4 | ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido | constraint "ai_consult_usage_expert_id_check" of relation "ai_consult_usage" does not exist, skipping |
| B | 20261120190000_null_safe_ssma_cores | 2 | nenhum | protegido |  |
| C | 20261121100000_centralize_project_permission_rule | 2 | nenhum | protegido |  |
| C | 20261121101000_null_safe_authorization_residual | 4 | nenhum | protegido |  |
| D | 20261121110000_email_mailbox_controls_hardening | 4 | email_access_authorizations:ShareRowExclusiveLock; email_mailbox_collection_controls:AccessExclusiveLock; email_mailbox_collection_controls:ShareRowExclusiveLock | protegido | constraint "email_mailbox_controls_consent_blocks_collection" of relation "email_mailbox_collection_controls" does not exist, skipping trigger "email_mailbox_co |
| D | 20261121120000_email_replies_sla_digest_contract_by_email | 17 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121130000_outbound_delivery_states | 24 | acc_system_health_incidents:ShareRowExclusiveLock; construmanager_version_review_deliveries:AccessExclusiveLock; construmanager_version_review_deliveries:ShareRowExclusiveLock; notification_email_deliveries:AccessExclusiveLock; notification_email_deliveries:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_outbox:AccessExclusiveLock; risk_alert_outbox:ShareRowExclusiveLock; ssma_accident_notification_deliveries:AccessExclusiveLock; ssma_accident_notification_deliveries:ShareRowExclusiveLock; ssma_field_notification_deliveries:AccessExclusiveLock; ssma_field_notification_deliveries:ShareRowExclusiveLock | protegido | trigger "risk_alert_outbox_delivery_guard" for relation "public.risk_alert_outbox" does not exist, skipping trigger "ssma_accident_deliveries_delivery_guard" fo |
| D | 20261121150000_ai_consult_governance | 8 | ai_consult_usage:AccessExclusiveLock | protegido | constraint "ai_consult_usage_estimated_cost_micros_check" of relation "ai_consult_usage" does not exist, skipping |
| D | 20261121160000_revoke_anon_list_addable_profiles | 1 | nenhum | protegido |  |
| D | 20261121170000_l2_revoke_anon_trigger_functions | 1 | nenhum | protegido |  |
| D | 20261121171000_l2_forecast_followup_and_guards | 18 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_action_events:ShareRowExclusiveLock; sla_actions:ShareRowExclusiveLock | protegido | policy "sla_action_followup_events_select_members" for relation "public.sla_action_followup_events" does not exist, skipping trigger "risk_alert_action_events_f |
| D | 20261121172000_l2_sla_forward_by_email_audit | 1 | nenhum | protegido |  |
| D | 20261121173000_email_specialist_consultations | 10 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido |  |
| D | 20261121174000_ai_consult_audit | 9 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "ai_consult_audit_select_author_or_admin" for relation "public.ai_consult_audit" does not exist, skipping |
| D | 20261121175000_audit_delete_proposals_and_findings | 2 | ai_findings:ShareRowExclusiveLock; project_additional_proposals:ShareRowExclusiveLock | protegido | trigger "project_additional_proposals_audit_deleted" for relation "public.project_additional_proposals" does not exist, skipping trigger "ai_findings_audit_dele |
| D | 20261121176000_risk_sla_consistency_closed_by_source | 3 | nenhum | protegido |  |
| F | 20261121178000_reissue_approval_flow | 3 | nenhum | protegido |  |
| G | 20261122100000_quality_foundation | 130 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "quality_state_events_append_only" for relation "public.quality_state_events" does not exist, skipping trigger "quality_requirements_touch" for relation |
| G | 20261122101000_quality_rpcs | 9 | quality_customer_complaints:ShareRowExclusiveLock; quality_inspections:ShareRowExclusiveLock; quality_requirements:ShareRowExclusiveLock; quality_tests:ShareRowExclusiveLock; quality_warranty_cases:ShareLock | protegido | trigger "quality_requirements_code" for relation "public.quality_requirements" does not exist, skipping trigger "quality_customer_complaints_code" for relation  |
| G | 20261122200000_seguros_garantias_model | 113 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_audit_events_append_only" for relation "public.insurance_audit_events" does not exist, skipping trigger "insurance_audit_events_no_truncate"  |
| G | 20261122201000_seguros_garantias_rpcs | 10 | nenhum | protegido |  |
| G | 20261122300000_quality_analyst_expert_id | 24 | ai_consult_audit:AccessExclusiveLock; ai_consult_usage:AccessExclusiveLock; alert_email_messages:AccessExclusiveLock; email_specialist_consultations:AccessExclusiveLock; risk_alert_action_events:AccessExclusiveLock | protegido |  |
| H1 | 20261123100000_acc_project_tier | 3 | nenhum | protegido |  |
| H1 | 20261123101000_unified_permission_wrappers | 2 | nenhum | protegido |  |
| H1 | 20261123102000_insurance_claim_advance_manage_stages | 2 | nenhum | protegido |  |
| H1 | 20261123200000_endorsement_dual_review | 20 | insurance_endorsements:AccessExclusiveLock; insurance_endorsements:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_endorsement_reviews_prepare" for relation "public.insurance_endorsement_reviews" does not exist, skipping trigger "insurance_endorsements_gua |
| H1 | 20261123300000_quality_integrity_guards | 11 | quality_evidence:ShareRowExclusiveLock; quality_ncrs:ShareRowExclusiveLock; quality_state_events:ShareLock; quality_warranty_cases:AccessExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock; quality_warranty_repairs:AccessExclusiveLock | protegido | trigger "quality_ncrs_state_guard_trg" for relation "public.quality_ncrs" does not exist, skipping trigger "quality_warranty_cases_state_guard_trg" for relation |
| H1 | 20261123301000_quality_rpcs_children | 9 | nenhum | protegido |  |
| H1 | 20261123303000_acc_alert_links | 23 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; risk_alert_cases:ShareLock; risk_alert_cases:ShareRowExclusiveLock | protegido | trigger "acc_alert_link_events_append_only" for relation "public.acc_alert_link_events" does not exist, skipping trigger "acc_alert_links_guard_trg" for relatio |
| H1 | 20261123400000_f3e_persistence_model | 36 | documents:ShareRowExclusiveLock; insurance_claims:ShareRowExclusiveLock; insurance_policies:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock | protegido | trigger "quality_warranty_coverage_opinions_append_only" for relation "public.quality_warranty_coverage_opinions" does not exist, skipping trigger "quality_warr |
| H1 | 20261123401000_f3e_warranty_opinion_rpcs | 2 | nenhum | protegido |  |
| H1 | 20261123402000_f3e_insurance_persistence_rpcs | 3 | nenhum | protegido |  |
| I | 20261124100000_project_competences | 17 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "project_competence_events_append_only" for relation "public.project_competence_events" does not exist, skipping trigger "project_competence_events_no_t |
| I | 20261124101000_competence_enforcement | 2 | insurance_claim_steps:ShareRowExclusiveLock; insurance_drafts:ShareRowExclusiveLock; quality_state_events:ShareRowExclusiveLock | protegido | trigger "insurance_claim_steps_competence" for relation "public.insurance_claim_steps" does not exist, skipping trigger "insurance_drafts_approval_competence" f |
| I | 20261124102000_endorsement_review_requester_competence | 5 | insurance_endorsement_reviews:AccessExclusiveLock; insurance_endorsement_reviews:ShareRowExclusiveLock | protegido | trigger "insurance_endorsement_reviews_zcompetence" for relation "public.insurance_endorsement_reviews" does not exist, skipping |
| I | 20261125100000_warranty_acceptance_proof | 17 | profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_evidence:ShareRowExclusiveLock; quality_warranty_cases:AccessExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock | protegido | trigger "quality_warranty_acceptances_append_only" for relation "public.quality_warranty_acceptances" does not exist, skipping trigger "quality_warranty_accepta |
| I | 20261125200000_insurance_coherence | 20 | documents:ShareRowExclusiveLock; insurance_drafts:ShareRowExclusiveLock; insurance_policies:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_instrument_terms_append_only" for relation "public.insurance_instrument_terms" does not exist, skipping trigger "insurance_instrument_terms_n |
| I | 20261125201000_insurance_subjects_rcc_clause_id | 4 | insurance_expected_subjects:ShareRowExclusiveLock; insurance_policy_clauses:AccessExclusiveLock; insurance_policy_parties:AccessExclusiveLock; insurance_policy_parties:ShareRowExclusiveLock | protegido | trigger "insurance_party_guard_ins" for relation "public.insurance_policy_parties" does not exist, skipping trigger "insurance_party_guard_upd" for relation "pu |
| I | 20261125202000_insurance_sources_and_grounds | 9 | documents:ShareRowExclusiveLock; insurance_claim_steps:AccessExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "insurance_guarantee_updates_append_only" for relation "public.insurance_guarantee_updates" does not exist, skipping trigger "insurance_guarantee_update |
| I | 20261125203000_insurance_advances_consolidated | 2 | nenhum | protegido |  |
| P0 | 20261126100000_p0_gate_record_risk_alert_action | 3 | nenhum | protegido |  |
| J | 20261127100000_external_recipient_controls | 14 | insurance_official_channels:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "acc_recipient_domains_no_delete" for relation "public.acc_recipient_domains" does not exist, skipping trigger "acc_recipient_domains_no_truncate" for r |
| K | 20261201100000_email_universal_monitoring | 28 | emails:AccessExclusiveLock; emails:ShareLock; emails:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "email_sync_runs_append_only" for relation "public.email_sync_reconciliation_runs" does not exist, skipping trigger "email_ingestion_exclusions_append_o |
| K | 20261202100000_email_classification_and_risk_signals | 16 | emails:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | policy "email_message_classifications_select_members" for relation "public.email_message_classifications" does not exist, skipping policy "email_risk_signals_se |
| K | 20261203100000_external_parties_contract | 33 | projects:ShareRowExclusiveLock; users:ShareRowExclusiveLock | protegido | trigger "external_contacts_audit_no_update" for relation "public.external_contacts_audit" does not exist, skipping trigger "external_contacts_audit_no_truncate" |
| K | 20261203110000_external_parties_management | 4 | nenhum | protegido |  |
| K | 20261204100000_risk_alert_cases_email_source | 3 | risk_alert_cases:AccessExclusiveLock | protegido |  |
| K | 20261205100000_competence_validation_requests | 35 | documents:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; project_competences:AccessExclusiveLock; project_competences:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "project_competence_governance_events_append_only" for relation "public.project_competence_governance_events" does not exist, skipping trigger "project_ |
| K | 20261205101000_closed_case_material_change_guards | 16 | documents:ShareRowExclusiveLock; insurance_claim_steps:ShareRowExclusiveLock; insurance_claims:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; quality_corrective_actions:ShareRowExclusiveLock; quality_effectiveness_verifications:ShareRowExclusiveLock; quality_ncrs:ShareRowExclusiveLock; quality_nonquality_costs:ShareRowExclusiveLock; quality_warranty_cases:ShareRowExclusiveLock; quality_warranty_maintenance:ShareRowExclusiveLock; quality_warranty_repairs:ShareRowExclusiveLock; quality_warranty_surveys:ShareRowExclusiveLock | protegido | trigger "closed_case_complements_append_only" for relation "public.closed_case_complements" does not exist, skipping trigger "closed_case_complements_no_truncat |
| K | 20261205102000_external_send_single_use_confirmation | 19 | external_recipient_confirmations:AccessExclusiveLock; external_recipient_confirmations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "external_send_preparations_guard_trg" for relation "public.external_send_preparations" does not exist, skipping trigger "external_send_preparations_no_ |
| L | 20261208100000_competence_revalidation_send_content | 10 | external_send_preparations:ShareRowExclusiveLock; profiles:ShareRowExclusiveLock; project_competence_governance_events:AccessExclusiveLock; project_competences:AccessExclusiveLock; project_competences:ShareRowExclusiveLock; projects:ShareRowExclusiveLock | protegido | trigger "external_send_preparation_contents_append_only" for relation "public.external_send_preparation_contents" does not exist, skipping trigger "external_sen |
| L | 20261209100000_email_signal_pillars_and_review | 20 | email_risk_signals:AccessExclusiveLock; email_risk_signals:ShareLock; email_risk_signals:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; users:ShareRowExclusiveLock | protegido | constraint "email_risk_signals_pillar_four_check" of relation "email_risk_signals" does not exist, skipping constraint "email_risk_signals_functional_area_check |
| L | 20261209101000_external_org_global_admin_and_change_requests | 9 | external_organizations:ShareRowExclusiveLock; projects:ShareRowExclusiveLock; users:ShareRowExclusiveLock | protegido | policy "external_org_change_requests_select" for relation "public.external_org_change_requests" does not exist, skipping |
| L | 20261210100000_quality_alert_area_sla | 12 | risk_alert_cases:AccessExclusiveLock; sla_actions:AccessExclusiveLock; sla_area_responsibles:AccessExclusiveLock; sla_matrix_rules:AccessExclusiveLock; sla_matrix_rules:ShareRowExclusiveLock | protegido | sla_matrix_rules: 4 regra(s) QUALIDADE semeada(s) (prospectivo; sla_actions intactas). |

Total de migrations (soma): 872 ms.

## Rollback por ondas (Fase 6/H5; aplicar -> rollback em ordem inversa, cada arquivo 2x -> reaplicar)
| Onda | Migrations | Rollbacks NO-OP | Esquema apos o rollback x antes da onda |
|---|--:|---|---|
| A | 3 | - | IDENTICO (reversao exata) |
| B | 12 | 20261120130000, 20261120151000 | IDENTICO (reversao exata) |
| C | 2 | - | IDENTICO (reversao exata) |
| D | 12 | 20261121160000, 20261121170000 | 5 diferenca(s): funcoes:~ handle_new_user(); funcoes:~ list_addable_profiles_for_project(uuid); funcoes:~ prevent_last_administrator_removal(); funcoes:~ project_delivery_items_log_risk_change(); funcoes:~ set_document_version_project_id() |
| F | 1 | - | IDENTICO (reversao exata) |
| G | 5 | - | IDENTICO (reversao exata) |
| H1 | 10 | - | IDENTICO (reversao exata) |
| I | 8 | - | 2 diferenca(s): constraints:- insurance_endorsement_reviews.insurance_endorsement_reviews_check2; constraints:+ insurance_endorsement_reviews.insurance_endorsement_reviews_independence_f3_check |
| P0 | 1 | 20261126100000 | IDENTICO (reversao exata) |
| J | 1 | - | IDENTICO (reversao exata) |
| K | 8 | - | IDENTICO (reversao exata) |
| L | 4 | - | IDENTICO (reversao exata) |

## Ondas ensaiadas a parte
- H2 (20261123302000, so com o app): 3 ms; locks: nenhum.
- E (20261121177000, decisao do dono; SO ENSAIO): 4 ms; locks: sla_matrix_rules:ShareRowExclusiveLock.

## Verificacoes (saida completa)
```

=== Variante LF: espelho do remoto (134 registradas + hotfix efetivo) e sequencia por ondas ===
OK   [LF] base: hotfix efetivo e P0 verificado (corpo md5 sem CR 930f6d75898793479b418950b0053bd9; bruto 930f6d75898793479b418950b0053bd9)
[LF] dados representativos: 9 acoes MEDIO/BAIXO abertas; funcoes SECURITY DEFINER com EXECUTE para anon no espelho: 8
OK   [LF] onda A: verificacao-onda-a.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda A 20261107090000_email_mailbox_collection_controls (11 ms): P0 protegido apos a migration
OK   [LF] onda A 20261116090000_list_addable_profiles_for_project (1 ms): P0 protegido apos a migration
OK   [LF] onda A 20261118140000_sla_matrix_rules_unique_active_key (4 ms): P0 protegido apos a migration
OK   [LF] onda A: verificacao-onda-a.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda A: 47 ms (inclui verificacoes P0)
OK   [LF] onda B: verificacao-onda-b.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda B 20261120100000_sla_action_operations_by_responsible (3 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120110000_risk_case_sla_consistency_guards (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120120000_ssma_forward_and_ai_consult_limits (12 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120130000_risk_alert_action_server_side_guard (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120140000_ai_consult_reserve_global_user_lock (1 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120150000_weekly_digest_evidence_and_guards (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120151000_risk_alert_action_no_outbox_authorization (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120152000_risk_sla_consistency_report_and_email_guards (4 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120153000_null_safe_authorization_checks (2 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120160000_email_reply_tokens_and_ssma_by_email (20 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120170000_ai_consult_all_expert_paths (3 ms): P0 protegido apos a migration
OK   [LF] onda B 20261120190000_null_safe_ssma_cores (2 ms): P0 protegido apos a migration
OK   [LF] onda B: verificacao-onda-b.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda B: 156 ms (inclui verificacoes P0)
OK   [LF] onda C: verificacao-onda-c.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda C 20261121100000_centralize_project_permission_rule (2 ms): P0 protegido apos a migration
OK   [LF] onda C 20261121101000_null_safe_authorization_residual (3 ms): P0 protegido apos a migration
OK   [LF] onda C: verificacao-onda-c.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda C: 22 ms (inclui verificacoes P0)
OK   [LF] onda D: verificacao-onda-d.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda D 20261121110000_email_mailbox_controls_hardening (4 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121120000_email_replies_sla_digest_contract_by_email (17 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121130000_outbound_delivery_states (24 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121150000_ai_consult_governance (8 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121160000_revoke_anon_list_addable_profiles (1 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121170000_l2_revoke_anon_trigger_functions (1 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121171000_l2_forecast_followup_and_guards (18 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121172000_l2_sla_forward_by_email_audit (1 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121173000_email_specialist_consultations (14 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121174000_ai_consult_audit (9 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121175000_audit_delete_proposals_and_findings (2 ms): P0 protegido apos a migration
OK   [LF] onda D 20261121176000_risk_sla_consistency_closed_by_source (5 ms): P0 protegido apos a migration
OK   [LF] onda D: verificacao-onda-d.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda D: 367 ms (inclui verificacoes P0)
OK   [LF] onda F: verificacao-onda-f.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda F 20261121178000_reissue_approval_flow (2 ms): P0 protegido apos a migration
OK   [LF] onda F: verificacao-onda-f.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda F: 10 ms (inclui verificacoes P0)
OK   [LF] onda G: verificacao-onda-g.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda G 20261122100000_quality_foundation (129 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122101000_quality_rpcs (10 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122200000_seguros_garantias_model (105 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122201000_seguros_garantias_rpcs (10 ms): P0 protegido apos a migration
OK   [LF] onda G 20261122300000_quality_analyst_expert_id (23 ms): P0 protegido apos a migration
OK   [LF] onda G: verificacao-onda-g.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda G: 404 ms (inclui verificacoes P0)
OK   [LF] onda H1: verificacao-onda-h1.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda H1 20261123100000_acc_project_tier (2 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123101000_unified_permission_wrappers (1 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123102000_insurance_claim_advance_manage_stages (1 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123200000_endorsement_dual_review (18 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123300000_quality_integrity_guards (9 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123301000_quality_rpcs_children (9 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123303000_acc_alert_links (23 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123400000_f3e_persistence_model (33 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123401000_f3e_warranty_opinion_rpcs (3 ms): P0 protegido apos a migration
OK   [LF] onda H1 20261123402000_f3e_insurance_persistence_rpcs (3 ms): P0 protegido apos a migration
OK   [LF] onda H1: verificacao-onda-h1.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda H1: 254 ms (inclui verificacoes P0)
OK   [LF] onda I: verificacao-onda-i.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda I 20261124100000_project_competences (18 ms): P0 protegido apos a migration
OK   [LF] onda I 20261124101000_competence_enforcement (3 ms): P0 protegido apos a migration
OK   [LF] onda I 20261124102000_endorsement_review_requester_competence (5 ms): P0 protegido apos a migration
OK   [LF] onda I 20261125100000_warranty_acceptance_proof (15 ms): P0 protegido apos a migration
OK   [LF] onda I 20261125200000_insurance_coherence (18 ms): P0 protegido apos a migration
OK   [LF] onda I 20261125201000_insurance_subjects_rcc_clause_id (4 ms): P0 protegido apos a migration
OK   [LF] onda I 20261125202000_insurance_sources_and_grounds (9 ms): P0 protegido apos a migration
OK   [LF] onda I 20261125203000_insurance_advances_consolidated (2 ms): P0 protegido apos a migration
OK   [LF] onda I: verificacao-onda-i.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda I: 200 ms (inclui verificacoes P0)
OK   [LF] onda P0: verificacao-onda-p0.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda P0 20261126100000_p0_gate_record_risk_alert_action (3 ms): P0 protegido apos a migration
OK   [LF] onda P0: verificacao-onda-p0.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda P0: 13 ms (inclui verificacoes P0)
OK   [LF] onda J: verificacao-onda-j.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda J 20261127100000_external_recipient_controls (15 ms): P0 protegido apos a migration
OK   [LF] onda J: verificacao-onda-j.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda J: 31 ms (inclui verificacoes P0)
OK   [LF] onda K: verificacao-onda-k.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda K 20261201100000_email_universal_monitoring (27 ms): P0 protegido apos a migration
OK   [LF] onda K 20261202100000_email_classification_and_risk_signals (15 ms): P0 protegido apos a migration
OK   [LF] onda K 20261203100000_external_parties_contract (33 ms): P0 protegido apos a migration
OK   [LF] onda K 20261203110000_external_parties_management (4 ms): P0 protegido apos a migration
OK   [LF] onda K 20261204100000_risk_alert_cases_email_source (3 ms): P0 protegido apos a migration
OK   [LF] onda K 20261205100000_competence_validation_requests (34 ms): P0 protegido apos a migration
OK   [LF] onda K 20261205101000_closed_case_material_change_guards (16 ms): P0 protegido apos a migration
OK   [LF] onda K 20261205102000_external_send_single_use_confirmation (18 ms): P0 protegido apos a migration
OK   [LF] onda K: verificacao-onda-k.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda K: 332 ms (inclui verificacoes P0)
OK   [LF] onda L: verificacao-onda-l.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [LF] onda L 20261208100000_competence_revalidation_send_content (11 ms): P0 protegido apos a migration
OK   [LF] onda L 20261209100000_email_signal_pillars_and_review (23 ms): P0 protegido apos a migration
OK   [LF] onda L 20261209101000_external_org_global_admin_and_change_requests (9 ms): P0 protegido apos a migration
OK   [LF] onda L 20261210100000_quality_alert_area_sla (13 ms): P0 protegido apos a migration
OK   [LF] onda L: verificacao-onda-l.sql fase=depois (objetos novos presentes, somente leitura)
[LF] fim da onda L: 169 ms (inclui verificacoes P0)
OK   [LF] dados representativos preservados apos todas as ondas (acoes, prazos das 9 abertas, casos, membros, regras de SLA)
OK   [LF] sequencia nao ampliou funcoes SECURITY DEFINER executaveis por anon alem das novas ja revisadas (informativo: antes 8, depois 4)
OK   [LF] portao P0 e idempotente (reaplicar 2x nao altera nada)
OK   [LF] onda L: 4 migration(s) idempotente(s) (aplicadas 2x sem erro, P0 intacto, dados e as 9 abertas preservados; regras QUALIDADE semeadas e estaveis)
OK   [LF] controle negativo das regras de SLA: alterar regra antiga, remover regra ou criar regra nova fora de QUALIDADE FALHA
OK   [LF] onda H2 (20261123302000, so com o app): aplica, P0 intacto e escrita direta de authenticated revogada
OK   [LF] onda E (20261121177000, SO ENSAIO): MEDIO 2 e BAIXO 5 dias uteis para NOVAS acoes; as 9 abertas mantem o prazo

=== Variante CRLF: espelho do remoto (134 registradas + hotfix efetivo) e sequencia por ondas ===
OK   [CRLF] base: hotfix efetivo e P0 verificado (corpo md5 sem CR 930f6d75898793479b418950b0053bd9; bruto c2f015a91b8f4e94c52a68c3536cb89d)
[CRLF] dados representativos: 9 acoes MEDIO/BAIXO abertas; funcoes SECURITY DEFINER com EXECUTE para anon no espelho: 8
OK   [CRLF] onda A: verificacao-onda-a.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda A 20261107090000_email_mailbox_collection_controls (10 ms): P0 protegido apos a migration
OK   [CRLF] onda A 20261116090000_list_addable_profiles_for_project (1 ms): P0 protegido apos a migration
OK   [CRLF] onda A 20261118140000_sla_matrix_rules_unique_active_key (3 ms): P0 protegido apos a migration
OK   [CRLF] onda A: verificacao-onda-a.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda A: 40 ms (inclui verificacoes P0)
OK   [CRLF] onda B: verificacao-onda-b.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda B 20261120100000_sla_action_operations_by_responsible (3 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120110000_risk_case_sla_consistency_guards (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120120000_ssma_forward_and_ai_consult_limits (12 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120130000_risk_alert_action_server_side_guard (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120140000_ai_consult_reserve_global_user_lock (1 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120150000_weekly_digest_evidence_and_guards (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120151000_risk_alert_action_no_outbox_authorization (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120152000_risk_sla_consistency_report_and_email_guards (4 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120153000_null_safe_authorization_checks (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120160000_email_reply_tokens_and_ssma_by_email (22 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120170000_ai_consult_all_expert_paths (4 ms): P0 protegido apos a migration
OK   [CRLF] onda B 20261120190000_null_safe_ssma_cores (2 ms): P0 protegido apos a migration
OK   [CRLF] onda B: verificacao-onda-b.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda B: 151 ms (inclui verificacoes P0)
OK   [CRLF] onda C: verificacao-onda-c.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda C 20261121100000_centralize_project_permission_rule (2 ms): P0 protegido apos a migration
OK   [CRLF] onda C 20261121101000_null_safe_authorization_residual (4 ms): P0 protegido apos a migration
OK   [CRLF] onda C: verificacao-onda-c.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda C: 19 ms (inclui verificacoes P0)
OK   [CRLF] onda D: verificacao-onda-d.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda D 20261121110000_email_mailbox_controls_hardening (4 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121120000_email_replies_sla_digest_contract_by_email (17 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121130000_outbound_delivery_states (24 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121150000_ai_consult_governance (8 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121160000_revoke_anon_list_addable_profiles (1 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121170000_l2_revoke_anon_trigger_functions (1 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121171000_l2_forecast_followup_and_guards (18 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121172000_l2_sla_forward_by_email_audit (1 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121173000_email_specialist_consultations (10 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121174000_ai_consult_audit (9 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121175000_audit_delete_proposals_and_findings (2 ms): P0 protegido apos a migration
OK   [CRLF] onda D 20261121176000_risk_sla_consistency_closed_by_source (3 ms): P0 protegido apos a migration
OK   [CRLF] onda D: verificacao-onda-d.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda D: 369 ms (inclui verificacoes P0)
OK   [CRLF] onda F: verificacao-onda-f.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda F 20261121178000_reissue_approval_flow (3 ms): P0 protegido apos a migration
OK   [CRLF] onda F: verificacao-onda-f.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda F: 12 ms (inclui verificacoes P0)
OK   [CRLF] onda G: verificacao-onda-g.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda G 20261122100000_quality_foundation (130 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122101000_quality_rpcs (9 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122200000_seguros_garantias_model (113 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122201000_seguros_garantias_rpcs (10 ms): P0 protegido apos a migration
OK   [CRLF] onda G 20261122300000_quality_analyst_expert_id (24 ms): P0 protegido apos a migration
OK   [CRLF] onda G: verificacao-onda-g.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda G: 408 ms (inclui verificacoes P0)
OK   [CRLF] onda H1: verificacao-onda-h1.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda H1 20261123100000_acc_project_tier (3 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123101000_unified_permission_wrappers (2 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123102000_insurance_claim_advance_manage_stages (2 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123200000_endorsement_dual_review (20 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123300000_quality_integrity_guards (11 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123301000_quality_rpcs_children (9 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123303000_acc_alert_links (23 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123400000_f3e_persistence_model (36 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123401000_f3e_warranty_opinion_rpcs (2 ms): P0 protegido apos a migration
OK   [CRLF] onda H1 20261123402000_f3e_insurance_persistence_rpcs (3 ms): P0 protegido apos a migration
OK   [CRLF] onda H1: verificacao-onda-h1.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda H1: 272 ms (inclui verificacoes P0)
OK   [CRLF] onda I: verificacao-onda-i.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda I 20261124100000_project_competences (17 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261124101000_competence_enforcement (2 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261124102000_endorsement_review_requester_competence (5 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261125100000_warranty_acceptance_proof (17 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261125200000_insurance_coherence (20 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261125201000_insurance_subjects_rcc_clause_id (4 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261125202000_insurance_sources_and_grounds (9 ms): P0 protegido apos a migration
OK   [CRLF] onda I 20261125203000_insurance_advances_consolidated (2 ms): P0 protegido apos a migration
OK   [CRLF] onda I: verificacao-onda-i.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda I: 203 ms (inclui verificacoes P0)
OK   [CRLF] onda P0: verificacao-onda-p0.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda P0 20261126100000_p0_gate_record_risk_alert_action (3 ms): P0 protegido apos a migration
OK   [CRLF] onda P0: verificacao-onda-p0.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda P0: 13 ms (inclui verificacoes P0)
OK   [CRLF] onda J: verificacao-onda-j.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda J 20261127100000_external_recipient_controls (14 ms): P0 protegido apos a migration
OK   [CRLF] onda J: verificacao-onda-j.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda J: 30 ms (inclui verificacoes P0)
OK   [CRLF] onda K: verificacao-onda-k.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda K 20261201100000_email_universal_monitoring (28 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261202100000_email_classification_and_risk_signals (16 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261203100000_external_parties_contract (33 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261203110000_external_parties_management (4 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261204100000_risk_alert_cases_email_source (3 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261205100000_competence_validation_requests (35 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261205101000_closed_case_material_change_guards (16 ms): P0 protegido apos a migration
OK   [CRLF] onda K 20261205102000_external_send_single_use_confirmation (19 ms): P0 protegido apos a migration
OK   [CRLF] onda K: verificacao-onda-k.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda K: 338 ms (inclui verificacoes P0)
OK   [CRLF] onda L: verificacao-onda-l.sql fase=antes (objetos novos ausentes, somente leitura)
OK   [CRLF] onda L 20261208100000_competence_revalidation_send_content (10 ms): P0 protegido apos a migration
OK   [CRLF] onda L 20261209100000_email_signal_pillars_and_review (20 ms): P0 protegido apos a migration
OK   [CRLF] onda L 20261209101000_external_org_global_admin_and_change_requests (9 ms): P0 protegido apos a migration
OK   [CRLF] onda L 20261210100000_quality_alert_area_sla (12 ms): P0 protegido apos a migration
OK   [CRLF] onda L: verificacao-onda-l.sql fase=depois (objetos novos presentes, somente leitura)
[CRLF] fim da onda L: 162 ms (inclui verificacoes P0)
OK   [CRLF] dados representativos preservados apos todas as ondas (acoes, prazos das 9 abertas, casos, membros, regras de SLA)
OK   [CRLF] sequencia nao ampliou funcoes SECURITY DEFINER executaveis por anon alem das novas ja revisadas (informativo: antes 8, depois 4)
OK   [CRLF] portao P0 e idempotente (reaplicar 2x nao altera nada)
OK   [CRLF] onda L: 4 migration(s) idempotente(s) (aplicadas 2x sem erro, P0 intacto, dados e as 9 abertas preservados; regras QUALIDADE semeadas e estaveis)
OK   [CRLF] controle negativo das regras de SLA: alterar regra antiga, remover regra ou criar regra nova fora de QUALIDADE FALHA

=== Cenario negativo: regra de SLA ativa duplicada (LOW geral) ===
OK   [dup] A-bis (20261118140000) NAO falha, apenas avisa e NAO cria o indice unico (conferir a existencia do indice apos aplicar)
OK   [dup] 177000 FALHA com SLA_MATRIX_DUPLICATE_ACTIVE e nao deixa efeito (rollback total)
OK   [controle] corpo INTERMEDIARIO (130000 sem a guarda) e detectado pela verificacao P0 e o portao 20261126100000 falha fechado

=== Ensaio de ROLLBACK por ondas (cada onda: aplicar -> rollback em ordem inversa (2x) -> reaplicar) ===
OK   [rollback] onda A: aplicada; P0 protegido
OK   [rollback] onda A 20261118140000_sla_matrix_rules_unique_active_key.rollback.sql: executa, P0 intacto
OK   [rollback] onda A 20261118140000_sla_matrix_rules_unique_active_key.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda A 20261116090000_list_addable_profiles_for_project.rollback.sql: executa, P0 intacto
OK   [rollback] onda A 20261116090000_list_addable_profiles_for_project.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda A 20261107090000_email_mailbox_collection_controls.rollback.sql: executa, P0 intacto
OK   [rollback] onda A 20261107090000_email_mailbox_collection_controls.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda A: verificacao-onda-a.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda A: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda A: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda A: verificacao-onda-a.sql fase=depois apos reaplicar
OK   [rollback] onda B: aplicada; P0 protegido
OK   [rollback] onda B 20261120190000_null_safe_ssma_cores.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120190000_null_safe_ssma_cores.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120170000_ai_consult_all_expert_paths.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120170000_ai_consult_all_expert_paths.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120160000_email_reply_tokens_and_ssma_by_email.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120160000_email_reply_tokens_and_ssma_by_email.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120153000_null_safe_authorization_checks.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120153000_null_safe_authorization_checks.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120152000_risk_sla_consistency_report_and_email_guards.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120152000_risk_sla_consistency_report_and_email_guards.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120151000_risk_alert_action_no_outbox_authorization.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120151000_risk_alert_action_no_outbox_authorization.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120150000_weekly_digest_evidence_and_guards.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120150000_weekly_digest_evidence_and_guards.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120140000_ai_consult_reserve_global_user_lock.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120140000_ai_consult_reserve_global_user_lock.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120130000_risk_alert_action_server_side_guard.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120130000_risk_alert_action_server_side_guard.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120120000_ssma_forward_and_ai_consult_limits.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120120000_ssma_forward_and_ai_consult_limits.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120110000_risk_case_sla_consistency_guards.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120110000_risk_case_sla_consistency_guards.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B 20261120100000_sla_action_operations_by_responsible.rollback.sql: executa, P0 intacto
OK   [rollback] onda B 20261120100000_sla_action_operations_by_responsible.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda B: verificacao-onda-b.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda B: esquema apos o rollback x antes da onda: IDENTICO (reversao exata) | NO-OP: 20261120130000,20261120151000
OK   [rollback] onda B: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda B: verificacao-onda-b.sql fase=depois apos reaplicar
OK   [rollback] onda C: aplicada; P0 protegido
OK   [rollback] onda C 20261121101000_null_safe_authorization_residual.rollback.sql: executa, P0 intacto
OK   [rollback] onda C 20261121101000_null_safe_authorization_residual.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda C 20261121100000_centralize_project_permission_rule.rollback.sql: executa, P0 intacto
OK   [rollback] onda C 20261121100000_centralize_project_permission_rule.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda C: verificacao-onda-c.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda C: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda C: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda C: verificacao-onda-c.sql fase=depois apos reaplicar
OK   [rollback] onda D: aplicada; P0 protegido
OK   [rollback] onda D 20261121176000_risk_sla_consistency_closed_by_source.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121176000_risk_sla_consistency_closed_by_source.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121175000_audit_delete_proposals_and_findings.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121175000_audit_delete_proposals_and_findings.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121174000_ai_consult_audit.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121174000_ai_consult_audit.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121173000_email_specialist_consultations.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121173000_email_specialist_consultations.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121172000_l2_sla_forward_by_email_audit.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121172000_l2_sla_forward_by_email_audit.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121171000_l2_forecast_followup_and_guards.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121171000_l2_forecast_followup_and_guards.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121170000_l2_revoke_anon_trigger_functions.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121170000_l2_revoke_anon_trigger_functions.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121160000_revoke_anon_list_addable_profiles.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121160000_revoke_anon_list_addable_profiles.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121150000_ai_consult_governance.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121150000_ai_consult_governance.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121130000_outbound_delivery_states.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121130000_outbound_delivery_states.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121120000_email_replies_sla_digest_contract_by_email.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121120000_email_replies_sla_digest_contract_by_email.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D 20261121110000_email_mailbox_controls_hardening.rollback.sql: executa, P0 intacto
OK   [rollback] onda D 20261121110000_email_mailbox_controls_hardening.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda D: verificacao-onda-d.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda D: esquema apos o rollback x antes da onda: 5 diferenca(s): funcoes:~ handle_new_user(); funcoes:~ list_addable_profiles_for_project(uuid); funcoes:~ prevent_last_administrator_removal(); funcoes:~ project_delivery_items_log_risk_change(); funcoes:~ set_document_version_project_id() | NO-OP: 20261121160000,20261121170000
OK   [rollback] onda D: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda D: verificacao-onda-d.sql fase=depois apos reaplicar
OK   [rollback] onda F: aplicada; P0 protegido
OK   [rollback] onda F 20261121178000_reissue_approval_flow.rollback.sql: executa, P0 intacto
OK   [rollback] onda F 20261121178000_reissue_approval_flow.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda F: verificacao-onda-f.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda F: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda F: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda F: verificacao-onda-f.sql fase=depois apos reaplicar
OK   [rollback] onda G: aplicada; P0 protegido
OK   [rollback] onda G 20261122300000_quality_analyst_expert_id.rollback.sql: executa, P0 intacto
OK   [rollback] onda G 20261122300000_quality_analyst_expert_id.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda G 20261122201000_seguros_garantias_rpcs.rollback.sql: executa, P0 intacto
OK   [rollback] onda G 20261122201000_seguros_garantias_rpcs.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda G 20261122200000_seguros_garantias_model.rollback.sql: executa, P0 intacto
OK   [rollback] onda G 20261122200000_seguros_garantias_model.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda G 20261122101000_quality_rpcs.rollback.sql: executa, P0 intacto
OK   [rollback] onda G 20261122101000_quality_rpcs.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda G 20261122100000_quality_foundation.rollback.sql: executa, P0 intacto
OK   [rollback] onda G 20261122100000_quality_foundation.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda G: verificacao-onda-g.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda G: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda G: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda G: verificacao-onda-g.sql fase=depois apos reaplicar
OK   [rollback] onda H1: aplicada; P0 protegido
OK   [rollback] onda H1 20261123402000_f3e_insurance_persistence_rpcs.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123402000_f3e_insurance_persistence_rpcs.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123401000_f3e_warranty_opinion_rpcs.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123401000_f3e_warranty_opinion_rpcs.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123400000_f3e_persistence_model.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123400000_f3e_persistence_model.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123303000_acc_alert_links.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123303000_acc_alert_links.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123301000_quality_rpcs_children.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123301000_quality_rpcs_children.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123300000_quality_integrity_guards.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123300000_quality_integrity_guards.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123200000_endorsement_dual_review.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123200000_endorsement_dual_review.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123102000_insurance_claim_advance_manage_stages.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123102000_insurance_claim_advance_manage_stages.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123101000_unified_permission_wrappers.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123101000_unified_permission_wrappers.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1 20261123100000_acc_project_tier.rollback.sql: executa, P0 intacto
OK   [rollback] onda H1 20261123100000_acc_project_tier.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda H1: verificacao-onda-h1.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda H1: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda H1: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda H1: verificacao-onda-h1.sql fase=depois apos reaplicar
OK   [rollback] onda I: aplicada; P0 protegido
OK   [rollback] onda I 20261125203000_insurance_advances_consolidated.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261125203000_insurance_advances_consolidated.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261125202000_insurance_sources_and_grounds.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261125202000_insurance_sources_and_grounds.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261125201000_insurance_subjects_rcc_clause_id.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261125201000_insurance_subjects_rcc_clause_id.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261125200000_insurance_coherence.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261125200000_insurance_coherence.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261125100000_warranty_acceptance_proof.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261125100000_warranty_acceptance_proof.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261124102000_endorsement_review_requester_competence.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261124102000_endorsement_review_requester_competence.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261124101000_competence_enforcement.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261124101000_competence_enforcement.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I 20261124100000_project_competences.rollback.sql: executa, P0 intacto
OK   [rollback] onda I 20261124100000_project_competences.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda I: verificacao-onda-i.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda I: esquema apos o rollback x antes da onda: 2 diferenca(s): constraints:- insurance_endorsement_reviews.insurance_endorsement_reviews_check2; constraints:+ insurance_endorsement_reviews.insurance_endorsement_reviews_independence_f3_check
OK   [rollback] onda I: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda I: verificacao-onda-i.sql fase=depois apos reaplicar
OK   [rollback] onda P0: aplicada; P0 protegido
OK   [rollback] onda P0 20261126100000_p0_gate_record_risk_alert_action.rollback.sql: executa, P0 intacto
OK   [rollback] onda P0 20261126100000_p0_gate_record_risk_alert_action.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda P0: verificacao-onda-p0.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda P0: esquema apos o rollback x antes da onda: IDENTICO (reversao exata) | NO-OP: 20261126100000
OK   [rollback] onda P0: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda P0: verificacao-onda-p0.sql fase=depois apos reaplicar
OK   [rollback] onda J: aplicada; P0 protegido
OK   [rollback] onda J 20261127100000_external_recipient_controls.rollback.sql: executa, P0 intacto
OK   [rollback] onda J 20261127100000_external_recipient_controls.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda J: verificacao-onda-j.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda J: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda J: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda J: verificacao-onda-j.sql fase=depois apos reaplicar
OK   [rollback] onda K: aplicada; P0 protegido
OK   [rollback] onda K 20261205102000_external_send_single_use_confirmation.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261205102000_external_send_single_use_confirmation.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261205101000_closed_case_material_change_guards.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261205101000_closed_case_material_change_guards.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261205100000_competence_validation_requests.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261205100000_competence_validation_requests.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261204100000_risk_alert_cases_email_source.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261204100000_risk_alert_cases_email_source.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261203110000_external_parties_management.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261203110000_external_parties_management.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261203100000_external_parties_contract.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261203100000_external_parties_contract.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261202100000_email_classification_and_risk_signals.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261202100000_email_classification_and_risk_signals.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K 20261201100000_email_universal_monitoring.rollback.sql: executa, P0 intacto
OK   [rollback] onda K 20261201100000_email_universal_monitoring.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda K: verificacao-onda-k.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda K: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda K: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda K: verificacao-onda-k.sql fase=depois apos reaplicar
OK   [rollback] onda L: aplicada; P0 protegido
OK   [rollback] onda L 20261210100000_quality_alert_area_sla.rollback.sql: executa, P0 intacto
OK   [rollback] onda L 20261210100000_quality_alert_area_sla.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda L 20261209101000_external_org_global_admin_and_change_requests.rollback.sql: executa, P0 intacto
OK   [rollback] onda L 20261209101000_external_org_global_admin_and_change_requests.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda L 20261209100000_email_signal_pillars_and_review.rollback.sql: executa, P0 intacto
OK   [rollback] onda L 20261209100000_email_signal_pillars_and_review.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda L 20261208100000_competence_revalidation_send_content.rollback.sql: executa, P0 intacto
OK   [rollback] onda L 20261208100000_competence_revalidation_send_content.rollback.sql (2a execucao: idempotencia): executa, P0 intacto
OK   [rollback] onda L: verificacao-onda-l.sql fase=antes apos o rollback (objetos novos removidos)
[rollback] onda L: esquema apos o rollback x antes da onda: IDENTICO (reversao exata)
OK   [rollback] onda L: reaplicada apos o rollback; esquema igual ao da primeira aplicacao; P0 protegido
OK   [rollback] onda L: verificacao-onda-l.sql fase=depois apos reaplicar
OK   [rollback] 20261121177000 (SLA, adiada): o rollback RECUSA (irreversivel por script) e nada muda
OK   [rollback] guarda de dados: com evidencia gravada (organizacao externa) o rollback RECUSA (ROLLBACK_BLOCKED) e nada e apagado
OK   [rollback] guarda de dados (gerado pela H5): com consumo de IA gravado (ai_consult_usage) o rollback de 20261120120000 RECUSA e nada e apagado

384 ok, 0 falha(s) - PostgreSQL 17.12
```
