-- ============================================================
-- 20261123100000_acc_project_tier.sql
--
-- FASE 3 / Agente B — função central NOVA e única de nível de acesso por obra para os módulos
-- Qualidade, Garantias e Seguros: public.acc_project_tier(p_project_id) -> 'ADMIN' | 'MANAGE' | 'REGISTER' | 'READ' | 'NONE'.
--
-- Por que existe: has_project_permission / project_permission_for só distinguem 2 degraus úteis (ADMINISTRADOR = 3 vs
-- GESTOR/GERENTE/COLABORADOR/LEITURA = 1) e foram deliberadamente congeladas (testes N1/S5). Qualidade
-- (quality_can_*) e Seguros (insurance_access) criaram listas explícitas de papéis. Esta função é a ÚNICA tabela
-- papel -> nível desses módulos; os wrappers delegam a ela (migration 20261123101000).
--
-- Regras (fail-closed):
--   * somente membership com status = 'ACTIVE' no PRÓPRIO projeto consultado (inativo/pendente/outro projeto => NONE);
--   * auth.uid() nulo (anon, authenticated sem sub, service_role sem sub) => NONE;
--   * project_id nulo/inexistente => NONE; papel desconhecido => NONE (nunca "leitura por padrão");
--   * ADMINISTRADOR/ADMIN => ADMIN; GESTOR/GERENTE => MANAGE; COLABORADOR/EDITOR => REGISTER; LEITURA/VIEWER => READ.
--   * NÃO concede privilégio pela nomenclatura do papel de outro projeto nem pela área: a coluna `area` de
--     project_memberships é opcional, atribuída por administrador e NÃO é atributo de competência técnica/jurídica
--     confiável (lacuna declarada em docs/permissoes-matriz-central.md): decisões especializadas que exijam
--     competência permanecem em ADMIN até decisão do dono.
--
-- Não altera has_project_permission / project_permission_for / is_project_member / can_manage_project_documents.
-- Idempotente. Execução: somente authenticated (anon/PUBLIC sem EXECUTE).
-- ============================================================

create or replace function public.acc_project_tier(p_project_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case pm.permission
      when 'ADMINISTRADOR' then 'ADMIN'
      when 'ADMIN' then 'ADMIN'
      when 'GESTOR' then 'MANAGE'
      when 'GERENTE' then 'MANAGE'
      when 'COLABORADOR' then 'REGISTER'
      when 'EDITOR' then 'REGISTER'
      when 'LEITURA' then 'READ'
      when 'VIEWER' then 'READ'
      else 'NONE'
    end
    from public.project_memberships pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.status = 'ACTIVE'
    limit 1
  ), 'NONE');
$$;

revoke all on function public.acc_project_tier(uuid) from public, anon;
grant execute on function public.acc_project_tier(uuid) to authenticated;

comment on function public.acc_project_tier(uuid) is
  'Nível de acesso do usuário autenticado na obra (ADMIN/MANAGE/REGISTER/READ/NONE) para Qualidade, Garantias e Seguros. Fonte única; fail-closed; membership ACTIVE do próprio projeto. Fase 3/B — 20261123100000.';
