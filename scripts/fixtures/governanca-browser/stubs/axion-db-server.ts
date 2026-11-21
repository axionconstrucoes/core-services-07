// FIXTURE: cliente Supabase FALSO (nenhuma rede). Lê as tabelas de window.__fx (dados SINTÉTICOS da cena), registra as chamadas de RPC em
// window.__rpc e devolve sucesso (ou o erro de window.__rpcError). Serve só para montar as telas REAIS e conferir os parâmetros enviados.
declare global {
  interface Window {
    __fx?: { me: string; tables: Record<string, unknown[]>; designated?: boolean };
    __rpc?: Array<{ fn: string; args: Record<string, unknown> }>;
    __rpcError?: string | null;
  }
}
function query(table: string) {
  const rows = () => (window.__fx?.tables[table] ?? []) as unknown[];
  const q: Record<string, unknown> = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: () => q,
    in: (_col: string, ids: string[]) => {
      const r = (rows() as Array<{ id: string }>).filter((x) => ids.includes(x.id));
      return { then: (resolve: (v: unknown) => unknown) => resolve({ data: r, error: null }) };
    },
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null }),
  };
  return q;
}
export async function createSupabaseServerClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: window.__fx?.me ?? "" } }, error: null }) },
    from: (table: string) => query(table),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      if (fn === "acc_am_designated_competence_validator") return { data: window.__fx?.designated === true, error: null };
      (window.__rpc ??= []).push({ fn, args });
      if (window.__rpcError) return { data: null, error: { message: window.__rpcError } };
      return { data: { ok: true }, error: null };
    },
  };
}
