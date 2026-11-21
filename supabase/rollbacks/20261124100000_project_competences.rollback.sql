-- Rollback de 20261124100000_project_competences.sql (Fase 4/A). Executar SOMENTE depois de reverter 20261124101000 e 20261124102000
-- (os gatilhos e a RPC de conferência dependem de acc_user_has_competence / project_competences).
-- Competência já concedida é EVIDÊNCIA de auditoria: o script RECUSA apagar as tabelas se houver registro; nesse caso exporte antes e decida.
do $$
begin
  if exists (select 1 from public.project_competences) or exists (select 1 from public.project_competence_events) then
    raise exception 'ROLLBACK_BLOCKED: há competências/eventos registrados; exporte-os (evidência) e remova manualmente com autorização';
  end if;
end $$;
drop function if exists public.project_competence_grant(uuid, uuid, text, jsonb);
drop function if exists public.project_competence_revoke(uuid, integer, text);
drop function if exists public.acc_has_competence(uuid, text);
drop function if exists public.acc_user_has_competence(uuid, uuid, text[]);
drop table if exists public.project_competence_events;
drop table if exists public.project_competences;
drop function if exists public.project_competences_guard();
