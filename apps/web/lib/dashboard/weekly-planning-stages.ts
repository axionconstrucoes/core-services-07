// Etapas do recebimento do planejamento semanal no Dashboard executivo.
// Puro, sem I/O. Separa fatos que o painel misturava sob "Cronograma
// atualizado" e "Relatório semanal processado":
//   1. Relatório semanal (Excel) RECEBIDO ...... anexo RELATORIO_SEMANAL_PLANEJAMENTO persistido;
//   2. Relatório semanal PROCESSADO ............ weekly_report_workbooks.status;
//   3. Curva S EXTRAÍDA / Linha de base (aba) .. weekly_report_sheets.status por categoria;
//   4. Baseline oficial RECONHECIDA ............ project_weekly_schedule_ingestion_configs.baseline_schedule_version_id;
//   5. Arquivo de cronograma (MPP) RECEBIDO .... anexo CRONOGRAMA_MPP e seu processing_status;
//   6. Cronograma ATUALIZADO (semana) .......... regra semanal resolveWeeklyCronogramaStatus (MPP de remetente
//                                                autorizado, processado, na semana esperada). Excel/Curva S nunca promove.
// Antes, o ponto ficava verde sempre que existia a linha (mesmo com status
// MISSING_SHEET, FAILED ou anexo PENDING) e só o selo de texto mudava.

export type StageTone = "ok" | "warning" | "error" | "neutral";

export interface StageView {
  tone: StageTone;
  /** Texto curto exibido à direita (PT-BR). */
  text: string;
}

const SHEET_STATUS: Record<string, StageView> = {
  EXTRACTED: { tone: "ok", text: "Extraída" },
  HUMAN_VALIDATED: { tone: "ok", text: "Validada" },
  HUMAN_MAPPED: { tone: "ok", text: "Mapeada (humano)" },
  PENDING_HUMAN_REVIEW: { tone: "warning", text: "Aguard. revisão" },
  AMBIGUOUS_SHEET: { tone: "warning", text: "Aba ambígua" },
  MISSING_SHEET: { tone: "error", text: "Aba ausente" },
  FAILED: { tone: "error", text: "Falha" },
};

/** Aba do relatório semanal (Curva S, Linha de base, Financeiro, SSMA, Histograma). null = workbook sem a aba/sem workbook. */
export function sheetStage(status: string | null | undefined): StageView {
  if (!status) return { tone: "neutral", text: "Ausente" };
  return SHEET_STATUS[status] ?? { tone: "warning", text: status };
}

const WORKBOOK_STATUS: Record<string, StageView> = {
  EXTRACTED: { tone: "ok", text: "Processado" },
  PARTIAL: { tone: "warning", text: "Parcial" },
  PENDING_HUMAN_REVIEW: { tone: "warning", text: "Aguard. revisão" },
  LEGACY_FORMAT_REVIEW_REQUIRED: { tone: "warning", text: "Formato antigo" },
  INVALID_FILE: { tone: "error", text: "Arquivo inválido" },
  FAILED: { tone: "error", text: "Falha" },
};

/** Relatório semanal: recebido (anexo) × processado (workbook). */
export function weeklyReportStage(input: { attachmentReceived: boolean; workbookStatus: string | null | undefined }): StageView {
  if (!input.attachmentReceived) return { tone: "warning", text: "Não recebido" };
  if (!input.workbookStatus) return { tone: "warning", text: "Recebido, não processado" };
  return WORKBOOK_STATUS[input.workbookStatus] ?? { tone: "warning", text: input.workbookStatus };
}

/** Arquivo de cronograma (MPP) recebido por e-mail: anexo × processing_status do anexo. */
export function mppFileStage(input: { attachmentReceived: boolean; processingStatus: string | null | undefined }): StageView {
  if (!input.attachmentReceived) return { tone: "warning", text: "Não recebido" };
  switch (input.processingStatus) {
    case "PROCESSED":
      return { tone: "ok", text: "Recebido e processado" };
    case "FAILED":
      return { tone: "error", text: "Recebido, falha no processamento" };
    case "PENDING":
      return { tone: "warning", text: "Recebido, não processado" };
    default:
      return { tone: "warning", text: input.processingStatus ? `Recebido (${input.processingStatus})` : "Recebido, status desconhecido" };
  }
}

/** Baseline oficial (versão de cronograma) configurada para comparação semanal. null leitura = indisponível. */
export function baselineStage(input: { configRead: boolean; baselineScheduleVersionId: string | null | undefined }): StageView {
  if (!input.configRead) return { tone: "neutral", text: "Não verificável" };
  return input.baselineScheduleVersionId ? { tone: "ok", text: "Configurada" } : { tone: "warning", text: "Não configurada" };
}

/** Cronograma atualizado na semana, a partir da resolução semanal (CONECTADO = MPP da semana processado). */
export function scheduleUpdatedStage(input: { status: string; detail: string | null; evaluated: boolean }): StageView {
  if (!input.evaluated) return { tone: "neutral", text: "Não verificável" };
  if (input.status === "CONECTADO") return { tone: "ok", text: "Atualizado na semana" };
  if (input.status === "ERRO") return { tone: "error", text: input.detail ?? "Erro" };
  return { tone: "warning", text: input.detail ?? "Pendente" };
}
