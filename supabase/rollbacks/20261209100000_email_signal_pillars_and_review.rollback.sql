-- Rollback de 20261209100000_email_signal_pillars_and_review.sql (Fase 6/H2b).
-- Revisões e delegações são EVIDÊNCIA: o script RECUSA reverter se houver decisão/delegação/auditoria registrada; exporte antes e decida
-- com autorização. Sem registros, restaura o contrato antigo de pilares (JURIDICO volta a ser pilar) e remove as estruturas novas.
-- funcao TEMPORARIA (pg_temp; some ao fim da sessao): torna a guarda idempotente (tabela ja removida => sem linhas)
begin;
create or replace function pg_temp.rb_has_rows(p_table text, p_where text default 'true') returns boolean
language plpgsql as $f$
declare r boolean;
begin
  if to_regclass('public.' || p_table) is null then return false; end if;
  execute format('select exists (select 1 from public.%I where %s)', p_table, p_where) into r;
  return r;
exception when undefined_column then return false;
end $f$;
do $$
begin
  if pg_temp.rb_has_rows('email_signal_review_delegations') or pg_temp.rb_has_rows('email_signal_review_audit')
     or pg_temp.rb_has_rows('email_risk_signals', 'review_status <> ''PENDING'' and reviewed_by is not null') then
    raise exception 'ROLLBACK_BLOCKED: há revisões/delegações/auditoria de sinais; exporte-as (evidência) e remova manualmente com autorização';
  end if;
end $$;
drop view if exists public.email_risk_signals_legacy;
drop trigger if exists email_risk_signals_a_normalize on public.email_risk_signals;
drop function if exists public.email_risk_signals_normalize();
drop function if exists public.email_risk_signal_review(uuid, text, text);
drop function if exists public.acc_email_signal_delegate_grant(uuid, uuid, text, timestamptz, text);
drop function if exists public.acc_email_signal_delegate_revoke(uuid, text);
drop function if exists public.email_signal_review_audit_write(uuid, text, uuid, uuid, text, jsonb, jsonb, text);
drop table if exists public.email_signal_review_delegations;
drop table if exists public.email_signal_review_audit;
drop function if exists public.email_signal_review_audit_guard();
drop index if exists public.email_risk_signals_classification_kind_uidx;
drop index if exists public.email_risk_signals_review_idx;
-- Pilar volta ao contrato antigo: área jurídica => pilar JURIDICO; demais mantêm o pilar.
alter table public.email_risk_signals drop constraint if exists email_risk_signals_pillar_check;
alter table public.email_risk_signals drop constraint if exists email_risk_signals_pillar_four_check;
alter table public.email_risk_signals drop constraint if exists email_risk_signals_functional_area_check;
alter table public.email_risk_signals drop constraint if exists email_risk_signals_pillar_axis_check;
alter table public.email_risk_signals drop constraint if exists email_risk_signals_review_status_check;
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_risk_signals' and column_name = 'functional_area') then
    execute $q$update public.email_risk_signals set pillar = 'JURIDICO' where functional_area = 'JURIDICO'$q$;
  end if;
end $$;
alter table public.email_risk_signals alter column pillar set not null;
alter table public.email_risk_signals add constraint email_risk_signals_pillar_check
  check (pillar in ('PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE', 'JURIDICO'));
alter table public.email_risk_signals drop column if exists functional_area;
alter table public.email_risk_signals drop column if exists legacy_pillar;
alter table public.email_risk_signals drop column if exists review_status;
alter table public.email_risk_signals drop column if exists reviewed_by;
alter table public.email_risk_signals drop column if exists reviewed_at;
alter table public.email_risk_signals drop column if exists review_note;
drop function if exists public.email_signal_functional_area_for(text, text);
drop function if exists public.email_signal_impact_pillar_for(text);
commit;
