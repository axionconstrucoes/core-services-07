-- ============================================================
-- 20261123200000_endorsement_dual_review.sql
--
-- FASE 3 / Frente C — Endossos com DUPLA CONFERÊNCIA HUMANA INDEPENDENTE.
--
-- Antes: SOLICITADO -> EM_ANALISE -> EMITIDO -> CONFERIDO (RECUSADO), com UM conferente (insurance_endorsement_advance).
-- Agora, para endossos que ALTERAM itens críticos (segurados, beneficiários/partes, obrigações garantidas, valores — importância
-- segurada, limites, prêmio, valor garantido — ou coberturas — cláusulas, exclusões, sublimites, franquias):
--   * DUAS conferências humanas aprovadas, de usuários distintos entre si, ambos com nível MANAGE (insurance_access);
--   * nenhum dos dois pode ser quem SOLICITOU o endosso nem quem REGISTROU A EMISSÃO (regra mais estrita adotada);
--   * impossível no banco (CHECK em insurance_endorsement_reviews + UNIQUE por rodada + trigger de guarda), não só na tela;
--   * o endosso só vira CONFERIDO (e só então coverage_effective = true) após as duas aprovações; uma RECUSA de qualquer
--     conferente leva ao estado EM_REVISAO, sem efeito de cobertura; EM_REVISAO sai por nova emissão (nova rodada de
--     conferências) ou por RECUSADO.
-- Classificação fail-closed: coluna declarada `change_kinds` (valores validados). Sem classificação válida = crítico. Mesmo
-- classificado como não crítico, texto emitido DIVERGENTE do solicitado exige dupla conferência (o texto emitido pode trazer
-- alteração crítica que ninguém pediu). A classificação nunca é rebaixada depois de crítica.
-- Dados legados: endossos já CONFERIDO permanecem válidos, inalterados, marcados legacy_single_review = true (conferência única
-- histórica; flag imutável e impossível de atribuir a linhas novas).
--
-- Funções redefinidas (mesma assinatura e mesmos GRANTs; esta é a definição vigente/mais recente):
--   insurance_endorsement_request   — passa a aceitar/validar change_kinds;
--   insurance_endorsement_advance   — 'CONFERIDO' delega a insurance_endorsement_review (nunca confere sozinho); EM_REVISAO
--                                     -> EMITIDO/RECUSADO; classificação na emissão (só aumenta criticidade);
--   insurance_dashboard_items       — EM_REVISAO aparece como ENDOSSO_PENDENTE (severidade REVISAO_PENDENTE).
-- Nenhuma migration existente e nenhuma função de risco/SLA é tocada. Idempotente.
-- ============================================================

-- ---------- Tabela de conferências (append-only) ----------
create table if not exists public.insurance_endorsement_reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  endorsement_id uuid not null references public.insurance_endorsements (id) on delete restrict,
  review_round integer not null check (review_round >= 1),
  review_no integer not null check (review_no in (1, 2)),
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  outcome text not null check (outcome in ('APROVADO', 'RECUSADO')),
  note text,
  texts_match boolean,
  dual_required boolean not null,
  requested_by_snapshot uuid,
  issued_by_snapshot uuid,
  reviewed_at timestamptz not null default now(),
  unique (endorsement_id, review_round, reviewer_id),
  unique (endorsement_id, review_round, review_no),
  check (outcome <> 'RECUSADO' or char_length(btrim(coalesce(note, ''))) >= 20),
  check (outcome <> 'APROVADO' or texts_match is true or char_length(btrim(coalesce(note, ''))) >= 20),
  -- INDEPENDÊNCIA: na dupla conferência o conferente não é quem solicitou nem quem registrou a emissão.
  check (not dual_required or (requested_by_snapshot is not null and issued_by_snapshot is not null
         and reviewer_id <> requested_by_snapshot and reviewer_id <> issued_by_snapshot))
);
create index if not exists insurance_endorsement_reviews_endorsement_idx on public.insurance_endorsement_reviews (endorsement_id, review_round);
create index if not exists insurance_endorsement_reviews_project_idx on public.insurance_endorsement_reviews (project_id);

-- ---------- Colunas novas do endosso ----------
alter table public.insurance_endorsements add column if not exists change_kinds text[];
alter table public.insurance_endorsements add column if not exists requires_dual_review boolean not null default true;
alter table public.insurance_endorsements add column if not exists dual_review_reason text default 'SEM_CLASSIFICACAO';
alter table public.insurance_endorsements add column if not exists legacy_single_review boolean not null default false;
alter table public.insurance_endorsements add column if not exists review_round integer not null default 1;

-- Estado EM_REVISAO (substitui o CHECK de estados; o nome gerado pode variar, então localiza pelo conteúdo).
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.insurance_endorsements'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%SOLICITADO%' and pg_get_constraintdef(oid) like '%EM_ANALISE%'
              and pg_get_constraintdef(oid) not like '%EM_REVISAO%' loop
    execute format('alter table public.insurance_endorsements drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.insurance_endorsements'::regclass and conname = 'insurance_endorsements_state_values_check') then
    alter table public.insurance_endorsements add constraint insurance_endorsements_state_values_check
      check (state in ('SOLICITADO', 'EM_ANALISE', 'EMITIDO', 'CONFERIDO', 'RECUSADO', 'EM_REVISAO'));
  end if;
end $$;

-- ---------- Legado: endossos já CONFERIDO seguem válidos (conferência única histórica), sem perda ----------
-- Só linhas CONFERIDO sem nenhuma conferência registrada (as do fluxo novo têm conferências e ficam de fora: idempotente).
update public.insurance_endorsements e
   set legacy_single_review = true, requires_dual_review = false, dual_review_reason = null
 where e.state = 'CONFERIDO' and e.legacy_single_review = false
   and not exists (select 1 from public.insurance_endorsement_reviews r where r.endorsement_id = e.id);

-- ---------- Constraints de classificação ----------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.insurance_endorsements'::regclass and conname = 'insurance_endorsements_change_kinds_known_check') then
    alter table public.insurance_endorsements add constraint insurance_endorsements_change_kinds_known_check
      check (change_kinds is null or change_kinds <@ array[
        'SEGURADO', 'BENEFICIARIO_PARTES', 'OBRIGACAO_GARANTIDA', 'VALOR_IMPORTANCIA_SEGURADA', 'VALOR_LIMITE', 'VALOR_PREMIO',
        'VALOR_GARANTIDO', 'COBERTURA_CLAUSULA', 'COBERTURA_EXCLUSAO', 'COBERTURA_SUBLIMITE', 'COBERTURA_FRANQUIA',
        'PRORROGACAO_VIGENCIA', 'DADOS_CADASTRAIS', 'OUTRO_NAO_CRITICO']::text[]);
  end if;
  -- FAIL-CLOSED no banco: conferência simples só com classificação válida e inteiramente não crítica (ou legado).
  if not exists (select 1 from pg_constraint where conrelid = 'public.insurance_endorsements'::regclass and conname = 'insurance_endorsements_dual_classification_check') then
    alter table public.insurance_endorsements add constraint insurance_endorsements_dual_classification_check
      check (
        (requires_dual_review and dual_review_reason is not null)
        or (not requires_dual_review and dual_review_reason is null and (
              legacy_single_review
              or (change_kinds is not null and cardinality(change_kinds) > 0
                  and change_kinds <@ array['PRORROGACAO_VIGENCIA', 'DADOS_CADASTRAIS', 'OUTRO_NAO_CRITICO']::text[])))
      );
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.insurance_endorsements'::regclass and conname = 'insurance_endorsements_review_round_check') then
    alter table public.insurance_endorsements add constraint insurance_endorsements_review_round_check check (review_round >= 1);
  end if;
end $$;

-- ---------- Helpers internos (sem grant) ----------
create or replace function public.insurance_int_endorsement_kinds(p_data jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v jsonb := p_data -> 'change_kinds';
  r text[];
begin
  if v is null or jsonb_typeof(v) = 'null' then return null; end if;
  if jsonb_typeof(v) <> 'array' then raise exception 'INVALID_CHANGE_KINDS: informe uma lista'; end if;
  select coalesce(array_agg(distinct k order by k), '{}'::text[]) into r
    from (select upper(btrim(x)) as k from jsonb_array_elements_text(v) x) s where k <> '';
  if not (r <@ array[
        'SEGURADO', 'BENEFICIARIO_PARTES', 'OBRIGACAO_GARANTIDA', 'VALOR_IMPORTANCIA_SEGURADA', 'VALOR_LIMITE', 'VALOR_PREMIO',
        'VALOR_GARANTIDO', 'COBERTURA_CLAUSULA', 'COBERTURA_EXCLUSAO', 'COBERTURA_SUBLIMITE', 'COBERTURA_FRANQUIA',
        'PRORROGACAO_VIGENCIA', 'DADOS_CADASTRAIS', 'OUTRO_NAO_CRITICO']::text[]) then
    raise exception 'INVALID_CHANGE_KINDS: valor desconhecido';
  end if;
  return r;
end;
$$;

-- Motivo da dupla conferência (NULL = conferência simples). Fail-closed: sem classificação válida = crítico.
create or replace function public.insurance_int_endorsement_dual_reason(p_kinds text[], p_texts_match boolean)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kinds is null or cardinality(p_kinds) = 0 then 'SEM_CLASSIFICACAO'
    when not (p_kinds <@ array['PRORROGACAO_VIGENCIA', 'DADOS_CADASTRAIS', 'OUTRO_NAO_CRITICO']::text[]) then 'CLASSIFICACAO_CRITICA'
    when p_texts_match is false then 'TEXTO_DIVERGENTE'
    else null
  end;
$$;

-- ---------- Trigger: prepara a conferência (snapshots vindos do endosso; o cliente não os controla) ----------
create or replace function public.insurance_endorsement_review_prepare()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare e public.insurance_endorsements%rowtype;
begin
  select * into e from public.insurance_endorsements where id = new.endorsement_id for share;
  if not found then raise exception 'NOT_FOUND'; end if;
  if e.state <> 'EMITIDO' then raise exception 'INVALID_TRANSITION: % -> conferência', e.state; end if;
  new.project_id := e.project_id;
  new.review_round := e.review_round;
  new.dual_required := e.requires_dual_review;
  new.requested_by_snapshot := e.requested_by;
  new.issued_by_snapshot := e.issued_by;
  new.texts_match := e.texts_match;
  new.review_no := (select count(*) + 1 from public.insurance_endorsement_reviews r where r.endorsement_id = new.endorsement_id and r.review_round = e.review_round);
  return new;
end;
$$;

-- ---------- Trigger: guarda do endosso (vale também para superusuário; só session_replication_role/disable trigger a contorna) ----------
create or replace function public.insurance_endorsement_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approved integer;
  v_refused integer;
  v_need integer;
begin
  if tg_op = 'INSERT' then
    if new.legacy_single_review then raise exception 'LEGACY_FLAG_IMMUTABLE: endosso novo não pode ser legado'; end if;
  else
    if new.legacy_single_review is distinct from old.legacy_single_review then raise exception 'LEGACY_FLAG_IMMUTABLE'; end if;
    if old.state = 'CONFERIDO' and new.state <> 'CONFERIDO' then raise exception 'INVALID_TRANSITION: endosso CONFERIDO não é reaberto'; end if;
    if old.requires_dual_review and not new.requires_dual_review and not new.legacy_single_review then
      raise exception 'CLASSIFICATION_DOWNGRADE: a dupla conferência exigida não pode ser removida';
    end if;
  end if;

  if new.state = 'CONFERIDO' and (tg_op = 'INSERT' or old.state is distinct from 'CONFERIDO') and not new.legacy_single_review then
    select count(*) filter (where outcome = 'APROVADO'), count(*) filter (where outcome = 'RECUSADO') into v_approved, v_refused
      from public.insurance_endorsement_reviews where endorsement_id = new.id and review_round = new.review_round;
    if v_refused > 0 then raise exception 'DUAL_REVIEW_REQUIRED: há conferência recusada na rodada'; end if;
    v_need := case when new.requires_dual_review then 2 else 1 end;
    if v_approved < v_need then
      raise exception 'DUAL_REVIEW_REQUIRED: % conferência(s) aprovada(s) de % exigida(s)', v_approved, v_need;
    end if;
    if not new.requires_dual_review and new.texts_match is not true then
      raise exception 'DUAL_REVIEW_REQUIRED: texto emitido divergente exige dupla conferência';
    end if;
  end if;

  if new.state = 'EM_REVISAO' and (tg_op = 'INSERT' or old.state is distinct from 'EM_REVISAO') then
    if not exists (select 1 from public.insurance_endorsement_reviews where endorsement_id = new.id and review_round = new.review_round and outcome = 'RECUSADO') then
      raise exception 'INVALID_TRANSITION: EM_REVISAO exige conferência recusada na rodada';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists insurance_endorsement_reviews_prepare on public.insurance_endorsement_reviews;
create trigger insurance_endorsement_reviews_prepare before insert on public.insurance_endorsement_reviews
  for each row execute function public.insurance_endorsement_review_prepare();
drop trigger if exists insurance_endorsements_guard on public.insurance_endorsements;
create trigger insurance_endorsements_guard before insert or update on public.insurance_endorsements
  for each row execute function public.insurance_endorsement_guard();

-- append-only + sem exclusão + RLS (leitura READ; ZERO escrita direta)
drop trigger if exists insurance_endorsement_reviews_append_only on public.insurance_endorsement_reviews;
create trigger insurance_endorsement_reviews_append_only before update or delete on public.insurance_endorsement_reviews
  for each row execute function public.insurance_block_mutation();
drop trigger if exists insurance_endorsement_reviews_no_truncate on public.insurance_endorsement_reviews;
create trigger insurance_endorsement_reviews_no_truncate before truncate on public.insurance_endorsement_reviews
  for each statement execute function public.insurance_block_mutation();
alter table public.insurance_endorsement_reviews enable row level security;
drop policy if exists insurance_endorsement_reviews_select_members on public.insurance_endorsement_reviews;
create policy insurance_endorsement_reviews_select_members on public.insurance_endorsement_reviews
  for select to authenticated using (public.insurance_access(project_id, 'READ'));
revoke all on public.insurance_endorsement_reviews from public, anon, authenticated;
grant select on public.insurance_endorsement_reviews to authenticated;

-- ---------- Pedido de endosso (aceita change_kinds) ----------
create or replace function public.insurance_endorsement_request(p_policy_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_uid uuid;
  v_id uuid;
  v_seq integer;
  v_doc uuid := public.insurance_int_uuid(p_data, 'request_document_id');
  v_kinds text[] := public.insurance_int_endorsement_kinds(p_data);
  v_reason text;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'REGISTER');
  perform public.insurance_int_same_project('documents', v_doc, v_proj);
  v_reason := public.insurance_int_endorsement_dual_reason(v_kinds, null);
  perform 1 from public.insurance_policies where id = p_policy_id for update; -- serializa a numeração
  select coalesce(max(endorsement_seq), 0) + 1 into v_seq from public.insurance_endorsements where policy_id = p_policy_id;
  insert into public.insurance_endorsements (project_id, policy_id, endorsement_seq, state, requested_text, requested_by, request_document_id, request_ref,
                                             change_kinds, requires_dual_review, dual_review_reason)
  values (v_proj, p_policy_id, v_seq, 'SOLICITADO', coalesce(p_data ->> 'requested_text', ''), v_uid, v_doc, public.insurance_int_text(p_data, 'request_ref'),
          nullif(v_kinds, '{}'::text[]), v_reason is not null, v_reason)
  returning id into v_id;
  perform public.insurance_int_audit(v_proj, 'INSURANCE_ENDORSEMENT', v_id, 'ENDORSEMENT_REQUESTED',
    jsonb_build_object('policyId', p_policy_id, 'seq', v_seq, 'coverageEffective', false, 'changeKinds', to_jsonb(v_kinds),
      'requiresDualReview', v_reason is not null, 'dualReviewReason', v_reason,
      'note', 'Pedido de endosso NÃO é endosso emitido; sem efeito de cobertura.'));
  return jsonb_build_object('id', v_id, 'seq', v_seq, 'state', 'SOLICITADO', 'coverageEffective', false, 'rowVersion', 1,
                            'requiresDualReview', v_reason is not null, 'dualReviewReason', v_reason);
end;
$$;

-- ---------- Conferência humana (simples ou dupla) ----------
create or replace function public.insurance_endorsement_review(p_id uuid, p_expected_row_version integer, p_outcome text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.insurance_endorsements%rowtype;
  v_uid uuid;
  v_note text;
  v_approved integer;
  v_required integer;
  v_all_notes text;
  v_done boolean := false;
begin
  select * into e from public.insurance_endorsements where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(e.project_id, 'MANAGE');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if e.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, e.row_version; end if;
  if p_outcome is null or p_outcome not in ('APROVADO', 'RECUSADO') then raise exception 'INVALID_OUTCOME'; end if;
  if e.state <> 'EMITIDO' then raise exception 'INVALID_TRANSITION: % -> CONFERIDO', e.state; end if;

  if e.requires_dual_review then
    if e.requested_by is not null and v_uid = e.requested_by then raise exception 'REVIEWER_IS_REQUESTER: quem solicitou o endosso não o confere'; end if;
    if e.issued_by is not null and v_uid = e.issued_by then raise exception 'REVIEWER_IS_ISSUER: quem registrou a emissão não a confere'; end if;
  end if;
  if exists (select 1 from public.insurance_endorsement_reviews r where r.endorsement_id = p_id and r.review_round = e.review_round and r.reviewer_id = v_uid) then
    raise exception 'ALREADY_REVIEWED: este usuário já conferiu este endosso na rodada atual';
  end if;

  v_note := coalesce(public.insurance_int_text(p_data, 'note'), public.insurance_int_text(p_data, 'divergence_note'));
  if p_outcome = 'RECUSADO' and char_length(coalesce(v_note, '')) < 20 then raise exception 'REVIEW_NOTE_REQUIRED'; end if;
  if p_outcome = 'APROVADO' and not coalesce(e.texts_match, false) and char_length(coalesce(v_note, '')) < 20 then raise exception 'DIVERGENCE_NOTE_REQUIRED'; end if;

  insert into public.insurance_endorsement_reviews (project_id, endorsement_id, review_round, review_no, reviewer_id, outcome, note, dual_required)
  values (e.project_id, p_id, e.review_round, 1, v_uid, p_outcome, v_note, e.requires_dual_review); -- campos derivados são refeitos pelo trigger

  v_required := case when e.requires_dual_review then 2 else 1 end;
  if p_outcome = 'RECUSADO' then
    update public.insurance_endorsements set state = 'EM_REVISAO', coverage_effective = false, row_version = row_version + 1, updated_at = now() where id = p_id;
  else
    select count(*) into v_approved from public.insurance_endorsement_reviews where endorsement_id = p_id and review_round = e.review_round and outcome = 'APROVADO';
    if v_approved >= v_required then
      select string_agg(r.note, ' | ' order by r.review_no) into v_all_notes
        from public.insurance_endorsement_reviews r where r.endorsement_id = p_id and r.review_round = e.review_round and r.note is not null;
      update public.insurance_endorsements set state = 'CONFERIDO', verified_at = now(), verified_by = v_uid, divergence_note = v_all_notes,
        comparison = jsonb_build_object('textsMatch', e.texts_match, 'source', 'sql-normalized-compare', 'reviews', v_approved, 'dual', e.requires_dual_review),
        coverage_effective = true, row_version = row_version + 1, updated_at = now() where id = p_id;
      v_done := true;
    else
      update public.insurance_endorsements set row_version = row_version + 1, updated_at = now() where id = p_id;
    end if;
  end if;

  perform public.insurance_int_audit(e.project_id, 'INSURANCE_ENDORSEMENT', p_id, 'ENDORSEMENT_REVIEW_' || p_outcome,
    jsonb_build_object('round', e.review_round, 'requiresDualReview', e.requires_dual_review, 'dualReviewReason', e.dual_review_reason,
      'approved', coalesce(v_approved, 0), 'required', v_required, 'textsMatch', e.texts_match, 'noteLength', char_length(coalesce(v_note, ''))));
  if v_done then
    perform public.insurance_int_audit(e.project_id, 'INSURANCE_ENDORSEMENT', p_id, 'ENDORSEMENT_CONFERIDO',
      jsonb_build_object('fromState', e.state, 'toState', 'CONFERIDO', 'policyId', e.policy_id, 'textsMatch', e.texts_match, 'coverageEffective', true,
        'reviews', v_approved, 'requiresDualReview', e.requires_dual_review));
  elsif p_outcome = 'RECUSADO' then
    perform public.insurance_int_audit(e.project_id, 'INSURANCE_ENDORSEMENT', p_id, 'ENDORSEMENT_EM_REVISAO',
      jsonb_build_object('fromState', e.state, 'toState', 'EM_REVISAO', 'policyId', e.policy_id, 'coverageEffective', false));
  end if;
  return (select jsonb_build_object('id', x.id, 'state', x.state, 'coverageEffective', x.coverage_effective, 'textsMatch', x.texts_match, 'rowVersion', x.row_version,
            'requiresDualReview', x.requires_dual_review, 'reviewRound', x.review_round, 'approved', coalesce(v_approved, 0), 'required', v_required)
          from public.insurance_endorsements x where x.id = p_id);
end;
$$;

-- ---------- Avanço de estado (CONFERIDO delega à conferência) ----------
create or replace function public.insurance_endorsement_advance(p_id uuid, p_expected_row_version integer, p_to_state text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e public.insurance_endorsements%rowtype;
  v_uid uuid;
  v_match boolean;
  v_issued_doc uuid;
  v_kinds text[];
  v_reason text;
  v_round integer;
begin
  -- Conferir nunca é um simples avanço: passa SEMPRE pela regra de conferência (simples/dupla, independência, auditoria).
  if p_to_state = 'CONFERIDO' then
    return public.insurance_endorsement_review(p_id, p_expected_row_version, 'APROVADO', p_data);
  end if;

  select * into e from public.insurance_endorsements where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(e.project_id, case when p_to_state = 'EM_ANALISE' then 'REGISTER' else 'MANAGE' end);
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if e.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, e.row_version; end if;
  if not (
    (e.state = 'SOLICITADO' and p_to_state in ('EM_ANALISE', 'EMITIDO', 'RECUSADO'))
    or (e.state = 'EM_ANALISE' and p_to_state in ('EMITIDO', 'RECUSADO'))
    or (e.state = 'EM_REVISAO' and p_to_state in ('EMITIDO', 'RECUSADO'))
  ) then
    raise exception 'INVALID_TRANSITION: % -> %', e.state, p_to_state;
  end if;

  if p_to_state = 'EM_ANALISE' then
    update public.insurance_endorsements set state = 'EM_ANALISE', row_version = row_version + 1, updated_at = now() where id = p_id;
  elsif p_to_state = 'EMITIDO' then
    v_issued_doc := public.insurance_int_uuid(p_data, 'issued_document_id');
    if v_issued_doc is null then raise exception 'ISSUED_DOCUMENT_REQUIRED'; end if;
    perform public.insurance_int_same_project('documents', v_issued_doc, e.project_id);
    if public.insurance_int_text(p_data, 'issued_text') is null then raise exception 'ISSUED_TEXT_REQUIRED'; end if;
    if public.insurance_int_text(p_data, 'issued_number') is null then raise exception 'ISSUED_NUMBER_REQUIRED'; end if;
    v_match := public.insurance_int_norm_text(e.requested_text) = public.insurance_int_norm_text(p_data ->> 'issued_text');
    -- classificação só AUMENTA: une o declarado no pedido com o declarado na emissão; a dupla conferência nunca é removida
    select coalesce(array_agg(distinct k order by k), '{}'::text[]) into v_kinds
      from unnest(coalesce(e.change_kinds, '{}'::text[]) || coalesce(public.insurance_int_endorsement_kinds(p_data), '{}'::text[])) k;
    v_reason := coalesce(e.dual_review_reason, public.insurance_int_endorsement_dual_reason(v_kinds, v_match));
    v_round := case when e.state = 'EM_REVISAO' then e.review_round + 1 else e.review_round end;
    update public.insurance_endorsements set state = 'EMITIDO', issued_text = p_data ->> 'issued_text', issued_at = coalesce((p_data ->> 'issued_at')::timestamptz, now()),
      issued_by = v_uid, issued_document_id = v_issued_doc, issued_number = p_data ->> 'issued_number', texts_match = v_match,
      change_kinds = nullif(v_kinds, '{}'::text[]), requires_dual_review = v_reason is not null, dual_review_reason = v_reason, review_round = v_round,
      row_version = row_version + 1, updated_at = now() where id = p_id;
  else -- RECUSADO
    if char_length(coalesce(public.insurance_int_text(p_data, 'refusal_note'), '')) < 10 then raise exception 'REFUSAL_NOTE_REQUIRED'; end if;
    update public.insurance_endorsements set state = 'RECUSADO', refusal_note = p_data ->> 'refusal_note', row_version = row_version + 1, updated_at = now() where id = p_id;
  end if;

  perform public.insurance_int_audit(e.project_id, 'INSURANCE_ENDORSEMENT', p_id, 'ENDORSEMENT_' || p_to_state,
    jsonb_build_object('fromState', e.state, 'toState', p_to_state, 'policyId', e.policy_id, 'textsMatch', v_match,
      'coverageEffective', false, 'requiresDualReview', v_reason is not null, 'dualReviewReason', v_reason));
  return (select jsonb_build_object('id', id, 'state', state, 'coverageEffective', coverage_effective, 'textsMatch', texts_match, 'rowVersion', row_version,
            'requiresDualReview', requires_dual_review, 'reviewRound', review_round)
          from public.insurance_endorsements where id = p_id);
end;
$$;

-- ---------- Privilégios ----------
revoke all on function public.insurance_endorsement_review(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.insurance_endorsement_review(uuid, integer, text, jsonb) to authenticated;
revoke all on function public.insurance_int_endorsement_kinds(jsonb) from public, anon, authenticated;
revoke all on function public.insurance_int_endorsement_dual_reason(text[], boolean) from public, anon, authenticated;
revoke all on function public.insurance_endorsement_review_prepare() from public, anon, authenticated;
revoke all on function public.insurance_endorsement_guard() from public, anon, authenticated;

-- ---------- Dashboard: EM_REVISAO também é pendência (sem efeito de cobertura) ----------
-- Corpo idêntico ao de 20261122201000, exceto o bloco ENDOSSO_PENDENTE (EM_REVISAO + detalhes de conferência).
create or replace function public.insurance_dashboard_items(p_project_id uuid default null, p_today date default current_date, p_horizon_days integer default 30)
returns table (kind text, project_id uuid, entity_type text, entity_id uuid, title text, due_date date, days_to_due integer, severity text, detail jsonb)
language sql
stable
set search_path = ''
as $$
  -- VENCIMENTO: apólices / fianças / outras garantias com fim de vigência vencido ou dentro do horizonte
  select 'VENCIMENTO', p.project_id, 'INSURANCE_POLICY', p.id, p.modality || coalesce(' ' || p.policy_number, ''), p.coverage_end,
         (p.coverage_end - p_today), case when p.coverage_end < p_today then 'VENCIDO' else 'A_VENCER' end,
         jsonb_build_object('insurer', p.insurer_name, 'status', p.status)
    from public.insurance_policies p
   where (p_project_id is null or p.project_id = p_project_id) and p.status in ('RASCUNHO', 'VIGENTE') and p.coverage_end is not null
     and p.coverage_end <= p_today + greatest(coalesce(p_horizon_days, 30), 0)
  union all
  select 'VENCIMENTO', g.project_id, 'BANK_GUARANTEE', g.id, 'FIANCA_BANCARIA' || coalesce(' ' || g.guarantee_number, ''), g.end_date,
         (g.end_date - p_today), case when g.end_date < p_today then 'VENCIDO' else 'A_VENCER' end, jsonb_build_object('bank', g.bank_name, 'status', g.status)
    from public.bank_guarantees g
   where (p_project_id is null or g.project_id = p_project_id) and g.status in ('RASCUNHO', 'VIGENTE') and g.end_date is not null
     and g.end_date <= p_today + greatest(coalesce(p_horizon_days, 30), 0)
  union all
  select 'VENCIMENTO', o.project_id, 'OTHER_GUARANTEE', o.id, o.guarantee_type || coalesce(' ' || o.issuer_name, ''), o.end_date,
         (o.end_date - p_today), case when o.end_date < p_today then 'VENCIDO' else 'A_VENCER' end, jsonb_build_object('status', o.status)
    from public.other_guarantees o
   where (p_project_id is null or o.project_id = p_project_id) and o.status in ('RASCUNHO', 'VIGENTE') and o.end_date is not null
     and o.end_date <= p_today + greatest(coalesce(p_horizon_days, 30), 0)
  union all
  -- ENDOSSO_PENDENTE: pedido/analisado/emitido ainda NÃO conferido (sem efeito de cobertura)
  select 'ENDOSSO_PENDENTE', e.project_id, 'INSURANCE_ENDORSEMENT', e.id, 'Endosso ' || e.endorsement_seq || ' (' || e.state || ')', null::date, null::integer,
         case e.state when 'EMITIDO' then 'CONFERENCIA_PENDENTE' when 'EM_REVISAO' then 'REVISAO_PENDENTE' else 'AGUARDANDO_SEGURADORA' end,
         jsonb_build_object('policyId', e.policy_id, 'state', e.state, 'coverageEffective', e.coverage_effective, 'requestedAt', e.requested_at,
                'requiresDualReview', e.requires_dual_review, 'reviewRound', e.review_round,
                'reviewsApproved', (select count(*) from public.insurance_endorsement_reviews r where r.endorsement_id = e.id and r.review_round = e.review_round and r.outcome = 'APROVADO'))
    from public.insurance_endorsements e
   where (p_project_id is null or e.project_id = p_project_id) and e.state in ('SOLICITADO', 'EM_ANALISE', 'EMITIDO', 'EM_REVISAO')
  union all
  -- GARANTIA_INSUFICIENTE: saldo não amortizado acima do limite garantido (fato) ou do valor máximo da apólice vinculada
  select 'GARANTIA_INSUFICIENTE', a.project_id, 'INSURANCE_ADVANCE', a.id, 'Adiantamento: ' || left(a.purpose, 60), null::date, null::integer, 'INSUFICIENTE',
         jsonb_build_object('unamortized', a.advanced_amount - coalesce(s.total, 0), 'guaranteedLimit', a.guaranteed_limit, 'policyMaxAmount', pp.max_amount)
    from public.insurance_advances a
    left join lateral (select sum(m.amount) total from public.insurance_advance_amortizations m where m.advance_id = a.id) s on true
    left join public.insurance_policies pp on pp.id = a.policy_id
   where (p_project_id is null or a.project_id = p_project_id) and (a.advanced_amount - coalesce(s.total, 0)) > 0
     and ((a.guaranteed_limit is not null and (a.advanced_amount - coalesce(s.total, 0)) > a.guaranteed_limit)
       or (pp.max_amount is not null and (a.advanced_amount - coalesce(s.total, 0)) > pp.max_amount))
  union all
  -- GARANTIA_SEM_DADOS: saldo aberto sem como comparar (sem limite e sem apólice com valor máximo) — "SEM DADOS", não inferir
  select 'GARANTIA_SEM_DADOS', a.project_id, 'INSURANCE_ADVANCE', a.id, 'Adiantamento: ' || left(a.purpose, 60), null::date, null::integer, 'SEM_DADOS',
         jsonb_build_object('unamortized', a.advanced_amount - coalesce(s.total, 0))
    from public.insurance_advances a
    left join lateral (select sum(m.amount) total from public.insurance_advance_amortizations m where m.advance_id = a.id) s on true
    left join public.insurance_policies pp on pp.id = a.policy_id
   where (p_project_id is null or a.project_id = p_project_id) and (a.advanced_amount - coalesce(s.total, 0)) > 0
     and a.guaranteed_limit is null and pp.max_amount is null
  union all
  -- SINISTRO_EM_ANDAMENTO
  select 'SINISTRO_EM_ANDAMENTO', c.project_id, 'INSURANCE_CLAIM', c.id, c.title, c.notice_deadline_at::date,
         case when c.notice_deadline_at is null then null else (c.notice_deadline_at::date - p_today) end,
         case when c.stage in ('NEGATIVA', 'CONTESTACAO') then 'ATENCAO' else 'EM_ANDAMENTO' end,
         jsonb_build_object('stage', c.stage, 'protocol', c.protocol, 'claimKind', c.claim_kind, 'instrumentMissing', c.policy_id is null and c.bank_guarantee_id is null and c.other_guarantee_id is null)
    from public.insurance_claims c
   where (p_project_id is null or c.project_id = p_project_id) and c.stage <> 'ENCERRADO'
  union all
  -- PRAZO_AVISO: expectativa ainda não avisada com prazo cadastrado
  select 'PRAZO_AVISO', c.project_id, 'INSURANCE_CLAIM', c.id, c.title, c.notice_deadline_at::date, (c.notice_deadline_at::date - p_today),
         case when c.notice_deadline_at::date < p_today then 'VENCIDO' else 'A_VENCER' end,
         jsonb_build_object('stage', c.stage, 'basis', c.notice_deadline_basis)
    from public.insurance_claims c
   where (p_project_id is null or c.project_id = p_project_id) and c.stage = 'EXPECTATIVA' and c.notice_deadline_at is not null;
$$;
