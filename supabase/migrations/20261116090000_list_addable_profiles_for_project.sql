-- PENDENCIA DE BANCO (nao aplicada automaticamente): lista de usuarios da empresa
-- elegiveis para serem ADICIONADOS a um projeto pela tela Usuarios (selecao por checkbox).
--
-- Motivo: a RLS de profiles so mostra o proprio perfil e "colegas de projeto"; um
-- administrador nao consegue listar usuarios que ainda nao participam do projeto.
-- find_profile_by_email exige e-mail exato. Esta RPC e SOMENTE LEITURA, sem efeitos.
--
-- Seguranca:
-- - exige ADMINISTRADOR ativo do projeto informado (has_project_permission);
-- - restringe ao dominio corporativo @axion.com.br;
-- - exclui quem ja tem qualquer membership (ativa ou inativa) neste projeto — inativos
--   aparecem na propria lista de participantes do projeto e sao reativados, nao re-adicionados;
-- - retorna o minimo: id, nome, e-mail, iniciais.
-- A escrita continua exclusivamente por add_project_member / set_project_member_status
-- (que ja auditam em audit_log_entries e protegem o ultimo administrador).
-- O codigo do app degrada com seguranca (sem candidatos para adicao) se esta funcao nao existir.

create or replace function public.list_addable_profiles_for_project(p_project_id uuid)
returns table (id uuid, name text, email text, avatar_initials text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_project_permission(p_project_id, 'ADMINISTRADOR') then
    raise exception 'Apenas administradores do projeto podem listar usuários.';
  end if;

  return query
    select p.id, p.name, p.email, p.avatar_initials
    from public.profiles p
    where lower(split_part(p.email, '@', 2)) = 'axion.com.br'
      and not exists (
        select 1 from public.project_memberships pm
        where pm.project_id = p_project_id and pm.user_id = p.id
      )
    order by p.name;
end;
$$;

revoke all on function public.list_addable_profiles_for_project(uuid) from public;
grant execute on function public.list_addable_profiles_for_project(uuid) to authenticated;
