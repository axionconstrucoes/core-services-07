// Substituto da Server Action de PERSISTÊNCIA de Seguros (checklist RCC e sujeitos esperados) na fixture: nunca chama banco.
// Mesmo contrato do stub de seguros-actions.ts: window.__mode "ok" (padrão) ou "conflict" (VERSION_CONFLICT); toda chamada é registrada em window.__calls.
export async function runInsurancePersistence(input: { op: string }) {
  const w = window as unknown as { __mode?: string; __calls?: unknown[] };
  (w.__calls ??= []).push(input);
  if (w.__mode === "conflict") {
    return {
      ok: false as const,
      error: {
        code: "VERSION_CONFLICT",
        conflict: true,
        message: "Este registro foi alterado por outra pessoa depois que você abriu a tela. Nada foi gravado. Recarregue os dados e confira o que mudou.",
      },
    };
  }
  return { ok: true as const, result: {} };
}
