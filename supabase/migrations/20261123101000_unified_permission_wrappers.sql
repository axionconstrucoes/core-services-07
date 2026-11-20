-- ============================================================
-- 20261123101000_unified_permission_wrappers.sql
--
-- FASE 3 / Agente B — quality_can_read/register/manage e insurance_access passam a DELEGAR a
-- public.acc_project_tier (20261123100000). Redefinição (create or replace) das versões de 20261122100000 e
-- 20261122200000: MESMAS assinaturas, language sql, stable, security definer, search_path = '' e MESMOS GRANTs.
-- Esta migration é a definição vigente (a mais recente) destas funções — o teste N1 S1 continua válido.
--
-- Comportamento (documentado em docs/permissoes-matriz-central.md):
--   * IDÊNTICO para todos os papéis hoje possíveis (CHECK: ADMINISTRADOR, GESTOR, GERENTE, COLABORADOR, LEITURA):
--       read     = qualquer membro ACTIVE;  register = ADMINISTRADOR/GESTOR/GERENTE/COLABORADOR;
--       manage   = ADMINISTRADOR/GESTOR/GERENTE;  admin (insurance) = ADMINISTRADOR.
--   * Diferenças só em valores de papel INALCANÇÁVEIS por constraint (legados/desconhecidos):
--       - quality_can_read: papel desconhecido deixava de ser "nenhum acesso"? Antes: qualquer papel não nulo lia.
--         Agora: papel desconhecido => NONE (fail-closed). Legados ADMIN/EDITOR/VIEWER continuam mapeados.
--       - quality_can_register: passa a aceitar os legados ADMIN/EDITOR (como insurance_access já fazia).
--   * insurance_access com p_level desconhecido continua false.
--   * quality_role_for NÃO é alterada (continua devolvendo o papel bruto para quem precisar exibi-lo).
-- ============================================================

create or replace function public.quality_can_read(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.acc_project_tier(p_project_id) in ('READ', 'REGISTER', 'MANAGE', 'ADMIN');
$$;

create or replace function public.quality_can_register(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.acc_project_tier(p_project_id) in ('REGISTER', 'MANAGE', 'ADMIN');
$$;

create or replace function public.quality_can_manage(p_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.acc_project_tier(p_project_id) in ('MANAGE', 'ADMIN');
$$;

revoke all on function public.quality_can_read(uuid), public.quality_can_register(uuid),
  public.quality_can_manage(uuid) from public, anon;
grant execute on function public.quality_can_read(uuid), public.quality_can_register(uuid),
  public.quality_can_manage(uuid) to authenticated, service_role;

create or replace function public.insurance_access(p_project_id uuid, p_level text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_level
    when 'READ' then public.acc_project_tier(p_project_id) in ('READ', 'REGISTER', 'MANAGE', 'ADMIN')
    when 'REGISTER' then public.acc_project_tier(p_project_id) in ('REGISTER', 'MANAGE', 'ADMIN')
    when 'MANAGE' then public.acc_project_tier(p_project_id) in ('MANAGE', 'ADMIN')
    when 'ADMIN' then public.acc_project_tier(p_project_id) = 'ADMIN'
    else false
  end;
$$;

revoke all on function public.insurance_access(uuid, text) from public, anon;
grant execute on function public.insurance_access(uuid, text) to authenticated;

comment on function public.insurance_access(uuid, text) is
  'Papel do usuário autenticado na obra para seguros/garantias (READ/REGISTER/MANAGE/ADMIN). Delega a acc_project_tier. Fail-closed.';
comment on function public.quality_can_read(uuid) is 'Lê Qualidade/Garantias: membro ACTIVE (acc_project_tier <> NONE).';
comment on function public.quality_can_register(uuid) is 'Registra evidências/solicitações: tier REGISTER ou superior.';
comment on function public.quality_can_manage(uuid) is 'Gere/decide ocorrências do próprio projeto: tier MANAGE ou ADMIN.';
