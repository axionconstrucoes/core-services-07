-- ROLLBACK (manual, NAO e migration) de 20261107090000_email_mailbox_collection_controls.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.email_mailbox_collection_controls') is not null then
    select count(*) into n from public.email_mailbox_collection_controls;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.email_mailbox_collection_controls tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.email_mailbox_collection_controls;
drop function if exists public.register_mailbox_corporate_authorization(uuid, text, text);
drop function if exists public.set_mailbox_collection(uuid, text, boolean, timestamp with time zone, timestamp with time zone);
drop function if exists public.revoke_mailbox_collection(uuid, text, text);
drop function if exists public.record_mailbox_technical_check(uuid, text, boolean, text);
drop function if exists public.record_mailbox_sync_result(uuid, text, text, text, integer, timestamp with time zone);
drop index if exists public.email_mailbox_collection_controls_project_idx;
commit;
