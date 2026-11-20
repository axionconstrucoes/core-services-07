-- ============================================================
-- 20261121120000_email_replies_sla_digest_contract_by_email.sql
--
-- N3 — operação por resposta de e-mail (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA) dos tipos que faltavam:
--   SLA_ACTION (ação de SLA), WEEKLY_DIGEST_ITEM (item do resumo semanal) e CONTRACT_ALERT_ITEM (alerta de contrato,
--   individual ou em lote).
--
-- Mesmo desenho da P2 (20261120160000): as funções originais do app passam a delegar a um NÚCLEO que recebe o ator
-- explícito (comportamento das originais inalterado — continuam exigindo auth.uid()); as variantes *_by_email recebem o
-- ator já autenticado pelo worker (domínio corporativo, perfil com o e-mail EXATO do From, membro ATIVO, DMARC/DKIM
-- alinhado) e só podem ser chamadas pelo service_role. A regra de autorização/validação é a MESMA do app (o núcleo);
-- o canal de e-mail só ACRESCENTA exigências (nunca relaxa):
--   - remetente membro ATIVO da obra e perfil diferente de LEITURA;
--   - RESOLVIDO: descrição (mín. 10) e, em ação SLA de risco ALTO/CRÍTICO, evidência (anexo guardado);
--   - EM ANDAMENTO: providência obrigatória (a previsão vai no texto da providência, registrado na auditoria);
--   - ENVIAR PARA: destino ativo e não somente leitura; motivo (mín. 5) para quem não é ADMINISTRADOR;
--   - idempotência transacional por mensagem (email_reply_command_receipts): a mesma mensagem nunca grava duas vezes;
--   - ação SLA de origem SSMA ou vinculada a alerta de risco: recusada (têm canal próprio por e-mail).
--
-- NÃO muda: prazos, nível de escalonamento, destinatários das cadeias, evidências existentes, responsáveis (só o
-- ENVIAR PARA explícito, pela mesma regra do app). Resposta de lote contratual NUNCA conclui ação SLA (save_* não toca
-- sla_actions).
--
-- Auditoria do gatilho audit_sla_action_updated: com sessão (app) o ator continua auth.uid(); sem sessão (worker) o
-- ator passa a ser o remetente autenticado informado pelas variantes *_by_email (configuração local da transação
-- acc.email_actor), em vez de SYSTEM/assumido anterior.
-- ============================================================

-- ---------- 0) Recibo transacional por mensagem (idempotência) ----------
create table if not exists public.email_reply_command_receipts (
  provider_message_id text primary key check (char_length(provider_message_id) between 1 and 200),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('SLA_ACTION', 'WEEKLY_DIGEST_ITEM', 'CONTRACT_ALERT_ITEM')),
  subject_id text not null check (char_length(subject_id) between 1 and 200),
  actor_user_id uuid not null references public.profiles(id) on delete restrict,
  command text not null check (command in ('RESOLVIDO', 'EM_ANDAMENTO', 'ENVIAR_PARA')),
  applied_at timestamptz not null default now()
);
create index if not exists email_reply_command_receipts_subject_idx on public.email_reply_command_receipts(project_id, subject_kind, subject_id);

alter table public.email_reply_command_receipts enable row level security;
revoke all on table public.email_reply_command_receipts from public, anon, authenticated;
grant select on table public.email_reply_command_receipts to service_role;

-- Fila de confirmações ao remetente (só depois da gravação; recusas/pedidos de complemento também). Sem corpo do e-mail.
create table if not exists public.email_reply_confirmations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  inbound_provider_message_id text not null unique check (char_length(inbound_provider_message_id) between 1 and 200),
  subject_kind text not null check (subject_kind in ('SLA_ACTION', 'WEEKLY_DIGEST_ITEM', 'CONTRACT_ALERT_ITEM')),
  subject_id text not null check (char_length(subject_id) between 1 and 200),
  recipient_user_id uuid references public.profiles(id) on delete set null,
  recipient_email text not null check (char_length(recipient_email) between 3 and 320),
  in_reply_to text,
  references_header text,
  original_subject text,
  outcome text not null check (outcome in ('APPLIED', 'REJECTED', 'INCOMPLETE')),
  status_label text not null check (char_length(status_label) between 1 and 500),
  detail_line text,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  sent_at timestamptz,
  sent_provider_message_id text,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists email_reply_confirmations_pending_idx on public.email_reply_confirmations(status, created_at);

alter table public.email_reply_confirmations enable row level security;
revoke all on table public.email_reply_confirmations from public, anon, authenticated;
grant select, insert, update on table public.email_reply_confirmations to service_role;

-- Núcleo interno: grava o recibo da mensagem; repetida => MESSAGE_ALREADY_APPLIED (a transação inteira é desfeita).
create or replace function public.email_reply_claim_receipt(
  p_provider_message_id text,
  p_project_id uuid,
  p_subject_kind text,
  p_subject_id text,
  p_actor uuid,
  p_command text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then raise exception 'MESSAGE_ID_REQUIRED'; end if;
  insert into public.email_reply_command_receipts (provider_message_id, project_id, subject_kind, subject_id, actor_user_id, command)
  values (p_provider_message_id, p_project_id, p_subject_kind, p_subject_id, p_actor, p_command)
  on conflict (provider_message_id) do nothing;
  if not found then raise exception 'MESSAGE_ALREADY_APPLIED'; end if;
end;
$$;

-- Mensagem já aplicada? Verificado ANTES de qualquer outra regra: reprocessar a mesma mensagem sempre devolve
-- MESSAGE_ALREADY_APPLIED (e não, por exemplo, ACTION_CLOSED causado pela própria gravação anterior).
create or replace function public.email_reply_assert_new_message(p_provider_message_id text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then raise exception 'MESSAGE_ID_REQUIRED'; end if;
  if exists (select 1 from public.email_reply_command_receipts r where r.provider_message_id = p_provider_message_id) then
    raise exception 'MESSAGE_ALREADY_APPLIED';
  end if;
end;
$$;

-- Perfil ATIVO do ator na obra (null se não for membro ativo).
create or replace function public.email_reply_member_permission(p_project_id uuid, p_actor uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pm.permission from public.project_memberships pm
  where pm.project_id = p_project_id and pm.user_id = p_actor and pm.status = 'ACTIVE';
$$;

revoke all on function public.email_reply_claim_receipt(text, uuid, text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.email_reply_member_permission(uuid, uuid) from public, anon, authenticated;
revoke all on function public.email_reply_assert_new_message(text) from public, anon, authenticated;

-- ---------- 1) Auditoria do SLA: ator do e-mail quando não há sessão ----------
-- Corpo vigente (20261029110000) preservado; só o fallback acc.email_actor foi acrescentado antes dos anteriores.
create or replace function public.audit_sla_action_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_actor uuid := nullif(current_setting('acc.email_actor', true), '')::uuid;
  v_started_actor uuid := coalesce(auth.uid(), v_email_actor, new.acknowledged_by_user_id);
  v_reassign_actor uuid := coalesce(auth.uid(), v_email_actor);
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

-- ---------- 2) SLA: núcleos com ator explícito ----------
-- Corpos vigentes (20261120100000 + 20261120153000) preservados; auth.uid() virou p_actor.
create or replace function public.sla_action_authorize_operation_for(p_actor uuid, p_action_id uuid, p_operation text)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_actor;
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

create or replace function public.sla_action_authorize_operation(p_action_id uuid, p_operation text)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.sla_action_authorize_operation_for(v_user, p_action_id, p_operation);
end;
$$;

create or replace function public.sla_action_assume_core(p_actor uuid, p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  v_action := public.sla_action_authorize_operation_for(p_actor, p_action_id, 'ASSUME');
  if v_action.acknowledged_at is not null then raise exception 'ACTION_ALREADY_ACKNOWLEDGED'; end if;

  update public.sla_actions
  set acknowledged_at = now(), acknowledged_by_user_id = p_actor, status = 'ACKNOWLEDGED'
  where id = p_action_id
  returning * into v_action;
  return v_action;
end;
$$;

create or replace function public.sla_action_start_core(p_actor uuid, p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  v_action := public.sla_action_authorize_operation_for(p_actor, p_action_id, 'START');
  if v_action.status <> 'ACKNOWLEDGED' then raise exception 'ACTION_NOT_ACKNOWLEDGED'; end if;

  update public.sla_actions set status = 'IN_PROGRESS' where id = p_action_id returning * into v_action;
  return v_action;
end;
$$;

create or replace function public.sla_action_complete_core(
  p_actor uuid,
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
  v_action := public.sla_action_authorize_operation_for(p_actor, p_action_id, 'COMPLETE');
  if v_note is null then raise exception 'COMPLETION_NOTE_REQUIRED'; end if;

  if p_related_event_id is not null and not exists (
    select 1 from public.contract_events e where e.id = p_related_event_id and e.project_id = v_action.project_id
  ) then raise exception 'RELATED_EVENT_NOT_FOUND'; end if;

  -- O gatilho sla_action_ssma_guard recusa (SSMA_ACTION_COMPLETE_VIA_SSMA) quando a ação nasceu no SSMA.
  update public.sla_actions
  set completed_at = now(),
      completed_by_user_id = p_actor,
      completion_note = v_note,
      status = 'COMPLETED',
      related_event_id = coalesce(p_related_event_id, related_event_id),
      related_document_version_id = coalesce(p_related_document_version_id, related_document_version_id)
  where id = p_action_id
  returning * into v_action;
  return v_action;
end;
$$;

create or replace function public.sla_action_forward_core(
  p_actor uuid,
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
  v_user uuid := p_actor;
  v_action public.sla_actions%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_admin boolean;
  v_previous uuid;
begin
  v_action := public.sla_action_authorize_operation_for(p_actor, p_action_id, 'FORWARD');
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

-- Originais (app): mesmas assinaturas e comportamento — o ator é a sessão.
create or replace function public.sla_action_assume(p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.sla_action_assume_core(v_user, p_action_id);
end;
$$;

create or replace function public.sla_action_start(p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.sla_action_start_core(v_user, p_action_id);
end;
$$;

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
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.sla_action_complete_core(v_user, p_action_id, p_completion_note, p_related_event_id, p_related_document_version_id);
end;
$$;

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
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.sla_action_forward_core(v_user, p_action_id, p_new_responsible_user_id, p_reason);
end;
$$;

-- Exigências do CANAL e-mail para ação SLA (somam-se ao núcleo): membro ativo não somente leitura; ação sem canal
-- próprio (SSMA / alerta de risco têm atalhos por e-mail específicos).
create or replace function public.sla_action_email_precheck(p_actor uuid, p_action_id uuid)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
  v_permission text;
begin
  if p_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_action from public.sla_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  v_permission := public.email_reply_member_permission(v_action.project_id, p_actor);
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if v_permission in ('LEITURA', 'VIEWER') then raise exception 'READ_ONLY_PROFILE'; end if;
  if v_action.related_ssma_corrective_action_id is not null then raise exception 'SSMA_ACTION_USE_SSMA_CHANNEL'; end if;
  return v_action;
end;
$$;

-- EM ANDAMENTO por e-mail = assumir (se ainda não assumida) + estudando solução (ACKNOWLEDGED -> IN_PROGRESS), pelas
-- MESMAS regras do app; a providência (com a previsão informada) fica na auditoria. Ação já em andamento/vencida após
-- assumida: só registra a providência (o app também não muda o status nesses casos). Prazos e nível não mudam.
create or replace function public.sla_action_progress_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_note text,
  p_provider_message_id text
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.email_reply_assert_new_message(p_provider_message_id);
  v_action := public.sla_action_email_precheck(p_actor_user_id, p_action_id);
  if v_note is null then raise exception 'NOTE_REQUIRED'; end if;
  v_action := public.sla_action_authorize_operation_for(p_actor_user_id, p_action_id, 'START');
  perform public.email_reply_claim_receipt(p_provider_message_id, v_action.project_id, 'SLA_ACTION', p_action_id::text, p_actor_user_id, 'EM_ANDAMENTO');

  perform set_config('acc.email_actor', p_actor_user_id::text, true);
  if v_action.acknowledged_at is null then
    v_action := public.sla_action_assume_core(p_actor_user_id, p_action_id);
  end if;
  if v_action.status = 'ACKNOWLEDGED' then
    v_action := public.sla_action_start_core(p_actor_user_id, p_action_id);
  end if;
  perform set_config('acc.email_actor', '', true);

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_action.project_id, 'USER', p_actor_user_id, null, 'SLA_ACTION_PROGRESS_BY_EMAIL', 'SLA_ACTION', v_action.id::text,
    format('Em andamento informado por resposta de e-mail (mensagem %s). Providência: %s. Prazos e escalonamento preservados.',
      p_provider_message_id, left(v_note, 1500))
  );
  return v_action;
end;
$$;

-- RESOLVIDO por e-mail = concluir (núcleo do app) com descrição (mín. 10) e, em ALTO/CRÍTICO, evidência (anexo guardado).
create or replace function public.sla_action_complete_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_completion_note text,
  p_evidence text,
  p_provider_message_id text
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
  v_note text := nullif(btrim(coalesce(p_completion_note, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence, '')), '');
begin
  perform public.email_reply_assert_new_message(p_provider_message_id);
  v_action := public.sla_action_email_precheck(p_actor_user_id, p_action_id);
  v_action := public.sla_action_authorize_operation_for(p_actor_user_id, p_action_id, 'COMPLETE');
  if v_note is null or char_length(v_note) < 10 then raise exception 'COMPLETION_NOTE_REQUIRED'; end if;
  if v_action.risk_level in ('HIGH', 'CRITICAL') and v_evidence is null then raise exception 'EVIDENCE_REQUIRED'; end if;
  perform public.email_reply_claim_receipt(p_provider_message_id, v_action.project_id, 'SLA_ACTION', p_action_id::text, p_actor_user_id, 'RESOLVIDO');

  perform set_config('acc.email_actor', p_actor_user_id::text, true);
  v_action := public.sla_action_complete_core(
    p_actor_user_id, p_action_id,
    left('Resposta por e-mail: ' || v_note || coalesce(' | Evidência: ' || v_evidence, ''), 8000)
  );
  perform set_config('acc.email_actor', '', true);

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_action.project_id, 'USER', p_actor_user_id, null, 'SLA_ACTION_COMPLETED_BY_EMAIL', 'SLA_ACTION', v_action.id::text,
    format('Concluída por resposta de e-mail (mensagem %s).%s', p_provider_message_id,
      case when v_evidence is not null then format(' Evidência: %s', left(v_evidence, 1500)) else '' end)
  );
  return v_action;
end;
$$;

-- ENVIAR PARA por e-mail = encaminhar (núcleo do app: destino ativo não LEITURA, motivo >= 5 para não administrador).
create or replace function public.sla_action_forward_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text,
  p_provider_message_id text
)
returns public.sla_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.sla_actions%rowtype;
begin
  perform public.email_reply_assert_new_message(p_provider_message_id);
  v_action := public.sla_action_email_precheck(p_actor_user_id, p_action_id);
  perform public.email_reply_claim_receipt(p_provider_message_id, v_action.project_id, 'SLA_ACTION', p_action_id::text, p_actor_user_id, 'ENVIAR_PARA');
  perform set_config('acc.email_actor', p_actor_user_id::text, true);
  v_action := public.sla_action_forward_core(p_actor_user_id, p_action_id, p_new_responsible_user_id, p_reason);
  perform set_config('acc.email_actor', '', true);
  return v_action;
end;
$$;

revoke all on function public.sla_action_authorize_operation_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sla_action_authorize_operation(uuid, text) from public, anon, authenticated;
revoke all on function public.sla_action_assume_core(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sla_action_start_core(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sla_action_complete_core(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.sla_action_forward_core(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.sla_action_email_precheck(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sla_action_assume(uuid) from public, anon;
revoke all on function public.sla_action_start(uuid) from public, anon;
revoke all on function public.sla_action_complete(uuid, text, uuid, uuid) from public, anon;
revoke all on function public.sla_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.sla_action_assume(uuid) to authenticated;
grant execute on function public.sla_action_start(uuid) to authenticated;
grant execute on function public.sla_action_complete(uuid, text, uuid, uuid) to authenticated;
grant execute on function public.sla_action_forward(uuid, uuid, text) to authenticated;
revoke all on function public.sla_action_progress_by_email(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.sla_action_complete_by_email(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.sla_action_forward_by_email(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.sla_action_progress_by_email(uuid, uuid, text, text) to service_role;
grant execute on function public.sla_action_complete_by_email(uuid, uuid, text, text, text) to service_role;
grant execute on function public.sla_action_forward_by_email(uuid, uuid, uuid, text, text) to service_role;

-- ---------- 3) Resumo semanal: item com ator explícito ----------
-- Corpo POR ITEM da definição vigente (20261120150000) preservado: recusas de SSMA/risco, "continua responsável",
-- RESOLVIDO com descrição >= 10 (e evidência em ALTO/CRÍTICO), DIRECIONAR com motivo/destino, gravações e auditoria.
create or replace function public.weekly_alert_digest_apply_item_core(
  p_actor uuid,
  p_is_admin boolean,
  p_project_id uuid,
  p_item_id uuid,
  p_action_id uuid,
  p_response text,
  p_directed_to uuid,
  p_note text,
  p_evidence text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := p_actor;
  v_is_admin boolean := coalesce(p_is_admin, false);
  v_response text := p_response;
  v_directed_to uuid := p_directed_to;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence, '')), '');
  v_action public.sla_actions%rowtype;
begin
  if v_actor_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  select * into v_action from public.sla_actions where id = p_action_id;

  if v_action.related_ssma_corrective_action_id is not null then
    raise exception 'O item "%" é uma ação corretiva SSMA: registre o tratamento no app SSMA (com a evidência).', v_action.title;
  end if;
  if exists (select 1 from public.risk_alert_cases c where c.sla_action_id = p_action_id) then
    raise exception 'O item "%" pertence a um alerta de risco: registre o tratamento pela página do alerta.', v_action.title;
  end if;

  if v_action.status not in ('COMPLETED', 'CANCELLED') and v_action.responsible_user_id is distinct from v_actor_id and not v_is_admin then
    raise exception 'O item "%" agora está sob responsabilidade de outra pessoa; a resposta não foi registrada.', v_action.title;
  end if;

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
      where pm.project_id = p_project_id
        and pm.user_id = v_directed_to
        and coalesce(pm.status, 'ACTIVE') = 'ACTIVE'
        and pm.permission not in ('LEITURA', 'VIEWER')
    ) then
      raise exception 'Selecione um usuário ativo (que não seja somente leitura) para cada item direcionado.';
    end if;

    update public.sla_actions
    set responsible_user_id = v_directed_to
    where id = p_action_id
      and status not in ('COMPLETED', 'CANCELLED');
  elsif v_response = 'RESOLVED' then
    update public.sla_actions
    set status = 'COMPLETED',
        completed_at = now(),
        completed_by_user_id = v_actor_id,
        completion_note = left('Resumo semanal: ' || v_note || coalesce(' | Evidência: ' || v_evidence, ''), 8000)
    where id = p_action_id
      and status not in ('COMPLETED', 'CANCELLED');
  elsif v_response = 'STUDYING' then
    update public.sla_actions
    set status = 'IN_PROGRESS',
        acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor_id)
    where id = p_action_id
      and status not in ('COMPLETED', 'CANCELLED');
  elsif v_response = 'AWARE' then
    update public.sla_actions
    set status = case when status = 'PENDING' then 'ACKNOWLEDGED' else status end,
        acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, v_actor_id)
    where id = p_action_id
      and status not in ('COMPLETED', 'CANCELLED');
  end if;

  update public.weekly_alert_digest_items
  set response = v_response,
      directed_to_user_id = case when v_response = 'FORWARDED' then v_directed_to else null end,
      responded_at = now(),
      responded_by_user_id = v_actor_id
  where id = p_item_id;

  insert into public.audit_log_entries (
    project_id, actor_type, actor_user_id, actor_label,
    action, entity_type, entity_id, detail
  ) values (
    p_project_id, 'USER', v_actor_id, null,
    'WEEKLY_ALERT_ITEM_RESPONDED', 'SLA_ACTION', p_action_id::text,
    format(
      'Item do resumo semanal respondido: %s%s%s%s. Prazos e escalonamento preservados.',
      v_response,
      case when v_directed_to is not null then format(' para %s', v_directed_to) else '' end,
      case when v_note is not null then format('. Nota: %s', left(v_note, 500)) else '' end,
      case when v_evidence is not null then format('. Evidência: %s', left(v_evidence, 300)) else '' end
    )
  );
end;
$$;

-- Envio integral pela web: mesma assinatura, mesmas validações e mensagens. Única diferença possível: item que JÁ foi
-- respondido individualmente por e-mail é preservado (não é regravado); sem respostas por item o fluxo é idêntico.
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
  v_is_admin boolean;
  v_kept integer := 0;
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
    if v_item.responded_at is not null then
      v_kept := v_kept + 1;
      continue;
    end if;

    select value into v_payload
    from jsonb_array_elements(p_responses)
    where value ->> 'actionId' = v_item.action_id::text;

    perform public.weekly_alert_digest_apply_item_core(
      v_actor_id, v_is_admin, v_digest.project_id, v_item.id, v_item.action_id,
      v_payload ->> 'resolution',
      nullif(v_payload ->> 'directedToUserId', '')::uuid,
      v_payload ->> 'note',
      v_payload ->> 'evidence'
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
      || case when v_kept > 0 then format(' %s item(ns) já respondido(s) por e-mail foram preservados.', v_kept) else '' end
  );

  return jsonb_build_object('digestId', p_digest_id, 'respondedItems', v_expected_count);
end;
$$;

-- Por e-mail: UM item do resumo (token por item). Mesmo núcleo do envio integral; o resumo fica RESPONDED quando o
-- último item é respondido. Comandos: RESOLVED (RESOLVIDO), STUDYING (EM ANDAMENTO), FORWARDED (ENVIAR PARA).
create or replace function public.submit_weekly_alert_digest_item_by_email(
  p_actor_user_id uuid,
  p_digest_item_id uuid,
  p_response text,
  p_directed_to_user_id uuid,
  p_note text,
  p_evidence text,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := p_actor_user_id;
  v_digest public.weekly_alert_digests%rowtype;
  v_item public.weekly_alert_digest_items%rowtype;
  v_permission text;
  v_is_admin boolean;
  v_total integer;
  v_answered integer;
  v_command text;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.email_reply_assert_new_message(p_provider_message_id);
  if coalesce(p_response, '') not in ('STUDYING', 'RESOLVED', 'FORWARDED') then raise exception 'Existe uma resposta inválida no resumo.'; end if;

  select d.* into v_digest
  from public.weekly_alert_digests d
  join public.weekly_alert_digest_items i on i.digest_id = d.id
  where i.id = p_digest_item_id
  for update of d;
  if not found then raise exception 'Resumo semanal não encontrado.'; end if;

  v_permission := public.email_reply_member_permission(v_digest.project_id, v_actor);
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if v_permission in ('LEITURA', 'VIEWER') then raise exception 'READ_ONLY_PROFILE'; end if;

  v_is_admin := coalesce(public.project_permission_for(v_digest.project_id, v_actor, 'ADMIN'), false);
  if v_digest.recipient_user_id <> v_actor and not v_is_admin then
    raise exception 'Você não tem permissão para responder este resumo.';
  end if;
  if v_digest.status = 'RESPONDED' then raise exception 'Este resumo semanal já foi respondido.'; end if;
  if v_digest.status <> 'SENT' then raise exception 'Este resumo ainda não está disponível para resposta.'; end if;

  select i.* into v_item
  from public.weekly_alert_digest_items i
  join public.sla_actions a on a.id = i.action_id
  where i.id = p_digest_item_id
  for update of i, a;
  if v_item.responded_at is not null then raise exception 'ITEM_ALREADY_RESPONDED'; end if;
  if p_response = 'STUDYING' and nullif(btrim(coalesce(p_note, '')), '') is null then raise exception 'NOTE_REQUIRED'; end if;

  v_command := case p_response when 'RESOLVED' then 'RESOLVIDO' when 'STUDYING' then 'EM_ANDAMENTO' else 'ENVIAR_PARA' end;
  perform public.email_reply_claim_receipt(p_provider_message_id, v_digest.project_id, 'WEEKLY_DIGEST_ITEM', p_digest_item_id::text, v_actor, v_command);

  perform set_config('acc.email_actor', v_actor::text, true);
  perform public.weekly_alert_digest_apply_item_core(
    v_actor, v_is_admin, v_digest.project_id, v_item.id, v_item.action_id, p_response, p_directed_to_user_id, p_note, p_evidence
  );
  perform set_config('acc.email_actor', '', true);

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_digest.project_id, 'USER', v_actor, null, 'WEEKLY_ALERT_ITEM_RESPONDED_BY_EMAIL', 'SLA_ACTION', v_item.action_id::text,
    format('Item do resumo semanal %s respondido por e-mail (mensagem %s): %s.', v_digest.id, p_provider_message_id, p_response)
  );

  select count(*), count(responded_at) into v_total, v_answered
  from public.weekly_alert_digest_items where digest_id = v_digest.id;

  if v_total > 0 and v_answered = v_total then
    update public.weekly_alert_digests
    set status = 'RESPONDED', responded_at = now(), responded_by_user_id = v_actor
    where id = v_digest.id;
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
    values (
      v_digest.project_id, 'USER', v_actor, null, 'WEEKLY_ALERT_DIGEST_RESPONDED', 'WEEKLY_ALERT_DIGEST', v_digest.id::text,
      format('Resumo semanal respondido integralmente item a item (último por e-mail): %s item(ns).', v_total)
    );
  end if;

  return jsonb_build_object('digestId', v_digest.id, 'itemId', p_digest_item_id, 'answered', v_answered, 'total', v_total, 'complete', v_answered = v_total);
end;
$$;

revoke all on function public.weekly_alert_digest_apply_item_core(uuid, boolean, uuid, uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.submit_weekly_alert_digest(uuid, jsonb) from public, anon;
grant execute on function public.submit_weekly_alert_digest(uuid, jsonb) to authenticated;
revoke all on function public.submit_weekly_alert_digest_item_by_email(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_weekly_alert_digest_item_by_email(uuid, uuid, text, uuid, text, text, text) to service_role;

-- ---------- 4) Alerta de contrato (individual = lote de um item; lote): resposta por item com ator explícito ----------
-- Corpo vigente (20261027140000) preservado; auth.uid() virou p_actor e o "ADMINISTRADOR" usa a réplica com ator.
create or replace function public.save_contract_alert_batch_item_response_core(
  p_actor uuid,
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
  v_actor_id uuid := p_actor;
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
     and not coalesce(public.project_permission_for(v_batch.project_id, v_actor_id, 'ADMINISTRADOR'), false) then
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
begin
  if v_actor_id is null then
    raise exception 'Sessão expirada. Faça login novamente.';
  end if;
  return public.save_contract_alert_batch_item_response_core(v_actor_id, p_batch_id, p_event_id, p_action, p_assigned_user_id);
end;
$$;

-- Por e-mail: UM item (token por item = contract_alert_batch_items.id). Exigências do canal: membro ativo não LEITURA;
-- RESOLVIDO com descrição (mín. 10); EM ANDAMENTO com providência; ENVIAR PARA com destino ativo não LEITURA e motivo
-- (mín. 5) para quem não é ADMINISTRADOR. A resposta final do lote (RESPONDER AO ACC) continua pela página do ACC.
-- Nunca conclui ação SLA (save_* não toca sla_actions).
create or replace function public.save_contract_alert_batch_item_response_by_email(
  p_actor_user_id uuid,
  p_batch_item_id uuid,
  p_action text,
  p_assigned_user_id uuid,
  p_note text,
  p_evidence text,
  p_provider_message_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := p_actor_user_id;
  v_item public.contract_alert_batch_items%rowtype;
  v_project uuid;
  v_permission text;
  v_is_admin boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence, '')), '');
  v_result jsonb;
begin
  if v_actor is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.email_reply_assert_new_message(p_provider_message_id);
  if coalesce(p_action, '') not in ('RESOLVIDO', 'EM_ANDAMENTO', 'ENVIADO_PARA') then raise exception 'Ação inválida.'; end if;

  select * into v_item from public.contract_alert_batch_items where id = p_batch_item_id;
  if not found then raise exception 'O alerta não pertence a este lote.'; end if;
  select b.project_id into v_project from public.contract_alert_batches b where b.id = v_item.batch_id;

  v_permission := public.email_reply_member_permission(v_project, v_actor);
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if v_permission in ('LEITURA', 'VIEWER') then raise exception 'READ_ONLY_PROFILE'; end if;
  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');

  if p_action = 'RESOLVIDO' and (v_note is null or char_length(v_note) < 10) then raise exception 'COMPLETION_NOTE_REQUIRED'; end if;
  if p_action = 'EM_ANDAMENTO' and v_note is null then raise exception 'NOTE_REQUIRED'; end if;
  if p_action = 'ENVIADO_PARA' then
    if p_assigned_user_id is null or not exists (
      select 1 from public.project_memberships pm
      where pm.project_id = v_project and pm.user_id = p_assigned_user_id and pm.status = 'ACTIVE'
        and pm.permission not in ('LEITURA', 'VIEWER')
    ) then raise exception 'NEW_RESPONSIBLE_NOT_ELIGIBLE'; end if;
    if not v_is_admin and (v_note is null or char_length(v_note) < 5) then raise exception 'FORWARD_REASON_REQUIRED'; end if;
  end if;

  perform public.email_reply_claim_receipt(p_provider_message_id, v_project, 'CONTRACT_ALERT_ITEM', p_batch_item_id::text, v_actor,
    case p_action when 'ENVIADO_PARA' then 'ENVIAR_PARA' else p_action end);

  v_result := public.save_contract_alert_batch_item_response_core(v_actor, v_item.batch_id, v_item.event_id, p_action, p_assigned_user_id);

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_project, 'USER', v_actor, null, 'CONTRACT_ALERT_ITEM_RESPONDED_BY_EMAIL', 'CONTRACT_EVENT', v_item.event_id::text,
    format('Alerta de contrato respondido por e-mail no lote %s (mensagem %s): %s.%s%s', v_item.batch_id, p_provider_message_id, p_action,
      case when v_note is not null then format(' Nota: %s.', left(v_note, 1500)) else '' end,
      case when v_evidence is not null then format(' Evidência: %s', left(v_evidence, 1500)) else '' end)
  );
  return v_result;
end;
$$;

revoke all on function public.save_contract_alert_batch_item_response_core(uuid, uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.save_contract_alert_batch_item_response(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.save_contract_alert_batch_item_response(uuid, uuid, text, uuid) to authenticated;
revoke all on function public.save_contract_alert_batch_item_response_by_email(uuid, uuid, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.save_contract_alert_batch_item_response_by_email(uuid, uuid, text, uuid, text, text, text) to service_role;
