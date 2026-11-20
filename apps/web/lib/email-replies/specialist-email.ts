// ESPECIALISTA por e-mail (Lote 3) — PURO, sem I/O e sem "server-only".
//
// Comando: "ESPECIALISTA: <pergunta>" na primeira linha do texto NOVO (citação/assinatura já removidas). A consulta é ESCRITA,
// roteada ao Expert da ÁREA do item (expertForArea) — nunca à AXIA (assistente de dúvidas de USO da suíte, outro produto) — e
// NÃO altera o item: não muda estado, responsável, previsão, prazo nem escalonamento, e NÃO consome o token por item
// (RESOLVIDO / ENVIAR PARA continuam possíveis depois). O Expert só RECOMENDA: a resposta sai sempre rotulada como
// recomendação de IA com revisão humana (obrigatória em ALTO/CRÍTICO) e distingue fato, inferência e recomendação.
//
// Quem pode consultar: as MESMAS regras de autenticação/autorização do canal (domínio corporativo, e-mail exato do perfil,
// membro ATIVO, DMARC/DKIM alinhado, perfil != LEITURA, ator do item ou Administrador). O limite diário de IA (usuário/obra)
// vale como em qualquer consulta; sem reserva a IA não é chamada.
//
// Roteamento: 1) área cadastrada do item (Planejamento, Engenharia, Jurídico, Comercial/Financeiro/Orçamento, SSMA/ESG);
// 2) área sem Expert dedicado (Administrativo, Diretoria, Compras) ou item sem área (alerta de contrato): tema único da
// pergunta; multidisciplinar => curadoria multi-Expert existente (CEO); 3) sem confiança => SPECIALIST_AREA_UNKNOWN, a
// consulta NÃO é feita e o remetente é orientado (nunca cai em Planejamento por falta de classificação).

import { expertForArea, type TopicExpertId } from "@/lib/ai/routing/expert-topics";
import { stripReplyPlaceholders } from "@/lib/email-replies/reply-mailto";
import { routeExpert } from "@/lib/risk-alerts/experts/route-alert-expert";

export { isSpecialistEmailEnabled, SPECIALIST_EMAIL_ENABLED_ENV } from "@/lib/email-replies/specialist-flag";

export type SpecialistExpertId = TopicExpertId | "ceo";

export const MIN_SPECIALIST_QUESTION = 10;
export const MAX_SPECIALIST_QUESTION = 1500;

const SPECIALIST_LINE = /^\s*especialista\b[\s:.\-–—]*(.*)$/i;
// Outros comandos operacionais: ESPECIALISTA combinado com eles não é inequívoco (nunca executa nada).
const OTHER_COMMAND_LINE = /^\s*(?:resolvid[oa]|conclu[íi]d[oa]|finalizad[oa]|enviar\s+para|em\s+andamento)\b/i;

export type SpecialistParse = { question: string | null; reason: "NO_COMMAND" | "MIXED" | "QUESTION_TOO_SHORT" | null };

/** Reconhece "ESPECIALISTA: pergunta" abrindo o texto novo. Sem comando => NO_COMMAND (segue os demais fluxos). */
export function parseSpecialistCommand(cleanText: string): SpecialistParse {
  const text = stripReplyPlaceholders((cleanText ?? "").normalize("NFC")).trim();
  if (!text) return { question: null, reason: "NO_COMMAND" };
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const head = SPECIALIST_LINE.exec(lines[0] ?? "");
  // "RESOLVIDO ..." seguido de "ESPECIALISTA: ..." (outro comando abrindo o texto): combinação não inequívoca.
  if (!head) return lines.slice(1).some((l) => SPECIALIST_LINE.test(l)) && OTHER_COMMAND_LINE.test(lines[0] ?? "") ? { question: null, reason: "MIXED" } : { question: null, reason: "NO_COMMAND" };
  if (lines.slice(1).some((l) => OTHER_COMMAND_LINE.test(l) || SPECIALIST_LINE.test(l))) return { question: null, reason: "MIXED" };
  const question = [head[1] ?? "", ...lines.slice(1)].join("\n").trim().slice(0, MAX_SPECIALIST_QUESTION);
  if (question.replace(/\s+/g, " ").length < MIN_SPECIALIST_QUESTION) return { question: null, reason: "QUESTION_TOO_SHORT" };
  return { question, reason: null };
}

export type SpecialistRouting =
  | { ok: true; expertId: SpecialistExpertId; source: "AREA" | "TOPIC" | "MULTI_TOPIC"; reason: string }
  | { ok: false; code: "SPECIALIST_AREA_UNKNOWN"; reason: string };

export function routeSpecialistByEmail(input: { area: string | null | undefined; question: string }): SpecialistRouting {
  const byArea = expertForArea(input.area);
  if (byArea) return { ok: true, expertId: byArea, source: "AREA", reason: `Especialista da área do item (${input.area}).` };
  // Sem Expert dedicado à área: tema da pergunta. Seleção explícita nunca vem do e-mail (a AXIA nem é opção).
  const routed = routeExpert({ question: input.question });
  if (routed.reviewRequired || !routed.expertId) {
    return { ok: false, code: "SPECIALIST_AREA_UNKNOWN", reason: "Área sem especialista dedicado e tema da pergunta não identificado." };
  }
  return { ok: true, expertId: routed.expertId, source: routed.expertId === "ceo" ? "MULTI_TOPIC" : "TOPIC", reason: routed.reason };
}

export const SPECIALIST_EXPERT_LABEL: Record<SpecialistExpertId, string> = {
  "planning-director": "Diretor de Planejamento",
  "engineering-director": "Diretor de Engenharia e Construção",
  "quality-analyst": "Analista de Qualidade",
  "legal-consultant": "Expert Jurídico",
  "commercial-director": "Diretor Comercial/Financeiro",
  "esg-director": "ESG/SSMA",
  ceo: "Multi-Expert (CEO)",
};

export type SpecialistSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

/** ALTO/CRÍTICO: a recomendação exige revisão humana ANTES de qualquer decisão. Em todos os níveis é só recomendação. */
export function specialistRequiresHumanReview(severity: SpecialistSeverity | null | undefined): boolean {
  return severity === "HIGH" || severity === "CRITICAL";
}

export interface SpecialistRecord {
  expertId: SpecialistExpertId;
  routingSource: "AREA" | "TOPIC" | "MULTI_TOPIC";
  question: string;
  area: string | null;
  severity: SpecialistSeverity;
  requiresHumanReview: boolean;
}

export const SPECIALIST_TEXT = {
  DISABLED: "A consulta ao especialista por e-mail ainda não está habilitada nesta implantação. Use o botão ESPECIALISTA do ACC. Nada foi alterado.",
  MIXED: 'Não foi possível identificar um único comando. Para consultar o especialista, responda só com "ESPECIALISTA: <sua pergunta>" (sem RESOLVIDO, EM ANDAMENTO ou ENVIAR PARA na mesma mensagem). Nada foi alterado.',
  QUESTION_TOO_SHORT: `Escreva a pergunta ao especialista (mínimo de ${MIN_SPECIALIST_QUESTION} caracteres) depois de "ESPECIALISTA:". Nada foi alterado.`,
  SPECIALIST_AREA_UNKNOWN: "Este item não tem um especialista dedicado à área e o assunto da pergunta não indica qual consultar. Cite o tema (ex.: contrato, cronograma, custo, segurança) ou consulte pelo botão ESPECIALISTA do ACC. Nada foi alterado.",
  RECEIVED: "Sua pergunta foi enviada ao especialista da área. A resposta chegará por e-mail neste mesmo assunto. A consulta NÃO altera o item (estado, responsável, previsão e prazos continuam como estavam).",
  QUOTA: "O limite diário de consultas ao especialista de IA foi atingido (por usuário ou por obra). Tente novamente amanhã ou fale com o ADMINISTRADOR da obra. Nada foi alterado.",
  FAILED: "Não foi possível obter a resposta do especialista agora. A consulta foi registrada; tente novamente pelo botão ESPECIALISTA do ACC. Nada foi alterado.",
} as const;

/** Corpo da resposta do Expert: recomendação (nunca decisão), com a ressalva de revisão humana. */
export function buildSpecialistAnswerText(input: { expertLabel: string; answerText: string; requiresHumanReview: boolean; confidence: number | null }): string {
  const conf = input.confidence === null ? "" : ` Confiança do especialista: ${Math.round(Math.min(1, Math.max(0, input.confidence)) * 100)}%.`;
  return [
    `Parecer de ${input.expertLabel} (IA) — RECOMENDAÇÃO, não decisão.`,
    input.answerText.trim().slice(0, 6000),
    "",
    input.requiresHumanReview
      ? `Este item é de risco ALTO/CRÍTICO: a recomendação exige REVISÃO HUMANA antes de qualquer ação.${conf}`
      : `A recomendação deve ser revisada por uma pessoa antes de decidir.${conf}`,
    "Esta consulta não alterou o item no ACC. Para registrar uma ação, responda com RESOLVIDO, EM ANDAMENTO ou ENVIAR PARA.",
  ].join("\n");
}
