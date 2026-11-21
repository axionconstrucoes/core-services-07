-- ROLLBACK (manual, NÃO é migration) de 20261201100000_email_universal_monitoring.sql.
-- ATENÇÃO: apaga reconciliações, exclusões, origens e cursores (evidência de cobertura). Faça backup antes:
--   pg_dump -t public.email_sync_reconciliation_runs -t public.email_ingestion_exclusions -t public.email_message_sources -t public.email_sync_cursors
-- Reverter ANTES qualquer objeto de outra frente que dependa destas tabelas/colunas. As linhas de public.emails permanecem;
-- só as colunas novas são removidas (perde cc/bcc/domínios/chave canônica/anexos-meta), e linhas com provider='OUTLOOK' impedem restaurar o CHECK antigo.
begin;
do $$
begin
  if exists (select 1 from public.emails where provider = 'OUTLOOK') then
    raise exception 'ROLLBACK_BLOCKED: existem e-mails OUTLOOK; remova/migre-os antes de restaurar o CHECK de provider (GMAIL apenas)';
  end if;
end $$;
drop trigger if exists email_ingestion_exclusions_append_only on public.email_ingestion_exclusions;
drop trigger if exists email_sync_runs_append_only on public.email_sync_reconciliation_runs;
drop trigger if exists email_message_sources_append_only on public.email_message_sources;
drop table if exists public.email_ingestion_exclusions;
drop table if exists public.email_sync_reconciliation_runs;
drop table if exists public.email_message_sources;
drop table if exists public.email_sync_cursors;
drop function if exists public.email_ingestion_append_only_guard();
drop index if exists public.emails_outlook_mailbox_message_unique_idx;
drop index if exists public.emails_project_canonical_key_idx;
drop index if exists public.emails_involved_domains_gin_idx;
alter table public.emails drop constraint if exists emails_provider_check;
alter table public.emails add constraint emails_provider_check check (provider is null or provider in ('GMAIL'));
alter table public.emails
  drop column if exists cc_addresses,
  drop column if exists bcc_addresses,
  drop column if exists involved_domains,
  drop column if exists canonical_message_key,
  drop column if exists attachments_meta;
commit;
