-- ============================================================
-- 20261030150000_restrict_anon_execute_authenticated_only_functions.sql
--
-- Auditoria de privilégios (banco descartável, todas as migrations aplicadas): 22 funções SECURITY DEFINER não-trigger do schema
-- public eram executáveis pelo papel `anon` (herança dos privilégios padrão do schema; as migrations originais revogaram só de PUBLIC).
--   - 17 são chamadas apenas por usuários autenticados (RPCs do app; todas dependem de auth.uid());
--   - 5 (alert_followup_claim_due/mark_sent/mark_failed/open/release) são exclusivas do servidor (service_role).
-- Nenhuma delas deve ser alcançável sem sessão. Esta migration revoga EXECUTE de PUBLIC e anon e NADA mais: authenticated e
-- service_role mantêm exatamente o acesso efetivo que tinham (conferido antes/depois; a migration falha e desfaz se mudar).
-- Funções de gatilho, helpers de RLS e demais funções não são tocadas (ver relatório: avaliar à parte).
-- ============================================================

begin;

do $$
declare
  v_signatures text[] := array[
    'public.alert_followup_apply_action(uuid,text,uuid,text,uuid)',
    'public.alert_followup_claim_due(integer,timestamptz)',
    'public.alert_followup_mark_failed(uuid,uuid,text,timestamptz)',
    'public.alert_followup_mark_sent(uuid,uuid,timestamptz,timestamptz)',
    'public.alert_followup_open(uuid,text,uuid,text,uuid,timestamptz)',
    'public.alert_followup_release(uuid,uuid)',
    'public.can_upload_ssma_field_photo_object(text)',
    'public.create_project_workspace(text,text,text,text,date,date)',
    'public.decide_email_access_authorization(uuid,text,text)',
    'public.delivery_item_add_custom(uuid,text,text)',
    'public.delivery_item_change_status(uuid,text,text,text)',
    'public.delivery_item_respond(uuid,text,uuid,text,text)',
    'public.delivery_item_update_fields(uuid,jsonb)',
    'public.delivery_items_seed_checklist(uuid)',
    'public.request_email_access_authorization(uuid,uuid,text,text,jsonb)',
    'public.review_risk_classification(text,uuid,text,text,text,jsonb)',
    'public.revoke_email_access_authorization(uuid,text)',
    'public.save_contract_alert_batch_item_response(uuid,uuid,text,uuid)',
    'public.ssma_corrective_action_update(uuid,text,text,uuid)',
    'public.ssma_field_record_register_photo(uuid,uuid,uuid,text,text,text,text,bigint,text)',
    'public.ssma_field_record_submit(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,uuid,date)',
    'public.submit_contract_alert_batch_response(uuid,jsonb)'
  ];
  v_sig text;
  v_proc regprocedure;
  v_auth_before boolean;
  v_svc_before boolean;
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
end
$$;

commit;
