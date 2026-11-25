// Catálogo de associação SOLICITADA, não um executor de skills.
// Uma skill presente em ChatGPT/Claude Code não é automaticamente instalada no runtime do ACC.
// Estados (nunca "instalada no ACC" — o runtime do ACC não executa skills do Claude Code):
//   - PENDING_INSTALLATION: só a associação foi pedida; nada do conteúdo chega ao prompt do Expert.
//   - RUNTIME_SUMMARY_INTEGRATED: um RESUMO TÉCNICO PRÓPRIO (paráfrase, versionado em
//     apps/web/lib/ai/expert-knowledge/) entra no prompt do Expert; a skill original continua
//     disponível somente no ambiente Claude Code local e seu texto NÃO está no repositório.
import { ENGINEERING_KNOWLEDGE_PROVENANCE, ENGINEERING_KNOWLEDGE_VERSION } from "../expert-knowledge/engineering";
import { PLANNING_KNOWLEDGE_PROVENANCE, PLANNING_KNOWLEDGE_VERSION } from "../expert-knowledge/planning";
import type { OfficialExpertId } from "./types";

export type SkillAssociationState = "PENDING_INSTALLATION" | "RUNTIME_SUMMARY_INTEGRATED";

export interface SkillRuntimeIntegration {
  /** Módulo versionado que leva o resumo próprio ao prompt do Expert. */
  module: string;
  moduleVersion: string;
  /** sha256 completo do SKILL.md lido para escrever o resumo (procedência). */
  sourceSkillSha256: string;
  readAt: string;
  /** Sempre false: o texto original da skill não é copiado para o repositório. */
  originalTextInRepository: false;
}

export interface ExpertSkillAssociation {
  id: string;
  label: string;
  purpose: string;
  state: SkillAssociationState;
  source: "USER_SELECTED";
  /** Presente somente quando state = RUNTIME_SUMMARY_INTEGRATED. */
  runtimeIntegration?: SkillRuntimeIntegration;
}

export const SKILL_STATE_LABEL: Record<SkillAssociationState, string> = {
  PENDING_INSTALLATION: "Pendente de integração ao ACC",
  RUNTIME_SUMMARY_INTEGRATED:
    "Conhecimento técnico integrado ao runtime por resumo próprio; skill original disponível só no ambiente Claude Code local",
};

const requested: Record<OfficialExpertId, readonly ExpertSkillAssociation[]> = {
  "quality-analyst": [],
  "legal-consultant": [{
    id: "juridico-contratos-construcao", label: "/juridico-contratos-construcao",
    purpose: "Contratos de obra, empreitada, EPC, FIDIC, Lei 14.133, pleitos, aditivos e reequilíbrio",
    state: "PENDING_INSTALLATION", source: "USER_SELECTED",
  }],
  "planning-director": [
    {
      id: PLANNING_KNOWLEDGE_PROVENANCE.skillName, label: `/${PLANNING_KNOWLEDGE_PROVENANCE.skillName}`,
      purpose: "Planejamento de obras logísticas, industriais e de saúde: sequência, caminho crítico típico, suprimentos de longo prazo, aprovações e comissionamento",
      state: "RUNTIME_SUMMARY_INTEGRATED", source: "USER_SELECTED",
      runtimeIntegration: {
        module: "apps/web/lib/ai/expert-knowledge/planning.ts",
        moduleVersion: PLANNING_KNOWLEDGE_VERSION,
        sourceSkillSha256: PLANNING_KNOWLEDGE_PROVENANCE.skillSha256,
        readAt: PLANNING_KNOWLEDGE_PROVENANCE.readAt,
        originalTextInRepository: false,
      },
    },
    {
      id: "planejamento-obras", label: "/planejamento-obras",
      purpose: "Cronograma, caminho crítico, curva S, controle de avanço e custo e análise de atrasos (técnica geral)",
      state: "PENDING_INSTALLATION", source: "USER_SELECTED",
    },
  ],
  "engineering-director": [{
    id: ENGINEERING_KNOWLEDGE_PROVENANCE.skillName, label: `/${ENGINEERING_KNOWLEDGE_PROVENANCE.skillName}`,
    purpose: "Galpões, centros de distribuição, fábricas e built-to-suit: estrutura, piso, cobertura, fundações, incêndio, instalações e métodos construtivos",
    state: "RUNTIME_SUMMARY_INTEGRATED", source: "USER_SELECTED",
    runtimeIntegration: {
      module: "apps/web/lib/ai/expert-knowledge/engineering.ts",
      moduleVersion: ENGINEERING_KNOWLEDGE_VERSION,
      sourceSkillSha256: ENGINEERING_KNOWLEDGE_PROVENANCE.skillSha256,
      readAt: ENGINEERING_KNOWLEDGE_PROVENANCE.readAt,
      originalTextInRepository: false,
    },
  }],
  "esg-director": [{
    id: "ssma-esg-construcao", label: "/ssma-esg-construcao",
    purpose: "Segurança NR-18, NR-35 e PGR; meio ambiente, resíduos, licenciamento e ESG",
    state: "PENDING_INSTALLATION", source: "USER_SELECTED",
  }],
  "commercial-director": [{
    id: "comercial-construcao", label: "/comercial-construcao",
    purpose: "Editais, decisão de participar, SINAPI, SICRO, BDI, orçamentos e propostas",
    state: "PENDING_INSTALLATION", source: "USER_SELECTED",
  }],
  "ceo": [{
    id: "ceo-construcao", label: "/ceo-construcao",
    purpose: "Decisões executivas: carteira de obras, margem, caixa, risco e estratégia",
    state: "PENDING_INSTALLATION", source: "USER_SELECTED",
  }],
};

export const SKILL_DISCOVERY_TOOL = {
  id: "find-skills",
  label: "/find-skills",
  purpose: "Localizar skills disponíveis para instalação e administração; não é skill de análise de obra.",
  state: "PENDING_INSTALLATION" as const,
};

export function requestedSkillsForExpert(expertId: OfficialExpertId): readonly ExpertSkillAssociation[] {
  return requested[expertId];
}
