-- Rollback de 20261124100000_project_competences.sql (Fase 4/A). Executar SOMENTE depois de reverter 20261124101000 e 20261124102000
-- (os gatilhos e a RPC de conferência dependem de acc_user_has_competence / project_competences).
-- Competência já concedida é EVIDÊNCIA de auditoria: o script RECUSA apagar as tabelas se houver registro; nesse caso exporte antes e decida.
-- funcao TEMPORARIA (pg_temp; some ao fim da sessao): torna a guarda idempotente (tabela ja removida => sem linhas)
begin;
create or replace function pg_temp.rb_has_rows(p_table text, p_where text default 'true') returns boolean
language plpgsql as $f$
declare r boolean;
begin
  if to_regclass('public.' || p_table) is null then return false; end if;
  execute format('select exists (select 1 from public.%I where %s)', p_table, p_where) into r;
  return r;
exception when undefined_column then return false;
end $f$;
do $$
begin
  if pg_temp.rb_has_rows('project_competences') or pg_temp.rb_has_rows('project_competence_events') then
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
commit;
