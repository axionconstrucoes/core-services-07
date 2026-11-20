// Client Supabase falso (somente leitura) para os testes do contexto
// comercial — sem rede, sem banco. Suporta o subconjunto de query builder
// usado por apps/web/lib/commercial/load-commercial-context.ts
// (select/eq/in/is/order/limit + await). Filtra de verdade as linhas
// configuradas por tabela, para que o teste prove o recorte por obra.
// Registra todas as operações: qualquer insert/update/delete/upsert/rpc
// lança, provando que o carregador nunca escreve.

export function createFakeCommercialSupabase({ userId = "user-1", tables = {}, failTables = [] } = {}) {
  const calls = [];

  function builder(table) {
    const filters = [];
    let limitValue = null;
    const api = {
      select() {
        return api;
      },
      eq(column, value) {
        filters.push((row) => row[column] === value);
        return api;
      },
      in(column, values) {
        filters.push((row) => values.includes(row[column]));
        return api;
      },
      is(column, value) {
        filters.push((row) => (row[column] ?? null) === value);
        return api;
      },
      order() {
        return api;
      },
      limit(n) {
        limitValue = n;
        return api;
      },
      then(resolve, reject) {
        try {
          if (failTables.includes(table)) {
            resolve({ data: null, error: { message: `falha simulada em ${table}` } });
            return;
          }
          let rows = (tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
          if (limitValue !== null) rows = rows.slice(0, limitValue);
          resolve({ data: rows, error: null });
        } catch (error) {
          reject(error);
        }
      },
    };
    for (const forbidden of ["insert", "update", "delete", "upsert"]) {
      api[forbidden] = () => {
        throw new Error(`escrita proibida no contexto comercial: ${forbidden} em ${table}`);
      };
    }
    return api;
  }

  return {
    calls,
    auth: {
      async getUser() {
        return { data: { user: userId ? { id: userId } : null }, error: null };
      },
    },
    from(table) {
      calls.push(table);
      return builder(table);
    },
    rpc() {
      throw new Error("rpc proibida no contexto comercial");
    },
  };
}
