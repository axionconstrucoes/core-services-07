-- ============================================================
-- 20261125200000_insurance_coherence.sql
--
-- FASE 4 / Escopo B (2/5) — COERÊNCIA minuta x apólice x contrato.
--
-- Problema: a minuta (aviso, reclamação, endosso, cobrança) podia ser aprovada para envio sem que ninguém conferisse, de forma
-- estruturada, se segurado, beneficiário, objeto, vigência, importância segurada e obrigação garantida coincidem entre o CONTRATO,
-- a APÓLICE e a própria MINUTA.
--
-- O que esta migration cria:
--   * insurance_instrument_terms          termos declarados por cada instrumento (CONTRATO | APOLICE | MINUTA), cada linha com FONTE
--                                         (documento ou referência) — append-only; a mais recente de cada tipo vale;
--   * insurance_coherence_justifications  justificativa humana (texto + fonte) de UMA divergência, presa à impressão digital
--                                         (fingerprint) dos valores: se qualquer valor mudar, a justificativa deixa de valer;
--   * insurance_instrument_terms_save     grava os termos (CONTRATO/APOLICE = gestão; MINUTA = registro);
--   * insurance_coherence_compute/check   comparação ESTRUTURADA campo a campo, com divergências, fontes e situação;
--   * insurance_coherence_justify         justifica uma divergência (gestão; texto >= 20 caracteres + fonte);
--   * insurance_draft_approve (REDEFINIDA) a aprovação para envio é BLOQUEADA com divergência não justificada ou sem os três
--                                         conjuntos de termos (COHERENCE_BLOCKED). Corpo vigente (20261122201000) + o portão novo.
--
-- Campos comparados: SEGURADO, BENEFICIARIO (nome e/ou documento fiscal normalizado), OBJETO, VIGENCIA_INICIO, VIGENCIA_FIM,
-- IMPORTANCIA_SEGURADA, OBRIGACAO_GARANTIDA. Valor ausente em um documento NÃO é divergência (SEM DADOS; não se inventa):
-- só se comparam os valores presentes. Faltar TODO o conjunto de termos de um tipo impede a validação (SEM_DADOS) e bloqueia.
-- Paridade com apps/web/lib/insurance/coherence.ts (texto canônico idêntico). Envio real continua impossível.
-- Idempotente. Reversão: supabase/rollbacks/20261125200000_insurance_coherence.rollback.sql
-- ============================================================

-- ---------- normalização (fonte única; espelhada em TS) ----------
create or replace function public.f4b_norm_text(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(lower(translate(coalesce(p_text, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.f4b_tax_digits(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$ select regexp_replace(coalesce(p_text, ''), '\D', '', 'g'); $$;

-- igualdade de PARTE: documentos fiscais (só dígitos) quando AMBOS os têm; senão, nomes normalizados (ambos presentes)
create or replace function public.f4b_party_equal(p_name1 text, p_tax1 text, p_name2 text, p_tax2 text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when public.f4b_tax_digits(p_tax1) <> '' and public.f4b_tax_digits(p_tax2) <> '' then public.f4b_tax_digits(p_tax1) = public.f4b_tax_digits(p_tax2)
    else public.f4b_norm_text(p_name1) <> '' and public.f4b_norm_text(p_name1) = public.f4b_norm_text(p_name2)
  end;
$$;
revoke all on function public.f4b_norm_text(text), public.f4b_tax_digits(text), public.f4b_party_equal(text, text, text, text) from public, anon;
grant execute on function public.f4b_norm_text(text), public.f4b_tax_digits(text), public.f4b_party_equal(text, text, text, text) to authenticated;

-- ---------- termos por instrumento ----------
create table if not exists public.insurance_instrument_terms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  policy_id uuid not null references public.insurance_policies (id) on delete restrict,
  source_kind text not null check (source_kind in ('CONTRATO', 'APOLICE', 'MINUTA')),
  draft_id uuid references public.insurance_drafts (id) on delete restrict,
  insured_name text,
  insured_tax_id text,
  beneficiary_name text,
  beneficiary_tax_id text,
  object_text text,
  coverage_start date,
  coverage_end date,
  insured_amount numeric(18, 2) check (insured_amount is null or insured_amount >= 0),
  guaranteed_obligation text,
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  source_page text,
  note text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (id, project_id),
  check ((source_kind = 'MINUTA') = (draft_id is not null)),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null),
  check (coverage_start is null or coverage_end is null or coverage_end >= coverage_start),
  check (num_nonnulls(nullif(btrim(coalesce(insured_name, '')), ''), nullif(btrim(coalesce(insured_tax_id, '')), ''),
    nullif(btrim(coalesce(beneficiary_name, '')), ''), nullif(btrim(coalesce(beneficiary_tax_id, '')), ''),
    nullif(btrim(coalesce(object_text, '')), ''), coverage_start, coverage_end, insured_amount,
    nullif(btrim(coalesce(guaranteed_obligation, '')), '')) >= 1)
);
create index if not exists insurance_instrument_terms_policy_idx on public.insurance_instrument_terms (policy_id, source_kind, created_at desc);
create index if not exists insurance_instrument_terms_draft_idx on public.insurance_instrument_terms (draft_id, created_at desc) where draft_id is not null;

create table if not exists public.insurance_coherence_justifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete restrict,
  draft_id uuid not null references public.insurance_drafts (id) on delete restrict,
  field text not null check (field in ('SEGURADO', 'BENEFICIARIO', 'OBJETO', 'VIGENCIA_INICIO', 'VIGENCIA_FIM', 'IMPORTANCIA_SEGURADA', 'OBRIGACAO_GARANTIDA')),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  justification text not null check (char_length(btrim(justification)) >= 20 and char_length(justification) <= 4000),
  source_document_id uuid references public.documents (id) on delete restrict,
  source_ref text,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (source_document_id is not null or nullif(btrim(coalesce(source_ref, '')), '') is not null)
);
create index if not exists insurance_coherence_just_draft_idx on public.insurance_coherence_justifications (draft_id, field, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['insurance_instrument_terms', 'insurance_coherence_justifications'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_append_only', t);
    execute format('create trigger %I before update or delete on public.%I for each row execute function public.f4b_block_mutation()', t || '_append_only', t);
    execute format('drop trigger if exists %I on public.%I', t || '_no_truncate', t);
    execute format('create trigger %I before truncate on public.%I for each statement execute function public.f4b_block_mutation()', t || '_no_truncate', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_members', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.insurance_access(project_id, ''READ''))', t || '_select_members', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
comment on table public.insurance_instrument_terms is 'Termos declarados por CONTRATO, APOLICE e MINUTA (com fonte). Append-only; a linha mais recente de cada tipo vale. Escrita só por insurance_instrument_terms_save.';
comment on table public.insurance_coherence_justifications is 'Justificativa humana (texto + fonte) de uma divergência de coerência, presa ao fingerprint dos valores. Append-only.';

-- ---------- gravação dos termos ----------
create or replace function public.insurance_instrument_terms_save(p_policy_id uuid, p_source_kind text, p_draft_id uuid, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_uid uuid;
  v_id uuid;
  v_doc uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ref text := public.insurance_int_text(p_data, 'source_ref');
  d public.insurance_drafts%rowtype;
  v_draft_policy uuid;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  if v_proj is null then raise exception 'NOT_FOUND'; end if;
  if p_source_kind is null or p_source_kind not in ('CONTRATO', 'APOLICE', 'MINUTA') then raise exception 'INVALID_INPUT: tipo de instrumento inválido'; end if;
  v_uid := public.insurance_int_require(v_proj, case when p_source_kind = 'MINUTA' then 'REGISTER' else 'MANAGE' end);
  if p_data is null or jsonb_typeof(p_data) <> 'object' then raise exception 'INVALID_INPUT: dados ausentes'; end if;
  if v_doc is null and v_ref is null then raise exception 'SOURCE_REQUIRED: os termos exigem a fonte (documento ou referência da passagem)'; end if;
  perform public.insurance_int_same_project('documents', v_doc, v_proj);
  if p_source_kind = 'MINUTA' then
    if p_draft_id is null then raise exception 'INVALID_INPUT: a minuta é obrigatória para os termos da minuta'; end if;
    select * into d from public.insurance_drafts where id = p_draft_id;
    if not found or d.project_id <> v_proj then raise exception 'REFERENCE_OUT_OF_PROJECT'; end if;
    v_draft_policy := coalesce(d.policy_id, (select c.policy_id from public.insurance_claims c where c.id = d.claim_id),
                               (select e.policy_id from public.insurance_endorsements e where e.id = d.endorsement_id));
    if v_draft_policy is distinct from p_policy_id then raise exception 'INVALID_INPUT: a minuta não pertence a esta apólice'; end if;
  elsif p_draft_id is not null then
    raise exception 'INVALID_INPUT: minuta só se informa para os termos da MINUTA';
  end if;
  insert into public.insurance_instrument_terms (project_id, policy_id, source_kind, draft_id, insured_name, insured_tax_id, beneficiary_name, beneficiary_tax_id,
    object_text, coverage_start, coverage_end, insured_amount, guaranteed_obligation, source_document_id, source_ref, source_page, note, created_by)
  values (v_proj, p_policy_id, p_source_kind, p_draft_id, public.insurance_int_text(p_data, 'insured_name'), public.insurance_int_text(p_data, 'insured_tax_id'),
    public.insurance_int_text(p_data, 'beneficiary_name'), public.insurance_int_text(p_data, 'beneficiary_tax_id'), public.insurance_int_text(p_data, 'object_text'),
    (p_data ->> 'coverage_start')::date, (p_data ->> 'coverage_end')::date, (p_data ->> 'insured_amount')::numeric,
    public.insurance_int_text(p_data, 'guaranteed_obligation'), v_doc, v_ref, public.insurance_int_text(p_data, 'source_page'), public.insurance_int_text(p_data, 'note'), v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(v_proj, 'INSURANCE_INSTRUMENT_TERMS', v_id, 'INSTRUMENT_TERMS_SAVED',
    jsonb_build_object('policyId', p_policy_id, 'sourceKind', p_source_kind, 'draftId', p_draft_id, 'sourceDocumentId', v_doc, 'sourceRef', v_ref));
  return jsonb_build_object('ok', true, 'id', v_id, 'sourceKind', p_source_kind);
end;
$$;

-- ---------- comparação estruturada ----------
create or replace function public.insurance_int_coherence(p_policy_id uuid, p_draft_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_kinds constant text[] := array['CONTRATO', 'APOLICE', 'MINUTA'];
  v_fields constant text[] := array['SEGURADO', 'BENEFICIARIO', 'OBJETO', 'VIGENCIA_INICIO', 'VIGENCIA_FIM', 'IMPORTANCIA_SEGURADA', 'OBRIGACAO_GARANTIDA'];
  v_rows jsonb := '{}'::jsonb;
  r public.insurance_instrument_terms%rowtype;
  v_k text;
  v_f text;
  v_missing text[] := '{}';
  v_divs jsonb := '[]'::jsonb;
  v_present text[];
  v_vals jsonb;
  v_srcs jsonb;
  v_canon text;
  v_fp text;
  v_diff boolean;
  v_just uuid;
  v_unjustified integer := 0;
  v_justified integer := 0;
  a text;
  b text;
  i integer;
  j integer;
  v_name text;
  v_tax text;
  v_n1 text; v_t1 text; v_n2 text; v_t2 text;
  v_scalar text;
  v_status text;
begin
  foreach v_k in array v_kinds loop
    if v_k = 'MINUTA' then
      select * into r from public.insurance_instrument_terms where policy_id = p_policy_id and source_kind = 'MINUTA' and draft_id = p_draft_id order by created_at desc, id desc limit 1;
    else
      select * into r from public.insurance_instrument_terms where policy_id = p_policy_id and source_kind = v_k order by created_at desc, id desc limit 1;
    end if;
    if found then v_rows := v_rows || jsonb_build_object(v_k, to_jsonb(r)); else v_missing := array_append(v_missing, v_k); end if;
  end loop;

  foreach v_f in array v_fields loop
    v_present := '{}';
    v_vals := '{}'::jsonb;
    v_srcs := '{}'::jsonb;
    v_canon := v_f || '|';
    v_diff := false;
    foreach v_k in array v_kinds loop
      if v_rows ? v_k then
        if v_f in ('SEGURADO', 'BENEFICIARIO') then
          v_name := nullif(btrim(coalesce(v_rows -> v_k ->> case when v_f = 'SEGURADO' then 'insured_name' else 'beneficiary_name' end, '')), '');
          v_tax := nullif(public.f4b_tax_digits(v_rows -> v_k ->> case when v_f = 'SEGURADO' then 'insured_tax_id' else 'beneficiary_tax_id' end), '');
          if v_name is not null or v_tax is not null then
            v_present := array_append(v_present, v_k);
            v_vals := v_vals || jsonb_build_object(v_k, jsonb_build_object('name', v_name, 'taxId', v_tax));
            v_canon := v_canon || v_k || '=' || coalesce(v_tax, '') || '/' || public.f4b_norm_text(v_name) || ';';
          else v_canon := v_canon || v_k || '=;'; end if;
        else
          v_scalar := case v_f
            when 'OBJETO' then nullif(public.f4b_norm_text(v_rows -> v_k ->> 'object_text'), '')
            when 'OBRIGACAO_GARANTIDA' then nullif(public.f4b_norm_text(v_rows -> v_k ->> 'guaranteed_obligation'), '')
            when 'VIGENCIA_INICIO' then nullif(v_rows -> v_k ->> 'coverage_start', '')
            when 'VIGENCIA_FIM' then nullif(v_rows -> v_k ->> 'coverage_end', '')
            else case when (v_rows -> v_k ->> 'insured_amount') is null then null else to_char((v_rows -> v_k ->> 'insured_amount')::numeric, 'FM999999999999990.00') end
          end;
          if v_scalar is not null then
            v_present := array_append(v_present, v_k);
            v_vals := v_vals || jsonb_build_object(v_k, v_scalar);
            v_canon := v_canon || v_k || '=' || v_scalar || ';';
          else v_canon := v_canon || v_k || '=;'; end if;
        end if;
        if v_k = any (v_present) then
          v_srcs := v_srcs || jsonb_build_object(v_k, coalesce(v_rows -> v_k ->> 'source_ref', 'documento ' || (v_rows -> v_k ->> 'source_document_id')));
        end if;
      else
        v_canon := v_canon || v_k || '=;';
      end if;
    end loop;
    -- só se comparam os valores presentes; um único valor (ou nenhum) não diverge
    for i in 1 .. coalesce(array_length(v_present, 1), 0) loop
      for j in i + 1 .. coalesce(array_length(v_present, 1), 0) loop
        a := v_present[i]; b := v_present[j];
        if v_f in ('SEGURADO', 'BENEFICIARIO') then
          v_n1 := v_vals -> a ->> 'name'; v_t1 := v_vals -> a ->> 'taxId'; v_n2 := v_vals -> b ->> 'name'; v_t2 := v_vals -> b ->> 'taxId';
          if not public.f4b_party_equal(v_n1, v_t1, v_n2, v_t2) then v_diff := true; end if;
        elsif (v_vals ->> a) is distinct from (v_vals ->> b) then v_diff := true;
        end if;
      end loop;
    end loop;
    if v_diff then
      v_fp := md5(v_canon);
      v_just := null;
      if p_draft_id is not null then
        select id into v_just from public.insurance_coherence_justifications
         where draft_id = p_draft_id and field = v_f and fingerprint = v_fp order by created_at desc, id desc limit 1;
      end if;
      if v_just is null then v_unjustified := v_unjustified + 1; else v_justified := v_justified + 1; end if;
      v_divs := v_divs || jsonb_build_array(jsonb_build_object('field', v_f, 'kind', 'DIVERGENTE', 'values', v_vals, 'sources', v_srcs,
        'fingerprint', v_fp, 'canonical', v_canon, 'justified', v_just is not null, 'justificationId', v_just));
    end if;
  end loop;

  v_status := case when cardinality(v_missing) > 0 then 'SEM_DADOS'
                   when v_unjustified > 0 then 'DIVERGENTE'
                   when v_justified > 0 then 'DIVERGENTE_JUSTIFICADA'
                   else 'COERENTE' end;
  return jsonb_build_object('policyId', p_policy_id, 'draftId', p_draft_id, 'status', v_status, 'missingKinds', to_jsonb(v_missing),
    'divergences', v_divs, 'unjustified', v_unjustified, 'justified', v_justified,
    'approvalAllowed', v_status in ('COERENTE', 'DIVERGENTE_JUSTIFICADA'),
    'note', 'Valor ausente em um documento não é divergência (SEM DADOS); só se comparam valores presentes. Apoio à decisão: exige revisão humana.');
end;
$$;
revoke all on function public.insurance_int_coherence(uuid, uuid) from public, anon, authenticated;

create or replace function public.insurance_coherence_check(p_policy_id uuid, p_draft_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_proj uuid;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  perform public.insurance_int_require(v_proj, 'READ');
  if p_draft_id is not null and not exists (select 1 from public.insurance_drafts where id = p_draft_id and project_id = v_proj) then
    raise exception 'REFERENCE_OUT_OF_PROJECT';
  end if;
  return public.insurance_int_coherence(p_policy_id, p_draft_id);
end;
$$;

create or replace function public.insurance_coherence_justify(p_draft_id uuid, p_field text, p_justification text, p_source_ref text, p_source_document_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
  v_pol uuid;
  v_uid uuid;
  v_text text := btrim(coalesce(p_justification, ''));
  v_ref text := nullif(btrim(coalesce(p_source_ref, '')), '');
  v_res jsonb;
  v_div jsonb;
  v_id uuid;
begin
  select * into d from public.insurance_drafts where id = p_draft_id;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(d.project_id, 'MANAGE');
  if d.state <> 'DRAFT' then raise exception 'INVALID_STATE: só se justifica divergência de minuta em DRAFT (estado %)', d.state; end if;
  if char_length(v_text) < 20 or char_length(v_text) > 4000 then raise exception 'JUSTIFICATION_REQUIRED: a justificativa exige texto de 20 a 4000 caracteres'; end if;
  if v_ref is null and p_source_document_id is null then raise exception 'SOURCE_REQUIRED: a justificativa exige fonte (documento ou referência)'; end if;
  perform public.insurance_int_same_project('documents', p_source_document_id, d.project_id);
  v_pol := coalesce(d.policy_id, (select c.policy_id from public.insurance_claims c where c.id = d.claim_id),
                    (select e.policy_id from public.insurance_endorsements e where e.id = d.endorsement_id));
  if v_pol is null then raise exception 'INVALID_INPUT: a minuta não está ligada a uma apólice'; end if;
  v_res := public.insurance_int_coherence(v_pol, p_draft_id);
  select x into v_div from jsonb_array_elements(v_res -> 'divergences') x where x ->> 'field' = p_field limit 1;
  if v_div is null then raise exception 'NOT_DIVERGENT: o campo % não tem divergência a justificar', coalesce(p_field, '?'); end if;
  if (v_div ->> 'justified')::boolean then raise exception 'ALREADY_JUSTIFIED: a divergência já tem justificativa para estes valores'; end if;
  insert into public.insurance_coherence_justifications (project_id, draft_id, field, fingerprint, justification, source_document_id, source_ref, created_by)
  values (d.project_id, p_draft_id, p_field, v_div ->> 'fingerprint', v_text, p_source_document_id, v_ref, v_uid)
  returning id into v_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_draft_id, 'COHERENCE_DIVERGENCE_JUSTIFIED',
    jsonb_build_object('field', p_field, 'fingerprint', v_div ->> 'fingerprint', 'justificationId', v_id, 'sourceRef', v_ref, 'sourceDocumentId', p_source_document_id));
  return jsonb_build_object('ok', true, 'id', v_id, 'field', p_field);
end;
$$;

-- ---------- aprovação da minuta (REDEFINIDA: corpo vigente de 20261122201000 + portão de coerência) ----------
create or replace function public.insurance_draft_approve(p_id uuid, p_expected_row_version integer, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
  v_uid uuid;
  v_pol uuid;
  v_coh jsonb;
begin
  select * into d from public.insurance_drafts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  v_uid := public.insurance_int_require(d.project_id, 'ADMIN');
  if p_expected_row_version is null then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if d.row_version <> p_expected_row_version then raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_row_version, d.row_version; end if;
  if d.state <> 'DRAFT' then raise exception 'INVALID_TRANSITION: % -> APROVADA_PARA_ENVIO', d.state; end if;
  if coalesce(p_confirmation, '') <> 'APROVO O CONTEUDO PARA ENVIO' then raise exception 'EXPRESS_CONFIRMATION_REQUIRED'; end if;
  if char_length(btrim(d.body)) < 20 then raise exception 'DRAFT_BODY_TOO_SHORT'; end if;
  if d.body ~ '\[(PREENCHER|SEM DADOS)[^\]]*\]' then raise exception 'DRAFT_HAS_PLACEHOLDERS'; end if;
  -- Fase 4/B: coerência minuta x apólice x contrato (minuta de apólice: segurado, beneficiário, objeto, vigência, importância, obrigação)
  v_pol := coalesce(d.policy_id, (select c.policy_id from public.insurance_claims c where c.id = d.claim_id),
                    (select e.policy_id from public.insurance_endorsements e where e.id = d.endorsement_id));
  if v_pol is not null then
    v_coh := public.insurance_int_coherence(v_pol, d.id);
    if not (v_coh ->> 'approvalAllowed')::boolean then
      raise exception 'COHERENCE_BLOCKED: situação % (termos ausentes: %; divergências sem justificativa: %)',
        v_coh ->> 'status', v_coh -> 'missingKinds', v_coh -> 'unjustified';
    end if;
  end if;
  update public.insurance_drafts set state = 'APROVADA_PARA_ENVIO', approved_by = v_uid, approved_at = now(), approved_body_hash = md5(body),
      row_version = row_version + 1, updated_at = now() where id = p_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_id, 'DRAFT_APPROVED_FOR_SEND',
    jsonb_build_object('bodyHash', md5(d.body), 'realSendPerformed', false,
      'coherence', case when v_coh is null then null else jsonb_build_object('status', v_coh ->> 'status', 'divergences', v_coh -> 'divergences') end,
      'note', 'Aprovação humana expressa registrada. NÃO envia: trava de envio real permanece fail-closed.'));
  return jsonb_build_object('id', p_id, 'state', 'APROVADA_PARA_ENVIO', 'sent', false, 'rowVersion', d.row_version + 1);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'insurance_instrument_terms_save(uuid,text,uuid,jsonb)', 'insurance_coherence_check(uuid,uuid)',
    'insurance_coherence_justify(uuid,text,text,text,uuid)', 'insurance_draft_approve(uuid,integer,text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
