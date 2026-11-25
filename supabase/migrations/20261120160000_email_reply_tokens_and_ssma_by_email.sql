-- ============================================================
-- 20261120160000_email_reply_tokens_and_ssma_by_email.sql
--
-- P2 — operação dos alertas pelo próprio e-mail (RESOLVIDO / EM ANDAMENTO / ENVIAR PARA).
--
-- 1) email_reply_tokens: token de resposta POR ITEM (um por alerta × destinatário). Só o sha256 do token é gravado,
--    SEMPRE antes do envio. Tipos já previstos: RISK_CASE, SSMA_ACTION (com processamento), SLA_ACTION,
--    WEEKLY_DIGEST_ITEM, CONTRACT_ALERT_ITEM, VERSION_REVIEW (infraestrutura pronta, SEM processamento por e-mail —
--    esses e-mails não recebem atalho mailto). Sem acesso de usuários (RLS sem políticas): só o worker (service_role).
-- 2) email_inbound_attachments: anexos de respostas por e-mail guardados como evidência (sha256 + caminho no Storage).
-- 3) email_reply_inbound_log: uma linha por mensagem processada/rejeitada (idempotência por fluxo × id do provedor,
--    limite de taxa por remetente e auditoria). Sem corpo do e-mail.
-- 4) SSMA por e-mail pela MESMA regra das RPCs do app: as funções originais passam a delegar a uma função interna
--    que recebe o ator (comportamento das originais inalterado — continuam exigindo auth.uid()); as variantes
--    *_by_email recebem o ator já autenticado pelo worker e só podem ser chamadas pelo service_role.
-- Prazos, níveis de escalonamento e destinatários das cadeias NÃO mudam.
-- ============================================================

-- ---------- 1) email_reply_tokens ----------
create table if not exists public.email_reply_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  project_id uuid not null references public.projects(id) on delete cascade,
  subject_kind text not null check (subject_kind in ('RISK_CASE', 'SSMA_ACTION', 'SLA_ACTION', 'WEEKLY_DIGEST_ITEM', 'CONTRACT_ALERT_ITEM', 'VERSION_REVIEW')),
  subject_id text not null check (char_length(subject_id) between 1 and 200),
  recipient_user_id uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_by_message_id text,
  consumed_at timestamptz,
  check (expires_at > issued_at),
  check ((consumed_by_message_id is null) = (consumed_at is null))
);
create index if not exists email_reply_tokens_subject_idx on public.email_reply_tokens(project_id, subject_kind, subject_id);

alter table public.email_reply_tokens enable row level security;
revoke all on table public.email_reply_tokens from public, anon, authenticated;
grant select, insert, update on table public.email_reply_tokens to service_role;

-- ---------- 2) email_inbound_attachments ----------
create table if not exists public.email_inbound_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 200),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 3 and 120),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 26214400),
  storage_bucket text not null default 'project-documents' check (storage_bucket = 'project-documents'),
  storage_path text not null,
  created_at timestamptz not null default now(),
  unique (provider_message_id, sha256)
);
create index if not exists email_inbound_attachments_project_idx on public.email_inbound_attachments(project_id, created_at);

alter table public.email_inbound_attachments enable row level security;
revoke all on table public.email_inbound_attachments from public, anon, authenticated;
grant select, insert on table public.email_inbound_attachments to service_role;

-- ---------- 3) email_reply_inbound_log ----------
create table if not exists public.email_reply_inbound_log (
  id uuid primary key default gen_random_uuid(),
  flow text not null check (flow in ('RISK', 'SSMA', 'TOKEN')),
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 200),
  project_id uuid references public.projects(id) on delete cascade,
  sender_email text not null check (char_length(sender_email) between 3 and 320),
  subject_kind text,
  subject_id text,
  outcome text not null check (outcome in ('APPLIED', 'REJECTED', 'UNAUTHORIZED', 'IGNORED', 'REVIEW', 'RATE_LIMITED')),
  reason text,
  received_at timestamptz not null,
  processed_at timestamptz not null default now(),
  unique (flow, provider_message_id)
);
create index if not exists email_reply_inbound_log_sender_idx on public.email_reply_inbound_log(sender_email, received_at);

alter table public.email_reply_inbound_log enable row level security;
revoke all on table public.email_reply_inbound_log from public, anon, authenticated;
grant select, insert on table public.email_reply_inbound_log to service_role;

-- ---------- 4) Permissão por ator explícito (réplica fiel de is_project_member / has_project_permission) ----------
-- is_project_member/has_project_permission usam auth.uid(); estas recebem o usuário. Mesma tabela de pesos
-- (20260829200000): só ADMINISTRADOR/ADMIN satisfazem GESTOR/GERENTE/COLABORADOR/EDITOR/ADMINISTRADOR.
create or replace function public.project_member_active_for(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p_project_id and pm.user_id = p_user_id and pm.status = 'ACTIVE'
  );
$$;

create or replace function public.project_permission_for(p_project_id uuid, p_user_id uuid, p_min text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.status = 'ACTIVE'
      and (
        case pm.permission
          when 'ADMINISTRADOR' then 3
          when 'GESTOR' then 1
          when 'GERENTE' then 1
          when 'COLABORADOR' then 1
          when 'LEITURA' then 1
          when 'ADMIN' then 3
          when 'EDITOR' then 1
          when 'VIEWER' then 1
          else 0
        end
      ) >= (
        case p_min
          when 'ADMINISTRADOR' then 3
          when 'ADMIN' then 3
          when 'GESTOR' then 2
          when 'GERENTE' then 2
          when 'COLABORADOR' then 2
          when 'EDITOR' then 2
          when 'LEITURA' then 1
          when 'VIEWER' then 1
          else 999
        end
      )
  );
$$;

revoke all on function public.project_member_active_for(uuid, uuid) from public, anon, authenticated;
revoke all on function public.project_permission_for(uuid, uuid, text) from public, anon, authenticated;

-- ---------- 5) Andamento / conclusão: núcleo com ator explícito ----------
-- Corpo da definição vigente (20261111042824) preservado; só auth.uid() virou p_actor e as duas verificações de
-- permissão usam as réplicas com o mesmo ator.
create or replace function public.ssma_corrective_action_update_core(
  p_actor uuid,
  p_action_id uuid,
  p_event text,
  p_note text default null,
  p_evidence_photo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_actor;
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_is_manager boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(p_event, '') not in ('ANDAMENTO', 'CONCLUIDA') then raise exception 'INVALID_EVENT'; end if;

  -- Ordem de bloqueio: ação SLA primeiro, depois a ação SSMA (a mesma do trigger do SLA).
  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if not public.project_member_active_for(v_action.project_id, v_user) then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  v_is_manager := coalesce(public.project_permission_for(v_action.project_id, v_user, 'GESTOR'), false);
  if not (v_is_manager or coalesce(v_action.responsible_user_id = v_user, false)) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  perform set_config('acc.ssma_sync', 'on', true);

  if p_event = 'ANDAMENTO' then
    if v_note is null then raise exception 'NOTE_REQUIRED'; end if;
    update public.ssma_corrective_actions set status = 'EM_ANDAMENTO' where id = p_action_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (p_action_id, v_action.project_id, 'ANDAMENTO', v_note, v_user);
    if v_sla_id is not null then
      update public.sla_actions
      set status = case when status in ('PENDING', 'ACKNOWLEDGED', 'OVERDUE', 'ESCALATED') then 'IN_PROGRESS' else status end,
          acknowledged_at = coalesce(acknowledged_at, now()),
          acknowledged_by_user_id = coalesce(acknowledged_by_user_id, (
            select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user))
      where id = v_sla_id and status <> 'COMPLETED' and status <> 'CANCELLED';
    end if;
    perform set_config('acc.ssma_sync', 'off', true);
    return;
  end if;

  if p_evidence_photo_id is not null then
    if not exists (
      select 1 from public.ssma_field_record_photos p
      where p.id = p_evidence_photo_id and p.record_id = v_action.record_id and p.purpose = 'EVIDENCIA_ACAO'
    ) then raise exception 'EVIDENCE_NOT_FOUND'; end if;
  elsif not v_is_manager then
    raise exception 'EVIDENCE_REQUIRED';
  elsif v_note is null or char_length(v_note) < 10 then
    raise exception 'JUSTIFICATION_REQUIRED';
  end if;

  update public.ssma_corrective_actions
  set status = 'CONCLUIDA', concluded_at = now(), concluded_by_user_id = v_user
  where id = p_action_id;
  insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, evidence_photo_id, actor_user_id)
  values (p_action_id, v_action.project_id, 'CONCLUIDA', v_note, p_evidence_photo_id, v_user);

  if v_sla_id is not null then
    update public.sla_actions
    set status = 'COMPLETED',
        completed_at = now(),
        completed_by_user_id = (select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user),
        completion_note = coalesce(v_note, 'Concluída com foto de evidência (registro SSMA).'),
        acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, (
          select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user))
    where id = v_sla_id and status <> 'COMPLETED' and status <> 'CANCELLED'
      and exists (select 1 from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user);
  end if;
  perform set_config('acc.ssma_sync', 'off', true);
end;
$$;

-- Original (app): mesma assinatura, mesmo comportamento — o ator é a sessão.
create or replace function public.ssma_corrective_action_update(
  p_action_id uuid,
  p_event text,
  p_note text default null,
  p_evidence_photo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.ssma_corrective_action_update_core(v_user, p_action_id, p_event, p_note, p_evidence_photo_id);
end;
$$;

-- Por e-mail: o worker (service_role) já autenticou o remetente (domínio corporativo, perfil com o e-mail exato do
-- From, vínculo ACTIVE, DMARC/DKIM alinhado) e informa o ator. Mesma regra de autorização/validação do app.
create or replace function public.ssma_corrective_action_update_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_event text,
  p_note text default null,
  p_evidence_photo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  perform public.ssma_corrective_action_update_core(p_actor_user_id, p_action_id, p_event, p_note, p_evidence_photo_id);
end;
$$;

revoke all on function public.ssma_corrective_action_update_core(uuid, uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ssma_corrective_action_update(uuid, text, text, uuid) from public, anon;
grant execute on function public.ssma_corrective_action_update(uuid, text, text, uuid) to authenticated;
revoke all on function public.ssma_corrective_action_update_by_email(uuid, uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.ssma_corrective_action_update_by_email(uuid, uuid, text, text, uuid) to service_role;

-- ---------- 6) Encaminhar: núcleo com ator explícito ----------
-- Corpo vigente (20261120120000) preservado. Única adição: com vínculo SLA, o evento REATRIBUIDA é gravado pelo
-- gatilho sla_action_ssma_guard SÓ quando há sessão (auth.uid()); sem sessão (chamada por e-mail, service_role) o
-- núcleo grava o MESMO evento com o ator informado, para o histórico ficar igual nos dois canais.
create or replace function public.ssma_corrective_action_forward_core(
  p_actor uuid,
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.ssma_corrective_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_actor;
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_permission text;
  v_is_admin boolean;
  v_previous uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;

  select pm.permission into v_permission
  from public.project_memberships pm
  where pm.project_id = v_action.project_id and pm.user_id = v_user and pm.status = 'ACTIVE';
  if v_permission is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  v_is_admin := v_permission in ('ADMINISTRADOR', 'ADMIN');
  if not (v_is_admin or (v_action.responsible_user_id = v_user and v_permission not in ('LEITURA', 'VIEWER'))) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  v_previous := v_action.responsible_user_id;
  if p_new_responsible_user_id is null then raise exception 'NEW_RESPONSIBLE_REQUIRED'; end if;
  if p_new_responsible_user_id = v_previous then raise exception 'SAME_RESPONSIBLE'; end if;
  if not exists (
    select 1 from public.project_memberships pm
    where pm.project_id = v_action.project_id and pm.user_id = p_new_responsible_user_id
      and pm.status = 'ACTIVE' and pm.permission not in ('LEITURA', 'VIEWER')
  ) then raise exception 'NEW_RESPONSIBLE_NOT_ELIGIBLE'; end if;
  if not v_is_admin and (v_reason is null or char_length(v_reason) < 5) then raise exception 'FORWARD_REASON_REQUIRED'; end if;

  if v_sla_id is not null then
    update public.sla_actions set responsible_user_id = p_new_responsible_user_id where id = v_sla_id;
    if auth.uid() is null then
      insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
      values (v_action.id, v_action.project_id, 'REATRIBUIDA', 'Responsável alterado pelo módulo Ações e Escalonamentos.', v_user);
    end if;
  else
    update public.ssma_corrective_actions set responsible_user_id = p_new_responsible_user_id where id = v_action.id;
    update public.ssma_field_records set responsible_user_id = p_new_responsible_user_id where id = v_action.record_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (v_action.id, v_action.project_id, 'REATRIBUIDA', coalesce(v_reason, 'Encaminhada pelo administrador.'), v_user);
  end if;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail, occurred_at)
  values (
    v_action.project_id, 'USER', v_user, null, 'SSMA_ACTION_FORWARDED', 'SSMA_CORRECTIVE_ACTION', v_action.id::text,
    format('Ação corretiva SSMA encaminhada de %s para %s. Motivo: %s', coalesce(v_previous::text, 'não atribuído'),
      p_new_responsible_user_id::text, coalesce(v_reason, 'não informado (administrador)')),
    now()
  );

  select * into v_action from public.ssma_corrective_actions where id = p_action_id;
  if v_action.responsible_user_id is distinct from p_new_responsible_user_id then
    raise exception 'FORWARD_NOT_PERSISTED';
  end if;
  return v_action;
end;
$$;

create or replace function public.ssma_corrective_action_forward(
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.ssma_corrective_actions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.ssma_corrective_action_forward_core(v_user, p_action_id, p_new_responsible_user_id, p_reason);
end;
$$;

create or replace function public.ssma_corrective_action_forward_by_email(
  p_actor_user_id uuid,
  p_action_id uuid,
  p_new_responsible_user_id uuid,
  p_reason text default null
)
returns public.ssma_corrective_actions
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.ssma_corrective_action_forward_core(p_actor_user_id, p_action_id, p_new_responsible_user_id, p_reason);
end;
$$;

revoke all on function public.ssma_corrective_action_forward_core(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.ssma_corrective_action_forward(uuid, uuid, text) from public, anon;
grant execute on function public.ssma_corrective_action_forward(uuid, uuid, text) to authenticated;
revoke all on function public.ssma_corrective_action_forward_by_email(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ssma_corrective_action_forward_by_email(uuid, uuid, uuid, text) to service_role;

-- ---------- 7) Foto de evidência: núcleo com ator explícito ----------
-- Corpo vigente (20261028130000) preservado; AUTH_REQUIRED/USER_MISMATCH ficam no wrapper do app.
create or replace function public.ssma_field_record_register_photo_core(
  p_actor uuid,
  p_photo_id uuid,
  p_record_id uuid,
  p_purpose text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_actor;
  v_record public.ssma_field_records%rowtype;
  v_existing public.ssma_field_record_photos%rowtype;
  v_prefix text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_record from public.ssma_field_records where id = p_record_id;
  if not found then raise exception 'RECORD_NOT_FOUND'; end if;
  if not public.project_member_active_for(v_record.project_id, v_user) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if not (
    v_record.reported_by_user_id = v_user
    or v_record.responsible_user_id = v_user
    or public.project_permission_for(v_record.project_id, v_user, 'GESTOR')
  ) then raise exception 'RECORD_ACCESS_DENIED'; end if;
  if p_purpose = 'REGISTRO' and v_record.reported_by_user_id <> v_user then raise exception 'RECORD_ACCESS_DENIED'; end if;
  if p_purpose not in ('REGISTRO', 'EVIDENCIA_ACAO') then raise exception 'INVALID_PHOTO_PURPOSE'; end if;

  select * into v_existing from public.ssma_field_record_photos where id = p_photo_id;
  if found then
    if v_existing.record_id = p_record_id and v_existing.uploaded_by_user_id = v_user then return v_existing.id; end if;
    raise exception 'PHOTO_ID_CONFLICT';
  end if;

  v_prefix := v_record.project_id::text || '/ssma-registros/' || p_record_id::text || '/' || p_photo_id::text || '-';
  if left(p_storage_path, length(v_prefix)) <> v_prefix then raise exception 'INVALID_STORAGE_PATH'; end if;
  if p_mime_type not in ('image/jpeg', 'image/png') then raise exception 'INVALID_PHOTO_TYPE'; end if;
  if p_file_size_bytes <= 0 or p_file_size_bytes > 15728640 then raise exception 'INVALID_PHOTO_SIZE'; end if;
  if p_sha256_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_PHOTO_HASH'; end if;
  if (select count(*) from public.ssma_field_record_photos where record_id = p_record_id) >= 30 then
    raise exception 'PHOTO_LIMIT_EXCEEDED';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'project-documents' and name = p_storage_path) then
    raise exception 'STORAGE_OBJECT_NOT_FOUND';
  end if;

  insert into public.ssma_field_record_photos (
    id, record_id, project_id, purpose, storage_path, original_file_name, mime_type,
    file_size_bytes, sha256_hash, uploaded_by_user_id
  ) values (
    p_photo_id, p_record_id, v_record.project_id, p_purpose, p_storage_path, p_original_file_name,
    p_mime_type, p_file_size_bytes, lower(p_sha256_hash), v_user
  );
  return p_photo_id;
end;
$$;

create or replace function public.ssma_field_record_register_photo(
  p_claimed_user_id uuid,
  p_photo_id uuid,
  p_record_id uuid,
  p_purpose text,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_claimed_user_id is distinct from v_user then raise exception 'USER_MISMATCH'; end if;
  return public.ssma_field_record_register_photo_core(v_user, p_photo_id, p_record_id, p_purpose, p_storage_path,
    p_original_file_name, p_mime_type, p_file_size_bytes, p_sha256_hash);
end;
$$;

-- Por e-mail: SEMPRE EVIDENCIA_ACAO (foto anexada à resposta RESOLVIDO).
create or replace function public.ssma_field_record_register_photo_by_email(
  p_actor_user_id uuid,
  p_photo_id uuid,
  p_record_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  return public.ssma_field_record_register_photo_core(p_actor_user_id, p_photo_id, p_record_id, 'EVIDENCIA_ACAO',
    p_storage_path, p_original_file_name, p_mime_type, p_file_size_bytes, p_sha256_hash);
end;
$$;

revoke all on function public.ssma_field_record_register_photo_core(uuid, uuid, uuid, text, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.ssma_field_record_register_photo(uuid, uuid, uuid, text, text, text, text, bigint, text) from public, anon;
grant execute on function public.ssma_field_record_register_photo(uuid, uuid, uuid, text, text, text, text, bigint, text) to authenticated;
revoke all on function public.ssma_field_record_register_photo_by_email(uuid, uuid, uuid, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.ssma_field_record_register_photo_by_email(uuid, uuid, uuid, text, text, text, bigint, text) to service_role;
