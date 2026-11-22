// Converte a base por aba (fonte única de ./index) em entradas da base de respostas da AXIA.
//
// SEPARAÇÃO AXIA x ESPECIALISTAS: estas entradas só ensinam a USAR as telas. Não contêm análise contratual ou técnica e
// nenhum especialista (lib/ai, lib/risk-alerts, experts) importa este módulo. As guardas determinísticas (guards.ts, scope.ts)
// continuam rodando ANTES de qualquer uma destas entradas e este arquivo não as altera.
//
// Não define `manualSection`: assim as entradas não ganham a prioridade extra das respostas aprovadas do lote 1 e nunca
// passam à frente delas (as entradas aprovadas e as do tutorial continuam vencendo em caso de empate).
import type { AssistantEntry, AssistantLink } from "../knowledge";
import { ITENS_CONHECIMENTO } from "./index";
import type { ItemConhecimento } from "./tipos";

/** Mesma normalização da AXIA (minúsculas, sem acento, sem pontuação); local para não criar importação circular com answer.ts. */
function normalizar(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9s-]/g, " ").replace(/s+/g, " ").trim();
}

/** Prefixo dos ids das entradas geradas (usado pelos testes e para identificar a origem). */
export const ABA_ENTRY_PREFIX = "aba-";

/** Caminho do link da AXIA (relativo à obra, sem barra inicial) para uma rota "/[projectId]/..."; null se não houver tela fixa. */
export function linkPathDaRota(rota: string | undefined): string | null {
  if (!rota || !rota.startsWith("/[projectId]/")) return null;
  const path = rota.slice("/[projectId]/".length);
  return path.includes("[") ? null : path;
}

function linksDoItem(item: ItemConhecimento, todos: ItemConhecimento[]): AssistantLink[] {
  const dono = item.rota ? item : todos.find((i) => i.id === item.pai);
  const path = linkPathDaRota(dono?.rota);
  return path ? [{ label: dono?.nome ?? item.nome, path }] : [];
}

export function entradasDoItem(item: ItemConhecimento, todos: ItemConhecimento[] = ITENS_CONHECIMENTO): AssistantEntry[] {
  const links = linksDoItem(item, todos);
  const passos = [...item.passoAPasso];
  if (item.limitacoes[0]) passos.push(`Limite: ${item.limitacoes[0]}`);
  const visaoGeral: AssistantEntry = {
    id: `${ABA_ENTRY_PREFIX}${item.id}`,
    title: `${item.nome}: o que é e como usar`,
    keywords: item.palavrasChave,
    summary: `${item.finalidade} ${item.permissoes}`,
    steps: passos,
    links,
    tutorialSlide: null,
    coverage: "completa",
  };
  const perguntas = item.perguntas.map((p, i): AssistantEntry => ({
    id: `${ABA_ENTRY_PREFIX}${item.id}-q${i + 1}`,
    title: p.pergunta,
    // a própria pergunta (normalizada) também é frase-chave: quem pergunta com as palavras do manual cai na resposta certa
    keywords: [...p.palavrasChave, normalizar(p.pergunta)],
    summary: p.resposta,
    steps: [],
    links,
    tutorialSlide: null,
    coverage: "completa",
  }));
  return [visaoGeral, ...perguntas];
}

export const ABAS_ENTRIES: AssistantEntry[] = ITENS_CONHECIMENTO.flatMap((item) => entradasDoItem(item));
