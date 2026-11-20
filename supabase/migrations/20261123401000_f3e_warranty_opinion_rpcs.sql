-- ============================================================
-- 20261123401000_f3e_warranty_opinion_rpcs.sql
--
-- FASE 3 / Agente E — verificação SQL da derivação da cobertura de garantia e RPCs do parecer.
--
--   quality_warranty_coverage_check(items, signals)   IMMUTABLE — reimplementa em SQL a derivação determinística de
--       apps/web/lib/ai/legal/warranty-coverage.ts (deriveWarrantyCoverage + validateWarrantyItems). A paridade TS x SQL é provada
--       por scripts/test-f3e-persistencia-realpg.mjs (grade de combinações). NÃO é parecer jurídico.
--   quality_warranty_opinion_save(...)                REGISTER+ (quality_can_register). O servidor TS recalcula a conclusão; o banco
--       RECALCULA de novo e rejeita qualquer divergência (CONCLUSION_MISMATCH): conclusão digitada livremente é impossível.
--       Append-only: cada reavaliação é uma NOVA versão (supersedes_id); VERSION_CONFLICT se a versão esperada não é a última.
--   quality_warranty_opinion_versions(case)           READ+ (quality_can_read): lista as versões (mais recente primeiro).
--
-- Limites declarados: a verificação de linguagem proibida (cinco anos universal / exclusão automática por expiração) continua no
-- servidor TS (validateWarrantyCoverageOutput); o banco garante estrutura, fonte por item, conclusão derivada e consistência.
-- Idempotente. Auditoria na MESMA transação (audit_log_entries). Nenhuma migration existente é alterada.
-- ============================================================

create or replace function public.quality_warranty_coverage_check(p_items jsonb, p_signals jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  c_keys text[] := array['natureza-produto-servico', 'tipo-defeito', 'data-entrega', 'data-descoberta', 'data-comunicacao',
    'documentos-analisados', 'garantia-contratual', 'garantia-legal-potencial', 'vicio-oculto', 'prazo-reclamacao',
    'prazo-decadencial', 'prazo-prescricional', 'responsabilidade-potencial', 'exigencias-manutencao', 'fundamentacao',
    'providencia-recomendada'];
  c_optional text[] := array['prazo-decadencial', 'prazo-prescricional'];
  c_core text[] := array['natureza-produto-servico', 'tipo-defeito', 'data-entrega', 'data-descoberta', 'data-comunicacao',
    'documentos-analisados', 'providencia-recomendada'];
  v_problems text[] := '{}';
  v_sig_problems text[] := '{}';
  v_seen text[] := '{}';
  v_filled text[] := '{}';
  v_missing_core text[] := '{}';
  v_item jsonb;
  v_key text;
  v_status text;
  v_val text;
  v_ev text;
  v_pos integer;
  v_prev integer := 0;
  v_k text;
  v_conclusion text;
  v_cond integer := 0;
  v_contract text; v_legal text; v_hidden text; v_deadline text; v_maint text; v_controversy boolean;
begin
  -- ---------- sinais ----------
  if p_signals is null or jsonb_typeof(p_signals) <> 'object' then
    v_sig_problems := array_append(v_sig_problems, 'sinais ausentes');
  else
    v_contract := p_signals ->> 'contractualWarranty';
    v_legal := p_signals ->> 'legalWarrantyPotential';
    v_hidden := p_signals ->> 'hiddenDefect';
    v_deadline := p_signals ->> 'claimDeadline';
    v_maint := p_signals ->> 'maintenance';
    if v_contract is null or v_contract not in ('VIGENTE', 'DECORRIDA', 'NAO_PREVISTA', 'NAO_INFORMADA') then v_sig_problems := array_append(v_sig_problems, 'contractualWarranty inválido'); end if;
    if v_legal is null or v_legal not in ('SIM', 'NAO', 'INDETERMINADO') then v_sig_problems := array_append(v_sig_problems, 'legalWarrantyPotential inválido'); end if;
    if v_hidden is null or v_hidden not in ('SIM', 'NAO', 'INDETERMINADO') then v_sig_problems := array_append(v_sig_problems, 'hiddenDefect inválido'); end if;
    if v_deadline is null or v_deadline not in ('DENTRO', 'FORA', 'INDETERMINADO') then v_sig_problems := array_append(v_sig_problems, 'claimDeadline inválido'); end if;
    if v_maint is null or v_maint not in ('COMPROVADA', 'NAO_COMPROVADA', 'NAO_EXIGIDA', 'SEM_DADOS') then v_sig_problems := array_append(v_sig_problems, 'maintenance inválido'); end if;
    if jsonb_typeof(p_signals -> 'legalControversy') is distinct from 'boolean' then v_sig_problems := array_append(v_sig_problems, 'legalControversy inválido');
    else v_controversy := (p_signals ->> 'legalControversy')::boolean; end if;
  end if;

  -- ---------- itens (validateWarrantyItems) ----------
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    v_problems := array_append(v_problems, 'itens ausentes');
  else
    for v_item in select value from jsonb_array_elements(p_items) loop
      if jsonb_typeof(v_item) <> 'object' then v_problems := array_append(v_problems, 'item inválido'); continue; end if;
      v_key := v_item ->> 'key';
      v_status := v_item ->> 'status';
      v_val := btrim(coalesce(v_item ->> 'value', ''));
      v_ev := btrim(coalesce(v_item ->> 'evidence', ''));
      if v_key = any (v_seen) then v_problems := array_append(v_problems, 'item duplicado: ' || v_key); end if;
      v_seen := array_append(v_seen, v_key);
      v_pos := array_position(c_keys, v_key);
      if v_pos is null then v_problems := array_append(v_problems, 'item desconhecido: ' || coalesce(v_key, '?')); continue; end if;
      if v_status is null or v_status not in ('PREENCHIDO', 'SEM_DADOS', 'NAO_APLICAVEL') then
        v_problems := array_append(v_problems, 'item ' || v_key || ' com status inválido'); continue;
      end if;
      if v_status = 'PREENCHIDO' then
        if v_val = '' or v_ev = '' then v_problems := array_append(v_problems, 'item ' || v_key || ' PREENCHIDO sem valor/evidência'); end if;
        v_filled := array_append(v_filled, v_key);
      elsif v_status = 'NAO_APLICAVEL' then
        if not (v_key = any (c_optional)) or v_ev = '' then
          v_problems := array_append(v_problems, 'item ' || v_key || ': NAO_APLICAVEL só para itens ''quando cabível'' e com justificativa');
        end if;
      end if;
      if v_pos < v_prev then v_problems := array_append(v_problems, 'itens fora da ordem 1–16'); end if;
      v_prev := v_pos;
    end loop;
    foreach v_k in array c_keys loop
      if not (v_k = any (v_seen)) then v_problems := array_append(v_problems, 'item ausente: ' || v_k); end if;
    end loop;
  end if;

  foreach v_k in array c_core loop
    if not (v_k = any (v_filled)) then v_missing_core := array_append(v_missing_core, v_k); end if;
  end loop;

  if cardinality(v_sig_problems) > 0 then
    return jsonb_build_object('conclusion', null, 'route', null, 'problems', to_jsonb(v_problems), 'signalProblems', to_jsonb(v_sig_problems),
      'missingCore', to_jsonb(v_missing_core));
  end if;

  -- ---------- derivação (deriveWarrantyCoverage) ----------
  if cardinality(v_problems) > 0 or cardinality(v_missing_core) > 0 then
    v_conclusion := 'INFORMAÇÕES INSUFICIENTES';
  else
    v_cond := (case when v_controversy then 1 else 0 end)
      + (case when v_legal = 'INDETERMINADO' then 1 else 0 end)
      + (case when v_hidden = 'INDETERMINADO' then 1 else 0 end)
      + (case when v_deadline = 'INDETERMINADO' then 1 else 0 end)
      + (case when v_maint = 'NAO_COMPROVADA' then 1 else 0 end)
      + (case when v_maint = 'SEM_DADOS' then 1 else 0 end)
      + (case when v_hidden = 'SIM' then 1 else 0 end)
      + (case when v_contract = 'NAO_INFORMADA' then 1 else 0 end);
    if v_cond > 0 then
      v_conclusion := 'COBERTURA CONDICIONADA';
    elsif v_contract in ('DECORRIDA', 'NAO_PREVISTA') and v_legal = 'NAO' and v_hidden = 'NAO' and v_deadline = 'FORA'
          and 'fundamentacao' = any (v_filled) then
      v_conclusion := 'POTENCIALMENTE NÃO COBERTO';
    elsif v_deadline = 'DENTRO' and (v_legal = 'SIM' or v_contract = 'VIGENTE') then
      v_conclusion := 'POTENCIALMENTE COBERTO';
    else
      v_conclusion := 'COBERTURA CONDICIONADA';
    end if;
  end if;

  return jsonb_build_object('conclusion', v_conclusion, 'route', v_controversy, 'problems', to_jsonb(v_problems),
    'signalProblems', '[]'::jsonb, 'missingCore', to_jsonb(v_missing_core));
end;
$$;
revoke all on function public.quality_warranty_coverage_check(jsonb, jsonb) from public, anon;
grant execute on function public.quality_warranty_coverage_check(jsonb, jsonb) to authenticated;
comment on function public.quality_warranty_coverage_check(jsonb, jsonb) is
  'Reimplementa em SQL a derivação determinística da cobertura de garantia (16 itens + sinais). Pura (sem I/O). Apoio à decisão humana — NÃO é parecer jurídico.';

-- ---------- Salvar uma NOVA versão do parecer ----------
create or replace function public.quality_warranty_opinion_save(
  p_case_id uuid,
  p_items jsonb,
  p_signals jsonb,
  p_conclusion text,
  p_reasons jsonb,
  p_missing jsonb,
  p_references_snapshot jsonb,
  p_references_version text,
  p_engine_version text,
  p_expected_version integer,
  p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
  v_check jsonb;
  v_prev_id uuid;
  v_prev_no integer;
  v_new_id uuid;
  v_audit_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_el jsonb;
  v_problem text;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select project_id into v_project from public.quality_warranty_cases where id = p_case_id;
  -- caso inexistente e caso de outro projeto são indistinguíveis (sem vazar existência)
  if v_project is null or not public.quality_can_register(v_project) then raise exception 'FORBIDDEN'; end if;
  if p_expected_version is null or p_expected_version < 0 then raise exception 'EXPECTED_VERSION_REQUIRED'; end if;
  if p_engine_version is null or char_length(btrim(p_engine_version)) = 0 then raise exception 'ENGINE_VERSION_REQUIRED'; end if;
  if v_note is not null and char_length(v_note) > 4000 then raise exception 'INVALID_INPUT: nota longa demais'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or octet_length(p_items::text) > 200000 then raise exception 'INVALID_ITEMS: itens ausentes ou grandes demais'; end if;
  if p_signals is null or jsonb_typeof(p_signals) <> 'object' then raise exception 'INVALID_SIGNALS: sinais ausentes'; end if;
  if jsonb_typeof(coalesce(p_reasons, '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_missing, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_references_snapshot, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_INPUT: razões, faltantes e referências devem ser listas';
  end if;
  for v_el in select value from jsonb_array_elements(coalesce(p_references_snapshot, '[]'::jsonb)) loop
    if jsonb_typeof(v_el) <> 'object' or nullif(btrim(coalesce(v_el ->> 'id', '')), '') is null
       or nullif(btrim(coalesce(v_el ->> 'verification', '')), '') is null then
      raise exception 'INVALID_INPUT: cada referência precisa de id e estado de verificação';
    end if;
  end loop;

  -- reverificação: estrutura, fonte por item, sinais e conclusão DERIVADA
  v_check := public.quality_warranty_coverage_check(p_items, p_signals);
  if jsonb_array_length(v_check -> 'signalProblems') > 0 then
    raise exception 'INVALID_SIGNALS: %', v_check -> 'signalProblems' ->> 0;
  end if;
  if jsonb_array_length(v_check -> 'problems') > 0 then
    v_problem := v_check -> 'problems' ->> 0;
    if v_problem like '%sem valor/evidência%' then raise exception 'ITEM_SOURCE_REQUIRED: %', v_problem; end if;
    raise exception 'INVALID_ITEMS: %', v_problem;
  end if;
  if p_conclusion is distinct from (v_check ->> 'conclusion') then
    raise exception 'CONCLUSION_MISMATCH: informada %, derivada %', coalesce(p_conclusion, '(nula)'), v_check ->> 'conclusion';
  end if;

  -- serializa as versões do mesmo caso (sem bloquear transições do caso)
  perform pg_advisory_xact_lock(hashtextextended('f3e-opinion:' || p_case_id::text, 0));
  select id, version_no into v_prev_id, v_prev_no
    from public.quality_warranty_coverage_opinions where warranty_case_id = p_case_id order by version_no desc limit 1;
  if p_expected_version <> coalesce(v_prev_no, 0) then
    raise exception 'VERSION_CONFLICT: esperado %, atual %', p_expected_version, coalesce(v_prev_no, 0);
  end if;

  insert into public.quality_warranty_coverage_opinions (project_id, warranty_case_id, version_no, engine_version, items, signals,
    conclusion, reasons, missing, legal_controversy, route_to_human, references_snapshot, references_version, note, supersedes_id, created_by)
  values (v_project, p_case_id, coalesce(v_prev_no, 0) + 1, btrim(p_engine_version), p_items, p_signals,
    v_check ->> 'conclusion', coalesce(p_reasons, '[]'::jsonb), coalesce(p_missing, '[]'::jsonb),
    (p_signals ->> 'legalControversy')::boolean, (v_check ->> 'route')::boolean,
    coalesce(p_references_snapshot, '[]'::jsonb), nullif(btrim(coalesce(p_references_version, '')), ''), v_note, v_prev_id, v_uid)
  returning id into v_new_id;

  insert into public.audit_log_entries (project_id, actor_type, actor_user_id, action, entity_type, entity_id, detail)
  values (v_project, 'USER', v_uid, 'QUALITY_WARRANTY_COVERAGE_OPINION_SAVED', 'QUALITY_WARRANTY', p_case_id::text,
    jsonb_build_object('opinionId', v_new_id, 'versionNo', coalesce(v_prev_no, 0) + 1, 'supersedesId', v_prev_id,
      'conclusion', v_check ->> 'conclusion', 'engineVersion', btrim(p_engine_version), 'derivedBy', 'SERVER_TS_SQL_VERIFIED',
      'note', 'Apoio à decisão humana; NÃO é parecer jurídico.')::text)
  returning id into v_audit_id;

  return jsonb_build_object('ok', true, 'id', v_new_id, 'versionNo', coalesce(v_prev_no, 0) + 1, 'supersedesId', v_prev_id,
    'conclusion', v_check ->> 'conclusion', 'auditId', v_audit_id);
end;
$$;

-- ---------- Listar as versões do parecer (mais recente primeiro) ----------
create or replace function public.quality_warranty_opinion_versions(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_project uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select project_id into v_project from public.quality_warranty_cases where id = p_case_id;
  if v_project is null or not public.quality_can_read(v_project) then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'versionNo', o.version_no, 'engineVersion', o.engine_version, 'items', o.items, 'signals', o.signals,
      'conclusion', o.conclusion, 'reasons', o.reasons, 'missing', o.missing, 'legalControversy', o.legal_controversy,
      'routeToHuman', o.route_to_human, 'referencesSnapshot', o.references_snapshot, 'referencesVersion', o.references_version,
      'derivedBy', o.derived_by, 'note', o.note, 'supersedesId', o.supersedes_id, 'createdBy', o.created_by, 'createdAt', o.created_at)
      order by o.version_no desc)
    from public.quality_warranty_coverage_opinions o
    where o.warranty_case_id = p_case_id and o.project_id = v_project), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'quality_warranty_opinion_save(uuid,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,integer,text)',
    'quality_warranty_opinion_versions(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

comment on function public.quality_warranty_opinion_save(uuid, jsonb, jsonb, text, jsonb, jsonb, jsonb, text, text, integer, text) is
  'Grava nova versão (append-only) do parecer de cobertura de garantia. REGISTER+. Conclusão sempre reverificada (derivada); divergência => CONCLUSION_MISMATCH. NÃO é parecer jurídico.';
