// Limite simples por usuário, em memória (melhor esforço em ambiente serverless: cada instância tem o seu
// contador). Serve para conter cliques repetidos e abuso acidental; o controle de custo real é a camada
// gratuita (F0) do serviço de voz, que não cobra ao esgotar.

const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function allowRequest(key: string, limit: number, now: number = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}
