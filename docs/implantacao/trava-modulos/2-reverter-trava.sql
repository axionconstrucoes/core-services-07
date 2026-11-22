-- REVERSÃO da trava de módulos (versão AMPLIADA, 35 RPCs): devolve EXECUTE a authenticated = estado anterior exato
-- (ACL original das 35: postgres, authenticated, service_role; anon e PUBLIC nunca tiveram EXECUTE).
-- Usar POR MÓDULO, só depois da homologação autenticada da tela/passo correspondente: apagar da lista `liberar` o que deve
-- continuar travado e ajustar `esperado`. Reversão total = lista inteira (35).
do $$
declare
  liberar text[] := array[
    -- 23 originais
    'quality_cost_register','quality_test_register','quality_inspection_register','quality_complaint_register','quality_recurrence_register','quality_requirement_register',
    'insurance_dossier_item_set','insurance_dossier_sync','bank_guarantee_register','bank_guarantee_update','other_guarantee_register','other_guarantee_update',
    'insurance_expected_subject_save','insurance_rcc_checklist_save',
    'project_competence_grant','project_competence_request_cancel','project_competence_request_create','project_competence_request_decide','project_competence_revalidate',
    'project_competence_revoke','project_competence_validator_accept','project_competence_validator_designate','project_competence_validator_revoke',
    -- 12 da ampliação (RNC e Garantias G-04 a G-10)
    'quality_ncr_update_fields','quality_evidence_revise','quality_capa_update_status','quality_verification_register','quality_consequence_register',
    'quality_warranty_survey_register','quality_warranty_maintenance_register','quality_warranty_repair_register','quality_warranty_case_update',
    'quality_warranty_acceptance_register','quality_warranty_acceptance_prove','quality_warranty_opinion_save'];
  esperado int := 35;
  r record; n int := 0;
begin
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) args
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname = any(liberar) loop
    execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
    n := n + 1;
  end loop;
  if n <> esperado then raise exception 'REVERSÃO: esperadas % funções, encontradas %', esperado, n; end if;
  -- audit_log_entries.project_id e NOT NULL: 1 linha por obra (ver 1-aplicar-trava.sql).
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  select pr.id, 'SYSTEM', null, null, 'MODULE_LOCK_REVERTED', 'DatabaseFunction', 'trava-modulos-fase2-ampliada',
         n || ' RPCs com EXECUTE devolvido a authenticated: ' || array_to_string(liberar, ', ')
    from public.projects pr;
end $$;

-- CONFERÊNCIA (reversão total: esperado executaveis_authenticated = 35 e anon = 0)
select count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as executaveis_authenticated,
       count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')) as executaveis_anon_esperado_0
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname ~ '^(quality_(cost|test|inspection|complaint|recurrence|requirement)_register|insurance_dossier_(item_set|sync)|(bank|other)_guarantee_(register|update)|insurance_expected_subject_save|insurance_rcc_checklist_save|project_competence_(grant|request_cancel|request_create|request_decide|revalidate|revoke|validator_accept|validator_designate|validator_revoke)|quality_(ncr_update_fields|evidence_revise|capa_update_status|verification_register|consequence_register)|quality_warranty_(survey_register|maintenance_register|repair_register|case_update|acceptance_register|acceptance_prove|opinion_save))$';
