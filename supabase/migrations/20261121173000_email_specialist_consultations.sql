-- ============================================================
-- 20261121170000_email_specialist_consultations.sql
--
-- Lote 3 — ESPECIALISTA por resposta de e-mail ("ESPECIALISTA: <pergunta>").
--
-- A consulta é ESCRITA, roteada ao Expert da ÁREA do item (nunca à AXIA), e NÃO altera o item de origem: esta migration
-- só CRIA uma fila própria (email_specialist_consultations) e duas RPCs service_role. Nenhuma função existente é
-- redefinida (record_risk_alert_action — hotfix P0 md5 930f6d75898793479b418950b0053bd9 — e as *_by_email permanecem
-- exatamente como estão). Não toca sla_actions, risk_alert_cases, tokens, prazos, responsáveis nem permissões.
--
-- Garantias:
--   - idempotência por mensagem (provider_message_id único): a mesma mensagem nunca gera duas consultas;
--   - o ator (remetente já autenticado pelo worker) precisa ser membro ATIVO da obra e NÃO ser LEITURA (revalidado aqui);
--   - a pergunta fica só nesta tabela (nunca em log/auditoria); a auditoria guarda ids, Expert e área;
--   - a resposta do Expert é SEMPRE uma recomendação com revisão humana (requires_human_review obrigatório em ALTO/CRÍTICO);
--   - o limite diário de IA é reservado pelo próprio consultor (ai_consult_reserve_for_actor, tipo RISK_CYCLE) na fronteira do
--     provedor; sem reserva a IA não é chamada e a consulta fica QUOTA_BLOCKED.
-- Idempotente (if not exists / create or replace). Sem EXECUTE para anon/authenticated.
-- ============================================================

create table if not exists public.email_specialist_consultations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider_message_id text not null unique check (char_length(provider_message_id) between 1 and 200),
  flow text not null check (flow in ('RISK', 'SSMA', 'TOKEN')),
  subject_kind text not null check (subject_kind in ('RISK_CASE', 'SSMA_ACTION', 'SLA_ACTION', 'WEEKLY_DIGEST_ITEM', 'CONTRACT_ALERT_ITEM')),
  subject_id text not null check (char_length(subject_id) between 1 and 200),
  requested_by_user_id uuid not null references public.profiles(id) on delete restrict,
  area text,
  severity text check (severity is null or severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  expert_id text not null check (expert_id in ('commercial-director', 'esg-director', 'legal-consultant', 'planning-director', 'engineering-director', 'ceo')),
  routing_source text not null check (routing_source in ('AREA', 'TOPIC', 'MULTI_TOPIC')),
  question text not null check (char_length(question) between 10 and 1500),
  requires_human_review boolean not null default true,
  status text not null default 'RECEIVED' check (status in ('RECEIVED', 'ANSWERED', 'QUOTA_BLOCKED', 'FAILED')),
  answer_attempts integer not null default 0 check (answer_attempts >= 0),
  answer_text text,
  answer_confidence numeric check (answer_confidence is null or (answer_confidence >= 0 and answer_confidence <= 1)),
  answered_at timestamptz,
  recipient_email text not null check (char_length(recipient_email) between 3 and 320),
  in_reply_to text,
  references_header text,
  original_subject text,
  -- Mensagens de saída ao remetente: recibo ("pergunta registrada") e resposta do Expert.
  receipt_status text not null default 'PENDING' check (receipt_status in ('PENDING', 'SENT', 'FAILED')),
  receipt_attempts integer not null default 0 check (receipt_attempts >= 0),
  receipt_sent_at timestamptz,
  answer_mail_status text not null default 'NONE' check (answer_mail_status in ('NONE', 'PENDING', 'SENT', 'FAILED')),
  answer_mail_attempts integer not null default 0 check (answer_mail_attempts >= 0),
  answer_mail_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requires_human_review or severity is null or severity in ('LOW', 'MEDIUM'))
);
create index if not exists email_specialist_consultations_status_idx on public.email_specialist_consultations(status, created_at);
create index if not exists email_specialist_consultations_subject_idx on public.email_specialist_consultations(project_id, subject_kind, subject_id);

alter table public.email_specialist_consultations enable row level security;
revoke all on table public.email_specialist_consultations from public, anon, authenticated;
grant select, insert, update on table public.email_specialist_consultations to service_role;

-- Registra a consulta. Ator = remetente autenticado pelo worker (service_role). NÃO altera nenhum outro registro.
create or replace function public.email_specialist_consult_record(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_flow text,
  p_subject_kind text,
  p_subject_id text,
  p_provider_message_id text,
  p_area text,
  p_severity text,
  p_expert_id text,
  p_routing_source text,
  p_question text,
  p_requires_human_review boolean,
  p_recipient_email text,
  p_in_reply_to text,
  p_references text,
  p_original_subject text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permission text;
  v_id uuid;
  v_question text := btrim(coalesce(p_question, ''));
  v_review boolean := coalesce(p_requires_human_review, true);
begin
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if nullif(btrim(coalesce(p_provider_message_id, '')), '') is null then raise exception 'MESSAGE_ID_REQUIRED'; end if;
  v_permission := public.email_reply_member_permission(p_project_id, p_actor_user_id);
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if upper(v_permission) in ('LEITURA', 'VIEWER') then raise exception 'READ_ONLY_PROFILE'; end if;
  if char_length(v_question) < 10 then raise exception 'QUESTION_REQUIRED'; end if;
  -- ALTO/CRÍTICO: revisão humana sempre obrigatória (não é configurável pelo chamador).
  if upper(coalesce(p_severity, '')) in ('HIGH', 'CRITICAL') then v_review := true; end if;

  insert into public.email_specialist_consultations (
    project_id, provider_message_id, flow, subject_kind, subject_id, requested_by_user_id, area, severity, expert_id,
    routing_source, question, requires_human_review, recipient_email, in_reply_to, references_header, original_subject
  )
  values (
    p_project_id, p_provider_message_id, p_flow, p_subject_kind, p_subject_id, p_actor_user_id, nullif(btrim(coalesce(p_area, '')), ''),
    nullif(upper(btrim(coalesce(p_severity, ''))), ''), p_expert_id, p_routing_source, left(v_question, 1500), v_review,
    lower(left(btrim(p_recipient_email), 320)), p_in_reply_to, p_references, left(p_original_subject, 300)
  )
  on conflict (provider_message_id) do nothing
  returning id into v_id;
  if v_id is null then raise exception 'MESSAGE_ALREADY_APPLIED'; end if;

  -- Auditoria SEM o texto da pergunta (só ids, Expert, área e canal).
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    p_project_id, 'USER', p_actor_user_id, null, 'EMAIL_SPECIALIST_CONSULT_REQUESTED', 'EMAIL_SPECIALIST_CONSULTATION', v_id::text,
    format('Consulta ao especialista %s por resposta de e-mail (canal %s, item %s %s, área %s, mensagem %s). O item não foi alterado; resposta é só recomendação com revisão humana.',
      p_expert_id, p_flow, p_subject_kind, p_subject_id, coalesce(nullif(btrim(coalesce(p_area, '')), ''), 'não definida'), p_provider_message_id)
  );
  return v_id;
end;
$$;

-- Conclui a consulta (resposta do Expert ou bloqueio por limite/falha). Auditoria sem o texto da resposta.
create or replace function public.email_specialist_consult_complete(
  p_consultation_id uuid,
  p_status text,
  p_answer_text text,
  p_answer_confidence numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.email_specialist_consultations%rowtype;
begin
  if p_status is null or p_status not in ('ANSWERED', 'QUOTA_BLOCKED', 'FAILED') then raise exception 'INVALID_STATUS'; end if;
  select * into v_row from public.email_specialist_consultations where id = p_consultation_id for update;
  if not found then raise exception 'CONSULTATION_NOT_FOUND'; end if;
  if v_row.status <> 'RECEIVED' then raise exception 'CONSULTATION_ALREADY_CLOSED'; end if;
  if p_status = 'ANSWERED' and nullif(btrim(coalesce(p_answer_text, '')), '') is null then raise exception 'ANSWER_REQUIRED'; end if;

  update public.email_specialist_consultations
     set status = p_status,
         answer_text = case when p_status = 'ANSWERED' then left(p_answer_text, 8000) else null end,
         answer_confidence = case when p_status = 'ANSWERED' then p_answer_confidence else null end,
         answered_at = case when p_status = 'ANSWERED' then now() else null end,
         answer_mail_status = 'PENDING',
         updated_at = now()
   where id = p_consultation_id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (
    v_row.project_id, 'SYSTEM', null, null, 'EMAIL_SPECIALIST_CONSULT_' || p_status, 'EMAIL_SPECIALIST_CONSULTATION', p_consultation_id::text,
    format('Consulta por e-mail ao especialista %s concluída com status %s (revisão humana %s). O item de origem permaneceu inalterado.',
      v_row.expert_id, p_status, case when v_row.requires_human_review then 'obrigatória' else 'recomendada' end)
  );
end;
$$;

revoke all on function public.email_specialist_consult_record(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text, text) from public, anon, authenticated;
revoke all on function public.email_specialist_consult_complete(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.email_specialist_consult_record(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text, text) to service_role;
grant execute on function public.email_specialist_consult_complete(uuid, text, text, numeric) to service_role;
