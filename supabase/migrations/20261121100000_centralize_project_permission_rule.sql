-- ============================================================
-- 20261121100000_centralize_project_permission_rule.sql
--
-- Frente N1 (segurança/permissões): UMA ÚNICA FONTE para a regra de permissão por obra.
--
-- Antes desta migration a mesma regra existia duas vezes:
--   - has_project_permission(projeto, mínimo) / is_project_member(projeto) — usuário = auth.uid()
--     (corpos vigentes: 20260829200000 e 20260824090000);
--   - project_permission_for(projeto, usuário, mínimo) / project_member_active_for(projeto, usuário) — usuário
--     explícito (20261120160000), cópia da tabela de níveis de 20260829200000 para os núcleos com ator explícito
--     (respostas por e-mail processadas pelo worker).
-- Uma correção futura em só uma das cópias divergiria silenciosamente. Agora as versões com auth.uid() DELEGAM às
-- versões com usuário explícito; a tabela de níveis fica somente em project_permission_for.
--
-- Nenhum resultado muda (teste de equivalência exaustivo em scripts/test-n1-permission-centralization-sql.mjs):
--   papel atual  ADMINISTRADOR/ADMIN = 3; GESTOR/GERENTE/COLABORADOR/LEITURA/EDITOR/VIEWER = 1; outro = 0
--   mínimo       ADMINISTRADOR/ADMIN = 3; GESTOR/GERENTE/COLABORADOR/EDITOR = 2; LEITURA/VIEWER = 1; outro = 999
--   somente status 'ACTIVE'; auth.uid() nulo => false (exists sobre user_id = null é vazio).
--
-- Preservado: assinaturas, language sql, stable, security definer, search_path = '' e os privilégios (create or
-- replace mantém dono e ACL: anon continua sem EXECUTE desde 20261101100000; project_permission_for e
-- project_member_active_for continuam sem EXECUTE para public/anon/authenticated — a chamada interna roda com os
-- privilégios do dono, por ser security definer). Assinatura e semântica de project_permission_for(uuid, uuid, text) e
-- project_member_active_for(uuid, uuid) NÃO mudam (outras frentes dependem delas).
-- ============================================================

create or replace function public.has_project_permission(
  p_project_id uuid,
  p_min text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Fonte única da regra: public.project_permission_for (20261120160000). coalesce: defesa em profundidade.
  select coalesce(public.project_permission_for(p_project_id, auth.uid(), p_min), false);
$$;

create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Fonte única da regra: public.project_member_active_for (20261120160000).
  select coalesce(public.project_member_active_for(p_project_id, auth.uid()), false);
$$;

comment on function public.has_project_permission(uuid, text) is
  'Permissão do usuário autenticado (auth.uid()) na obra. Delega a project_permission_for (fonte única da tabela de níveis) — 20261121100000.';
comment on function public.is_project_member(uuid) is
  'Membro ACTIVE (auth.uid()) da obra. Delega a project_member_active_for (fonte única) — 20261121100000.';
