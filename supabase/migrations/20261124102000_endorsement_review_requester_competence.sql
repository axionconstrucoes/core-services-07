-- ============================================================
-- 20261124102000_endorsement_review_requester_competence.sql
--
-- FASE 4 / Agente A — REDEFINE a regra de conferência de endossos críticos da Fase 3 (20261123200000), que exigia que NENHUM dos
-- dois conferentes fosse o SOLICITANTE nem o EMISSOR (na prática >= 4 pessoas: solicitante, emissor e 2 conferentes).
--
-- REGRA NOVA (endossos CRÍTICOS: segurados, beneficiários, obrigações garantidas, valores, coberturas — classificação inalterada):
--   * DOIS conferentes humanos distintos entre si, ambos DIFERENTES do EMISSOR do registro (autoconferência da emissão impossível);
--   * o SOLICITANTE PODE ser um dos conferentes, desde que tenha nível >= MANAGE (insurance_access, já exigido) E competência
--     SEGUROS ou JURIDICO ativa no projeto (project_competences) — vale para TODOS os conferentes de endosso crítico;
--   * o emissor continua sendo quem registra a emissão (insurance_endorsement_advance -> EMITIDO); solicitado, emitido e conferido
--     seguem sendo etapas distintas, cada uma com seu autor registrado e auditado (snapshots imutáveis nas conferências);
--   * a regra da conferência SIMPLES (endosso não crítico, texto idêntico) e os dados legados (conferência única histórica) NÃO mudam;
--   * a cláusula "texto divergente = dupla" da Fase 3 é MANTIDA: o texto emitido pode trazer alteração crítica que ninguém pediu
--     (a nova regra não a torna desnecessária; remover enfraqueceria o controle).
-- Mudança no banco: (1) CHECK de independência da tabela de conferências deixa de comparar com o solicitante; (2) novas colunas
-- de snapshot reviewer_is_requester / reviewer_competence (auditoria); (3) gatilho exige competência na inserção (defesa em
-- profundidade além da RPC); (4) insurance_endorsement_review redefinida (corpo idêntico a 20261123200000, exceto o bloco de
-- independência/competência e dois campos de auditoria). Mesma assinatura e mesmos GRANTs. Idempotente.
-- Linhas antigas continuam válidas (todas satisfazem a regra nova, que é menos estrita no solicitante).
-- ============================================================

alter table public.insurance_endorsement_reviews add column if not exists reviewer_is_requester boolean;
alter table public.insurance_endorsement_reviews add column if not exists reviewer_competence text;

-- (1) independência: troca o CHECK da Fase 3 (comparava solicitante E emissor) pelo da Fase 4 (só emissor)
do $$
declare c record;
begin
  for c in select conname from pg_constraint
            where conrelid = 'public.insurance_endorsement_reviews'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%requested_by_snapshot%' and pg_get_constraintdef(oid) like '%dual_required%'
              and conname <> 'insurance_endorsement_reviews_issuer_independence_check' loop
    execute format('alter table public.insurance_endorsement_reviews drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conrelid = 'public.insurance_endorsement_reviews'::regclass
                  and conname = 'insurance_endorsement_reviews_issuer_independence_check') then
    alter table public.insurance_endorsement_reviews add constraint insurance_endorsement_reviews_issuer_independence_check
      check (not dual_required or (issued_by_snapshot is not null and reviewer_id <> issued_by_snapshot));
  end if;
end $$;

-- (3) gatilho: snapshots de auditoria + competência exigida em conferência de endosso crítico (dispara DEPOIS de _prepare, que fixa dual_required)
create or replace function public.insurance_endorsement_review_competence_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_comp text;
begin
  new.reviewer_is_requester := (new.requested_by_snapshot is not null and new.reviewer_id = new.requested_by_snapshot);
  select c.competence into v_comp
    from public.project_competences c
    join public.project_memberships pm on pm.project_id = c.project_id and pm.user_id = c.user_id and pm.status = 'ACTIVE'
   where c.project_id = new.project_id and c.user_id = new.reviewer_id and c.status = 'ACTIVE' and c.competence in ('SEGUROS', 'JURIDICO')
     and c.valid_from <= current_date and (c.valid_until is null or c.valid_until >= current_date)
   order by c.competence desc limit 1;
  new.reviewer_competence := v_comp;
  if new.dual_required and v_comp is null then
    raise exception 'COMPETENCE_REQUIRED: conferir endosso crítico exige competência SEGUROS ou JURIDICO registrada para o conferente neste projeto';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_endorsement_review_competence_guard() from public, anon, authenticated;
drop trigger if exists insurance_endorsement_reviews_zcompetence on public.insurance_endorsement_reviews;
create trigger insurance_endorsement_reviews_zcompetence before insert on public.insurance_endorsement_reviews
  for each row execute function public.insurance_endorsement_review_competence_guard();

-- (4) RPC de conferência
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
    -- Fase 4/A: o SOLICITANTE pode conferir (nível MANAGE já exigido acima + competência abaixo); o EMISSOR nunca confere a própria emissão.
    if e.issued_by is not null and v_uid = e.issued_by then raise exception 'REVIEWER_IS_ISSUER: quem registrou a emissão não a confere'; end if;
    if not public.acc_user_has_competence(e.project_id, v_uid, array['SEGUROS', 'JURIDICO']) then
      raise exception 'COMPETENCE_REQUIRED: conferir endosso crítico exige competência SEGUROS ou JURIDICO registrada para você neste projeto';
    end if;
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
    jsonb_build_object('round', e.review_round, 'requiresDualReview', e.requires_dual_review, 'dualReviewReason', e.dual_review_reason, 'reviewerIsRequester', (v_uid is not distinct from e.requested_by),
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


revoke all on function public.insurance_endorsement_review(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.insurance_endorsement_review(uuid, integer, text, jsonb) to authenticated;
