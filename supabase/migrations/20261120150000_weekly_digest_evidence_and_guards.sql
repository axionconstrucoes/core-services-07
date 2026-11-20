-- ============================================================
-- 20261120150000_weekly_digest_evidence_and_guards.sql
--
-- Resumo semanal (submit_weekly_alert_digest): mesmas exigências dos demais caminhos de conclusão e travas de
-- integridade no banco (antes só o produtor filtrava). Assinatura e formato do payload preservados; cada item
-- passa a aceitar "note" (texto de quem responde) e "evidence" (opcional).
--   - RESOLVIDO: descrição obrigatória (mín. 10) gravada na nota de conclusão — fim do texto fixo; ALTO/CRÍTICO
--     exige evidência.
--   - DIRECIONAR: motivo obrigatório para não administrador; destino ativo e não somente leitura; não pode ser o
--     próprio responsável.
--   - Itens de alerta de risco ou ação corretiva SSMA são recusados com mensagem clara (antes, um item SSMA
--     derrubava o resumo inteiro pelo guard; agora a recusa é explícita e nada é gravado).
--   - Quem responde precisa continuar responsável pela ação (ou ser ADMINISTRADOR).
-- Prazos, nível e escalonamento: inalterados.
-- ============================================================

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
