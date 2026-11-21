-- Rollback de 20261208100000_competence_revalidation_send_content.sql (Fase 6/H2a).
-- Conteúdo de preparação e eventos de revalidação são EVIDÊNCIA de auditoria: o script RECUSA apagar se houver registro; exporte antes.
do $$
begin
  if exists (select 1 from public.external_send_preparation_contents)
     or exists (select 1 from public.project_competence_governance_events where action = 'REVALIDATED') then
    raise exception 'ROLLBACK_BLOCKED: há conteúdos de preparação ou eventos de revalidação registrados; exporte-os (evidência) e remova manualmente com autorização';
  end if;
end $$;
drop function if exists public.acc_external_send_prepare_with_content(uuid, text, text, text[], text, text, text, text, text[], text, uuid);
drop function if exists public.acc_external_send_content_hash(text, text, text[]);
drop table if exists public.external_send_preparation_contents;
drop function if exists public.project_competence_revalidate(uuid, integer, text, boolean);
-- restaura acc_int_require_competence de 20261124101000
create or replace function public.acc_int_require_competence(p_project_id uuid, p_actor uuid, p_competences text[], p_act text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null then return; end if;
  if not public.acc_user_has_competence(p_project_id, p_actor, p_competences) then
    raise exception 'COMPETENCE_REQUIRED: % exige competência % registrada para você neste projeto (nível de gestão não substitui)',
      p_act, array_to_string(p_competences, ' ou ');
  end if;
end;
$$;
revoke all on function public.acc_int_require_competence(uuid, uuid, text[], text) from public, anon, authenticated;
-- restaura acc_user_has_competence de 20261205100000 (sem a condição de revalidação)
create or replace function public.acc_user_has_competence(p_project_id uuid, p_user_id uuid, p_competences text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is not null and p_user_id is not null and coalesce(cardinality(p_competences), 0) > 0
    and exists (
      select 1
        from public.project_competences c
        join public.project_memberships pm on pm.project_id = c.project_id and pm.user_id = c.user_id and pm.status = 'ACTIVE'
       where c.project_id = p_project_id and c.user_id = p_user_id and c.status = 'ACTIVE'
         and c.habilitation_status in ('VALIDATED', 'MAINTENANCE')
         and c.competence = any (p_competences)
         and c.valid_from <= current_date and (c.valid_until is null or c.valid_until >= current_date));
$$;
revoke all on function public.acc_user_has_competence(uuid, uuid, text[]) from public, anon, authenticated;
alter table public.project_competence_governance_events drop constraint if exists project_competence_governance_events_action_check;
alter table public.project_competence_governance_events add constraint project_competence_governance_events_action_check
  check (action in ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'VALIDATOR_DESIGNATED', 'VALIDATOR_ACCEPTED', 'VALIDATOR_REVOKED'));
alter table public.project_competences drop constraint if exists project_competences_revalidation_status_chk;
alter table public.project_competences drop column if exists revalidation_note;
alter table public.project_competences drop column if exists revalidated_at;
alter table public.project_competences drop column if exists revalidated_by;
alter table public.project_competences drop column if exists revalidation_status;
