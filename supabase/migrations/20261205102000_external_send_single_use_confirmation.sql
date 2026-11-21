-- ============================================================
-- 20261205102000_external_send_single_use_confirmation.sql
--
-- FASE 5 / Frente E (3/3) — CONFIRMAÇÃO DE ENVIO EXTERNO DE USO ÚNICO, vinculada a usuário + projeto + destinatários + ação + conteúdo (hash).
--
-- Antes (Fase 4/D, 20261127100000): a confirmação valia 24 h e podia ser reutilizada (mesmo usuário/projeto/contexto/endereço), sem
-- vínculo com a ação nem com o conteúdo. Agora, para o envio:
--   * COLABORADOR (REGISTER) PREPARA (acc_external_send_prepare): destinatários + ação + hash do conteúdo + versão. Nada é enviado.
--   * A APROVAÇÃO segue a matriz: MANAGE (GESTOR/GERENTE/ADMINISTRADOR); minuta de Seguros exige ADMINISTRADOR (acc_external_send_decide).
--     Aprovar grava UMA confirmação por destinatário externo, ligada à preparação (ação + hash) na trilha append-only existente.
--   * O USO (acc_external_send_consume) é do PRÓPRIO aprovador, confere projeto, ação, destinatários e hash IGUAIS aos aprovados, vale 24 h
--     e consome as confirmações UMA vez (tabela de usos com chave primária = confirmação). Conteúdo alterado => nova aprovação.
--   * O canal oficial de Seguros (gatilho existente) passa a CONSUMIR a confirmação (uso único) em vez de aceitá-la por 24 h repetidamente.
--   * Qualquer domínio externo VÁLIDO pode ser analisado e, quando autorizado, usado: acc_recipient_domains NÃO é allowlist, é só a lista de
--     domínios que dispensam confirmação (TENANT/PERMITIDO). Nada aqui recusa domínio por não constar de lista.
--   * LEITURA/consulta de mensagens já recebidas ou enviadas NÃO passa por nenhuma destas funções: não exige a aprovação excepcional de novo envio.
-- Nada aqui envia e-mail. Redefine UMA função existente (insurance_channel_recipient_guard) — justificativa: era o único consumidor da
-- confirmação reutilizável de 24 h. Reversível: supabase/rollbacks/20261205102000_external_send_single_use_confirmation.rollback.sql. Idempotente.
-- ============================================================

-- ---------- preparações de envio ----------
create table if not exists public.external_send_preparations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  context text not null check (context in ('SEGUROS_CANAL', 'SEGUROS_MINUTA', 'GARANTIAS', 'QUALIDADE', 'SOLICITACAO_ACAO', 'OUTRO')),
  action_kind text not null check (action_kind in ('ENVIO_NOVO', 'RESPOSTA', 'ENCAMINHAMENTO', 'CADASTRO_CANAL', 'SOLICITACAO_ACAO')),
  recipients text[] not null check (cardinality(recipients) between 1 and 20),
  external_recipients text[] not null default '{}',
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  content_version text not null check (char_length(btrim(content_version)) between 1 and 60),
  entity_type text,
  entity_id uuid,
  prepared_by uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  prepared_at timestamptz not null default now(),
  status text not null default 'PREPARED' check (status in ('PREPARED', 'APPROVED', 'REJECTED', 'CANCELLED', 'CONSUMED')),
  required_tier text not null check (required_tier in ('MANAGE', 'ADMIN')),
  decided_by uuid references public.profiles (id) on delete restrict,
  decided_at timestamptz,
  decision_note text,
  consumed_at timestamptz,
  row_version integer not null default 1
);
create index if not exists external_send_preparations_project_idx on public.external_send_preparations (project_id, status, prepared_at desc);

create or replace function public.external_send_preparations_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'EXTERNAL_SEND_PREPARATION_IMMUTABLE: preparação não é apagada'; end if;
  if new.project_id is distinct from old.project_id or new.context is distinct from old.context or new.action_kind is distinct from old.action_kind
     or new.recipients is distinct from old.recipients or new.external_recipients is distinct from old.external_recipients
     or new.content_hash is distinct from old.content_hash or new.content_version is distinct from old.content_version
     or new.prepared_by is distinct from old.prepared_by or new.prepared_at is distinct from old.prepared_at or new.required_tier is distinct from old.required_tier then
    raise exception 'EXTERNAL_SEND_PREPARATION_IMMUTABLE: conteúdo, destinatários e ação não mudam; prepare uma nova versão';
  end if;
  if old.status in ('REJECTED', 'CANCELLED', 'CONSUMED') and new.status is distinct from old.status then
    raise exception 'EXTERNAL_SEND_PREPARATION_IMMUTABLE: preparação encerrada (%) não é reaberta', old.status;
  end if;
  return new;
end;
$$;
drop trigger if exists external_send_preparations_guard_trg on public.external_send_preparations;
create trigger external_send_preparations_guard_trg before update or delete on public.external_send_preparations
  for each row execute function public.external_send_preparations_guard();
drop trigger if exists external_send_preparations_no_truncate on public.external_send_preparations;
create trigger external_send_preparations_no_truncate before truncate on public.external_send_preparations
  for each statement execute function public.insurance_block_mutation();

-- ---------- vínculo da confirmação com ação + conteúdo (colunas aditivas; linhas antigas ficam sem vínculo => NÃO consumíveis pelo fluxo novo) ----------
alter table public.external_recipient_confirmations add column if not exists action_kind text;
alter table public.external_recipient_confirmations add column if not exists content_hash text;
alter table public.external_recipient_confirmations add column if not exists preparation_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'external_recipient_confirmations_preparation_fk') then
    alter table public.external_recipient_confirmations add constraint external_recipient_confirmations_preparation_fk
      foreign key (preparation_id) references public.external_send_preparations (id) on delete restrict;
  end if;
end $$;

-- ---------- usos (append-only): a chave primária garante USO ÚNICO ----------
create table if not exists public.external_recipient_confirmation_uses (
  confirmation_id uuid primary key, -- sem FK: um FK para a trilha impediria o TRUNCATE (que o gatilho da trilha já recusa com mensagem própria)
  project_id uuid not null references public.projects (id) on delete restrict,
  used_by uuid not null references public.profiles (id) on delete restrict,
  used_at timestamptz not null default now(),
  action_kind text not null,
  content_hash text,
  preparation_id uuid references public.external_send_preparations (id) on delete restrict
);
drop trigger if exists external_recipient_confirmation_uses_append_only on public.external_recipient_confirmation_uses;
create trigger external_recipient_confirmation_uses_append_only before update or delete on public.external_recipient_confirmation_uses
  for each row execute function public.insurance_block_mutation();
drop trigger if exists external_recipient_confirmation_uses_no_truncate on public.external_recipient_confirmation_uses;
create trigger external_recipient_confirmation_uses_no_truncate before truncate on public.external_recipient_confirmation_uses
  for each statement execute function public.insurance_block_mutation();

alter table public.external_send_preparations enable row level security;
alter table public.external_recipient_confirmation_uses enable row level security;
drop policy if exists external_send_preparations_select on public.external_send_preparations;
create policy external_send_preparations_select on public.external_send_preparations for select to authenticated
  using (prepared_by = auth.uid() or public.acc_project_tier(project_id) in ('MANAGE', 'ADMIN'));
drop policy if exists external_recipient_confirmation_uses_select on public.external_recipient_confirmation_uses;
create policy external_recipient_confirmation_uses_select on public.external_recipient_confirmation_uses for select to authenticated
  using (public.acc_project_tier(project_id) in ('MANAGE', 'ADMIN'));
revoke all on public.external_send_preparations, public.external_recipient_confirmation_uses from public, anon, authenticated;
grant select on public.external_send_preparations, public.external_recipient_confirmation_uses to authenticated;

-- ---------- nível exigido para aprovar (matriz): minuta de Seguros = ADMINISTRADOR; demais = gestão ----------
create or replace function public.acc_external_send_required_tier(p_context text)
returns text
language sql
immutable
set search_path = ''
as $$ select case when p_context = 'SEGUROS_MINUTA' then 'ADMIN' else 'MANAGE' end; $$;
revoke all on function public.acc_external_send_required_tier(text) from public, anon, authenticated;

-- normaliza uma lista de destinatários (aparar, minúsculas, validar, deduplicar, ordenar); NULL se algum for inválido
create or replace function public.acc_external_send_normalize_list(p_recipients text[])
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
  v_out text[] := '{}';
  r text;
begin
  if p_recipients is null or cardinality(p_recipients) = 0 then return null; end if;
  foreach r in array p_recipients loop
    v := public.acc_email_normalize(r);
    if v is null then return null; end if;
    v_out := array_append(v_out, v);
  end loop;
  select coalesce(array_agg(distinct x order by x), '{}') into v_out from unnest(v_out) x;
  return v_out;
end;
$$;
revoke all on function public.acc_external_send_normalize_list(text[]) from public, anon, authenticated;

-- ---------- 1) PREPARAR (COLABORADOR ou acima) ----------
create or replace function public.acc_external_send_prepare(
  p_project_id uuid, p_context text, p_action text, p_recipients text[], p_content_hash text, p_content_version text,
  p_entity_type text default null, p_entity_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_list text[];
  v_ext text[] := '{}';
  r text;
  v_id uuid;
  v_req text := public.acc_external_send_required_tier(p_context);
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) not in ('REGISTER', 'MANAGE', 'ADMIN') then raise exception 'FORBIDDEN: preparar envio exige colaborador ou acima do projeto'; end if;
  if p_context is null or p_context not in ('SEGUROS_CANAL', 'SEGUROS_MINUTA', 'GARANTIAS', 'QUALIDADE', 'SOLICITACAO_ACAO', 'OUTRO') then raise exception 'INVALID_CONTEXT'; end if;
  if p_action is null or p_action not in ('ENVIO_NOVO', 'RESPOSTA', 'ENCAMINHAMENTO', 'CADASTRO_CANAL', 'SOLICITACAO_ACAO') then raise exception 'INVALID_ACTION'; end if;
  if p_content_hash is null or p_content_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_CONTENT_HASH: informe o SHA-256 (64 hex minúsculos) do conteúdo'; end if;
  if p_content_version is null or char_length(btrim(p_content_version)) not between 1 and 60 then raise exception 'INVALID_CONTENT_VERSION'; end if;
  v_list := public.acc_external_send_normalize_list(p_recipients);
  if v_list is null then raise exception 'INVALID_RECIPIENT_EMAIL: lista vazia ou com endereço inválido'; end if;
  if cardinality(v_list) > 20 then raise exception 'TOO_MANY_RECIPIENTS: máximo de 20 destinatários'; end if;
  foreach r in array v_list loop
    if public.acc_recipient_domain_status(r) = 'EXTERNO' then v_ext := array_append(v_ext, r); end if;
  end loop;
  insert into public.external_send_preparations (project_id, context, action_kind, recipients, external_recipients, content_hash, content_version,
                                                 entity_type, entity_id, prepared_by, required_tier)
  values (p_project_id, p_context, p_action, v_list, v_ext, p_content_hash, btrim(p_content_version),
          nullif(btrim(coalesce(p_entity_type, '')), ''), p_entity_id, v_uid, v_req)
  returning id into v_id;
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_uid, 'EXTERNAL_SEND_PREPARED', 'EXTERNAL_SEND_PREPARATION', v_id::text,
          jsonb_build_object('context', p_context, 'action', p_action, 'recipientCount', cardinality(v_list), 'externalCount', cardinality(v_ext), 'contentVersion', p_content_version)::text);
  return jsonb_build_object('id', v_id, 'status', 'PREPARED', 'requiresApproval', cardinality(v_ext) > 0, 'requiredTier', v_req,
    'externalRecipients', to_jsonb(v_ext), 'sent', false);
end;
$$;

-- ---------- 2) DECIDIR (aprovação conforme a matriz) ----------
create or replace function public.acc_external_send_decide(p_preparation_id uuid, p_decision text, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.external_send_preparations%rowtype;
  v_tier text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  r text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.external_send_preparations where id = p_preparation_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  v_tier := public.acc_project_tier(p.project_id);
  if v_tier not in ('MANAGE', 'ADMIN') or (p.required_tier = 'ADMIN' and v_tier <> 'ADMIN') then
    raise exception 'FORBIDDEN: a aprovação deste envio exige %', case when p.required_tier = 'ADMIN' then 'ADMINISTRADOR' else 'gestão (GESTOR, GERENTE ou ADMINISTRADOR)' end;
  end if;
  if p.status <> 'PREPARED' then raise exception 'NOT_PREPARED: preparação em estado %', p.status; end if;
  if p_decision = 'REJECT' then
    if v_reason is null or char_length(v_reason) < 10 then raise exception 'REASON_REQUIRED: informe o motivo (mín. 10 caracteres)'; end if;
    update public.external_send_preparations set status = 'REJECTED', decided_by = v_uid, decided_at = now(), decision_note = v_reason, row_version = row_version + 1 where id = p.id;
    insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
    values (p.project_id, 'USER', v_uid, 'EXTERNAL_SEND_REJECTED', 'EXTERNAL_SEND_PREPARATION', p.id::text, jsonb_build_object('reason', v_reason)::text);
    return jsonb_build_object('id', p.id, 'status', 'REJECTED', 'sent', false);
  end if;
  if p_decision <> 'APPROVE' then raise exception 'INVALID_DECISION'; end if;
  if cardinality(p.external_recipients) > 0 and (v_reason is null or char_length(v_reason) < 10) then
    raise exception 'REASON_REQUIRED: envio a destinatário externo exige motivo (mín. 10 caracteres)';
  end if;
  foreach r in array p.external_recipients loop
    insert into public.external_recipient_confirmations
      (project_id, context, entity_type, entity_id, recipient_email, recipient_domain, reason, source_ref, confirmed_by, tier_at_confirmation,
       action_kind, content_hash, preparation_id)
    values (p.project_id, p.context, p.entity_type, p.entity_id, r, split_part(r, '@', 2), v_reason, 'preparacao:' || p.id::text, v_uid, v_tier,
            p.action_kind, p.content_hash, p.id);
  end loop;
  update public.external_send_preparations set status = 'APPROVED', decided_by = v_uid, decided_at = now(), decision_note = v_reason, row_version = row_version + 1 where id = p.id;
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p.project_id, 'USER', v_uid, 'EXTERNAL_SEND_APPROVED', 'EXTERNAL_SEND_PREPARATION', p.id::text,
          jsonb_build_object('externalCount', cardinality(p.external_recipients), 'action', p.action_kind, 'tier', v_tier)::text);
  return jsonb_build_object('id', p.id, 'status', 'APPROVED', 'externalConfirmations', cardinality(p.external_recipients), 'singleUse', true, 'sent', false);
end;
$$;

-- ---------- 3) CONSUMIR (uso único; só o aprovador; mesma ação, mesmos destinatários, mesmo hash; 24 h) ----------
create or replace function public.acc_external_send_consume(p_preparation_id uuid, p_action text, p_recipients text[], p_content_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.external_send_preparations%rowtype;
  v_list text[];
  v_tier text;
  v_n integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.external_send_preparations where id = p_preparation_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  v_tier := public.acc_project_tier(p.project_id);
  if v_tier = 'NONE' or v_tier = 'READ' then raise exception 'FORBIDDEN'; end if;
  if p.status = 'CONSUMED' then raise exception 'CONFIRMATION_ALREADY_USED: a confirmação deste envio é de uso único e já foi usada'; end if;
  if p.status not in ('PREPARED', 'APPROVED') then raise exception 'NOT_APPROVED: preparação em estado %', p.status; end if;
  if p_action is distinct from p.action_kind then raise exception 'ACTION_MISMATCH: a confirmação vale somente para a ação aprovada (%)', p.action_kind; end if;
  if p_content_hash is distinct from p.content_hash then raise exception 'CONTENT_CHANGED: o conteúdo mudou depois da aprovação; prepare e aprove uma nova versão'; end if;
  v_list := public.acc_external_send_normalize_list(p_recipients);
  if v_list is null or v_list is distinct from p.recipients then raise exception 'RECIPIENTS_CHANGED: os destinatários diferem dos aprovados; prepare e aprove de novo'; end if;
  if cardinality(p.external_recipients) = 0 then
    -- só destinatários internos/permitidos: sem aprovação excepcional; o próprio preparador (ou gestão) usa
    if p.status <> 'PREPARED' and p.status <> 'APPROVED' then raise exception 'NOT_APPROVED'; end if;
    if v_uid <> p.prepared_by and v_tier not in ('MANAGE', 'ADMIN') then raise exception 'FORBIDDEN'; end if;
  else
    if p.status <> 'APPROVED' then raise exception 'EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED: destinatário externo exige aprovação prévia'; end if;
    if p.decided_by <> v_uid then raise exception 'CONFIRMER_ONLY: a confirmação é pessoal; só quem aprovou a usa'; end if;
    if v_tier not in ('MANAGE', 'ADMIN') or (p.required_tier = 'ADMIN' and v_tier <> 'ADMIN') then raise exception 'FORBIDDEN: o nível de quem aprovou deixou de bastar'; end if;
    if p.decided_at < now() - interval '24 hours' then raise exception 'CONFIRMATION_EXPIRED: aprovação com mais de 24 h; aprove de novo'; end if;
    insert into public.external_recipient_confirmation_uses (confirmation_id, project_id, used_by, action_kind, content_hash, preparation_id)
    select c.id, c.project_id, v_uid, p_action, c.content_hash, p.id
      from public.external_recipient_confirmations c
     where c.preparation_id = p.id and c.confirmed_by = v_uid and c.content_hash = p.content_hash and c.action_kind = p.action_kind;
    get diagnostics v_n = row_count;
    if v_n <> cardinality(p.external_recipients) then raise exception 'EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED: faltam confirmações para os destinatários externos'; end if;
  end if;
  update public.external_send_preparations set status = 'CONSUMED', consumed_at = now(), row_version = row_version + 1 where id = p.id;
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p.project_id, 'USER', v_uid, 'EXTERNAL_SEND_AUTHORIZATION_CONSUMED', 'EXTERNAL_SEND_PREPARATION', p.id::text,
          jsonb_build_object('action', p_action, 'externalCount', cardinality(p.external_recipients))::text);
  return jsonb_build_object('id', p.id, 'status', 'CONSUMED', 'authorized', true, 'sent', false,
    'note', 'Autorização consumida. O envio real continua dependendo das travas de envio do ACC; nada foi enviado por esta função.');
end;
$$;

-- ---------- 4) CANCELAR (preparador ou gestão) ----------
create or replace function public.acc_external_send_cancel(p_preparation_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.external_send_preparations%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.external_send_preparations where id = p_preparation_id for update;
  if not found or (p.prepared_by <> v_uid and public.acc_project_tier(p.project_id) not in ('MANAGE', 'ADMIN')) then raise exception 'FORBIDDEN'; end if;
  if p.status not in ('PREPARED', 'APPROVED') then raise exception 'NOT_OPEN: preparação em estado %', p.status; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'REASON_REQUIRED: informe o motivo (mín. 10 caracteres)'; end if;
  update public.external_send_preparations set status = 'CANCELLED', decision_note = coalesce(decision_note, v_reason), row_version = row_version + 1 where id = p.id;
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p.project_id, 'USER', v_uid, 'EXTERNAL_SEND_CANCELLED', 'EXTERNAL_SEND_PREPARATION', p.id::text, jsonb_build_object('reason', v_reason)::text);
  return jsonb_build_object('id', p.id, 'status', 'CANCELLED');
end;
$$;

-- ---------- consumo de confirmação "solta" (canal oficial de Seguros): uso único, mesmo usuário/projeto/contexto/endereço, 24 h ----------
create or replace function public.acc_external_recipient_consume_unbound(p_project_id uuid, p_context text, p_email text, p_user uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select c.id into v_id
    from public.external_recipient_confirmations c
   where c.project_id = p_project_id and c.context = p_context and c.recipient_email = public.acc_email_normalize(p_email)
     and c.confirmed_by = p_user and c.confirmed_at > now() - interval '24 hours' and c.preparation_id is null
     and not exists (select 1 from public.external_recipient_confirmation_uses u where u.confirmation_id = c.id)
   order by c.confirmed_at desc limit 1 for update skip locked;
  if v_id is null then return false; end if;
  insert into public.external_recipient_confirmation_uses (confirmation_id, project_id, used_by, action_kind)
  values (v_id, p_project_id, p_user, p_action);
  return true;
end;
$$;
revoke all on function public.acc_external_recipient_consume_unbound(uuid, text, text, uuid, text) from public, anon, authenticated;

-- REDEFINIÇÃO justificada: o gatilho do canal oficial deixa de aceitar a confirmação por 24 h repetidamente e a CONSOME (uso único)
create or replace function public.insurance_channel_recipient_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.channel_type <> 'EMAIL' then return new; end if;
  v_email := public.acc_email_normalize(new.channel_value);
  if v_email is null then raise exception 'INVALID_RECIPIENT_EMAIL: o endereço do canal não é um e-mail válido'; end if;
  new.channel_value := v_email;
  if public.acc_recipient_domain_status(v_email) = 'EXTERNO'
     and not public.acc_external_recipient_consume_unbound(new.project_id, 'SEGUROS_CANAL', v_email, coalesce(new.created_by, auth.uid()), 'CADASTRO_CANAL') then
    raise exception 'EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED: confirme o destinatário externo antes de cadastrar o canal (confirmação de uso único)';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_channel_recipient_guard() from public, anon, authenticated;

-- ---------- privilégios ----------
revoke all on function public.acc_external_send_prepare(uuid, text, text, text[], text, text, text, uuid) from public, anon;
grant execute on function public.acc_external_send_prepare(uuid, text, text, text[], text, text, text, uuid) to authenticated;
revoke all on function public.acc_external_send_decide(uuid, text, text) from public, anon;
grant execute on function public.acc_external_send_decide(uuid, text, text) to authenticated;
revoke all on function public.acc_external_send_consume(uuid, text, text[], text) from public, anon;
grant execute on function public.acc_external_send_consume(uuid, text, text[], text) to authenticated;
revoke all on function public.acc_external_send_cancel(uuid, text) from public, anon;
grant execute on function public.acc_external_send_cancel(uuid, text) to authenticated;
revoke all on function public.external_send_preparations_guard() from public, anon, authenticated;

comment on table public.acc_recipient_domains is
  'Domínios que DISPENSAM confirmação de destinatário externo (TENANT/PERMITIDO). NÃO é allowlist: qualquer domínio externo válido pode ser analisado e, quando autorizado (confirmação de uso único), usado. Sem escrita pela aplicação.';
comment on table public.external_send_preparations is
  'Preparação de envio externo (COLABORADOR prepara; aprovação conforme a matriz). Vincula destinatários + ação + hash do conteúdo; confirmação de uso único. Nada é enviado por estas funções. Fase 5/E.';
