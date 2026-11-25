// Inventário (puro, sem I/O) dos dados comerciais/orçamentários que o
// Diretor Comercial IA pode pedir, e de onde cada um vem HOJE no ACC.
// Levantado por leitura das migrations em supabase/migrations e de
// apps/web/lib/{additionals,integrations,financial,schedule}. Quando o
// ACC não tem o dado de forma estruturada, o carregador marca o item como
// "Dado não disponível no ACC" — nunca estima.

import type { CommercialDataKey } from "./types";

export type CommercialInventoryPresence = "SIM" | "PARCIAL" | "NAO";

export interface CommercialInventoryEntry {
  key: CommercialDataKey;
  label: string;
  presence: CommercialInventoryPresence;
  /** Onde o dado vive no ACC (tabela/campo) — null quando não existe. */
  where: string | null;
  /** O carregador lê este dado? */
  usedByLoader: boolean;
  /**
   * Núcleo econômico: sem ele nenhuma concessão pode ser declarada
   * economicamente aceitável — exige análise de Orçamentos.
   */
  economicCore: boolean;
  note: string;
}

export const COMMERCIAL_DATA_INVENTORY: readonly CommercialInventoryEntry[] = [
  {
    key: "CONTRATO_BASE",
    label: "Contrato-base (cliente, número, prazo contratual)",
    presence: "SIM",
    where: "projects (client, contract_number, start_date, baseline_end_date)",
    usedByLoader: true,
    economicCore: false,
    note: "Não há valor global do contrato em campo estruturado.",
  },
  {
    key: "ORCAMENTO_BASE_E_REVISOES",
    label: "Orçamento-base e revisões",
    presence: "PARCIAL",
    where:
      "documents/document_versions (kind PLANILHA/PROPOSTA_AXION, source_type ORCAMENTO) e additional_proposal_drive_sources (AXION_ESTIMATE/PLANILHA_AXION) — somente metadados do arquivo",
    usedByLoader: true,
    economicCore: false,
    note: "O ACC registra a existência e a versão do arquivo, não as linhas/valores do orçamento.",
  },
  {
    key: "CUSTOS_DIRETOS",
    label: "Custos diretos",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: true,
    note: "Sem tabela de composição de custos. A coluna 'custo' da aba FINANCEIRO do relatório semanal é realizado da obra, não custo orçado.",
  },
  {
    key: "CUSTOS_INDIRETOS",
    label: "Custos indiretos",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: true,
    note: "Sem registro estruturado.",
  },
  {
    key: "BDI",
    label: "BDI",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: true,
    note: "Sem registro estruturado.",
  },
  {
    key: "PRECO_DE_VENDA",
    label: "Preço de venda",
    presence: "PARCIAL",
    where:
      "project_additional_proposals.proposed_value (estimativa de preço de venda, ex.: B12 da aba FECHAMENTO) e contracted_value (adicionais contratados)",
    usedByLoader: true,
    economicCore: false,
    note: "Somente para propostas de adicionais; não há preço de venda do contrato-base.",
  },
  {
    key: "MARGEM_PREVISTA",
    label: "Margem prevista",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: true,
    note: "Sem registro estruturado — nunca derivar de preço de venda.",
  },
  {
    key: "CONTINGENCIAS",
    label: "Contingências",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: true,
    note: "Sem registro estruturado.",
  },
  {
    key: "PREMISSAS_DO_ORCAMENTO",
    label: "Premissas do orçamento",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: false,
    note: "Podem existir dentro dos arquivos de orçamento, mas não são extraídas.",
  },
  {
    key: "PRODUTIVIDADE",
    label: "Produtividade",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: false,
    note: "O histograma do relatório semanal traz recursos previstos/realizados, não índices de produtividade orçados.",
  },
  {
    key: "ALTERNATIVAS_DE_ENGENHARIA",
    label: "Alternativas de engenharia",
    presence: "NAO",
    where: null,
    usedByLoader: false,
    economicCore: false,
    note: "Sem registro estruturado.",
  },
  {
    key: "RISCOS_DE_EXECUCAO",
    label: "Riscos de execução",
    presence: "PARCIAL",
    where: "project_delivery_items (risk ALTA/CRITICA, blocks_delivery); risk_alert_cases existe mas não é lido aqui",
    usedByLoader: true,
    economicCore: false,
    note: "Riscos operacionais/de entrega — não são a matriz de riscos do orçamento.",
  },
  {
    key: "CRONOGRAMA_E_IMPACTOS_FINANCEIROS",
    label: "Cronograma e impactos financeiros",
    presence: "PARCIAL",
    where:
      "project_schedule_baselines/schedule_versions; weekly_report_sheets (category FINANCEIRO, RLS can_view_project_financial_dashboard); contract_changes.technical_additional_days",
    usedByLoader: true,
    economicCore: false,
    note: "A aba FINANCEIRO só é lida com acesso financeiro (ADMINISTRADOR/GERENTE ou área DIRETORIA/FINANCEIRO).",
  },
  {
    key: "CONDICOES_DE_CONTRATACAO",
    label: "Condições de contratação",
    presence: "PARCIAL",
    where: "clauses (texto de cláusulas dos documentos contratuais) e project_additional_proposals.formalization_type",
    usedByLoader: true,
    economicCore: false,
    note: "O texto das cláusulas chega ao Expert pelo contexto contratual (buildProjectAnalysisContext/buildEventAnalysisContext); aqui só a contagem.",
  },
  {
    key: "PROPOSTAS_ADICIONAIS",
    label: "Propostas de adicionais (estágio e aprovações)",
    presence: "SIM",
    where: "project_additional_proposals (status, aprovações independentes, formalização)",
    usedByLoader: true,
    economicCore: false,
    note: "Estágio comercial das propostas de adicionais da obra.",
  },
  {
    key: "RESPOSTAS_DE_ORCAMENTOS",
    label: "Respostas de Orçamentos a revisões de projeto",
    presence: "SIM",
    where: "construmanager_version_impact_reviews (price_impact, budget_response, status PENDENTE_ORCAMENTO)",
    usedByLoader: true,
    economicCore: false,
    note: "Resposta textual de Orçamentos sobre impacto de preço de nova revisão de documento.",
  },
  {
    key: "ALTERACOES_CONTRATUAIS",
    label: "Alterações contratuais (pleitos/aditivos em curso)",
    presence: "SIM",
    where: "contract_changes (status, client_formalization_status, schedule_impact_status, technical_additional_days)",
    usedByLoader: true,
    economicCore: false,
    note: "Sem valor monetário estruturado.",
  },
];

export const ECONOMIC_CORE_KEYS: readonly CommercialDataKey[] = COMMERCIAL_DATA_INVENTORY.filter(
  (entry) => entry.economicCore
).map((entry) => entry.key);

export function getInventoryEntry(key: CommercialDataKey): CommercialInventoryEntry {
  const entry = COMMERCIAL_DATA_INVENTORY.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`Categoria comercial desconhecida: ${key}`);
  return entry;
}
