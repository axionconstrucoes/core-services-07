-- ============================================================
-- 20261121172000_l2_sla_forward_by_email_audit.sql  (LOTE 2 — auditoria das decisões por e-mail)
--
-- Lacuna encontrada na auditoria de cobertura: RESOLVIDO e EM ANDAMENTO por e-mail gravam uma entrada própria em
-- audit_log_entries (SLA_ACTION_COMPLETED_BY_EMAIL / SLA_ACTION_PROGRESS_BY_EMAIL, com a mensagem de origem), mas ENVIAR PARA
-- (sla_action_forward_by_email) só deixava ACTION_REASSIGNED (gatilho), sem referência à mensagem de e-mail. Corpo vigente
-- (20261121120000) PRESERVADO; única adição: a entrada SLA_ACTION_FORWARDED_BY_EMAIL (mensagem, destino e motivo).
-- Idempotência (receipt por mensagem), autorização e privilégios inalterados.
-- ============================================================

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

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_action.project_id, 'USER', p_actor_user_id, null, 'SLA_ACTION_FORWARDED_BY_EMAIL', 'SLA_ACTION', v_action.id::text,
    format('Encaminhada por resposta de e-mail (mensagem %s) ao usuário %s. Motivo: %s.',
      p_provider_message_id, p_new_responsible_user_id, left(coalesce(nullif(btrim(p_reason), ''), '-'), 1500))
  );
  return v_action;
end;
$$;

revoke all on function public.sla_action_forward_by_email(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sla_action_forward_by_email(uuid, uuid, uuid, text, text) to service_role;
