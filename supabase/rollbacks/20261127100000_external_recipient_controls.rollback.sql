-- ROLLBACK (manual, NAO e migration) de 20261127100000_external_recipient_controls.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.acc_recipient_domains') is not null then
    select count(*) into n from public.acc_recipient_domains where not (domain = 'axion.com.br' and kind = 'TENANT'); -- so o seed TENANT da propria migration; dominio cadastrado depois e dado
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.acc_recipient_domains tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.external_recipient_confirmations') is not null then
    select count(*) into n from public.external_recipient_confirmations;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.external_recipient_confirmations tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop trigger if exists insurance_official_channels_recipient_guard on public.insurance_official_channels;
drop table if exists public.external_recipient_confirmations;
drop table if exists public.acc_recipient_domains;
drop function if exists public.acc_email_normalize(text);
drop function if exists public.acc_recipient_domains_guard();
drop function if exists public.acc_recipient_domain_status(text);
drop function if exists public.external_recipient_confirmations_guard();
drop function if exists public.acc_external_recipient_confirmed(uuid, text, text, uuid);
drop function if exists public.acc_external_recipient_confirm(uuid, text, text, uuid, text, text, text);
drop function if exists public.insurance_channel_recipient_guard();
drop index if exists public.external_recipient_confirmations_project_idx;
drop index if exists public.external_recipient_confirmations_lookup_idx;
commit;
