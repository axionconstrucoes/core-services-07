// Validação da resposta estratégica (CommercialStrategyBrief) do
// Diretor Comercial IA. Além da forma, aplica a governança de forma
// determinística, contra o contexto comercial efetivamente carregado:
// - FATO sempre com fonte; fonte COM-n precisa existir e estar DISPONIVEL;
// - todo número citado (numerosCitados) vem de um item COM-n numérico
//   carregado, com o mesmo valor; todo "R$ ..." ou "...%" nos textos
//   precisa estar entre os números citados — nunca preço/custo/margem
//   inventado;
// - concessão "SUSTENTADA_PELOS_DADOS" só com base econômica disponível
//   (custos/BDI/margem/contingências) e fontes citadas;
// - faltando dado econômico, pedido explícito a Orçamentos é obrigatório;
// - nenhum texto pode autorizar desconto, assumir obrigação ou dar o
//   contrato por concluído;
// - decisões que exigem aprovação humana nunca vazias;
// - requiresHumanReview sempre true; minuta sempre DRAFT_PENDING_REVIEW.

import { collectCitableCommercialNumbers, hasAvailableEconomicBasis } from "../../../commercial/format-commercial-context";
import type { CommercialContext } from "../../../commercial/types";
import { ExpertAssessmentValidationError } from "../../schemas/validate-expert-assessment";
import type {
  CitedNumber,
  CommercialStatement,
  CommercialStatementKind,
  CommercialStrategyBrief,
  CommercialStrategyMode,
  CommercialTimingMove,
  ConcessionAcceptability,
  ConcessionScenario,
  HumanApprovalDecision,
  MaturityLevel,
  MeetingStep,
  ObjectionResponse,
  OpportunityStage,
  StrategyDraft,
  StrategyDraftType,
} from "./strategy-types";

export const COMMERCIAL_STRATEGY_MODES: CommercialStrategyMode[] = [
  "COMPLETO",
  "DIAGNOSTICO_NEGOCIACAO",
  "ESTRATEGIA_RECOMENDADA",
  "MOMENTO_E_ABORDAGEM",
  "CENARIOS_CONCESSAO",
  "IMPACTOS",
  "OBJECOES_E_RESPOSTAS",
  "ROTEIRO_REUNIOES",
  "MINUTA",
  "CONDICOES_FECHAMENTO",
  "DECISOES_APROVACAO_HUMANA",
];
export const STATEMENT_KINDS: CommercialStatementKind[] = ["FATO", "HIPOTESE", "CENARIO", "RISCO", "RECOMENDACAO"];
export const OPPORTUNITY_STAGES: OpportunityStage[] = [
  "PROSPECCAO",
  "QUALIFICACAO",
  "PROPOSTA_EM_ELABORACAO",
  "PROPOSTA_APRESENTADA",
  "EM_NEGOCIACAO",
  "FECHAMENTO",
  "CONTRATADO",
  "NAO_CONTRATADO",
  "INDEFINIDO",
];
export const MATURITY_LEVELS: MaturityLevel[] = ["BAIXA", "MEDIA", "ALTA", "INDEFINIDA"];
export const TIMING_MOVES: CommercialTimingMove[] = [
  "APRESENTAR_DEMANDA",
  "PEDIR_REVISAO_PRECO",
  "PROPOR_ALTERNATIVA_TECNICA",
  "FORMALIZAR_PLEITO",
  "NEGOCIAR_ADITIVO",
  "PEDIR_CONTRAPARTIDAS",
  "APRESENTAR_PROPOSTA_FINAL",
  "ACELERAR_FECHAMENTO",
  "POSTERGAR_FECHAMENTO",
  "AGUARDAR_DADOS",
];
export const CONCESSION_ACCEPTABILITY: ConcessionAcceptability[] = [
  "SUSTENTADA_PELOS_DADOS",
  "REQUER_ANALISE_ORCAMENTOS",
  "NAO_RECOMENDADA",
];
export const STRATEGY_DRAFT_TYPES: StrategyDraftType[] = [
  "EMAIL",
  "PROPOSAL",
  "COUNTER_PROPOSAL",
  "LETTER",
  "MEETING_AGENDA",
  "MEMO",
  "AMENDMENT_TEXT",
];

/** Tolerância de igualdade entre número citado e valor carregado (centavos). */
const NUMBER_TOLERANCE = 0.005;

function fail(message: string): never {
  throw new ExpertAssessmentValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) fail(`Campo obrigatório ausente ou inválido: ${field}`);
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) fail(`Campo obrigatório deve ser um array: ${field}`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) fail(`Campo obrigatório deve ser string não vazia: ${field}`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") fail(`Campo deve ser string ou null: ${field}`);
  return value.trim().length > 0 ? value : null;
}

function stringArray(value: unknown, field: string): string[] {
  const array = requireArray(value, field);
  if (array.some((item) => typeof item !== "string")) fail(`Campo deve ser array de strings: ${field}`);
  return array as string[];
}

function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) fail(`${field} inválido: ${String(value)}`);
  return value as T;
}

function validateStatement(value: unknown, field: string, context: CommercialContext): CommercialStatement {
  const record = requireRecord(value, field);
  const tipo = requireEnum(record.tipo, STATEMENT_KINDS, `${field}.tipo`);
  const texto = requireString(record.texto, `${field}.texto`);
  const fonte = nullableString(record.fonte, `${field}.fonte`);
  if (tipo === "FATO" && !fonte) {
    fail(`${field}: afirmação do tipo FATO sem fonte — fato nunca sem rastreabilidade (use HIPOTESE se não houver fonte).`);
  }
  if (fonte && /^COM-\d+$/.test(fonte.trim())) {
    const item = context.items.find((candidate) => candidate.id === fonte.trim());
    if (!item) fail(`${field}.fonte cita ${fonte}, que não existe no contexto comercial carregado.`);
    if (tipo === "FATO" && item.availability !== "DISPONIVEL") {
      fail(`${field}: FATO apoiado em ${fonte}, que não está DISPONIVEL (${item.availability}).`);
    }
  }
  return { tipo, texto, fonte };
}

function statements(value: unknown, field: string, context: CommercialContext): CommercialStatement[] {
  return requireArray(value, field).map((item, index) => validateStatement(item, `${field}[${index}]`, context));
}

function validateCitedNumbers(value: unknown, context: CommercialContext): CitedNumber[] {
  const citable = collectCitableCommercialNumbers(context);
  return requireArray(value, "numerosCitados").map((raw, index) => {
    const field = `numerosCitados[${index}]`;
    const record = requireRecord(raw, field);
    if (typeof record.valor !== "number" || !Number.isFinite(record.valor)) fail(`${field}.valor deve ser número.`);
    const fonte = requireString(record.fonte, `${field}.fonte`).trim();
    const item = citable.get(fonte);
    if (!item) {
      fail(
        `${field}: número ${record.valor} cita a fonte "${fonte}", que não é um dado numérico DISPONIVEL no contexto comercial carregado — nunca inventar preço, custo, margem ou condição.`
      );
    }
    if (Math.abs((item.value as number) - record.valor) > NUMBER_TOLERANCE) {
      fail(`${field}: valor ${record.valor} diverge do valor carregado em ${fonte} (${String(item.value)}).`);
    }
    return { valor: record.valor, descricao: requireString(record.descricao, `${field}.descricao`), fonte };
  });
}

function validateConcession(value: unknown, field: string, context: CommercialContext): ConcessionScenario {
  const record = requireRecord(value, field);
  const aceitabilidadeEconomica = requireEnum(record.aceitabilidadeEconomica, CONCESSION_ACCEPTABILITY, `${field}.aceitabilidadeEconomica`);
  const fontesEconomicas = stringArray(record.fontesEconomicas, `${field}.fontesEconomicas`);
  if (aceitabilidadeEconomica === "SUSTENTADA_PELOS_DADOS") {
    if (!hasAvailableEconomicBasis(context)) {
      fail(
        `${field}: concessão declarada economicamente aceitável sem base econômica no ACC (faltam ${context.missingEconomicKeys.join(", ")}) — use REQUER_ANALISE_ORCAMENTOS.`
      );
    }
    if (fontesEconomicas.length === 0) fail(`${field}: SUSTENTADA_PELOS_DADOS exige fontesEconomicas.`);
    for (const fonte of fontesEconomicas) {
      const item = context.items.find((candidate) => candidate.id === fonte);
      if (!item || item.availability !== "DISPONIVEL") fail(`${field}: fonte econômica ${fonte} não está DISPONIVEL.`);
    }
  }
  return {
    descricao: requireString(record.descricao, `${field}.descricao`),
    contrapartidaExigida: nullableString(record.contrapartidaExigida, `${field}.contrapartidaExigida`),
    aceitabilidadeEconomica,
    fontesEconomicas,
    riscos: stringArray(record.riscos, `${field}.riscos`),
  };
}

function validateDraft(value: unknown): StrategyDraft | null {
  if (value === null || value === undefined) return null;
  const record = requireRecord(value, "minuta");
  if (record.status !== "DRAFT_PENDING_REVIEW") {
    fail(`minuta.status deve ser exatamente "DRAFT_PENDING_REVIEW" — nenhuma comunicação é enviada ou aprovada pelo Expert.`);
  }
  return {
    type: requireEnum(record.type, STRATEGY_DRAFT_TYPES, "minuta.type"),
    subject: nullableString(record.subject, "minuta.subject"),
    body: requireString(record.body, "minuta.body"),
    status: "DRAFT_PENDING_REVIEW",
  };
}

// --- Governança textual -------------------------------------------------

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const NEGATION_BEFORE = /\b(nao|nenhum|nenhuma|sem|nunca|jamais|nem)\b[^.;\n]{0,25}$/;

const COMMITMENT_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\b(autorizo|autorizamos|concedemos|concedo)\b/g, reason: "autoriza/concede em nome da AXION" },
  {
    pattern: /\b(desconto|abatimento|reducao de preco|reducao do preco)\b[^.;\n]{0,60}\b(fica|esta|foi|sera|e)\s+(autorizad|aprovad|concedid)/g,
    reason: "declara desconto autorizado/aprovado/concedido",
  },
  {
    pattern: /\b(fica|esta|foi|sera)\s+(autorizad|aprovad|concedid)[oa]s?\b[^.;\n]{0,60}\b(desconto|abatimento|reducao de preco)\b/g,
    reason: "declara desconto autorizado/aprovado/concedido",
  },
  { pattern: /\bdesconto\s+(autorizado|aprovado|concedido)\b/g, reason: "declara desconto autorizado/aprovado/concedido" },
  { pattern: /\b(aprovamos|aprovo)\s+(o|a|os|as)\s+(desconto|abatimento|reducao|concessao|proposta)/g, reason: "aprova em nome da AXION" },
  { pattern: /\b(assumimos|assumo)\s+(o\s+|a\s+)?(compromisso|obrigacao)/g, reason: "assume obrigação em nome da AXION" },
  { pattern: /\b(damos por|declaramos)\s+(fechad|conclu|encerrad)/g, reason: "dá a negociação/contrato por concluído" },
  { pattern: /\bcontrato\s+(fica\s+|esta\s+)?(fechado|concluido)\b/g, reason: "dá o contrato por concluído" },
];

/** Textos que autorizam desconto, assumem obrigação ou concluem contrato — sempre proibidos. */
export function findCommitmentViolations(text: string): string[] {
  const normalized = normalize(text);
  const violations: string[] = [];
  for (const { pattern, reason } of COMMITMENT_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(normalized)) !== null) {
      const before = normalized.slice(Math.max(0, match.index - 40), match.index);
      if (NEGATION_BEFORE.test(before)) continue;
      violations.push(`${reason}: "${match[0]}"`);
    }
  }
  return violations;
}

/** Converte "1.234,56" / "1234.56" / "12,5" em número. */
function parseBrNumber(raw: string): number | null {
  const trimmed = raw.trim();
  const normalized = /,\d{1,2}$/.test(trimmed)
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : /\.\d{3}(\.|$)/.test(trimmed)
      ? trimmed.replace(/\./g, "")
      : trimmed.replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export interface TextNumber {
  value: number;
  unit: "BRL" | "PERCENT";
}

/** Números monetários (R$) e percentuais presentes no texto, com a unidade. */
export function extractMonetaryAndPercentNumbers(text: string): TextNumber[] {
  const found: TextNumber[] = [];
  for (const match of text.matchAll(/R\$\s*(\d[\d.]*(?:,\d+)?)/g)) {
    const value = parseBrNumber(match[1]);
    if (value !== null) found.push({ value, unit: "BRL" });
  }
  for (const match of text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)) {
    const value = parseBrNumber(match[1]);
    if (value !== null) found.push({ value, unit: "PERCENT" });
  }
  return found;
}

function collectStrings(value: unknown, out: string[]): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (isRecord(value)) Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

export interface CommercialStrategyValidationOptions {
  commercialContext: CommercialContext;
}

/**
 * Valida a saída bruta de um provider como CommercialStrategyBrief —
 * forma + governança. Lança ExpertAssessmentValidationError (mesma classe
 * dos demais validadores de Expert) na primeira violação.
 */
export function validateCommercialStrategyBrief(
  candidate: unknown,
  options: CommercialStrategyValidationOptions
): CommercialStrategyBrief {
  const context = options.commercialContext;
  const root = requireRecord(candidate, "CommercialStrategyBrief");

  if (root.requiresHumanReview !== true) {
    fail("requiresHumanReview deve ser sempre true — a IA nunca decide sozinha.");
  }

  const diagnosticoRaw = requireRecord(root.diagnostico, "diagnostico");
  const maturidadeRaw = requireRecord(diagnosticoRaw.maturidade, "diagnostico.maturidade");
  const momentoRaw = requireRecord(root.momentoEAbordagem, "momentoEAbordagem");
  const impactosRaw = requireRecord(root.impactos, "impactos");

  const numerosCitados = validateCitedNumbers(root.numerosCitados, context);

  const brief: CommercialStrategyBrief = {
    mode: requireEnum(root.mode, COMMERCIAL_STRATEGY_MODES, "mode"),
    diagnostico: {
      estagioOportunidade: requireEnum(diagnosticoRaw.estagioOportunidade, OPPORTUNITY_STAGES, "diagnostico.estagioOportunidade"),
      interessesCliente: statements(diagnosticoRaw.interessesCliente, "diagnostico.interessesCliente", context),
      restricoesCliente: statements(diagnosticoRaw.restricoesCliente, "diagnostico.restricoesCliente", context),
      posicaoCompetitiva: statements(diagnosticoRaw.posicaoCompetitiva, "diagnostico.posicaoCompetitiva", context),
      decisoresEInterlocutores: statements(diagnosticoRaw.decisoresEInterlocutores, "diagnostico.decisoresEInterlocutores", context),
      maturidade: {
        tecnica: requireEnum(maturidadeRaw.tecnica, MATURITY_LEVELS, "diagnostico.maturidade.tecnica"),
        comercial: requireEnum(maturidadeRaw.comercial, MATURITY_LEVELS, "diagnostico.maturidade.comercial"),
        contratual: requireEnum(maturidadeRaw.contratual, MATURITY_LEVELS, "diagnostico.maturidade.contratual"),
      },
    },
    estrategiaRecomendada: statements(root.estrategiaRecomendada, "estrategiaRecomendada", context),
    momentoEAbordagem: {
      movimentoRecomendado: requireEnum(momentoRaw.movimentoRecomendado, TIMING_MOVES, "momentoEAbordagem.movimentoRecomendado"),
      agoraOuAguardar: requireEnum(momentoRaw.agoraOuAguardar, ["AGORA", "AGUARDAR"] as const, "momentoEAbordagem.agoraOuAguardar"),
      justificativa: statements(momentoRaw.justificativa, "momentoEAbordagem.justificativa", context),
      condicoesParaAvancar: stringArray(momentoRaw.condicoesParaAvancar, "momentoEAbordagem.condicoesParaAvancar"),
      interlocutor: nullableString(momentoRaw.interlocutor, "momentoEAbordagem.interlocutor"),
      canal: nullableString(momentoRaw.canal, "momentoEAbordagem.canal"),
      tomEPosicionamento: nullableString(momentoRaw.tomEPosicionamento, "momentoEAbordagem.tomEPosicionamento"),
      argumentacaoTecnica: stringArray(momentoRaw.argumentacaoTecnica, "momentoEAbordagem.argumentacaoTecnica"),
      argumentacaoComercial: stringArray(momentoRaw.argumentacaoComercial, "momentoEAbordagem.argumentacaoComercial"),
      documentosDeSuporte: stringArray(momentoRaw.documentosDeSuporte, "momentoEAbordagem.documentosDeSuporte"),
    },
    cenariosConcessao: requireArray(root.cenariosConcessao, "cenariosConcessao").map((item, index) =>
      validateConcession(item, `cenariosConcessao[${index}]`, context)
    ),
    impactos: {
      economicos: statements(impactosRaw.economicos, "impactos.economicos", context),
      contratuais: statements(impactosRaw.contratuais, "impactos.contratuais", context),
      prazo: statements(impactosRaw.prazo, "impactos.prazo", context),
    },
    objecoesERespostas: requireArray(root.objecoesERespostas, "objecoesERespostas").map((raw, index): ObjectionResponse => {
      const record = requireRecord(raw, `objecoesERespostas[${index}]`);
      return {
        objecao: requireString(record.objecao, `objecoesERespostas[${index}].objecao`),
        resposta: requireString(record.resposta, `objecoesERespostas[${index}].resposta`),
        fundamento: nullableString(record.fundamento, `objecoesERespostas[${index}].fundamento`),
      };
    }),
    roteiroReunioes: requireArray(root.roteiroReunioes, "roteiroReunioes").map((raw, index): MeetingStep => {
      const record = requireRecord(raw, `roteiroReunioes[${index}]`);
      if (typeof record.ordem !== "number" || !Number.isInteger(record.ordem) || record.ordem < 1) {
        fail(`roteiroReunioes[${index}].ordem deve ser inteiro >= 1`);
      }
      return {
        ordem: record.ordem,
        objetivo: requireString(record.objetivo, `roteiroReunioes[${index}].objetivo`),
        participantesSugeridos: stringArray(record.participantesSugeridos, `roteiroReunioes[${index}].participantesSugeridos`),
        pauta: stringArray(record.pauta, `roteiroReunioes[${index}].pauta`),
      };
    }),
    minuta: validateDraft(root.minuta),
    condicoesRecomendadasFechamento: statements(root.condicoesRecomendadasFechamento, "condicoesRecomendadasFechamento", context),
    decisoesAprovacaoHumana: requireArray(root.decisoesAprovacaoHumana, "decisoesAprovacaoHumana").map(
      (raw, index): HumanApprovalDecision => {
        const record = requireRecord(raw, `decisoesAprovacaoHumana[${index}]`);
        return {
          decisao: requireString(record.decisao, `decisoesAprovacaoHumana[${index}].decisao`),
          responsavelSugerido: requireString(record.responsavelSugerido, `decisoesAprovacaoHumana[${index}].responsavelSugerido`),
          motivo: requireString(record.motivo, `decisoesAprovacaoHumana[${index}].motivo`),
        };
      }
    ),
    solicitacoesOrcamentos: stringArray(root.solicitacoesOrcamentos, "solicitacoesOrcamentos"),
    numerosCitados,
    informacoesFaltantes: stringArray(root.informacoesFaltantes, "informacoesFaltantes"),
    requiresHumanReview: true,
  };

  if (brief.decisoesAprovacaoHumana.length === 0) {
    fail("decisoesAprovacaoHumana não pode ser vazia — toda estratégia comercial tem decisões reservadas a humanos.");
  }

  if (context.missingEconomicKeys.length > 0 && brief.solicitacoesOrcamentos.length === 0) {
    fail(
      `Faltam dados econômicos no ACC (${context.missingEconomicKeys.join(", ")}) — solicitacoesOrcamentos deve pedir explicitamente a análise de Orçamentos.`
    );
  }

  // Números monetários/percentuais soltos nos textos precisam estar citados com fonte.
  const textFields = collectStrings({ ...brief, numerosCitados: [] }, []);
  // Também aceitos: números que já constam literalmente de um texto
  // carregado (ex.: título de proposta "R$ 50.000 adicionais") — são
  // dado rastreável, não invenção.
  const loadedTexts = context.items.map((item) => `${item.label} ${String(item.value ?? "")} ${item.note ?? ""}`).join(" | ");
  // A unidade também precisa bater: "12%" nunca é justificado por "12 dias".
  const citedValues: TextNumber[] = [
    ...brief.numerosCitados.flatMap((cited): TextNumber[] => {
      const unit = context.items.find((item) => item.id === cited.fonte)?.unit;
      return unit === "BRL" || unit === "PERCENT" ? [{ value: cited.valor, unit }] : [];
    }),
    ...extractMonetaryAndPercentNumbers(loadedTexts),
  ];
  for (const text of textFields) {
    for (const found of extractMonetaryAndPercentNumbers(text)) {
      const supported = citedValues.some(
        (cited) => cited.unit === found.unit && Math.abs(cited.value - found.value) <= NUMBER_TOLERANCE
      );
      if (!supported) {
        fail(
          `Número ${found.value}${found.unit === "PERCENT" ? "%" : " (R$)"} aparece no texto sem estar em numerosCitados com fonte carregada da mesma unidade — nunca inventar preço, custo, margem ou percentual. Trecho: "${text.slice(0, 120)}"`
        );
      }
    }
    const violations = findCommitmentViolations(text);
    if (violations.length > 0) {
      fail(
        `Texto viola a governança comercial (${violations.join("; ")}) — o Expert nunca autoriza desconto, assume obrigação ou conclui contrato.`
      );
    }
  }

  return brief;
}
