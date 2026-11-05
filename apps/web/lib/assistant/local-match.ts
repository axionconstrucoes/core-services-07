// Recuperação LOCAL no Q&A aprovado (sem IA, sem custo): correção de erros de digitação, pontuação das entradas, separação de
// perguntas compostas e escolha dos CANDIDATOS que (se necessário) vão à IA. É a primeira camada: a IA só entra quando esta
// camada não tem confiança, e só enxerga os poucos candidatos aprovados daqui — nunca o catálogo inteiro.

import { normalizeText, scoreEntry, tokens } from "./answer";
import { ASSISTANT_ENTRIES, type AssistantEntry } from "./knowledge";

/** Pontuação a partir da qual a resposta local é considerada CONFIANTE (acerto exato de uma palavra-chave ou frase-chave). */
export const CONFIDENT_SCORE = 3;
/** Pontuação mínima para uma entrada virar CANDIDATA da IA (contexto aprovado suficiente). */
export const CANDIDATE_SCORE = 1;
export const MAX_CANDIDATES = 5;

// ───────── erros de digitação ─────────

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
    {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
    }
  return dp[a.length][b.length];
}

let vocabulary: Set<string> | null = null;
function vocab(): Set<string> {
  if (!vocabulary) {
    vocabulary = new Set<string>();
    for (const entry of ASSISTANT_ENTRIES) {
      for (const keyword of entry.keywords) for (const w of keyword.split(" ")) if (w.length >= 5) vocabulary.add(w);
      for (const w of normalizeText(entry.title).split(" ")) if (w.length >= 5) vocabulary.add(w);
    }
  }
  return vocabulary;
}

/** Corrige erros de digitação simples: distância 1 em palavras de 5+ letras, 2 em palavras de 9+. */
export function correctTypos(normalized: string): string {
  const known = vocab();
  return normalized
    .split(" ")
    .map((token) => {
      if (token.length < 5 || known.has(token)) return token;
      const limit = token.length >= 9 ? 2 : 1;
      let best = token;
      let bestDistance = limit + 1;
      for (const word of known) {
        if (Math.abs(word.length - token.length) > limit) continue;
        const distance = editDistance(token, word);
        if (distance < bestDistance) {
          best = word;
          bestDistance = distance;
        }
      }
      return best;
    })
    .join(" ");
}

// ───────── sinônimos do domínio (acrescentados, nunca substituídos) ─────────

const SYNONYMS: Array<[RegExp, string]> = [
  [/\b(mandar|mando|mandei|subir|subo|subi|carregar|carrego|upload)\b/, "enviar"],
  [/\b(planilhas?|anexos?|arquivos?)\b/, "documento arquivo"],
  [/\b(equipe|time|colegas?|pessoas)\b/, "usuarios"],
  [/\b(aviso|avisos|notificacao|notificacoes|e ?mails? de alerta)\b/, "alerta"],
  [/\b(demora|atraso|vencido|vencimento)\b/, "prazo"],
];

/** Acrescenta termos equivalentes do domínio para aumentar a cobertura local (sem trocar o que a pessoa escreveu). */
export function addSynonyms(normalized: string): string {
  const extra = SYNONYMS.filter(([pattern]) => pattern.test(normalized)).map(([, add]) => add);
  return extra.length > 0 ? `${normalized} ${extra.join(" ")}` : normalized;
}

// ───────── recuperação ─────────

export interface Ranked {
  entry: AssistantEntry;
  score: number;
}

export function rank(normalized: string, entries: readonly AssistantEntry[] = ASSISTANT_ENTRIES): Ranked[] {
  const toks = tokens(normalized);
  return entries.map((entry) => ({ entry, score: scoreEntry(entry, normalized, toks) })).sort((a, b) => b.score - a.score);
}

/** Pergunta composta: separa em partes ("… e como …", "… e o que …"). Uma só parte = pergunta simples. */
export function splitCompound(normalized: string): string[] {
  const parts = normalized.split(/\s+e\s+(?=como|onde|quando|o que|qual|quais|por que|porque|posso)/).map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts : [normalized];
}

export interface LocalRetrieval {
  /** Texto com erros de digitação corrigidos. */
  corrected: string;
  best: Ranked | undefined;
  /** A melhor entrada tem pontuação para responder SEM IA. */
  confident: boolean;
  /** Pergunta composta cujas partes têm, TODAS, resposta confiante: ids em ordem. */
  compoundIds: string[] | null;
  /** Até 5 entradas aprovadas que podem estar relacionadas (só estas vão à IA, se houver chamada). */
  candidates: Ranked[];
  /** Palavras significativas da pergunta (sem conectivos). */
  meaningful: number;
  /** Pergunta longa com 2+ assuntos aprovados fortes: só aí uma resposta "confiante" ainda pode precisar da IA. */
  ambiguous: boolean;
}

export function localRetrieve(normalized: string): LocalRetrieval {
  const corrected = addSynonyms(correctTypos(normalized));
  const ranked = rank(corrected);
  const best = ranked[0];
  const parts = splitCompound(corrected);
  let compoundIds: string[] | null = null;
  const exactTitle = ASSISTANT_ENTRIES.some((e) => normalizeText(e.title) === normalized);
  if (parts.length >= 2 && !exactTitle) {
    const ids: string[] = [];
    let all = true;
    for (const part of parts) {
      const top = rank(part)[0];
      if (!top || top.score < CONFIDENT_SCORE) {
        all = false;
        break;
      }
      if (!ids.includes(top.entry.id)) ids.push(top.entry.id);
    }
    if (all && ids.length >= 2) compoundIds = ids.slice(0, 3);
  }
  const candidates = ranked.filter((r) => r.score >= CANDIDATE_SCORE).slice(0, MAX_CANDIDATES);
  const meaningful = tokens(corrected).length;
  // Pergunta COMPLEXA: longa (7+ palavras significativas) e com 2+ assuntos aprovados fortes (≥ 4): a melhor pontuação local pode
  // apontar o assunto errado; só aí a IA escolhe entre os candidatos (se houver acesso e orçamento).
  const ambiguous = !!best && meaningful >= 7 && candidates.filter((c) => c.score >= 4).length >= 2;
  return {
    corrected,
    best,
    confident: !!best && best.score >= CONFIDENT_SCORE,
    compoundIds,
    candidates,
    meaningful,
    ambiguous,
  };
}
