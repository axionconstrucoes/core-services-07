-- ============================================================
-- 20261120152000_risk_sla_consistency_report_and_email_guards.sql
--
-- 1) Divergências caso de risco × ação SLA deixam de ser silenciosas: a view risk_sla_consistency_issues (security
--    invoker — cada usuário só vê o que a RLS das tabelas já lhe permite) lista, por caso:
--      CASE_RESOLVED_SLA_OPEN ...... caso resolvido e ação SLA ainda aberta
--      SLA_CLOSED_CASE_OPEN ........ ação SLA concluída/cancelada e caso ainda aberto
--      RESPONSIBLE_DIVERGENT ....... responsável do caso ≠ responsável formal (ação SLA)
--      LEVEL_DIVERGENT ............. nível do caso ≠ nível de escalonamento da ação SLA
--    Nada é corrigido automaticamente: a responsabilidade formal continua sendo a da ação SLA (regra vigente) e a
--    sincronização automática do responsável depende de decisão de negócio (ver relatório).
--
-- 2) Links de e-mail (confirm_email_alert_action) — trava no ledger ampliada (mesma função de 20261120110000):
--      - ação SLA concluída ou cancelada: nenhuma ação altera mais nada (antes DAR CIÊNCIA/ASSUMIR/DEFINIR PRAZO
--        ainda gravavam);
--      - perfil LEITURA não muda estado nem prazo (DAR CIÊNCIA / ASSUMIR / DEFINIR PRAZO), coerente com a regra
--        corporativa de somente leitura; RESPONDER continua (só registra texto no ledger);
--      - DAR CIÊNCIA / ASSUMIR em ação de alerta de risco seguem recusados (20261120110000).
--    Nenhum privilégio novo é concedido.
-- ============================================================

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

revoke all on public.risk_sla_consistency_issues from public, anon;
grant select on public.risk_sla_consistency_issues to authenticated, service_role;

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
