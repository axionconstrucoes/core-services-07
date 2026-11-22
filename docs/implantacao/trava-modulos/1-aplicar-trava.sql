-- TRAVA DE MÓDULOS NÃO HOMOLOGADOS — Fase 2 do piloto WEG (versão AMPLIADA, Frente C, 22/11/2026)
-- Aplicar logo após a onda M, ANTES de reabrir o aplicativo. Sem segredos; roda no SQL Editor/psql como dono das funções.
--
-- Mecanismo nativo do PostgreSQL: revoga EXECUTE de authenticated/anon/public das RPCs de escrita
--   (a) das telas BLOQUEADAS/FIXTURE do roteiro e de Competências  ............................ 23 (lista original)
--   (b) das operações de RNC (Qualidade) e Garantias G-04 a G-10 NÃO comprovadas em sessão autenticada ... 12 (ampliação)
-- Total esperado: 35 funções, 1 assinatura por nome (sem sobrecarga; conferido no acc-homolog em 22/11/2026).
--
-- Por que basta: nenhuma tabela desses módulos aceita INSERT/UPDATE/DELETE direto de authenticated; as RPCs são o único
-- caminho e as Server Actions usam o cliente do USUÁRIO (papel authenticated). Revogadas, a chamada direta pela API e a tela
-- recebem 42501. service_role e o dono (postgres) mantêm EXECUTE; nenhuma outra função chama estas 35 (varredura de prosrc).
-- Nenhuma tabela, dado, política, linha de quality_state_transitions ou regra de nível (acc_project_tier) é alterada.
--
-- Estado anterior (ACL) das 35: postgres=X, authenticated=X, service_role=X (sem anon e sem PUBLIC). A reversão devolve só authenticated.
-- Detalhes, classificação e decisões pendentes: README.md desta pasta.
do $$
declare
  base_23 text[] := array[
    -- Qualidade: telas BLOQUEADAS (custos, ensaios, inspeções, reclamações, recorrências, requisitos)
    'quality_cost_register','quality_test_register','quality_inspection_register','quality_complaint_register','quality_recurrence_register','quality_requirement_register',
    -- Seguros/Garantias: telas só em FIXTURE (dossiês, fianças e garantias, sujeitos e RCC)
    'insurance_dossier_item_set','insurance_dossier_sync','bank_guarantee_register','bank_guarantee_update','other_guarantee_register','other_guarantee_update',
    'insurance_expected_subject_save','insurance_rcc_checklist_save',
    -- Competências (sem homologação; decisões especializadas continuam em ADMIN pela regra vigente)
    'project_competence_grant','project_competence_request_cancel','project_competence_request_create','project_competence_request_decide','project_competence_revalidate',
    'project_competence_revoke','project_competence_validator_accept','project_competence_validator_designate','project_competence_validator_revoke'];
  ampliacao_12 text[] := array[
    -- RNC: passos NÃO vistos em sessão autenticada (Q-04 reclassificar, Q-06 causa/prazo, execução de CAPA, eficácia, consequências)
    'quality_ncr_update_fields','quality_evidence_revise','quality_capa_update_status','quality_verification_register','quality_consequence_register',
    -- Garantias G-04 a G-10: vistoria, manutenção, reparo/custo, edição de causa/prazos, aceite (registro e prova), parecer de cobertura
    'quality_warranty_survey_register','quality_warranty_maintenance_register','quality_warranty_repair_register','quality_warranty_case_update',
    'quality_warranty_acceptance_register','quality_warranty_acceptance_prove','quality_warranty_opinion_save'];
  bloquear text[] := base_23 || ampliacao_12;
  r record; n int := 0; faltando text[];
begin
  select array_agg(x) into faltando from unnest(bloquear) x
   where (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = x) <> 1;
  if faltando is not null then raise exception 'TRAVA: nome ausente ou sobrecarregado (esperado 1 assinatura): %', faltando; end if;
  for r in select p.proname, pg_get_function_identity_arguments(p.oid) args
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace
            where s.nspname = 'public' and p.proname = any(bloquear) loop
    execute format('revoke execute on function public.%I(%s) from authenticated, anon, public', r.proname, r.args);
    n := n + 1;
  end loop;
  if n <> 35 then raise exception 'TRAVA: esperadas 35 funções, encontradas %', n; end if;
  -- audit_log_entries.project_id e NOT NULL (20260819195713): a trava e global, entao grava-se 1 linha por obra (rastreavel em cada obra).
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  select pr.id, 'SYSTEM', null, null, 'MODULE_LOCK_APPLIED', 'DatabaseFunction', 'trava-modulos-fase2-ampliada',
         '35 RPCs (23 telas bloqueadas/fixture/competencias + 12 RNC/Garantias nao comprovadas) com EXECUTE revogado para authenticated/anon/public.'
    from public.projects pr;
end $$;

-- CONFERÊNCIA 1 (esperado: travadas_total = 35, ainda_executaveis = 0)
select count(*) as travadas_total,
       count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')
                           or has_function_privilege('anon', p.oid, 'EXECUTE')) as ainda_executaveis_esperado_0
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = any(array[
  'quality_cost_register','quality_test_register','quality_inspection_register','quality_complaint_register','quality_recurrence_register','quality_requirement_register',
  'insurance_dossier_item_set','insurance_dossier_sync','bank_guarantee_register','bank_guarantee_update','other_guarantee_register','other_guarantee_update',
  'insurance_expected_subject_save','insurance_rcc_checklist_save',
  'project_competence_grant','project_competence_request_cancel','project_competence_request_create','project_competence_request_decide','project_competence_revalidate',
  'project_competence_revoke','project_competence_validator_accept','project_competence_validator_designate','project_competence_validator_revoke',
  'quality_ncr_update_fields','quality_evidence_revise','quality_capa_update_status','quality_verification_register','quality_consequence_register',
  'quality_warranty_survey_register','quality_warranty_maintenance_register','quality_warranty_repair_register','quality_warranty_case_update',
  'quality_warranty_acceptance_register','quality_warranty_acceptance_prove','quality_warranty_opinion_save']);

-- CONFERÊNCIA 2 (esperado: liberadas_executaveis = 6) — operações COMPROVADAS ou PARCIAIS-com-decisão que continuam liberadas
select count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')) as liberadas_executaveis_esperado_6
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname = any(array[
  'quality_ncr_create','quality_ncr_transition','quality_evidence_register','quality_capa_register','quality_warranty_create','quality_warranty_transition']);

-- CONFERÊNCIA 3 (pré-condição da contenção natural; esperado 0): competência TECNICO_RESPONSAVEL ATIVA.
-- Com competências travadas e 0 ativas, CONFIRMADA/NAO_CONFIRMADA/ENCERRADA (RNC) e COBERTA/NAO_COBERTA (garantia) são
-- recusadas por quality_state_event_competence_guard (COMPETENCE_REQUIRED). Se der > 0, levar ao responsável ANTES de reabrir.
select count(*) as tecnico_responsavel_ativas_esperado_0
from public.project_competences where status = 'ACTIVE' and competence = 'TECNICO_RESPONSAVEL';
