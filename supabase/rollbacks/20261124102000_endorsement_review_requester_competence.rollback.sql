-- Rollback de 20261124102000_endorsement_review_requester_competence.sql (Fase 4/A): volta à regra da Fase 3/C (conferente != solicitante E != emissor).
-- BLOQUEIA se já existir conferência feita pelo próprio solicitante (a regra antiga a invalidaria); nesse caso mantenha a migration.
-- funcao TEMPORARIA (pg_temp; some ao fim da sessao): guarda idempotente (tabela/coluna ja removida => sem linhas)
begin;
create or replace function pg_temp.rb_has_rows(p_table text, p_where text default 'true') returns boolean
language plpgsql as $f$
declare r boolean;
begin
  if to_regclass('public.' || p_table) is null then return false; end if;
  execute format('select exists (select 1 from public.%I where %s)', p_table, p_where) into r;
  return r;
exception when undefined_column then return false;
end $f$;
do $$
begin
  if pg_temp.rb_has_rows('insurance_endorsement_reviews', 'reviewer_competence is not null') then
    raise exception 'ROLLBACK_BLOCKED: ha conferencias com reviewer_competence registrada (auditoria); nada foi alterado';
  end if;
  if pg_temp.rb_has_rows('insurance_endorsement_reviews', 'reviewer_is_requester is true') then
    raise exception 'ROLLBACK_BLOCKED: há conferências feitas pelo solicitante (Fase 4/A); a regra antiga as invalidaria';
  end if;
end $$;
drop trigger if exists insurance_endorsement_reviews_zcompetence on public.insurance_endorsement_reviews;
drop function if exists public.insurance_endorsement_review_competence_guard();
alter table public.insurance_endorsement_reviews drop constraint if exists insurance_endorsement_reviews_issuer_independence_check;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.insurance_endorsement_reviews'::regclass and conname = 'insurance_endorsement_reviews_independence_f3_check') then
    alter table public.insurance_endorsement_reviews add constraint insurance_endorsement_reviews_independence_f3_check
      check (not dual_required or (requested_by_snapshot is not null and issued_by_snapshot is not null
             and reviewer_id <> requested_by_snapshot and reviewer_id <> issued_by_snapshot));
  end if;
end $$;
-- H5: as colunas aditivas reviewer_is_requester / reviewer_competence saem, SO se nao houver valor gravado (guarda no topo).
alter table public.insurance_endorsement_reviews drop column if exists reviewer_is_requester;
alter table public.insurance_endorsement_reviews drop column if exists reviewer_competence;
-- Função de conferência da Fase 3/C (create or replace; mesma assinatura e GRANTs):
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
commit;
