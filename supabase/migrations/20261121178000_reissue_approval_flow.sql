-- ============================================================
-- 20261121178000_reissue_approval_flow.sql
--
-- FRENTE D — fluxo administrativo AUDITÁVEL de aprovação de reemissão dos alertas de risco.
--
-- Contexto: o ciclo (apps/web/lib/risk-alerts: communication-ledger.ts / plan-risk-alerts.ts) só reemite uma
-- lacuna de comunicação quando existe uma linha em audit_log_entries com
--   action = 'RISK_ALERT_REISSUE_APPROVED', entity_type = 'RISK_ALERT_CASE', entity_id = '<id do caso>',
--   actor_type = 'USER' e actor_user_id preenchido (vale a mais recente por caso).
-- Antes desta migration nenhuma tela/ação/RPC gravava essa linha.
--
-- O que esta migration cria (somente leitura de dados do ciclo + UMA gravação de auditoria):
--   risk_alert_reissue_pending(p_project_id)                       — lista de elegibilidade (ADMINISTRADOR)
--   risk_alert_reissue_approve(p_project_id, p_case_ids, p_justification) — grava a decisão, por caso (ADMINISTRADOR)
--   risk_alert_reissue_evaluate(...)                               — núcleo compartilhado (SEM grant a nenhum papel)
--
-- APROVAR APENAS REGISTRA A DECISÃO: nenhuma função escreve em risk_alert_outbox, chama provedor de e-mail ou altera
-- caso/ação SLA/responsável. O envio continua sendo feito pelo ciclo, sob as travas do piloto (prontidão, allowlist,
-- projeto confirmado, ...) E sob o interruptor ACC_RISK_ALERT_REISSUE_SEND_ENABLED (desligado por padrão; ver
-- apps/web/lib/risk-alerts/reissue-send-gate.ts).
--
-- Regras de elegibilidade (primeiro motivo que se aplica):
--   CASE_NOT_FOUND                  caso inexistente ou de OUTRO projeto (sem vazar existência)
--   CASE_NOT_OPEN                   status <> 'OPEN'
--   RISK_LEVEL_NOT_ELIGIBLE         risco diferente de CRITICAL/HIGH
--   NO_SLA_ACTION                   sem ação SLA vinculada (sem etapa alcançada)
--   MANUALLY_SUSPENDED              suspensão manual de comunicação vigente (RISK_ALERT_CASE_COMMUNICATION_SUSPENDED,
--                                   registro humano mais recente) — nunca aprovado, mesmo a pedido
--   ALREADY_APPROVED_AWAITING_SEND  decisão vigente ainda sem reemissão (idempotência: não gera nova linha)
--   ALREADY_REISSUED                decisão vigente já consumida (reemissão PENDING/SENT/FAILED na outbox) na mesma etapa
--   NO_COMMUNICATION_GAP            nenhum destinatário exigido pela etapa alcançada sem aceite no próprio endereço
-- Uma decisão consumida volta a ser elegível apenas se (a) a reemissão só gerou linhas SUPPRESSED/SKIPPED (nada saiu e a
-- chave idempotente fica queimada) ou (b) o caso subiu de etapa depois da decisão (a decisão registra "stage").
--
-- Aproximação da lacuna em SQL (o ciclo continua sendo a autoridade e reavalia com a Matriz/overrides do piloto):
-- destinatários exigidos = responsável da ação SLA (ou responsável direto da área), Nível 2 (escalation_1) se a etapa >= 1,
-- Diretoria (board) se a etapa >= 2; "informado" = linha SENT na outbox com recipient_email igual ao e-mail do perfil.
--
-- Idempotente (create or replace). Nada é apagado. Migrations anteriores não são alteradas (incl. o hotfix P0).
-- ============================================================

-- ---------- Núcleo de avaliação (somente leitura; sem grant) ----------
create or replace function public.risk_alert_reissue_evaluate(
  p_project_id uuid,
  p_case_ids uuid[]
)
returns table (
  case_id uuid,
  visible_code text,
  area text,
  risk_level text,
  title text,
  reference text,
  age_days integer,
  stage text,
  gap_roles text[],
  manually_suspended boolean,
  approval_state text,
  last_approval_id uuid,
  last_approved_at timestamptz,
  eligible boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
  v_sla record;
  v_ar record;
  v_rank integer;
  v_appr record;
  v_appr_stage text;
  v_appr_rank integer;
  v_susp boolean;
  v_gaps text[];
  v_state text;
  v_eligible boolean;
  v_reason text;
  v_consumed boolean;
  v_delivered boolean;
begin
  for c in
    select rc.*
    from public.risk_alert_cases rc
    where rc.project_id = p_project_id
      and (
        (p_case_ids is null and rc.status = 'OPEN' and rc.risk_level in ('CRITICAL', 'HIGH'))
        or (p_case_ids is not null and rc.id = any(p_case_ids))
      )
    order by (rc.risk_level = 'CRITICAL') desc, rc.first_seen_at asc, rc.id
  loop
    v_sla := null;
    v_ar := null;
    v_gaps := '{}';
    v_state := 'NONE';
    v_susp := false;
    v_rank := 0;

    select sa.* into v_sla from public.sla_actions sa where sa.id = c.sla_action_id;
    if v_sla.id is not null then
      v_rank := case v_sla.current_escalation_level when 'DIRETORIA' then 2 when 'ESCALAO_2' then 2 when 'ESCALAO_1' then 1 else 0 end;
    end if;

    -- Suspensão manual: registro humano MAIS RECENTE por caso decide (mesma regra de case-communication-suspension.ts).
    select (l.action = 'RISK_ALERT_CASE_COMMUNICATION_SUSPENDED') into v_susp
    from public.audit_log_entries l
    where l.project_id = p_project_id
      and l.entity_type = 'RISK_ALERT_CASE'
      and l.entity_id = c.id::text
      and l.action in ('RISK_ALERT_CASE_COMMUNICATION_SUSPENDED', 'RISK_ALERT_CASE_COMMUNICATION_RESUMED')
      and l.actor_type = 'USER'
      and l.actor_user_id is not null
    order by l.occurred_at desc, l.id desc
    limit 1;
    v_susp := coalesce(v_susp, false);

    -- Decisão de reemissão vigente (a mais recente por caso; só ator humano com usuário).
    select l.id, l.occurred_at, l.detail into v_appr
    from public.audit_log_entries l
    where l.project_id = p_project_id
      and l.entity_type = 'RISK_ALERT_CASE'
      and l.entity_id = c.id::text
      and l.action = 'RISK_ALERT_REISSUE_APPROVED'
      and l.actor_type = 'USER'
      and l.actor_user_id is not null
    order by l.occurred_at desc, l.id desc
    limit 1;

    v_consumed := false;
    v_delivered := false;
    if v_appr.id is not null then
      select
        coalesce(bool_or(o.status in ('PENDING', 'SENT', 'FAILED')), false),
        count(*) > 0
      into v_consumed, v_delivered
      from public.risk_alert_outbox o
      where o.case_id = c.id
        and o.idempotency_key like '%:REISSUE:' || v_appr.id::text || ':%';
      if v_consumed then
        v_state := 'REISSUED';
        v_appr_stage := substring(v_appr.detail from '"stage"\s*:\s*"([A-Z_0-9]+)"');
        v_appr_rank := case v_appr_stage when 'DIRETORIA' then 2 when 'ESCALAO_2' then 2 when 'ESCALAO_1' then 1 when 'RESPONSAVEL' then 0 else null end;
        if v_appr_rank is not null and v_rank > v_appr_rank then v_state := 'REISSUED_NEW_STAGE'; end if;
      elsif v_delivered then
        v_state := 'REISSUE_NOT_DELIVERED';
      else
        v_state := 'APPROVED_AWAITING_SEND';
      end if;
    end if;

    -- Lacuna: destinatários exigidos pela etapa alcançada sem aceite no próprio endereço.
    if v_sla.id is not null then
      select * into v_ar from public.sla_area_responsibles r where r.project_id = p_project_id and r.area = c.area;
      select coalesce(array_agg(x.role order by x.ord), '{}') into v_gaps
      from (
        select distinct on (v.user_id) v.role, v.user_id, v.ord
        from (values
          ('RESPONSAVEL'::text, coalesce(v_sla.responsible_user_id, v_ar.responsible_direct_user_id), 1),
          ('ESCALAO_1'::text, case when v_rank >= 1 then v_ar.escalation_1_user_id end, 2),
          ('DIRETORIA'::text, case when v_rank >= 2 then v_ar.board_user_id end, 3)
        ) as v(role, user_id, ord)
        where v.user_id is not null
        order by v.user_id, v.ord
      ) x
      where not exists (
        select 1
        from public.risk_alert_outbox o
        join public.profiles p on p.id = o.recipient_user_id
        where o.case_id = c.id
          and o.recipient_user_id = x.user_id
          and o.status = 'SENT'
          and lower(btrim(coalesce(o.recipient_email, ''))) = lower(btrim(p.email))
      );
    end if;

    v_eligible := false;
    if c.status <> 'OPEN' then v_reason := 'CASE_NOT_OPEN';
    elsif c.risk_level not in ('CRITICAL', 'HIGH') then v_reason := 'RISK_LEVEL_NOT_ELIGIBLE';
    elsif v_sla.id is null then v_reason := 'NO_SLA_ACTION';
    elsif v_susp then v_reason := 'MANUALLY_SUSPENDED';
    elsif v_state = 'APPROVED_AWAITING_SEND' then v_reason := 'ALREADY_APPROVED_AWAITING_SEND';
    elsif v_state = 'REISSUED' then v_reason := 'ALREADY_REISSUED';
    elsif coalesce(array_length(v_gaps, 1), 0) = 0 then v_reason := 'NO_COMMUNICATION_GAP';
    else v_eligible := true; v_reason := 'ELIGIBLE';
    end if;

    return query select
      c.id, c.visible_code, c.area, c.risk_level, c.title, c.reference,
      greatest(0, floor(extract(epoch from (now() - c.first_seen_at)) / 86400))::integer,
      coalesce(v_sla.current_escalation_level, 'RESPONSAVEL'), v_gaps, v_susp, v_state,
      v_appr.id, v_appr.occurred_at, v_eligible, v_reason;
  end loop;
end;
$$;

revoke all on function public.risk_alert_reissue_evaluate(uuid, uuid[]) from public, anon, authenticated, service_role;

-- ---------- Consulta somente leitura (ADMINISTRADOR) ----------
create or replace function public.risk_alert_reissue_pending(p_project_id uuid)
returns table (
  case_id uuid,
  visible_code text,
  area text,
  risk_level text,
  title text,
  reference text,
  age_days integer,
  stage text,
  gap_roles text[],
  manually_suspended boolean,
  approval_state text,
  last_approval_id uuid,
  last_approved_at timestamptz,
  eligible boolean,
  reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false) then
    raise exception 'FORBIDDEN';
  end if;
  return query select * from public.risk_alert_reissue_evaluate(p_project_id, null);
end;
$$;

revoke all on function public.risk_alert_reissue_pending(uuid) from public, anon;
grant execute on function public.risk_alert_reissue_pending(uuid) to authenticated;

-- ---------- Aprovação (ADMINISTRADOR): grava a decisão por caso; NÃO envia ----------
create or replace function public.risk_alert_reissue_approve(
  p_project_id uuid,
  p_case_ids uuid[],
  p_justification text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_just text := btrim(coalesce(p_justification, ''));
  v_ids uuid[];
  v_id uuid;
  e record;
  v_audit_id uuid;
  v_approved jsonb := '[]'::jsonb;
  v_ignored jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or not coalesce(public.has_project_permission(p_project_id, 'ADMINISTRADOR'), false) then
    raise exception 'FORBIDDEN';
  end if;
  if p_case_ids is null or coalesce(array_length(p_case_ids, 1), 0) = 0 then raise exception 'CASE_IDS_REQUIRED'; end if;
  if array_length(p_case_ids, 1) > 50 then raise exception 'TOO_MANY_CASES'; end if;
  if char_length(v_just) < 20 or char_length(v_just) > 500 then raise exception 'JUSTIFICATION_INVALID'; end if;
  -- O texto vai para a trilha append-only: nada que pareça e-mail, número longo (documento/telefone) ou credencial.
  if v_just ~ '[^[:space:]@]+@[^[:space:]@]+' or v_just ~ '[0-9]{8,}' or v_just ~ '[0-9]{3}[.][0-9]{3}[.][0-9]{3}-[0-9]{2}'
     or v_just ~* '(senha|password|passwd|token|secret|api[ _-]?key)[[:space:]]*[:=]' then
    raise exception 'JUSTIFICATION_SENSITIVE';
  end if;

  select coalesce(array_agg(distinct x order by x), '{}') into v_ids from unnest(p_case_ids) as x where x is not null;

  -- Serialização por caso (ordem determinística => sem deadlock): a 2ª chamada concorrente espera a 1ª confirmar
  -- e então reavalia (ALREADY_APPROVED_AWAITING_SEND) — uma única linha por decisão.
  perform 1 from public.risk_alert_cases rc where rc.project_id = p_project_id and rc.id = any(v_ids) order by rc.id for update;

  foreach v_id in array v_ids loop
    select * into e from public.risk_alert_reissue_evaluate(p_project_id, array[v_id]) limit 1;
    if e.case_id is null then
      v_ignored := v_ignored || jsonb_build_object('caseId', v_id, 'reason', 'CASE_NOT_FOUND');
    elsif not e.eligible then
      v_ignored := v_ignored || jsonb_build_object('caseId', v_id, 'visibleCode', e.visible_code, 'reason', e.reason);
    else
      insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
      values (
        p_project_id, 'USER', v_uid, 'RISK_ALERT_REISSUE_APPROVED', 'RISK_ALERT_CASE', v_id::text,
        jsonb_build_object(
          'justification', v_just,
          'caseCode', e.visible_code,
          'area', e.area,
          'riskLevel', e.risk_level,
          'stage', e.stage,
          'gapRoles', to_jsonb(e.gap_roles),
          'registersDecisionOnly', true,
          'note', 'Decisão administrativa registrada. Não envia e-mail: a reemissão depende do ciclo, das travas do piloto e do interruptor de envio.'
        )::text
      )
      returning id into v_audit_id;
      v_approved := v_approved || jsonb_build_object('caseId', v_id, 'visibleCode', e.visible_code, 'auditId', v_audit_id);
    end if;
  end loop;

  return jsonb_build_object(
    'approved', v_approved,
    'ignored', v_ignored,
    'approvedCount', jsonb_array_length(v_approved),
    'ignoredCount', jsonb_array_length(v_ignored),
    'emailSent', false
  );
end;
$$;

revoke all on function public.risk_alert_reissue_approve(uuid, uuid[], text) from public, anon;
grant execute on function public.risk_alert_reissue_approve(uuid, uuid[], text) to authenticated;

comment on function public.risk_alert_reissue_approve(uuid, uuid[], text) is
  'Frente D: registra (auditável, por caso) a decisão administrativa de reemissão consumida pelo ciclo. ADMINISTRADOR. NÃO envia e-mail nem escreve outbox.';
comment on function public.risk_alert_reissue_pending(uuid) is
  'Frente D: casos CRITICAL/HIGH abertos com elegibilidade/motivo para aprovação de reemissão. Somente leitura. ADMINISTRADOR.';
