// Substituto da Server Action de COMPETÊNCIAS na fixture: nunca chama banco. Toda chamada é registrada em window.__calls.
export async function runCompetenceAction(input: { op: string }) {
  const w = window as unknown as { __mode?: string; __calls?: unknown[] };
  (w.__calls ??= []).push(input);
  if (w.__mode === "conflict") return { ok: false as const, error: { code: "VERSION_CONFLICT", conflict: true, message: "Este registro foi alterado por outra pessoa depois que você abriu a tela." } };
  return { ok: true as const, result: {} };
}
