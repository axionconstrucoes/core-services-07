-- ROLLBACK (manual, NÃO é migration) de 20261123303000_acc_alert_links.sql.
-- ATENÇÃO: apaga a tabela de vínculos estruturados e seu histórico. Faça backup antes (pg_dump -t public.acc_alert_links -t public.acc_alert_link_events).
-- O texto original 'ALERTA:<id>' em origin_ref/source_ref nunca foi alterado; a aplicação volta a usar a convenção.
drop function if exists public.acc_alert_links_backfill();
drop function if exists public.acc_alert_links_for_entity(text, uuid);
drop function if exists public.acc_alert_links_for_alert(uuid);
drop function if exists public.acc_alert_link_unlink(uuid, text);
drop function if exists public.acc_alert_link_create(uuid, text, uuid, text);
drop table if exists public.acc_alert_link_events;
drop table if exists public.acc_alert_links;
drop function if exists public.acc_alert_link_guard();
drop index if exists public.risk_alert_cases_id_project_uq;
