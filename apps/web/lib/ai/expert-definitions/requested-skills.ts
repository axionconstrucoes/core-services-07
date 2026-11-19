// Catálogo de associação SOLICITADA, não um executor de skills.
// Uma skill presente em ChatGPT/Claude Code não é automaticamente instalada no runtime do ACC.
// O estado só passa a ACTIVE quando a implementação do runtime e sua procedência são verificadas.
import type { OfficialExpertId } from "./types";

export type SkillAssociationState = "PENDING_INSTALLATION" | "ACTIVE";
export interface ExpertSkillAssociation {
  id: string;
  label: string;
  purpose: string;
  state: SkillAssociationState;
  source: "USER_SELECTED";
}

const requested: Record<OfficialExpertId, readonly ExpertSkillAssociation[]> = {
  "legal-consultant": [{
    id: "juridico-contratos-construcao", label: "/juridico-contratos-construcao",
    purpose: "Contratos de obra, empreitada, EPC, FIDIC, Lei 14.133, pleitos, aditivos e reequilíbrio",
    state: "PENDING_INSTALLATION", source: "USER_SELECTED",
  }],
  "planning-director": [{
    id: "planejamento-obras", label: "/planejamento-obras",
    purpose: "Cronograma, caminho crítico, curva S, controle de avanço e custo, Last Planner e análise de atrasos",
    state: "PENDING_INSTALLATION", source: "USER_SELECTED",
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

// Engenharia ainda não possui Expert oficial próprio no catálogo de cinco Experts;
 // manter separada para não prometer que o Diretor de Planejamento executa engenharia.
export const ENGINEERING_SKILL_REQUEST: ExpertSkillAssociation = {
  id: "engenharia-industrial-logistica",
  label: "/engenharia-industrial-logistica",
  purpose: "Galpões, centros de distribuição, fábricas e built-to-suit: estrutura, piso, cobertura, incêndio, instalações e normas ABNT",
  state: "PENDING_INSTALLATION",
  source: "USER_SELECTED",
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
