-- ROLLBACK (manual, NÃO é migration) de 20261127100000_external_recipient_controls.sql.
-- ATENÇÃO: apaga a trilha de confirmações de destinatário externo e a lista de domínios. Faça backup antes
-- (pg_dump -t public.external_recipient_confirmations -t public.acc_recipient_domains). Canais já cadastrados permanecem.
-- A trilha é append-only: o gatilho de bloqueio precisa ser removido antes (feito abaixo, ao derrubar a tabela).
drop trigger if exists insurance_official_channels_recipient_guard on public.insurance_official_channels;
drop function if exists public.insurance_channel_recipient_guard();
drop function if exists public.acc_external_recipient_confirm(uuid, text, text, uuid, text, text, text);
drop function if exists public.acc_external_recipient_confirmed(uuid, text, text, uuid);
drop table if exists public.external_recipient_confirmations;
drop function if exists public.external_recipient_confirmations_guard();
drop function if exists public.acc_recipient_domain_status(text);
drop table if exists public.acc_recipient_domains;
drop function if exists public.acc_recipient_domains_guard();
drop function if exists public.acc_email_normalize(text);
