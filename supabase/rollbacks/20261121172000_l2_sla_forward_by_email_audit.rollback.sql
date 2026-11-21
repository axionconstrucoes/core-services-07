-- ROLLBACK (manual, NAO e migration) de 20261121172000_l2_sla_forward_by_email_audit.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
-- restaura sla_action_forward_by_email(uuid, uuid, uuid, text, text) com o corpo de 20261121120000_email_replies_sla_digest_contract_by_email
create or replace function public.sla_action_forward_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text,
  p_provider_message_id text
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  perform public.email_reply_assert_new_message(p_provider_message_id);
  v_action := public.sla_action_email_precheck(p_actor_user_id, p_action_id);
  perform public.email_reply_claim_receipt(p_provider_message_id, v_action.project_id, 'SLA_ACTION', p_action_id::text, p_actor_user_id, 'ENVIAR_PARA');
  perform set_config('acc.email_actor', p_actor_user_id::text, true);
  v_action := public.sla_action_forward_core(p_actor_user_id, p_action_id, p_new_responsible_user_id, p_reason);
  perform set_config('acc.email_actor', '', true);
  return v_action;
end;
$$;
revoke all on function public.sla_action_forward_by_email(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sla_action_forward_by_email(uuid, uuid, uuid, text, text) to service_role;
commit;
