-- ============================================================
-- 20261120110000_risk_case_sla_consistency_guards.sql
--
-- Consistência entre caso de risco (risk_alert_cases) e ação SLA (sla_actions) — sem alterar dados existentes.
--
-- 1) Links de e-mail (confirm_email_alert_action) com token SLA_ACTION: DAR CIÊNCIA e ASSUMIR RESPONSABILIDADE
--    gravavam só na ação SLA. Quando a ação pertence a um caso de risco, o caso ficava OPEN com o responsável antigo
--    (e quem "assumiu" podia depois ser recusado pela RPC do caso). A partir daqui o registro no ledger é recusado e a
--    transação inteira é desfeita (nada muda na ação): o tratamento é feito pelos botões do caso. O e-mail de risco com
--    caso registrado deixa de emitir esses links (apps/web/lib/risk-alerts/run-risk-alert-cycle.ts); a trava cobre os
--    tokens já enviados. DEFINIR PRAZO e RESPONDER continuam: o caso lê os prazos da própria ação e RESPONDER só
--    grava o ledger.
--
-- 2) Mudança de prazo de ação SLA (assume/respond/complete_due_at) passa a ser auditada (ACTION_DEADLINE_CHANGED);
--    antes só ciência, início, conclusão, atraso e reatribuição eram registrados.
--
-- Não altera has_project_permission, RLS, prazos, níveis nem o motor de escalonamento.
-- ============================================================

create or replace function public.email_alert_action_risk_case_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case_id uuid;
begin
  if new.alert_kind <> 'SLA_ACTION' or new.action not in ('ACKNOWLEDGE', 'ASSUME_RESPONSIBILITY') then
    return new;
  end if;
  select c.id into v_case_id from public.risk_alert_cases c where c.sla_action_id = new.alert_id limit 1;
  if v_case_id is not null then
    raise exception 'RISK_CASE_LINKED: esta ação pertence ao alerta de risco %; registre o tratamento pela página do alerta (/%/alertas/%).',
      v_case_id, new.project_id, v_case_id;
  end if;
  return new;
end;
$$;

drop trigger if exists email_alert_actions_risk_case_guard on public.email_alert_actions;
create trigger email_alert_actions_risk_case_guard
before insert on public.email_alert_actions
for each row execute function public.email_alert_action_risk_case_guard();

create or replace function public.audit_sla_action_deadline_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_changes text := '';
begin
  if new.assume_due_at is distinct from old.assume_due_at then
    v_changes := v_changes || format(' assumir: %s → %s;', coalesce(old.assume_due_at::text, '—'), coalesce(new.assume_due_at::text, '—'));
  end if;
  if new.respond_due_at is distinct from old.respond_due_at then
    v_changes := v_changes || format(' responder: %s → %s;', coalesce(old.respond_due_at::text, '—'), coalesce(new.respond_due_at::text, '—'));
  end if;
  if new.complete_due_at is distinct from old.complete_due_at then
    v_changes := v_changes || format(' concluir: %s → %s;', coalesce(old.complete_due_at::text, '—'), coalesce(new.complete_due_at::text, '—'));
  end if;
  if v_changes = '' then return new; end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail, occurred_at)
  values (
    new.project_id,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    v_actor, null,
    'ACTION_DEADLINE_CHANGED', 'SLA_ACTION', new.id::text,
    format('Prazo da ação "%s" alterado:%s', new.title, v_changes),
    now()
  );
  return new;
end;
$$;

drop trigger if exists sla_actions_audit_deadline_changed on public.sla_actions;
create trigger sla_actions_audit_deadline_changed
after update of assume_due_at, respond_due_at, complete_due_at on public.sla_actions
for each row execute function public.audit_sla_action_deadline_changed();

revoke all on function public.email_alert_action_risk_case_guard() from public, anon, authenticated;
revoke all on function public.audit_sla_action_deadline_changed() from public, anon, authenticated;
