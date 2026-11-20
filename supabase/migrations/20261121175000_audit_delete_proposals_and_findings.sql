-- LOTE 5 / Governança — auditoria de DELETE em project_additional_proposals e ai_findings.
--
-- Lacuna observada no banco operacional: existem 167 eventos PROJECT_ADDITIONAL_PROPOSAL_CREATED
-- e 104 AI_FINDING_CREATED, mas as duas tabelas estão vazias e NÃO há registro de quem/quando
-- as linhas foram removidas (só havia trigger de INSERT/UPDATE). Esta migration fecha a lacuna:
-- todo DELETE passa a gerar uma linha append-only em audit_log_entries com metadata compacta
-- (nunca o texto integral de descrição/interpretação).
--
-- Regras: SECURITY DEFINER com search_path vazio; sem EXECUTE para anon/authenticated/public
-- (funções de trigger; o PostgreSQL as dispara sem exigir EXECUTE do chamador); idempotente;
-- não altera dados nem políticas; NÃO apagar/reescrever migrations anteriores.
--
-- Cascata de exclusão do projeto: se o projeto-pai não existe mais, o registro de auditoria
-- (FK project_id) seria impossível e o próprio audit_log já restringe a exclusão do projeto;
-- por isso o trigger só audita quando o projeto ainda existe (nunca falha a exclusão).

create or replace function public.audit_additional_proposal_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label,
    action, entity_type, entity_id, detail, occurred_at
  )
  values (
    old.project_id,
    case when v_actor_user_id is null then 'SYSTEM' else 'USER' end,
    v_actor_user_id,
    null,
    'PROJECT_ADDITIONAL_PROPOSAL_DELETED',
    'PROJECT_ADDITIONAL_PROPOSAL',
    old.id::text,
    format(
      'Proposta de adicional excluída: %s (origem %s, status %s no momento da exclusão).',
      old.proposal_number, old.source_type, old.status
    ),
    now()
  );
  return old;
end;
$$;

drop trigger if exists project_additional_proposals_audit_deleted on public.project_additional_proposals;
create trigger project_additional_proposals_audit_deleted
  after delete on public.project_additional_proposals
  for each row execute function public.audit_additional_proposal_deleted();

create or replace function public.audit_ai_finding_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_user_id uuid := auth.uid();
begin
  if not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label,
    action, entity_type, entity_id, detail, occurred_at
  )
  values (
    old.project_id,
    case when v_actor_user_id is null then 'SYSTEM' else 'USER' end,
    v_actor_user_id,
    null,
    'AI_FINDING_DELETED',
    'AI_FINDING',
    old.id::text,
    format(
      'Finding %s excluído (severidade %s, situação %s no momento da exclusão).',
      old.finding_type, old.severity, old.lifecycle_status
    ),
    now()
  );
  return old;
end;
$$;

drop trigger if exists ai_findings_audit_deleted on public.ai_findings;
create trigger ai_findings_audit_deleted
  after delete on public.ai_findings
  for each row execute function public.audit_ai_finding_deleted();

revoke all on function public.audit_additional_proposal_deleted() from public, anon, authenticated;
revoke all on function public.audit_ai_finding_deleted() from public, anon, authenticated;
