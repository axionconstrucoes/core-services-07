-- =====================================================================
-- Frente N4 — envio corporativo: ACEITO PELO PROVEDOR × ENTREGA COMPROVADA, falhas classificadas, outbox das
-- rotinas especiais (acidente SSMA, falha técnica, revisão de impacto de versão).
--
-- NÃO APLICADA EM PRODUÇÃO. Aplicar só com autorização, ANTES de publicar o código que a usa (o código grava
-- delivery_state/failure_class/attempt_count; sem as colunas o envio falha fechado — nada é marcado como enviado).
--
-- 1. delivery_state (NULL | ACCEPTED_BY_PROVIDER | DELIVERED | BOUNCED) em todas as tabelas de entrega com status SENT:
--    SENT continua significando SÓ "o provedor aceitou" (id de mensagem devolvido). DELIVERED/BOUNCED exigem
--    evidência registrada em delivery_evidence (jsonb [{kind, observedAt, reference}]) e são recusados sem ela.
-- 2. Uma linha SENT nunca volta para PENDING/FAILED (evita reenvio de mensagem já aceita).
-- 3. failure_class (RETRYABLE | PERMANENT | UNCERTAIN | EXHAUSTED): só RETRYABLE volta a ser tentada.
-- 4. Acidente e revisão de versão ganham attempt_count/claimed_at (reivindicação atômica e tentativas limitadas);
--    falha técnica ganha uma tabela de entrega por destinatário (antes: só notified_at no incidente, sem retentativa).
-- 5. record_outbound_delivery_evidence: única porta (service_role) para registrar evidência de entrega/devolução.
-- Nenhum destinatário, prazo SLA ou escalonamento é alterado.
-- =====================================================================

-- ---------------------------------------------------------------- avaliação de evidência (mesma regra de outbound-delivery.ts)
create or replace function public.acc_delivery_evidence_state(p_evidence jsonb, p_accepted_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  with ev as (
    select e ->> 'kind' as kind,
           (e ->> 'observedAt')::timestamptz as observed_at,
           nullif(btrim(coalesce(e ->> 'reference', '')), '') as reference
      from jsonb_array_elements(case when jsonb_typeof(p_evidence) = 'array' then p_evidence else '[]'::jsonb end) as e
  ), valid as (
    select * from ev
     where reference is not null and observed_at is not null
       and kind in ('RECIPIENT_REPLY', 'RECIPIENT_MAILBOX_VERIFIED', 'SENT_COPY_VERIFIED', 'NO_BOUNCE_AFTER_WINDOW', 'BOUNCE_RECEIVED')
  )
  select case
    when exists (select 1 from valid where kind = 'BOUNCE_RECEIVED') then 'BOUNCED'
    when exists (select 1 from valid where kind in ('RECIPIENT_REPLY', 'RECIPIENT_MAILBOX_VERIFIED')) then 'DELIVERED'
    when exists (select 1 from valid where kind = 'SENT_COPY_VERIFIED')
     and exists (select 1 from valid where kind = 'NO_BOUNCE_AFTER_WINDOW' and p_accepted_at is not null and observed_at >= p_accepted_at + interval '24 hours')
      then 'DELIVERED'
    else 'ACCEPTED_BY_PROVIDER'
  end
$$;

-- ---------------------------------------------------------------- guarda comum (tabelas com status PENDING/SENT/FAILED…)
create or replace function public.acc_outbound_delivery_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'SENT' and new.status is distinct from 'SENT' then
    raise exception 'Entrega já aceita pelo provedor não pode voltar para %.', new.status using errcode = 'check_violation';
  end if;
  if new.status = 'SENT' and new.delivery_state is null then
    new.delivery_state := 'ACCEPTED_BY_PROVIDER';
  end if;
  if new.status is distinct from 'SENT' and new.delivery_state is not null then
    raise exception 'delivery_state só existe para mensagem aceita pelo provedor.' using errcode = 'check_violation';
  end if;
  if new.delivery_state in ('DELIVERED', 'BOUNCED')
     and public.acc_delivery_evidence_state(new.delivery_evidence, new.sent_at) is distinct from new.delivery_state then
    raise exception 'Estado % exige evidência registrada suficiente (entrega nunca é presumida).', new.delivery_state using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.delivery_state in ('DELIVERED', 'BOUNCED') and new.delivery_state = 'ACCEPTED_BY_PROVIDER' then
    raise exception 'Evidência de entrega/devolução não pode ser descartada.' using errcode = 'check_violation';
  end if;
  if new.delivery_state is distinct from (case when tg_op = 'UPDATE' then old.delivery_state else null end) then
    new.delivery_state_at := now();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------- risk_alert_outbox
alter table public.risk_alert_outbox
  add column if not exists delivery_state text,
  add column if not exists delivery_evidence jsonb not null default '[]'::jsonb,
  add column if not exists delivery_state_at timestamptz,
  add column if not exists failure_class text;
update public.risk_alert_outbox set delivery_state = 'ACCEPTED_BY_PROVIDER', delivery_state_at = coalesce(sent_at, now())
 where status = 'SENT' and delivery_state is null;
alter table public.risk_alert_outbox
  add constraint risk_alert_outbox_delivery_state_check check (delivery_state is null or delivery_state in ('ACCEPTED_BY_PROVIDER', 'DELIVERED', 'BOUNCED')),
  add constraint risk_alert_outbox_delivery_state_sent_check check ((status = 'SENT') = (delivery_state is not null)),
  add constraint risk_alert_outbox_delivery_evidence_array_check check (jsonb_typeof(delivery_evidence) = 'array'),
  add constraint risk_alert_outbox_failure_class_check check (failure_class is null or failure_class in ('RETRYABLE', 'PERMANENT', 'UNCERTAIN', 'EXHAUSTED'));
comment on column public.risk_alert_outbox.delivery_state is
  'NULL = não aceito. ACCEPTED_BY_PROVIDER = o provedor devolveu id (status SENT) — NÃO é entrega comprovada. DELIVERED/BOUNCED só com evidência em delivery_evidence.';
drop trigger if exists risk_alert_outbox_delivery_guard on public.risk_alert_outbox;
create trigger risk_alert_outbox_delivery_guard
before insert or update on public.risk_alert_outbox
for each row execute function public.acc_outbound_delivery_guard();

-- ---------------------------------------------------------------- acidente SSMA
alter table public.ssma_accident_notification_deliveries
  add column if not exists attempt_count integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists failure_class text,
  add column if not exists provider text,
  add column if not exists delivery_state text,
  add column if not exists delivery_evidence jsonb not null default '[]'::jsonb,
  add column if not exists delivery_state_at timestamptz;
update public.ssma_accident_notification_deliveries set delivery_state = 'ACCEPTED_BY_PROVIDER', delivery_state_at = coalesce(sent_at, now())
 where status = 'SENT' and delivery_state is null;
-- Falhas LEGADAS (antes desta migration) não são retentadas automaticamente: reenviar comunicação antiga confundiria.
update public.ssma_accident_notification_deliveries set failure_class = 'EXHAUSTED' where status = 'FAILED' and failure_class is null;
alter table public.ssma_accident_notification_deliveries
  add constraint ssma_accident_deliveries_attempt_check check (attempt_count >= 0),
  add constraint ssma_accident_deliveries_delivery_state_check check (delivery_state is null or delivery_state in ('ACCEPTED_BY_PROVIDER', 'DELIVERED', 'BOUNCED')),
  add constraint ssma_accident_deliveries_delivery_state_sent_check check ((status = 'SENT') = (delivery_state is not null)),
  add constraint ssma_accident_deliveries_sent_at_check check ((status = 'SENT') = (sent_at is not null)) not valid,
  add constraint ssma_accident_deliveries_evidence_array_check check (jsonb_typeof(delivery_evidence) = 'array'),
  add constraint ssma_accident_deliveries_failure_class_check check (failure_class is null or failure_class in ('RETRYABLE', 'PERMANENT', 'UNCERTAIN', 'EXHAUSTED'));
drop trigger if exists ssma_accident_deliveries_delivery_guard on public.ssma_accident_notification_deliveries;
create trigger ssma_accident_deliveries_delivery_guard
before insert or update on public.ssma_accident_notification_deliveries
for each row execute function public.acc_outbound_delivery_guard();

-- ---------------------------------------------------------------- revisão de impacto de versão
alter table public.construmanager_version_review_deliveries
  add column if not exists attempt_count integer not null default 0,
  add column if not exists claimed_at timestamptz,
  add column if not exists failure_class text,
  add column if not exists provider text,
  add column if not exists delivery_state text,
  add column if not exists delivery_evidence jsonb not null default '[]'::jsonb,
  add column if not exists delivery_state_at timestamptz;
update public.construmanager_version_review_deliveries set delivery_state = 'ACCEPTED_BY_PROVIDER', delivery_state_at = coalesce(sent_at, now())
 where status = 'SENT' and delivery_state is null;
update public.construmanager_version_review_deliveries set failure_class = 'EXHAUSTED' where status = 'FAILED' and failure_class is null;
alter table public.construmanager_version_review_deliveries
  add constraint version_review_deliveries_attempt_check check (attempt_count >= 0),
  add constraint version_review_deliveries_delivery_state_check check (delivery_state is null or delivery_state in ('ACCEPTED_BY_PROVIDER', 'DELIVERED', 'BOUNCED')),
  add constraint version_review_deliveries_delivery_state_sent_check check ((status = 'SENT') = (delivery_state is not null)),
  add constraint version_review_deliveries_sent_at_check check ((status = 'SENT') = (sent_at is not null)) not valid,
  add constraint version_review_deliveries_evidence_array_check check (jsonb_typeof(delivery_evidence) = 'array'),
  add constraint version_review_deliveries_failure_class_check check (failure_class is null or failure_class in ('RETRYABLE', 'PERMANENT', 'UNCERTAIN', 'EXHAUSTED'));
drop trigger if exists version_review_deliveries_delivery_guard on public.construmanager_version_review_deliveries;
create trigger version_review_deliveries_delivery_guard
before insert or update on public.construmanager_version_review_deliveries
for each row execute function public.acc_outbound_delivery_guard();

-- ---------------------------------------------------------------- registros de campo SSMA (CRÍTICO / ATRASO)
alter table public.ssma_field_notification_deliveries
  add column if not exists failure_class text,
  add column if not exists delivery_state text,
  add column if not exists delivery_evidence jsonb not null default '[]'::jsonb,
  add column if not exists delivery_state_at timestamptz;
update public.ssma_field_notification_deliveries set delivery_state = 'ACCEPTED_BY_PROVIDER', delivery_state_at = coalesce(sent_at, now())
 where status = 'SENT' and delivery_state is null;
alter table public.ssma_field_notification_deliveries
  add constraint ssma_field_deliveries_delivery_state_check check (delivery_state is null or delivery_state in ('ACCEPTED_BY_PROVIDER', 'DELIVERED', 'BOUNCED')),
  add constraint ssma_field_deliveries_delivery_state_sent_check check ((status = 'SENT') = (delivery_state is not null)),
  add constraint ssma_field_deliveries_evidence_array_check check (jsonb_typeof(delivery_evidence) = 'array'),
  add constraint ssma_field_deliveries_failure_class_check check (failure_class is null or failure_class in ('RETRYABLE', 'PERMANENT', 'UNCERTAIN', 'EXHAUSTED'));
drop trigger if exists ssma_field_deliveries_delivery_guard on public.ssma_field_notification_deliveries;
create trigger ssma_field_deliveries_delivery_guard
before insert or update on public.ssma_field_notification_deliveries
for each row execute function public.acc_outbound_delivery_guard();

-- ---------------------------------------------------------------- falha técnica: entrega por destinatário
create table if not exists public.acc_system_health_alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  incident_id uuid not null references public.acc_system_health_incidents (id) on delete cascade,
  recipient_email text not null check (recipient_email = lower(recipient_email) and btrim(recipient_email) <> ''),
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  claimed_at timestamptz,
  failure_class text check (failure_class is null or failure_class in ('RETRYABLE', 'PERMANENT', 'UNCERTAIN', 'EXHAUSTED')),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  provider text,
  provider_message_id text,
  sent_at timestamptz,
  delivery_state text check (delivery_state is null or delivery_state in ('ACCEPTED_BY_PROVIDER', 'DELIVERED', 'BOUNCED')),
  delivery_evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(delivery_evidence) = 'array'),
  delivery_state_at timestamptz,
  created_at timestamptz not null default now(),
  unique (incident_id, recipient_email),
  check ((status = 'SENT') = (sent_at is not null)),
  check ((status = 'SENT') = (delivery_state is not null))
);
create index if not exists acc_system_health_alert_deliveries_project_idx
  on public.acc_system_health_alert_deliveries (project_id, status, created_at desc);
create trigger acc_system_health_alert_deliveries_delivery_guard
before insert or update on public.acc_system_health_alert_deliveries
for each row execute function public.acc_outbound_delivery_guard();
alter table public.acc_system_health_alert_deliveries enable row level security;
create policy "acc_health_alert_deliveries_select_admin"
  on public.acc_system_health_alert_deliveries for select to authenticated
  using (public.has_project_permission(project_id, 'ADMIN'));
revoke all on table public.acc_system_health_alert_deliveries from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.acc_system_health_alert_deliveries from authenticated;
grant select on public.acc_system_health_alert_deliveries to authenticated;

-- ---------------------------------------------------------------- notification_email_deliveries (status próprio com DELIVERED/BOUNCED)
alter table public.notification_email_deliveries
  add column if not exists delivery_evidence jsonb not null default '[]'::jsonb;

create or replace function public.acc_notification_delivery_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.direction = 'OUTBOUND' then
    if tg_op = 'UPDATE' and old.status in ('SENT', 'DELIVERED', 'BOUNCED') and new.status in ('PENDING', 'FAILED') then
      raise exception 'Entrega já aceita pelo provedor não pode voltar para %.', new.status using errcode = 'check_violation';
    end if;
    if new.status in ('DELIVERED', 'BOUNCED')
       and public.acc_delivery_evidence_state(new.delivery_evidence, new.sent_at) is distinct from new.status then
      raise exception 'Estado % exige evidência registrada suficiente (entrega nunca é presumida).', new.status using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists notification_email_deliveries_delivery_guard on public.notification_email_deliveries;
create trigger notification_email_deliveries_delivery_guard
before insert or update on public.notification_email_deliveries
for each row execute function public.acc_notification_delivery_guard();

-- ---------------------------------------------------------------- registro de evidência (service_role)
create or replace function public.record_outbound_delivery_evidence(p_table text, p_id uuid, p_evidence jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_sent_at timestamptz;
  v_evidence jsonb;
begin
  if p_table not in ('risk_alert_outbox', 'ssma_accident_notification_deliveries', 'construmanager_version_review_deliveries',
                     'ssma_field_notification_deliveries', 'acc_system_health_alert_deliveries') then
    raise exception 'Tabela de entrega não suportada.';
  end if;
  if jsonb_typeof(p_evidence) is distinct from 'object' or nullif(btrim(coalesce(p_evidence ->> 'reference', '')), '') is null then
    raise exception 'Evidência inválida: informe kind, observedAt e reference.';
  end if;
  execute format('select sent_at, delivery_evidence from public.%I where id = $1 and status = ''SENT'' for update', p_table)
    into v_sent_at, v_evidence using p_id;
  if v_evidence is null then
    raise exception 'Só há evidência de entrega para mensagem aceita pelo provedor.';
  end if;
  v_evidence := v_evidence || jsonb_build_array(p_evidence);
  v_state := public.acc_delivery_evidence_state(v_evidence, v_sent_at);
  execute format('update public.%I set delivery_evidence = $1, delivery_state = $2 where id = $3', p_table)
    using v_evidence, v_state, p_id;
  return v_state;
end;
$$;
revoke all on function public.record_outbound_delivery_evidence(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_outbound_delivery_evidence(text, uuid, jsonb) to service_role;
