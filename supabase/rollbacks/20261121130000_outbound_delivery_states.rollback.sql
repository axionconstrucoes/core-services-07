-- ROLLBACK (manual, NAO e migration) de 20261121130000_outbound_delivery_states.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare t text; n bigint;
begin
  -- o backfill (delivery_state = ACCEPTED_BY_PROVIDER nas SENT; failure_class = EXHAUSTED nas FAILED) e DERIVADO e reproduzivel; o que NAO e:
  -- evidencia de entrega/devolucao, tentativas, claim e provedor gravados depois da migration.
  foreach t in array array['risk_alert_outbox', 'ssma_accident_notification_deliveries', 'construmanager_version_review_deliveries', 'ssma_field_notification_deliveries', 'notification_email_deliveries'] loop
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'delivery_evidence') then
      execute format('select count(*) from public.%I where delivery_evidence <> ''[]''::jsonb', t) into n;
      if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.% tem % linha(s) com evidencia de entrega (delivery_evidence); exporte antes', t, n; end if;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'delivery_state') then
      execute format('select count(*) from public.%I where delivery_state in (''DELIVERED'', ''BOUNCED'')', t) into n;
      if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.% tem % linha(s) DELIVERED/BOUNCED (evidencia); exporte antes', t, n; end if;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'attempt_count') and t in ('ssma_accident_notification_deliveries', 'construmanager_version_review_deliveries') then
      execute format('select count(*) from public.%I where attempt_count > 0 or claimed_at is not null or provider is not null', t) into n;
      if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.% tem % linha(s) com tentativas/claim/provedor registrados; exporte antes', t, n; end if;
    end if;
    if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = t and column_name = 'failure_class') then
      execute format('select count(*) from public.%I where failure_class is not null and not (status = ''FAILED'' and failure_class = ''EXHAUSTED'')', t) into n;
      if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.% tem % linha(s) com failure_class registrada pelo sistema; exporte antes', t, n; end if;
    end if;
  end loop;
end $$;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.acc_system_health_alert_deliveries') is not null then
    select count(*) into n from public.acc_system_health_alert_deliveries;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.acc_system_health_alert_deliveries tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop trigger if exists risk_alert_outbox_delivery_guard on public.risk_alert_outbox;
drop trigger if exists ssma_accident_deliveries_delivery_guard on public.ssma_accident_notification_deliveries;
drop trigger if exists version_review_deliveries_delivery_guard on public.construmanager_version_review_deliveries;
drop trigger if exists ssma_field_deliveries_delivery_guard on public.ssma_field_notification_deliveries;
drop trigger if exists notification_email_deliveries_delivery_guard on public.notification_email_deliveries;
drop table if exists public.acc_system_health_alert_deliveries;
drop function if exists public.acc_delivery_evidence_state(jsonb, timestamp with time zone);
drop function if exists public.acc_outbound_delivery_guard();
drop function if exists public.acc_notification_delivery_guard();
drop function if exists public.record_outbound_delivery_evidence(text, uuid, jsonb);
drop index if exists public.acc_system_health_alert_deliveries_project_idx;
alter table public.risk_alert_outbox drop column if exists delivery_state;
alter table public.risk_alert_outbox drop column if exists delivery_evidence;
alter table public.risk_alert_outbox drop column if exists delivery_state_at;
alter table public.risk_alert_outbox drop column if exists failure_class;
alter table public.ssma_accident_notification_deliveries drop column if exists attempt_count;
alter table public.ssma_accident_notification_deliveries drop column if exists claimed_at;
alter table public.ssma_accident_notification_deliveries drop column if exists failure_class;
alter table public.ssma_accident_notification_deliveries drop column if exists provider;
alter table public.ssma_accident_notification_deliveries drop column if exists delivery_state;
alter table public.ssma_accident_notification_deliveries drop column if exists delivery_evidence;
alter table public.ssma_accident_notification_deliveries drop column if exists delivery_state_at;
alter table public.construmanager_version_review_deliveries drop column if exists attempt_count;
alter table public.construmanager_version_review_deliveries drop column if exists claimed_at;
alter table public.construmanager_version_review_deliveries drop column if exists failure_class;
alter table public.construmanager_version_review_deliveries drop column if exists provider;
alter table public.construmanager_version_review_deliveries drop column if exists delivery_state;
alter table public.construmanager_version_review_deliveries drop column if exists delivery_evidence;
alter table public.construmanager_version_review_deliveries drop column if exists delivery_state_at;
alter table public.ssma_field_notification_deliveries drop column if exists failure_class;
alter table public.ssma_field_notification_deliveries drop column if exists delivery_state;
alter table public.ssma_field_notification_deliveries drop column if exists delivery_evidence;
alter table public.ssma_field_notification_deliveries drop column if exists delivery_state_at;
alter table public.notification_email_deliveries drop column if exists delivery_evidence;
-- constraints nomeadas criadas pela migration (as que dependem das colunas caem com elas; as de sent_at nao)
alter table public.ssma_accident_notification_deliveries drop constraint if exists ssma_accident_deliveries_sent_at_check;
alter table public.construmanager_version_review_deliveries drop constraint if exists version_review_deliveries_sent_at_check;
commit;
