-- ============================================================
-- 20261123102000_insurance_claim_advance_manage_stages.sql
--
-- FASE 3 / Agente B — matriz central: o COLABORADOR "registra evidências/solicitações"; GESTOR/GERENTE "gerem
-- ocorrências". Em 20261122201000 insurance_claim_advance exigia só REGISTER para QUALQUER etapa, permitindo que um
-- COLABORADOR registrasse a decisão da seguradora (DEFERIDO/INDEFERIDO), a negativa de cobertura, a contestação, a
-- indenização/cumprimento e o encerramento do evento. Esta migration redefine a função (corpo idêntico ao vigente, exceto o
-- nível de autorização por etapa) — MUDANÇA DE COMPORTAMENTO documentada em docs/permissoes-matriz-central.md:
--     DECISAO, NEGATIVA, CONTESTACAO, INDENIZACAO_CUMPRIMENTO, ENCERRADO  => MANAGE (GESTOR/GERENTE/ADMINISTRADOR)
--     demais etapas (AVISO, RECLAMACAO, DOC_COMPLEMENTAR, REGULACAO, EXPECTATIVA) => REGISTER (inalterado)
-- Mesma assinatura, mesmos GRANTs. Idempotente. É a definição vigente (a mais recente) — teste N1 S1 segue válido.
-- ============================================================

create or replace function public.insurance_claim_advance(p_claim_id uuid, p_expected_row_version integer, p_to_stage text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.insurance_claims%rowtype;
  v_note text := public.insurance_int_text(p_data, 'note');
  v_doc uuid := public.insurance_int_uuid(p_data, 'document_id');
  v_protocol text := coalesce(public.insurance_int_text(p_data, 'protocol'), null);
  v_outcome text := public.insurance_int_text(p_data, 'decision_outcome');
begin
  select * into c from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- Fase 3/B: registrar andamento operacional = REGISTER; registrar a DECISÃO da seguradora, a negativa, a contestação,
  -- a indenização/cumprimento ou o ENCERRAMENTO do evento = ato de gestão (MANAGE). Antes (20261122201000) tudo era REGISTER.
  perform public.insurance_int_require(c.project_id,
    case when p_to_stage in ('DECISAO', 'NEGATIVA', 'CONTESTACAO', 'INDENIZACAO_CUMPRIMENTO', 'ENCERRADO') then 'MANAGE' else 'REGISTER' end);
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if c.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, c.row_version; end if;
  if not public.insurance_claim_transition_allowed(c.stage, p_to_stage) then raise exception 'INVALID_TRANSITION: % -> %', c.stage, p_to_stage; end if;
  perform public.insurance_int_same_project('documents', v_doc, c.project_id);
  if p_to_stage in ('NEGATIVA', 'CONTESTACAO', 'DOC_COMPLEMENTAR', 'ENCERRADO') and char_length(coalesce(v_note, '')) < 10 then raise exception 'NOTE_REQUIRED'; end if;
  if p_to_stage = 'DECISAO' then
    if v_outcome is null or v_outcome not in ('DEFERIDO', 'INDEFERIDO', 'PARCIAL') then raise exception 'DECISION_OUTCOME_REQUIRED'; end if;
  end if;
  if p_to_stage = 'INDENIZACAO_CUMPRIMENTO' and coalesce(c.decision_outcome, '') not in ('DEFERIDO', 'PARCIAL') then
    raise exception 'DECISION_DOES_NOT_ALLOW_PAYMENT';
  end if;
  update public.insurance_claims set stage = p_to_stage,
      protocol = coalesce(v_protocol, protocol),
      decision_outcome = case when p_to_stage = 'DECISAO' then v_outcome when p_to_stage = 'NEGATIVA' then 'INDEFERIDO' else decision_outcome end,
      row_version = row_version + 1, updated_at = now()
   where id = p_claim_id;
  insert into public.insurance_claim_steps (project_id, claim_id, from_stage, stage, protocol, note, document_id, created_by)
  values (c.project_id, p_claim_id, c.stage, p_to_stage, v_protocol, v_note, v_doc, auth.uid());
  perform public.insurance_int_audit(c.project_id, 'INSURANCE_CLAIM', p_claim_id, 'CLAIM_STAGE_' || p_to_stage,
    jsonb_build_object('fromStage', c.stage, 'toStage', p_to_stage, 'protocol', v_protocol, 'decisionOutcome', v_outcome));
  return jsonb_build_object('id', p_claim_id, 'stage', p_to_stage, 'rowVersion', c.row_version + 1);
end;
$$;

revoke all on function public.insurance_claim_advance(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.insurance_claim_advance(uuid, integer, text, jsonb) to authenticated;
