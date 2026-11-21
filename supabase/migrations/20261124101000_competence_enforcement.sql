-- ============================================================
-- 20261124101000_competence_enforcement.sql
--
-- FASE 4 / Agente A — INTEGRA a competência (project_competences) às decisões técnicas e jurídicas relevantes.
-- Técnica escolhida: GATILHOS BEFORE sobre as tabelas de registro dos atos (passo de sinistro, evento de estado da qualidade,
-- aprovação de minuta). Motivos: (a) valem para QUALQUER caminho que grave o ato, não só uma RPC; (b) NÃO redefinem as RPCs
-- insurance_claim_advance / insurance_draft_approve / quality_transition_core, evitando sobrepor definições mantidas por outras
-- frentes (o teste N1 de sobreposição de funções continua válido); (c) o ator verificado é o AUTOR GRAVADO NO ATO (created_by /
-- actor_user_id / approved_by), não um valor informado pelo cliente (as RPCs gravam auth.uid()).
-- Fail-closed: ato atribuído a alguém sem a competência vigente => exceção COMPETENCE_REQUIRED (transação inteira desfeita).
-- Ato sem autor atribuído (NULL) só existe em carga de manutenção por superusuário: nenhuma RPC o produz (todas exigem auth.uid()).
--
--   Sinistro (insurance_claim_steps)          DECISAO, NEGATIVA, CONTESTACAO, INDENIZACAO_CUMPRIMENTO   => JURIDICO
--   Minuta (insurance_drafts)                 aprovar para envio (APROVADA_PARA_ENVIO)                  => SEGUROS ou JURIDICO
--   Qualidade (quality_state_events)          RNC: CONFIRMADA, NAO_CONFIRMADA, ENCERRADA (laudo técnico) => TECNICO_RESPONSAVEL
--                                             Garantia: COBERTA, NAO_COBERTA (parecer de cobertura)      => TECNICO_RESPONSAVEL
--   Endosso crítico (conferência)             20261124102000                                            => SEGUROS ou JURIDICO
-- Nível de acesso (acc_project_tier / insurance_access / quality_can_*) continua exigido pelas RPCs: a competência é ADICIONAL.
-- Idempotente. Nenhuma migration/função existente é alterada.
-- ============================================================

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
    raise exception 'COMPETENCE_REQUIRED: % exige competência % registrada para você neste projeto (nível de gestão não substitui)',
      p_act, array_to_string(p_competences, ' ou ');
  end if;
end;
$$;
revoke all on function public.acc_int_require_competence(uuid, uuid, text[], text) from public, anon, authenticated;

-- ---------- Sinistro: decisão, negativa, contestação e indenização exigem competência JURIDICO ----------
create or replace function public.insurance_claim_step_competence_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage in ('DECISAO', 'NEGATIVA', 'CONTESTACAO', 'INDENIZACAO_CUMPRIMENTO') then
    perform public.acc_int_require_competence(new.project_id, new.created_by, array['JURIDICO'], 'a etapa ' || new.stage || ' do sinistro');
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_claim_step_competence_guard() from public, anon, authenticated;
drop trigger if exists insurance_claim_steps_competence on public.insurance_claim_steps;
create trigger insurance_claim_steps_competence before insert on public.insurance_claim_steps
  for each row execute function public.insurance_claim_step_competence_guard();

-- ---------- Minuta: aprovação para envio exige SEGUROS ou JURIDICO (além de ADMIN) ----------
create or replace function public.insurance_draft_approval_competence_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.state = 'APROVADA_PARA_ENVIO' and old.state is distinct from 'APROVADA_PARA_ENVIO' then
    perform public.acc_int_require_competence(new.project_id, new.approved_by, array['SEGUROS', 'JURIDICO'], 'aprovar a minuta para envio');
    if new.approved_by is null then raise exception 'COMPETENCE_REQUIRED: aprovar a minuta para envio exige aprovador identificado'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_draft_approval_competence_guard() from public, anon, authenticated;
drop trigger if exists insurance_drafts_approval_competence on public.insurance_drafts;
create trigger insurance_drafts_approval_competence before update on public.insurance_drafts
  for each row execute function public.insurance_draft_approval_competence_guard();

-- ---------- Qualidade: laudo técnico da RNC e parecer de cobertura de garantia exigem TECNICO_RESPONSAVEL ----------
create or replace function public.quality_state_event_competence_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.entity_type = 'NCR' and new.to_state in ('CONFIRMADA', 'NAO_CONFIRMADA', 'ENCERRADA'))
     or (new.entity_type = 'WARRANTY' and new.to_state in ('COBERTA', 'NAO_COBERTA')) then
    perform public.acc_int_require_competence(new.project_id, new.actor_user_id, array['TECNICO_RESPONSAVEL'],
      case when new.entity_type = 'NCR' then 'o laudo técnico da RNC (' || new.to_state || ')' else 'o parecer de cobertura da garantia (' || new.to_state || ')' end);
  end if;
  return new;
end;
$$;
revoke all on function public.quality_state_event_competence_guard() from public, anon, authenticated;
drop trigger if exists quality_state_events_competence on public.quality_state_events;
create trigger quality_state_events_competence before insert on public.quality_state_events
  for each row execute function public.quality_state_event_competence_guard();
