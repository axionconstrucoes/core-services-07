// Medição de consumo das rotas de cron (CPU de processo e tempo de parede), devolvida no corpo da resposta para que o consumo
// REAL possa ser medido sem Observability Plus. process.cpuUsage() é do processo inteiro: com Fluid Compute, requisições
// simultâneas na mesma instância entram na conta (o valor é um TETO para esta chamada). Nunca inclui dados do projeto.
import { performance } from "node:perf_hooks";

export interface RouteMetrics {
  cpuMs: number;
  wallMs: number;
}

export function startRouteMetrics(): () => RouteMetrics {
  const cpu = process.cpuUsage();
  const t0 = performance.now();
  return () => {
    const used = process.cpuUsage(cpu);
    return { cpuMs: Math.round((used.user + used.system) / 1000), wallMs: Math.round(performance.now() - t0) };
  };
}
