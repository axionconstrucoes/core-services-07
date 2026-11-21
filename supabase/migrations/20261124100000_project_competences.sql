-- ============================================================
-- 20261124100000_project_competences.sql
--
-- FASE 4 / Agente A — COMPETÊNCIAS PROFISSIONAIS por membro/projeto.
--
-- Problema: acc_project_tier (Fase 3/B) mede AUTORIDADE DE GESTÃO (ADMIN/MANAGE/REGISTER/READ), não competência profissional.
-- GESTOR/GERENTE/ADMINISTRADOR não são, por causa do papel, responsável técnico nem advogado nem especialista em seguros.
-- Esta migration cria o registro EXPLÍCITO e auditável de competência; as decisões técnicas/jurídicas relevantes passam a exigir
-- a competência além do nível (migration 20261124101000).
--
--   project_competences          registro (membro, projeto, competência, validade, quem concedeu, evidência/identificação opcional)
--   project_competence_events    trilha APPEND-ONLY (concessão, revogação), com snapshot de quem agiu
--   project_competence_grant     RPC (SÓ ADMINISTRADOR do projeto; não concede a si mesmo)
--   project_competence_revoke    RPC (SÓ ADMINISTRADOR do projeto; motivo obrigatório)
--   acc_has_competence(project, competence)  — consulta fail-closed para o usuário autenticado
--   acc_user_has_competence(project, user, competences text[]) — núcleo interno (sem grant) usado por RPCs/gatilhos
--
-- Competências (lista fechada, CHECK): TECNICO_RESPONSAVEL, JURIDICO, SEGUROS.
-- A identificação profissional (CREA/CAU/OAB/SUSEP/OUTRO + número) é TEXTO OPCIONAL informado pelo administrador: o sistema NUNCA
-- a inventa, normaliza para "verdadeira" nem consulta conselho profissional (lacuna declarada em docs/permissoes-matriz-central.md).
-- Competência só vale se: registro ACTIVE, dentro da validade (valid_from <= hoje <= valid_until quando houver) e a pessoa continua
-- com membership ACTIVE no projeto (acc_project_tier <> 'NONE' para o próprio usuário; inativo/pendente/outro projeto => sem competência).
-- Fail-closed: sem usuário, sem projeto, sem registro, vencida, revogada ou competência desconhecida => FALSE.
-- Idempotente. Nenhuma migration existente é alterada.
-- ============================================================

create table if not exists public.project_competences (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  competence text not null check (competence in ('TECNICO_RESPONSAVEL', 'JURIDICO', 'SEGUROS')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVOKED')),
  valid_from date not null default current_date,
  valid_until date,
  registration_kind text check (registration_kind is null or registration_kind in ('CREA', 'CAU', 'OAB', 'SUSEP', 'OUTRO')),
  registration_number text check (registration_number is null or char_length(btrim(registration_number)) between 1 and 60),
  evidence_document_id uuid references public.documents (id) on delete restrict,
  basis_note text check (basis_note is null or char_length(basis_note) <= 1000),
  granted_by uuid not null references public.profiles (id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_by uuid references public.profiles (id) on delete restrict,
  revoked_at timestamptz,
  revoke_reason text,
  row_version integer not null default 1,
  check (valid_until is null or valid_until >= valid_from),
  check (registration_number is null or registration_kind is not null),
  check (granted_by <> user_id),
  check (status = 'ACTIVE' and revoked_at is null and revoked_by is null
         or status = 'REVOKED' and revoked_at is not null and revoked_by is not null and char_length(btrim(coalesce(revoke_reason, ''))) >= 10)
);
-- no máximo UMA competência ativa por (projeto, pessoa, competência); a revogada fica no histórico
create unique index if not exists project_competences_one_active_idx on public.project_competences (project_id, user_id, competence) where status = 'ACTIVE';
create index if not exists project_competences_lookup_idx on public.project_competences (project_id, user_id, status);

create table if not exists public.project_competence_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  competence_id uuid not null references public.project_competences (id) on delete restrict,
  action text not null check (action in ('GRANTED', 'REVOKED')),
  target_user_id uuid not null references public.profiles (id) on delete restrict,
  competence text not null,
  actor_user_id uuid not null references public.profiles (id) on delete restrict,
  actor_tier text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists project_competence_events_project_idx on public.project_competence_events (project_id, created_at);

-- append-only (UPDATE/DELETE/TRUNCATE bloqueados) nos EVENTOS; o registro só muda por revogação (RPC), nunca é apagado
drop trigger if exists project_competence_events_append_only on public.project_competence_events;
create trigger project_competence_events_append_only before update or delete on public.project_competence_events
  for each row execute function public.insurance_block_mutation();
drop trigger if exists project_competence_events_no_truncate on public.project_competence_events;
create trigger project_competence_events_no_truncate before truncate on public.project_competence_events
  for each statement execute function public.insurance_block_mutation();

create or replace function public.project_competences_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then raise exception 'COMPETENCE_IMMUTABLE: competência não é apagada; revogue'; end if;
  if tg_op = 'UPDATE' then
    if new.project_id is distinct from old.project_id or new.user_id is distinct from old.user_id or new.competence is distinct from old.competence
       or new.granted_by is distinct from old.granted_by or new.granted_at is distinct from old.granted_at
       or new.valid_from is distinct from old.valid_from or new.valid_until is distinct from old.valid_until
       or new.registration_kind is distinct from old.registration_kind or new.registration_number is distinct from old.registration_number
       or new.evidence_document_id is distinct from old.evidence_document_id or new.basis_note is distinct from old.basis_note then
      raise exception 'COMPETENCE_IMMUTABLE: só a revogação altera o registro';
    end if;
    if old.status = 'REVOKED' then raise exception 'COMPETENCE_IMMUTABLE: competência revogada não é reaberta; conceda novamente'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists project_competences_guard_trg on public.project_competences;
create trigger project_competences_guard_trg before update or delete on public.project_competences
  for each row execute function public.project_competences_guard();
drop trigger if exists project_competences_no_truncate on public.project_competences;
create trigger project_competences_no_truncate before truncate on public.project_competences
  for each statement execute function public.insurance_block_mutation();

-- RLS: leitura só do próprio registro ou por gestão do projeto; ZERO escrita direta (só RPC security definer)
alter table public.project_competences enable row level security;
alter table public.project_competence_events enable row level security;
drop policy if exists project_competences_select on public.project_competences;
create policy project_competences_select on public.project_competences for select to authenticated
  using (user_id = auth.uid() or public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
drop policy if exists project_competence_events_select on public.project_competence_events;
create policy project_competence_events_select on public.project_competence_events for select to authenticated
  using (public.acc_project_tier(project_id) in ('ADMIN', 'MANAGE'));
revoke all on public.project_competences, public.project_competence_events from public, anon, authenticated;
grant select on public.project_competences, public.project_competence_events to authenticated;

-- ---------- Núcleo interno: o usuário X tem alguma das competências no projeto, hoje? (sem grant) ----------
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
         and c.competence = any (p_competences)
         and c.valid_from <= current_date and (c.valid_until is null or c.valid_until >= current_date));
$$;

-- ---------- Consulta pública (authenticated): o PRÓPRIO usuário tem a competência no projeto? ----------
create or replace function public.acc_has_competence(p_project_id uuid, p_competence text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.acc_user_has_competence(p_project_id, auth.uid(), array[p_competence]), false);
$$;

-- ---------- Concessão (somente ADMINISTRADOR; nunca a si mesmo; auditoria na mesma transação) ----------
create or replace function public.project_competence_grant(p_project_id uuid, p_user_id uuid, p_competence text, p_data jsonb default '{}'::jsonb)
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
  if p_project_id is null or public.acc_project_tier(p_project_id) <> 'ADMIN' then raise exception 'FORBIDDEN: só o administrador do projeto concede competência'; end if;
  if p_user_id is null or p_competence is null or p_competence not in ('TECNICO_RESPONSAVEL', 'JURIDICO', 'SEGUROS') then raise exception 'INVALID_COMPETENCE'; end if;
  if p_user_id = v_uid then raise exception 'SELF_GRANT_FORBIDDEN: o administrador não concede competência a si mesmo; outro administrador precisa conceder'; end if;
  if not exists (select 1 from public.project_memberships pm where pm.project_id = p_project_id and pm.user_id = p_user_id and pm.status = 'ACTIVE') then
    raise exception 'TARGET_NOT_ACTIVE_MEMBER: a pessoa precisa ser membro ATIVO do projeto';
  end if;
  begin
    v_from := coalesce(nullif(p_data ->> 'valid_from', '')::date, current_date);
    v_until := nullif(p_data ->> 'valid_until', '')::date;
    v_doc := nullif(p_data ->> 'evidence_document_id', '')::uuid;
  exception when others then raise exception 'INVALID_INPUT: datas ou identificador de documento inválidos';
  end;
  if v_until is not null and v_until < v_from then raise exception 'INVALID_VALIDITY: o fim da validade é anterior ao início'; end if;
  if v_until is not null and v_until < current_date then raise exception 'INVALID_VALIDITY: a validade informada já terminou'; end if;
  if v_kind is not null and v_kind not in ('CREA', 'CAU', 'OAB', 'SUSEP', 'OUTRO') then raise exception 'INVALID_REGISTRATION_KIND'; end if;
  if v_num is not null and (v_kind is null or char_length(v_num) > 60) then raise exception 'INVALID_REGISTRATION: informe o tipo do registro e um número de até 60 caracteres'; end if;
  if v_note is not null and char_length(v_note) > 1000 then raise exception 'INVALID_INPUT: observação longa demais'; end if;
  if v_doc is not null and not exists (select 1 from public.documents d where d.id = v_doc and d.project_id = p_project_id) then
    raise exception 'REFERENCE_OUT_OF_PROJECT: documento de evidência inexistente ou de outro projeto';
  end if;
  -- serializa concessões da mesma tripla
  perform pg_advisory_xact_lock(hashtextextended('acc-competence:' || p_project_id::text || p_user_id::text || p_competence, 0));
  if exists (select 1 from public.project_competences c where c.project_id = p_project_id and c.user_id = p_user_id and c.competence = p_competence and c.status = 'ACTIVE') then
    raise exception 'ALREADY_ACTIVE: já existe esta competência ativa para a pessoa; revogue antes de conceder de novo';
  end if;
  insert into public.project_competences (project_id, user_id, competence, valid_from, valid_until, registration_kind, registration_number,
                                          evidence_document_id, basis_note, granted_by)
  values (p_project_id, p_user_id, p_competence, v_from, v_until, v_kind, v_num, v_doc, v_note, v_uid)
  returning id into v_id;
  insert into public.project_competence_events (project_id, competence_id, action, target_user_id, competence, actor_user_id, actor_tier, detail)
  values (p_project_id, v_id, 'GRANTED', p_user_id, p_competence, v_uid, 'ADMIN',
          jsonb_build_object('validFrom', v_from, 'validUntil', v_until, 'registrationKind', v_kind, 'hasRegistrationNumber', v_num is not null,
            'evidenceDocumentId', v_doc, 'note', 'Registro declarado pelo administrador; o sistema não valida o registro junto ao conselho.'));
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (p_project_id, 'USER', v_uid, 'PROJECT_COMPETENCE_GRANTED', 'PROJECT_COMPETENCE', v_id::text,
          jsonb_build_object('targetUserId', p_user_id, 'competence', p_competence, 'validFrom', v_from, 'validUntil', v_until)::text);
  return jsonb_build_object('id', v_id, 'competence', p_competence, 'userId', p_user_id, 'status', 'ACTIVE', 'validFrom', v_from, 'validUntil', v_until, 'rowVersion', 1);
end;
$$;

-- ---------- Revogação (somente ADMINISTRADOR; motivo obrigatório; concorrência otimista) ----------
create or replace function public.project_competence_revoke(p_id uuid, p_expected_row_version integer, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.project_competences%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.project_competences where id = p_id for update;
  if not found or public.acc_project_tier(c.project_id) <> 'ADMIN' then raise exception 'FORBIDDEN: só o administrador do projeto revoga competência'; end if;
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if c.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, c.row_version; end if;
  if c.status <> 'ACTIVE' then raise exception 'ALREADY_REVOKED'; end if;
  if v_reason is null or char_length(v_reason) < 10 then raise exception 'REASON_REQUIRED: informe o motivo (mín. 10 caracteres)'; end if;
  update public.project_competences set status = 'REVOKED', revoked_by = v_uid, revoked_at = now(), revoke_reason = v_reason, row_version = row_version + 1 where id = p_id;
  insert into public.project_competence_events (project_id, competence_id, action, target_user_id, competence, actor_user_id, actor_tier, detail)
  values (c.project_id, p_id, 'REVOKED', c.user_id, c.competence, v_uid, 'ADMIN', jsonb_build_object('reason', v_reason));
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (c.project_id, 'USER', v_uid, 'PROJECT_COMPETENCE_REVOKED', 'PROJECT_COMPETENCE', p_id::text,
          jsonb_build_object('targetUserId', c.user_id, 'competence', c.competence, 'reason', v_reason)::text);
  return jsonb_build_object('id', p_id, 'status', 'REVOKED', 'rowVersion', c.row_version + 1);
end;
$$;

-- ---------- Privilégios ----------
revoke all on function public.acc_user_has_competence(uuid, uuid, text[]) from public, anon, authenticated;
revoke all on function public.project_competences_guard() from public, anon, authenticated;
revoke all on function public.acc_has_competence(uuid, text) from public, anon;
grant execute on function public.acc_has_competence(uuid, text) to authenticated;
revoke all on function public.project_competence_grant(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.project_competence_grant(uuid, uuid, text, jsonb) to authenticated;
revoke all on function public.project_competence_revoke(uuid, integer, text) from public, anon;
grant execute on function public.project_competence_revoke(uuid, integer, text) to authenticated;

comment on table public.project_competences is
  'Competência profissional EXPLÍCITA por membro/projeto (TECNICO_RESPONSAVEL, JURIDICO, SEGUROS). Concedida/revogada só por ADMINISTRADOR (RPC); identificação CREA/OAB é texto declarado, não validado. Fase 4/A.';
comment on function public.acc_has_competence(uuid, text) is
  'O usuário autenticado possui a competência (ativa, na validade, membro ACTIVE) no projeto? Fail-closed. Fase 4/A.';
