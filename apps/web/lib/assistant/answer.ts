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
import { PENDING_REVIEW_PATTERNS } from "./approved-batch-1";
import {
  BOUNDARY_ENTRY_ID,
  BOUNDARY_SECTION,
  BOUNDARY_SUMMARY,
  BOUNDARY_TITLE,
  CASE_NOTICE,
  gradeDeadlineEntryIds,
  isCaseAdvice,
  isCaseSpecific,
  isPermissionBypass,
} from "./guards";
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

  /** Tipo da resposta: "social" (conversa, sem fonte nem ADMIN), "clarify" (pedido de esclarecimento) ou "acc" (padrão). */
  kind?: "social" | "acc" | "clarify" | "scope";
  /** Saudação/abertura curta antes da resposta ("Bom dia!"). Nunca contém regra operacional. */
  intro?: string | null;
  /** "ia": a IA interpretou a pergunta; "base": caminho determinístico. O conteúdo operacional é sempre da base aprovada. */
  via?: "ia" | "base";
  /** Pergunta composta: um bloco por assunto aprovado, cada um com a sua seção do manual. */
  sections?: Array<{ title: string; summary: string; steps: string[]; manualSection: string | null }>;
  /** Pergunta sobre caso específico: aviso de que a AXIA explica só a regra geral e não lê dados nem analisa o caso. */
  caseNotice?: string | null;
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

export function tokens(normalized: string): string[] {
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
  // Entradas com seção do manual (Q&A aprovado) têm prioridade sobre o texto genérico quando já casaram por frase-chave.
  if (entry.manualSection && score >= 3) score += 4;
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

export const PROJECT_SELECTION_ENTRY_ID = "selecao-obra";
const PROJECT_SELECTION_GUIDANCE =
  "Essa pergunta depende de uma obra específica, e a AXIA só orienta (não lê dados da obra). Antes de perguntar, escolha a obra na lista desta tela.";
const PROJECT_SELECTION_STEPS = [
  "Clique no cartão da obra: o Dashboard dela abre.",
  "Abra “Fale com a AXIA” na barra de cima e repita a pergunta; as respostas passam a trazer os links dessa obra.",
  "Se a obra não aparece na lista, o acesso é concedido por obra pelo Administrador, na tela Usuários.",
] as const;

/** Perguntas sobre "a minha obra", "esta obra", "o contrato da obra" etc. dependem de saber qual é a obra. */
const PROJECT_SPECIFIC_PATTERN =
  /(\b(minha|nossa|esta|essa|desta|dessa|nesta|nessa) (obra|projeto)\b|\b(meus|minhas|nossos|nossas|meu) (alertas?|contratos?|documentos?|prazos?|eventos?|providencias?|riscos?|aditivos?|solicitacoes)\b|\bobra (weg|0079)\b)/;

export function dependsOnSpecificProject(normalizedQuestion: string): boolean {
  return PROJECT_SPECIFIC_PATTERN.test(normalizedQuestion);
}

function toLinks(entry: Pick<AssistantEntry, "links">, projectId: string | null) {
  if (!projectId) return []; // antes de escolher a obra não há tela de obra para abrir
  return entry.links.map((link) => ({ label: link.label, href: `/${projectId}/${link.path}` }));
}

export function answerQuestion(
  question: string,
  projectId: string | null,
  env: Record<string, string | undefined> = process.env
): AssistantAnswer {
  const answer = answerCore(question, projectId, env);
  return withCaseNotice(answer, normalizeText(question.slice(0, ASSISTANT_QUESTION_MAX_LENGTH)));
}

/** Caso específico: acrescenta o aviso (e o link dos especialistas) sem alterar o texto aprovado. */
export function withCaseNotice(answer: AssistantAnswer, normalizedQuestion: string): AssistantAnswer {
  if (!isCaseSpecific(normalizedQuestion) || answer.entryId === PROJECT_SELECTION_ENTRY_ID || answer.entryId === BOUNDARY_ENTRY_ID) return answer;
  const hasExperts = answer.links.some((link) => link.href.endsWith("/experts-ia"));
  const base = answer.links.length > 0 ? answer.links[0].href.split("/").slice(0, 2).join("/") : null;
  return {
    ...answer,
    caseNotice: CASE_NOTICE,
    links: hasExperts || !base ? answer.links : [...answer.links, { label: "Experts IA", href: `${base}/experts-ia` }],
  };
}

function answerCore(
  question: string,
  projectId: string | null,
  env: Record<string, string | undefined>
): AssistantAnswer {
  resolveAssistantMode();
  const adminHandoff = resolveAdminHandoff(env);
  const entries = qaFixturesEnabled(env) ? [...ASSISTANT_ENTRIES, ...QA_FIXTURE_ENTRIES] : ASSISTANT_ENTRIES;
  const normalized = normalizeText(question.slice(0, ASSISTANT_QUESTION_MAX_LENGTH));
  const questionTokens = tokens(normalized);
  const readOnlyNotice = asksToChangeData(normalized) ? ASSISTANT_READ_ONLY_NOTICE : null;

  // Tentativa de contornar permissões ou obter dados: resposta fixa de limite, antes de qualquer outra coisa.
  if (isPermissionBypass(normalized)) return buildBoundaryAnswer(projectId, readOnlyNotice, adminHandoff);

  // Decisão sobre caso concreto (ex.: "no meu contrato posso rescindir…?"): sem regra aprovada, encaminha (o aviso de caso é acrescentado).
  if (projectId && isCaseAdvice(normalized)) return buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff);

  // Tela "Selecione um projeto": a pergunta que depende de uma obra específica pede a escolha da obra antes.
  if (!projectId && dependsOnSpecificProject(normalized)) {
    return {
      mode: "BASE_CONHECIMENTO",
      entryId: PROJECT_SELECTION_ENTRY_ID,
      title: "Escolha a obra primeiro",
      summary: PROJECT_SELECTION_GUIDANCE,
      steps: [...PROJECT_SELECTION_STEPS],
      links: [],
      tutorialSlide: null,
      readOnlyNotice,
      coverage: "completa",
      manualSection: "4.1 (fluxo principal, passos 1 a 6)",
      adminHandoff,
    };
  }

  // Prazos por grau de alerta: consultam as regras aprovadas (E2 e R7), não as entradas em revisão.
  const gradeIds = gradeDeadlineEntryIds(normalized);
  if (gradeIds) {
    const composed = buildEntriesAnswer(gradeIds, projectId, readOnlyNotice, adminHandoff);
    if (composed) return composed;
  }

  const ranked = entries.map((entry) => ({ entry, score: scoreEntry(entry, normalized, questionTokens) })).sort(
    (a, b) => b.score - a.score
  );
  const best = ranked[0];

  const heldForReview = PENDING_REVIEW_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!best || best.score < MIN_SCORE || heldForReview) {
    return buildFallbackAnswer(projectId, readOnlyNotice, adminHandoff);
  }

  return buildEntryAnswer(best.entry, projectId, readOnlyNotice, adminHandoff);
}

/** Resposta fixa quando a pessoa tenta contornar permissões ou obter dados que a AXIA não lê. Nunca chama a IA. */
export function buildBoundaryAnswer(projectId: string | null, readOnlyNotice: string | null, adminHandoff: AdminHandoff): AssistantAnswer {
  return {
    mode: "BASE_CONHECIMENTO",
    entryId: BOUNDARY_ENTRY_ID,
    title: BOUNDARY_TITLE,
    summary: BOUNDARY_SUMMARY,
    steps: [],
    links: projectId ? [{ label: "Usuários e permissões", href: `/${projectId}/usuarios` }] : [],
    tutorialSlide: null,
    readOnlyNotice,
    coverage: "completa",
    manualSection: BOUNDARY_SECTION,
    adminHandoff,
  };
}

/** Uma ou mais entradas aprovadas: texto aprovado palavra por palavra, um bloco por assunto quando há mais de uma. */
export function buildEntriesAnswer(
  ids: string[],
  projectId: string | null,
  readOnlyNotice: string | null,
  adminHandoff: AdminHandoff
): AssistantAnswer | null {
  const entries = ids.map((id) => ASSISTANT_ENTRIES.find((entry) => entry.id === id)).filter((entry): entry is AssistantEntry => !!entry);
  if (entries.length === 0) return null;
  if (entries.length === 1) return buildEntryAnswer(entries[0], projectId, readOnlyNotice, adminHandoff);
  const first = buildEntryAnswer(entries[0], projectId, readOnlyNotice, adminHandoff);
  const links = new Map<string, { label: string; href: string }>();
  for (const entry of entries) for (const link of buildEntryAnswer(entry, projectId, null, adminHandoff).links) links.set(link.href, link);
  const citations = entries.map((entry) => entry.manualSection).filter((section): section is string => !!section);
  return {
    ...first,
    entryId: entries[0].id,
    title: entries.map((entry) => entry.title).join(" + "),
    summary: "Respondo por partes, cada uma com a sua fonte:",
    steps: [],
    links: [...links.values()],
    tutorialSlide: null,
    manualSection: citations.length > 0 ? citations.join(" | ") : null,
    coverage: entries.every((entry) => (entry.coverage ?? "completa") === "completa") ? "completa" : "parcial",
    sections: entries.map((entry) => ({ title: entry.title, summary: entry.summary, steps: entry.steps, manualSection: entry.manualSection ?? null })),
  };
}

/** Encaminhamento quando não há resposta aprovada (Ajuda + orientação ao ADMIN em texto). */
export function buildFallbackAnswer(projectId: string | null, readOnlyNotice: string | null, adminHandoff: AdminHandoff): AssistantAnswer {
  return {
    mode: "BASE_CONHECIMENTO",
    entryId: ASSISTANT_FALLBACK.id,
    title: "Não encontrei esse assunto",
    summary: ASSISTANT_FALLBACK.summary,
    steps: [...ASSISTANT_FALLBACK.steps],
    links: projectId ? [{ label: "Ajuda e tutorial", href: `/${projectId}/ajuda` }] : [],
    tutorialSlide: null,
    readOnlyNotice,
    coverage: "ausente",
    manualSection: null,
    adminHandoff,
  };
}

/** Resposta montada SOMENTE com o texto aprovado da entrada (usada também pela camada de conversa com IA). */
export function buildEntryAnswer(
  entry: AssistantEntry,
  projectId: string | null,
  readOnlyNotice: string | null,
  adminHandoff: AdminHandoff
): AssistantAnswer {
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
