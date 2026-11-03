-- ============================================================
-- 20261101100000_restrict_anon_execute_remaining_security_definer.sql
--
-- Continuação de 20261030150000. Ensaio sobre o esquema real de produção (privilégios padrão do Supabase) mostrou que, depois daquela
-- migration, 25 funções SECURITY DEFINER não-trigger do schema public continuavam executáveis por `anon` (herança dos privilégios padrão).
-- Investigação (corpos, chamadores, políticas, comportamento sem sessão e com sessão):
--   - 21 são RPCs do app ou do servidor sem nenhum papel para o visitante anônimo (todas recusam auth.uid() nulo no corpo): esta migration
--     revoga EXECUTE de PUBLIC e anon. authenticated e service_role mantêm exatamente o acesso efetivo que tinham (conferido antes/depois).
--   - 4 são EXCEÇÕES EXPLÍCITAS e permanecem executáveis por anon — helpers de RLS, avaliados pelo Postgres como o papel da consulta
--     em ~80 políticas declaradas "TO public" (que valem também para anon):
--       has_project_permission(uuid,text), is_project_member(uuid), is_shared_project_admin(uuid), is_any_project_admin()
--     Todas devolvem apenas boolean, dependem de auth.uid() (nulo para anon => false) e não leem nem gravam nada além da checagem.
--     Revogar o EXECUTE de anon não fecharia nenhum acesso (anon já recebe zero linhas) e faria toda consulta anônima a essas tabelas
--     falhar com "permission denied for function" em vez de devolver vazio (já é assim hoje em `documents`, por is_active_project_administrator,
--     revogada de anon antes; não ampliar esse efeito sem necessidade: uma sessão expirada que cai no papel anon passaria de "vazio" a erro). Trocar as ~80 políticas para "TO authenticated" é uma
--     mudança maior, fora desta etapa. A auditoria (run-security-definer-search-path-audit) lista estas 4 como únicas exceções.
-- Nenhuma migration antiga é alterada.
-- ============================================================

begin;

do $$
declare
  v_signatures text[] := array[
    'public.add_project_member(uuid,uuid,text,text)',
    'public.approve_policy_acknowledgement(uuid,inet,text)',
    'public.can_upload_ssma_photo_object(text)',
    'public.create_precontract_workspace(text,text)',
    'public.create_ssma_accident_submission(uuid,timestamptz,jsonb,jsonb)',
    'public.create_ssma_form_submission(uuid,text,integer,text,text,timestamptz,jsonb,jsonb,text)',
    'public.delete_project_document(uuid)',
    'public.ensure_current_policy_acknowledgement(uuid,uuid)',
    'public.finalize_ssma_form_submission(uuid)',
    'public.find_profile_by_email(uuid,text)',
    'public.get_policy_acknowledgement_send_context(uuid,uuid)',
    'public.mark_policy_acknowledgement_viewed(uuid)',
    'public.register_policy_acknowledgement_email_sent(uuid,uuid,text,text,text,text,timestamptz)',
    'public.register_ssma_submission_photo(uuid,uuid,text,text,text,text,bigint,text)',
    'public.remove_project_member(uuid,uuid)',
    'public.set_profile_job_title(uuid,uuid,text)',
    'public.set_project_member_status(uuid,uuid,text)',
    'public.submit_construmanager_budget_response(uuid,uuid,text)',
    'public.submit_construmanager_version_impact_review(uuid,uuid,text,text,text,boolean,uuid)',
    'public.submit_weekly_alert_digest(uuid,jsonb)',
    'public.update_project_member_role(uuid,uuid,text)'
  ];
  v_exceptions text[] := array[
    'public.has_project_permission(uuid,text)',
    'public.is_project_member(uuid)',
    'public.is_shared_project_admin(uuid)',
    'public.is_any_project_admin()'
  ];
  v_sig text;
  v_proc regprocedure;
  v_auth_before boolean;
  v_svc_before boolean;
  v_extra text;
begin
  foreach v_sig in array v_signatures loop
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then raise exception 'assinatura esperada inexistente: %', v_sig; end if;
    if not (select p.prosecdef from pg_proc p where p.oid = v_proc) then
      raise exception 'esperada SECURITY DEFINER: %', v_sig;
    end if;

    v_auth_before := has_function_privilege('authenticated', v_proc, 'execute');
    v_svc_before := has_function_privilege('service_role', v_proc, 'execute');

    -- Se authenticated/service_role só alcançavam a função por PUBLIC ou herança, fixa o grant explícito antes de revogar.
    if v_auth_before then execute format('grant execute on function %s to authenticated', v_proc); end if;
    if v_svc_before then execute format('grant execute on function %s to service_role', v_proc); end if;
    execute format('revoke execute on function %s from public, anon', v_proc);

    if has_function_privilege('anon', v_proc, 'execute') then raise exception 'anon ainda executa: %', v_sig; end if;
    if has_function_privilege('authenticated', v_proc, 'execute') is distinct from v_auth_before
       or has_function_privilege('service_role', v_proc, 'execute') is distinct from v_svc_before then
      raise exception 'acesso de authenticated/service_role mudou: %', v_sig;
    end if;
  end loop;

  -- As exceções documentadas precisam continuar existindo e executáveis (helpers de RLS das políticas "TO public").
  foreach v_sig in array v_exceptions loop
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then raise exception 'exceção esperada inexistente: %', v_sig; end if;
    if not has_function_privilege('anon', v_proc, 'execute') then raise exception 'exceção deveria continuar executável por anon: %', v_sig; end if;
  end loop;

  -- Rede de segurança: depois desta migration, nenhuma outra SECURITY DEFINER não-trigger pode estar executável por anon.
  select string_agg(p.oid::regprocedure::text, ', ') into v_extra
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'execute')
     and p.oid <> all (select to_regprocedure(e)::oid from unnest(v_exceptions) e);
  if v_extra is not null then
    raise exception 'ainda executáveis por anon fora das exceções documentadas: %', v_extra;
  end if;
end
$$;

commit;
