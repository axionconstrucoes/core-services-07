-- LOTE 5 / Planejamento — alertas semanais que acumulam uma ação SLA por semana.
--
-- Diagnóstico: quando a evidência da semana chega (ou a origem deixa de indicar o risco), o ciclo marca o caso
-- como status = 'CLOSED' (state continua OPEN: ninguém "tratou"), mas a ação SLA vinculada NÃO é encerrada.
-- A view risk_sla_consistency_issues só cobria state = 'RESOLVED' (resolução humana), então esse acúmulo
-- (1 ação SLA aberta por semana já encerrada) era invisível no relatório de divergências e no Dashboard.
--
-- Esta migration só AMPLIA O RELATÓRIO: novo issue_code CASE_CLOSED_BY_SOURCE_SLA_OPEN (caso encerrado pela
-- origem + ação SLA aberta). Nada é corrigido automaticamente, nenhum prazo/nível/permissão/dado muda: encerrar
-- a ação SLA do caso encerrado pela origem é decisão de negócio (ver relatório do lote 5). Mantém security
-- invoker e os mesmos grants; as 4 regras anteriores ficam idênticas. Idempotente (create or replace).

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
where c.state <> 'RESOLVED' and c.current_level is distinct from a.current_escalation_level
union all
select c.id, c.project_id, c.sla_action_id, 'CASE_CLOSED_BY_SOURCE_SLA_OPEN',
       format('Caso encerrado pela origem em %s (estado %s), ação SLA ainda com status %s.', c.closed_at, c.state, a.status)
from public.risk_alert_cases c
join public.sla_actions a on a.id = c.sla_action_id
where c.status = 'CLOSED' and c.state <> 'RESOLVED' and a.status not in ('COMPLETED', 'CANCELLED');

revoke all on public.risk_sla_consistency_issues from public, anon;
grant select on public.risk_sla_consistency_issues to authenticated, service_role;
