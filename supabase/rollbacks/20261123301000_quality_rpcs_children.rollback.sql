-- ROLLBACK (manual, NÃO é migration) de 20261123301000_quality_rpcs_children.sql: remove só as RPCs/auxiliares novos.
-- Reverter ANTES 20261123302000 (devolver os GRANTs diretos), senão a aplicação perde o caminho de escrita.
drop function if exists public.quality_evidence_register(uuid,text,text,text,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,text);
drop function if exists public.quality_evidence_revise(uuid,integer,text,text,text,text);
drop function if exists public.quality_capa_register(uuid,uuid,text,text,date,uuid);
drop function if exists public.quality_capa_update_status(uuid,integer,text,text);
drop function if exists public.quality_verification_register(uuid,uuid,integer,text,text,uuid,text,uuid);
drop function if exists public.quality_warranty_acceptance_register(uuid,integer,date,text,uuid);
drop function if exists public.quality_warranty_repair_register(uuid,text,timestamptz,text,numeric,numeric,text,boolean,uuid);
drop function if exists public.quality_warranty_survey_register(uuid,timestamptz,text,text);
drop function if exists public.quality_warranty_maintenance_register(uuid,text,date,text,text,text);
drop function if exists public.quality_consequence_register(uuid,uuid,text,text,text,text,text,text,text,text,uuid);
drop function if exists public.quality_cost_register(uuid,uuid,text,text,numeric,numeric,text);
drop function if exists public.quality_recurrence_register(uuid,uuid,uuid,uuid,text);
drop function if exists public.quality_complaint_register(uuid,text,timestamptz,text,text,text,text,text,uuid,uuid);
drop function if exists public.quality_inspection_register(uuid,text,text,text,text,timestamptz,timestamptz,text,text,uuid,uuid);
drop function if exists public.quality_test_register(uuid,text,text,text,text,timestamptz,text,text,text,uuid,uuid);
drop function if exists public.quality_requirement_register(uuid,text,text,text,text);
drop function if exists public.quality_ncr_update_fields(uuid,integer,jsonb,text);
drop function if exists public.quality_warranty_case_update(uuid,integer,jsonb,text);
drop function if exists public.quality_case_lookup(uuid,uuid,boolean);
drop function if exists public.quality_case_accepts_children(text,text);
drop function if exists public.quality_rpc_audit(uuid,text,text,uuid,jsonb);
drop function if exists public.quality_member_active(uuid,uuid);
