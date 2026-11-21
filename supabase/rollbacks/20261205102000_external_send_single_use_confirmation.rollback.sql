-- Rollback de 20261205102000_external_send_single_use_confirmation.sql (Fase 5/E).
-- Preparações e usos são EVIDÊNCIA de auditoria: o script RECUSA apagar se houver registro; exporte antes e decida.
do $$
begin
  if exists (select 1 from public.external_send_preparations) or exists (select 1 from public.external_recipient_confirmation_uses) then
    raise exception 'ROLLBACK_BLOCKED: há preparações/usos registrados; exporte-os (evidência) e remova manualmente com autorização';
  end if;
end $$;
-- restaura o gatilho do canal oficial de 20261127100000 (confirmação reutilizável por 24 h)
create or replace function public.insurance_channel_recipient_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if new.channel_type <> 'EMAIL' then return new; end if;
  v_email := public.acc_email_normalize(new.channel_value);
  if v_email is null then raise exception 'INVALID_RECIPIENT_EMAIL: o endereço do canal não é um e-mail válido'; end if;
  new.channel_value := v_email;
  if public.acc_recipient_domain_status(v_email) = 'EXTERNO'
     and not public.acc_external_recipient_confirmed(new.project_id, 'SEGUROS_CANAL', v_email, coalesce(new.created_by, auth.uid())) then
    raise exception 'EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED: confirme o destinatário externo antes de cadastrar o canal';
  end if;
  return new;
end;
$$;
revoke all on function public.insurance_channel_recipient_guard() from public, anon, authenticated;
drop function if exists public.acc_external_send_prepare(uuid, text, text, text[], text, text, text, uuid);
drop function if exists public.acc_external_send_decide(uuid, text, text);
drop function if exists public.acc_external_send_consume(uuid, text, text[], text);
drop function if exists public.acc_external_send_cancel(uuid, text);
drop function if exists public.acc_external_recipient_consume_unbound(uuid, text, text, uuid, text);
drop function if exists public.acc_external_send_normalize_list(text[]);
drop function if exists public.acc_external_send_required_tier(text);
drop table if exists public.external_recipient_confirmation_uses;
alter table public.external_recipient_confirmations drop constraint if exists external_recipient_confirmations_preparation_fk;
alter table public.external_recipient_confirmations drop column if exists preparation_id;
alter table public.external_recipient_confirmations drop column if exists content_hash;
alter table public.external_recipient_confirmations drop column if exists action_kind;
drop table if exists public.external_send_preparations;
drop function if exists public.external_send_preparations_guard();
