// Motor de resposta da AXIA — Assistente ACC (piloto): recuperação determinística sobre a base de conhecimento.
//
// Reaproveita a convenção de provider de IA do ACC (lib/ai/providers): o modo é escolhido por variável de
// ambiente explícita — AXION_AI_PROVIDER_ASSISTENTE — e é FAIL CLOSED: "fake" (padrão) = base de conhecimento
// local, sem rede e sem custo; qualquer outro valor (ex.: "anthropic") falha com mensagem clara em vez de cair
// silenciosamente para outro modo. Ligar um modelo real à assistente é uma decisão futura, com custo próprio.
//
// Puro, sem I/O.

import { ASSISTANT_QUESTION_MAX_LENGTH } from "./limits";
import {
  ASSISTANT_ENTRIES,
  ASSISTANT_FALLBACK,
  ASSISTANT_READ_ONLY_NOTICE,
  getAssistantEntry,
  type AssistantEntry,
} from "./knowledge";
import { QA_FIXTURE_ENTRIES } from "./qa-fixtures";
import { qaFixturesEnabled, resolveAdminHandoff, type AdminHandoff, type AnswerCoverage } from "./qa-handoff";

export const ASSISTANT_PROVIDER_ENV_VAR = "AXION_AI_PROVIDER_ASSISTENTE";
export { ASSISTANT_QUESTION_MAX_LENGTH };

export type AssistantMode = "BASE_CONHECIMENTO";

export interface AssistantAnswer {
  mode: AssistantMode;
  /** Id do assunto encontrado, ou "fallback". Também identifica o texto que pode ser lido em voz alta. */
  entryId: string;
  title: string;
  summary: string;
  steps: string[];
  links: { label: string; href: string }[];
  tutorialSlide: number | null;
  /** Presente quando a pergunta pedia para alterar dados. */
  readOnlyNotice: string | null;
  /** "parcial" e "ausente" mostram "Falar com o ADMIN" sem esperar o clique em "Isso não respondeu à minha pergunta". */
  coverage: AnswerCoverage;
  /** Seção do manual que sustenta a resposta; null quando não há citação. */
  manualSection: string | null;
  /** Como encaminhar ao ADMIN (link fixo ou só texto). Nunca contém a pergunta nem o histórico. */
  adminHandoff: AdminHandoff;
}

export class AssistantConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssistantConfigError";
  }
}

/** Resolve o modo da assistente; só "fake" existe no piloto. */
export function resolveAssistantMode(env: Record<string, string | undefined> = process.env): AssistantMode {
  const raw = (env[ASSISTANT_PROVIDER_ENV_VAR] ?? "fake").trim().toLowerCase();
  if (raw === "fake" || raw === "") return "BASE_CONHECIMENTO";
  throw new AssistantConfigError(
    `${ASSISTANT_PROVIDER_ENV_VAR}="${raw}" ainda não está implementado no piloto da AXIA — Assistente ACC. ` +
      'Use "fake" (base de conhecimento local). Nenhum modelo de IA é chamado e nenhum outro modo é escolhido em silêncio.'
  );
}

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma", "para", "por",
  "com", "que", "como", "eu", "meu", "minha", "se", "ao", "ou", "qual", "quais", "onde", "quando", "posso", "pode", "fazer",
  "faco", "preciso", "quero", "sobre", "ser", "tem", "ter", "isso", "esse", "essa", "e", "ja", "mais", "muito",
]);

function tokens(normalized: string): string[] {
  return normalized.split(" ").filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** Pontua um assunto: frase-chave contida na pergunta vale mais que palavra solta. */
export function scoreEntry(entry: AssistantEntry, normalizedQuestion: string, questionTokens: string[]): number {
  let score = 0;
  const padded = ` ${normalizedQuestion} `;
  for (const keyword of entry.keywords) {
    if (keyword.includes(" ")) {
      if (padded.includes(` ${keyword} `)) score += 4;
    } else if (padded.includes(` ${keyword} `)) {
      score += 3;
    } else if (keyword.length >= 5 && questionTokens.some((token) => token.length >= 5 && (token.startsWith(keyword) || keyword.startsWith(token)))) {
      score += 1.5; // plural/variação: "documentos" ~ "documento"
    }
  }
  const title = normalizeText(entry.title);
  for (const token of questionTokens) {
    if (title.includes(token)) score += 1;
  }
  return score;
}

/** Perguntas que pedem para alterar dados (a assistente só orienta). */
const MUTATION_PATTERN =
  /\b(apague|apagar|exclua|excluir|delete|deletar|remova|remover|crie|criar|altere|alterar|edite|editar|mude|mudar|aprove|aprovar|rejeite|rejeitar|envie|enviar|mande|mandar|cadastre|cadastrar|conclua|concluir|resolva|resolver|libere|liberar)\b/;

export function asksToChangeData(normalizedQuestion: string): boolean {
  if (!MUTATION_PATTERN.test(normalizedQuestion)) return false;
  const asksHow = /(?<![a-z0-9])(como|onde|qual|quais|passo|ensina|explica|orienta)(?![a-z0-9])/.test(normalizedQuestion);
  const asksToDoIt = /(?<![a-z0-9])(para mim|por mim|voce|vc|assistente)(?![a-z0-9])/.test(normalizedQuestion);
  return !asksHow || asksToDoIt;
}

const MIN_SCORE = 2;

function toLinks(entry: Pick<AssistantEntry, "links">, projectId: string) {
  return entry.links.map((link) => ({ label: link.label, href: `/${projectId}/${link.path}` }));
}

export function answerQuestion(
  question: string,
  projectId: string,
  env: Record<string, string | undefined> = process.env
): AssistantAnswer {
  resolveAssistantMode();
  const adminHandoff = resolveAdminHandoff(env);
  const entries = qaFixturesEnabled(env) ? [...ASSISTANT_ENTRIES, ...QA_FIXTURE_ENTRIES] : ASSISTANT_ENTRIES;
  const normalized = normalizeText(question.slice(0, ASSISTANT_QUESTION_MAX_LENGTH));
  const questionTokens = tokens(normalized);
  const readOnlyNotice = asksToChangeData(normalized) ? ASSISTANT_READ_ONLY_NOTICE : null;

  const ranked = entries.map((entry) => ({ entry, score: scoreEntry(entry, normalized, questionTokens) })).sort(
    (a, b) => b.score - a.score
  );
  const best = ranked[0];

  if (!best || best.score < MIN_SCORE) {
    return {
      mode: "BASE_CONHECIMENTO",
      entryId: ASSISTANT_FALLBACK.id,
      title: "Não encontrei esse assunto",
      summary: ASSISTANT_FALLBACK.summary,
      steps: [...ASSISTANT_FALLBACK.steps],
      links: [{ label: "Ajuda e tutorial", href: `/${projectId}/ajuda` }],
      tutorialSlide: null,
      readOnlyNotice,
      coverage: "ausente",
      manualSection: null,
      adminHandoff,
    };
  }

  const { entry } = best;
  return {
    mode: "BASE_CONHECIMENTO",
    entryId: entry.id,
    title: entry.title,
    summary: entry.summary,
    steps: entry.steps,
    links: toLinks(entry, projectId),
    tutorialSlide: entry.tutorialSlide,
    readOnlyNotice,
    coverage: entry.coverage ?? "completa",
    manualSection: entry.manualSection ?? null,
    adminHandoff,
  };
}

/**
 * Texto que a voz pode ler para um assunto. Montado SOMENTE a partir da base de conhecimento, pelo id —
 * o servidor nunca lê em voz alta (nem envia ao serviço de voz) texto vindo do navegador.
 */
export function speechTextForEntry(entryId: string): string | null {
  if (entryId === ASSISTANT_FALLBACK.id) return ASSISTANT_FALLBACK.summary;
  const entry = getAssistantEntry(entryId);
  if (!entry) return null;
  return fitSpeechLength([entry.title + ".", entry.summary, ...entry.steps]);
}

/** Limite de caracteres por leitura: textos curtos, para caber na franquia gratuita do serviço de voz. */
export const SPEECH_TEXT_MAX_LENGTH = 900;

function fitSpeechLength(parts: string[]): string {
  let text = "";
  for (const part of parts) {
    const next = text ? `${text} ${part}` : part;
    if (next.length > SPEECH_TEXT_MAX_LENGTH) break;
    text = next;
  }
  return text || parts[0].slice(0, SPEECH_TEXT_MAX_LENGTH);
}
