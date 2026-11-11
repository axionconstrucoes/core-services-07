-- ============================================================
-- 20261106115000_esg_ssma_reference_consistency_guard.sql
--
-- PROPOSTA DE ENDURECIMENTO. NÃO APLICADA EM NENHUM AMBIENTE REMOTO. Depende de
-- 20261106110000_ssma_esg_evidence_reference.sql (esg_ssma_record_references).
-- Não altera nem substitui o SQL de 20261106100000 / 20261106110000: é uma migration NOVA e aditiva.
--
-- PROBLEMA COMPROVADO (PostgreSQL 17.6 local, papel authenticated, RLS real):
--  1) A consistência obra = obrigação = comprovação = registro de uma referência só é verificada no INSERT, dentro de
--     esg_link_ssma_record, e mesmo ali a obra da OBRIGAÇÃO não é comparada com a da comprovação. Depois do INSERT, quem pode
--     atualizar a tabela-mãe deixa a referência inconsistente: Administrador das DUAS obras faz UPDATE em esg_obligations.project_id
--     (policy esg_obligations_update_editor + grant de coluna); service_role/superusuário faz o mesmo em ssma_field_records.project_id.
--  2) Corrida vincular x mover a obrigação de obra: em 98 de 120 rodadas ambos tiveram sucesso e a referência ficou inconsistente.
-- Não abre acesso entre obras (a leitura da referência segue o project_id gravado), mas quebra a garantia documentada
-- ("mesma obra obrigatória").
--
-- CORREÇÃO DECLARATIVA: chaves estrangeiras COMPOSTAS da referência para cada pai, incluindo a obra (e, na comprovação, a obrigação).
--   - O INSERT só passa se a cadeia inteira for da mesma obra (vale também para vínculo contra cadeia que já estava inconsistente).
--   - Enquanto existir QUALQUER referência (ativa ou revogada), project_id (e obligation_id, na comprovação) do pai não mudam.
--   - Concorrência: o FK trava o pai (FOR KEY SHARE) no INSERT e o UPDATE da chave exige trava incompatível; os dois se serializam
--     sem gatilho e sem janela.
--   - Nenhum gatilho de usuário na tabela de referências (contrato de 20261106110000 preservado); as FKs usam só os gatilhos internos.
--   - Efeito colateral: UNIQUE adicionais (id, project_id[, obligation_id]) nos três pais (redundantes com a PK, necessárias como alvo
--     da FK composta). Tabelas pequenas; ALTER TABLE usa trava breve. Linhas sem referência não são afetadas e as demais colunas
--     continuam atualizáveis.
--   - Limite: como toda FK, é contornada por session_replication_role = replica (superusuário), igual às FKs que já existem.
-- Aditiva e idempotente; não apaga nem reescreve dados. Se houver referência já inconsistente, a migration FALHA (não esconde).
-- ============================================================

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'esg_obligations_id_project_uk' and conrelid = 'public.esg_obligations'::regclass) then
    alter table public.esg_obligations add constraint esg_obligations_id_project_uk unique (id, project_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'esg_obligation_submissions_chain_uk' and conrelid = 'public.esg_obligation_submissions'::regclass) then
    alter table public.esg_obligation_submissions add constraint esg_obligation_submissions_chain_uk unique (id, project_id, obligation_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ssma_field_records_id_project_uk' and conrelid = 'public.ssma_field_records'::regclass) then
    alter table public.ssma_field_records add constraint ssma_field_records_id_project_uk unique (id, project_id);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'esg_ssma_record_references_submission_chain_fk' and conrelid = 'public.esg_ssma_record_references'::regclass) then
    alter table public.esg_ssma_record_references
      add constraint esg_ssma_record_references_submission_chain_fk
      foreign key (submission_id, project_id, obligation_id)
      references public.esg_obligation_submissions (id, project_id, obligation_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'esg_ssma_record_references_obligation_project_fk' and conrelid = 'public.esg_ssma_record_references'::regclass) then
    alter table public.esg_ssma_record_references
      add constraint esg_ssma_record_references_obligation_project_fk
      foreign key (obligation_id, project_id)
      references public.esg_obligations (id, project_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'esg_ssma_record_references_record_project_fk' and conrelid = 'public.esg_ssma_record_references'::regclass) then
    alter table public.esg_ssma_record_references
      add constraint esg_ssma_record_references_record_project_fk
      foreign key (field_record_id, project_id)
      references public.ssma_field_records (id, project_id);
  end if;
end;
$$;
