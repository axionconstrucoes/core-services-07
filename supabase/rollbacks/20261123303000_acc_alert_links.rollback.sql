-- ROLLBACK (manual, NAO e migration) de 20261123303000_acc_alert_links.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.acc_alert_links') is not null then
    select count(*) into n from public.acc_alert_links where link_source <> 'BACKFILL_CONVENTION' or unlinked_at is not null; -- vinculos BACKFILL_CONVENTION sao derivados da convencao ALERTA:<id> (reproduziveis); MANUAL/desvinculados sao decisao humana
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.acc_alert_links tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.acc_alert_link_events') is not null then
    select count(*) into n from public.acc_alert_link_events where link_id in (select id from public.acc_alert_links where link_source <> 'BACKFILL_CONVENTION' or unlinked_at is not null); -- eventos de vinculos humanos sao evidencia
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.acc_alert_link_events tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.acc_alert_link_events;
drop table if exists public.acc_alert_links;
drop function if exists public.acc_alert_link_guard();
drop function if exists public.acc_alert_link_create(uuid, text, uuid, text);
drop function if exists public.acc_alert_link_unlink(uuid, text);
drop function if exists public.acc_alert_links_for_alert(uuid);
drop function if exists public.acc_alert_links_for_entity(text, uuid);
drop function if exists public.acc_alert_links_backfill();
drop index if exists public.risk_alert_cases_id_project_uq;
drop index if exists public.acc_alert_links_active_uq;
drop index if exists public.acc_alert_links_entity_idx;
drop index if exists public.acc_alert_links_alert_idx;
drop index if exists public.acc_alert_link_events_link_idx;
commit;
