-- 20261209100000_email_signal_pillars_and_review.sql
-- Fase 6 / Frente H2b (1) PILARES e (2) REVISÃO HUMANA de sinais de risco de e-mail.
--   (1) Pilares são somente PRAZO, CUSTO, SEGURANCA e QUALIDADE. Jurídico e Comercial são ÁREAS FUNCIONAIS (coluna nova
--       functional_area), não pilares. Migração ADITIVA, sem perda de dados: o pilar original fica em legacy_pillar; sinais que eram
--       JURIDICO passam a ter functional_area = JURIDICO e pilar nulo (ou o pilar de IMPACTO, quando o tipo tem impacto óbvio:
--       PLEITO => CUSTO); sinais de pilar CUSTO ganham functional_area = COMERCIAL. Um gatilho BEFORE INSERT mantém compatível o
--       gravador antigo (que ainda envia pillar = 'JURIDICO') e deduplica por (classificação, tipo) porque o pilar agora pode ser nulo.
--       A view email_risk_signals_legacy entrega a coluna `pillar` no contrato antigo (JURIDICO | PRAZO | CUSTO | SEGURANCA | QUALIDADE)
--       para o coletor de alertas (Frente D), que lê pillar/signal_kind.
--   (2) CONFIRMAR/DESCARTAR: RPC email_risk_signal_review(p_signal_id, p_decision CONFIRM|DISCARD, p_note), por GESTOR/GERENTE/
--       ADMINISTRADOR ativo do projeto OU por profissional expressamente DELEGADO (tabela email_signal_review_delegations: por
--       projeto/área, com validade <= 180 dias, concedida por ADMINISTRADOR, revogável, auditada). Sinal cuja mensagem NÃO tem vínculo
--       de projeto validado (LINKED) ou cuja organização só tem vínculo CANDIDATO permanece PENDENTE: CONFIRM é recusado
--       (PENDING_LINK_VALIDATION) até o vínculo ser validado. Toda decisão grava linha em email_signal_review_audit (append-only).
--       A mensagem original (public.emails) nunca é alterada; indício não vira fato por decisão automática.
-- Depende de 20261202100000 (sinais) e 20261203100000/110000 (organizações). Idempotente. Reversível:
-- supabase/rollbacks/20261209100000_email_signal_pillars_and_review.rollback.sql.

-- ============================================================
-- 1) Mapeamento tipo de sinal -> área funcional / pilar de impacto (fonte única do banco; espelho em lib/email-classification/pillars.ts)
-- ============================================================
create or replace function public.email_signal_functional_area_for(p_kind text, p_pillar text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind in ('DESCUMPRIMENTO_INDICIO', 'PLEITO', 'CONFLITO_RESPONSABILIDADE', 'RECLAMACAO_FORMAL', 'NOTIFICACAO_OFICIAL',
                    'ORDEM_FORA_DE_DELEGACAO', 'ALTERACAO_CONTRATUAL_SEM_FORMALIZACAO', 'DEPENDE_APROVACAO_CLIENTE') then 'JURIDICO'
    when p_pillar = 'JURIDICO' then 'JURIDICO'
    when p_pillar = 'CUSTO' then 'COMERCIAL'
    else null
  end;
$$;

create or replace function public.email_signal_impact_pillar_for(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'PLEITO' then 'CUSTO' else null end;
$$;

revoke all on function public.email_signal_functional_area_for(text, text) from public, anon;
revoke all on function public.email_signal_impact_pillar_for(text) from public, anon;
grant execute on function public.email_signal_functional_area_for(text, text) to authenticated, service_role;
grant execute on function public.email_signal_impact_pillar_for(text) to authenticated, service_role;

-- ============================================================
-- 2) Colunas novas (aditivas)
-- ============================================================
alter table public.email_risk_signals add column if not exists functional_area text null;
alter table public.email_risk_signals add column if not exists legacy_pillar text null;
alter table public.email_risk_signals add column if not exists review_status text not null default 'PENDING';
alter table public.email_risk_signals add column if not exists reviewed_by uuid null references auth.users (id) on delete set null;
alter table public.email_risk_signals add column if not exists reviewed_at timestamptz null;
alter table public.email_risk_signals add column if not exists review_note text null;

-- O pilar deixa de ser obrigatório e perde o valor JURIDICO.
alter table public.email_risk_signals alter column pillar drop not null;
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.email_risk_signals'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%pillar%' and conname <> 'email_risk_signals_pillar_axis_check'
  loop
    execute format('alter table public.email_risk_signals drop constraint %I', c.conname);
  end loop;
end $$;

-- Preserva o pilar original e reclassifica as linhas existentes.
update public.email_risk_signals s set
  legacy_pillar = coalesce(s.legacy_pillar, s.pillar),
  functional_area = coalesce(s.functional_area, public.email_signal_functional_area_for(s.signal_kind, s.pillar)),
  pillar = case when s.pillar = 'JURIDICO' then public.email_signal_impact_pillar_for(s.signal_kind) else s.pillar end
where s.legacy_pillar is null or s.pillar = 'JURIDICO';

update public.email_risk_signals set review_status = 'CONFIRMED' where confirmed and review_status = 'PENDING';

alter table public.email_risk_signals drop constraint if exists email_risk_signals_pillar_four_check;
alter table public.email_risk_signals add constraint email_risk_signals_pillar_four_check
  check (pillar is null or pillar in ('PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE'));
alter table public.email_risk_signals drop constraint if exists email_risk_signals_functional_area_check;
alter table public.email_risk_signals add constraint email_risk_signals_functional_area_check
  check (functional_area is null or functional_area in ('JURIDICO', 'COMERCIAL'));
alter table public.email_risk_signals drop constraint if exists email_risk_signals_pillar_axis_check;
alter table public.email_risk_signals add constraint email_risk_signals_pillar_axis_check
  check (pillar is not null or functional_area is not null);
alter table public.email_risk_signals drop constraint if exists email_risk_signals_review_status_check;
alter table public.email_risk_signals add constraint email_risk_signals_review_status_check
  check (review_status in ('PENDING', 'CONFIRMED', 'DISCARDED') and (review_status <> 'DISCARDED' or reviewed_by is not null));

-- Com pilar nulo a chave antiga (classificação, pilar, tipo) não deduplica: cada tipo de sinal é único por classificação.
create unique index if not exists email_risk_signals_classification_kind_uidx
  on public.email_risk_signals (classification_id, signal_kind);
create index if not exists email_risk_signals_review_idx
  on public.email_risk_signals (project_id, review_status, created_at desc);

comment on column public.email_risk_signals.functional_area is
  'Área funcional do sinal (JURIDICO | COMERCIAL). Não é pilar. Fase 6/H2b.';
comment on column public.email_risk_signals.pillar is
  'Pilar de impacto: somente PRAZO, CUSTO, SEGURANCA, QUALIDADE (nulo quando o sinal é puramente jurídico/comercial). Fase 6/H2b.';
comment on column public.email_risk_signals.legacy_pillar is
  'Pilar gravado antes da Fase 6/H2b (evidência da migração; nunca usado para decisão).';

-- Compatibilidade do gravador antigo + deduplicação. BEFORE INSERT; devolver NULL descarta a linha duplicada (equivale a ON CONFLICT DO NOTHING).
create or replace function public.email_risk_signals_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.pillar = 'JURIDICO' then
    new.legacy_pillar := coalesce(new.legacy_pillar, 'JURIDICO');
    new.functional_area := coalesce(new.functional_area, 'JURIDICO');
    new.pillar := public.email_signal_impact_pillar_for(new.signal_kind);
  end if;
  if new.functional_area is null then
    new.functional_area := public.email_signal_functional_area_for(new.signal_kind, new.pillar);
  end if;
  if exists (select 1 from public.email_risk_signals s where s.classification_id = new.classification_id and s.signal_kind = new.signal_kind) then
    return null;
  end if;
  return new;
end;
$$;
revoke all on function public.email_risk_signals_normalize() from public, anon, authenticated;

drop trigger if exists email_risk_signals_a_normalize on public.email_risk_signals;
create trigger email_risk_signals_a_normalize
  before insert on public.email_risk_signals
  for each row execute function public.email_risk_signals_normalize();

-- View de COMPATIBILIDADE para o coletor de D: `pillar` no contrato antigo (área jurídica volta como 'JURIDICO').
create or replace view public.email_risk_signals_legacy with (security_invoker = true) as
select s.id, s.email_id, s.classification_id, s.project_id,
       case when s.functional_area = 'JURIDICO' then 'JURIDICO' else coalesce(s.pillar, s.functional_area) end as pillar,
       s.signal_kind, s.summary, s.evidence_excerpt, s.evidence_ref, s.is_indication, s.confirmed, s.quantified_impact,
       s.alert_case_id, s.created_at, s.functional_area, s.review_status
from public.email_risk_signals s;
revoke all on public.email_risk_signals_legacy from public, anon;
grant select on public.email_risk_signals_legacy to authenticated, service_role;
comment on view public.email_risk_signals_legacy is
  'Compatibilidade (Fase 6/H2b): email_risk_signals com a coluna pillar no contrato anterior para leitores que ainda esperam JURIDICO como pilar.';

-- ============================================================
-- 3) Auditoria append-only da revisão e das delegações
-- ============================================================
create table if not exists public.email_signal_review_audit (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  actor_id uuid,
  project_id uuid,
  action text not null check (action in ('REVIEW_CONFIRM', 'REVIEW_DISCARD', 'DELEGATION_GRANT', 'DELEGATION_REVOKE')),
  signal_id uuid,
  delegation_id uuid,
  via text check (via is null or via in ('TIER', 'DELEGATION')),
  before_state jsonb,
  after_state jsonb,
  note text
);
create index if not exists email_signal_review_audit_project_idx on public.email_signal_review_audit (project_id, at desc);

create or replace function public.email_signal_review_audit_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'EMAIL_SIGNAL_REVIEW_AUDIT_APPEND_ONLY: a trilha de revisão de sinais não admite alteração nem exclusão';
end;
$$;
drop trigger if exists email_signal_review_audit_no_update on public.email_signal_review_audit;
create trigger email_signal_review_audit_no_update before update or delete on public.email_signal_review_audit
  for each row execute function public.email_signal_review_audit_guard();
drop trigger if exists email_signal_review_audit_no_truncate on public.email_signal_review_audit;
create trigger email_signal_review_audit_no_truncate before truncate on public.email_signal_review_audit
  for each statement execute function public.email_signal_review_audit_guard();

-- ============================================================
-- 4) Delegação expressa de revisão (por projeto e área, com validade)
-- ============================================================
create table if not exists public.email_signal_review_delegations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  scope text not null check (scope in ('TODAS', 'PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE', 'JURIDICO', 'COMERCIAL')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  reason text not null check (char_length(btrim(reason)) >= 5),
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  revoke_reason text,
  check (valid_until > valid_from and valid_until <= valid_from + interval '180 days'),
  check (revoked_at is null or revoke_reason is not null)
);
create index if not exists email_signal_review_delegations_lookup_idx
  on public.email_signal_review_delegations (project_id, user_id) where revoked_at is null;

alter table public.email_signal_review_audit enable row level security;
alter table public.email_signal_review_delegations enable row level security;

drop policy if exists email_signal_review_audit_select on public.email_signal_review_audit;
create policy email_signal_review_audit_select on public.email_signal_review_audit for select to authenticated
  using (project_id is not null and public.acc_project_tier(project_id) in ('MANAGE', 'ADMIN'));
drop policy if exists email_signal_review_delegations_select on public.email_signal_review_delegations;
create policy email_signal_review_delegations_select on public.email_signal_review_delegations for select to authenticated
  using (public.acc_project_tier(project_id) in ('MANAGE', 'ADMIN') or user_id = auth.uid());

revoke all on public.email_signal_review_audit, public.email_signal_review_delegations from public, anon, authenticated;
grant select on public.email_signal_review_audit, public.email_signal_review_delegations to authenticated;
grant all on public.email_signal_review_audit, public.email_signal_review_delegations to service_role;

create or replace function public.email_signal_review_audit_write(
  p_project_id uuid, p_action text, p_signal_id uuid, p_delegation_id uuid, p_via text, p_before jsonb, p_after jsonb, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.email_signal_review_audit (actor_id, project_id, action, signal_id, delegation_id, via, before_state, after_state, note)
  values (auth.uid(), p_project_id, p_action, p_signal_id, p_delegation_id, p_via, p_before, p_after, nullif(btrim(p_note), ''));
$$;
revoke all on function public.email_signal_review_audit_write(uuid, text, uuid, uuid, text, jsonb, jsonb, text) from public, anon, authenticated;

-- Concessão (somente ADMINISTRADOR ativo do projeto). O delegado precisa ser membro ATIVO do projeto.
create or replace function public.acc_email_signal_delegate_grant(
  p_project_id uuid, p_user_id uuid, p_scope text, p_valid_until timestamptz, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.email_signal_review_delegations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_project_id is null or public.acc_project_tier(p_project_id) <> 'ADMIN' then
    raise exception 'FORBIDDEN: somente ADMINISTRADOR ativo do projeto delega a revisão de sinais';
  end if;
  if p_scope is null or p_scope not in ('TODAS', 'PRAZO', 'CUSTO', 'SEGURANCA', 'QUALIDADE', 'JURIDICO', 'COMERCIAL') then raise exception 'INVALID_SCOPE'; end if;
  if p_valid_until is null or p_valid_until <= now() or p_valid_until > now() + interval '180 days' then
    raise exception 'INVALID_VALIDITY: a validade deve ser futura e de no máximo 180 dias';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'REASON_REQUIRED'; end if;
  if not exists (select 1 from public.project_memberships pm where pm.project_id = p_project_id and pm.user_id = p_user_id and pm.status = 'ACTIVE') then
    raise exception 'NOT_MEMBER: o delegado precisa ser membro ativo do projeto';
  end if;
  insert into public.email_signal_review_delegations (project_id, user_id, scope, valid_until, granted_by, reason)
  values (p_project_id, p_user_id, p_scope, p_valid_until, auth.uid(), btrim(p_reason))
  returning * into v_row;
  perform public.email_signal_review_audit_write(p_project_id, 'DELEGATION_GRANT', null, v_row.id, 'TIER', null, to_jsonb(v_row), p_reason);
  return v_row.id;
end;
$$;

create or replace function public.acc_email_signal_delegate_revoke(p_delegation_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.email_signal_review_delegations;
  v_after public.email_signal_review_delegations;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_before from public.email_signal_review_delegations where id = p_delegation_id for update;
  if not found then raise exception 'NOT_FOUND: delegação inexistente'; end if;
  if public.acc_project_tier(v_before.project_id) <> 'ADMIN' then
    raise exception 'FORBIDDEN: somente ADMINISTRADOR ativo do projeto revoga a delegação';
  end if;
  if v_before.revoked_at is not null then raise exception 'ALREADY_REVOKED'; end if;
  if p_reason is null or char_length(btrim(p_reason)) < 5 then raise exception 'REASON_REQUIRED'; end if;
  update public.email_signal_review_delegations set revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
  where id = p_delegation_id returning * into v_after;
  perform public.email_signal_review_audit_write(v_before.project_id, 'DELEGATION_REVOKE', null, p_delegation_id, 'TIER', to_jsonb(v_before), to_jsonb(v_after), p_reason);
end;
$$;

-- ============================================================
-- 5) Revisão: CONFIRM | DISCARD
-- ============================================================
create or replace function public.email_risk_signal_review(p_signal_id uuid, p_decision text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sig public.email_risk_signals;
  v_cls public.email_message_classifications;
  v_tier text;
  v_via text;
  v_deleg uuid;
  v_before jsonb;
  v_after public.email_risk_signals;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_decision is null or p_decision not in ('CONFIRM', 'DISCARD') then raise exception 'INVALID_DECISION'; end if;
  select * into v_sig from public.email_risk_signals where id = p_signal_id for update;
  if not found then raise exception 'NOT_FOUND: sinal inexistente'; end if;

  v_tier := public.acc_project_tier(v_sig.project_id);
  if v_tier in ('MANAGE', 'ADMIN') then
    v_via := 'TIER';
  elsif v_tier <> 'NONE' then
    select d.id into v_deleg
    from public.email_signal_review_delegations d
    where d.project_id = v_sig.project_id and d.user_id = auth.uid() and d.revoked_at is null
      and now() >= d.valid_from and now() < d.valid_until
      and d.scope in ('TODAS', coalesce(v_sig.pillar, '-'), coalesce(v_sig.functional_area, '-'))
    order by d.valid_until desc limit 1;
    if v_deleg is null then
      raise exception 'FORBIDDEN: somente GESTOR, GERENTE, ADMINISTRADOR ou profissional expressamente delegado (vigente, para esta área) revisa sinais';
    end if;
    v_via := 'DELEGATION';
  else
    raise exception 'FORBIDDEN: sem acesso ativo ao projeto do sinal';
  end if;

  if v_sig.review_status <> 'PENDING' then raise exception 'ALREADY_REVIEWED: o sinal já foi %', v_sig.review_status; end if;
  if p_decision = 'DISCARD' and (p_note is null or char_length(btrim(p_note)) < 5) then raise exception 'NOTE_REQUIRED: informe a justificativa do descarte'; end if;

  if p_decision = 'CONFIRM' then
    select * into v_cls from public.email_message_classifications where id = v_sig.classification_id;
    if not found or v_cls.project_link_status <> 'LINKED' or v_cls.status <> 'ANALYZED' then
      raise exception 'PENDING_LINK_VALIDATION: o vínculo da mensagem com o projeto ainda não foi validado; o sinal permanece PENDENTE';
    end if;
    if v_cls.organization_id is not null and not exists (
      select 1 from public.external_org_project_links l
      where l.organization_id = v_cls.organization_id and l.project_id = v_sig.project_id and l.status = 'ACTIVE'
        and l.valid_from <= current_date and (l.valid_until is null or l.valid_until >= current_date)
    ) then
      raise exception 'PENDING_LINK_VALIDATION: a organização remetente só tem vínculo CANDIDATO/inválido neste projeto; valide o vínculo antes de confirmar';
    end if;
  end if;

  v_before := to_jsonb(v_sig);
  update public.email_risk_signals set
    review_status = case p_decision when 'CONFIRM' then 'CONFIRMED' else 'DISCARDED' end,
    confirmed = (p_decision = 'CONFIRM'),
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
  where id = p_signal_id returning * into v_after;

  perform public.email_signal_review_audit_write(v_sig.project_id, 'REVIEW_' || p_decision, v_sig.id, v_deleg, v_via, v_before, to_jsonb(v_after), p_note);
  return jsonb_build_object('signal_id', v_sig.id, 'decision', p_decision, 'review_status', v_after.review_status, 'via', v_via);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'email_risk_signal_review(uuid, text, text)',
    'acc_email_signal_delegate_grant(uuid, uuid, text, timestamptz, text)',
    'acc_email_signal_delegate_revoke(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

comment on function public.email_risk_signal_review(uuid, text, text) is
  'Fase 6/H2b: confirma/descarta sinal de e-mail. GESTOR/GERENTE/ADMIN do projeto ou delegado vigente; vínculo CANDIDATO/ambíguo => PENDING_LINK_VALIDATION; auditoria append-only.';
