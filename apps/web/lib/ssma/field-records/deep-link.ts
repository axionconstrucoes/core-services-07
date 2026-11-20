// Link autenticado de um e-mail para UM registro de SSMA no aplicativo de campo (/ssma/[projectId]).
// O link só ABRE o registro e PRÉ-SELECIONA o formulário (registrar andamento ou concluir a ação): abrir o link nunca
// altera estado. O registro exige login, confirmação explícita e, na conclusão, evidência — validados pelo servidor.

export type SsmaRecordLinkAction = "ANDAMENTO" | "CONCLUIDA";

export interface SsmaRecordLinkTarget {
  baseUrl: string;
  projectId: string;
  recordId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS: readonly SsmaRecordLinkAction[] = ["ANDAMENTO", "CONCLUIDA"];

export function buildSsmaRecordUrl(target: SsmaRecordLinkTarget, action?: SsmaRecordLinkAction): string {
  const base = target.baseUrl.replace(/\/+$/, "");
  const query = `registro=${encodeURIComponent(target.recordId)}${action ? `&acao=${action}` : ""}`;
  return `${base}/ssma/${encodeURIComponent(target.projectId)}?${query}`;
}

/** Lê ?registro=&acao= da página. Valores fora do formato esperado são ignorados (abre a lista normal). */
export function parseSsmaRecordLink(query: { registro?: string | string[]; acao?: string | string[] }): {
  recordId: string | null;
  action: SsmaRecordLinkAction | null;
} {
  const registro = typeof query.registro === "string" ? query.registro.trim() : "";
  const acao = typeof query.acao === "string" ? query.acao.trim().toUpperCase() : "";
  const recordId = UUID.test(registro) ? registro.toLowerCase() : null;
  const action = recordId && (ACTIONS as readonly string[]).includes(acao) ? (acao as SsmaRecordLinkAction) : null;
  return { recordId, action };
}
