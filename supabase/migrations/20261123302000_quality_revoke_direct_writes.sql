-- ============================================================
-- 20261123302000_quality_revoke_direct_writes.sql
--
-- FASE 3 / Frente D (3/4) — fecha a escrita DIRETA (INSERT/UPDATE por PostgREST) de `authenticated` nas tabelas de Qualidade e
-- Garantias: a partir daqui os registros-filhos só mudam pelas RPCs transacionais da migration 20261123301000
-- (quality_evidence_register, quality_capa_*, quality_verification_register, quality_warranty_*_register, ...).
--
-- Seguro e REVERSÍVEL:
--   * só REVOKE de privilégios de `authenticated` (SELECT permanece; leitura e RLS de leitura intactas);
--   * as policies de INSERT/UPDATE são MANTIDAS (ficam inertes sem o GRANT): reverter = devolver os GRANTs
--     (supabase/rollbacks/20261123302000_quality_revoke_direct_writes.rollback.sql);
--   * nenhuma coluna removida, nenhum dado apagado; as RPCs da fase 1 (SECURITY DEFINER) seguem funcionando;
--   * service_role mantém os privilégios (BYPASSRLS), mas triggers de integridade (20261123300000) continuam valendo.
-- Pré-requisito: aplicar 20261123300000 e 20261123301000 antes (e publicar a versão do app que chama as RPCs).
-- Idempotente.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array[
    'quality_requirements', 'quality_ncrs', 'quality_warranty_cases', 'quality_customer_complaints',
    'quality_inspections', 'quality_tests', 'quality_evidence', 'quality_corrective_actions',
    'quality_warranty_maintenance', 'quality_warranty_surveys', 'quality_warranty_repairs',
    'quality_effectiveness_verifications', 'quality_recurrences', 'quality_nonquality_costs', 'quality_consequences']
  loop
    execute format('revoke insert, update, delete, truncate on table public.%I from authenticated', t);
  end loop;
end $$;

comment on table public.quality_evidence is
  'Evidências ligadas à fonte original (source_table/source_ref/source_url imutáveis; nunca apagadas). Escrita só por quality_evidence_register / quality_evidence_revise (fase 3/D).';
comment on table public.quality_corrective_actions is
  'CAPA. Escrita só por quality_capa_register / quality_capa_update_status (fase 3/D).';
