-- ============================================================
-- 20261125100000_warranty_acceptance_proof.sql
--
-- FASE 4 / Escopo B (1/4) — ACEITE DO CLIENTE da garantia: "informado" x "comprovado".
--
-- Problema (Fase 3): quality_warranty_acceptance_register gravava o aceite a partir de um nome digitado por usuário INTERNO e de
-- uma evidência qualquer (FATO) do caso; isso bastava para encerrar. Um lançamento interno NÃO substitui a manifestação do cliente.
--
-- Regra nova:
--   * aceite INFORMADO  = alguém da AXION registrou que o cliente aceitou (data, nome, evidência do caso). Fica no histórico,
--     NÃO libera o encerramento (bloqueio CUSTOMER_ACCEPTANCE_NOT_PROVEN);
--   * aceite COMPROVADO = manifestação do cliente rastreável: evidência do caso (e-mail ou documento/ata ingerido, FATO),
--     hash SHA-256 da fonte, data da manifestação (não anterior ao último reparo), identificação do manifestante EXTERNO
--     (nome + e-mail de contato; o contato não pode ser de membro ativo do projeto nem do próprio registrante).
--     SÓ o comprovado libera o encerramento (a garantia já ENCERRADA antes desta migration continua válida: legado).
--   * cada registro é uma linha APPEND-ONLY em quality_warranty_acceptances (histórico preservado; nunca apagado);
--   * o aceite vale para UM ciclo: novo reparo ou reabertura volta o caso a NENHUM (histórico permanece);
--   * RPC transacional com versão otimista (VERSION_CONFLICT) e auditoria na mesma transação.
--
-- REDEFINIÇÕES (justificadas; mesma assinatura e GRANTs; corpo = vigente + a regra nova):
--   quality_transition_blockers (vigente: 20261122101000)  — ENCERRADA de garantia exige aceite COMPROVADO;
--   quality_warranty_state_guard (vigente: 20261123300000) — zera o status do aceite em EM_REPARO/REABERTA e impede COMPROVADO
--                                                            sem registro de prova correspondente (defesa em profundidade);
--   quality_warranty_acceptance_register (vigente: 20261123301000) — passa a gravar aceite INFORMADO (não libera encerramento).
-- Dados legados: sem backfill. Caso com accepted_at e status NENHUM = aceite legado; vale para o que já está ENCERRADO, mas um caso
-- aberto precisa de novo aceite comprovado para encerrar. Não toca record_risk_alert_action nem SLAs. Idempotente.
-- Reversão: supabase/rollbacks/20261125100000_warranty_acceptance_proof.rollback.sql
-- ============================================================

alter table public.quality_warranty_cases add column if not exists acceptance_status text not null default 'NENHUM';
alter table public.quality_warranty_cases add column if not exists current_acceptance_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quality_warranty_cases_acceptance_status_chk') then
    alter table public.quality_warranty_cases
      add constraint quality_warranty_cases_acceptance_status_chk check (acceptance_status in ('NENHUM', 'INFORMADO', 'COMPROVADO'));
  end if;
end $$;
comment on column public.quality_warranty_cases.acceptance_status is
  'NENHUM | INFORMADO (lançado por usuário interno) | COMPROVADO (manifestação do cliente com evidência, hash e manifestante externo). Só COMPROVADO libera o encerramento; accepted_at com NENHUM = aceite legado.';

-- ---------- histórico append-only dos aceites ----------
create table if not exists public.quality_warranty_acceptances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  warranty_case_id uuid not null,
  kind text not null check (kind in ('INFORMADO', 'COMPROVADO')),
  accepted_at date not null,
  accepted_by_name text not null check (char_length(btrim(accepted_by_name)) between 2 and 200),
  manifestant_organization text check (manifestant_organization is null or char_length(manifestant_organization) <= 200),
  manifestant_contact text check (manifestant_contact is null or char_length(manifestant_contact) <= 254),
  evidence_id uuid,
  evidence_source_ref text,
  source_hash text,
  source_hash_algorithm text not null default 'SHA-256' check (source_hash_algorithm = 'SHA-256'),
  note text check (note is null or char_length(note) <= 2000),
  case_row_version integer not null,
  supersedes_id uuid references public.quality_warranty_acceptances (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  foreign key (warranty_case_id, project_id) references public.quality_warranty_cases (id, project_id) on delete restrict,
  foreign key (evidence_id, project_id) references public.quality_evidence (id, project_id) on delete restrict,
  -- COMPROVADO: evidência + hash + manifestante externo identificado (nome + contato) — nunca só um nome digitado
  check (kind <> 'COMPROVADO' or (
    evidence_id is not null
    and source_hash ~ '^[0-9a-f]{64}$'
    and nullif(btrim(coalesce(manifestant_contact, '')), '') is not null
    and nullif(btrim(coalesce(evidence_source_ref, '')), '') is not null))
);
create index if not exists quality_warranty_acceptances_case_idx on public.quality_warranty_acceptances (warranty_case_id, created_at desc);
create index if not exists quality_warranty_acceptances_project_idx on public.quality_warranty_acceptances (project_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'quality_warranty_cases_current_acceptance_fk') then
    alter table public.quality_warranty_cases
      add constraint quality_warranty_cases_current_acceptance_fk
      foreign key (current_acceptance_id, project_id) references public.quality_warranty_acceptances (id, project_id);
  end if;
end $$;

create or replace function public.f4b_block_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('DELETE', 'TRUNCATE') then
    raise exception 'F4B_NO_DELETE: % não admite exclusão (preservação de evidências)', tg_table_name;
  end if;
  raise exception 'F4B_APPEND_ONLY: % é append-only (cada registro é uma nova linha)', tg_table_name;
end;
$$;
revoke all on function public.f4b_block_mutation() from public, anon, authenticated;

drop trigger if exists quality_warranty_acceptances_append_only on public.quality_warranty_acceptances;
create trigger quality_warranty_acceptances_append_only before update or delete on public.quality_warranty_acceptances
  for each row execute function public.f4b_block_mutation();
drop trigger if exists quality_warranty_acceptances_no_truncate on public.quality_warranty_acceptances;
create trigger quality_warranty_acceptances_no_truncate before truncate on public.quality_warranty_acceptances
  for each statement execute function public.f4b_block_mutation();

alter table public.quality_warranty_acceptances enable row level security;
drop policy if exists quality_warranty_acceptances_select on public.quality_warranty_acceptances;
create policy quality_warranty_acceptances_select on public.quality_warranty_acceptances
  for select to authenticated using (public.quality_can_read(project_id));
revoke all on public.quality_warranty_acceptances from public, anon, authenticated;
grant select on public.quality_warranty_acceptances to authenticated;
comment on table public.quality_warranty_acceptances is
  'Histórico append-only do aceite do cliente (INFORMADO por usuário interno x COMPROVADO com evidência/hash/manifestante externo). Escrita só pelas RPCs quality_warranty_acceptance_*.';

-- ---------- bloqueios de transição: encerramento exige aceite COMPROVADO ----------
create or replace function public.quality_transition_blockers(p_entity_type text, p_id uuid, p_to text)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_project uuid;
  v_state text;
  v_accepted_at timestamptz;
  v_accepted_by text;
  v_acc_status text;
  v_blockers text[] := '{}';
  v_ver record;
  v_reset_seq bigint;
  v_actions int;
  v_unexecuted int;
begin
  if p_entity_type = 'NCR' then
    select project_id, state into v_project, v_state from public.quality_ncrs where id = p_id;
  else
    select project_id, state, accepted_at, accepted_by_name, acceptance_status
      into v_project, v_state, v_accepted_at, v_accepted_by, v_acc_status
    from public.quality_warranty_cases where id = p_id;
  end if;
  if v_project is null or not public.quality_can_read(v_project) then
    raise exception 'FORBIDDEN';
  end if;

  if p_entity_type = 'NCR' then
    if p_to = 'CONFIRMADA' and not exists (
      select 1 from public.quality_evidence e where e.ncr_id = p_id and e.classification = 'NC_COMPROVADA') then
      v_blockers := array_append(v_blockers, 'CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE'::text);
    end if;
    if p_to = 'PLANO_ACAO' and not exists (
      select 1 from public.quality_corrective_actions a where a.ncr_id = p_id and a.status <> 'CANCELADA') then
      v_blockers := array_append(v_blockers, 'ACTION_PLAN_REQUIRED'::text);
    end if;
    if p_to in ('VERIFICACAO', 'ENCERRADA') then
      select count(*) filter (where a.status <> 'CANCELADA'),
             count(*) filter (where a.status not in ('EXECUTADA', 'CANCELADA'))
        into v_actions, v_unexecuted
      from public.quality_corrective_actions a where a.ncr_id = p_id;
      if v_actions = 0 then v_blockers := array_append(v_blockers, 'NO_CORRECTIVE_ACTION'::text);
      elsif v_unexecuted > 0 then v_blockers := array_append(v_blockers, 'ACTIONS_NOT_EXECUTED'::text); end if;
    end if;
    if p_to = 'ENCERRADA' then
      if v_state is distinct from 'VERIFICACAO' then v_blockers := array_append(v_blockers, 'NOT_IN_VERIFICATION'::text); end if;
      select * into v_ver from public.quality_effectiveness_verifications
        where ncr_id = p_id order by created_at desc, verified_at desc limit 1;
      if not found then
        v_blockers := array_append(v_blockers, 'EFFECTIVENESS_VERIFICATION_REQUIRED'::text);
      else
        if v_ver.result <> 'EFICAZ' then v_blockers := array_append(v_blockers, 'LATEST_VERIFICATION_NOT_EFFECTIVE'::text); end if;
        select max(seq) into v_reset_seq from public.quality_state_events
          where entity_type = 'NCR' and entity_id = p_id and to_state in ('CORRECAO', 'REABERTA');
        if v_reset_seq is not null and v_reset_seq > v_ver.event_seq_at then
          v_blockers := array_append(v_blockers, 'VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN'::text);
        end if;
      end if;
    end if;
  else
    if p_to in ('VERIFICADA', 'ENCERRADA') then
      if p_to = 'VERIFICADA' and v_state is distinct from 'REPARADA' then v_blockers := array_append(v_blockers, 'NOT_REPAIRED'::text); end if;
      if p_to = 'ENCERRADA' and v_state is distinct from 'VERIFICADA' then v_blockers := array_append(v_blockers, 'NOT_VERIFIED'::text); end if;
      select * into v_ver from public.quality_effectiveness_verifications
        where warranty_case_id = p_id order by created_at desc, verified_at desc limit 1;
      if not found then
        v_blockers := array_append(v_blockers, 'EFFECTIVENESS_VERIFICATION_REQUIRED'::text);
      else
        if v_ver.result <> 'EFICAZ' then v_blockers := array_append(v_blockers, 'LATEST_VERIFICATION_NOT_EFFECTIVE'::text); end if;
        select max(seq) into v_reset_seq from public.quality_state_events
          where entity_type = 'WARRANTY' and entity_id = p_id and to_state in ('EM_REPARO', 'REABERTA');
        if v_reset_seq is not null and v_reset_seq > v_ver.event_seq_at then
          v_blockers := array_append(v_blockers, 'VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN'::text);
        end if;
      end if;
    end if;
    if p_to = 'REPARADA' and not exists (
      select 1 from public.quality_warranty_repairs r where r.warranty_case_id = p_id and r.executed_at is not null) then
      v_blockers := array_append(v_blockers, 'REPAIR_RECORD_REQUIRED'::text);
    end if;
    if p_to = 'ENCERRADA' then
      if v_acc_status = 'COMPROVADO' then
        null; -- aceite comprovado: libera
      elsif v_state = 'ENCERRADA' and v_acc_status = 'NENHUM' and v_accepted_at is not null and nullif(btrim(coalesce(v_accepted_by, '')), '') is not null then
        null; -- legado: encerrada antes da regra do aceite comprovado (histórico preservado)
      elsif v_acc_status = 'INFORMADO' or (v_accepted_at is not null and nullif(btrim(coalesce(v_accepted_by, '')), '') is not null) then
        v_blockers := array_append(v_blockers, 'CUSTOMER_ACCEPTANCE_NOT_PROVEN'::text);
      else
        v_blockers := array_append(v_blockers, 'CUSTOMER_ACCEPTANCE_REQUIRED'::text);
      end if;
    end if;
  end if;
  return v_blockers;
end;
$$;

-- ---------- guarda de estado da garantia ----------
create or replace function public.quality_warranty_state_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blockers text[];
begin
  if tg_op = 'INSERT' then
    if new.state is distinct from 'ABERTA' or new.reopen_count <> 0 or new.closed_at is not null
       or new.accepted_at is not null or new.accepted_by_name is not null
       or new.acceptance_status is distinct from 'NENHUM' or new.current_acceptance_id is not null then
      raise exception 'STATE_GUARD: a garantia nasce em ABERTA, sem reaberturas, sem encerramento e sem aceite (recebido: estado %)', new.state;
    end if;
    return new;
  end if;

  if new.state is distinct from old.state then
    if auth.uid() is null then
      raise exception 'STATE_CHANGE_REQUIRES_ACTOR: mudança de estado da garantia exige usuário autenticado (use quality_warranty_transition)';
    end if;
    if not exists (select 1 from public.quality_state_transitions t
                   where t.entity_type = 'WARRANTY' and t.from_state = old.state and t.to_state = new.state) then
      raise exception 'INVALID_TRANSITION: % -> % não é permitida para WARRANTY (guarda de banco)', old.state, new.state;
    end if;
    v_blockers := public.quality_transition_blockers('WARRANTY', old.id, new.state);
    if cardinality(v_blockers) > 0 then
      raise exception 'TRANSITION_BLOCKED: %', array_to_string(v_blockers, ',');
    end if;
    if (new.state = 'ENCERRADA') <> (new.closed_at is not null) then
      raise exception 'STATE_GUARD: closed_at deve ser preenchido exatamente quando o estado é ENCERRADA';
    end if;
    if new.reopen_count is distinct from old.reopen_count + (case when new.state = 'REABERTA' then 1 else 0 end) then
      raise exception 'STATE_GUARD: reopen_count só aumenta (em 1) na transição para REABERTA';
    end if;
    -- o aceite do cliente vale para UM ciclo: novo reparo ou reabertura exige novo aceite (a trilha fica em quality_warranty_acceptances)
    if new.state in ('EM_REPARO', 'REABERTA') then
      new.accepted_at := null;
      new.accepted_by_name := null;
      new.accepted_evidence_id := null;
      new.acceptance_status := 'NENHUM';
      new.current_acceptance_id := null;
    end if;
  else
    if new.closed_at is distinct from old.closed_at or new.reopen_count is distinct from old.reopen_count then
      raise exception 'STATE_GUARD: closed_at e reopen_count só mudam junto com a transição de estado';
    end if;
  end if;

  -- COMPROVADO só existe com a linha de prova correspondente (nenhum caminho de escrita cria "comprovado" por atalho)
  if new.acceptance_status = 'COMPROVADO'
     and not exists (select 1 from public.quality_warranty_acceptances a
                     where a.id = new.current_acceptance_id and a.warranty_case_id = new.id and a.project_id = new.project_id and a.kind = 'COMPROVADO') then
    raise exception 'ACCEPTANCE_PROOF_REQUIRED: aceite COMPROVADO exige o registro de prova (quality_warranty_acceptances) correspondente';
  end if;
  return new;
end;
$$;

-- ---------- aceite INFORMADO (RPC existente; agora NÃO libera o encerramento) ----------
create or replace function public.quality_warranty_acceptance_register(
  p_case_id uuid, p_expected_version integer, p_accepted_at date, p_accepted_by_name text, p_evidence_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_name text := nullif(btrim(coalesce(p_accepted_by_name, '')), '');
  v_ev public.quality_evidence%rowtype;
  v_old public.quality_warranty_cases%rowtype;
  v_new_version integer;
  v_acc uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(null, p_case_id, true);
  if not found or not public.quality_can_manage(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_c.c_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_c.c_version;
  end if;
  if v_c.c_state not in ('REPARADA', 'VERIFICADA') then
    raise exception 'INVALID_STATE: o aceite do cliente só é registrado com a garantia REPARADA ou VERIFICADA (atual: %)', v_c.c_state;
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 200 then raise exception 'INVALID_DATA: informe quem aceitou (2 a 200 caracteres)'; end if;
  if p_accepted_at is null or p_accepted_at > current_date + 1 then raise exception 'INVALID_DATA: data do aceite inválida (obrigatória e não futura)'; end if;
  if p_evidence_id is null then raise exception 'EVIDENCE_REQUIRED: o aceite do cliente exige evidência (termo, e-mail, ata)'; end if;
  select * into v_ev from public.quality_evidence e where e.id = p_evidence_id and e.project_id = v_c.c_project and e.warranty_case_id = v_c.c_id;
  if not found then raise exception 'EVIDENCE_INVALID: a evidência deve existir e pertencer a este caso'; end if;
  if v_ev.epistemic <> 'FATO' then raise exception 'EVIDENCE_INVALID: a evidência do aceite deve ser um FATO'; end if;

  select * into v_old from public.quality_warranty_cases where id = v_c.c_id;
  if v_old.acceptance_status = 'COMPROVADO' then
    raise exception 'ACCEPTANCE_ALREADY_PROVEN: já há aceite COMPROVADO neste ciclo; um lançamento interno não o substitui (novo reparo ou reabertura inicia novo ciclo)';
  end if;
  insert into public.quality_warranty_acceptances (project_id, warranty_case_id, kind, accepted_at, accepted_by_name, evidence_id,
    evidence_source_ref, case_row_version, supersedes_id, created_by)
  values (v_c.c_project, v_c.c_id, 'INFORMADO', p_accepted_at, v_name, v_ev.id, v_ev.source_ref, v_c.c_version, v_old.current_acceptance_id, v_uid)
  returning id into v_acc;
  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_warranty_cases
    set accepted_at = (p_accepted_at::timestamp + interval '12 hours') at time zone 'UTC', accepted_by_name = v_name,
        accepted_evidence_id = v_ev.id, acceptance_status = 'INFORMADO', current_acceptance_id = v_acc
    where id = v_c.c_id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_c.c_project, 'QUALITY_WARRANTY_ACCEPTANCE', 'QUALITY_WARRANTY_CASES', v_c.c_id,
    jsonb_build_object('kind', 'INFORMADO', 'acceptanceId', v_acc, 'acceptedAt', p_accepted_at, 'acceptedBy', v_name, 'evidenceId', v_ev.id,
      'evidenceSourceRef', v_ev.source_ref, 'previousAcceptedAt', v_old.accepted_at, 'previousAcceptedBy', v_old.accepted_by_name,
      'expectedVersion', p_expected_version, 'newVersion', v_new_version,
      'note', 'aceite INFORMADO por usuário interno: NÃO libera o encerramento; é necessário o aceite COMPROVADO (quality_warranty_acceptance_prove)'));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_c.c_id, 'rowVersion', v_new_version, 'acceptanceId', v_acc, 'kind', 'INFORMADO');
end;
$$;

-- ---------- aceite COMPROVADO (nova RPC) ----------
create or replace function public.quality_warranty_acceptance_prove(
  p_case_id uuid, p_expected_version integer, p_accepted_at date, p_manifestant_name text, p_manifestant_organization text,
  p_manifestant_contact text, p_evidence_id uuid, p_source_hash text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_c record;
  v_name text := nullif(btrim(coalesce(p_manifestant_name, '')), '');
  v_org text := nullif(btrim(coalesce(p_manifestant_organization, '')), '');
  v_contact text := lower(nullif(btrim(coalesce(p_manifestant_contact, '')), ''));
  v_hash text := lower(nullif(btrim(coalesce(p_source_hash, '')), ''));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_ev public.quality_evidence%rowtype;
  v_old public.quality_warranty_cases%rowtype;
  v_me public.profiles%rowtype;
  v_last_repair date;
  v_new_version integer;
  v_acc uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_c from public.quality_case_lookup(null, p_case_id, true);
  if not found or not public.quality_can_manage(v_c.c_project) then raise exception 'FORBIDDEN'; end if;
  if p_expected_version is null then raise exception 'VERSION_REQUIRED: informe a versão lida (row_version)'; end if;
  if p_expected_version <> v_c.c_version then
    raise exception 'VERSION_CONFLICT: versão esperada % mas a atual é %', p_expected_version, v_c.c_version;
  end if;
  if v_c.c_state not in ('REPARADA', 'VERIFICADA') then
    raise exception 'INVALID_STATE: o aceite do cliente só é registrado com a garantia REPARADA ou VERIFICADA (atual: %)', v_c.c_state;
  end if;
  select * into v_old from public.quality_warranty_cases where id = v_c.c_id;
  if v_old.acceptance_status = 'COMPROVADO' then
    raise exception 'ACCEPTANCE_ALREADY_PROVEN: o aceite deste ciclo já está comprovado (novo reparo ou reabertura inicia novo ciclo)';
  end if;
  if v_name is null or char_length(v_name) < 2 or char_length(v_name) > 200 then raise exception 'INVALID_DATA: identifique o manifestante do cliente (nome, 2 a 200 caracteres)'; end if;
  if v_org is not null and char_length(v_org) > 200 then raise exception 'INVALID_DATA: organização longa demais'; end if;
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'INVALID_DATA: nota longa demais'; end if;
  if p_accepted_at is null or p_accepted_at > current_date + 1 then raise exception 'INVALID_DATA: data da manifestação inválida (obrigatória e não futura)'; end if;
  if v_contact is null or char_length(v_contact) > 254 or v_contact !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'MANIFESTANT_CONTACT_REQUIRED: informe o e-mail de contato do manifestante externo (formato válido)';
  end if;
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'SOURCE_HASH_REQUIRED: informe o hash SHA-256 (64 caracteres hexadecimais) do documento/e-mail ingerido';
  end if;
  if p_evidence_id is null then raise exception 'EVIDENCE_REQUIRED: o aceite comprovado exige a evidência (e-mail, documento ou ata ingerida)'; end if;
  select * into v_ev from public.quality_evidence e where e.id = p_evidence_id and e.project_id = v_c.c_project and e.warranty_case_id = v_c.c_id;
  if not found then raise exception 'EVIDENCE_INVALID: a evidência deve existir e pertencer a este caso'; end if;
  if v_ev.epistemic <> 'FATO' then raise exception 'EVIDENCE_INVALID: a evidência do aceite deve ser um FATO'; end if;
  if v_ev.source_type not in ('EMAIL', 'DOCUMENTO') then
    raise exception 'EVIDENCE_INVALID: a prova do aceite deve ser um e-mail ou um documento/ata ingerido (tipo atual: %)', v_ev.source_type;
  end if;

  -- o manifestante tem de ser EXTERNO: nem o próprio registrante nem membro ativo do projeto
  select * into v_me from public.profiles where id = v_uid;
  if lower(coalesce(v_me.email, '')) = v_contact
     or public.insurance_int_norm_text(v_me.name) = public.insurance_int_norm_text(v_name) then
    raise exception 'MANIFESTANT_IS_INTERNAL: o manifestante não pode ser quem registra; um lançamento interno não substitui a manifestação do cliente';
  end if;
  if exists (select 1 from public.project_memberships m join public.profiles p on p.id = m.user_id
              where m.project_id = v_c.c_project and m.status = 'ACTIVE' and lower(coalesce(p.email, '')) = v_contact) then
    raise exception 'MANIFESTANT_IS_INTERNAL: o e-mail informado pertence a um membro do projeto; informe o contato do cliente';
  end if;
  -- a manifestação é posterior ao último reparo executado (aceite anterior ao reparo não vale)
  select max(r.executed_at::date) into v_last_repair from public.quality_warranty_repairs r where r.warranty_case_id = v_c.c_id and r.executed_at is not null;
  if v_last_repair is not null and p_accepted_at < v_last_repair then
    raise exception 'ACCEPTANCE_BEFORE_REPAIR: a manifestação (%) é anterior ao último reparo executado (%); o aceite deve ser posterior ao reparo', p_accepted_at, v_last_repair;
  end if;

  insert into public.quality_warranty_acceptances (project_id, warranty_case_id, kind, accepted_at, accepted_by_name, manifestant_organization,
    manifestant_contact, evidence_id, evidence_source_ref, source_hash, note, case_row_version, supersedes_id, created_by)
  values (v_c.c_project, v_c.c_id, 'COMPROVADO', p_accepted_at, v_name, v_org, v_contact, v_ev.id, v_ev.source_ref, v_hash, v_note,
    v_c.c_version, v_old.current_acceptance_id, v_uid)
  returning id into v_acc;
  perform set_config('quality.audited_by_rpc', 'on', true);
  update public.quality_warranty_cases
    set accepted_at = (p_accepted_at::timestamp + interval '12 hours') at time zone 'UTC', accepted_by_name = v_name,
        accepted_evidence_id = v_ev.id, acceptance_status = 'COMPROVADO', current_acceptance_id = v_acc
    where id = v_c.c_id returning row_version into v_new_version;
  perform public.quality_rpc_audit(v_c.c_project, 'QUALITY_WARRANTY_ACCEPTANCE', 'QUALITY_WARRANTY_CASES', v_c.c_id,
    jsonb_build_object('kind', 'COMPROVADO', 'acceptanceId', v_acc, 'manifestedAt', p_accepted_at, 'manifestantName', v_name,
      'manifestantOrganization', v_org, 'manifestantContact', v_contact, 'evidenceId', v_ev.id, 'evidenceSourceRef', v_ev.source_ref,
      'sourceHash', v_hash, 'hashAlgorithm', 'SHA-256', 'supersedesId', v_old.current_acceptance_id,
      'expectedVersion', p_expected_version, 'newVersion', v_new_version,
      'note', 'aceite COMPROVADO: manifestação do cliente com evidência, hash e manifestante externo; vale para um ciclo'));
  perform set_config('quality.audited_by_rpc', 'off', true);
  return jsonb_build_object('ok', true, 'id', v_c.c_id, 'rowVersion', v_new_version, 'acceptanceId', v_acc, 'kind', 'COMPROVADO');
end;
$$;

create or replace function public.quality_warranty_acceptances_list(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_project uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select project_id into v_project from public.quality_warranty_cases where id = p_case_id;
  if v_project is null or not public.quality_can_read(v_project) then raise exception 'FORBIDDEN'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'acceptedAt', a.accepted_at, 'acceptedByName', a.accepted_by_name,
      'manifestantOrganization', a.manifestant_organization, 'manifestantContact', a.manifestant_contact, 'evidenceId', a.evidence_id,
      'evidenceSourceRef', a.evidence_source_ref, 'sourceHash', a.source_hash, 'hashAlgorithm', a.source_hash_algorithm, 'note', a.note,
      'caseRowVersion', a.case_row_version, 'supersedesId', a.supersedes_id, 'createdBy', a.created_by, 'createdAt', a.created_at)
      order by a.created_at desc, a.id)
    from public.quality_warranty_acceptances a where a.warranty_case_id = p_case_id and a.project_id = v_project), '[]'::jsonb);
end;
$$;

revoke all on function public.quality_warranty_state_guard() from public, anon, authenticated;
revoke all on function public.quality_warranty_acceptance_register(uuid, integer, date, text, uuid) from public, anon;
grant execute on function public.quality_warranty_acceptance_register(uuid, integer, date, text, uuid) to authenticated;
revoke all on function public.quality_warranty_acceptance_prove(uuid, integer, date, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.quality_warranty_acceptance_prove(uuid, integer, date, text, text, text, uuid, text, text) to authenticated;
revoke all on function public.quality_warranty_acceptances_list(uuid) from public, anon;
grant execute on function public.quality_warranty_acceptances_list(uuid) to authenticated;
