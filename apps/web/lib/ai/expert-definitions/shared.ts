// Catálogos compartilhados entre Experts — evita duplicar a mesma fonte/
// regra em cinco lugares. Puro, sem I/O.

import type { AuthorizedSourceRef, ExpertCollaborationRule, ExpertEscalationRule, OfficialExpertId } from "./types";

// ============================================================
// Seção 9 do requisito — catálogo formal de fontes.
// Cruzado com o que já foi mapeado em docs/ai/experts.md, seção 18 —
// nunca reafirmado de memória, sempre a mesma fonte de verdade.
// ============================================================

export const SOURCE_CONTRACT_EVENTS: AuthorizedSourceRef = {
  sourceId: "contract_events",
  label: "Event Ledger (eventos contratuais)",
  status: "AVAILABLE",
  note: "Já consumido pelo context builder (build-event-context.ts/build-project-context.ts).",
};
export const SOURCE_EVENT_EVIDENCE: AuthorizedSourceRef = {
  sourceId: "event_evidence",
  label: "Evidências vinculadas a um evento",
  status: "AVAILABLE",
  note: "Já consumido pelo context builder.",
};
export const SOURCE_EVENT_NOTES: AuthorizedSourceRef = {
  sourceId: "event_notes",
  label: "Anotações do Evento (informação declarada, nunca fato documental)",
  status: "AVAILABLE",
  note: "Já consumido como ContextEventNote (sourceType=USER_NOTE, evidentialStatus=DECLARED_CONTEXT).",
};
export const SOURCE_CLAUSES: AuthorizedSourceRef = {
  sourceId: "clauses",
  label: "Cláusulas contratuais",
  status: "AVAILABLE",
  note: "Já consumido via event_clause_confrontation_candidates/event_cross_references.",
};
export const SOURCE_DOCUMENTS: AuthorizedSourceRef = {
  sourceId: "document_versions",
  label: "Contrato, aditivos, anexos, edital, RFI/RFP, propostas e demais documentos do projeto",
  status: "AVAILABLE",
  note: "Já consumido pelo context builder (documento-fonte de cláusulas/evidências).",
};
export const SOURCE_EMAILS: AuthorizedSourceRef = {
  sourceId: "emails",
  label: "E-mails",
  status: "AVAILABLE",
  note: "Já consumido pelo context builder.",
};
export const SOURCE_TIMELINE: AuthorizedSourceRef = {
  sourceId: "timeline_export",
  label: "Timeline Contratual/Jurídico",
  status: "AVAILABLE",
  note: "Implementado (docs/timeline-export.md) — ainda não conectado como fonte de contexto de um Expert, mas real e consultável.",
};
export const SOURCE_ESG_OBLIGATIONS: AuthorizedSourceRef = {
  sourceId: "esg_obligations",
  label: "Obrigações ESG/SSMA contratuais",
  status: "AVAILABLE",
  note: "Implementado (docs/esg-obligations.md); já consumido por ProjectAnalysisContext.esgObligations.",
};
export const SOURCE_ESG_EVIDENCE: AuthorizedSourceRef = {
  sourceId: "esg_obligation_evidence",
  label: "Evidências de comprovação ESG/SSMA (fotos, DDS, documentos)",
  status: "AVAILABLE",
  note: "Implementado — contagem já resumida em ContextEsgObligationSummary.latestSubmissionEvidenceCount.",
};
export const SOURCE_SCHEDULE_ACTIVITIES: AuthorizedSourceRef = {
  sourceId: "schedule_activities",
  label: "Cronograma (atividades, baseline x atual)",
  status: "AVAILABLE",
  note: "Tabela real, consumida em apps/web/lib/data.ts — ainda não incluída no context builder de nenhum Expert.",
};
export const SOURCE_CONTRACT_CHANGES: AuthorizedSourceRef = {
  sourceId: "contract_changes",
  label: "Change Orders / alterações contratuais",
  status: "AVAILABLE",
  note: "Tabela real (contract_changes) — ainda não conectada ao context builder de nenhum Expert.",
};
export const SOURCE_SLA_ACTIONS: AuthorizedSourceRef = {
  sourceId: "sla_actions",
  label: "Ações e Escalonamentos (risco, status, nível de escalonamento)",
  status: "AVAILABLE",
  note: "Implementado (docs/sla-escalation.md) — fonte principal do futuro CEO IA (seção 14 do requisito).",
};
export const SOURCE_LEGAL_CORPUS: AuthorizedSourceRef = {
  sourceId: "legal_sources",
  label: "Fontes legais oficiais (ex.: Código Civil brasileiro)",
  status: "FUTURE_SOURCE",
  note: "Nenhum corpus normativo está versionado/ingerido — ver apps/web/lib/ai/legal/types.ts. baseLegal sempre [] até existir.",
};
export const SOURCE_MEETING_MINUTES: AuthorizedSourceRef = {
  sourceId: "meeting_minutes",
  label: "Atas de reunião",
  status: "FUTURE_SOURCE",
  note: "Sem tabela dedicada — hoje só existiriam como Document/e-mail genérico, sem estrutura própria.",
};
export const SOURCE_DIARIO_OBRA: AuthorizedSourceRef = {
  sourceId: "diario_obra",
  label: "Diário de Obra",
  status: "FUTURE_SOURCE",
  note: "SourceType inclui DIARIO_OBRA, mas não há ingestão/tabela própria implementada.",
};
export const SOURCE_CONSTRUMANAGER: AuthorizedSourceRef = {
  sourceId: "construmanager",
  label: "Construmanager",
  status: "FUTURE_SOURCE",
  note: "SourceType inclui CONSTRUMANAGER, sem integração real implementada.",
};
export const SOURCE_WEEKLY_REPORTS: AuthorizedSourceRef = {
  sourceId: "relatorios_semanais",
  label: "Relatórios semanais",
  status: "FUTURE_SOURCE",
  note: "DocumentKind inclui RELATORIO_SEMANAL, sem estrutura própria além de documento genérico.",
};
export const SOURCE_FORMAL_NOTIFICATIONS: AuthorizedSourceRef = {
  sourceId: "formal_notifications",
  label: "Notificações e respostas a notificações formais",
  status: "FUTURE_SOURCE",
  note: "Não modeladas como entidade própria, distinta de Email/ActionRequest.",
};

export const SOURCE_QUALITY_RECORDS: AuthorizedSourceRef = {
  sourceId: "quality_records",
  label: "Registros de qualidade (RNC, inspeções, ensaios/controle tecnológico, planos corretivos)",
  status: "AVAILABLE",
  note: "Tabelas quality_ncrs, quality_evidence, quality_warranty_cases e quality_customer_complaints, lidas sob RLS por lib/ai/context/build-quality-sources-context.ts (somente leitura; conteúdo embrulhado como DADO externo). Sem registro no projeto = SEM DADOS.",
};
export const SOURCE_WARRANTY_ASSISTANCE: AuthorizedSourceRef = {
  sourceId: "warranty_assistance",
  label: "Garantias e assistência técnica (chamados pós-entrega, termos de garantia, comprovantes de manutenção)",
  status: "AVAILABLE",
  note: "Casos de garantia em quality_warranty_cases (e comprovantes de manutenção em quality_warranty_maintenance), lidos sob RLS por lib/ai/context/build-quality-sources-context.ts; sem registro = SEM DADOS. Chamados/comprovantes fora do ACC continuam sem fonte.",
};
export const SOURCE_INSURANCE_GUARANTEES: AuthorizedSourceRef = {
  sourceId: "insurance_guarantees",
  label: "Apólices, garantias, fianças, endossos e sinistros",
  status: "AVAILABLE",
  note: "Tabelas insurance_policies, insurance_endorsements, insurance_claims e bank_guarantees, lidas sob RLS por lib/ai/context/build-quality-sources-context.ts (somente leitura; conteúdo embrulhado como DADO externo). Sem registro = SEM DADOS; nunca reconhece cobertura em nome da seguradora.",
};
export const SOURCE_LEGAL_REFERENCES_INSURANCE: AuthorizedSourceRef = {
  sourceId: "legal_references_insurance_warranty",
  label: "Índice versionado de referências de seguros e garantias (apps/web/lib/ai/legal/references-insurance-warranty.ts)",
  status: "AVAILABLE",
  note: "Índice de FONTES a conferir (sem texto de lei); fontes secundárias nunca fundamentam conclusão.",
};

export const SHARED_SOURCE_CATALOG: AuthorizedSourceRef[] = [
  SOURCE_CONTRACT_EVENTS,
  SOURCE_EVENT_EVIDENCE,
  SOURCE_EVENT_NOTES,
  SOURCE_CLAUSES,
  SOURCE_DOCUMENTS,
  SOURCE_EMAILS,
  SOURCE_TIMELINE,
  SOURCE_ESG_OBLIGATIONS,
  SOURCE_ESG_EVIDENCE,
  SOURCE_SCHEDULE_ACTIVITIES,
  SOURCE_CONTRACT_CHANGES,
  SOURCE_SLA_ACTIONS,
  SOURCE_LEGAL_CORPUS,
  SOURCE_MEETING_MINUTES,
  SOURCE_DIARIO_OBRA,
  SOURCE_CONSTRUMANAGER,
  SOURCE_WEEKLY_REPORTS,
  SOURCE_FORMAL_NOTIFICATIONS,
  SOURCE_QUALITY_RECORDS,
  SOURCE_WARRANTY_ASSISTANCE,
  SOURCE_INSURANCE_GUARANTEES,
  SOURCE_LEGAL_REFERENCES_INSURANCE,
];

// ============================================================
// Seção 13 do requisito — situações que exigem "DECISÃO HUMANA
// NECESSÁRIA". Núcleo comum a todos os Experts; cada definição pode
// adicionar situações específicas.
// ============================================================

export const CORE_ESCALATION_RULES: ExpertEscalationRule[] = [
  { situation: "Informação insuficiente para concluir", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Conflito entre documentos/fontes", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Valor econômico não disponível nas fontes", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Decisão que gera obrigação para a AXION", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Concessão comercial", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Envio de qualquer comunicação", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Interpretação jurídica crítica", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Risco classificado como ALTO ou CRÍTICO", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
  { situation: "Ação já escalada à Diretoria (ver Matriz de SLA)", requiredDeclaration: "DECISÃO HUMANA NECESSÁRIA" },
];

// ============================================================
// Seção 12 do requisito — TEMA → EXPERT PRINCIPAL → EXPERTS AUXILIARES.
// Matriz mestre única; cada ExpertDefinition só referencia as linhas em
// que participa (ver getCollaborationRulesForExpert em definitions.ts).
// ============================================================

export const EXPERT_COLLABORATION_MATRIX: ExpertCollaborationRule[] = [
  {
    topic: "NEGOCIAÇÃO",
    primaryExpertId: "commercial-director",
    supportingExpertIds: ["legal-consultant"],
    condition: "quando houver risco legal",
  },
  {
    topic: "DISPUTA",
    primaryExpertId: "legal-consultant",
    supportingExpertIds: ["commercial-director", "planning-director", "engineering-director"],
    condition:
      "Diretor de Planejamento IA quando houver prazo envolvido; Diretor de Engenharia e Construção IA quando houver questão técnica de execução",
  },
  {
    topic: "ATRASO COM MULTA",
    primaryExpertId: "planning-director",
    supportingExpertIds: ["legal-consultant", "commercial-director"],
    condition: null,
  },
  {
    topic: "ENGENHARIA E CONSTRUÇÃO",
    primaryExpertId: "engineering-director",
    supportingExpertIds: ["planning-director", "commercial-director"],
    condition:
      "Diretor de Planejamento IA quando houver efeito em prazo; Diretor Comercial IA quando houver efeito em custo/preço",
  },
  {
    topic: "NÃO CONFORMIDADE DE COMPRAS",
    primaryExpertId: "engineering-director",
    supportingExpertIds: ["planning-director", "legal-consultant", "commercial-director"],
    condition: null,
  },
  {
    topic: "SSMA COM PENALIDADE",
    primaryExpertId: "esg-director",
    supportingExpertIds: ["legal-consultant"],
    condition: null,
  },
  {
    topic: "QUALIDADE E NÃO CONFORMIDADE",
    primaryExpertId: "quality-analyst",
    supportingExpertIds: ["engineering-director", "legal-consultant", "planning-director", "commercial-director", "esg-director"],
    condition:
      "Diretor de Engenharia e Construção IA para a avaliação técnica preliminar; Jurídico quando houver contrato/garantia/notificação; Planejamento quando houver prazo; Comercial quando houver custo/medição/retenção; ESG/SSMA quando houver risco a pessoas ou ao ambiente",
  },
  {
    topic: "GARANTIA E ASSISTÊNCIA TÉCNICA",
    primaryExpertId: "quality-analyst",
    supportingExpertIds: ["legal-consultant", "engineering-director", "commercial-director"],
    condition: "Consultor Jurídico IA para garantia contratual/legal, seguro e cobertura; Engenharia para a causa técnica provável; Comercial para o custo da assistência",
  },
  {
    topic: "SEGUROS, GARANTIAS, ENDOSSOS E SINISTROS",
    primaryExpertId: "legal-consultant",
    supportingExpertIds: ["quality-analyst", "commercial-director", "engineering-director"],
    condition: "Analista IA de Qualidade quando houver defeito/evidência técnica a correlacionar; Comercial para valores e condições; Engenharia para a causa técnica",
  },
  {
    topic: "DECISÃO EXECUTIVA",
    primaryExpertId: "ceo",
    supportingExpertIds: ["commercial-director", "legal-consultant", "planning-director", "engineering-director", "esg-director"],
    condition: "consulta somente os Experts necessários ao tema da decisão",
  },
];

export function getCollaborationRulesForExpert(expertId: OfficialExpertId): ExpertCollaborationRule[] {
  return EXPERT_COLLABORATION_MATRIX.filter(
    (rule) => rule.primaryExpertId === expertId || rule.supportingExpertIds.includes(expertId)
  );
}
