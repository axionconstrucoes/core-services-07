-- NÃO APLICAR em produção sem autorização explícita do responsável pelo projeto.
--
-- Fase 6 / Frente H2c — QUALIDADE como ÁREA própria de alertas/SLA (antes o pilar QUALIDADE respondia pela ENGENHARIA).
--
-- O QUE FAZ
--   1. Amplia os CHECK de área para aceitar 'QUALIDADE' em: sla_area_responsibles.area, sla_matrix_rules.area,
--      sla_actions.area e risk_alert_cases.area. Localiza cada constraint pela DEFINIÇÃO (independe do nome automático) e só troca
--      se faltar QUALIDADE (idempotente). Só AMPLIA o conjunto aceito: nenhuma linha existente é alterada ou invalidada.
--   2. Semeia regras de matriz ESPECÍFICAS da área QUALIDADE, por obra e por criticidade, SOMENTE onde a obra já tem regra geral
--      ativa (area null) e ainda não tem regra QUALIDADE. Valores = SLAs aprovados (prazo para ASSUMIR):
--        CRÍTICO 1 h corrida | ALTO 4 h úteis | MÉDIO 2 d.u. | BAIXO 5 d.u.
--      Escalonamento (Nível 2/Diretoria), respond/complete, notificações e confirmações são COPIADOS da regra geral da obra.
--      NUNCA enfraquece riscos graves: em CRÍTICO/ALTO, se a regra geral da obra usa a MESMA unidade e prazo MENOR, mantém o menor.
--   3. Prospectiva: NÃO toca sla_actions / sla_action_escalations (prazos são gravados na criação da ação); as ações abertas
--      (inclusive as 9 abertas na data da decisão) mantêm seus prazos. Vale apenas para NOVAS ações da área QUALIDADE.
--
-- O QUE NÃO FAZ
--   - NÃO redefine função alguma (record_risk_alert_action / proteção P0 md5 930f6d75... intactas). NÃO apaga linhas.
--   - NÃO cria sla_area_responsibles de QUALIDADE (depende de pessoas; a obra configura na Matriz; sem responsável o motor já
--     sinaliza "sem responsável" em vez de inventar um).
--   - NÃO altera as RPCs de escalonamento de rejeição de findings (20260904*): continuam aceitando só as 9 áreas anteriores
--     (a rejeição de recomendação relevante não oferece QUALIDADE; ver docs/experts-qualidade-sinais-provedor.md).
-- Auditoria: gatilhos existentes de sla_matrix_rules gravam SLA_CONFIGURATION_UPDATED (actor SYSTEM, sem auth.uid()).
-- Idempotente: reexecutar não altera nada (constraints já ampliadas; regras QUALIDADE já existentes são preservadas).
-- Rollback: supabase/rollbacks/20261210100000_quality_alert_area_sla.rollback.sql.

do $$
declare
  t text;
  v_name text;
  v_def text;
begin
  foreach t in array array['sla_area_responsibles', 'sla_matrix_rules', 'sla_actions', 'risk_alert_cases'] loop
    v_name := null;
    select c.conname, pg_get_constraintdef(c.oid)
      into v_name, v_def
      from pg_constraint c
     where c.conrelid = format('public.%I', t)::regclass
       and c.contype = 'c'
       and pg_get_constraintdef(c.oid) like '%''ESG_SSMA''%'
       and pg_get_constraintdef(c.oid) like '%area%'
       and pg_get_constraintdef(c.oid) not like '%secondary%'
     limit 1;

    if v_name is null then
      raise exception 'QUALITY_AREA_CHECK_NOT_FOUND: CHECK de área não localizado em public.%', t;
    end if;
    if v_def like '%''QUALIDADE''%' then
      continue; -- já ampliado
    end if;
    execute format('alter table public.%I drop constraint %I', t, v_name);
    execute format(
      'alter table public.%I add constraint %I %s',
      t, v_name, replace(v_def, '''ESG_SSMA''::text', '''ESG_SSMA''::text, ''QUALIDADE''::text')
    );
  end loop;
end
$$;

do $$
declare
  r record;
  v_unit text;
  v_value numeric;
  v_inserted integer := 0;
begin
  lock table public.sla_matrix_rules in share row exclusive mode;

  for r in
    select g.*
      from public.sla_matrix_rules g
     where g.active
       and g.area is null
       and not exists (
         select 1 from public.sla_matrix_rules q
          where q.project_id = g.project_id and q.risk_level = g.risk_level and q.area = 'QUALIDADE'
       )
     order by g.project_id, g.risk_level, g.created_at
  loop
    -- uma regra geral ativa por obra/risco (a unicidade ativa é garantida por 20261118140000); defensivo contra duplicata
    if exists (
      select 1 from public.sla_matrix_rules q
       where q.project_id = r.project_id and q.risk_level = r.risk_level and q.area = 'QUALIDADE'
    ) then
      continue;
    end if;

    select a.u, a.v into v_unit, v_value
      from (values ('LOW', 'BUSINESS_DAYS', 5::numeric), ('MEDIUM', 'BUSINESS_DAYS', 2::numeric),
                   ('HIGH', 'BUSINESS_HOURS', 4::numeric), ('CRITICAL', 'CLOCK_HOURS', 1::numeric)) as a(k, u, v)
     where a.k = r.risk_level;

    -- nunca enfraquece riscos graves: mesma unidade e prazo menor na regra geral da obra => mantém o menor
    if r.risk_level in ('HIGH', 'CRITICAL') and r.time_unit = v_unit and r.assume_deadline_value < v_value then
      v_value := r.assume_deadline_value;
    end if;

    insert into public.sla_matrix_rules (
      project_id, risk_level, area, time_unit, assume_deadline_value, respond_deadline_value, complete_deadline_value,
      escalation_2_after_value, board_after_value, notify_by_email, requires_acknowledgment_confirmation,
      requires_delay_justification, is_default, active, updated_by_user_id
    ) values (
      r.project_id, r.risk_level, 'QUALIDADE', v_unit, v_value, r.respond_deadline_value, r.complete_deadline_value,
      r.escalation_2_after_value, r.board_after_value, r.notify_by_email,
      r.requires_acknowledgment_confirmation or r.risk_level in ('HIGH', 'CRITICAL'),
      r.requires_delay_justification, false, true, r.updated_by_user_id
    );
    v_inserted := v_inserted + 1;
  end loop;

  raise notice 'sla_matrix_rules: % regra(s) QUALIDADE semeada(s) (prospectivo; sla_actions intactas).', v_inserted;
end
$$;
