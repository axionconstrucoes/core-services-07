-- ROLLBACK (manual, NAO e migration) de 20261125200000_insurance_coherence.sql (Fase 6/H5).
-- Transacional e idempotente. Recusa (ROLLBACK_BLOCKED) se houver dados/evidencia que seriam apagados. NUNCA toca record_risk_alert_action.
-- Ordem: guardas -> gatilhos/politicas -> views -> tabelas novas -> funcoes novas -> funcoes restauradas -> indices -> constraints -> colunas.
begin;
do $$
declare r record; n bigint;
begin
  if to_regclass('public.insurance_instrument_terms') is not null then
    select count(*) into n from public.insurance_instrument_terms;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_instrument_terms tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
  if to_regclass('public.insurance_coherence_justifications') is not null then
    select count(*) into n from public.insurance_coherence_justifications;
    if n > 0 then raise exception 'ROLLBACK_BLOCKED: public.insurance_coherence_justifications tem % linha(s) (dados/evidencia); exporte e remova manualmente com autorizacao', n; end if;
  end if;
end $$;
drop table if exists public.insurance_coherence_justifications;
drop table if exists public.insurance_instrument_terms;
drop function if exists public.f4b_norm_text(text);
drop function if exists public.f4b_tax_digits(text);
drop function if exists public.f4b_party_equal(text, text, text, text);
drop function if exists public.insurance_instrument_terms_save(uuid, text, uuid, jsonb);
drop function if exists public.insurance_int_coherence(uuid, uuid);
drop function if exists public.insurance_coherence_check(uuid, uuid);
drop function if exists public.insurance_coherence_justify(uuid, text, text, text, uuid);
-- restaura insurance_draft_approve(uuid, integer, text) com o corpo de 20261122201000_seguros_garantias_rpcs
create or replace function public.insurance_draft_approve(p_id uuid, p_expected_row_version integer, p_confirmation text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.insurance_drafts%rowtype;
  v_uid uuid;
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
  update public.insurance_drafts set state = 'APROVADA_PARA_ENVIO', approved_by = v_uid, approved_at = now(), approved_body_hash = md5(body),
      row_version = row_version + 1, updated_at = now() where id = p_id;
  perform public.insurance_int_audit(d.project_id, 'INSURANCE_DRAFT', p_id, 'DRAFT_APPROVED_FOR_SEND',
    jsonb_build_object('bodyHash', md5(d.body), 'realSendPerformed', false, 'note', 'Aprovação humana expressa registrada. NÃO envia: trava de envio real permanece fail-closed.'));
  return jsonb_build_object('id', p_id, 'state', 'APROVADA_PARA_ENVIO', 'sent', false, 'rowVersion', d.row_version + 1);
end;
$$;
drop index if exists public.insurance_instrument_terms_policy_idx;
drop index if exists public.insurance_instrument_terms_draft_idx;
drop index if exists public.insurance_coherence_just_draft_idx;
commit;
