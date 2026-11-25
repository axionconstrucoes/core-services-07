-- ROLLBACK (manual, NAO e migration) de 20261121173000_email_specialist_consultations.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.email_specialist_consultations') is not null then
    select count(*) into n from public.email_specialist_consultations;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_specialist_consultations tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.email_specialist_consultations;
drop function if exists public.email_specialist_consult_record(uuid, uuid, text, text, text, text, text, text, text, text, text, boolean, text, text, text, text);
drop function if exists public.email_specialist_consult_complete(uuid, text, text, numeric);
drop index if exists public.email_specialist_consultations_status_idx;
drop index if exists public.email_specialist_consultations_subject_idx;
commit;
