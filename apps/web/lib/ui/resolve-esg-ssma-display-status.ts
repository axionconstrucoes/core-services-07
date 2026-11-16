// ESG/SSMA no Dashboard: distingue (puro, sem I/O)
//   (1) MÓDULO SSMA operacional — formulários, registros de campo e ações corretivas existem DENTRO do ACC; e
//   (2) INTEGRAÇÃO EXTERNA ESG/SSMA conectada — a fonte externa (pasta/Drive) configurada e verificada (project_integrations.status).
//
// Problema: o selo mostrava só "ESG/SSMA pendente", dando a impressão de que o módulo SSMA não funcionava, embora houvesse operação
// real. Regra: o STATUS da integração externa NUNCA é promovido por existirem registros internos (PENDENTE continua PENDENTE; ERRO e
// ATENCAO armazenados continuam como estão). O que muda é o RÓTULO exibido: ele informa, com fatos, o estado do módulo SSMA ao lado do
// da integração externa — assim o cabeçalho segue honesto ("integrações parciais") e a equipe entende o que está pendente.

import type { IntegrationStatus } from "@axion/types";

export interface SsmaOperationEvidence {
  formSubmissions: number;
  fieldRecords: number;
  correctiveActions: number;
  /** Fotos cuja sincronização com o Drive falhou (drive_sync_status = FAILED). */
  photosFailed: number;
}

export type SsmaModuleState = "OPERACIONAL" | "COM_FALHA_DE_FOTOS" | "SEM_REGISTROS" | "NAO_VERIFICADO";

/** Estado do módulo SSMA a partir de registros reais do projeto. null (leitura falhou/sem permissão) => NAO_VERIFICADO (nada é afirmado). */
export function resolveSsmaModuleState(evidence: SsmaOperationEvidence | null): SsmaModuleState {
  if (!evidence) return "NAO_VERIFICADO";
  if (evidence.formSubmissions + evidence.fieldRecords + evidence.correctiveActions <= 0) return "SEM_REGISTROS";
  return evidence.photosFailed > 0 ? "COM_FALHA_DE_FOTOS" : "OPERACIONAL";
}

/**
 * Rótulo da fonte ESG/SSMA no resumo de integrações. Só qualifica quando a integração externa NÃO está conectada (CONECTADO mantém o
 * rótulo original) e o módulo SSMA tem operação comprovada. Nunca altera o status.
 */
export function resolveEsgSsmaIntegrationLabel(baseLabel: string, storedStatus: IntegrationStatus | null | undefined, evidence: SsmaOperationEvidence | null): string {
  if (storedStatus === "CONECTADO") return baseLabel;
  const moduleState = resolveSsmaModuleState(evidence);
  if (moduleState === "OPERACIONAL") return `${baseLabel} (módulo SSMA operacional; integração externa não conectada)`;
  if (moduleState === "COM_FALHA_DE_FOTOS") return `${baseLabel} (módulo SSMA em uso, com fotos sem sincronizar; integração externa não conectada)`;
  return baseLabel;
}
