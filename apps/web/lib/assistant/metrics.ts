// Contadores AGREGADOS da AXIA (sem conteúdo): quantas respostas foram locais, quantas recusas por escopo, quantas chamadas
// pagas e quanto custo potencial foi evitado. Nunca recebe nem guarda pergunta, resposta, usuário ou obra: só o NOME da rota.
//
// Saída: (1) contadores em memória por instância (getAxiaMetrics) e (2) UMA linha de log por resposta, só com o nome da rota
// (`[axia-metricas] rota=...`), que o log da Vercel agrega. Contadores persistentes entre instâncias exigiriam uma tabela nova
// (migration separada, não incluída aqui).

export type AxiaRoute =
  | "social_local"
  | "bypass_local"
  | "clarify_local"
  | "projeto_local"
  | "especialista_local"
  | "caso_local"
  | "pendente_local"
  | "prazo_local"
  | "escopo_local"
  | "qa_local"
  | "fallback_local"
  | "ia_consulta"
  | "ia_falha_base";

/** Rotas que respondem SEM chamada paga (cada uma evita, no mínimo, o custo médio de uma chamada). */
const LOCAL_ROUTES: ReadonlySet<AxiaRoute> = new Set<AxiaRoute>([
  "social_local", "bypass_local", "clarify_local", "projeto_local", "especialista_local", "caso_local", "pendente_local",
  "prazo_local", "escopo_local", "qa_local", "fallback_local", "ia_falha_base",
]);

const counters = new Map<AxiaRoute, number>();

export function recordAxiaRoute(route: AxiaRoute): void {
  counters.set(route, (counters.get(route) ?? 0) + 1);
  console.info(`[axia-metricas] rota=${route}`);
}

export function resetAxiaMetrics(): void {
  counters.clear();
}

export interface AxiaMetricsSnapshot {
  total: number;
  porRota: Record<string, number>;
  respostasLocais: number;
  recusasPorEscopo: number;
  chamadasPagas: number;
  /** Custo potencial evitado: respostas locais × custo médio por chamada informado. */
  custoEvitadoUsd: number;
}

export function getAxiaMetrics(avgCallCostUsd = 0.00056): AxiaMetricsSnapshot {
  const porRota: Record<string, number> = {};
  let total = 0, locais = 0;
  for (const [route, n] of counters) {
    porRota[route] = n;
    total += n;
    if (LOCAL_ROUTES.has(route)) locais += n;
  }
  return {
    total,
    porRota,
    respostasLocais: locais,
    recusasPorEscopo: counters.get("escopo_local") ?? 0,
    chamadasPagas: counters.get("ia_consulta") ?? 0,
    custoEvitadoUsd: locais * avgCallCostUsd,
  };
}
