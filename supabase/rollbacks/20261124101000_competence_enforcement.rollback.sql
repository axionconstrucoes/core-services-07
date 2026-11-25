-- Rollback de 20261124101000_competence_enforcement.sql (Fase 4/A): remove os gatilhos que exigem competência em sinistro, minuta e
-- Qualidade e suas funções. Reversível sem perda de dados (nenhuma tabela é alterada). Efeito: decisões voltam a exigir só o nível de acesso.
begin;
drop trigger if exists insurance_claim_steps_competence on public.insurance_claim_steps;
drop trigger if exists insurance_drafts_approval_competence on public.insurance_drafts;
drop trigger if exists quality_state_events_competence on public.quality_state_events;
drop function if exists public.insurance_claim_step_competence_guard();
drop function if exists public.insurance_draft_approval_competence_guard();
drop function if exists public.quality_state_event_competence_guard();
drop function if exists public.acc_int_require_competence(uuid, uuid, text[], text);
commit;
