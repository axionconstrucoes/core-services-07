-- ============================================================
-- 20261125201000_insurance_subjects_rcc_clause_id.sql
--
-- FASE 4 / Escopo B (3/5) — identificação de segurados/beneficiários, checklist RCC e cláusula de cobertura IDENTIFICADA.
--
--  (f1) DOCUMENTO FISCAL: insurance_tax_id_valid(texto) valida CPF (11) e CNPJ (14) pelos dígitos verificadores (nada inventado).
--       Gatilho em insurance_policy_parties (INSERT e reativação): documento informado precisa ser VÁLIDO; segurado, beneficiário,
--       proprietário final e titular do interesse segurável IDENTIFICADOS exigem documento fiscal válido (senão registre
--       NAO_IDENTIFICADO, que é um estado explícito); DEDUPE por documento normalizado (só dígitos) — ou por nome normalizado quando
--       não há documento — entre as partes ATIVAS do mesmo papel na apólice. Dados legados NÃO são alterados.
--       Gatilho em insurance_expected_subjects: documento esperado informado precisa ser válido.
--  (f2) RCC: insurance_rcc_readiness(apólice, evento) — pronto = as 10 perguntas respondidas COM FONTE e a natureza do bem definida
--       (bens de terceiros, própria obra ou ambos; indefinido NÃO conta). Paridade com evaluateRccChecklist (TS).
--  (e)  CLÁUSULA DE COBERTURA: insurance_policy_clauses.clause_identifier (ex.: "Cláusula 4.2"). insurance_policy_clause_add
--       (REDEFINIDA; corpo vigente de 20261122201000 + a coluna) passa a EXIGIR o identificador quando kind = COBERTURA.
--       Cláusula genérica (kind CLAUSULA/CONDICAO/OUTRO) nunca prova cobertura (apps/web/lib/insurance/coverage-assessment.ts).
-- Idempotente. Reversão: supabase/rollbacks/20261125201000_insurance_subjects_rcc_clause_id.rollback.sql
-- ============================================================

create or replace function public.insurance_tax_id_valid(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text := regexp_replace(coalesce(p_text, ''), '\D', '', 'g');
  n integer[];
  s integer;
  i integer;
  w1 integer[] := array[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  w2 integer[] := array[6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  dv integer;
begin
  if length(d) not in (11, 14) or d ~ '^(\d)\1+$' then return false; end if;
  n := array(select substr(d, k, 1)::integer from generate_series(1, length(d)) k);
  if length(d) = 11 then
    s := 0; for i in 1 .. 9 loop s := s + n[i] * (11 - i); end loop;
    dv := (s * 10) % 11; if dv = 10 then dv := 0; end if;
    if dv <> n[10] then return false; end if;
    s := 0; for i in 1 .. 10 loop s := s + n[i] * (12 - i); end loop;
    dv := (s * 10) % 11; if dv = 10 then dv := 0; end if;
    return dv = n[11];
  end if;
  s := 0; for i in 1 .. 12 loop s := s + n[i] * w1[i]; end loop;
  dv := s % 11; dv := case when dv < 2 then 0 else 11 - dv end;
  if dv <> n[13] then return false; end if;
  s := 0; for i in 1 .. 13 loop s := s + n[i] * w2[i]; end loop;
  dv := s % 11; dv := case when dv < 2 then 0 else 11 - dv end;
  return dv = n[14];
end;
$$;
revoke all on function public.insurance_tax_id_valid(text) from public, anon;
grant execute on function public.insurance_tax_id_valid(text) to authenticated;

alter table public.insurance_policy_parties add column if not exists tax_id_normalized text;
comment on column public.insurance_policy_parties.tax_id_normalized is 'Documento fiscal só com dígitos (preenchido pelo gatilho; null em dados legados sem documento).';

create or replace function public.insurance_party_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tax text;
  v_name text;
begin
  if tg_op = 'UPDATE' then
    -- só a REATIVAÇÃO é reavaliada (desativar nunca bloqueia)
    if not (new.active and not old.active) then return new; end if;
  end if;
  v_tax := nullif(public.f4b_tax_digits(new.tax_id), '');
  v_name := public.f4b_norm_text(new.party_name);
  if tg_op = 'INSERT' then
    if v_tax is not null and not public.insurance_tax_id_valid(new.tax_id) then
      raise exception 'INVALID_TAX_ID: documento fiscal inválido (CPF/CNPJ pelos dígitos verificadores)';
    end if;
    if new.identification_status = 'IDENTIFICADO' and v_name <> '' and new.party_role in ('SEGURADO', 'BENEFICIARIO', 'PROPRIETARIO_FINAL', 'TITULAR_INTERESSE_SEGURAVEL') and v_tax is null then
      raise exception 'TAX_ID_REQUIRED: % identificado exige documento fiscal válido (CPF/CNPJ); sem documento registre NAO_IDENTIFICADO', new.party_role;
    end if;
    new.tax_id_normalized := v_tax;
  else
    v_tax := coalesce(new.tax_id_normalized, v_tax);
  end if;
  if new.active and new.identification_status = 'IDENTIFICADO' and exists (
       select 1 from public.insurance_policy_parties p
        where p.policy_id = new.policy_id and p.party_role = new.party_role and p.active and p.id <> new.id
          and p.identification_status = 'IDENTIFICADO'
          and ((v_tax is not null and coalesce(p.tax_id_normalized, nullif(public.f4b_tax_digits(p.tax_id), '')) = v_tax)
               or (v_tax is null and v_name <> '' and public.f4b_norm_text(p.party_name) = v_name))) then
    raise exception 'DUPLICATE_PARTY: já existe % ativo com o mesmo documento fiscal/nome nesta apólice (sem dupla contagem)', new.party_role;
  end if;
  return new;
end;
$$;
drop trigger if exists insurance_party_guard_ins on public.insurance_policy_parties;
create trigger insurance_party_guard_ins before insert on public.insurance_policy_parties for each row execute function public.insurance_party_guard();
drop trigger if exists insurance_party_guard_upd on public.insurance_policy_parties;
create trigger insurance_party_guard_upd before update of active on public.insurance_policy_parties for each row execute function public.insurance_party_guard();
revoke all on function public.insurance_party_guard() from public, anon, authenticated;

create or replace function public.insurance_expected_subject_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(public.f4b_tax_digits(new.expected_tax_id), '') is not null and not public.insurance_tax_id_valid(new.expected_tax_id) then
    raise exception 'INVALID_TAX_ID: documento fiscal esperado inválido (CPF/CNPJ pelos dígitos verificadores)';
  end if;
  return new;
end;
$$;
drop trigger if exists insurance_expected_subject_guard_trg on public.insurance_expected_subjects;
create trigger insurance_expected_subject_guard_trg before insert on public.insurance_expected_subjects for each row execute function public.insurance_expected_subject_guard();
revoke all on function public.insurance_expected_subject_guard() from public, anon, authenticated;

-- ---------- RCC: prontidão ----------
create or replace function public.insurance_rcc_readiness(p_policy_id uuid, p_claim_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_proj uuid;
  v_cl public.insurance_rcc_checklists%rowtype;
  v_keys constant text[] := array['CAUSADOR', 'VITIMA', 'ABRANGENCIA_SEGURADOS', 'OBJETO', 'BENS_TERCEIROS_X_PROPRIA_OBRA',
    'EXCLUSOES', 'SUBLIMITES', 'FRANQUIAS', 'ENDOSSOS', 'AVISO'];
  v_missing text[] := '{}';
  v_k text;
  v_it record;
  v_scope text;
  v_answered integer := 0;
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  perform public.insurance_int_require(v_proj, 'READ');
  select * into v_cl from public.insurance_rcc_checklists where policy_id = p_policy_id and project_id = v_proj and claim_id is not distinct from p_claim_id order by version_no desc limit 1;
  if not found and p_claim_id is not null then
    select * into v_cl from public.insurance_rcc_checklists where policy_id = p_policy_id and project_id = v_proj and claim_id is null order by version_no desc limit 1;
  end if;
  if v_cl.id is null then
    return jsonb_build_object('ready', false, 'checklistId', null, 'versionNo', null, 'answeredWithSource', 0, 'total', 10, 'missing', to_jsonb(v_keys), 'scopeUndefined', true);
  end if;
  foreach v_k in array v_keys loop
    select * into v_it from public.insurance_rcc_checklist_items where checklist_id = v_cl.id and question_key = v_k;
    if found and v_it.answer is not null and (v_it.source_document_id is not null or nullif(btrim(coalesce(v_it.source_ref, '')), '') is not null) then
      v_answered := v_answered + 1;
      if v_k = 'BENS_TERCEIROS_X_PROPRIA_OBRA' then v_scope := v_it.property_scope; end if;
    else
      v_missing := array_append(v_missing, v_k);
    end if;
  end loop;
  return jsonb_build_object('ready', cardinality(v_missing) = 0 and v_scope in ('BENS_TERCEIROS', 'PROPRIA_OBRA', 'AMBOS'),
    'checklistId', v_cl.id, 'versionNo', v_cl.version_no, 'answeredWithSource', v_answered, 'total', 10, 'missing', to_jsonb(v_missing),
    'scopeUndefined', coalesce(v_scope, 'INDEFINIDO') not in ('BENS_TERCEIROS', 'PROPRIA_OBRA', 'AMBOS'));
end;
$$;
revoke all on function public.insurance_rcc_readiness(uuid, uuid) from public, anon;
grant execute on function public.insurance_rcc_readiness(uuid, uuid) to authenticated;

-- ---------- cláusula de cobertura identificada ----------
alter table public.insurance_policy_clauses add column if not exists clause_identifier text;
comment on column public.insurance_policy_clauses.clause_identifier is
  'Identificação da cláusula no texto da apólice (ex.: "Cláusula 4.2", "Condições Especiais, item 3"). Obrigatória para kind = COBERTURA nas RPCs; cláusula genérica não prova cobertura.';

create or replace function public.insurance_policy_clause_add(p_policy_id uuid, p_expected_row_version integer, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  p public.insurance_policies%rowtype;
  v_proj uuid;
  v_id uuid;
  v_no integer;
  v_src uuid := public.insurance_int_uuid(p_data, 'source_document_id');
  v_ident text := public.insurance_int_text(p_data, 'clause_identifier');
begin
  select project_id into v_proj from public.insurance_policies where id = p_policy_id;
  v_uid := public.insurance_int_require(v_proj, 'MANAGE');
  p := public.insurance_int_lock_policy(p_policy_id, p_expected_row_version);
  perform public.insurance_int_same_project('documents', v_src, v_proj);
  -- Fase 4/B: cláusula de COBERTURA exige identificação específica (genérica não prova cobertura)
  if p_data ->> 'kind' = 'COBERTURA' and (v_ident is null or char_length(v_ident) < 2) then
    raise exception 'CLAUSE_IDENTIFIER_REQUIRED: a cláusula de cobertura exige a identificação específica no texto da apólice (ex.: Cláusula 4.2)';
  end if;
  if char_length(coalesce(v_ident, '')) > 200 then raise exception 'INVALID_INPUT: identificação da cláusula longa demais'; end if;
  insert into public.insurance_policy_clauses (project_id, policy_id, kind, title, clause_text, amount, deadline_days, applies_to, source_document_id, source_ref, source_page, verified, added_in_version, created_by, clause_identifier)
  values (v_proj, p_policy_id, p_data ->> 'kind', coalesce(p_data ->> 'title', ''), public.insurance_int_text(p_data, 'clause_text'),
    (p_data ->> 'amount')::numeric, (p_data ->> 'deadline_days')::integer,
    coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'applies_to', '[]'::jsonb)) x), '{}'),
    v_src, public.insurance_int_text(p_data, 'source_ref'), public.insurance_int_text(p_data, 'source_page'),
    coalesce((p_data ->> 'verified')::boolean, false), p.version_no + 1, v_uid, v_ident)
  returning id into v_id;
  v_no := public.insurance_int_bump_policy(p_policy_id, 'Cláusula adicionada: ' || coalesce(p_data ->> 'kind', '?'));
  perform public.insurance_int_audit(v_proj, 'INSURANCE_POLICY_CLAUSE', v_id, 'CLAUSE_ADDED',
    jsonb_build_object('policyId', p_policy_id, 'kind', p_data ->> 'kind', 'clauseIdentifier', v_ident, 'versionNo', v_no));
  return jsonb_build_object('id', v_id, 'versionNo', v_no, 'rowVersion', p_expected_row_version + 1);
end;
$$;
revoke all on function public.insurance_policy_clause_add(uuid, integer, jsonb) from public, anon;
grant execute on function public.insurance_policy_clause_add(uuid, integer, jsonb) to authenticated;
