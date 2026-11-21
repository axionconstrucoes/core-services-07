-- ROLLBACK (manual, NAO e migration) de 20261121174000_ai_consult_audit.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.ai_consult_audit') is not null then
    select count(*) into n from public.ai_consult_audit;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.ai_consult_audit tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.ai_consult_audit;
drop function if exists public.ai_consult_audit_record_core(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer);
drop function if exists public.ai_consult_audit_record(uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer);
drop function if exists public.ai_consult_audit_record_for_actor(uuid, uuid, text, text, text, text, text, jsonb, text, text, numeric, jsonb, text, text, integer, integer);
drop index if exists public.ai_consult_audit_project_day_idx;
drop index if exists public.ai_consult_audit_user_day_idx;
commit;
