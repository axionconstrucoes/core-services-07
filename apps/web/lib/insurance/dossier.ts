// Montagem do dossiê (checklist) por modalidade. É um roteiro OPERACIONAL de documentos a reunir; NÃO afirma exigência
// legal nem contratual — a exigência real vem da apólice (ver basis). Itens são sincronizados via insurance_dossier_sync.
import type { PolicyModality } from "./types";

export interface DossierItem {
  key: string;
  label: string;
  required: boolean;
  basis: "ROTEIRO_OPERACIONAL_CONFERIR_NA_APOLICE";
}
const item = (key: string, label: string, required = true): DossierItem => ({ key, label, required, basis: "ROTEIRO_OPERACIONAL_CONFERIR_NA_APOLICE" });

const COMMON: DossierItem[] = [
  item("apolice_condicoes", "Apólice com condições gerais, especiais e particulares (todas as versões)"),
  item("endossos", "Endossos emitidos e conferidos (e pedidos pendentes, identificados como tais)"),
  item("contrato_base", "Contrato/documento-fonte que originou a exigência de seguro"),
  item("partes", "Identificação das partes (tomador, segurado, beneficiário, contratante, subcontratante)"),
  item("canal_oficial", "Canal oficial de recebimento da seguradora cadastrado com fonte"),
  item("premio", "Comprovante de pagamento do prêmio/parcelas", false),
];

const BY_MODALITY: Record<PolicyModality, DossierItem[]> = {
  SEGURO_GARANTIA_EXECUTANTE: [
    item("evidencia_inadimplemento_atraso", "Evidências do inadimplemento ou atraso (notificações, cronograma, medições)"),
    item("notificacoes_ao_tomador", "Notificações ao tomador/executante e respostas"),
  ],
  ADIANTAMENTO_PAGAMENTO: [
    item("comprovante_adiantamento", "Comprovante do adiantamento pago"),
    item("aplicacao_documentada", "Documentos que comprovem a aplicação do adiantamento"),
    item("extrato_amortizacoes", "Extrato de amortizações e saldo não amortizado"),
  ],
  RETENCAO_PAGAMENTOS: [item("demonstrativo_retencoes", "Demonstrativo das retenções e das medições correspondentes")],
  POS_ENTREGA: [
    item("termo_recebimento", "Termo de recebimento/entrega e data de início do período"),
    item("comprovantes_manutencao", "Comprovantes de manutenção/uso conforme manual", false),
    item("laudo_defeito", "Laudo ou registro do defeito"),
  ],
  RISCOS_ENGENHARIA: [
    item("cronograma_obra", "Cronograma e fase da obra na data do evento"),
    item("relatorio_ocorrencia", "Relatório da ocorrência com fotos e diário de obra"),
    item("orcamento_reparo", "Orçamentos/estimativas de reparo (somente se existentes)", false),
  ],
  RC_GERAL: [
    item("identificacao_causador_vitima", "Identificação do causador e da vítima"),
    item("laudo_dano", "Laudo/registro do dano e do bem atingido (terceiro x própria obra)"),
  ],
  RC_CRUZADA: [
    item("identificacao_causador_vitima", "Identificação do causador e da vítima (subcontratadas/segurados)"),
    item("contratos_subcontratadas", "Contratos das empresas envolvidas"),
    item("checklist_rcc", "Checklist RCC (10 perguntas) preenchido com fonte"),
    item("laudo_dano", "Laudo/registro do dano e do bem atingido (terceiro x própria obra)"),
  ],
  RC_PROFISSIONAL: [
    item("escopo_servico_profissional", "Escopo do serviço profissional e documentos de responsabilidade técnica, se aplicáveis", false),
    item("reclamacao_terceiro", "Reclamação/pretensão do terceiro"),
  ],
  MAQUINAS_EQUIPAMENTOS: [
    item("identificacao_equipamento", "Identificação do equipamento (nota fiscal, série) e local"),
    item("historico_manutencao", "Histórico de manutenção", false),
    item("relatorio_ocorrencia", "Relatório da ocorrência"),
  ],
};

export function buildDossierChecklist(modality: PolicyModality): DossierItem[] {
  const seen = new Set<string>();
  return [...COMMON, ...BY_MODALITY[modality]].filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

export interface DossierProgress {
  total: number;
  requiredPending: string[];
  complete: boolean;
}
export function dossierProgress(items: { key: string; required: boolean; status: "PENDENTE" | "ANEXADO" | "DISPENSADO" | "NAO_APLICAVEL" }[]): DossierProgress {
  const requiredPending = items.filter((i) => i.required && i.status === "PENDENTE").map((i) => i.key);
  return { total: items.length, requiredPending, complete: requiredPending.length === 0 && items.length > 0 };
}
