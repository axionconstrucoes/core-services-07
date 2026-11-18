// Triagem conservadora de sinais relacionais em comunicações.
// Nenhuma sugestão altera a classificação de risco contratual, o SLA ou a máquina de estados.
// O texto original permanece na fonte; este módulo devolve apenas trechos e motivos para revisão humana.
export type RelationalSignalKind =
  | "EXPLICIT_CONCERN"
  | "REITERATED_REQUEST"
  | "DISAPPOINTMENT"
  | "DISSATISFACTION"
  | "AGGRESSIVE_DEMAND"
  | "FORMAL_CONTRACTUAL_THREAT";

export type RelationalTension = "NONE" | "ATTENTION" | "HIGH_ATTENTION";

export interface RelationalSignal {
  kind: RelationalSignalKind;
  excerpt: string;
  reason: string;
}

export interface RelationalReview {
  status: "NOT_ASSESSED" | "NO_SIGNAL" | "PENDING_HUMAN_REVIEW";
  tension: RelationalTension;
  signals: RelationalSignal[];
  /** Sugestão de atenção RELACIONAL, jamais classificação contratual efetiva. */
  suggestedContractRisk: "REVIEW_REQUIRED";
  rationale: string;
  source: "RULES_V1";
  needsConversationHistory: boolean;
}

export interface RelationalInput {
  subject: string;
  bodyText: string | null | undefined;
  direction: "INBOUND" | "OUTBOUND" | null;
  senderRole: "CLIENT" | "SUPPLIER" | "INTERNAL" | "UNKNOWN";
  /** Somente mensagens verificadas do mesmo projeto, mesma conversa, com autoria externa. */
  priorExternalRequests?: number | null;
}

const patterns: ReadonlyArray<{ kind: RelationalSignalKind; regex: RegExp; reason: string }> = [
  { kind: "EXPLICIT_CONCERN", regex: /\b(?:estamos\s+(?:seriamente|muito|extremamente)\s+preocupad[oa]s?|nossa\s+preocupa[cç][aã]o\s+[ée]\s+(?:grande|s[ée]ria)|we\s+are\s+(?:seriously|deeply)\s+concerned)\b/giu, reason: "Preocupação explícita e enfática" },
  { kind: "REITERATED_REQUEST", regex: /\b(?:reiter(?:amos|o|ando)|j[aá]\s+(?:solicitamos|pedimos|cobramos)\s+(?:anteriormente|diversas\s+vezes)|conforme\s+(?:j[aá]\s+)?(?:solicitado|informado)\s+anteriormente|mais\s+uma\s+vez\s+(?:solicitamos|pedimos|cobramos)|as\s+(?:previously|repeatedly)\s+requested)\b/giu, reason: "Indício textual de cobrança reiterada; histórico precisa confirmar recorrência" },
  { kind: "DISAPPOINTMENT", regex: /\b(?:estamos\s+decepcionad[oa]s?|nos\s+sentimos\s+decepcionad[oa]s?|profundamente\s+desapontad[oa]s?|we\s+are\s+disappointed)\b/giu, reason: "Decepção ou perda de confiança manifestada" },
  { kind: "DISSATISFACTION", regex: /\b(?:estamos\s+insatisfeit[oa]s?|n[aã]o\s+estamos\s+satisfeit[oa]s?|situa[cç][aã]o\s+inaceit[aá]vel|we\s+are\s+not\s+satisfied)\b/giu, reason: "Descontentamento explícito" },
  { kind: "AGGRESSIVE_DEMAND", regex: /\b(?:isso\s+[ée]\s+inadmiss[ií]vel|exigimos\s+provid[eê]ncias\s+imediatas|n[aã]o\s+toleraremos\s+(?:mais|novos)|this\s+is\s+unacceptable)\b/giu, reason: "Cobrança enfática ou linguagem confrontacional" },
  { kind: "FORMAL_CONTRACTUAL_THREAT", regex: /\b(?:adotaremos\s+(?:as\s+)?medidas\s+contratuais|aplicaremos\s+(?:as\s+)?penalidades|notifica[cç][aã]o\s+extrajudicial|rescis[aã]o\s+(?:do\s+)?contrato|pursue\s+contractual\s+remedies)\b/giu, reason: "Menção a possível escalada contratual; validar cláusulas e contexto" },
];

function extractMatches(text: string): RelationalSignal[] {
  const result: RelationalSignal[] = [];
  for (const pattern of patterns) {
    pattern.regex.lastIndex = 0;
    const match = pattern.regex.exec(text);
    if (match) {
      const start = Math.max(0, match.index - 60);
      const end = Math.min(text.length, match.index + match[0].length + 60);
      result.push({
        kind: pattern.kind,
        excerpt: text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 200),
        reason: pattern.reason,
      });
    }
  }
  return result;
}

/** Não usa LLM; classificação conservadora, auditável, sem acesso a outros projetos. */
export function assessRelationalMessage(input: RelationalInput): RelationalReview {
  const base: RelationalReview = {
    status: "NOT_ASSESSED",
    tension: "NONE",
    signals: [],
    suggestedContractRisk: "REVIEW_REQUIRED",
    rationale: "Sem análise de risco contratual: depende das evidências e de revisão humana.",
    source: "RULES_V1",
    needsConversationHistory: false,
  };
  if (input.direction !== "INBOUND" || !["CLIENT", "SUPPLIER"].includes(input.senderRole)) return base;
  if (!input.bodyText?.trim()) return { ...base, rationale: "Corpo da mensagem indisponível." };

  // Trata somente o texto atual, não mensagens citadas no rodapé de um encaminhamento.
  const currentText = input.bodyText.split(/\n\s*(?:Em .+ escreveu:|On .+ wrote:|-----Original Message-----|De:\s+.+\nEnviad[oa]:)/i)[0].slice(0, 12000);
  const text = `${input.subject}\n${currentText}`;
  const signals = extractMatches(text);
  const verifiedRepetition = Number.isInteger(input.priorExternalRequests) && (input.priorExternalRequests ?? 0) >= 2;
  if (!signals.length) return { ...base, status: "NO_SIGNAL", rationale: "Nenhum dos sinais textuais conhecidos foi identificado; isto não descarta insatisfação implícita." };
  const severe = signals.some(s => ["FORMAL_CONTRACTUAL_THREAT", "AGGRESSIVE_DEMAND", "DISAPPOINTMENT", "DISSATISFACTION"].includes(s.kind));
  const repeat = signals.some(s => s.kind === "REITERATED_REQUEST");
  const high = severe || (repeat && verifiedRepetition) || signals.length >= 2;
  return {
    ...base,
    status: "PENDING_HUMAN_REVIEW",
    tension: high ? "HIGH_ATTENTION" : "ATTENTION",
    signals,
    needsConversationHistory: repeat && !verifiedRepetition,
    rationale: high
      ? "Sinais de desgaste relacional relevantes; investigar pendências, histórico e impacto antes de classificar o risco contratual."
      : "Sinal de atenção relacional; confirmar contexto e eventual recorrência antes de elevar a gravidade.",
  };
}
