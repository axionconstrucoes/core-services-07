-- ============================================================
-- 20261120100000_sla_action_operations_by_responsible.sql
--
-- Operações do módulo "Ações e Escalonamentos" (assumir, estudando solução/iniciar, concluir, encaminhar) por RPC
-- SECURITY DEFINER com autorização explícita no banco — no mesmo padrão já adotado pelos fluxos operacionais
-- (record_risk_alert_action, ssma_corrective_action_update, submit_weekly_alert_digest).
--
-- Causa corrigida: as server actions faziam UPDATE direto em sla_actions sob a policy
-- sla_actions_update_own_or_admin, que exige has_project_permission(..., 'EDITOR'). Pela regra corporativa
-- (20260824232516_enforce_admin_only_write / 20260829200000) só ADMINISTRADOR atinge esse nível; para o
-- responsável o UPDATE casava 0 linhas, sem erro, e a tela confirmava sucesso sem nada gravado.
--
-- Regra corporativa preservada: has_project_permission e as policies de RLS NÃO mudam (escrita genérica continua
-- só do ADMINISTRADOR). Estas funções abrem SOMENTE as operações do próprio tratamento da ação:
--   ADMINISTRADOR ativo na obra ............ todas
--   RESPONSÁVEL atual (membro ativo, perfil diferente de LEITURA) ... assumir, iniciar, concluir, encaminhar
--   demais perfis (GESTOR/GERENTE/COLABORADOR/LEITURA não responsáveis) ... nenhuma (somente leitura)
--
-- Preservado:
--   - prazos (assume/respond/complete_due_at), nível de escalonamento e escalonamento: não são tocados aqui;
--   - auditoria: o gatilho sla_actions_audit_updated registra ACTION_ACKNOWLEDGED / ACTION_STARTED /
--     ACTION_COMPLETED / ACTION_REASSIGNED com o autor = auth.uid(); o encaminhamento grava, além disso,
--     ACTION_FORWARDED com o motivo informado;
--   - evidência SSMA: o gatilho sla_action_ssma_guard continua recusando concluir pelo módulo de Ações uma ação
--     de origem SSMA (a conclusão exige a evidência no app SSMA);
--   - consistência com o alerta de risco: ação vinculada a um caso de risco (risk_alert_cases.sla_action_id) é
--     tratada SÓ pela página do alerta (máquina de estados com evidência, previsão e encaminhamento auditados);
--     aqui é recusada com RISK_CASE_LINKED, para que caso e ação nunca divirjam.
--
-- Cada função devolve a linha gravada: a interface só confirma sucesso com a persistência comprovada.
-- ============================================================

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
  v_is_responsible := v_action.responsible_user_id = v_user and v_permission not in ('LEITURA', 'VIEWER');
  if not (v_is_admin or v_is_responsible) then raise exception 'ACTION_ACCESS_DENIED'; end if;

  if v_action.status in ('COMPLETED', 'CANCELLED') then raise exception 'ACTION_CLOSED'; end if;

  if exists (select 1 from public.risk_alert_cases c where c.sla_action_id = v_action.id) then
    raise exception 'RISK_CASE_LINKED';
  end if;

  return v_action;
end;
$$;

-- Assumir: mesmas colunas e transição de antes (ciência + ACKNOWLEDGED); não mexe em prazos nem nível.
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

-- Estudando solução / iniciar: ACKNOWLEDGED -> IN_PROGRESS (mesma regra da tela).
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

-- Concluir: exige a nota de conclusão (como antes); vínculos opcionais com evento/versão de documento DA MESMA obra.
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

-- Encaminhar (ENVIAR PARA): troca o responsável por outro membro ATIVO da obra que não seja somente leitura.
-- Prazos e nível de escalonamento NÃO mudam (o encaminhamento não reinicia SLA). Motivo obrigatório para o
-- responsável; opcional para o ADMINISTRADOR (compatível com a reatribuição administrativa já existente).
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

revoke all on function public.sla_action_authorize_operation(uuid, text) from public, anon, authenticated;
revoke all on function public.sla_action_assume(uuid) from public, anon;
revoke all on function public.sla_action_start(uuid) from public, anon;
revoke all on function public.sla_action_complete(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.sla_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.sla_action_assume(uuid) to authenticated;
grant execute on function public.sla_action_start(uuid) to authenticated;
grant execute on function public.sla_action_complete(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.sla_action_forward(uuid, uuid, text) to authenticated;
