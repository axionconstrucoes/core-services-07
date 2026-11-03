-- ============================================================
-- 20261030130000_fix_construmanager_budget_response_state.sql
--
-- Defeito: submit_construmanager_budget_response() conclui a revisão (status = 'CONCLUIDA' + budget_response), mas o CHECK
-- construmanager_version_impact_reviews_check só aceitava `send_to_budget = true` com status 'PENDENTE_ORCAMENTO'. Toda resposta do
-- orçamento falhava com violação de CHECK e a revisão ficava eternamente pendente.
--
-- Correção (só na máquina de estados da tabela; a função e suas validações não mudam): o CHECK passa a descrever os três estados
-- consistentes, ligando status aos campos de resposta, para que nenhuma combinação incoerente seja gravável:
--   1. sem envio ao orçamento ........ CONCLUIDA, sem responsável de orçamento e sem resposta;
--   2. enviada, aguardando orçamento . PENDENTE_ORCAMENTO, com responsável, ainda sem resposta;
--   3. enviada e respondida .......... CONCLUIDA, com responsável, resposta (>= 10 caracteres) e data da resposta.
-- Linhas existentes: o único caminho que as criou (submit_construmanager_version_impact_review) só gera os estados 1 e 2, então a
-- nova constraint é validada contra todos os dados; se alguma linha for incoerente a migration falha e nada é aplicado.
-- ============================================================

begin;

alter table public.construmanager_version_impact_reviews
  drop constraint construmanager_version_impact_reviews_check;

alter table public.construmanager_version_impact_reviews
  add constraint construmanager_version_impact_reviews_state_check check (
    (
      not send_to_budget and budget_user_id is null
      and budget_response is null and budget_responded_at is null
      and status = 'CONCLUIDA'
    ) or (
      send_to_budget and budget_user_id is not null
      and budget_response is null and budget_responded_at is null
      and status = 'PENDENTE_ORCAMENTO'
    ) or (
      send_to_budget and budget_user_id is not null
      and coalesce(length(btrim(budget_response)), 0) >= 10 and budget_responded_at is not null
      and status = 'CONCLUIDA'
    )
  );

commit;
