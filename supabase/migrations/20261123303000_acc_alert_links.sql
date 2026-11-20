-- ============================================================
-- 20261123303000_acc_alert_links.sql
--
-- FASE 3 / Frente D (4/4) — VÍNCULOS ESTRUTURADOS alerta -> RNC / garantia / sinistro.
--
-- Hoje o vínculo é só uma CONVENÇÃO TEXTUAL ('ALERTA:<caseId>' em origin_ref/source_ref). Esta migration cria a tabela
-- `acc_alert_links` (FK composta por projeto, RLS, histórico append-only, unicidade do vínculo ATIVO), as RPCs
-- `acc_alert_link_create` (REGISTER+) e `acc_alert_link_unlink` (MANAGE+, com motivo), leituras `acc_alert_links_for_alert` /
-- `acc_alert_links_for_entity` (READ) e um BACKFILL idempotente e CONSERVADOR da convenção, sem apagar o texto original.
--
-- Regras:
--   * alerta e entidade precisam ser do MESMO projeto (alerta de A + entidade de B => LINK_TARGET_INVALID, sem revelar existência);
--   * desvincular NÃO apaga: grava unlinked_at/by/reason e evento UNLINKED; relinkar cria uma nova linha (histórico preservado);
--   * vincular um alerta a uma RNC/garantia/sinistro NÃO muda o estado de nenhum dos dois; RESOLVIDO do alerta continua sem
--     encerrar a entidade (quality_alert_resolved_guard intacto). record_risk_alert_action e SLAs NÃO são tocados;
--   * BACKFILL só vincula quando o texto contém EXATAMENTE UM UUID 'ALERTA:<uuid>', o alerta existe e é do MESMO projeto;
--     ambíguo / inexistente / de outro projeto / já tratado (inclusive desvinculado por humano) => ignorado e relatado.
-- Idempotente. Reversão: supabase/rollbacks/20261123303000_acc_alert_links.rollback.sql
-- ============================================================

-- chave alvo da FK composta (id já é PK; o índice único (id, project_id) só habilita a FK por projeto)
create unique index if not exists risk_alert_cases_id_project_uq on public.risk_alert_cases (id, project_id);

create table if not exists public.acc_alert_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  alert_case_id uuid not null,
  entity_type text not null check (entity_type in ('RNC', 'GARANTIA', 'SINISTRO')),
  entity_id uuid not null,
  link_source text not null default 'MANUAL' check (link_source in ('MANUAL', 'BACKFILL_CONVENTION')),
  source_ref text,
  note text,
  created_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unlinked_at timestamptz,
  unlinked_by uuid references public.profiles (id) on delete restrict,
  unlink_reason text,
  unique (id, project_id),
  foreign key (alert_case_id, project_id) references public.risk_alert_cases (id, project_id),
  check (link_source = 'BACKFILL_CONVENTION' or created_by is not null),
  check (link_source = 'MANUAL' or nullif(btrim(coalesce(source_ref, '')), '') is not null),
  check ((unlinked_at is null and unlinked_by is null and unlink_reason is null)
      or (unlinked_at is not null and unlinked_by is not null and char_length(btrim(coalesce(unlink_reason, ''))) >= 10))
);

create unique index if not exists acc_alert_links_active_uq
  on public.acc_alert_links (alert_case_id, entity_type, entity_id) where unlinked_at is null;
create index if not exists acc_alert_links_entity_idx on public.acc_alert_links (project_id, entity_type, entity_id);
create index if not exists acc_alert_links_alert_idx on public.acc_alert_links (alert_case_id);

create table if not exists public.acc_alert_link_events (
  seq bigint generated always as identity primary key,
  link_id uuid not null,
  project_id uuid not null references public.projects (id) on delete restrict,
  event text not null check (event in ('LINKED', 'UNLINKED', 'BACKFILLED')),
  actor_user_id uuid,
  detail text,
  occurred_at timestamptz not null default now(),
  foreign key (link_id, project_id) references public.acc_alert_links (id, project_id)
);
create index if not exists acc_alert_link_events_link_idx on public.acc_alert_link_events (link_id, seq);

drop trigger if exists acc_alert_link_events_append_only on public.acc_alert_link_events;
create trigger acc_alert_link_events_append_only before update or delete on public.acc_alert_link_events
  for each row execute function public.quality_prevent_mutation();

-- ---------- integridade da linha: alvo no mesmo projeto; só os campos de desvínculo mudam, uma única vez; nunca apagar ----------
create or replace function public.acc_alert_link_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_ok boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'acc_alert_links is append-only: DELETE não é permitido (desvincule com motivo)';
  end if;
  if tg_op = 'INSERT' then
    v_ok := case new.entity_type
      when 'RNC' then exists (select 1 from public.quality_ncrs x where x.id = new.entity_id and x.project_id = new.project_id)
      when 'GARANTIA' then exists (select 1 from public.quality_warranty_cases x where x.id = new.entity_id and x.project_id = new.project_id)
      when 'SINISTRO' then exists (select 1 from public.insurance_claims x where x.id = new.entity_id and x.project_id = new.project_id)
      else false end;
    if not v_ok then
      raise exception 'LINK_TARGET_INVALID: alerta e % devem existir e ser do mesmo projeto', new.entity_type;
    end if;
    if new.unlinked_at is not null then
      raise exception 'LINK_STATE_INVALID: o vínculo nasce ativo';
    end if;
    return new;
  end if;
  -- UPDATE: somente a passagem de ativo -> desvinculado
  if old.unlinked_at is not null
     or new.unlinked_at is null
     or new.project_id is distinct from old.project_id or new.alert_case_id is distinct from old.alert_case_id
     or new.entity_type is distinct from old.entity_type or new.entity_id is distinct from old.entity_id
     or new.link_source is distinct from old.link_source or new.source_ref is distinct from old.source_ref
     or new.note is distinct from old.note or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'LINK_IMMUTABLE: o vínculo só pode passar de ativo para desvinculado (com motivo); demais campos são imutáveis';
  end if;
  return new;
end;
$$;
drop trigger if exists acc_alert_links_guard_trg on public.acc_alert_links;
create trigger acc_alert_links_guard_trg before insert or update or delete on public.acc_alert_links
  for each row execute function public.acc_alert_link_guard();
revoke all on function public.acc_alert_link_guard() from public, anon, authenticated;

-- ---------- RLS + grants (somente leitura por membro; escrita só pelas RPCs) ----------
alter table public.acc_alert_links enable row level security;
alter table public.acc_alert_link_events enable row level security;
revoke all on table public.acc_alert_links, public.acc_alert_link_events from public, anon, authenticated;
grant select on table public.acc_alert_links, public.acc_alert_link_events to authenticated;
grant select on table public.acc_alert_links, public.acc_alert_link_events to service_role;
drop policy if exists acc_alert_links_select_members on public.acc_alert_links;
create policy acc_alert_links_select_members on public.acc_alert_links
  for select to authenticated using (public.quality_can_read(project_id));
drop policy if exists acc_alert_link_events_select_members on public.acc_alert_link_events;
create policy acc_alert_link_events_select_members on public.acc_alert_link_events
  for select to authenticated using (public.quality_can_read(project_id));

-- ---------- RPC: vincular (REGISTER+) ----------
create or replace function public.acc_alert_link_create(
  p_alert_case_id uuid, p_entity_type text, p_entity_id uuid, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_existing uuid;
  v_id uuid;
  v_ok boolean;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.project_id into v_project from public.risk_alert_cases a where a.id = p_alert_case_id;
  if v_project is null or not public.quality_can_register(v_project) then raise exception 'FORBIDDEN'; end if;
  if p_entity_type is null or p_entity_type not in ('RNC', 'GARANTIA', 'SINISTRO') or p_entity_id is null then
    raise exception 'INVALID_DATA: informe o tipo (RNC, GARANTIA ou SINISTRO) e o id da entidade';
  end if;
  v_ok := case p_entity_type
    when 'RNC' then exists (select 1 from public.quality_ncrs x where x.id = p_entity_id and x.project_id = v_project)
    when 'GARANTIA' then exists (select 1 from public.quality_warranty_cases x where x.id = p_entity_id and x.project_id = v_project)
    else exists (select 1 from public.insurance_claims x where x.id = p_entity_id and x.project_id = v_project) end;
  if not v_ok then
    raise exception 'LINK_TARGET_INVALID: alerta e % devem existir e ser do mesmo projeto', p_entity_type;
  end if;

  select l.id into v_existing from public.acc_alert_links l
    where l.alert_case_id = p_alert_case_id and l.entity_type = p_entity_type and l.entity_id = p_entity_id and l.unlinked_at is null;
  if found then
    return jsonb_build_object('ok', true, 'created', false, 'id', v_existing);
  end if;
  begin
    insert into public.acc_alert_links (project_id, alert_case_id, entity_type, entity_id, link_source, note, created_by)
    values (v_project, p_alert_case_id, p_entity_type, p_entity_id, 'MANUAL', v_note, v_uid)
    returning id into v_id;
  exception when unique_violation then
    select l.id into v_existing from public.acc_alert_links l
      where l.alert_case_id = p_alert_case_id and l.entity_type = p_entity_type and l.entity_id = p_entity_id and l.unlinked_at is null;
    return jsonb_build_object('ok', true, 'created', false, 'id', v_existing);
  end;
  insert into public.acc_alert_link_events (link_id, project_id, event, actor_user_id, detail) values (v_id, v_project, 'LINKED', v_uid, v_note);
  perform public.quality_rpc_audit(v_project, 'ACC_ALERT_LINK_CREATE', 'ACC_ALERT_LINK', v_id,
    jsonb_build_object('alertCaseId', p_alert_case_id, 'entityType', p_entity_type, 'entityId', p_entity_id, 'note', v_note,
      'rule', 'vincular não altera o estado da entidade; RESOLVIDO do alerta não encerra RNC/garantia/sinistro'));
  return jsonb_build_object('ok', true, 'created', true, 'id', v_id);
end;
$$;

-- ---------- RPC: desvincular (MANAGE+, motivo obrigatório; nada é apagado) ----------
create or replace function public.acc_alert_link_unlink(p_link_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_l public.acc_alert_links%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_l from public.acc_alert_links where id = p_link_id;
  if not found or not public.quality_can_manage(v_l.project_id) then raise exception 'FORBIDDEN'; end if;
  select * into v_l from public.acc_alert_links where id = p_link_id for update;
  if v_l.unlinked_at is not null then raise exception 'INVALID_STATE: o vínculo já foi desfeito'; end if;
  if v_reason is null or char_length(v_reason) < 10 then
    raise exception 'JUSTIFICATION_REQUIRED: informe o motivo do desvínculo (mín. 10 caracteres)';
  end if;
  update public.acc_alert_links set unlinked_at = now(), unlinked_by = v_uid, unlink_reason = v_reason where id = v_l.id;
  insert into public.acc_alert_link_events (link_id, project_id, event, actor_user_id, detail) values (v_l.id, v_l.project_id, 'UNLINKED', v_uid, v_reason);
  perform public.quality_rpc_audit(v_l.project_id, 'ACC_ALERT_LINK_UNLINK', 'ACC_ALERT_LINK', v_l.id,
    jsonb_build_object('alertCaseId', v_l.alert_case_id, 'entityType', v_l.entity_type, 'entityId', v_l.entity_id, 'reason', v_reason));
  return jsonb_build_object('ok', true, 'id', v_l.id);
end;
$$;

-- ---------- leituras (READ) ----------
create or replace function public.acc_alert_links_for_alert(p_alert_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select a.project_id into v_project from public.risk_alert_cases a where a.id = p_alert_case_id;
  if v_project is null or not public.quality_can_read(v_project) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'entityType', l.entity_type, 'entityId', l.entity_id,
    'linkSource', l.link_source, 'sourceRef', l.source_ref, 'active', l.unlinked_at is null, 'createdAt', l.created_at,
    'unlinkedAt', l.unlinked_at, 'unlinkReason', l.unlink_reason) order by l.created_at, l.id)
    from public.acc_alert_links l where l.alert_case_id = p_alert_case_id), '[]'::jsonb);
end;
$$;

create or replace function public.acc_alert_links_for_entity(p_entity_type text, p_entity_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  v_project := case p_entity_type
    when 'RNC' then (select x.project_id from public.quality_ncrs x where x.id = p_entity_id)
    when 'GARANTIA' then (select x.project_id from public.quality_warranty_cases x where x.id = p_entity_id)
    when 'SINISTRO' then (select x.project_id from public.insurance_claims x where x.id = p_entity_id)
    else null end;
  if v_project is null or not public.quality_can_read(v_project) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'alertCaseId', l.alert_case_id, 'linkSource', l.link_source,
    'active', l.unlinked_at is null, 'createdAt', l.created_at) order by l.created_at, l.id)
    from public.acc_alert_links l where l.entity_type = p_entity_type and l.entity_id = p_entity_id and l.project_id = v_project), '[]'::jsonb);
end;
$$;

revoke all on function public.acc_alert_link_create(uuid, text, uuid, text), public.acc_alert_link_unlink(uuid, text),
  public.acc_alert_links_for_alert(uuid), public.acc_alert_links_for_entity(text, uuid) from public, anon;
grant execute on function public.acc_alert_link_create(uuid, text, uuid, text), public.acc_alert_link_unlink(uuid, text),
  public.acc_alert_links_for_alert(uuid), public.acc_alert_links_for_entity(text, uuid) to authenticated;

-- ---------- BACKFILL conservador e idempotente da convenção 'ALERTA:<uuid>' ----------
-- Fontes: quality_ncrs.origin_ref, quality_warranty_cases.origin_ref, insurance_claims.source_ref e quality_evidence.source_ref
-- (a evidência vincula a RNC/garantia a que pertence). O texto original NUNCA é alterado. Interna: sem EXECUTE para clientes.
create or replace function public.acc_alert_links_backfill()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_ids text[];
  v_alert_project uuid;
  v_id uuid;
  v_linked integer := 0;
  v_ambiguous integer := 0;
  v_missing integer := 0;
  v_other_project integer := 0;
  v_existing integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_pattern constant text := 'ALERTA:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
begin
  for r in
    select 'RNC'::text as etype, n.id as eid, n.project_id as pid, n.origin_ref as ref, 'quality_ncrs.origin_ref'::text as src
      from public.quality_ncrs n where n.origin_ref ~* 'ALERTA:\s*[0-9a-f]{8}-'
    union all
    select 'GARANTIA', w.id, w.project_id, w.origin_ref, 'quality_warranty_cases.origin_ref'
      from public.quality_warranty_cases w where w.origin_ref ~* 'ALERTA:\s*[0-9a-f]{8}-'
    union all
    select 'SINISTRO', c.id, c.project_id, c.source_ref, 'insurance_claims.source_ref'
      from public.insurance_claims c where c.source_ref ~* 'ALERTA:\s*[0-9a-f]{8}-'
    union all
    select 'RNC', e.ncr_id, e.project_id, e.source_ref, 'quality_evidence.source_ref'
      from public.quality_evidence e where e.ncr_id is not null and e.source_ref ~* 'ALERTA:\s*[0-9a-f]{8}-'
    union all
    select 'GARANTIA', e.warranty_case_id, e.project_id, e.source_ref, 'quality_evidence.source_ref'
      from public.quality_evidence e where e.warranty_case_id is not null and e.source_ref ~* 'ALERTA:\s*[0-9a-f]{8}-'
    order by 1, 2
  loop
    select array_agg(distinct lower(m[1])) into v_ids from regexp_matches(r.ref, v_pattern, 'gi') as m;
    if v_ids is null or cardinality(v_ids) <> 1 then
      v_ambiguous := v_ambiguous + 1;
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('reason', case when v_ids is null then 'NO_FULL_UUID' else 'AMBIGUOUS_MULTIPLE_UUIDS' end,
        'entityType', r.etype, 'entityId', r.eid, 'source', r.src, 'ref', left(r.ref, 200)));
      continue;
    end if;
    select a.project_id into v_alert_project from public.risk_alert_cases a where a.id = v_ids[1]::uuid;
    if not found then
      v_missing := v_missing + 1;
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('reason', 'ALERT_NOT_FOUND', 'entityType', r.etype, 'entityId', r.eid,
        'source', r.src, 'alertId', v_ids[1], 'ref', left(r.ref, 200)));
      continue;
    end if;
    if v_alert_project is distinct from r.pid then
      v_other_project := v_other_project + 1;
      v_skipped := v_skipped || jsonb_build_array(jsonb_build_object('reason', 'ALERT_IN_OTHER_PROJECT', 'entityType', r.etype, 'entityId', r.eid,
        'source', r.src, 'alertId', v_ids[1], 'ref', left(r.ref, 200)));
      continue;
    end if;
    -- qualquer linha anterior (ativa OU desvinculada por humano) para o mesmo trio impede nova inserção: idempotente e respeita o humano
    if exists (select 1 from public.acc_alert_links l where l.alert_case_id = v_ids[1]::uuid and l.entity_type = r.etype and l.entity_id = r.eid) then
      v_existing := v_existing + 1;
      continue;
    end if;
    insert into public.acc_alert_links (project_id, alert_case_id, entity_type, entity_id, link_source, source_ref)
    values (r.pid, v_ids[1]::uuid, r.etype, r.eid, 'BACKFILL_CONVENTION', left(r.ref, 900) || ' [' || r.src || ']')
    returning id into v_id;
    insert into public.acc_alert_link_events (link_id, project_id, event, detail) values (v_id, r.pid, 'BACKFILLED', r.src);
    insert into public.audit_log_entries (project_id, actor_type, action, entity_type, entity_id, detail)
    values (r.pid, 'SYSTEM', 'ACC_ALERT_LINK_BACKFILL', 'ACC_ALERT_LINK', v_id::text,
      jsonb_build_object('alertCaseId', v_ids[1], 'entityType', r.etype, 'entityId', r.eid, 'source', r.src)::text);
    v_linked := v_linked + 1;
  end loop;
  return jsonb_build_object('linked', v_linked, 'alreadyHandled', v_existing, 'skippedAmbiguous', v_ambiguous,
    'skippedAlertNotFound', v_missing, 'skippedOtherProject', v_other_project, 'skipped', v_skipped);
end;
$$;
revoke all on function public.acc_alert_links_backfill() from public, anon, authenticated, service_role;

do $$
declare v_result jsonb;
begin
  v_result := public.acc_alert_links_backfill();
  raise notice 'acc_alert_links backfill: vinculados=% ja_tratados=% ambiguos=% alerta_inexistente=% alerta_de_outro_projeto=%',
    v_result ->> 'linked', v_result ->> 'alreadyHandled', v_result ->> 'skippedAmbiguous', v_result ->> 'skippedAlertNotFound', v_result ->> 'skippedOtherProject';
  if jsonb_array_length(v_result -> 'skipped') > 0 then
    raise notice 'acc_alert_links backfill ignorados (revisar manualmente): %', v_result -> 'skipped';
  end if;
end $$;

comment on table public.acc_alert_links is
  'Vínculo estruturado alerta -> RNC/garantia/sinistro (fase 3/D). Escrita só por acc_alert_link_create/unlink; histórico append-only; o texto ALERTA:<id> original é preservado.';
