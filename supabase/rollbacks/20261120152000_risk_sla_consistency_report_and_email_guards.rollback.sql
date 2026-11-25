-- ROLLBACK (manual, NAO e migration) de 20261120152000_risk_sla_consistency_report_and_email_guards.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop view if exists public.risk_sla_consistency_issues;
-- restaura email_alert_action_risk_case_guard() com o corpo de 20261120110000_risk_case_sla_consistency_guards
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
revoke all on function public.email_alert_action_risk_case_guard() from public, anon, authenticated;
commit;
