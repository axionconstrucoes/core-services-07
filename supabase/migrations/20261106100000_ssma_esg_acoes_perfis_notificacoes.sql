-- ============================================================
-- 20261106100000_ssma_esg_acoes_perfis_notificacoes.sql
--
-- NÃO APLICADA EM PRODUÇÃO. Pré-condições e plano de aplicação: docs/ssma-esg-migration-20261106100000.md.
--
-- 1. AÇÕES CORRETIVAS SSMA ↔ módulo Ações e Escalonamentos (sla_actions), vínculo 1:1:
--      ssma_corrective_actions.sla_action_id  ↔  sla_actions.related_ssma_corrective_action_id
--    Fonte oficial por campo:
--      - descrição, evidência (fotos), histórico imutável e conclusão (que exige evidência): SSMA
--        (ssma_corrective_actions / _events / ssma_field_record_photos);
--      - responsável, prazo e acompanhamento (assumir, iniciar, escalonar, reatribuir): sla_actions;
--      - status: o SSMA decide a CONCLUSÃO (nada é concluído sem evidência/justificativa); o SLA decide
--        o andamento. As duas pontas são mantidas iguais NA MESMA TRANSAÇÃO (RPC do SSMA grava os dois
--        lados; trigger do SLA propaga reatribuição/prazo/início para o SSMA e RECUSA concluir pelo
--        módulo de Ações uma ação de origem SSMA).
--    Ordem de bloqueio única (evita deadlock): sla_actions primeiro, depois ssma_corrective_actions.
--    Idempotência: unique parcial nas duas pontas + RPC de envio tolerante a envio concorrente.
--    Backfill idempotente das ações existentes, sem apagar nem alterar histórico/evidências/fotos.
-- 2. PERFIS ESG: Administrador, Gerente, Gestor e Colaborador ATIVOS registram comprovação e anexam
--    evidência (Colaborador só na própria comprovação); Leitura apenas consulta; a REVISÃO continua só
--    do Administrador (RPC review_esg_obligation_submission, inalterada); configuração de obrigações
--    continua só do Administrador. Storage: upload em <obra>/esg-evidence/ liberado ao mesmo grupo.
-- 3. NOTIFICAÇÕES de campo: tabela de entregas (dedupe, falha, ausência de destinatário).
-- 4. VÍNCULO EXPLÍCITO entre acidente de formulário e ocorrência de campo (dupla contagem): só um vínculo CONFIRMADO por
--    Administrador (RPC ssma_incident_link_set, com auditoria) desconta um relato do total; proximidade de datas apenas SUGERE.
-- 5. CLASSIFICAÇÃO ESTRUTURADA do registro de campo (categoria de lista fechada, validada por TRIGGER só em registros novos ou
--    quando a categoria muda; os anteriores não são reescritos, revalidados nem impedidos de receber UPDATE de outras colunas)
--    — base do indicador de quase-acidentes.
--
-- Nada é apagado: só ADD COLUMN/INDEX/TABLE, troca de constraints/policies e CREATE OR REPLACE de funções.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Vínculo SSMA ↔ SLA
-- ------------------------------------------------------------
alter table public.sla_actions drop constraint if exists sla_actions_origin_check;
alter table public.sla_actions
  add constraint sla_actions_origin_check
  check (origin in ('MANUAL', 'EXPERT_RECOMMENDATION', 'ESG_OBLIGATION', 'EVENT', 'ACTION_REQUEST', 'AI_FINDING', 'SSMA_CORRECTIVE_ACTION', 'OTHER'));

alter table public.ssma_corrective_actions
  add column if not exists sla_action_id uuid references public.sla_actions (id) on delete set null;
alter table public.sla_actions
  add column if not exists related_ssma_corrective_action_id uuid references public.ssma_corrective_actions (id) on delete set null;

create unique index if not exists ssma_corrective_actions_sla_action_uidx
  on public.ssma_corrective_actions (sla_action_id) where sla_action_id is not null;
create unique index if not exists sla_actions_related_ssma_action_uidx
  on public.sla_actions (related_ssma_corrective_action_id) where related_ssma_corrective_action_id is not null;

-- Histórico: reatribuição e mudança de prazo feitas pelo módulo de Ações também ficam no histórico SSMA.
alter table public.ssma_corrective_action_events drop constraint if exists ssma_corrective_action_events_kind_check;
alter table public.ssma_corrective_action_events
  add constraint ssma_corrective_action_events_kind_check
  check (kind in ('CRIADA', 'ANDAMENTO', 'CONCLUIDA', 'REATRIBUIDA', 'PRAZO_ALTERADO'));

create or replace function public.ssma_risk_to_sla_risk(p_risk text)
returns text language sql immutable set search_path = ''
as $$ select case p_risk when 'CRITICA' then 'CRITICAL' when 'ALTA' then 'HIGH' when 'MEDIA' then 'MEDIUM' else 'LOW' end $$;

-- Fim do dia do prazo (AAAA-MM-DD) no fuso da obra (padrão do SLA: America/Sao_Paulo).
create or replace function public.ssma_due_date_to_timestamptz(p_due date)
returns timestamptz language sql immutable set search_path = ''
as $$ select (((p_due + 1)::timestamp) at time zone 'America/Sao_Paulo') - interval '1 second' $$;

-- Cria (ou devolve) a ação do módulo SLA vinculada a uma ação corretiva SSMA. INTERNA: só funções
-- SECURITY DEFINER do próprio SSMA e o backfill a chamam. Idempotente.
create or replace function public.ssma_link_sla_action(p_action_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.ssma_corrective_actions%rowtype;
  v_record public.ssma_field_records%rowtype;
  v_sla_id uuid;
  v_responsible uuid;
  v_ack_at timestamptz;
  v_ack_by uuid;
  v_done_by uuid;
  v_note text;
  v_first_andamento record;
  v_conclusion record;
  v_status text;
  v_due timestamptz;
  v_assume timestamptz;
begin
  select * into v_action from public.ssma_corrective_actions where id = p_action_id;
  if not found then return null; end if;
  if v_action.sla_action_id is not null then return v_action.sla_action_id; end if;
  select * into v_record from public.ssma_field_records where id = v_action.record_id;

  -- responsável precisa ser membro (FK composta do SLA); se saiu da obra, a ação SLA nasce sem responsável.
  v_responsible := case when exists (
      select 1 from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_action.responsible_user_id
    ) then v_action.responsible_user_id else null end;

  select e.created_at, e.actor_user_id into v_first_andamento
  from public.ssma_corrective_action_events e where e.action_id = v_action.id and e.kind = 'ANDAMENTO' order by e.created_at limit 1;
  select e.note, e.actor_user_id into v_conclusion
  from public.ssma_corrective_action_events e where e.action_id = v_action.id and e.kind = 'CONCLUIDA' order by e.created_at desc limit 1;

  v_due := public.ssma_due_date_to_timestamptz(v_action.due_date);
  v_assume := least(
    v_action.created_at + case v_record.risk_level when 'CRITICA' then interval '1 hour' when 'ALTA' then interval '4 hours'
      when 'MEDIA' then interval '1 day' else interval '3 days' end,
    v_due
  );
  v_status := case v_action.status when 'ABERTA' then 'PENDING' when 'EM_ANDAMENTO' then 'IN_PROGRESS' else 'COMPLETED' end;

  if v_status in ('IN_PROGRESS', 'COMPLETED') then
    v_ack_by := case when v_first_andamento.actor_user_id is not null and exists (
        select 1 from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_first_andamento.actor_user_id
      ) then v_first_andamento.actor_user_id else v_responsible end;
    v_ack_at := coalesce(v_first_andamento.created_at, v_action.created_at);
  end if;

  if v_status = 'COMPLETED' then
    v_done_by := case when v_action.concluded_by_user_id is not null and exists (
        select 1 from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_action.concluded_by_user_id
      ) then v_action.concluded_by_user_id else v_responsible end;
    if v_done_by is null then
      raise notice 'ssma_link_sla_action: ação % concluída por quem não é mais membro da obra; sem vínculo (permanece só no SSMA).', v_action.id;
      return null;
    end if;
    v_note := coalesce(nullif(btrim(coalesce(v_conclusion.note, '')), ''), 'Concluída com foto de evidência (registro SSMA).');
    v_ack_by := coalesce(v_ack_by, v_done_by);
  elsif v_status = 'IN_PROGRESS' and v_ack_by is null then
    v_status := 'PENDING'; v_ack_at := null;
  end if;

  insert into public.sla_actions (
    project_id, origin, title, description, risk_level, area, responsible_user_id, status,
    assume_due_at, complete_due_at, acknowledged_at, acknowledged_by_user_id,
    completed_at, completed_by_user_id, completion_note,
    related_ssma_corrective_action_id, created_by_type, created_by_user_id, created_at
  ) values (
    v_action.project_id, 'SSMA_CORRECTIVE_ACTION',
    left(format('Ação corretiva SSMA — %s (%s)', v_record.category, v_record.location), 300),
    left(v_record.description, 2000),
    public.ssma_risk_to_sla_risk(v_record.risk_level), 'ESG_SSMA', v_responsible, v_status,
    v_assume, v_due,
    case when v_status in ('IN_PROGRESS', 'COMPLETED') then v_ack_at end,
    case when v_status in ('IN_PROGRESS', 'COMPLETED') then v_ack_by end,
    case when v_status = 'COMPLETED' then v_action.concluded_at end,
    case when v_status = 'COMPLETED' then v_done_by end,
    case when v_status = 'COMPLETED' then v_note end,
    v_action.id, 'USER', v_record.reported_by_user_id, v_action.created_at
  )
  on conflict (related_ssma_corrective_action_id) where related_ssma_corrective_action_id is not null do nothing
  returning id into v_sla_id;

  if v_sla_id is null then
    select id into v_sla_id from public.sla_actions where related_ssma_corrective_action_id = v_action.id;
  end if;
  update public.ssma_corrective_actions set sla_action_id = v_sla_id where id = v_action.id and sla_action_id is null;
  return v_sla_id;
end;
$$;

revoke all on function public.ssma_link_sla_action(uuid) from public, anon, authenticated;
revoke all on function public.ssma_risk_to_sla_risk(text) from public;
revoke all on function public.ssma_due_date_to_timestamptz(date) from public;
grant execute on function public.ssma_risk_to_sla_risk(text) to authenticated, service_role;
grant execute on function public.ssma_due_date_to_timestamptz(date) to authenticated, service_role;

-- Envio idempotente do registro (+ ação corretiva + ação no módulo SLA, tudo na mesma transação).
-- Mudanças em relação à versão anterior: cria/vincula a ação SLA; envio CONCORRENTE do mesmo id devolve o
-- registro já gravado (antes: unique_violation).
create or replace function public.ssma_field_record_submit(
  p_claimed_user_id uuid,
  p_id uuid,
  p_project_id uuid,
  p_kind text,
  p_category text,
  p_description text,
  p_location text,
  p_occurred_at timestamptz,
  p_client_created_at timestamptz,
  p_risk_level text,
  p_responsible_user_id uuid default null,
  p_due_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.ssma_field_records%rowtype;
  v_action_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_claimed_user_id is distinct from v_user then raise exception 'USER_MISMATCH'; end if;
  if not public.is_project_member(p_project_id) then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  if exists (
    select 1 from public.project_memberships m
    where m.project_id = p_project_id and m.user_id = v_user and m.permission = 'LEITURA'
  ) then raise exception 'READ_ONLY_MEMBER'; end if;

  select * into v_existing from public.ssma_field_records where id = p_id;
  if found then
    if v_existing.reported_by_user_id = v_user and v_existing.project_id = p_project_id then
      return v_existing.id;
    end if;
    raise exception 'RECORD_ID_CONFLICT';
  end if;

  if p_occurred_at > now() + interval '1 day' or p_client_created_at > now() + interval '1 day' then
    raise exception 'INVALID_FUTURE_DATE';
  end if;
  if p_responsible_user_id is not null then
    if p_due_date is null then raise exception 'DUE_DATE_REQUIRED'; end if;
    if not exists (
      select 1 from public.project_memberships m
      where m.project_id = p_project_id and m.user_id = p_responsible_user_id and m.status = 'ACTIVE'
        and m.permission <> 'LEITURA'
    ) then raise exception 'RESPONSIBLE_NOT_PROJECT_MEMBER'; end if;
  end if;

  begin
    insert into public.ssma_field_records (
      id, project_id, kind, category, description, location, occurred_at, client_created_at,
      risk_level, responsible_user_id, due_date, reported_by_user_id
    ) values (
      p_id, p_project_id, p_kind, btrim(p_category), btrim(p_description), btrim(p_location),
      p_occurred_at, p_client_created_at, p_risk_level, p_responsible_user_id, p_due_date, v_user
    );
  exception when unique_violation then
    -- Outra execução do MESMO envio gravou primeiro (reenvio concorrente): devolve o registro existente.
    select * into v_existing from public.ssma_field_records where id = p_id;
    if found and v_existing.reported_by_user_id = v_user and v_existing.project_id = p_project_id then
      return v_existing.id;
    end if;
    raise exception 'RECORD_ID_CONFLICT';
  end;

  if p_responsible_user_id is not null then
    insert into public.ssma_corrective_actions (record_id, project_id, responsible_user_id, due_date)
    values (p_id, p_project_id, p_responsible_user_id, p_due_date)
    returning id into v_action_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, actor_user_id, note)
    values (v_action_id, p_project_id, 'CRIADA', v_user, 'Ação corretiva aberta com o registro.');
    perform public.ssma_link_sla_action(v_action_id);
  end if;

  return p_id;
end;
$$;

-- Andamento / conclusão da ação corretiva, mantendo a ação do módulo SLA igual na mesma transação.
create or replace function public.ssma_corrective_action_update(
  p_action_id uuid,
  p_event text,
  p_note text default null,
  p_evidence_photo_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_action public.ssma_corrective_actions%rowtype;
  v_sla_id uuid;
  v_is_manager boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(p_event, '') not in ('ANDAMENTO', 'CONCLUIDA') then raise exception 'INVALID_EVENT'; end if;

  -- Ordem de bloqueio: ação SLA primeiro, depois a ação SSMA (a mesma do trigger do SLA).
  select sla_action_id into v_sla_id from public.ssma_corrective_actions where id = p_action_id;
  if v_sla_id is not null then
    perform 1 from public.sla_actions where id = v_sla_id for update;
  end if;
  select * into v_action from public.ssma_corrective_actions where id = p_action_id for update;
  if not found then raise exception 'ACTION_NOT_FOUND'; end if;
  if not public.is_project_member(v_action.project_id) then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  v_is_manager := coalesce(public.has_project_permission(v_action.project_id, 'GESTOR'), false);
  if not (v_is_manager or coalesce(v_action.responsible_user_id = v_user, false)) then
    raise exception 'ACTION_ACCESS_DENIED';
  end if;
  if v_action.status = 'CONCLUIDA' then raise exception 'ACTION_ALREADY_CONCLUDED'; end if;

  perform set_config('acc.ssma_sync', 'on', true);

  if p_event = 'ANDAMENTO' then
    if v_note is null then raise exception 'NOTE_REQUIRED'; end if;
    update public.ssma_corrective_actions set status = 'EM_ANDAMENTO' where id = p_action_id;
    insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
    values (p_action_id, v_action.project_id, 'ANDAMENTO', v_note, v_user);
    if v_sla_id is not null then
      update public.sla_actions
      set status = case when status in ('PENDING', 'ACKNOWLEDGED', 'OVERDUE', 'ESCALATED') then 'IN_PROGRESS' else status end,
          acknowledged_at = coalesce(acknowledged_at, now()),
          acknowledged_by_user_id = coalesce(acknowledged_by_user_id, (
            select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user))
      where id = v_sla_id and status <> 'COMPLETED' and status <> 'CANCELLED';
    end if;
    perform set_config('acc.ssma_sync', 'off', true);
    return;
  end if;

  if p_evidence_photo_id is not null then
    if not exists (
      select 1 from public.ssma_field_record_photos p
      where p.id = p_evidence_photo_id and p.record_id = v_action.record_id and p.purpose = 'EVIDENCIA_ACAO'
    ) then raise exception 'EVIDENCE_NOT_FOUND'; end if;
  elsif not v_is_manager then
    raise exception 'EVIDENCE_REQUIRED';
  elsif v_note is null or char_length(v_note) < 10 then
    raise exception 'JUSTIFICATION_REQUIRED';
  end if;

  update public.ssma_corrective_actions
  set status = 'CONCLUIDA', concluded_at = now(), concluded_by_user_id = v_user
  where id = p_action_id;
  insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, evidence_photo_id, actor_user_id)
  values (p_action_id, v_action.project_id, 'CONCLUIDA', v_note, p_evidence_photo_id, v_user);

  if v_sla_id is not null then
    update public.sla_actions
    set status = 'COMPLETED',
        completed_at = now(),
        completed_by_user_id = (select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user),
        completion_note = coalesce(v_note, 'Concluída com foto de evidência (registro SSMA).'),
        acknowledged_at = coalesce(acknowledged_at, now()),
        acknowledged_by_user_id = coalesce(acknowledged_by_user_id, (
          select m.user_id from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user))
    where id = v_sla_id and status <> 'COMPLETED' and status <> 'CANCELLED'
      and exists (select 1 from public.project_memberships m where m.project_id = v_action.project_id and m.user_id = v_user);
  end if;
  perform set_config('acc.ssma_sync', 'off', true);
end;
$$;

-- Propagação do SLA para o SSMA: o módulo de Ações continua dono de responsável, prazo e andamento, e não
-- consegue concluir (nem reabrir) uma ação de origem SSMA — conclusão exige a evidência do SSMA.
create or replace function public.sla_action_ssma_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ssma public.ssma_corrective_actions%rowtype;
  v_actor uuid := auth.uid();
begin
  if new.related_ssma_corrective_action_id is null then return new; end if;
  if coalesce(current_setting('acc.ssma_sync', true), '') = 'on' then return new; end if;

  -- O vínculo SSMA↔SLA nasce só em ssma_link_sla_action (INSERT) e NÃO pode ser trocado por UPDATE
  -- (impede apontar a ação SLA de uma obra para a ação SSMA de outra).
  if new.related_ssma_corrective_action_id is distinct from old.related_ssma_corrective_action_id then
    raise exception 'SSMA_LINK_IMMUTABLE: o vínculo com a ação corretiva SSMA não pode ser alterado.';
  end if;

  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    raise exception 'SSMA_ACTION_COMPLETE_VIA_SSMA: a conclusão de ação corretiva SSMA exige a evidência registrada no app SSMA.';
  end if;
  if old.status = 'COMPLETED' and new.status is distinct from 'COMPLETED' then
    raise exception 'SSMA_ACTION_REOPEN_NOT_ALLOWED: ação corretiva SSMA concluída não é reaberta pelo módulo de Ações.';
  end if;

  select * into v_ssma from public.ssma_corrective_actions where id = new.related_ssma_corrective_action_id for update;
  if not found then return new; end if;
  -- Defesa em profundidade: as duas pontas do vínculo precisam ser da MESMA obra.
  if v_ssma.project_id is distinct from new.project_id then
    raise exception 'SSMA_LINK_PROJECT_MISMATCH: a ação corretiva SSMA pertence a outra obra.';
  end if;

  if new.responsible_user_id is not null and new.responsible_user_id is distinct from old.responsible_user_id then
    update public.ssma_corrective_actions set responsible_user_id = new.responsible_user_id where id = v_ssma.id;
    update public.ssma_field_records set responsible_user_id = new.responsible_user_id where id = v_ssma.record_id;
    if v_actor is not null then
      insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
      values (v_ssma.id, v_ssma.project_id, 'REATRIBUIDA', 'Responsável alterado pelo módulo Ações e Escalonamentos.', v_actor);
    end if;
  end if;

  if new.complete_due_at is not null and new.complete_due_at is distinct from old.complete_due_at then
    update public.ssma_corrective_actions
    set due_date = (new.complete_due_at at time zone 'America/Sao_Paulo')::date where id = v_ssma.id;
    update public.ssma_field_records
    set due_date = (new.complete_due_at at time zone 'America/Sao_Paulo')::date where id = v_ssma.record_id;
    if v_actor is not null then
      insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
      values (v_ssma.id, v_ssma.project_id, 'PRAZO_ALTERADO', 'Prazo alterado pelo módulo Ações e Escalonamentos.', v_actor);
    end if;
  end if;

  if new.status = 'IN_PROGRESS' and old.status is distinct from 'IN_PROGRESS' and v_ssma.status = 'ABERTA' then
    update public.ssma_corrective_actions set status = 'EM_ANDAMENTO' where id = v_ssma.id;
    if v_actor is not null then
      insert into public.ssma_corrective_action_events (action_id, project_id, kind, note, actor_user_id)
      values (v_ssma.id, v_ssma.project_id, 'ANDAMENTO', 'Iniciada pelo módulo Ações e Escalonamentos.', v_actor);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists sla_actions_ssma_guard on public.sla_actions;
create trigger sla_actions_ssma_guard
before update on public.sla_actions
for each row execute function public.sla_action_ssma_guard();

revoke all on function public.sla_action_ssma_guard() from public, anon, authenticated;
revoke all on function public.ssma_field_record_submit(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,uuid,date) from public;
revoke all on function public.ssma_corrective_action_update(uuid,text,text,uuid) from public;
grant execute on function public.ssma_field_record_submit(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,uuid,date) to authenticated;
grant execute on function public.ssma_corrective_action_update(uuid,text,text,uuid) to authenticated;

-- Backfill idempotente: vincula as ações corretivas já existentes (nada é apagado ou alterado nelas).
do $$
declare
  v_row record;
  v_total integer := 0;
  v_linked integer := 0;
begin
  for v_row in select id from public.ssma_corrective_actions where sla_action_id is null order by created_at loop
    v_total := v_total + 1;
    if public.ssma_link_sla_action(v_row.id) is not null then v_linked := v_linked + 1; end if;
  end loop;
  raise notice 'ssma backfill: % ação(ões) sem vínculo encontradas, % vinculadas.', v_total, v_linked;
end;
$$;

-- ------------------------------------------------------------
-- 2. Perfis ESG
-- ------------------------------------------------------------
create or replace function public.can_register_esg_compliance(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'ACTIVE'
      and pm.permission in ('ADMINISTRADOR', 'GERENTE', 'GESTOR', 'COLABORADOR')
  );
$$;
revoke all on function public.can_register_esg_compliance(uuid) from public, anon;
grant execute on function public.can_register_esg_compliance(uuid) to authenticated, service_role;

drop policy if exists "esg_obligation_submissions_insert_editor_self_authored" on public.esg_obligation_submissions;
drop policy if exists "esg_obligation_submissions_insert_registrars_self_authored" on public.esg_obligation_submissions;
create policy "esg_obligation_submissions_insert_registrars_self_authored"
  on public.esg_obligation_submissions
  for insert
  to authenticated
  with check (filled_by_user_id = auth.uid() and public.can_register_esg_compliance(project_id));

drop policy if exists "esg_obligation_evidence_insert_editor_self_authored" on public.esg_obligation_evidence;
drop policy if exists "esg_obligation_evidence_insert_registrars_self_authored" on public.esg_obligation_evidence;
create policy "esg_obligation_evidence_insert_registrars_self_authored"
  on public.esg_obligation_evidence
  for insert
  to authenticated
  with check (
    uploaded_by_user_id = auth.uid()
    and (
      public.has_project_permission(project_id, 'ADMINISTRADOR')
      or (
        public.can_register_esg_compliance(project_id)
        and exists (
          select 1 from public.esg_obligation_submissions s
          where s.id = submission_id and s.filled_by_user_id = auth.uid()
        )
      )
    )
  );

-- Upload da evidência no Storage: {obra}/esg-evidence/{obrigação}/{comprovação}/{arquivo}.
create or replace function public.can_upload_esg_evidence_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := storage.foldername(p_name);
begin
  if cardinality(v_parts) < 3 or v_parts[2] <> 'esg-evidence' then return false; end if;
  if v_parts[1] !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  return public.can_register_esg_compliance(v_parts[1]::uuid);
exception when invalid_text_representation then
  return false;
end;
$$;
revoke all on function public.can_upload_esg_evidence_object(text) from public, anon;
grant execute on function public.can_upload_esg_evidence_object(text) to authenticated;

drop policy if exists "esg_evidence_storage_insert" on storage.objects;
create policy "esg_evidence_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'project-documents' and public.can_upload_esg_evidence_object(name));

-- ------------------------------------------------------------
-- 3. Notificações de registros de campo (e-mail): entregas com dedupe, falha e ausência de destinatário
-- ------------------------------------------------------------
create table if not exists public.ssma_field_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  record_id uuid not null references public.ssma_field_records (id) on delete cascade,
  action_id uuid references public.ssma_corrective_actions (id) on delete set null,
  event text not null check (event in ('CRITICAL_RECORD', 'ACTION_OVERDUE')),
  -- CRITICAL_RECORD: dia (America/Sao_Paulo) do fato => 1 aviso por registro e destinatário.
  -- ACTION_OVERDUE: prazo da ação => 1 aviso por ação, prazo e destinatário (novo aviso só se o prazo mudar).
  event_date date not null,
  recipient_email text not null check (recipient_email = lower(recipient_email)),
  recipient_name text,
  status text not null default 'PENDING' check (status in ('PENDING', 'SENT', 'FAILED', 'SUPPRESSED')),
  suppression_reason text check (suppression_reason is null or suppression_reason in ('NO_RECIPIENT', 'PILOT_RECIPIENT_NOT_ALLOWED', 'EMAIL_MISSING')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 2000),
  provider_message_id text,
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (record_id, event, event_date, recipient_email)
);

create index if not exists ssma_field_notification_deliveries_project_idx
  on public.ssma_field_notification_deliveries (project_id, status, created_at desc);

alter table public.ssma_field_notification_deliveries enable row level security;
revoke all on public.ssma_field_notification_deliveries from anon, authenticated;
grant select on public.ssma_field_notification_deliveries to authenticated;
grant all on public.ssma_field_notification_deliveries to service_role;
drop policy if exists "ssma_field_notification_deliveries_select_admin" on public.ssma_field_notification_deliveries;
create policy "ssma_field_notification_deliveries_select_admin" on public.ssma_field_notification_deliveries
  for select to authenticated using (public.has_project_permission(project_id, 'ADMINISTRADOR'));

-- Resumo SEM e-mails (para o aviso visível a qualquer membro): por registro e evento, quantas entregas em cada estado.
create or replace function public.ssma_notification_summary(p_project_id uuid)
returns table (record_id uuid, event text, sent integer, failed integer, suppressed integer, pending integer)
language sql
stable
security definer
set search_path = ''
as $$
  select d.record_id, d.event,
         count(*) filter (where d.status = 'SENT')::integer,
         count(*) filter (where d.status = 'FAILED')::integer,
         count(*) filter (where d.status = 'SUPPRESSED')::integer,
         count(*) filter (where d.status = 'PENDING')::integer
  from public.ssma_field_notification_deliveries d
  where d.project_id = p_project_id and public.is_project_member(p_project_id)
  group by d.record_id, d.event;
$$;
revoke all on function public.ssma_notification_summary(uuid) from public, anon;
grant execute on function public.ssma_notification_summary(uuid) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. Vínculo explícito acidente (formulário, trilha A) ↔ ocorrência de campo (trilha B)
-- ------------------------------------------------------------
create table if not exists public.ssma_incident_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  form_submission_id uuid not null references public.ssma_form_submissions (id) on delete cascade,
  field_record_id uuid not null references public.ssma_field_records (id) on delete cascade,
  -- SAME_FACT: confirmado por humano que os dois relatos são o MESMO fato (desconta 1 do total).
  -- DISTINCT_FACTS: confirmado que são fatos DIFERENTES (para de sugerir; nada é descontado).
  decision text not null check (decision in ('SAME_FACT', 'DISTINCT_FACTS')),
  note text check (note is null or char_length(note) <= 500),
  decided_by_user_id uuid not null references public.profiles (id) on delete restrict,
  decided_at timestamptz not null default now(),
  unique (form_submission_id, field_record_id)
);
-- Um formulário só é o mesmo fato de UM registro de campo, e vice-versa (1:1).
create unique index if not exists ssma_incident_links_form_same_uidx
  on public.ssma_incident_links (form_submission_id) where decision = 'SAME_FACT';
create unique index if not exists ssma_incident_links_record_same_uidx
  on public.ssma_incident_links (field_record_id) where decision = 'SAME_FACT';
create index if not exists ssma_incident_links_project_idx on public.ssma_incident_links (project_id);

alter table public.ssma_incident_links enable row level security;
revoke all on public.ssma_incident_links from anon, authenticated;
grant select on public.ssma_incident_links to authenticated;
grant all on public.ssma_incident_links to service_role;
drop policy if exists "ssma_incident_links_select_members" on public.ssma_incident_links;
create policy "ssma_incident_links_select_members" on public.ssma_incident_links
  for select to authenticated using (public.is_project_member(project_id));

create or replace function public.ssma_incident_link_set(
  p_form_submission_id uuid,
  p_field_record_id uuid,
  p_decision text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_form_project uuid;
  v_record_project uuid;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if coalesce(p_decision, '') not in ('SAME_FACT', 'DISTINCT_FACTS') then raise exception 'INVALID_DECISION'; end if;

  select f.project_id into v_form_project from public.ssma_form_submissions f
   where f.id = p_form_submission_id and f.checklist_slug = 'ocorrencia-acidente' and f.status = 'SUBMITTED';
  -- Anti-oráculo: quem não é membro da obra do formulário recebe o mesmo erro de um formulário inexistente.
  if v_form_project is null or not coalesce(public.is_project_member(v_form_project), false) then raise exception 'FORM_NOT_FOUND'; end if;
  select r.project_id into v_record_project from public.ssma_field_records r where r.id = p_field_record_id and r.kind = 'OCORRENCIA';
  -- Registro de outra obra só é revelado a quem também é membro dessa obra.
  if v_record_project is null
     or (v_record_project <> v_form_project and not coalesce(public.is_project_member(v_record_project), false)) then
    raise exception 'RECORD_NOT_FOUND';
  end if;
  if v_form_project <> v_record_project then raise exception 'PROJECT_MISMATCH'; end if;
  if not coalesce(public.has_project_permission(v_form_project, 'ADMINISTRADOR'), false) then raise exception 'ADMIN_REQUIRED'; end if;

  begin
    insert into public.ssma_incident_links (project_id, form_submission_id, field_record_id, decision, note, decided_by_user_id)
    values (v_form_project, p_form_submission_id, p_field_record_id, p_decision, nullif(btrim(coalesce(p_note, '')), ''), v_user)
    on conflict (form_submission_id, field_record_id) do update
      set decision = excluded.decision, note = excluded.note, decided_by_user_id = excluded.decided_by_user_id, decided_at = now()
    returning id into v_id;
  exception when unique_violation then
    -- outro vínculo SAME_FACT já usa este formulário ou este registro
    raise exception 'ALREADY_LINKED';
  end;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, actor_label, action, entity_type, entity_id, detail)
  values (v_form_project, 'USER', v_user, null, 'SSMA_INCIDENT_LINK_SET', 'SSMA_INCIDENT_LINK', v_id::text,
          format('Decisão humana sobre duplicidade: %s (formulário %s, registro de campo %s).', p_decision, p_form_submission_id, p_field_record_id));
  return v_id;
end;
$$;
revoke all on function public.ssma_incident_link_set(uuid, uuid, text, text) from public, anon;
grant execute on function public.ssma_incident_link_set(uuid, uuid, text, text) to authenticated;

-- ------------------------------------------------------------
-- 5. Classificação estruturada do registro de campo (base do indicador de quase-acidentes)
-- ------------------------------------------------------------
-- Validação da categoria só em registros NOVOS ou quando a categoria MUDA. Uma CHECK ... NOT VALID não serve aqui: o PostgreSQL
-- reavalia a CHECK em QUALQUER UPDATE da linha, e registros históricos com categoria livre não poderiam mais ser atualizados
-- (inclusive pela propagação de responsável/prazo do módulo Ações). O erro mantém o nome da constraint (compatibilidade).
alter table public.ssma_field_records drop constraint if exists ssma_field_records_category_structured_check;

create or replace function public.ssma_field_record_category_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.category is distinct from old.category)
     and new.category not in ('Condição insegura', 'Ato inseguro', 'Quase-acidente', 'EPI', 'Sinalização', 'Organização e limpeza', 'Meio ambiente', 'Inspeção de rotina', 'Outra') then
    raise exception 'new row for relation "ssma_field_records" violates check constraint "ssma_field_records_category_structured_check"'
      using errcode = '23514', constraint = 'ssma_field_records_category_structured_check';
  end if;
  return new;
end;
$$;
revoke all on function public.ssma_field_record_category_guard() from public, anon, authenticated;

drop trigger if exists ssma_field_records_category_guard on public.ssma_field_records;
create trigger ssma_field_records_category_guard
before insert or update of category on public.ssma_field_records
for each row execute function public.ssma_field_record_category_guard();
-- Sem isto, session_replication_role = replica (superusuário: restore/replicação lógica) contornaria o trigger, o que uma CHECK não permitiria.
alter table public.ssma_field_records enable always trigger ssma_field_records_category_guard;
