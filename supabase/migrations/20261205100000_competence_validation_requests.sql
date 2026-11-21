-- ============================================================
-- 20261205100000_competence_validation_requests.sql
--
-- FASE 5 / Frente E (1/3) — COMPETÊNCIA ESPECIALIZADA SÓ COM VALIDAÇÃO INDEPENDENTE DE HABILITAÇÃO.
--
-- Problema: na Fase 4/A o ADMINISTRADOR concedia competência (TECNICO_RESPONSAVEL, JURIDICO, SEGUROS) por RPC. Em organização com
-- administrador ÚNICO isso vira autoconcessão de fato (basta cadastrar outra conta). Registro CREA/OAB declarado é só texto.
-- Nova regra: conceder competência vira SOLICITAÇÃO que NÃO produz poderes. Só passa a valer quando uma pessoa INDEPENDENTE
-- (diferente de quem solicitou e de quem receberá a competência) valida a HABILITAÇÃO com EVIDÊNCIA DOCUMENTAL anexada ao projeto:
--   (a) SEGUNDO ADMINISTRADOR ativo do projeto, ou
--   (b) VALIDADOR DESIGNADO (pessoa externa/diretoria) — regularização segura para organização de um administrador só:
--       a designação exige documento (ata/ofício), prazo (máx. 180 dias), ACEITE do próprio designado e trilha; é revogável.
-- A validação exige confirmação expressa de que a evidência foi conferida (evidence_checked) e nota >= 20 caracteres.
-- CREA/OAB/SUSEP informado NÃO comprova habilitação: continua texto declarado; sem a validação nenhuma autoridade especializada.
--
-- O que muda no banco (aditivo; nenhuma migration existente é alterada):
--   project_competences.habilitation_status  (UNVALIDATED | VALIDATED | MAINTENANCE) + habilitation_request_id
--   gatilho BEFORE INSERT: a escrita pelo caminho da aplicação (JWT de usuário ou service_role) só entra com solicitação APROVADA na
--     MESMA transação; o RPC antigo project_competence_grant passa a ser recusado (HABILITATION_VALIDATION_REQUIRED);
--     carga de manutenção (superusuário sem JWT) fica MAINTENANCE: vale, mas é identificável em relatório.
--   acc_user_has_competence REDEFINIDA (justificativa: é o único ponto de decisão consumido pelos gatilhos da Fase 4/A; só acrescenta
--     a condição habilitation_status in (VALIDATED, MAINTENANCE)). Linhas já existentes ficam UNVALIDATED (sem poder até validar).
--   project_competence_requests, project_competence_validators, project_competence_governance_events (append-only)
--   RPCs: project_competence_request_create / _cancel / _decide, project_competence_validator_designate / _accept / _revoke.
-- Reversível: supabase/rollbacks/20261205100000_competence_validation_requests.rollback.sql. Idempotente.
-- ============================================================

-- ---------- colunas aditivas em project_competences ----------
alter table public.project_competences add column if not exists habilitation_status text not null default 'UNVALIDATED';
alter table public.project_competences add column if not exists habilitation_request_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_competences_habilitation_status_chk') then
    alter table public.project_competences add constraint project_competences_habilitation_status_chk
      check (habilitation_status in ('UNVALIDATED', 'VALIDATED', 'MAINTENANCE'));
  end if;
end $$;
comment on column public.project_competences.habilitation_status is
  'VALIDATED = habilitação validada por pessoa independente (solicitação aprovada); MAINTENANCE = carga por superusuário fora da aplicação (vale, mas é listada em relatório); UNVALIDATED = sem validação (NÃO vale como competência).';

-- ---------- solicitações ----------
create table if not exists public.project_competence_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  target_user_id uuid not null references public.profiles (id) on delete restrict,
  competence text not null check (competence in ('TECNICO_RESPONSAVEL', 'JURIDICO', 'SEGUROS')),
  requested_by uuid not null references public.profiles (id) on delete restrict,
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  valid_from date not null default current_date,
  valid_until date,
  registration_kind text check (registration_kind is null or registration_kind in ('CREA', 'CAU', 'OAB', 'SUSEP', 'OUTRO')),
  registration_number text check (registration_number is null or char_length(btrim(registration_number)) between 1 and 60),
  evidence_document_id uuid not null references public.documents (id) on delete restrict,
  basis_note text check (basis_note is null or char_length(basis_note) <= 1000),
  status text not null default 'PENDING' check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')),
  validator_user_id uuid references public.profiles (id) on delete restrict,
  validator_kind text check (validator_kind is null or validator_kind in ('SECOND_ADMIN', 'DESIGNATED')),
  validated_at timestamptz,
  validation_note text,
  evidence_checked boolean not null default false,
  decided_txid bigint,
  competence_id uuid references public.project_competences (id) on delete restrict,
  row_version integer not null default 1,
  check (valid_until is null or valid_until >= valid_from),
  check (registration_number is null or registration_kind is not null),
  check (status = 'PENDING' and validator_user_id is null and validated_at is null
         or status <> 'PENDING' and (status in ('CANCELLED', 'EXPIRED') or validator_user_id is not null)),
  check (status <> 'APPROVED' or (evidence_checked and validator_user_id <> requested_by and validator_user_id <> target_user_id
                                  and char_length(btrim(coalesce(validation_note, ''))) >= 20))
);
create unique index if not exists project_competence_requests_one_pending_idx
  on public.project_competence_requests (project_id, target_user_id, competence) where status = 'PENDING';
create index if not exists project_competence_requests_project_idx on public.project_competence_requests (project_id, status, requested_at desc);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_competences_habilitation_request_fk') then
    alter table public.project_competences add constraint project_competences_habilitation_request_fk
      foreign key (habilitation_request_id) references public.project_competence_requests (id) on delete restrict;
  end if;
end $$;

-- ---------- validadores designados ----------
create table if not exists public.project_competence_validators (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  designated_by uuid not null references public.profiles (id) on delete restrict,
  designated_at timestamptz not null default now(),
  designation_document_id uuid not null references public.documents (id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 20 and 1000),
  valid_from date not null default current_date,
  valid_until date not null,
  status text not null default 'PROPOSED' check (status in ('PROPOSED', 'ACTIVE', 'REVOKED')),
  accepted_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text,
  row_version integer not null default 1,
  check (user_id <> designated_by),
  check (valid_until >= valid_from and valid_until <= valid_from + 180),
  check (status = 'PROPOSED' and accepted_at is null or status = 'ACTIVE' and accepted_at is not null
         or status = 'REVOKED' and revoked_at is not null and revoked_by is not null)
);
create unique index if not exists project_competence_validators_one_open_idx
  on public.project_competence_validators (project_id, user_id) where status in ('PROPOSED', 'ACTIVE');

-- ---------- trilha append-only ----------
create table if not exists public.project_competence_governance_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  request_id uuid references public.project_competence_requests (id) on delete restrict,
  validator_id uuid references public.project_competence_validators (id) on delete restrict,
  action text not null check (action in ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED',
    'VALIDATOR_DESIGNATED', 'VALIDATOR_ACCEPTED', 'VALIDATOR_REVOKED')),
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  actor_role text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_competence_governance_events_project_idx on public.project_competence_governance_events (project_id, created_at);
drop trigger if exists project_competence_governance_events_append_only on public.project_competence_governance_events;
create trigger project_competence_governance_events_append_only before update or delete on public.project_competence_governance_events
  for each row execute function public.insurance_block_mutation();
drop trigger if exists project_competence_governance_events_no_truncate on public.project_competence_governance_events;
create trigger project_competence_governance_events_no_truncate before truncate on public.project_competence_governance_events
  for each statement execute function public.insurance_block_mutation();

-- ---------- guardas das tabelas de solicitação e de validador (nada é apagado; identidade imutável) ----------
create or replace function public.project_competence_requests_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'COMPETENCE_REQUEST_IMMUTABLE: solicitação não é apagada'; end if;
  if new.project_id is distinct from old.project_id or new.target_user_id is distinct from old.target_user_id
     or new.competence is distinct from old.competence or new.requested_by is distinct from old.requested_by
     or new.requested_at is distinct from old.requested_at or new.evidence_document_id is distinct from old.evidence_document_id
     or new.valid_from is distinct from old.valid_from or new.valid_until is distinct from old.valid_until
     or new.registration_kind is distinct from old.registration_kind or new.registration_number is distinct from old.registration_number then
    raise exception 'COMPETENCE_REQUEST_IMMUTABLE: dados da solicitação não mudam; cancele e solicite de novo';
  end if;
  if old.status <> 'PENDING' and (new.status is distinct from old.status or new.validator_user_id is distinct from old.validator_user_id
     or new.validated_at is distinct from old.validated_at or new.validation_note is distinct from old.validation_note) then
    raise exception 'COMPETENCE_REQUEST_IMMUTABLE: solicitação já decidida não é reaberta';
  end if;
  return new;
end;
$$;
drop trigger if exists project_competence_requests_guard_trg on public.project_competence_requests;
create trigger project_competence_requests_guard_trg before update or delete on public.project_competence_requests
  for each row execute function public.project_competence_requests_guard();
drop trigger if exists project_competence_requests_no_truncate on public.project_competence_requests;
create trigger project_competence_requests_no_truncate before truncate on public.project_competence_requests
  for each statement execute function public.insurance_block_mutation();

create or replace function public.project_competence_validators_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'COMPETENCE_VALIDATOR_IMMUTABLE: designação não é apagada; revogue'; end if;
  if new.project_id is distinct from old.project_id or new.user_id is distinct from old.user_id or new.designated_by is distinct from old.designated_by
     or new.designation_document_id is distinct from old.designation_document_id or new.valid_from is distinct from old.valid_from
     or new.valid_until is distinct from old.valid_until or new.reason is distinct from old.reason then
    raise exception 'COMPETENCE_VALIDATOR_IMMUTABLE: dados da designação não mudam; revogue e designe de novo';
  end if;
  if old.status = 'REVOKED' then raise exception 'COMPETENCE_VALIDATOR_IMMUTABLE: designação revogada não é reaberta'; end if;
  return new;
end;
$$;
drop trigger if exists project_competence_validators_guard_trg on public.project_competence_validators;
create trigger project_competence_validators_guard_trg before update or delete on public.project_competence_validators
  for each row execute function public.project_competence_validators_guard();
drop trigger if exists project_competence_validators_no_truncate on public.project_competence_validators;
create trigger project_competence_validators_no_truncate before truncate on public.project_competence_validators
  for each statement execute function public.insurance_block_mutation();

-- ---------- helper interno: o usuário é validador designado ATIVO (aceito e na validade) do projeto? ----------
create or replace function public.acc_is_designated_competence_validator(p_project_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is not null and p_user_id is not null and exists (
    select 1 from public.project_competence_validators v
     where v.project_id = p_project_id and v.user_id = p_user_id and v.status = 'ACTIVE'
       and v.valid_from <= current_date and v.valid_until >= current_date);
$$;
revoke all on function public.acc_is_designated_competence_validator(uuid, uuid) from public, anon, authenticated;

-- wrapper consultável pelas políticas RLS (só responde sobre o PRÓPRIO usuário autenticado)
create or replace function public.acc_am_designated_competence_validator(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.acc_is_designated_competence_validator(p_project_id, auth.uid()); $$;
revoke all on function public.acc_am_designated_competence_validator(uuid) from public, anon;
grant execute on function public.acc_am_designated_competence_validator(uuid) to authenticated;

-- ---------- RLS: leitura restrita; ZERO escrita direta ----------
alter table public.project_competence_requests enable row level security;
alter table public.project_competence_validators enable row level security;
alter table public.project_competence_governance_events enable row level security;
drop policy if exists project_competence_requests_select on public.project_competence_requests;
create policy project_competence_requests_select on public.project_competence_requests for select to authenticated
  using (requested_by = auth.uid() or target_user_id = auth.uid()
         or public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE')
         or public.acc_am_designated_competence_validator(project_id));
drop policy if exists project_competence_validators_select on public.project_competence_validators;
create policy project_competence_validators_select on public.project_competence_validators for select to authenticated
  using (user_id = auth.uid() or public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
drop policy if exists project_competence_governance_events_select on public.project_competence_governance_events;
create policy project_competence_governance_events_select on public.project_competence_governance_events for select to authenticated
  using (public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
revoke all on public.project_competence_requests, public.project_competence_validators, public.project_competence_governance_events
  from public, anon, authenticated;
grant select on public.project_competence_requests, public.project_competence_validators, public.project_competence_governance_events to authenticated;

-- ---------- gatilho: competência só nasce por solicitação aprovada (ou carga de manutenção por superusuário) ----------
create or replace function public.project_competences_habilitation_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_super boolean;
  v_app boolean := coalesce(current_setting('role', true), '') in ('anon', 'authenticated', 'service_role');
  r public.project_competence_requests%rowtype;
begin
  select coalesce((select rolsuper from pg_roles where rolname = session_user), false) into v_super;
  if auth.uid() is null and v_super and not v_app then
    -- carga de manutenção (superusuário, sem JWT): vale, mas fica identificável
    new.habilitation_status := 'MAINTENANCE';
    return new;
  end if;
  select * into r from public.project_competence_requests where id = new.habilitation_request_id;
  if not found or r.status <> 'APPROVED' or r.decided_txid is distinct from txid_current()
     or r.project_id <> new.project_id or r.target_user_id <> new.user_id or r.competence <> new.competence then
    raise exception 'HABILITATION_VALIDATION_REQUIRED: competência especializada só nasce de uma solicitação com validação independente de habilitação (project_competence_request_create / _decide)';
  end if;
  new.habilitation_status := 'VALIDATED';
  return new;
end;
$$;
revoke all on function public.project_competences_habilitation_guard() from public, anon, authenticated;
drop trigger if exists project_competences_habilitation_trg on public.project_competences;
create trigger project_competences_habilitation_trg before insert on public.project_competences
  for each row execute function public.project_competences_habilitation_guard();

-- ---------- decisão única de competência (REDEFINIÇÃO justificada acima): exige habilitação validada ----------
create or replace function public.acc_user_has_competence(p_project_id uuid, p_user_id uuid, p_competences text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_project_id is not null and p_user_id is not null and coalesce(cardinality(p_competences), 0) > 0
    and exists (
      select 1
        from public.project_competences c
        join public.project_memberships pm on pm.project_id = c.project_id and pm.user_id = c.user_id and pm.status = 'ACTIVE'
       where c.project_id = p_project_id and c.user_id = p_user_id and c.status = 'ACTIVE'
         and c.habilitation_status in ('VALIDATED', 'MAINTENANCE')
         and c.competence = any (p_competences)
         and c.valid_from <= current_date and (c.valid_until is null or c.valid_until >= current_date));
$$;
revoke all on function public.acc_user_has_competence(uuid, uuid, text[]) from public, anon, authenticated;

-- ---------- helper interno de trilha ----------
create or replace function public.acc_competence_gov_event(p_project_id uuid, p_request_id uuid, p_validator_id uuid, p_action text, p_role text, p_detail jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_competence_governance_events (project_id, request_id, validator_id, action, actor_user_id, actor_role, detail)
  values (p_project_id, p_request_id, p_validator_id, p_action, auth.uid(), p_role, coalesce(p_detail, '{}'::jsonb));
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', auth.uid(), 'COMPETENCE_GOV_' || p_action, 'PROJECT_COMPETENCE_REQUEST',
          coalesce(p_request_id, p_validator_id)::text, coalesce(p_detail, '{}'::jsonb)::text);
end;
$$;
revoke all on function public.acc_competence_gov_event(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;

-- ---------- 1) Solicitar competência (somente ADMINISTRADOR do projeto; vale também para si mesmo — NÃO produz poderes) ----------
create or replace function public.project_competence_request_create(p_project_id uuid, p_user_id uuid, p_competence text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_from date;
  v_until date;
  v_kind text := nullif(upper(btrim(coalesce(p_data ->> 'registration_kind', ''))), '');
  v_num text := nullif(btrim(coalesce(p_data ->> 'registration_number', '')), '');
  v_doc uuid;
  v_note text := nullif(btrim(coalesce(p_data ->> 'basis_note', '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) <> 'ADMIN' then raise exception 'FORBIDDEN: só o administrador do projeto solicita competência'; end if;
  if p_user_id is null or p_competence is null or p_competence not in ('TECNICO_RESPONSAVEL', 'JURIDICO', 'SEGUROS') then raise exception 'INVALID_COMPETENCE'; end if;
  if not exists (select 1 from public.project_memberships pm where pm.project_id = p_project_id and pm.user_id = p_user_id and pm.status = 'ACTIVE') then
    raise exception 'TARGET_NOT_ACTIVE_MEMBER: a pessoa precisa ser membro ATIVO do projeto';
  end if;
  begin
    v_from := coalesce(nullif(p_data ->> 'valid_from', '')::date, current_date);
    v_until := nullif(p_data ->> 'valid_until', '')::date;
    v_doc := nullif(p_data ->> 'evidence_document_id', '')::uuid;
  exception when others then raise exception 'INVALID_INPUT: datas ou identificador de documento inválidos';
  end;
  if v_doc is null then raise exception 'EVIDENCE_REQUIRED: anexe o documento de habilitação (diploma, registro, certidão) ao projeto e informe-o; registro CREA/OAB declarado não comprova habilitação'; end if;
  if not exists (select 1 from public.documents d where d.id = v_doc and d.project_id = p_project_id) then
    raise exception 'REFERENCE_OUT_OF_PROJECT: documento de evidência inexistente ou de outro projeto';
  end if;
  if v_until is not null and (v_until < v_from or v_until < current_date) then raise exception 'INVALID_VALIDITY: validade incoerente ou já encerrada'; end if;
  if v_kind is not null and v_kind not in ('CREA', 'CAU', 'OAB', 'SUSEP', 'OUTRO') then raise exception 'INVALID_REGISTRATION_KIND'; end if;
  if v_num is not null and (v_kind is null or char_length(v_num) > 60) then raise exception 'INVALID_REGISTRATION: informe o tipo do registro e um número de até 60 caracteres'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'INVALID_INPUT: observação longa demais'; end if;
  perform pg_advisory_xact_lock(hashtextextended('acc-competence-request:' || p_project_id::text || p_user_id::text || p_competence, 0));
  -- solicitação pendente já vencida é encerrada (EXPIRED) para liberar nova solicitação
  update public.project_competence_requests set status = 'EXPIRED', row_version = row_version + 1
   where project_id = p_project_id and target_user_id = p_user_id and competence = p_competence and status = 'PENDING' and expires_at <= now();
  if exists (select 1 from public.project_competence_requests q where q.project_id = p_project_id and q.target_user_id = p_user_id
             and q.competence = p_competence and q.status = 'PENDING') then
    raise exception 'ALREADY_PENDING: já existe solicitação pendente desta competência para a pessoa';
  end if;
  insert into public.project_competence_requests (project_id, target_user_id, competence, requested_by, valid_from, valid_until,
                                                  registration_kind, registration_number, evidence_document_id, basis_note)
  values (p_project_id, p_user_id, p_competence, v_uid, v_from, v_until, v_kind, v_num, v_doc, v_note)
  returning id into v_id;
  perform public.acc_competence_gov_event(p_project_id, v_id, null, 'REQUESTED', 'ADMIN',
    jsonb_build_object('targetUserId', p_user_id, 'competence', p_competence, 'selfRequest', p_user_id = v_uid, 'evidenceDocumentId', v_doc,
      'note', 'Solicitação NÃO produz poderes até a validação independente de habilitação.'));
  return jsonb_build_object('id', v_id, 'status', 'PENDING', 'competence', p_competence, 'userId', p_user_id, 'rowVersion', 1,
    'grantsAuthority', false);
end;
$$;

-- ---------- 2) Cancelar solicitação pendente (quem solicitou) ----------
create or replace function public.project_competence_request_cancel(p_id uuid, p_expected_row_version integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  q public.project_competence_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into q from public.project_competence_requests where id = p_id for update;
  if not found or q.requested_by <> v_uid or public.acc_project_tier(q.project_id) <> 'ADMIN' then raise exception 'FORBIDDEN: só quem solicitou (administrador) cancela'; end if;
  if p_expected_row_version is null or q.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, q.row_version; end if;
  if q.status <> 'PENDING' then raise exception 'NOT_PENDING'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'REASON_REQUIRED: informe o motivo (mín. 10 caracteres)'; end if;
  update public.project_competence_requests set status = 'CANCELLED', validation_note = v_reason, row_version = row_version + 1 where id = p_id;
  perform public.acc_competence_gov_event(q.project_id, p_id, null, 'CANCELLED', 'ADMIN', jsonb_build_object('reason', v_reason));
  return jsonb_build_object('id', p_id, 'status', 'CANCELLED', 'rowVersion', q.row_version + 1);
end;
$$;

-- ---------- 3) Decidir (VALIDAÇÃO INDEPENDENTE): segundo administrador ou validador designado ----------
create or replace function public.project_competence_request_decide(
  p_id uuid, p_expected_row_version integer, p_decision text, p_note text, p_evidence_checked boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  q public.project_competence_requests%rowtype;
  v_kind text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_comp uuid;
  v_old uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into q from public.project_competence_requests where id = p_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if v_uid = q.requested_by or v_uid = q.target_user_id then
    raise exception 'INDEPENDENT_VALIDATOR_REQUIRED: quem solicitou ou receberá a competência não pode validá-la';
  end if;
  if public.acc_project_tier(q.project_id) = 'ADMIN' then v_kind := 'SECOND_ADMIN';
  elsif public.acc_is_designated_competence_validator(q.project_id, v_uid) then v_kind := 'DESIGNATED';
  else raise exception 'FORBIDDEN: só segundo administrador ou validador designado ativo valida habilitação'; end if;
  if p_expected_row_version is null or q.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, q.row_version; end if;
  if q.status <> 'PENDING' then raise exception 'NOT_PENDING'; end if;
  if q.expires_at <= now() then
    update public.project_competence_requests set status = 'EXPIRED', row_version = row_version + 1 where id = p_id;
    perform public.acc_competence_gov_event(q.project_id, p_id, null, 'EXPIRED', v_kind, jsonb_build_object('expiresAt', q.expires_at));
    return jsonb_build_object('id', p_id, 'status', 'EXPIRED', 'rowVersion', q.row_version + 1, 'grantsAuthority', false);
  end if;
  if p_decision = 'REJECT' then
    if v_note is null or char_length(v_note) < 10 then raise exception 'NOTE_REQUIRED: informe o motivo da recusa (mín. 10 caracteres)'; end if;
    update public.project_competence_requests set status = 'REJECTED', validator_user_id = v_uid, validator_kind = v_kind, validated_at = now(),
           validation_note = v_note, row_version = row_version + 1 where id = p_id;
    perform public.acc_competence_gov_event(q.project_id, p_id, null, 'REJECTED', v_kind, jsonb_build_object('note', v_note));
    return jsonb_build_object('id', p_id, 'status', 'REJECTED', 'rowVersion', q.row_version + 1, 'grantsAuthority', false);
  end if;
  if p_decision <> 'APPROVE' then raise exception 'INVALID_DECISION'; end if;
  if coalesce(p_evidence_checked, false) is not true then raise exception 'EVIDENCE_CHECK_REQUIRED: confirme que a evidência documental foi conferida'; end if;
  if v_note is null or char_length(v_note) < 20 then raise exception 'NOTE_REQUIRED: descreva o que foi conferido (mín. 20 caracteres)'; end if;
  if not exists (select 1 from public.documents d where d.id = q.evidence_document_id and d.project_id = q.project_id) then
    raise exception 'EVIDENCE_REQUIRED: documento de evidência indisponível no projeto';
  end if;
  if not exists (select 1 from public.project_memberships pm where pm.project_id = q.project_id and pm.user_id = q.target_user_id and pm.status = 'ACTIVE') then
    raise exception 'TARGET_NOT_ACTIVE_MEMBER: a pessoa deixou de ser membro ativo do projeto';
  end if;
  if q.valid_until is not null and q.valid_until < current_date then raise exception 'INVALID_VALIDITY: a validade solicitada já terminou'; end if;
  perform pg_advisory_xact_lock(hashtextextended('acc-competence:' || q.project_id::text || q.target_user_id::text || q.competence, 0));
  -- registro ativo anterior sem validade de habilitação ou já vencido é encerrado pelo sistema e substituído pelo validado
  for v_old in
    update public.project_competences set status = 'REVOKED', revoked_by = v_uid, revoked_at = now(),
           revoke_reason = 'Substituída por concessão com habilitação validada (solicitação ' || p_id::text || ').', row_version = row_version + 1
     where project_id = q.project_id and user_id = q.target_user_id and competence = q.competence and status = 'ACTIVE'
       and (habilitation_status = 'UNVALIDATED' or valid_until < current_date)
    returning id
  loop
    insert into public.project_competence_events (project_id, competence_id, action, target_user_id, competence, actor_user_id, actor_tier, detail)
    values (q.project_id, v_old, 'REVOKED', q.target_user_id, q.competence, v_uid, 'VALIDATOR_' || v_kind, jsonb_build_object('reason', 'SUBSTITUIDA_POR_VALIDADA', 'auto', true));
  end loop;
  if exists (select 1 from public.project_competences c where c.project_id = q.project_id and c.user_id = q.target_user_id and c.competence = q.competence and c.status = 'ACTIVE') then
    raise exception 'ALREADY_ACTIVE: já existe esta competência ativa e validada para a pessoa';
  end if;
  update public.project_competence_requests set status = 'APPROVED', validator_user_id = v_uid, validator_kind = v_kind, validated_at = now(),
         validation_note = v_note, evidence_checked = true, decided_txid = txid_current(), row_version = row_version + 1 where id = p_id;
  insert into public.project_competences (project_id, user_id, competence, valid_from, valid_until, registration_kind, registration_number,
                                          evidence_document_id, basis_note, granted_by, habilitation_request_id)
  values (q.project_id, q.target_user_id, q.competence, q.valid_from, q.valid_until, q.registration_kind, q.registration_number,
          q.evidence_document_id, q.basis_note, v_uid, p_id)
  returning id into v_comp;
  update public.project_competence_requests set competence_id = v_comp where id = p_id;
  insert into public.project_competence_events (project_id, competence_id, action, target_user_id, competence, actor_user_id, actor_tier, detail)
  values (q.project_id, v_comp, 'GRANTED', q.target_user_id, q.competence, v_uid, 'VALIDATOR_' || v_kind,
          jsonb_build_object('requestId', p_id, 'validatorKind', v_kind, 'evidenceDocumentId', q.evidence_document_id,
            'hasRegistrationNumber', q.registration_number is not null,
            'note', 'Habilitação validada por pessoa independente; o sistema não valida o registro junto ao conselho (CREA/OAB declarado não é a prova).'));
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (q.project_id, 'USER', v_uid, 'PROJECT_COMPETENCE_GRANTED', 'PROJECT_COMPETENCE', v_comp::text,
          jsonb_build_object('targetUserId', q.target_user_id, 'competence', q.competence, 'requestId', p_id, 'validatorKind', v_kind)::text);
  perform public.acc_competence_gov_event(q.project_id, p_id, null, 'APPROVED', v_kind,
    jsonb_build_object('competenceId', v_comp, 'targetUserId', q.target_user_id, 'competence', q.competence, 'note', v_note));
  return jsonb_build_object('id', p_id, 'status', 'APPROVED', 'competenceId', v_comp, 'validatorKind', v_kind, 'rowVersion', q.row_version + 1,
    'grantsAuthority', true);
end;
$$;

-- ---------- 4) Validador designado: designar (ADMIN), aceitar (o próprio designado), revogar ----------
create or replace function public.project_competence_validator_designate(
  p_project_id uuid, p_user_id uuid, p_designation_document_id uuid, p_reason text, p_valid_until date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) <> 'ADMIN' then raise exception 'FORBIDDEN: só o administrador do projeto designa validador'; end if;
  if p_user_id is null or p_user_id = v_uid then raise exception 'SELF_DESIGNATION_FORBIDDEN: o validador não pode ser quem designa'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_user_id) then raise exception 'INVALID_VALIDATOR: perfil inexistente'; end if;
  if p_designation_document_id is null or not exists (select 1 from public.documents d where d.id = p_designation_document_id and d.project_id = p_project_id) then
    raise exception 'EVIDENCE_REQUIRED: anexe ao projeto o documento da designação (ata, ofício da diretoria) e informe-o';
  end if;
  if v_reason is null or char_length(v_reason) < 20 then raise exception 'REASON_REQUIRED: justifique a designação (mín. 20 caracteres)'; end if;
  if p_valid_until is null or p_valid_until < current_date or p_valid_until > current_date + 180 then
    raise exception 'INVALID_VALIDITY: o prazo da designação vai até hoje + 180 dias';
  end if;
  if exists (select 1 from public.project_competence_validators v where v.project_id = p_project_id and v.user_id = p_user_id and v.status in ('PROPOSED', 'ACTIVE')) then
    raise exception 'ALREADY_DESIGNATED';
  end if;
  insert into public.project_competence_validators (project_id, user_id, designated_by, designation_document_id, reason, valid_until)
  values (p_project_id, p_user_id, v_uid, p_designation_document_id, v_reason, p_valid_until) returning id into v_id;
  perform public.acc_competence_gov_event(p_project_id, null, v_id, 'VALIDATOR_DESIGNATED', 'ADMIN',
    jsonb_build_object('validatorUserId', p_user_id, 'validUntil', p_valid_until, 'documentId', p_designation_document_id,
      'note', 'Designação só vale depois do ACEITE do próprio designado.'));
  return jsonb_build_object('id', v_id, 'status', 'PROPOSED', 'validUntil', p_valid_until, 'rowVersion', 1);
end;
$$;

create or replace function public.project_competence_validator_accept(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.project_competence_validators%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.project_competence_validators where id = p_id for update;
  if not found or v.user_id <> v_uid then raise exception 'FORBIDDEN: só o próprio designado aceita'; end if;
  if v.status <> 'PROPOSED' then raise exception 'NOT_PROPOSED'; end if;
  if v.valid_until < current_date then raise exception 'INVALID_VALIDITY: a designação já venceu'; end if;
  update public.project_competence_validators set status = 'ACTIVE', accepted_at = now(), row_version = row_version + 1 where id = p_id;
  perform public.acc_competence_gov_event(v.project_id, null, p_id, 'VALIDATOR_ACCEPTED', 'DESIGNATED', jsonb_build_object('validUntil', v.valid_until));
  return jsonb_build_object('id', p_id, 'status', 'ACTIVE', 'rowVersion', v.row_version + 1);
end;
$$;

create or replace function public.project_competence_validator_revoke(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v public.project_competence_validators%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.project_competence_validators where id = p_id for update;
  if not found or (v.user_id <> v_uid and public.acc_project_tier(v.project_id) <> 'ADMIN') then raise exception 'FORBIDDEN: só administrador do projeto ou o próprio designado revoga'; end if;
  if v.status = 'REVOKED' then raise exception 'ALREADY_REVOKED'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'REASON_REQUIRED: informe o motivo (mín. 10 caracteres)'; end if;
  update public.project_competence_validators set status = 'REVOKED', revoked_by = v_uid, revoked_at = now(), revoke_reason = v_reason, row_version = row_version + 1 where id = p_id;
  perform public.acc_competence_gov_event(v.project_id, null, p_id, 'VALIDATOR_REVOKED', case when v.user_id = v_uid then 'DESIGNATED' else 'ADMIN' end,
    jsonb_build_object('reason', v_reason));
  return jsonb_build_object('id', p_id, 'status', 'REVOKED', 'rowVersion', v.row_version + 1);
end;
$$;

-- ---------- Privilégios ----------
revoke all on function public.project_competence_request_create(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.project_competence_request_create(uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.project_competence_request_cancel(uuid, integer, text) from public, anon;
grant execute on function public.project_competence_request_cancel(uuid, integer, text) to authenticated;
revoke all on function public.project_competence_request_decide(uuid, integer, text, text, boolean) from public, anon;
grant execute on function public.project_competence_request_decide(uuid, integer, text, text, boolean) to authenticated;
revoke all on function public.project_competence_validator_designate(uuid, uuid, uuid, text, date) from public, anon;
grant execute on function public.project_competence_validator_designate(uuid, uuid, uuid, text, date) to authenticated;
revoke all on function public.project_competence_validator_accept(uuid) from public, anon;
grant execute on function public.project_competence_validator_accept(uuid) to authenticated;
revoke all on function public.project_competence_validator_revoke(uuid, text) from public, anon;
grant execute on function public.project_competence_validator_revoke(uuid, text) to authenticated;
revoke all on function public.project_competence_requests_guard(), public.project_competence_validators_guard() from public, anon, authenticated;

comment on table public.project_competence_requests is
  'Solicitação de competência especializada. NÃO produz poderes até validação independente de habilitação (segundo administrador ou validador designado) com evidência documental. Fase 5/E.';
comment on table public.project_competence_validators is
  'Validador designado (pessoa externa/diretoria) para organizações com administrador único: documento, prazo máximo 180 dias, aceite do designado, revogável. Fase 5/E.';
