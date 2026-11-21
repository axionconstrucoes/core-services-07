-- ============================================================
-- 20261208100000_competence_revalidation_send_content.sql
--
-- FASE 6 / Frente H2a — (1) REVALIDAÇÃO de competências anteriores antes de atos críticos; (2) CONTEÚDO da preparação de envio externo.
--
-- (1) Competências concedidas ANTES desta migration (por autoconcessão da Fase 4, por carga de manutenção ou pela validação da Fase 5/E)
--     passam a exigir REVALIDAÇÃO por pessoa independente antes de produzir qualquer ato crítico:
--       project_competences.revalidation_status  CURRENT | REQUIRED   (linhas existentes => REQUIRED; novas => CURRENT)
--       acc_user_has_competence REDEFINIDA: só conta competência com revalidation_status = 'CURRENT' (mais restritiva; nunca mais branda).
--       acc_int_require_competence REDEFINIDA: mesma regra, com mensagem clara COMPETENCE_REVALIDATION_REQUIRED quando a pessoa TEM a
--         competência mas ela aguarda revalidação (gate dos atos críticos: etapas de sinistro, aprovação de minuta, estado da Qualidade).
--       RPC project_competence_revalidate: ADMINISTRADOR do projeto OU validador designado ATIVO, que NÃO seja a pessoa e NÃO seja quem
--         concedeu a competência, confere a evidência documental (evidence_checked + nota >= 20) e a competência volta a valer.
--     Fail-closed: sem revalidação, o ato crítico é RECUSADO. Nada é concedido automaticamente. Idempotente (a marcação ocorre uma só vez,
--     no ADD COLUMN; reaplicar não remarca competências já revalidadas nem as concedidas depois).
--     A conferência de endosso crítico (20261124102000) mantém a mensagem genérica COMPETENCE_REQUIRED (o gate recusa do mesmo jeito).
-- (2) Preparação de envio externo (20261205102000) guardava só o HASH do conteúdo. external_send_preparation_contents guarda assunto,
--     corpo e anexos (append-only) para o APROVADOR ver o que está aprovando; a RPC acc_external_send_prepare_with_content valida que o
--     hash informado é o SHA-256 do JSON canônico do conteúdo (recusa divergência) e delega à RPC existente. NADA é enviado.
-- Reversível: supabase/rollbacks/20261208100000_competence_revalidation_send_content.rollback.sql.
-- ============================================================

-- ---------- (1) colunas de revalidação ----------
-- Truque idempotente: ADD COLUMN com DEFAULT 'REQUIRED' marca as linhas EXISTENTES uma única vez; depois o default passa a CURRENT.
alter table public.project_competences add column if not exists revalidation_status text not null default 'REQUIRED';
alter table public.project_competences alter column revalidation_status set default 'CURRENT';
alter table public.project_competences add column if not exists revalidated_by uuid references public.profiles (id) on delete restrict;
alter table public.project_competences add column if not exists revalidated_at timestamptz;
alter table public.project_competences add column if not exists revalidation_note text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_competences_revalidation_status_chk') then
    alter table public.project_competences add constraint project_competences_revalidation_status_chk
      check (revalidation_status in ('CURRENT', 'REQUIRED'));
  end if;
end $$;
comment on column public.project_competences.revalidation_status is
  'REQUIRED = concedida antes da Fase 6/H2a e ainda NÃO revalidada por pessoa independente (NÃO vale para atos críticos); CURRENT = vale. Nunca alterada pela aplicação, só por project_competence_revalidate.';

-- ---------- trilha: novas ações ----------
alter table public.project_competence_governance_events drop constraint if exists project_competence_governance_events_action_check;
alter table public.project_competence_governance_events add constraint project_competence_governance_events_action_check
  check (action in ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED',
    'VALIDATOR_DESIGNATED', 'VALIDATOR_ACCEPTED', 'VALIDATOR_REVOKED', 'REVALIDATED'));

-- ---------- decisão única de competência (REDEFINIÇÃO justificada acima): acrescenta revalidation_status = CURRENT ----------
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
         and c.revalidation_status = 'CURRENT'
         and c.competence = any (p_competences)
         and c.valid_from <= current_date and (c.valid_until is null or c.valid_until >= current_date));
$$;
revoke all on function public.acc_user_has_competence(uuid, uuid, text[]) from public, anon, authenticated;

-- ---------- gate central dos atos críticos (REDEFINIÇÃO justificada): mensagem clara de revalidação ----------
create or replace function public.acc_int_require_competence(p_project_id uuid, p_actor uuid, p_competences text[], p_act text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null then return; end if; -- sem autor atribuído: só carga de manutenção (RPCs sempre gravam auth.uid())
  if not public.acc_user_has_competence(p_project_id, p_actor, p_competences) then
    if exists (
      select 1 from public.project_competences c
       where c.project_id = p_project_id and c.user_id = p_actor and c.status = 'ACTIVE' and c.revalidation_status = 'REQUIRED'
         and c.competence = any (p_competences)) then
      raise exception 'COMPETENCE_REVALIDATION_REQUIRED: % exige competência % REVALIDADA por pessoa independente; a sua foi concedida antes da regra de revalidação (peça a um administrador ou validador designado)',
        p_act, array_to_string(p_competences, ' ou ');
    end if;
    raise exception 'COMPETENCE_REQUIRED: % exige competência % registrada para você neste projeto (nível de gestão não substitui)',
      p_act, array_to_string(p_competences, ' ou ');
  end if;
end;
$$;
revoke all on function public.acc_int_require_competence(uuid, uuid, text[], text) from public, anon, authenticated;

-- ---------- RPC: REVALIDAR competência (independente da pessoa e de quem a concedeu) ----------
create or replace function public.project_competence_revalidate(
  p_id uuid, p_expected_row_version integer, p_note text, p_evidence_checked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  c public.project_competences%rowtype;
  v_role text;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into c from public.project_competences where id = p_id for update;
  if not found then raise exception 'FORBIDDEN'; end if;
  if v_uid = c.user_id or v_uid = c.granted_by then
    raise exception 'INDEPENDENT_VALIDATOR_REQUIRED: quem recebeu a competência ou a concedeu não pode revalidá-la';
  end if;
  if public.acc_project_tier(c.project_id) = 'ADMIN' then v_role := 'SECOND_ADMIN';
  elsif public.acc_is_designated_competence_validator(c.project_id, v_uid) then v_role := 'DESIGNATED';
  else raise exception 'FORBIDDEN: só administrador do projeto ou validador designado ativo revalida competência'; end if;
  if p_expected_row_version is null or c.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, c.row_version; end if;
  if c.status <> 'ACTIVE' then raise exception 'NOT_ACTIVE: a competência não está ativa'; end if;
  if c.revalidation_status <> 'REQUIRED' then raise exception 'NOT_REQUIRED: a competência não aguarda revalidação'; end if;
  if c.valid_until is not null and c.valid_until < current_date then raise exception 'INVALID_VALIDITY: a validade da competência já terminou; solicite uma nova'; end if;
  if coalesce(p_evidence_checked, false) is not true then raise exception 'EVIDENCE_CHECK_REQUIRED: confirme que a evidência documental foi conferida'; end if;
  if v_note is null or char_length(v_note) < 20 then raise exception 'NOTE_REQUIRED: descreva o que foi conferido (mín. 20 caracteres)'; end if;
  if c.evidence_document_id is null or not exists (select 1 from public.documents d where d.id = c.evidence_document_id and d.project_id = c.project_id) then
    raise exception 'EVIDENCE_REQUIRED: a competência não tem documento de evidência no projeto; revogue e solicite de novo com a evidência';
  end if;
  if not exists (select 1 from public.project_memberships pm where pm.project_id = c.project_id and pm.user_id = c.user_id and pm.status = 'ACTIVE') then
    raise exception 'TARGET_NOT_ACTIVE_MEMBER: a pessoa deixou de ser membro ativo do projeto';
  end if;
  update public.project_competences
     set revalidation_status = 'CURRENT', revalidated_by = v_uid, revalidated_at = now(), revalidation_note = v_note, row_version = row_version + 1
   where id = p_id;
  insert into public.project_competence_governance_events (project_id, action, actor_user_id, actor_role, detail)
  values (c.project_id, 'REVALIDATED', v_uid, v_role,
    jsonb_build_object('competenceId', p_id, 'targetUserId', c.user_id, 'competence', c.competence, 'note', v_note,
      'evidenceDocumentId', c.evidence_document_id, 'grantedBy', c.granted_by));
  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (c.project_id, 'USER', v_uid, 'COMPETENCE_GOV_REVALIDATED', 'PROJECT_COMPETENCE', p_id::text,
          jsonb_build_object('targetUserId', c.user_id, 'competence', c.competence, 'validatorKind', v_role)::text);
  return jsonb_build_object('id', p_id, 'revalidationStatus', 'CURRENT', 'validatorKind', v_role, 'rowVersion', c.row_version + 1);
end;
$$;
revoke all on function public.project_competence_revalidate(uuid, integer, text, boolean) from public, anon;
grant execute on function public.project_competence_revalidate(uuid, integer, text, boolean) to authenticated;

-- ---------- (2) conteúdo da preparação de envio externo (append-only) ----------
create table if not exists public.external_send_preparation_contents (
  preparation_id uuid primary key references public.external_send_preparations (id) on delete restrict,
  project_id uuid not null references public.projects (id) on delete restrict,
  subject text not null default '' check (char_length(subject) <= 300),
  body text not null check (char_length(body) between 1 and 20000),
  attachments text[] not null default '{}' check (cardinality(attachments) <= 20),
  created_at timestamptz not null default now()
);
drop trigger if exists external_send_preparation_contents_append_only on public.external_send_preparation_contents;
create trigger external_send_preparation_contents_append_only before update or delete on public.external_send_preparation_contents
  for each row execute function public.insurance_block_mutation();
drop trigger if exists external_send_preparation_contents_no_truncate on public.external_send_preparation_contents;
create trigger external_send_preparation_contents_no_truncate before truncate on public.external_send_preparation_contents
  for each statement execute function public.insurance_block_mutation();
alter table public.external_send_preparation_contents enable row level security;
drop policy if exists external_send_preparation_contents_select on public.external_send_preparation_contents;
create policy external_send_preparation_contents_select on public.external_send_preparation_contents for select to authenticated
  using (exists (select 1 from public.external_send_preparations p where p.id = preparation_id
                 and (p.prepared_by = auth.uid() or public.acc_project_tier(p.project_id) in ('MANAGE', 'ADMIN'))));
revoke all on public.external_send_preparation_contents from public, anon, authenticated;
grant select on public.external_send_preparation_contents to authenticated;

-- SHA-256 do JSON canônico {"subject":..,"body":..,"attachments":[..]} — o MESMO texto que hashExternalSendContent (TypeScript) calcula
-- com JSON.stringify sobre o conteúdo já normalizado (LF, aparado, anexos aparados e ordenados pela aplicação).
create or replace function public.acc_external_send_content_hash(p_subject text, p_body text, p_attachments text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(sha256(convert_to(
    '{"subject":' || to_json(coalesce(p_subject, ''))::text
    || ',"body":' || to_json(coalesce(p_body, ''))::text
    || ',"attachments":[' || coalesce((select string_agg(to_json(a)::text, ',' order by o) from unnest(coalesce(p_attachments, '{}'::text[])) with ordinality t(a, o)), '')
    || ']}', 'UTF8')), 'hex');
$$;
revoke all on function public.acc_external_send_content_hash(text, text, text[]) from public, anon, authenticated;

create or replace function public.acc_external_send_prepare_with_content(
  p_project_id uuid, p_context text, p_action text, p_recipients text[], p_content_hash text, p_content_version text,
  p_subject text, p_body text, p_attachments text[] default '{}',
  p_entity_type text default null, p_entity_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_body is null or char_length(btrim(p_body)) = 0 then raise exception 'CONTENT_REQUIRED: informe o texto do envio'; end if;
  if char_length(p_body) > 20000 or char_length(coalesce(p_subject, '')) > 300 or cardinality(coalesce(p_attachments, '{}'::text[])) > 20 then
    raise exception 'CONTENT_TOO_LARGE: assunto até 300, corpo até 20000 caracteres e até 20 anexos';
  end if;
  if p_content_hash is distinct from public.acc_external_send_content_hash(p_subject, p_body, p_attachments) then
    raise exception 'CONTENT_HASH_MISMATCH: o hash informado não é o SHA-256 do conteúdo enviado; recalcule';
  end if;
  v_res := public.acc_external_send_prepare(p_project_id, p_context, p_action, p_recipients, p_content_hash, p_content_version, p_entity_type, p_entity_id);
  v_id := (v_res ->> 'id')::uuid;
  insert into public.external_send_preparation_contents (preparation_id, project_id, subject, body, attachments)
  values (v_id, p_project_id, coalesce(p_subject, ''), p_body, coalesce(p_attachments, '{}'::text[]));
  return v_res;
end;
$$;
revoke all on function public.acc_external_send_prepare_with_content(uuid, text, text, text[], text, text, text, text, text[], text, uuid) from public, anon;
grant execute on function public.acc_external_send_prepare_with_content(uuid, text, text, text[], text, text, text, text, text[], text, uuid) to authenticated;

comment on table public.external_send_preparation_contents is
  'Conteúdo (assunto, corpo, anexos) da preparação de envio externo, para o aprovador ver o que aprova. Append-only. Nada é enviado. Fase 6/H2a.';
