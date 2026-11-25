-- ROLLBACK (manual, NAO e migration) de 20261121101000_null_safe_authorization_residual.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
-- restaura email_alert_action_risk_case_guard() com o corpo de 20261120152000_risk_sla_consistency_report_and_email_guards
create or replace function public.email_alert_action_risk_case_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
  v_status text;
  v_permission text;
begin
  if new.alert_kind <> 'SLA_ACTION' then
    return new;
  end if;

  if new.action in ('ACKNOWLEDGE', 'ASSUME_RESPONSIBILITY', 'SET_DEADLINE') then
    select a.status into v_status from public.sla_actions a where a.id = new.alert_id;
    if v_status in ('COMPLETED', 'CANCELLED') then
      raise exception 'ACTION_CLOSED: esta ação já foi concluída ou cancelada; nada foi alterado.';
    end if;
    select pm.permission into v_permission
    from public.project_memberships pm
    where pm.project_id = new.project_id and pm.user_id = new.actor_user_id and pm.status = 'ACTIVE';
    if v_permission in ('LEITURA', 'VIEWER') then
      raise exception 'READ_ONLY_PROFILE: perfil somente leitura não altera a ação; use RESPONDER para registrar um comentário.';
    end if;
  end if;

  if new.action in ('ACKNOWLEDGE', 'ASSUME_RESPONSIBILITY') then
    select c.id into v_case_id from public.risk_alert_cases c where c.sla_action_id = new.alert_id limit 1;
    if v_case_id is not null then
      raise exception 'RISK_CASE_LINKED: esta ação pertence ao alerta de risco %; registre o tratamento pela página do alerta (/%/alertas/%).',
        v_case_id, new.project_id, v_case_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.email_alert_action_risk_case_guard() from public, anon, authenticated;
-- restaura finalize_ssma_form_submission(uuid) com o corpo de 20260909143000_ssma_submission_persistence
create or replace function public.finalize_ssma_form_submission(p_submission_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_submission public.ssma_form_submissions%rowtype;
begin
  select * into v_submission from public.ssma_form_submissions where id = p_submission_id for update;
  if v_submission.id is null then raise exception 'SUBMISSION_NOT_FOUND'; end if;
  if v_submission.technician_user_id <> auth.uid() then raise exception 'SUBMISSION_ACCESS_DENIED'; end if;
  if v_submission.status = 'SUBMITTED' then return v_submission.id; end if;

  update public.ssma_form_submissions
  set status = 'SUBMITTED', submitted_at = now()
  where id = p_submission_id;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label,
    action, entity_type, entity_id, detail
  ) values (
    v_submission.project_id, 'USER', auth.uid(), null,
    'SSMA_FORM_SUBMITTED', 'SSMA_FORM_SUBMISSION', v_submission.id::text,
    format('Formulário SSMA "%s" enviado com %s foto(s).', v_submission.checklist_title,
      (select count(*) from public.ssma_submission_photos where submission_id = v_submission.id))
  );
  return v_submission.id;
end;
$$;
revoke all on function public.finalize_ssma_form_submission(uuid) from public;
grant execute on function public.finalize_ssma_form_submission(uuid) to authenticated;
-- record_risk_alert_action: NO-OP deliberado (o rollback de nenhuma migration pode rebaixar o P0 / md5 930f6d75898793479b418950b0053bd9).
commit;
