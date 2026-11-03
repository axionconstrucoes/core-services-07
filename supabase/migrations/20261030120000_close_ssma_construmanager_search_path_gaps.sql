-- ============================================================
-- 20261030120000_close_ssma_construmanager_search_path_gaps.sql
--
-- Fecha o achado da auditoria SECURITY DEFINER (run-security-definer-
-- search-path-audit.mjs) em 12 funções criadas depois da migration
-- 20260830100000, ainda com `search_path = public` (ou `public, storage`):
--
--   SSMA (10): create_ssma_form_submission, finalize_ssma_form_submission,
--     register_ssma_submission_photo, discard_unregistered_ssma_photo,
--     can_upload_ssma_photo_object, create_ssma_accident_submission,
--     ssma_field_record_submit, ssma_field_record_register_photo,
--     ssma_corrective_action_update, can_upload_ssma_field_photo_object
--   Construmanager (2): submit_construmanager_budget_response,
--     submit_construmanager_version_impact_review
--
-- Conferido nas definições aplicadas: todo objeto do corpo já é qualificado
-- (public.*, storage.*, auth.uid()); o resto são funções/operadores de
-- pg_catalog, sempre resolvidos; não há SQL dinâmico (EXECUTE) nem tipo
-- fora de pg_catalog. Portanto a correção é só `ALTER FUNCTION ... SET
-- search_path = ''`: corpo, owner, SECURITY DEFINER e ACL ficam idênticos.
--
-- Nenhuma migration histórica é editada. Cada assinatura é validada antes
-- de qualquer alteração (a migration falha inteira se faltar alguma) e o
-- resultado é conferido ao final.
-- ============================================================

begin;

do $$
declare
  v_signatures text[] := array[
    'public.create_ssma_form_submission(uuid,text,integer,text,text,timestamptz,jsonb,jsonb,text)',
    'public.finalize_ssma_form_submission(uuid)',
    'public.register_ssma_submission_photo(uuid,uuid,text,text,text,text,bigint,text)',
    'public.discard_unregistered_ssma_photo(uuid,text)',
    'public.can_upload_ssma_photo_object(text)',
    'public.create_ssma_accident_submission(uuid,timestamptz,jsonb,jsonb)',
    'public.ssma_field_record_submit(uuid,uuid,uuid,text,text,text,text,timestamptz,timestamptz,text,uuid,date)',
    'public.ssma_field_record_register_photo(uuid,uuid,uuid,text,text,text,text,bigint,text)',
    'public.ssma_corrective_action_update(uuid,text,text,uuid)',
    'public.can_upload_ssma_field_photo_object(text)',
    'public.submit_construmanager_budget_response(uuid,uuid,text)',
    'public.submit_construmanager_version_impact_review(uuid,uuid,text,text,text,boolean,uuid)'
  ];
  v_sig text;
  v_proc regprocedure;
begin
  foreach v_sig in array v_signatures loop
    v_proc := to_regprocedure(v_sig);
    if v_proc is null then
      raise exception 'assinatura esperada inexistente: %', v_sig;
    end if;
    if not (select p.prosecdef from pg_proc p where p.oid = v_proc) then
      raise exception 'função esperada como SECURITY DEFINER: %', v_sig;
    end if;
    execute format('alter function %s set search_path = %L', v_proc, '');
  end loop;

  -- Conferência final: as 12 ficam com search_path vazio e nada mais mudou de lugar.
  foreach v_sig in array v_signatures loop
    if not exists (
      select 1 from pg_proc p
      where p.oid = to_regprocedure(v_sig)
        and p.proconfig @> array['search_path=""']
    ) then
      raise exception 'search_path não ficou vazio: %', v_sig;
    end if;
  end loop;
end
$$;

commit;
