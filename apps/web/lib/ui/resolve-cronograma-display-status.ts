// Status de exibição do CRONOGRAMA no Dashboard.
//
// Fonte oficial = arquivo MPP (Microsoft Project) processado: versão de
// cronograma com extração EXTRACTED a partir de um .mpp e baseline ativa.
// Curva S / relatório semanal em Excel (weekly_report_workbooks) é
// evidência COMPLEMENTAR e separada: nunca promove o status.
// Não existe linha de project_integrations para CRONOGRAMA (o cronograma
// é alimentado por documentos/e-mail, não por conector), por isso o
// status armazenado fica PENDENTE mesmo com MPP processado.
//
// Regras: ERRO/ATENCAO armazenados prevalecem; PENDENTE só vira
// CONECTADO com evidência MPP oficial processada; sem evidência ou
// leitura falha (evidence = null) => status armazenado (fail-safe).

import type { IntegrationStatus } from "@axion/types";

export interface CronogramaMppEvidence {
  /** Versões de cronograma originadas de .mpp com extraction_status = EXTRACTED. */
  mppExtractedVersionCount: number;
  /** Existe baseline ativa (não superada) apontando para versão MPP EXTRACTED. */
  hasActiveMppBaseline: boolean;
  /** Complementar, informativo: workbooks de relatório semanal (Excel/Curva S). Nunca promove. */
  weeklyReportWorkbookCount?: number;
}

export function resolveCronogramaDisplayStatus(input: {
  storedStatus: IntegrationStatus | null;
  /** null = leitura falhou/indisponível. */
  evidence: CronogramaMppEvidence | null;
}): IntegrationStatus {
  const stored = input.storedStatus ?? "PENDENTE";
  if (stored === "ERRO" || stored === "ATENCAO") return stored;
  if (stored === "CONECTADO") return stored;
  if (!input.evidence) return stored;
  if (input.evidence.mppExtractedVersionCount > 0 && input.evidence.hasActiveMppBaseline) return "CONECTADO";
  return stored;
}

export function isMppDocumentVersion(mimeType: string | null, filePath: string | null): boolean {
  return (mimeType ?? "").toLowerCase() === "application/vnd.ms-project" || (filePath ?? "").toLowerCase().endsWith(".mpp");
}
