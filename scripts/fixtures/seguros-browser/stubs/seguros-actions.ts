// Substituto da Server Action de Seguros na fixture: nunca chama banco. window.__mode: "ok" (padrão) ou "conflict" (VERSION_CONFLICT).
export async function runInsuranceAction(input: { op: string }) {
  const w = window as unknown as { __mode?: string; __calls?: unknown[] };
  (w.__calls ??= []).push(input);
  if (w.__mode === "conflict") {
    return {
      ok: false as const,
      error: { code: "VERSION_CONFLICT", conflict: true, message: "Este registro foi alterado por outra pessoa depois que você abriu a tela. Nada foi gravado. Recarregue os dados, confira o que mudou e refaça a ação." },
    };
  }
  if (input.op === "draft_attempt_send") return { ok: true as const, result: { sent: false, blocked: true, reasons: ["FLAG_OFF", "NOT_APPROVED", "NO_OFFICIAL_CHANNEL", "PHASE1_NO_SEND_TRANSPORT"] } };
  return { ok: true as const, result: {} };
}
