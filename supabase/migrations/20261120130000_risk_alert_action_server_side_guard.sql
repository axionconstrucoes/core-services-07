-- ============================================================
-- 20261120130000_risk_alert_action_server_side_guard.sql
--
-- P0 de integridade: record_risk_alert_action passa a REVALIDAR no servidor a transição recebida.
--
-- Antes: a RPC (grant para authenticated) gravava o estado, o nível, os responsáveis, o status da ação SLA e os
-- e-mails (outbox) exatamente como vinham no JSON montado pelo cliente. Autor e permissão já eram verificados, mas um
-- usuário AUTORIZADO no alerta que chamasse a RPC diretamente (PostgREST) podia, por exemplo: encerrar o alerta sem
-- evidência em ALTO/CRÍTICO, mudar o estado sem ação humana, pôr qualquer pessoa como responsável, saltar nível de
-- escalonamento ou enfileirar e-mails para perfis arbitrários.
--
-- Agora (corpo da definição vigente, 20260921090000, preservado integralmente; só o bloco "revalidação P0" é novo):
--   - pela interface, toda transição exige exatamente uma ação humana e ESPECIALISTA não altera estado;
--   - estado de destino, status da ação SLA, responsáveis, encaminhamento, nível e topo são impostos pela ação,
--     com as mesmas regras da máquina de estados (apps/web/lib/risk-alerts/alert-state-machine.ts);
--   - evidência obrigatória para RESOLVIDO em ALTO/CRÍTICO; texto obrigatório em TOMANDO PROVIDÊNCIAS / OUTRO;
--   - e-mails só para o autor (confirmação), o destinatário do encaminhamento ou a Matriz da área (escalonamento).
-- Transições do sistema (worker service_role, sem autor) não mudam. Prazos e regras de escalonamento não mudam.
-- ============================================================

-- PROTEÇÃO CONTRA REGRESSÃO (ordem de publicação): se a função já estiver na versão endurecida do hotfix 20261121090000
-- (corpo idêntico em 20261121101000), esta definição INTERMEDIÁRIA é ignorada — nunca rebaixa a segurança. Em um
-- banco que ainda não a tem (replay em ordem), o comando abaixo roda exatamente como antes (mesmo corpo, mesmo prosrc).
do $ACC_NO_REGRESSION$
begin
  if not exists (
    select 1 from pg_proc
    where oid = to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)')
      and md5(prosrc) in ('c2f015a91b8f4e94c52a68c3536cb89d', '930f6d75898793479b418950b0053bd9')
  ) then
    execute $ACC_FN$
create or replace function public.record_risk_alert_action(
  p_case_id uuid,
  p_expected_state text,
  p_transition jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.risk_alert_cases%rowtype;
  v_action public.sla_actions%rowtype;
  v_link public.risk_alert_action_links%rowtype;
  v_active_forward public.risk_alert_forward_assignments%rowtype;
  v_auth_uid uuid := auth.uid();
  v_is_service boolean := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role';
  v_actor uuid;
  v_actor_allowed boolean := false;
  v_primary_action text;
  v_requested_action text := p_transition ->> 'actionType';
  v_event jsonb;
  v_event_action text;
  v_event_actor uuid;
  v_outbox jsonb;
  v_forward jsonb := p_transition -> 'forward';
  v_escalation jsonb := p_transition -> 'escalation';
  v_case_update jsonb := coalesce(p_transition -> 'caseUpdate', '{}'::jsonb);
  v_new_state text;
  v_new_level text;
  v_target uuid;
  v_key text;
  v_event_ids uuid[] := '{}';
  v_event_id uuid;
  v_outbox_id uuid;
  v_escalation_id uuid;
  v_conversation_id uuid;
  v_states constant text[] := array['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'FORWARDED', 'AWAITING_RECIPIENT_ACTION',
    'RETURNED_TO_SENDER', 'EXPERT_CONSULTATION_PENDING', 'EXPERT_ANSWERED', 'RESOLUTION_PROPOSED', 'RESOLVED',
    'REVIEW_REQUIRED', 'TOP_LEVEL_REACHED'];
  v_levels constant text[] := array['RESPONSAVEL', 'ESCALAO_1', 'ESCALAO_2', 'DIRETORIA'];
  v_system_events constant text[] := array['IMMEDIATE_ESCALATION', 'SCHEDULED_ESCALATION', 'TOP_LEVEL_REACHED',
    'FORWARD_TIMEOUT', 'RETURNED_TO_SENDER', 'EXPERT_ANSWERED'];
  v_human_events constant text[] := array['RESOLVED', 'RESOLUTION_PROPOSED', 'RESOLUTION_CONFIRMED', 'TAKING_ACTION',
    'FORWARD', 'EXPERT_CONSULTATION', 'OTHER'];
  -- P0 (20261120130000): revalidação da transição no servidor.
  v_guard_human jsonb;
  v_guard_human_count integer;
  v_guard_target_state text;
  v_guard_sla_status text;
  v_guard_forward_target uuid;
  v_guard_value uuid;
  v_guard_entry jsonb;
  v_guard_recipient uuid;
begin
  -- ---- autenticação
  if v_auth_uid is null and not v_is_service then
    raise exception 'Sessão não autenticada.';
  end if;
  if jsonb_typeof(p_transition) is distinct from 'object' then
    raise exception 'Transição inválida.';
  end if;

  -- ---- autor efetivo: usuário autenticado; pelo worker (service_role), o
  --      usuário identificado na resposta por e-mail (ou SYSTEM = null).
  if v_auth_uid is not null then
    v_actor := v_auth_uid;
  elsif (p_transition ->> 'actorUserId') is not null then
    v_actor := (p_transition ->> 'actorUserId')::uuid;
  end if;

  -- ---- caso (lock) + projeto
  select * into v_case from public.risk_alert_cases where id = p_case_id for update;
  if not found then
    raise exception 'Alerta não encontrado.';
  end if;
  if v_auth_uid is not null and not public.is_project_member(v_case.project_id) then
    raise exception 'Sem acesso a este projeto.';
  end if;
  if v_actor is not null and not exists (
    select 1 from public.project_memberships pm
    join public.profiles pr on pr.id = pm.user_id
    where pm.project_id = v_case.project_id and pm.user_id = v_actor and pm.status = 'ACTIVE'
  ) then
    raise exception 'Usuário sem membership ACTIVE neste projeto.';
  end if;

  -- ---- estado esperado / terminal
  if p_expected_state is null or not (p_expected_state = any (v_states)) then
    raise exception 'Estado esperado inválido.';
  end if;
  if v_case.state <> p_expected_state then
    raise exception 'Estado do alerta mudou (esperado %, atual %) — recarregue e repita.', p_expected_state, v_case.state;
  end if;
  if v_case.state = 'RESOLVED' then
    raise exception 'Alerta já resolvido — nenhuma ação adicional é permitida.';
  end if;

  -- ---- ação principal (primeiro evento humano) e transição permitida
  select e ->> 'actionType' into v_primary_action
  from jsonb_array_elements(coalesce(p_transition -> 'events', '[]'::jsonb)) e
  where (e ->> 'actionType') = any (v_human_events)
  limit 1;
  if v_requested_action is not null and v_requested_action not in ('RESOLVED', 'RESOLUTION_CONFIRMED', 'TAKING_ACTION', 'FORWARD', 'EXPERT_CONSULTATION', 'OTHER') then
    raise exception 'Ação inválida.';
  end if;
  if coalesce(v_requested_action, v_primary_action) is not null
     and not public.risk_alert_action_allowed(v_case.state, coalesce(v_requested_action, v_primary_action)) then
    raise exception 'Ação % não permitida no estado %.', coalesce(v_requested_action, v_primary_action), v_case.state;
  end if;
  if v_primary_action is not null and not public.risk_alert_action_allowed(v_case.state, v_primary_action) then
    raise exception 'Ação % não permitida no estado %.', v_primary_action, v_case.state;
  end if;
  if v_primary_action is not null and v_actor is null then
    raise exception 'Ação humana exige usuário identificado.';
  end if;

  -- ---- permissão sobre o alerta: administrador, responsável atual/anterior,
  --      encaminhado ativo, destinatário de e-mail do alerta ou responsável
  --      da área na Matriz (níveis 1/2/3). Ninguém mais age sobre o alerta.
  select * into v_active_forward from public.risk_alert_forward_assignments where case_id = p_case_id and state = 'ACTIVE';
  if v_actor is not null then
    v_actor_allowed :=
      (v_auth_uid is not null and public.has_project_permission(v_case.project_id, 'ADMINISTRADOR'))
      or v_case.current_responsible_user_id = v_actor
      or v_case.previous_responsible_user_id = v_actor
      or (v_active_forward.id is not null and v_active_forward.to_user_id = v_actor)
      or exists (select 1 from public.risk_alert_outbox o where o.case_id = p_case_id and o.recipient_user_id = v_actor)
      or exists (
        select 1 from public.sla_area_responsibles r
        where r.project_id = v_case.project_id and r.area = v_case.area
          and v_actor in (r.responsible_direct_user_id, r.secondary_responsible_user_id, r.escalation_1_user_id, r.escalation_2_user_id, r.board_user_id)
      );
    if not v_actor_allowed then
      raise exception 'Usuário sem permissão para agir sobre este alerta.';
    end if;
  end if;

  -- ---- encaminhado com prazo expirado não age como responsável
  if v_active_forward.id is not null and v_actor = v_active_forward.to_user_id and now() > v_active_forward.timeout_at then
    raise exception 'O prazo para assumir este encaminhamento expirou; a responsabilidade voltou ao remetente.';
  end if;

  -- ---- token de link do e-mail (opcional): hash, dono, ação, validade, uso único.
  --      Nunca é a autorização — só é consumido quando presente.
  if (p_transition ->> 'actionLinkTokenHash') is not null then
    select * into v_link from public.risk_alert_action_links
      where token_hash = p_transition ->> 'actionLinkTokenHash' and case_id = p_case_id for update;
    if not found or v_link.recipient_user_id is distinct from v_actor or v_link.action_type is distinct from coalesce(v_requested_action, v_primary_action)
       or v_link.expires_at <= now() or v_link.used_at is not null then
      raise exception 'Link de ação expirado, inválido ou já utilizado.';
    end if;
    update public.risk_alert_action_links set used_at = now() where id = v_link.id;
  end if;

  -- ==== P0 (20261120130000): a transição montada pelo cliente é REVALIDADA aqui ====
  -- A máquina de estados TypeScript calcula a transição; o banco agora impõe as mesmas regras, para que uma chamada
  -- direta (PostgREST) de um usuário autorizado não consiga forjar estado, responsável, nível, evidência ou e-mails.
  -- Transições SEM ação humana continuam exclusivas do worker (service_role sem autor): timeout de encaminhamento,
  -- devolução, escalonamento agendado, resposta do Expert.
  if v_auth_uid is not null and v_primary_action is null then
    raise exception 'Transição sem ação humana não é aceita pela interface.';
  end if;
  -- ESPECIALISTA é somente consulta (R-04): pela interface nunca muda o estado do alerta. O worker ainda registra a
  -- pergunta recebida por e-mail como consulta pendente (fila de resposta do Expert) — ver relatório de riscos.
  if v_auth_uid is not null and coalesce(v_requested_action, v_primary_action) = 'EXPERT_CONSULTATION' then
    raise exception 'ESPECIALISTA é somente consulta: não altera o estado do alerta.';
  end if;

  if v_primary_action is not null then
    select count(*) into v_guard_human_count
    from jsonb_array_elements(coalesce(p_transition -> 'events', '[]'::jsonb)) e
    where (e ->> 'actionType') = any (v_human_events);
    if v_guard_human_count <> 1 then
      raise exception 'Transição inválida: deve conter exatamente uma ação humana.';
    end if;
    select e into v_guard_human
    from jsonb_array_elements(coalesce(p_transition -> 'events', '[]'::jsonb)) e
    where (e ->> 'actionType') = any (v_human_events)
    limit 1;

    -- ação pedida coerente com o evento registrado (RESOLVIDO pode virar proposta de resolução)
    if v_requested_action is not null and not (
      v_primary_action = v_requested_action or (v_requested_action = 'RESOLVED' and v_primary_action = 'RESOLUTION_PROPOSED')
    ) then
      raise exception 'Transição inválida: ação % incoerente com o evento %.', v_requested_action, v_primary_action;
    end if;

    -- estado de destino imposto pela ação (mesma regra de applyAlertAction)
    v_guard_target_state := case v_primary_action
      when 'RESOLVED' then 'RESOLVED'
      when 'RESOLUTION_PROPOSED' then 'RESOLUTION_PROPOSED'
      when 'RESOLUTION_CONFIRMED' then 'RESOLVED'
      when 'TAKING_ACTION' then 'IN_PROGRESS'
      when 'FORWARD' then 'AWAITING_RECIPIENT_ACTION'
      when 'EXPERT_CONSULTATION' then 'EXPERT_CONSULTATION_PENDING'
      when 'OTHER' then case when v_case.state = 'OPEN' then 'ACKNOWLEDGED' else v_case.state end
    end;
    if coalesce(v_case_update ->> 'state', v_case.state) is distinct from v_guard_target_state then
      raise exception 'Transição inválida: o estado de destino de % é %.', v_primary_action, v_guard_target_state;
    end if;
    if exists (
      select 1 from jsonb_array_elements(coalesce(p_transition -> 'events', '[]'::jsonb)) e
      where (e ->> 'toState') is distinct from v_guard_target_state
         or ((e ->> 'actionType') = any (v_system_events) and (e ->> 'actionType') not in ('IMMEDIATE_ESCALATION', 'TOP_LEVEL_REACHED'))
    ) then
      raise exception 'Transição inválida: eventos incoerentes com a ação.';
    end if;

    -- conteúdo obrigatório
    if v_primary_action in ('RESOLVED', 'RESOLUTION_PROPOSED') and v_case.risk_level in ('HIGH', 'CRITICAL')
       and btrim(coalesce(v_guard_human ->> 'evidence', '')) = '' then
      raise exception 'Risco ALTO/CRÍTICO exige evidência da resolução.';
    end if;
    if v_primary_action in ('TAKING_ACTION', 'OTHER') and btrim(coalesce(v_guard_human ->> 'text', '')) = '' then
      raise exception 'Descreva a providência.';
    end if;

    -- ação SLA vinculada: só o status correspondente à ação; conclusão só junto do encerramento do alerta
    v_guard_sla_status := v_case_update ->> 'slaActionStatus';
    if v_guard_sla_status is not null and v_guard_sla_status is distinct from (case v_primary_action
         when 'RESOLVED' then 'COMPLETED' when 'RESOLUTION_CONFIRMED' then 'COMPLETED'
         when 'TAKING_ACTION' then 'IN_PROGRESS' else 'ACKNOWLEDGED' end) then
      raise exception 'Transição inválida: status da ação SLA incoerente com a ação.';
    end if;

    -- encaminhamento: só em ENVIAR P/, sempre com destinatário coerente em todos os campos
    if (v_primary_action = 'FORWARD') <> (v_forward is not null and jsonb_typeof(v_forward) = 'object') then
      raise exception 'Transição inválida: encaminhamento só acompanha ENVIAR P/.';
    end if;
    if v_primary_action = 'FORWARD' then
      v_guard_forward_target := (v_forward ->> 'toUserId')::uuid;
      if (v_guard_human ->> 'targetUserId')::uuid is distinct from v_guard_forward_target then
        raise exception 'Transição inválida: destinatário do evento difere do encaminhamento.';
      end if;
    end if;
    if (p_transition ->> 'closeActiveForwardAs') is not null and (p_transition ->> 'closeActiveForwardAs') <> 'ACTED' then
      raise exception 'Transição inválida: só o sistema devolve ou cancela um encaminhamento.';
    end if;

    -- responsáveis: só TOMANDO PROVIDÊNCIAS (quem agiu) e ENVIAR P/ (destinatário) alteram; sempre membro ACTIVE
    if v_case_update ? 'currentResponsibleUserId' then
      v_guard_value := (v_case_update ->> 'currentResponsibleUserId')::uuid;
      if not (
        (v_primary_action = 'TAKING_ACTION' and (v_guard_value = v_actor or v_guard_value is not distinct from v_case.current_responsible_user_id))
        or (v_primary_action = 'FORWARD' and v_guard_value = v_guard_forward_target)
      ) then
        raise exception 'Transição inválida: responsável do alerta incoerente com a ação.';
      end if;
      if v_guard_value is not null and not exists (
        select 1 from public.project_memberships pm
        where pm.project_id = v_case.project_id and pm.user_id = v_guard_value and pm.status = 'ACTIVE'
      ) then
        raise exception 'Responsável sem membership ACTIVE neste projeto.';
      end if;
    end if;
    if v_case_update ? 'previousResponsibleUserId'
       and not (v_primary_action = 'FORWARD' and (v_case_update ->> 'previousResponsibleUserId')::uuid = v_actor) then
      raise exception 'Transição inválida: responsável anterior incoerente com a ação.';
    end if;
    if v_case_update ? 'responsibleUserId'
       and not (v_primary_action = 'FORWARD' and (v_case_update ->> 'responsibleUserId')::uuid = v_guard_forward_target) then
      raise exception 'Transição inválida: só ENVIAR P/ troca o responsável da ação SLA.';
    end if;

    -- nível: escalonamento imediato só em OUTRO de risco ALTO/CRÍTICO, a partir do nível atual; topo só na Diretoria
    if v_escalation is not null and jsonb_typeof(v_escalation) = 'object' then
      if v_primary_action <> 'OTHER' or v_case.risk_level not in ('HIGH', 'CRITICAL')
         or (v_escalation ->> 'fromLevel') is distinct from v_case.current_level then
        raise exception 'Transição inválida: escalonamento imediato incoerente com a ação ou o nível atual.';
      end if;
    end if;
    if (v_case_update ->> 'currentLevel') is not null and (v_case_update ->> 'currentLevel') is distinct from v_case.current_level
       and (v_escalation is null or jsonb_typeof(v_escalation) <> 'object' or (v_escalation ->> 'toLevel') is distinct from (v_case_update ->> 'currentLevel')) then
      raise exception 'Transição inválida: o nível só muda por escalonamento.';
    end if;
    if (v_case_update ->> 'topLevelReached')::boolean is true and v_case.current_level <> 'DIRETORIA' then
      raise exception 'Transição inválida: topo da hierarquia só na Diretoria.';
    end if;

    -- e-mails (outbox): só confirmação ao autor, aviso ao destinatário do encaminhamento ou escalonamento a quem a
    -- Matriz da área define — nunca a um perfil arbitrário.
    for v_guard_entry in select * from jsonb_array_elements(coalesce(p_transition -> 'outbox', '[]'::jsonb)) loop
      v_guard_recipient := (v_guard_entry ->> 'recipientUserId')::uuid;
      if not (
        (v_guard_entry ->> 'notificationType' = 'ACTION_CONFIRMATION' and v_guard_recipient = v_actor)
        or (v_guard_entry ->> 'notificationType' = 'FORWARD' and v_primary_action = 'FORWARD' and v_guard_recipient = v_guard_forward_target)
        or (v_guard_entry ->> 'notificationType' = 'ESCALATION' and jsonb_typeof(v_escalation) = 'object' and (
              exists (
                select 1 from public.sla_area_responsibles r
                where r.project_id = v_case.project_id and r.area = v_case.area
                  and v_guard_recipient in (r.escalation_1_user_id, r.escalation_2_user_id, r.board_user_id))
              -- exceção temporária do piloto (Nível 2 substituto), registrada por humano em audit_log_entries
              or exists (
                select 1 from public.audit_log_entries a
                where a.project_id = v_case.project_id and a.actor_type = 'USER'
                  and a.action = 'RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET'
                  and a.entity_type = 'PROJECT_RISK_ALERT_AREA_LEVEL'
                  and a.entity_id = v_case.project_id::text || ':' || v_case.area || ':LEVEL_2'
                  and position(v_guard_recipient::text in a.detail) > 0)))
      ) then
        raise exception 'Transição inválida: destinatário de e-mail não autorizado para esta ação.';
      end if;
    end loop;
  end if;
  -- ==== fim da revalidação P0 ====

  -- ---- novo estado / nível
  v_new_state := coalesce(v_case_update ->> 'state', v_case.state);
  if not (v_new_state = any (v_states)) then
    raise exception 'Estado de destino inválido.';
  end if;
  v_new_level := v_case_update ->> 'currentLevel';
  if v_new_level is not null and not (v_new_level = any (v_levels)) then
    raise exception 'Nível inválido.';
  end if;
  if v_new_state = 'RESOLVED' and v_primary_action not in ('RESOLVED', 'RESOLUTION_CONFIRMED') then
    raise exception 'Só RESOLVIDO / CONFIRMAR RESOLUÇÃO encerram o alerta.';
  end if;

  -- ---- eventos (idempotência por chave única prefixada pelo caso)
  for v_event in select * from jsonb_array_elements(coalesce(p_transition -> 'events', '[]'::jsonb)) loop
    v_event_action := v_event ->> 'actionType';
    if not (v_event_action = any (v_human_events || v_system_events)) then
      raise exception 'Tipo de evento inválido.';
    end if;
    if position(p_case_id::text || ':' in coalesce(v_event ->> 'idempotencyKey', '')) <> 1 then
      raise exception 'Chave de idempotência inválida.';
    end if;
    if (v_event ->> 'fromState') is distinct from v_case.state then
      raise exception 'Evento fora do estado atual do alerta.';
    end if;
    if exists (select 1 from public.risk_alert_action_events where idempotency_key = v_event ->> 'idempotencyKey') then
      raise exception 'Ação já registrada (%).', v_event ->> 'idempotencyKey';
    end if;
    -- Autor do evento: humano => sempre o autor efetivo (o cliente não
    -- escolhe); eventos de sistema => sem autor.
    if v_event_action = any (v_human_events) then
      v_event_actor := v_actor;
    else
      v_event_actor := null;
    end if;
    if v_event_action = 'FORWARD' and (v_event ->> 'targetUserId') is null then
      raise exception 'Encaminhamento sem destinatário.';
    end if;
    insert into public.risk_alert_action_events (
      project_id, case_id, action_type, actor_type, actor_user_id, origin, from_state, to_state, from_level, to_level,
      text_content, justification, evidence, forecast_at, target_user_id, expert_id, expert_routing, message_id, idempotency_key
    ) values (
      v_case.project_id, p_case_id, v_event_action,
      case when v_event_actor is null then 'SYSTEM' else 'USER' end,
      v_event_actor,
      case when v_auth_uid is not null then 'WEB' else coalesce(v_event ->> 'origin', 'SYSTEM') end,
      v_event ->> 'fromState', v_event ->> 'toState',
      v_event ->> 'fromLevel', v_event ->> 'toLevel', left(v_event ->> 'text', 8000), left(v_event ->> 'justification', 8000), left(v_event ->> 'evidence', 8000),
      (v_event ->> 'forecastAt')::timestamptz, (v_event ->> 'targetUserId')::uuid, v_event ->> 'expertId', v_event -> 'expertRouting',
      (v_event ->> 'messageId')::uuid, v_event ->> 'idempotencyKey'
    ) returning id into v_event_id;
    v_event_ids := v_event_ids || v_event_id;
  end loop;

  -- ---- encaminhamento: um único ativo por alerta; destinatário membro
  --      ACTIVE (perfil existente), diferente do autor; só o encaminhado
  --      ativo pode re-encaminhar (cancelando o seu).
  if v_forward is not null and jsonb_typeof(v_forward) = 'object' then
    v_target := (v_forward ->> 'toUserId')::uuid;
    if v_target is null or v_target = v_actor then
      raise exception 'Destinatário do encaminhamento inválido.';
    end if;
    if not exists (
      select 1 from public.project_memberships pm
      join public.profiles pr on pr.id = pm.user_id
      where pm.project_id = v_case.project_id and pm.user_id = v_target and pm.status = 'ACTIVE'
    ) then
      raise exception 'Destinatário sem membership ACTIVE neste projeto (suspenso, removido ou inexistente).';
    end if;
    if v_active_forward.id is not null or v_case.state in ('FORWARDED', 'AWAITING_RECIPIENT_ACTION') then
      raise exception 'Já existe um encaminhamento ativo; aguarde a ação ou a devolução.';
    end if;
    if (v_forward ->> 'assumeDueAt')::timestamptz is null or (v_forward ->> 'assumeDueAt')::timestamptz <= now() then
      raise exception 'Prazo para assumir inválido.';
    end if;
    insert into public.risk_alert_forward_assignments (
      project_id, case_id, from_user_id, to_user_id, instruction, pilot_exception, assume_due_at, timeout_at
    ) values (
      v_case.project_id, p_case_id, v_actor, v_target,
      left(coalesce(v_forward ->> 'instruction', ''), 8000), coalesce((v_forward ->> 'pilotException')::boolean, false),
      (v_forward ->> 'assumeDueAt')::timestamptz, greatest((v_forward ->> 'timeoutAt')::timestamptz, (v_forward ->> 'assumeDueAt')::timestamptz)
    );
  end if;
  if (p_transition ->> 'closeActiveForwardAs') is not null then
    if (p_transition ->> 'closeActiveForwardAs') not in ('ACTED', 'RETURNED', 'CANCELLED') then
      raise exception 'Encerramento de encaminhamento inválido.';
    end if;
    update public.risk_alert_forward_assignments
      set state = p_transition ->> 'closeActiveForwardAs',
          acted_at = case when p_transition ->> 'closeActiveForwardAs' = 'ACTED' then now() else acted_at end,
          returned_at = case when p_transition ->> 'closeActiveForwardAs' = 'RETURNED' then now() else returned_at end
      where case_id = p_case_id and state = 'ACTIVE';
  end if;

  -- ---- escalonamento imediato (ação SLA vinculada) — lógica compartilhada.
  --      Pré-checagem explícita (nível atual e status) em vez de engolir
  --      qualquer erro: mudança concorrente => não duplica; outros erros sobem.
  if v_escalation is not null and jsonb_typeof(v_escalation) = 'object' and v_case.sla_action_id is not null then
    if (v_escalation ->> 'toLevel') not in ('ESCALAO_1', 'ESCALAO_2', 'DIRETORIA') then
      raise exception 'Nível de escalonamento inválido.';
    end if;
    select * into v_action from public.sla_actions where id = v_case.sla_action_id;
    if found and v_action.current_escalation_level = (v_escalation ->> 'fromLevel') and v_action.status not in ('COMPLETED', 'CANCELLED') then
      v_escalation_id := public.apply_sla_action_escalation_internal(
        v_case.sla_action_id, v_escalation ->> 'fromLevel', v_escalation ->> 'toLevel',
        coalesce(v_escalation ->> 'reason', 'NEW_EVIDENCE_INCREASED_RISK'), '[alerta de risco — escalonamento imediato por ação]'
      );
    end if;
  end if;

  -- ---- outbox (PENDING/SUPPRESSED) — chaves duplicadas são ignoradas;
  --      chaves só do próprio caso; origem nunca escolhida pelo cliente web.
  select id into v_conversation_id from public.alert_email_conversations where case_id = p_case_id;
  for v_outbox in select * from jsonb_array_elements(coalesce(p_transition -> 'outbox', '[]'::jsonb)) loop
    v_key := v_outbox ->> 'idempotencyKey';
    if v_key is null
       or (position(v_case.source_type || ':' || v_case.source_id::text || ':' in v_key) <> 1
           and position(p_case_id::text || ':' in v_key) <> 1) then
      raise exception 'Chave de outbox inválida.';
    end if;
    if not exists (select 1 from public.profiles where id = (v_outbox ->> 'recipientUserId')::uuid) then
      raise exception 'Destinatário da outbox inexistente.';
    end if;
    insert into public.risk_alert_outbox (
      project_id, case_id, sla_action_id, risk_level, notification_type, origin, escalation_level, recipient_user_id,
      scheduled_for, status, suppression_reason, idempotency_key, matrix_rule_snapshot, payload_summary, conversation_id
    ) values (
      v_case.project_id, p_case_id, v_case.sla_action_id, v_outbox ->> 'riskLevel', v_outbox ->> 'notificationType',
      case when v_auth_uid is not null then 'WEB_ACTION' else coalesce(v_outbox ->> 'origin', 'EMAIL_REPLY') end,
      v_outbox ->> 'escalationLevel', (v_outbox ->> 'recipientUserId')::uuid,
      now(), coalesce(v_outbox ->> 'status', 'PENDING'), v_outbox ->> 'suppressionReason', v_key,
      coalesce(v_outbox -> 'matrixRuleSnapshot', '{}'::jsonb), coalesce(v_outbox -> 'payloadSummary', '{}'::jsonb), v_conversation_id
    )
    on conflict (idempotency_key) do nothing
    returning id into v_outbox_id;
  end loop;

  -- ---- estado do caso
  update public.risk_alert_cases set
    state = v_new_state,
    current_level = coalesce(v_new_level, current_level),
    top_level_reached_at = case when (v_case_update ->> 'topLevelReached')::boolean is true then coalesce(top_level_reached_at, now()) else top_level_reached_at end,
    current_responsible_user_id = case when v_case_update ? 'currentResponsibleUserId' then (v_case_update ->> 'currentResponsibleUserId')::uuid else current_responsible_user_id end,
    previous_responsible_user_id = case when v_case_update ? 'previousResponsibleUserId' then (v_case_update ->> 'previousResponsibleUserId')::uuid else previous_responsible_user_id end,
    resolved_at = case when v_new_state = 'RESOLVED' then coalesce(resolved_at, now()) else resolved_at end,
    resolved_by_user_id = case when v_new_state = 'RESOLVED' then coalesce(resolved_by_user_id, v_actor) else resolved_by_user_id end
  where id = p_case_id;

  -- ---- ação SLA vinculada acompanha (assumir/concluir) — regra existente.
  if v_case.sla_action_id is not null then
    if v_case_update ->> 'slaActionStatus' = 'ACKNOWLEDGED' then
      update public.sla_actions set status = 'ACKNOWLEDGED', acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor)
        where id = v_case.sla_action_id and acknowledged_at is null and v_actor is not null;
    elsif v_case_update ->> 'slaActionStatus' = 'IN_PROGRESS' then
      update public.sla_actions set status = 'IN_PROGRESS', acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor)
        where id = v_case.sla_action_id and status not in ('COMPLETED', 'CANCELLED') and v_actor is not null;
    elsif v_case_update ->> 'slaActionStatus' = 'COMPLETED' then
      update public.sla_actions set status = 'COMPLETED', completed_at = coalesce(completed_at, now()),
        completed_by_user_id = coalesce(completed_by_user_id, v_actor),
        completion_note = coalesce(completion_note, left(coalesce(v_case_update ->> 'completionNote', 'Resolvido via alerta de risco.'), 8000)),
        acknowledged_at = coalesce(acknowledged_at, now()), acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor)
        where id = v_case.sla_action_id and completed_at is null and v_actor is not null;
    end if;
    if v_case_update ? 'responsibleUserId' and (v_case_update ->> 'responsibleUserId') is not null then
      if not exists (
        select 1 from public.project_memberships pm
        where pm.project_id = v_case.project_id and pm.user_id = (v_case_update ->> 'responsibleUserId')::uuid and pm.status = 'ACTIVE'
      ) then
        raise exception 'Responsável sem membership ACTIVE neste projeto.';
      end if;
      update public.sla_actions set responsible_user_id = (v_case_update ->> 'responsibleUserId')::uuid where id = v_case.sla_action_id;
    end if;
  end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_case.project_id, case when v_actor is null then 'SYSTEM' else 'USER' end, v_actor, null,
    'RISK_ALERT_ACTION', 'RISK_ALERT_CASE', p_case_id::text,
    format('Ação sobre alerta: %s (estado %s -> %s).', left(coalesce(p_transition ->> 'summary', '-'), 500), p_expected_state, v_new_state)
  );

  return jsonb_build_object('caseId', p_case_id, 'eventIds', to_jsonb(v_event_ids), 'escalationId', v_escalation_id, 'state', v_new_state);
end;
$$;
    $ACC_FN$;
  end if;
end
$ACC_NO_REGRESSION$;

alter function public.record_risk_alert_action(uuid, text, jsonb) owner to postgres;
revoke all on function public.record_risk_alert_action(uuid, text, jsonb) from public, anon;
grant execute on function public.record_risk_alert_action(uuid, text, jsonb) to authenticated, service_role;
