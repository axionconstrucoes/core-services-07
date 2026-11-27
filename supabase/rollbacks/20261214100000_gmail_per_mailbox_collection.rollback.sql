-- Rollback de 20261214100000_gmail_per_mailbox_collection.sql.
-- Remove as 3 RPCs, as colunas de estado visível por caixa e a opção de e-mail somente interno.
-- PERDA DE DADO: apaga last_imported_message_id/_at, credential_source, granted_scopes, oauth_checked_at (estado
-- informativo; o cursor last_sync_at, os erros e a revogação ficam em colunas de 20261107090000/20261121110000 e são
-- preservados) e include_internal_only_messages (padrão false). Caixas incluídas na lista da obra pela RPC permanecem
-- (dado de configuração; remover só com decisão do Dono). Auditoria já gravada é preservada.
-- Efeito no coletor: scripts/gmail-multi-mailbox-sync.mjs detecta a ausência e volta ao modo histórico de UMA caixa.
-- Idempotente.
begin;
-- Guarda: recusa quando há estado gravado (evidência da coleta por caixa) ou a opção de e-mail interno LIGADA (decisão).
do $$
declare
  v_state boolean := false;
  v_internal boolean := false;
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_mailbox_collection_controls' and column_name = 'last_imported_message_id') then
    execute 'select exists (select 1 from public.email_mailbox_collection_controls where last_imported_message_id is not null or credential_source is not null or oauth_checked_at is not null)' into v_state;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'project_email_ingestion_configs' and column_name = 'include_internal_only_messages') then
    execute 'select exists (select 1 from public.project_email_ingestion_configs where include_internal_only_messages)' into v_internal;
  end if;
  if v_state then
    raise exception 'ROLLBACK_BLOCKED: há estado da coleta por caixa gravado (última importada/credencial/escopos); exporte email_mailbox_collection_controls e remova manualmente com autorização';
  end if;
  if v_internal then
    raise exception 'ROLLBACK_BLOCKED: include_internal_only_messages está LIGADA em alguma obra (decisão do Dono); desligue antes com autorização';
  end if;
end $$;
drop function if exists public.add_project_ingestion_mailbox(uuid, text, text);
drop function if exists public.record_mailbox_oauth_state(uuid, text, text, text[]);
drop function if exists public.record_mailbox_collection_progress(uuid, text, text, timestamptz);
alter table public.project_email_ingestion_configs drop column if exists include_internal_only_messages;
alter table public.email_mailbox_collection_controls
  drop column if exists oauth_checked_at,
  drop column if exists granted_scopes,
  drop column if exists credential_source,
  drop column if exists last_imported_message_at,
  drop column if exists last_imported_message_id;
commit;
