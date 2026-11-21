// Substituto das Server Actions de Garantias na fixture de navegador: nunca chama banco. Registra as chamadas em window.__calls.
// window.__mode: "ok" (padrão) | "conflict" (VERSION_CONFLICT) | "internal" (MANIFESTANT_IS_INTERNAL, recusa do banco).
type W = { __mode?: string; __calls?: unknown[] };
async function run(name: string, args: unknown[]) {
  const w = window as unknown as W;
  (w.__calls ??= []).push({ op: name, args });
  if (w.__mode === "conflict") return { ok: false as const, code: "VERSION_CONFLICT", message: "O caso foi alterado por outra pessoa ou por outra aba. Nada foi gravado: recarregue para ver a versão atual e refaça a ação." };
  if (w.__mode === "internal") return { ok: false as const, code: "MANIFESTANT_IS_INTERNAL", message: "O manifestante não pode ser quem registra nem membro do projeto: um lançamento interno não substitui a manifestação do cliente." };
  return { ok: true as const, rowVersion: 9, id: "x" };
}
export const addEvidenceAction = (...a: unknown[]) => run("addEvidenceAction", a);
export const addMaintenanceAction = (...a: unknown[]) => run("addMaintenanceAction", a);
export const addRepairAction = (...a: unknown[]) => run("addRepairAction", a);
export const addSurveyAction = (...a: unknown[]) => run("addSurveyAction", a);
export const proveAcceptanceAction = (...a: unknown[]) => run("proveAcceptanceAction", a);
export const registerAcceptanceAction = (...a: unknown[]) => run("registerAcceptanceAction", a);
export const registerVerificationAction = (...a: unknown[]) => run("registerVerificationAction", a);
