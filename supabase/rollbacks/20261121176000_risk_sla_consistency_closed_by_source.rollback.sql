-- ROLLBACK (manual, NAO e migration) de 20261121176000_risk_sla_consistency_closed_by_source.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
-- restaura a view de 20261120152000_risk_sla_consistency_report_and_email_guards
create or replace view public.risk_sla_consistency_issues
with (security_invoker = true)
as
select c.id as case_id, c.project_id, c.sla_action_id, 'CASE_RESOLVED_SLA_OPEN'::text as issue_code,
       format('Caso resolvido em %s, ação SLA com status %s.', c.resolved_at, a.status) as detail
from public.risk_alert_cases c
join public.sla_actions a on a.id = c.sla_action_id
where c.state = 'RESOLVED' and a.status not in ('COMPLETED', 'CANCELLED')
union all
select c.id, c.project_id, c.sla_action_id, 'SLA_CLOSED_CASE_OPEN',
       format('Ação SLA %s, caso no estado %s.', a.status, c.state)
from public.risk_alert_cases c
join public.sla_actions a on a.id = c.sla_action_id
where a.status in ('COMPLETED', 'CANCELLED') and c.state <> 'RESOLVED' and c.status <> 'CLOSED'
union all
select c.id, c.project_id, c.sla_action_id, 'RESPONSIBLE_DIVERGENT',
       format('Responsável do caso %s; responsável formal da ação SLA %s.', coalesce(c.current_responsible_user_id::text, '—'), coalesce(a.responsible_user_id::text, '—'))
from public.risk_alert_cases c
join public.sla_actions a on a.id = c.sla_action_id
where c.state <> 'RESOLVED' and c.current_responsible_user_id is distinct from a.responsible_user_id
union all
select c.id, c.project_id, c.sla_action_id, 'LEVEL_DIVERGENT',
       format('Nível do caso %s; nível de escalonamento da ação SLA %s.', c.current_level, a.current_escalation_level)
from public.risk_alert_cases c
join public.sla_actions a on a.id = c.sla_action_id
where c.state <> 'RESOLVED' and c.current_level is distinct from a.current_escalation_level;
commit;
