-- ROLLBACK (manual, NAO e migration) de 20261121175000_audit_delete_proposals_and_findings.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
drop trigger if exists project_additional_proposals_audit_deleted on public.project_additional_proposals;
drop trigger if exists ai_findings_audit_deleted on public.ai_findings;
drop function if exists public.audit_additional_proposal_deleted();
drop function if exists public.audit_ai_finding_deleted();
commit;
