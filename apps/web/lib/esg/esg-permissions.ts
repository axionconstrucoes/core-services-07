// Perfis do ESG (puro). Espelho TS das policies do banco (migration 20261106100000): a RLS continua sendo a autoridade;
// estas funções só decidem o que a interface oferece e o que as ações do servidor aceitam ANTES de chegar ao banco.
//   - registrar comprovação / anexar evidência: Administrador, Gerente, Gestor e Colaborador ATIVOS (Gestor = Gerente);
//   - revisar e configurar obrigações: somente Administrador ativo;
//   - Leitura: apenas consulta.
// `permission` vem de getCurrentProjectPermission (só membro ATIVO recebe valor; inativo/fora da obra = null).

import { normalizeProjectPermission } from "@/lib/users/project-permission";

export function canRegisterEsgCompliance(permission: string | null | undefined): boolean {
  const normalized = normalizeProjectPermission(permission);
  return normalized === "ADMINISTRADOR" || normalized === "GERENTE" || normalized === "COLABORADOR";
}

export function canReviewEsg(permission: string | null | undefined): boolean {
  return normalizeProjectPermission(permission) === "ADMINISTRADOR";
}

export function canConfigureEsg(permission: string | null | undefined): boolean {
  return normalizeProjectPermission(permission) === "ADMINISTRADOR";
}

export const ESG_REGISTER_DENIED_MESSAGE = "Seu perfil não registra comprovação ESG nesta obra. Perfis Leitura apenas consultam.";
export const ESG_REVIEW_DENIED_MESSAGE = "Somente o Administrador da obra revisa comprovações ESG.";
export const ESG_CONFIGURE_DENIED_MESSAGE = "Somente o Administrador da obra configura obrigações ESG.";
