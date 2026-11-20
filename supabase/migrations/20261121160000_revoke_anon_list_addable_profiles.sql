-- ============================================================
-- 20261121160000_revoke_anon_list_addable_profiles.sql  (endurecimento de grants)
--
-- 20261116090000 (na main, ainda NÃO aplicada no banco operacional) faz `revoke all ... from public`, mas o ACL padrão do
-- Supabase (pg_default_acl) concede EXECUTE direto a anon/authenticated/service_role: o revoke de PUBLIC não retira o de
-- anon. O corpo da função recusa quem não é administrador (risco baixo), porém uma função SECURITY DEFINER do app só deve
-- ser executável por quem a usa (o app a chama com usuário autenticado: apps/web/lib/users/addable-profiles.ts).
--
-- Migration NOVA em vez de editar a 20261116090000 (migrations já na main são imutáveis — trava #59 e rastreabilidade).
-- Idempotente e segura em qualquer ordem: só ajusta grants da função, se ela existir.
-- ============================================================

do $grants$
begin
  if to_regprocedure('public.list_addable_profiles_for_project(uuid)') is not null then
    revoke all on function public.list_addable_profiles_for_project(uuid) from public, anon;
    grant execute on function public.list_addable_profiles_for_project(uuid) to authenticated, service_role;
  end if;
end
$grants$;
