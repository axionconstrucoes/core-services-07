-- ============================================================
-- 20261111120000_copy_project_team.sql
--
-- PROPOSTA PARA REVISÃO. NÃO APLICADA EM NENHUM AMBIENTE REMOTO.
--
-- "Copiar estrutura de outro projeto" — primeira categoria: EQUIPE E PERFIS DE ACESSO.
-- Uma RPC nova, aditiva e atômica por pessoa, que REUSA a RPC oficial add_project_member (mesma validação de
-- Administrador, mesmo papel/área, mesma auditoria MEMBER_ADDED e mesmo backfill de e-mail do cadastro manual).
--
-- O que ela faz:
--   * exige ADMINISTRADOR ativo no projeto de ORIGEM e no de DESTINO (checagem no banco, independente da interface);
--   * recebe uma lista de pessoas (user_id, permission, area, explicit_admin) e, para cada uma, só VINCULA no destino
--     quem é membro ATIVO da origem e ainda não é membro do destino;
--   * NÃO sobrescreve: quem já é membro do destino (qualquer papel/status) é devolvido como ALREADY_MEMBER, sem alteração;
--   * Administrador no destino só com explicit_admin = true (a interface nunca propõe Administrador por padrão);
--   * pula a própria pessoa que executa (já pertence aos dois projetos);
--   * repetir a operação não duplica (a segunda execução devolve ALREADY_MEMBER para todos);
--   * falha de uma pessoa não desfaz as demais (sub-transação por pessoa) e é devolvida como ERROR;
--   * grava auditoria: MEMBER_ADDED por pessoa (via add_project_member) + um registro PROJECT_TEAM_COPIED no DESTINO e um
--     PROJECT_TEAM_COPY_USED_AS_SOURCE na ORIGEM, com origem, destino, executor e contagens.
--
-- O que ela NÃO faz (de propósito): não copia documentos, registros, credenciais, autorizações de e-mail, destinatários
-- de alertas, pastas do Drive nem configurações; não envia convites nem e-mails; não altera acessos existentes.
-- ============================================================

create or replace function public.copy_project_team(
  p_source_project_id uuid,
  p_destination_project_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_user uuid;
  v_perm text;
  v_area text;
  v_explicit boolean;
  v_src public.project_memberships;
  v_dst public.project_memberships;
  v_status text;
  v_message text;
  v_results jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}';
  v_added integer := 0;
  v_already integer := 0;
  v_skipped integer := 0;
  v_errors integer := 0;
  v_added_ids text := '';
  v_src_label text;
  v_dst_label text;
  v_actor_name text;
begin
  if v_actor is null then
    raise exception 'Autenticação obrigatória.';
  end if;
  if p_source_project_id is null or p_destination_project_id is null then
    raise exception 'Origem e destino são obrigatórios.';
  end if;
  if p_source_project_id = p_destination_project_id then
    raise exception 'Origem e destino precisam ser projetos diferentes.';
  end if;
  if not public.has_project_permission(p_source_project_id, 'ADMINISTRADOR') then
    raise exception 'Apenas administradores do projeto de origem podem copiar a equipe.';
  end if;
  if not public.has_project_permission(p_destination_project_id, 'ADMINISTRADOR') then
    raise exception 'Apenas administradores do projeto de destino podem receber a equipe.';
  end if;
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 200 then
    raise exception 'Lista de pessoas inválida (1 a 200 itens).';
  end if;

  select format('%s (%s)', name, code) into v_src_label from public.projects where id = p_source_project_id;
  select format('%s (%s)', name, code) into v_dst_label from public.projects where id = p_destination_project_id;
  select name into v_actor_name from public.profiles where id = v_actor;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_status := null;
    v_message := null;
    v_user := null;

    if jsonb_typeof(v_item) = 'object' then
      begin
        v_user := (v_item ->> 'user_id')::uuid;
      exception when others then
        v_user := null;
      end;
    end if;

    if v_user is null then
      v_status := 'INVALID';
      v_message := 'Item inválido.';
    elsif v_user = any (v_seen) then
      v_status := 'INVALID';
      v_message := 'Pessoa repetida na lista.';
    else
      v_seen := v_seen || v_user;
      v_perm := upper(coalesce(v_item ->> 'permission', ''));
      v_area := nullif(btrim(coalesce(v_item ->> 'area', '')), '');
      v_explicit := coalesce(v_item ->> 'explicit_admin', 'false') = 'true';

      select * into v_src from public.project_memberships
        where project_id = p_source_project_id and user_id = v_user;
      select * into v_dst from public.project_memberships
        where project_id = p_destination_project_id and user_id = v_user;

      if v_user = v_actor then
        v_status := 'SKIPPED_SELF';
        v_message := 'Você já pertence aos dois projetos.';
      elsif v_src.user_id is null or v_src.status <> 'ACTIVE' then
        v_status := 'NOT_ACTIVE_IN_SOURCE';
        v_message := 'Não é membro ativo do projeto de origem.';
      elsif v_dst.user_id is not null then
        v_status := 'ALREADY_MEMBER';
        v_message := format('Já é membro do destino (%s, %s). Nada foi alterado.', v_dst.permission, v_dst.status);
      elsif not exists (select 1 from public.profiles where id = v_user) then
        v_status := 'PROFILE_NOT_FOUND';
        v_message := 'Perfil inexistente.';
      elsif v_perm not in ('ADMINISTRADOR', 'GERENTE', 'COLABORADOR', 'LEITURA') then
        v_status := 'INVALID';
        v_message := 'Perfil inválido.';
      elsif v_perm = 'ADMINISTRADOR' and not v_explicit then
        v_status := 'ADMIN_NOT_CONFIRMED';
        v_message := 'Administrador exige confirmação explícita.';
      elsif v_area is null then
        v_status := 'INVALID';
        v_message := 'Área obrigatória.';
      else
        begin
          perform public.add_project_member(p_destination_project_id, v_user, v_perm, v_area);
          v_status := 'ADDED';
        exception when others then
          if sqlerrm like 'Este usuário já é membro%' then
            v_status := 'ALREADY_MEMBER';
            v_message := 'Já é membro do destino. Nada foi alterado.';
          else
            v_status := 'ERROR';
            v_message := left(sqlerrm, 300);
          end if;
        end;
      end if;
    end if;

    if v_status = 'ADDED' then
      v_added := v_added + 1;
      v_added_ids := v_added_ids || case when v_added_ids = '' then '' else ',' end || v_user::text;
    elsif v_status = 'ALREADY_MEMBER' then
      v_already := v_already + 1;
    elsif v_status = 'ERROR' then
      v_errors := v_errors + 1;
    else
      v_skipped := v_skipped + 1;
    end if;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'user_id', coalesce(v_user::text, v_item ->> 'user_id'),
      'status', v_status,
      'message', v_message
    ));
  end loop;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (
    p_destination_project_id, 'USER', v_actor, 'PROJECT_TEAM_COPIED', 'PROJECT', p_destination_project_id::text,
    format(
      'Equipe copiada do projeto %s para o projeto %s por %s: %s adicionado(s), %s já vinculado(s), %s ignorado(s), %s com erro. Usuários adicionados: %s.',
      v_src_label, v_dst_label, coalesce(v_actor_name, v_actor::text),
      v_added, v_already, v_skipped, v_errors,
      case when v_added_ids = '' then '(nenhum)' else v_added_ids end
    )
  );

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (
    p_source_project_id, 'USER', v_actor, 'PROJECT_TEAM_COPY_USED_AS_SOURCE', 'PROJECT', p_source_project_id::text,
    format(
      'Equipe deste projeto usada como origem para o projeto %s por %s: %s adicionado(s) no destino.',
      v_dst_label, coalesce(v_actor_name, v_actor::text), v_added
    )
  );

  return jsonb_build_object(
    'added', v_added,
    'already_member', v_already,
    'skipped', v_skipped,
    'errors', v_errors,
    'items', v_results
  );
end;
$$;

revoke all on function public.copy_project_team(uuid, uuid, jsonb) from public;
revoke all on function public.copy_project_team(uuid, uuid, jsonb) from anon;
grant execute on function public.copy_project_team(uuid, uuid, jsonb) to authenticated;
