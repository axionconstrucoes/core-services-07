// Roteamento determinístico de uma nova informação para o(s) Expert(s)
// competente(s) (seção 5 do requisito de curadoria multiagente). Sempre
// derivado de EXPERT_COLLABORATION_MATRIX (expert-definitions/shared.ts)
// — nunca uma segunda matriz paralela. Classificação por palavra-chave é
// determinística e auditável (nunca uma chamada de IA para decidir quem
// consultar); a análise de fato (IA) só começa depois do roteamento.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailAttachmentsForEmail } from "../../email/attachments/get-email-attachments";
import { EXPERT_COLLABORATION_MATRIX } from "../expert-definitions/shared";
import type { OfficialExpertId } from "../expert-definitions/types";
import { detectTopicExperts } from "../routing/expert-topics";
import type { CurationInput, ExpertRoutingDecision } from "./types";

const NEGOTIATION_KEYWORDS = [
  "escopo adicional",
  "aditivo",
  "preço",
  "reajuste",
  "negocia",
  "proposta",
  "contraproposta",
  "concessão",
  "desconto",
  "medição",
  "pagamento",
];

const DISPUTE_KEYWORDS = [
  "disputa", "litígio", "arbitragem", "notificação formal", "inadimplemento", "descumprimento",
  "desentendimento", "animosidade", "hostilidade", "conflito com o cliente",
];

const SCHEDULE_KEYWORDS = [
  "atraso", "prazo", "extensão de prazo", "cronograma", "aceleração", "aceleracao",
  "nova versão", "nova versao", "nova revisão", "nova revisao",
];

const SUPPLY_CHAIN_KEYWORDS = [
  "devolução", "devolucao", "má qualidade", "ma qualidade", "equipe insuficiente",
  "funcionários insuficientes", "funcionarios insuficientes", "não conformidade de compras",
  "nao conformidade de compras", "problema de pagamento", "problemas de pagamento",
];

const PENALTY_KEYWORDS = ["multa", "penalidade", "paralisação", "paralisacao", "retenção", "retencao"];

// Seguros, garantias financeiras e sinistros (competência do Consultor Jurídico IA; apoio de Qualidade quando houver defeito).
const INSURANCE_KEYWORDS = [
  "apólice", "apolice", "seguro", "sinistro", "seguradora", "fiança", "fianca", "endosso", "caução", "caucao",
  "performance bond", "resseguro", "susep",
];

// Garantia contratual/legal e assistência técnica (pós-entrega) — competência do Analista IA de Qualidade.
const WARRANTY_KEYWORDS = ["garantia", "assistência técnica", "assistencia tecnica", "pós-entrega", "pos-entrega", "pós entrega", "pos entrega"];

const ESG_KEYWORDS = ["ssma", "segurança do trabalho", "seguranca do trabalho", "meio ambiente", "esg", "acidente", "epi", "licença ambiental", "licenca ambiental"];

function containsAny(haystack: string, keywords: string[]): boolean {
  return keywords.some((keyword) => haystack.includes(keyword));
}

function findMatrixRow(topic: string) {
  return EXPERT_COLLABORATION_MATRIX.find((rule) => rule.topic === topic) ?? null;
}

/**
 * Classifica `input.description` e devolve a decisão de roteamento.
 * Nunca lê o banco para classificar — só a checagem de anexos (seção 7)
 * é I/O, e é sempre separada da classificação por palavra-chave.
 */
export function classifyCurationTopic(description: string): { topic: string; primaryExpertIds: OfficialExpertId[]; supportingExpertIds: OfficialExpertId[]; reason: string } {
  const normalized = description.toLowerCase();

  // Seguros/sinistros antes de disputa: o tema é jurídico-securitário, com Qualidade como apoio quando há defeito.
  if (containsAny(normalized, INSURANCE_KEYWORDS)) {
    const row = findMatrixRow("SEGUROS, GARANTIAS, ENDOSSOS E SINISTROS")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason: `Tema de seguro/garantia financeira/sinistro detectado — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
    };
  }

  if (containsAny(normalized, DISPUTE_KEYWORDS)) {
    const row = findMatrixRow("DISPUTA")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason: `Palavra-chave de disputa/notificação formal detectada — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
    };
  }

  if (containsAny(normalized, SUPPLY_CHAIN_KEYWORDS)) {
    const row = findMatrixRow("NÃO CONFORMIDADE DE COMPRAS")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason:
        "Não conformidade da cadeia de suprimentos detectada — Diretor de Engenharia e Construção IA analisa o efeito técnico na execução, " +
        "Planejamento o efeito em prazo e Comercial/Jurídico os impactos.",
    };
  }

  // Qualidade/garantia: não conformidade, defeito, vício, inspeção, assistência técnica. Antes de negociação/prazo,
  // porque o achado de qualidade é o fato gerador; custo e prazo entram como apoio.
  // Não conformidade de SSMA/ESG continua sendo do Diretor de ESG IA (tratada mais abaixo).
  if (detectTopicExperts(normalized).includes("quality-analyst") && !containsAny(normalized, ESG_KEYWORDS)) {
    const row = findMatrixRow(containsAny(normalized, WARRANTY_KEYWORDS) ? "GARANTIA E ASSISTÊNCIA TÉCNICA" : "QUALIDADE E NÃO CONFORMIDADE")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason: `Tema de qualidade/garantia detectado — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
    };
  }

  if (containsAny(normalized, NEGOTIATION_KEYWORDS)) {
    const row = findMatrixRow("NEGOCIAÇÃO")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason: `Palavra-chave de negociação/escopo adicional/preço detectada — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
    };
  }

  // Engenharia (fundações, estruturas, pisos, coberturas, método construtivo, compatibilização) antes de
  // prazo: a questão técnica é do engineering-director; o efeito em prazo entra como apoio do planning-director.
  if (detectTopicExperts(normalized).includes("engineering-director")) {
    const row = findMatrixRow("ENGENHARIA E CONSTRUÇÃO")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason: `Tema de engenharia e construção detectado — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
    };
  }

  if (containsAny(normalized, SCHEDULE_KEYWORDS)) {
    const row = findMatrixRow("ATRASO COM MULTA")!;
    return {
      topic: row.topic,
      primaryExpertIds: [row.primaryExpertId],
      supportingExpertIds: row.supportingExpertIds,
      reason: `Palavra-chave de atraso/prazo/cronograma detectada — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
    };
  }

  if (containsAny(normalized, ESG_KEYWORDS)) {
    const hasContractualConsequence = containsAny(normalized, PENALTY_KEYWORDS);
    if (hasContractualConsequence) {
      const row = findMatrixRow("SSMA COM PENALIDADE")!;
      return {
        topic: row.topic,
        primaryExpertIds: [row.primaryExpertId],
        supportingExpertIds: row.supportingExpertIds,
        reason: `Palavra-chave de SSMA/ESG com consequência contratual (multa/penalidade/paralisação/retenção) detectada — roteado por EXPERT_COLLABORATION_MATRIX (tema "${row.topic}").`,
      };
    }
    return {
      topic: "SSMA",
      primaryExpertIds: ["esg-director"],
      supportingExpertIds: [],
      reason: "Palavra-chave de SSMA/ESG detectada, sem consequência contratual explícita (multa/penalidade) — só o Diretor de ESG IA é consultado.",
    };
  }

  const row = findMatrixRow("DECISÃO EXECUTIVA")!;
  return {
    topic: "GERAL",
    primaryExpertIds: [row.primaryExpertId],
    supportingExpertIds: row.supportingExpertIds,
    reason:
      "Nenhum tema específico foi reconhecido na descrição — tratado como multi-área: todos os Experts especializados " +
      `são consultados e o CEO IA consolida (mesma composição do tema "${row.topic}" em EXPERT_COLLABORATION_MATRIX).`,
  };
}

/**
 * Decide o roteamento para uma CurationInput. Assíncrono porque, quando
 * `input.emailId` está presente, checa se algum anexo do e-mail ainda
 * não foi processado (seção 7 do requisito) — nunca finge que analisou o
 * conteúdo de um anexo só porque conhece o filename.
 */
export async function decideExpertRouting(supabase: SupabaseClient, input: CurationInput): Promise<ExpertRoutingDecision> {
  const preRouted = (input.requestedExpertIds ?? []).filter((expertId) => expertId !== "ceo");
  const classification =
    preRouted.length > 0
      ? {
          topic: "MULTIDISCIPLINAR",
          primaryExpertIds: Array.from(new Set(preRouted)),
          supportingExpertIds: [] as OfficialExpertId[],
          reason:
            "Temas já identificados pelo roteamento por assunto do caminho de origem (lib/ai/routing/expert-topics.ts) — " +
            "um parecer por Expert e consolidação pelo CEO IA.",
        }
      : classifyCurationTopic(input.description);

  let sourceRequiresProcessing = false;
  let unprocessedAttachmentFileNames: string[] = [];

  if (input.emailId) {
    const attachments = await getEmailAttachmentsForEmail(supabase, input.emailId);
    const unprocessed = attachments.filter((attachment) => attachment.processingStatus !== "PROCESSED");
    sourceRequiresProcessing = unprocessed.length > 0;
    unprocessedAttachmentFileNames = unprocessed.map((attachment) => attachment.originalFileName);
  }

  return {
    topic: classification.topic,
    primaryExpertIds: classification.primaryExpertIds,
    supportingExpertIds: classification.supportingExpertIds,
    reason: classification.reason,
    sourceRequiresProcessing,
    unprocessedAttachmentFileNames,
  };
}
