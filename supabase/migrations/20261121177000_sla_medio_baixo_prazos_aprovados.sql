-- NÃO APLICAR em produção sem autorização explícita do responsável pelo projeto.
--
-- FRENTE A — prazos DEFINITIVOS aprovados do SLA (prazo para ASSUMIR):
--   CRÍTICO 1 hora corrida | ALTO 4 horas úteis | MÉDIO 2 dias úteis | BAIXO 5 dias úteis.
-- CRÍTICO e ALTO já conferem. Esta migration corrige só MÉDIO (1 -> 2 dias úteis) e BAIXO (3 -> 5 dias úteis).
--
-- O QUE FAZ
--   1. Regras ATIVAS de sla_matrix_rules para LOW/MEDIUM em BUSINESS_DAYS cujo assume_deadline_value ainda é o valor
--      antigo (MEDIUM=1, LOW=3): troca somente assume_deadline_value pelo aprovado (2 / 5).
--        - area NULL (regra geral): a regra antiga é DESATIVADA (histórico preservado) e uma NOVA regra ativa é criada, copiando
--          todos os demais campos (escalonamento Nível 2/Diretoria, respond/complete, notificações, confirmações, updated_by).
--        - area preenchida: unique (project_id, risk_level, area) impede duas linhas; atualiza no lugar.
--      Regras com outro valor (personalização da obra) ou outra unidade NÃO são tocadas (aviso).
--   2. Falha CLARAMENTE (SLA_MATRIX_DUPLICATE_ACTIVE) se houver mais de uma regra ativa por (obra, risco, área) em LOW/MEDIUM,
--      antes e depois; ao final, cada chave tocada tem exatamente UMA regra ativa.
--   3. Atualiza o padrão institucional de sla_ssma_assume_due_at (usado quando a obra não tem regra): BAIXO 5, MÉDIO 2.
--      Mesmo corpo da definição de 20261106100000 (security definer, search_path vazio) exceto os dois valores.
--
-- O QUE NÃO FAZ
--   - NÃO recalcula nem altera NENHUMA sla_actions / sla_action_escalations (prazos são gravados na criação; nenhum gatilho de
--     sla_matrix_rules toca sla_actions). Vale apenas para NOVAS ações.
--   - NÃO altera CRÍTICO/ALTO, escalonamento, horário comercial, feriados, responsáveis, permissões, nem record_risk_alert_action.
--   - NÃO apaga linhas. NÃO cria regra para obra que usa o padrão do código (essas já pegam o novo padrão).
--   - Sem GRANT/EXECUTE para anon.
-- Auditoria: os gatilhos existentes de sla_matrix_rules (INSERT/UPDATE) gravam SLA_CONFIGURATION_UPDATED em audit_log_entries como
-- actor_type SYSTEM (sem auth.uid()), sem texto livre sensível.
-- Idempotente: após a primeira execução nenhuma regra ativa tem o valor antigo; reexecutar não altera nada.

do $$
declare
  r record;
  v_new numeric;
  v_old numeric;
  v_new_id uuid;
  v_changed integer := 0;
begin
  lock table public.sla_matrix_rules in share row exclusive mode;

  if exists (
    select 1 from public.sla_matrix_rules
     where active and risk_level in ('LOW', 'MEDIUM')
     group by project_id, risk_level, area
    having count(*) > 1
  ) then
    raise exception 'SLA_MATRIX_DUPLICATE_ACTIVE: mais de uma regra ativa para a mesma obra/risco/área em LOW/MEDIUM; desative a duplicata (nunca apague) e reaplique.';
  end if;

  for r in
    select * from public.sla_matrix_rules
     where active and risk_level in ('LOW', 'MEDIUM')
     order by project_id, risk_level, area nulls first
  loop
    v_old := case r.risk_level when 'MEDIUM' then 1 else 3 end;
    v_new := case r.risk_level when 'MEDIUM' then 2 else 5 end;

    if r.time_unit = 'BUSINESS_DAYS' and r.assume_deadline_value = v_new then
      continue; -- já aprovado (idempotência)
    end if;
    if r.time_unit <> 'BUSINESS_DAYS' or r.assume_deadline_value <> v_old then
      raise notice 'sla_matrix_rules %: regra personalizada (unidade %, assumir %) preservada; revisar manualmente.', r.id, r.time_unit, r.assume_deadline_value;
      continue;
    end if;

    if r.area is null then
      update public.sla_matrix_rules set active = false where id = r.id;
      insert into public.sla_matrix_rules (
        project_id, risk_level, area, time_unit, assume_deadline_value, respond_deadline_value, complete_deadline_value,
        escalation_2_after_value, board_after_value, notify_by_email, requires_acknowledgment_confirmation,
        requires_delay_justification, is_default, active, updated_by_user_id
      ) values (
        r.project_id, r.risk_level, r.area, r.time_unit, v_new, r.respond_deadline_value, r.complete_deadline_value,
        r.escalation_2_after_value, r.board_after_value, r.notify_by_email, r.requires_acknowledgment_confirmation,
        r.requires_delay_justification, r.is_default, true, r.updated_by_user_id
      ) returning id into v_new_id;
    else
      update public.sla_matrix_rules set assume_deadline_value = v_new where id = r.id;
    end if;
    v_changed := v_changed + 1;

    if (select count(*) from public.sla_matrix_rules x
         where x.active and x.project_id = r.project_id and x.risk_level = r.risk_level and x.area is not distinct from r.area) <> 1 then
      raise exception 'SLA_MATRIX_ACTIVE_COUNT: obra/risco/área deve ficar com exatamente uma regra ativa';
    end if;
  end loop;

  raise notice 'sla_matrix_rules: % regra(s) MÉDIO/BAIXO atualizada(s) para os prazos aprovados.', v_changed;
end
$$;

create or replace function public.sla_ssma_assume_due_at(p_project_id uuid, p_risk text, p_start timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_unit text;
  v_value numeric;
  v_tz text;
  v_start_hour integer;
  v_end_hour integer;
begin
  select r.time_unit, r.assume_deadline_value into v_unit, v_value
    from public.sla_matrix_rules r
   where r.project_id = p_project_id and r.active and r.risk_level = p_risk and (r.area = 'ESG_SSMA' or r.area is null)
   order by (r.area is not null) desc, r.created_at
   limit 1;
  if v_unit is null then
    select d.u, d.v into v_unit, v_value
      from (values ('LOW', 'BUSINESS_DAYS', 5::numeric), ('MEDIUM', 'BUSINESS_DAYS', 2::numeric),
                   ('HIGH', 'BUSINESS_HOURS', 4::numeric), ('CRITICAL', 'CLOCK_HOURS', 1::numeric)) as d(k, u, v)
     where d.k = p_risk;
  end if;
  if v_unit is null then raise exception 'SLA_RISK_INVALID: %', p_risk; end if;
  select s.timezone, s.business_day_start_hour, s.business_day_end_hour into v_tz, v_start_hour, v_end_hour
    from public.sla_project_settings s where s.project_id = p_project_id;
  return public.sla_add_time_units(p_start, v_value, v_unit,
                                   coalesce(v_tz, 'America/Sao_Paulo'), coalesce(v_start_hour, 8), coalesce(v_end_hour, 18));
end;
$$;

revoke all on function public.sla_ssma_assume_due_at(uuid, text, timestamptz) from public, anon, authenticated;
