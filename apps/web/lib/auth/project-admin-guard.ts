import "server-only";

import { notFound } from "next/navigation";
import { isProjectAdmin } from "@/lib/email-authorization/guard";

export const ADMIN_ONLY_MESSAGE = "Somente administradores da obra podem fazer isso.";

/**
 * Guarda de SERVIDOR das telas exclusivas de administrador (Eventos, Integrações, Usuários, Autorizações,
 * Start-up ACC). Esconder o item do menu não basta: páginas e Server Actions chamam isto, com o mesmo
 * critério do layout (vínculo ATIVO com permissão ADMINISTRADOR em project_memberships).
 */
export async function requireProjectAdminPage(projectId: string): Promise<void> {
  if (!(await isProjectAdmin(projectId)).isAdmin) notFound();
}

/** Para Server Actions que já tratam erro por exceção (try/catch → estado de erro). */
export async function assertProjectAdmin(projectId: string): Promise<void> {
  if (!(await isProjectAdmin(projectId)).isAdmin) throw new Error(ADMIN_ONLY_MESSAGE);
}

/** Para Server Actions que devolvem o estado de erro diretamente. */
export async function isProjectAdminForAction(projectId: string): Promise<boolean> {
  return (await isProjectAdmin(projectId)).isAdmin;
}
