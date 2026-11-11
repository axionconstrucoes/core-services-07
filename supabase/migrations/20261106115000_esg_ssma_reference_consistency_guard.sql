-- ============================================================
-- 20261106115000_esg_ssma_reference_consistency_guard.sql
--
-- PROPOSTA DE ENDURECIMENTO. NÃO APLICADA EM NENHUM AMBIENTE REMOTO. Depende de
-- 20261106110000_ssma_esg_evidence_reference.sql (esg_ssma_record_references).
-- Não altera nem substitui o SQL de 20261106100000 / 20261106110000: é uma migration NOVA e aditiva.
--
-- PROBLEMA COMPROVADO (PostgreSQL 17.6 local, papel authenticated, RLS real): a consistência
-- obra = obrigação = comprovação = registro de uma referência só é verificada no INSERT, dentro de
-- esg_link_ssma_record. Depois disso, quem pode atualizar a tabela-mãe consegue deixar a referência
-- inconsistente. Exemplo reproduzido: Administrador das DUAS obras faz UPDATE em esg_obligations.project_id
-- (policy esg_obligations_update_editor + grant de coluna) e a referência continua na obra 1 enquanto a
-- obrigação passa à obra 2. O papel service_role/superusuário faz o mesmo em ssma_field_records.project_id.
-- Não abre acesso entre obras (a leitura da referência segue o project_id gravado), mas quebra a garantia
-- documentada ("mesma obra obrigatória").
--
-- CORREÇÃO: trava a mudança de project_id (e de obligation_id na comprovação) de qualquer linha que tenha
-- referência, ATIVA OU REVOGADA — o histórico revogado também ancora a rastreabilidade. As demais colunas
-- continuam atualizáveis; linhas sem referência não são afetadas.
--   - SECURITY DEFINER: o gatilho precisa enxergar as referências de qualquer obra (a RLS da tabela de
--     referências só mostra as da obra do usuário; sem isso, quem não é membro dela burlaria a trava).
--   - ENABLE ALWAYS: vale também com session_replication_role = replica (como uma CHECK valeria).
-- Aditiva e idempotente; não apaga nem reescreve dados.
-- ============================================================

create or replace function public.esg_ssma_reference_parent_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'ssma_field_records' then
    if new.project_id is distinct from old.project_id
       and exists (select 1 from public.esg_ssma_record_references x where x.field_record_id = old.id) then
      raise exception 'ESG_SSMA_REFERENCE_LOCKED: o registro de campo SSMA % tem referência ESG; a obra não pode ser alterada.', old.id
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'esg_obligation_submissions' then
    if (new.project_id is distinct from old.project_id or new.obligation_id is distinct from old.obligation_id)
       and exists (select 1 from public.esg_ssma_record_references x where x.submission_id = old.id) then
      raise exception 'ESG_SSMA_REFERENCE_LOCKED: a comprovação ESG % tem referência de registro SSMA; obra e obrigação não podem ser alteradas.', old.id
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'esg_obligations' then
    if new.project_id is distinct from old.project_id
       and exists (select 1 from public.esg_ssma_record_references x where x.obligation_id = old.id) then
      raise exception 'ESG_SSMA_REFERENCE_LOCKED: a obrigação ESG % tem comprovação com referência de registro SSMA; a obra não pode ser alterada.', old.id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.esg_ssma_reference_parent_guard() from public, anon, authenticated;

drop trigger if exists esg_ssma_reference_guard on public.ssma_field_records;
create trigger esg_ssma_reference_guard
before update of project_id on public.ssma_field_records
for each row execute function public.esg_ssma_reference_parent_guard();

drop trigger if exists esg_ssma_reference_guard on public.esg_obligation_submissions;
create trigger esg_ssma_reference_guard
before update of project_id, obligation_id on public.esg_obligation_submissions
for each row execute function public.esg_ssma_reference_parent_guard();

drop trigger if exists esg_ssma_reference_guard on public.esg_obligations;
create trigger esg_ssma_reference_guard
before update of project_id on public.esg_obligations
for each row execute function public.esg_ssma_reference_parent_guard();

alter table public.ssma_field_records enable always trigger esg_ssma_reference_guard;
alter table public.esg_obligation_submissions enable always trigger esg_ssma_reference_guard;
alter table public.esg_obligations enable always trigger esg_ssma_reference_guard;
