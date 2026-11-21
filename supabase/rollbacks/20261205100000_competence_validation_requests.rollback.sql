-- Rollback de 20261205100000_competence_validation_requests.sql (Fase 5/E).
-- Solicitações, validadores e eventos são EVIDÊNCIA de auditoria: o script RECUSA apagar se houver registro; exporte antes e decida.
do $$
begin
  if exists (select 1 from public.project_competence_requests) or exists (select 1 from public.project_competence_validators)
     or exists (select 1 from public.project_competence_governance_events) then
    raise exception 'ROLLBACK_BLOCKED: há solicitações/validadores/eventos registrados; exporte-os (evidência) e remova manualmente com autorização';
  end if;
end $$;
drop trigger if exists project_competences_habilitation_trg on public.project_competences;
drop function if exists public.project_competences_habilitation_guard();
-- restaura a definição de acc_user_has_competence de 20261124100000 (sem a condição de habilitação)
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
         and c.competence = any (p_competences)
         and c.valid_from <= current_date and (c.valid_until is null or c.valid_until >= current_date));
$$;
revoke all on function public.acc_user_has_competence(uuid, uuid, text[]) from public, anon, authenticated;
drop function if exists public.project_competence_request_create(uuid, uuid, text, jsonb);
drop function if exists public.project_competence_request_cancel(uuid, integer, text);
drop function if exists public.project_competence_request_decide(uuid, integer, text, text, boolean);
drop function if exists public.project_competence_validator_designate(uuid, uuid, uuid, text, date);
drop function if exists public.project_competence_validator_accept(uuid);
drop function if exists public.project_competence_validator_revoke(uuid, text);
drop function if exists public.acc_competence_gov_event(uuid, uuid, uuid, text, text, jsonb);
alter table public.project_competences drop constraint if exists project_competences_habilitation_request_fk;
drop table if exists public.project_competence_governance_events;
drop table if exists public.project_competence_validators;
drop table if exists public.project_competence_requests;
drop function if exists public.project_competence_requests_guard();
drop function if exists public.project_competence_validators_guard();
drop function if exists public.acc_is_designated_competence_validator(uuid, uuid);
alter table public.project_competences drop constraint if exists project_competences_habilitation_status_chk;
alter table public.project_competences drop column if exists habilitation_request_id;
alter table public.project_competences drop column if exists habilitation_status;
