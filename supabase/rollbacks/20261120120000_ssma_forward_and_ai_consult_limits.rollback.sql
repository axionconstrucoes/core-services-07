-- ROLLBACK (manual, NAO e migration) de 20261120120000_ssma_forward_and_ai_consult_limits.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.ai_consult_limits') is not null then
    select count(*) into n from public.ai_consult_limits where not (scope = 'DEFAULT' and per_user_day = 20 and per_project_day = 100); -- so o seed DEFAULT da propria migration; qualquer outra linha/valor e dado
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.ai_consult_limits tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.ai_consult_usage') is not null then
    select count(*) into n from public.ai_consult_usage;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.ai_consult_usage tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.ai_consult_usage;
drop table if exists public.ai_consult_limits;
drop function if exists public.ssma_corrective_action_forward(uuid, uuid, text);
drop function if exists public.ai_consult_reserve(uuid, text, text);
drop index if exists public.ai_consult_usage_user_day_idx;
drop index if exists public.ai_consult_usage_project_day_idx;
commit;
