-- ROLLBACK (manual, NAO e migration) de 20261121120000_email_replies_sla_digest_contract_by_email.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.email_reply_command_receipts') is not null then
    select count(*) into n from public.email_reply_command_receipts;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_reply_command_receipts tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.email_reply_confirmations') is not null then
    select count(*) into n from public.email_reply_confirmations;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_reply_confirmations tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.email_reply_confirmations;
drop table if exists public.email_reply_command_receipts;
drop function if exists public.email_reply_claim_receipt(text, uuid, text, text, uuid, text);
drop function if exists public.email_reply_assert_new_message(text);
drop function if exists public.email_reply_member_permission(uuid, uuid);
drop function if exists public.sla_action_authorize_operation_for(uuid, uuid, text);
drop function if exists public.sla_action_assume_core(uuid, uuid);
drop function if exists public.sla_action_start_core(uuid, uuid);
drop function if exists public.sla_action_complete_core(uuid, uuid, text, uuid, uuid);
drop function if exists public.sla_action_forward_core(uuid, uuid, uuid, text);
drop function if exists public.sla_action_email_precheck(uuid, uuid);
drop function if exists public.sla_action_progress_by_email(uuid, uuid, text, text);
drop function if exists public.sla_action_complete_by_email(uuid, uuid, text, text, text);
drop function if exists public.sla_action_forward_by_email(uuid, uuid, uuid, text, text);
drop function if exists public.weekly_alert_digest_apply_item_core(uuid, boolean, uuid, uuid, uuid, text, uuid, text, text);
drop function if exists public.submit_weekly_alert_digest_item_by_email(uuid, uuid, text, uuid, text, text, text);
drop function if exists public.save_contract_alert_batch_item_response_core(uuid, uuid, uuid, text, uuid);
drop function if exists public.save_contract_alert_batch_item_response_by_email(uuid, uuid, text, uuid, text, text, text);
-- restaura audit_sla_action_updated() com o corpo de 20261029110000_sla_action_audit_service_role_actor
create or replace function public.audit_sla_action_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_actor uuid := coalesce(auth.uid(), new.acknowledged_by_user_id);
  v_reassign_actor uuid := auth.uid();
begin
  if old.acknowledged_at is null and new.acknowledged_at is not null then
    insert into public.audit_log_entries (
      project_id, actor_type, actor_user_id, actor_label,
      action, entity_type, entity_id, detail, occurred_at
    )
    values (
      new.project_id, 'USER', new.acknowledged_by_user_id, null,
      'ACTION_ACKNOWLEDGED', 'SLA_ACTION', new.id::text,
      format('Ação "%s" assumida.', new.title), new.acknowledged_at
    );
  end if;

  if old.status is distinct from 'IN_PROGRESS' and new.status = 'IN_PROGRESS' then
    insert into public.audit_log_entries (
      project_id, actor_type, actor_user_id, actor_label,
      action, entity_type, entity_id, detail
    )
    values (
      new.project_id, case when v_started_actor is null then 'SYSTEM' else 'USER' end, v_started_actor, null,
      'ACTION_STARTED', 'SLA_ACTION', new.id::text,
      format('Ação "%s" iniciada.', new.title)
    );
  end if;

  if old.completed_at is null and new.completed_at is not null then
    insert into public.audit_log_entries (
      project_id, actor_type, actor_user_id, actor_label,
      action, entity_type, entity_id, detail, occurred_at
    )
    values (
      new.project_id, 'USER', new.completed_by_user_id, null,
      'ACTION_COMPLETED', 'SLA_ACTION', new.id::text,
      format('Ação "%s" concluída.', new.title), new.completed_at
    );
  end if;

  if old.status is distinct from 'OVERDUE' and new.status = 'OVERDUE' then
    insert into public.audit_log_entries (
      project_id, actor_type, actor_user_id, actor_label,
      action, entity_type, entity_id, detail
    )
    values (
      new.project_id, 'SYSTEM', null, null,
      'ACTION_OVERDUE', 'SLA_ACTION', new.id::text,
      format('Ação "%s" marcada como vencida.', new.title)
    );
  end if;

  if old.responsible_user_id is distinct from new.responsible_user_id
     and old.responsible_user_id is not null then
    insert into public.audit_log_entries (
      project_id, actor_type, actor_user_id, actor_label,
      action, entity_type, entity_id, detail
    )
    values (
      new.project_id, case when v_reassign_actor is null then 'SYSTEM' else 'USER' end, v_reassign_actor, null,
      'ACTION_REASSIGNED', 'SLA_ACTION', new.id::text,
      format('Ação "%s" reatribuída de %s para %s.', new.title, old.responsible_user_id, coalesce(new.responsible_user_id::text, 'ninguém'))
    );
  end if;

  return new;
end;
$$;
-- restaura sla_action_authorize_operation(uuid, text) com o corpo de 20261120153000_null_safe_authorization_checks
create or replace function public.sla_action_authorize_operation(p_action_id uuid, p_operation text)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.sla_actions%rowtype;
  v_permission text;
  v_is_admin boolean;
  v_is_responsible boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_operation not in ('ASSUME', 'START', 'COMPLETE', 'FORWARD') then raise exception 'INVALID_OPERATION'; end if;

  select * into v_action from public.sla_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;

  select pm.permission into v_permission
  from public.project_memberships pm
  where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE';
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');
  v_is_responsible := coalesce(v_action.responsible_user_id = v_user, false) and v_permission not in ('LEITURA', 'VIEWER');
  if not coalesce(v_is_admin or v_is_responsible, false) then raise exception 'ACTION_ACCESS_DENIED'; end if;

  if v_action.status in ('COMPLETED', 'CANCELLED') then raise exception 'ACTION_CLOSED'; end if;

  if exists (select 1 from public.risk_alert_cases c where c.sla_action_id = v_action.id) then
    raise exception 'RISK_CASE_LINKED';
  end if;

  return v_action;
end;
$$;
revoke all on function public.sla_action_authorize_operation(uuid, text) from public, anon, authenticated;
-- restaura sla_action_assume(uuid) com o corpo de 20261120100000_sla_action_operations_by_responsible
create or replace function public.sla_action_assume(p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  v_action := public.sla_action_authorize_operation(p_action_id, 'ASSUME');
  if v_action.acknowledged_at is not null then raise exception 'ACTION_ALREADY_ACKNOWLEDGED'; end if;

  update public.sla_actions
  set acknowledged_at = now(), acknowledged_by_user_id = auth.uid(), status = 'ACKNOWLEDGED'
  where id = p_action_id
  returning * into v_action;
  return v_action;
end;
$$;
revoke all on function public.sla_action_assume(uuid) from public, anon;
grant execute on function public.sla_action_assume(uuid) to authenticated;
-- restaura sla_action_start(uuid) com o corpo de 20261120100000_sla_action_operations_by_responsible
create or replace function public.sla_action_start(p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  v_action := public.sla_action_authorize_operation(p_action_id, 'START');
  if v_action.status <> 'ACKNOWLEDGED' then raise exception 'ACTION_NOT_ACKNOWLEDGED'; end if;

  update public.sla_actions set status = 'IN_PROGRESS' where id = p_action_id returning * into v_action;
  return v_action;
end;
$$;
revoke all on function public.sla_action_start(uuid) from public, anon;
grant execute on function public.sla_action_start(uuid) to authenticated;
-- restaura sla_action_complete(uuid, text, uuid, uuid) com o corpo de 20261120100000_sla_action_operations_by_responsible
create or replace function public.sla_action_complete(
  p_action_id uuid,
  p_completion_note text,
  p_related_event_id uuid default null,
  p_related_document_version_id uuid default null
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
  v_note text := nullif(btrim(coalesce(p_completion_note, '')), '');
begin
  v_action := public.sla_action_authorize_operation(p_action_id, 'COMPLETE');
  if v_note is null then raise exception 'COMPLETION_NOTE_REQUIRED'; end if;

  if p_related_event_id is not null and not exists (
    select 1 from public.contract_events e where e.id = p_related_event_id and e.project_id = v_action.project_id
  ) then raise exception 'RELATED_EVENT_NOT_FOUND'; end if;

  -- O gatilho sla_action_ssma_guard recusa (SSMA_ACTION_COMPLETE_VIA_SSMA) quando a ação nasceu no SSMA.
  update public.sla_actions
  set completed_at = now(),
      completed_by_user_id = auth.uid(),
      completion_note = v_note,
      status = 'COMPLETED',
      related_event_id = coalesce(p_related_event_id, related_event_id),
      related_document_version_id = coalesce(p_related_document_version_id, related_document_version_id)
  where id = p_action_id
  returning * into v_action;
  return v_action;
end;
$$;
revoke all on function public.sla_action_complete(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.sla_action_complete(uuid, text, uuid, uuid) to authenticated;
-- restaura sla_action_forward(uuid, uuid, text) com o corpo de 20261120100000_sla_action_operations_by_responsible
create or replace function public.sla_action_forward(
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.sla_actions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_admin boolean;
  v_previous uuid;
begin
  v_action := public.sla_action_authorize_operation(p_action_id, 'FORWARD');
  v_previous := v_action.responsible_user_id;

  if p_new_responsible_user_id is null then raise exception 'NEW_RESPONSIBLE_REQUIRED'; end if;
  if p_new_responsible_user_id = v_previous then raise exception 'SAME_RESPONSIBLE'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = v_action.project_id and pm.user_id = p_new_responsible_user_id
      and pm.status = 'ACTIVE' and pm.permission not in ('LEITURA', 'VIEWER')
  ) then raise exception 'NEW_RESPONSIBLE_NOT_ELIGIBLE'; end if;

  v_is_admin := exists (
    select 1 from public.project_memberships pm
    where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE'
      and pm.permission in ('ADMINISTRADOR', 'ADMIN')
  );
  if not v_is_admin and (v_reason is null or char_length(v_reason) < 5) then raise exception 'FORWARD_REASON_REQUIRED'; end if;

  -- O gatilho sla_actions_audit_updated registra ACTION_REASSIGNED; sla_action_ssma_guard propaga ao SSMA vinculado.
  update public.sla_actions set responsible_user_id = p_new_responsible_user_id where id = p_action_id returning * into v_action;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail, occurred_at)
  values (
    v_action.project_id, 'USER', v_user, null, 'ACTION_FORWARDED', 'SLA_ACTION', v_action.id::text,
    format('Ação "%s" encaminhada de %s para %s. Motivo: %s', v_action.title, coalesce(v_previous::text, 'não atribuído'),
      p_new_responsible_user_id::text, coalesce(v_reason, 'não informado (administrador)')),
    now()
  );
  return v_action;
end;
$$;
revoke all on function public.sla_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.sla_action_forward(uuid, uuid, text) to authenticated;
-- restaura submit_weekly_alert_digest(uuid, jsonb) com o corpo de 20261120150000_weekly_digest_evidence_and_guards
create or replace function public.submit_weekly_alert_digest(
  p_digest_id uuid,
  p_responses jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_digest public.weekly_alert_digests%rowtype;
  v_expected_count integer;
  v_received_count integer;
  v_distinct_count integer;
  v_item record;
  v_payload jsonb;
  v_response text;
  v_directed_to uuid;
  v_note text;
  v_evidence text;
  v_is_admin boolean;
  v_action public.sla_actions%rowtype;
begin
  if v_actor_id is null then
    raise exception 'Sessão expirada. Faça login novamente.';
  end if;

  select * into v_digest
  from public.weekly_alert_digests
  where id = p_digest_id
  for update;

  if not found then
    raise exception 'Resumo semanal não encontrado.';
  end if;

  v_is_admin := public.has_project_permission(v_digest.project_id, 'ADMIN');
  if v_digest.recipient_user_id <> v_actor_id
     and not v_is_admin then
    raise exception 'Você não tem permissão para responder este resumo.';
  end if;

  if v_digest.status = 'RESPONDED' then
    raise exception 'Este resumo semanal já foi respondido.';
  end if;

  if v_digest.status <> 'SENT' then
    raise exception 'Este resumo ainda não está disponível para resposta.';
  end if;

  if jsonb_typeof(p_responses) <> 'array' then
    raise exception 'Formato de respostas inválido.';
  end if;

  select count(*) into v_expected_count
  from public.weekly_alert_digest_items
  where digest_id = p_digest_id;

  v_received_count := jsonb_array_length(p_responses);

  select count(distinct value ->> 'actionId') into v_distinct_count
  from jsonb_array_elements(p_responses);

  if v_expected_count = 0
     or v_received_count <> v_expected_count
     or v_distinct_count <> v_expected_count then
    raise exception 'Responda todos os itens antes de enviar.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_responses) payload
    where coalesce(payload ->> 'resolution', '') not in ('AWARE', 'STUDYING', 'RESOLVED', 'FORWARDED')
  ) then
    raise exception 'Existe uma resposta inválida no resumo.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_responses) payload
    where not exists (
      select 1
      from public.weekly_alert_digest_items i
      where i.digest_id = p_digest_id
        and i.action_id::text = payload ->> 'actionId'
    )
  ) then
    raise exception 'O resumo contém um item que não pertence a esta mensagem.';
  end if;

  for v_item in
    select i.*, a.status as action_status
    from public.weekly_alert_digest_items i
    join public.sla_actions a on a.id = i.action_id
    where i.digest_id = p_digest_id
    order by i.position
    for update of i, a
  loop
    select value into v_payload
    from jsonb_array_elements(p_responses)
    where value ->> 'actionId' = v_item.action_id::text;

    v_response := v_payload ->> 'resolution';
    v_directed_to := nullif(v_payload ->> 'directedToUserId', '')::uuid;
    v_note := nullif(btrim(coalesce(v_payload ->> 'note', '')), '');
    v_evidence := nullif(btrim(coalesce(v_payload ->> 'evidence', '')), '');
    select * into v_action from public.sla_actions where id = v_item.action_id;

    -- (20261120150000) Itens que têm canal próprio de tratamento nunca são alterados pelo resumo: ação de alerta de
    -- risco (página do alerta, com evidências) e ação corretiva SSMA (app SSMA, com foto). Recusa explícita, antes de
    -- gravar qualquer item (a transação inteira é desfeita).
    if v_action.related_ssma_corrective_action_id is not null then
      raise exception 'O item "%" é uma ação corretiva SSMA: registre o tratamento no app SSMA (com a evidência).', v_action.title;
    end if;
    if exists (select 1 from public.risk_alert_cases c where c.sla_action_id = v_item.action_id) then
      raise exception 'O item "%" pertence a um alerta de risco: registre o tratamento pela página do alerta.', v_action.title;
    end if;

    -- Quem responde precisa continuar sendo o responsável da ação (ou ser ADMINISTRADOR): se a ação foi encaminhada
    -- depois do envio do resumo, a resposta antiga não altera a ação de outra pessoa.
    if v_action.status not in ('COMPLETED', 'CANCELLED') and v_action.responsible_user_id is distinct from v_actor_id and not v_is_admin then
      raise exception 'O item "%" agora está sob responsabilidade de outra pessoa; a resposta não foi registrada.', v_action.title;
    end if;

    -- Evidências e justificativas (requisito: mesma exigência dos demais caminhos de conclusão):
    --   RESOLVIDO: descrição do que foi feito (mín. 10 caracteres), escrita por quem responde — nunca texto fixo;
    --              risco ALTO/CRÍTICO (não deveria chegar ao resumo) exige também a evidência.
    --   DIRECIONAR: motivo (mín. 5 caracteres) para quem não é ADMINISTRADOR; destino ativo e não somente leitura.
    if v_response = 'RESOLVED' then
      if v_note is null or char_length(v_note) < 10 then
        raise exception 'Descreva o que foi feito para resolver "%" (mínimo de 10 caracteres).', v_action.title;
      end if;
      if v_action.risk_level in ('HIGH', 'CRITICAL') and v_evidence is null then
        raise exception 'O item "%" é de risco ALTO/CRÍTICO e exige evidência da resolução.', v_action.title;
      end if;
    elsif v_response = 'FORWARDED' then
      if not v_is_admin and (v_note is null or char_length(v_note) < 5) then
        raise exception 'Informe o motivo do direcionamento de "%" (mínimo de 5 caracteres).', v_action.title;
      end if;
      if v_directed_to is not null and v_directed_to = v_action.responsible_user_id then
        raise exception 'O item "%" já está sob responsabilidade da pessoa selecionada.', v_action.title;
      end if;
    end if;

    if v_response = 'FORWARDED' then
      if v_directed_to is null or not exists (
        select 1 from public.project_memberships pm
        where pm.project_id = v_digest.project_id
          and pm.user_id = v_directed_to
          and coalesce(pm.status, 'ACTIVE') = 'ACTIVE'
          and pm.permission not in ('LEITURA', 'VIEWER')
      ) then
        raise exception 'Selecione um usuário ativo (que não seja somente leitura) para cada item direcionado.';
      end if;

      -- Somente o responsável muda. Os três prazos e o nível de
      -- escalonamento permanecem exatamente como estavam.
      update public.sla_actions
      set responsible_user_id = v_directed_to
      where id = v_item.action_id
        and status not in ('COMPLETED', 'CANCELLED');
    elsif v_response = 'RESOLVED' then
      update public.sla_actions
      set status = 'COMPLETED',
          completed_at = now(),
          completed_by_user_id = v_actor_id,
          completion_note = left('Resumo semanal: ' || v_note || coalesce(' | Evidência: ' || v_evidence, ''), 8000)
      where id = v_item.action_id
        and status not in ('COMPLETED', 'CANCELLED');
    elsif v_response = 'STUDYING' then
      update public.sla_actions
      set status = 'IN_PROGRESS',
          acknowledged_at = coalesce(acknowledged_at, now()),
          acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor_id)
      where id = v_item.action_id
        and status not in ('COMPLETED', 'CANCELLED');
    elsif v_response = 'AWARE' then
      update public.sla_actions
      set status = case when status = 'PENDING' then 'ACKNOWLEDGED' else status end,
          acknowledged_at = coalesce(acknowledged_at, now()),
          acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor_id)
      where id = v_item.action_id
        and status not in ('COMPLETED', 'CANCELLED');
    end if;

    update public.weekly_alert_digest_items
    set response = v_response,
        directed_to_user_id = case when v_response = 'FORWARDED' then v_directed_to else null end,
        responded_at = now(),
        responded_by_user_id = v_actor_id
    where id = v_item.id;

    insert into public.audit_log_entries (
      project_id, actor_type, actor_user_id, actor_label,
      action, entity_type, entity_id, detail
    ) values (
      v_digest.project_id, 'USER', v_actor_id, null,
      'WEEKLY_ALERT_ITEM_RESPONDED', 'SLA_ACTION', v_item.action_id::text,
      format(
        'Item do resumo semanal respondido: %s%s%s%s. Prazos e escalonamento preservados.',
        v_response,
        case when v_directed_to is not null then format(' para %s', v_directed_to) else '' end,
        case when v_note is not null then format('. Nota: %s', left(v_note, 500)) else '' end,
        case when v_evidence is not null then format('. Evidência: %s', left(v_evidence, 300)) else '' end
      )
    );
  end loop;

  update public.weekly_alert_digests
  set status = 'RESPONDED', responded_at = now(), responded_by_user_id = v_actor_id
  where id = p_digest_id;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label,
    action, entity_type, entity_id, detail
  ) values (
    v_digest.project_id, 'USER', v_actor_id, null,
    'WEEKLY_ALERT_DIGEST_RESPONDED', 'WEEKLY_ALERT_DIGEST', p_digest_id::text,
    format('Resumo semanal respondido integralmente: %s item(ns).', v_expected_count)
  );

  return jsonb_build_object('digestId', p_digest_id, 'respondedItems', v_expected_count);
end;
$$;
revoke all on function public.submit_weekly_alert_digest(uuid, jsonb) from public, anon;
grant execute on function public.submit_weekly_alert_digest(uuid, jsonb) to authenticated;
-- restaura save_contract_alert_batch_item_response(uuid, uuid, text, uuid) com o corpo de 20261027140000_alert_batch_partial_responses
create or replace function public.save_contract_alert_batch_item_response(
  p_batch_id uuid,
  p_event_id uuid,
  p_action text,
  p_assigned_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_batch public.contract_alert_batches%rowtype;
  v_item public.contract_alert_batch_items%rowtype;
  v_assigned uuid;
  v_total integer;
  v_answered integer;
begin
  if v_actor_id is null then
    raise exception 'Sessão expirada. Faça login novamente.';
  end if;

  if coalesce(p_action, '') not in ('RESOLVIDO', 'EM_ANDAMENTO', 'ENVIADO_PARA') then
    raise exception 'Ação inválida.';
  end if;

  select * into v_batch from public.contract_alert_batches where id = p_batch_id for update;
  if not found then
    raise exception 'Lote de alertas não encontrado.';
  end if;

  if v_batch.recipient_user_id <> v_actor_id
     and not public.has_project_permission(v_batch.project_id, 'ADMINISTRADOR') then
    raise exception 'Você não tem permissão para responder este lote de alertas.';
  end if;

  if v_batch.status = 'RESPONDED' then
    raise exception 'Este lote de alertas já foi respondido.';
  end if;
  if v_batch.status <> 'SENT' then
    raise exception 'Este lote de alertas ainda não está disponível para resposta.';
  end if;

  select * into v_item
  from public.contract_alert_batch_items
  where batch_id = p_batch_id and event_id = p_event_id
  for update;
  if not found then
    raise exception 'O alerta não pertence a este lote.';
  end if;

  if p_action = 'ENVIADO_PARA' then
    v_assigned := p_assigned_user_id;
    if v_assigned is null or not exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_batch.project_id and pm.user_id = v_assigned and pm.status = 'ACTIVE'
    ) then
      raise exception 'Selecione um colaborador ativo do projeto para o alerta enviado.';
    end if;
  else
    v_assigned := null;
  end if;

  update public.contract_alert_batch_items
  set action = p_action, assigned_user_id = v_assigned, answered_at = now(), answered_by_user_id = v_actor_id
  where id = v_item.id;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail
  ) values (
    v_batch.project_id, 'USER', v_actor_id, null,
    'CONTRACT_ALERT_BATCH_ITEM_RESPONDED', 'CONTRACT_EVENT', p_event_id::text,
    format('Alerta de contrato respondido individualmente no lote %s: %s%s (resposta parcial salva). CorrelationId=%s.',
      p_batch_id, p_action,
      case when v_assigned is not null then format(' para %s', v_assigned) else '' end,
      v_batch.correlation_id)
  );

  -- O mesmo alerta ainda sem resposta em OUTRO lote aberto da mesma obra (lembrete anterior)
  -- recebe a mesma ação, para não ficar como pendência órfã.
  update public.contract_alert_batch_items i
  set action = p_action, assigned_user_id = v_assigned, answered_at = now(), answered_by_user_id = v_actor_id
  from public.contract_alert_batches b
  where i.batch_id = b.id
    and b.id <> p_batch_id
    and b.project_id = v_batch.project_id
    and b.status = 'SENT'
    and i.event_id = p_event_id
    and i.action is null;

  select count(*), count(action) into v_total, v_answered
  from public.contract_alert_batch_items where batch_id = p_batch_id;

  return jsonb_build_object('batchId', p_batch_id, 'eventId', p_event_id, 'answered', v_answered, 'total', v_total, 'complete', v_answered = v_total);
end;
$$;
revoke all on function public.save_contract_alert_batch_item_response(uuid, uuid, text, uuid) from public;
grant execute on function public.save_contract_alert_batch_item_response(uuid, uuid, text, uuid) to authenticated;
drop index if exists public.email_reply_command_receipts_subject_idx;
drop index if exists public.email_reply_confirmations_pending_idx;
commit;
