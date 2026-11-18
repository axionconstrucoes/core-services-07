// Orquestrador (I/O via porta WeeklyReportWorkbookStore) do processamento
// das planilhas do relatório semanal. Idempotente: UNIQUE por anexo; a
// reexecução relê o arquivo (mesmo SHA-256) e atualiza, preservando
// mapeamentos/validações humanas. XLS legado ou arquivo inválido nunca é
// aberto como XLSX: vira LEGACY_FORMAT_REVIEW_REQUIRED / INVALID_FILE com o
// arquivo preservado e listado.

import { sanitizeErrorMessage } from "../weekly-ingestion/ingest-weekly-schedule-email";
import type { RelatedWorkbook, WeeklyReportWorkbookStore } from "../weekly-ingestion/store";
import { processWorkbookGrids } from "./process-workbook";
import { readWorkbookSafely } from "./read-workbook";
import type { WeeklyReportWorkbookResult } from "./types";

export interface WorkbookLineage {
  /** Leitura anterior com o MESMO SHA-256 (arquivo idêntico reenviado/reanexado). */
  duplicateOf: RelatedWorkbook | null;
  /** Leituras anteriores da MESMA semana com conteúdo DIFERENTE (revisão legítima). */
  revisionOf: RelatedWorkbook[];
}

/** Puro: duplicata = mesmo SHA-256; revisão = mesma semana, SHA diferente. */
export function resolveWorkbookLineage(sha256: string, workWeekLabel: string | null, related: RelatedWorkbook[]): WorkbookLineage {
  const ordered = [...related].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return {
    duplicateOf: ordered.find((item) => item.sha256 === sha256) ?? null,
    revisionOf: workWeekLabel ? ordered.filter((item) => item.sha256 !== sha256 && item.workWeekLabel === workWeekLabel) : [],
  };
}

/**
 * Duplicata: os dados extraídos ficam registrados (rastreabilidade), mas as
 * abas NÃO recebem classificação de risco — o caso pertence à primeira
 * leitura do arquivo. Revisão: processada normalmente, marcada como tal (a
 * mais recente por envio prevalece no ciclo de alertas).
 */
export function applyWorkbookLineage(result: WeeklyReportWorkbookResult, lineage: WorkbookLineage): WeeklyReportWorkbookResult {
  if (!lineage.duplicateOf && lineage.revisionOf.length === 0) return result;
  const sheets = result.sheets.map((sheet) => {
    const alerts = [...sheet.alerts];
    let riskClassification = sheet.riskClassification;
    let riskReasons = sheet.riskReasons;
    if (lineage.duplicateOf) {
      alerts.push({ code: "DUPLICATE_FILE", detail: `Arquivo idêntico (mesmo SHA-256) já lido na planilha ${lineage.duplicateOf.id}${lineage.duplicateOf.workWeekLabel ? ` (${lineage.duplicateOf.workWeekLabel})` : ""} — duplicata não gera caso de risco próprio; registro preservado.`, severity: "INFO" });
      if (riskClassification !== null) {
        riskReasons = [`Duplicata da planilha ${lineage.duplicateOf.id}: classificação ${riskClassification} não aplicada (o caso pertence à primeira leitura).`, ...riskReasons];
        riskClassification = null;
      }
    } else {
      alerts.push({ code: "REVISION_OF_WEEK", detail: `Revisão da semana: conteúdo diferente de ${lineage.revisionOf.length} leitura(s) anterior(es) (${lineage.revisionOf.map((item) => item.id).join(", ")}).`, severity: "INFO" });
    }
    return { ...sheet, alerts, riskClassification, riskReasons };
  });
  return {
    ...result,
    sheets,
    summary: {
      ...result.summary,
      lineage: {
        duplicateOfWorkbookId: lineage.duplicateOf?.id ?? null,
        revisionOfWorkbookIds: lineage.revisionOf.map((item) => item.id),
      },
    },
  };
}

export interface ProcessWeeklyReportWorkbooksResult {
  examined: number;
  extracted: number;
  partial: number;
  pendingReview: number;
  legacy: number;
  invalid: number;
  failed: number;
}

export async function processWeeklyReportWorkbooks(
  store: WeeklyReportWorkbookStore,
  options: { limit?: number; readWorkbook?: typeof readWorkbookSafely } = {}
): Promise<ProcessWeeklyReportWorkbooksResult> {
  const result: ProcessWeeklyReportWorkbooksResult = { examined: 0, extracted: 0, partial: 0, pendingReview: 0, legacy: 0, invalid: 0, failed: 0 };
  const read = options.readWorkbook ?? readWorkbookSafely;

  for (const candidate of await store.listWorkbookCandidates(options.limit ?? 20)) {
    result.examined += 1;
    try {
      const buffer = await store.downloadAttachment(candidate);
      const sha256 = await store.computeSha256(buffer);
      if (candidate.sha256Hash && candidate.sha256Hash !== sha256) {
        throw new Error("SHA-256 do arquivo baixado difere do registrado no anexo — integridade comprometida.");
      }

      const reading = await read({ buffer, fileName: candidate.fileName, mimeType: candidate.mimeType });
      const fileFacts = { sha256, detectedFormat: reading.safety.detectedFormat, safety: reading.safety, sheetIndex: reading.sheetIndex };

      if (reading.safety.detectedFormat === "XLS_LEGACY") {
        await store.saveWorkbook(candidate, { ...fileFacts, status: "LEGACY_FORMAT_REVIEW_REQUIRED", errorMessage: null, summary: { note: "XLS legado: leitor atual não suporta; arquivo preservado para revisão." }, sheets: [] });
        result.legacy += 1;
        continue;
      }
      if (reading.safety.detectedFormat !== "XLSX" || !reading.safety.sizeValid) {
        await store.saveWorkbook(candidate, { ...fileFacts, status: "INVALID_FILE", errorMessage: null, summary: { notes: reading.safety.notes }, sheets: [] });
        result.invalid += 1;
        continue;
      }

      const context = await store.loadProcessingContext(candidate);
      const extracted: WeeklyReportWorkbookResult = processWorkbookGrids(reading, { ...context, fileName: candidate.fileName });
      const related = store.findRelatedWorkbooks ? await store.findRelatedWorkbooks(candidate, sha256) : [];
      const lineage = resolveWorkbookLineage(sha256, candidate.workWeekLabel, related);
      const processed = applyWorkbookLineage(extracted, lineage);
      const { id } = await store.saveWorkbook(candidate, { ...fileFacts, status: processed.status, errorMessage: null, summary: processed.summary, sheets: processed.sheets });

      if (processed.status === "EXTRACTED") result.extracted += 1;
      else if (processed.status === "PARTIAL") result.partial += 1;
      else result.pendingReview += 1;

      await store.writeAudit({
        projectId: candidate.projectId,
        action: "WEEKLY_REPORT_WORKBOOK_PROCESSED",
        entityType: "WEEKLY_REPORT_WORKBOOK",
        entityId: id,
        detail:
          `Planilha "${candidate.fileName}" (SHA-256 ${sha256}, ${reading.sheetIndex.length} aba(s)) processada com valores armazenados: ${processed.status}. ` +
          `Abas: ${processed.sheets.map((sheet) => `${sheet.category}=${sheet.status}${sheet.originalSheetName ? ` ("${sheet.originalSheetName}")` : ""}`).join("; ")}. ` +
          `Segurança: macros=${reading.safety.macrosDetected ? "detectadas/ignoradas" : "não"}, links externos=${reading.safety.externalLinksDetected}, conexões=${reading.safety.dataConnectionsDetected}, fórmulas sem valor=${reading.safety.formulasWithoutCachedValue}.` +
          (lineage.duplicateOf ? ` DUPLICATA do arquivo já lido na planilha ${lineage.duplicateOf.id} (mesmo SHA-256): registro preservado, sem caso de risco próprio.` : "") +
          (lineage.revisionOf.length ? ` Revisão da semana ${candidate.workWeekLabel} (conteúdo diferente de ${lineage.revisionOf.length} leitura(s) anterior(es)).` : ""),
      });
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      await store.saveWorkbook(candidate, {
        sha256: candidate.sha256Hash ?? "0".repeat(64),
        detectedFormat: "UNKNOWN",
        safety: null,
        sheetIndex: [],
        status: "FAILED",
        errorMessage: message,
        summary: null,
        sheets: [],
      });
      result.failed += 1;
    }
  }
  return result;
}
