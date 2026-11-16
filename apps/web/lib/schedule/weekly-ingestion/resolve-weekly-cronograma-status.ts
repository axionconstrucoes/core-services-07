// Resolvedor PURO (sem I/O, somente leitura) do indicador "Cronograma
// atualizado" do Dashboard segundo a REGRA SEMANAL:
//
//   O cronograma oficial atualizado chega como ANEXO .mpp dos e-mails
//   semanais enviados por responsavel AUTORIZADO da area de
//   Planejamento (Matriz de responsabilidades e prazos), junto do
//   relatorio semanal em Excel.
//
// Fontes (todas JA existentes; nenhum mecanismo paralelo):
//   - weekly_schedule_email_intakes: UMA decisao por e-mail. A
//     autorizacao do remetente ja foi decidida por
//     evaluate-weekly-schedule-email.ts (membership ACTIVE + area
//     PLANEJAMENTO + escalao 1o/2o segundo sla_area_responsibles). Este
//     resolvedor NAO reavalia a Matriz: usa o status gravado do intake
//     (AUTHORIZED_AUTO / APPROVED_HUMAN_REVIEW / RECEIVED_DUPLICATE =
//     autorizado; REJECTED_UNAUTHORIZED_SENDER = nao autorizado).
//   - schedule_versions (extraction_status) da versao de documento .mpp.
//   - weekly_report_workbooks: Excel semanal (Curva S, Linha de Base e
//     financeiro). Evidencia SEPARADA: o Excel NUNCA promove o
//     cronograma; serve apenas para diferenciar "so Excel recebido".
//
// SEMANA ESPERADA: semana (segunda-feira, fuso do projeto — a mesma
// resolveWeekStart usada pela ingestao para intake.week_start) cujo
// prazo semanal configurado (deadline_weekday/time) ja passou:
//   prazo da semana corrente ja passou => esperada = semana corrente;
//   senao => esperada = semana anterior.
// JANELA AVALIADA = [esperada .. corrente]: um MPP recebido na semana
// corrente (mesmo antes do prazo) tambem atende (e mais recente). E
// conservador: nunca promove com MPP de semana anterior a esperada.
//
// Idempotencia: reenvios/duplicatas do mesmo MPP (mesmo SHA-256 ou mesma
// versao de documento) contam UMA vez. Nenhuma escrita/alerta aqui.

import type { IntegrationStatus } from "@axion/types";

import { previousWeekStart, resolveCurrentWeekDeadline, resolveWeekStart } from "./week-window";

export type CronogramaWeeklyCause =
  | "OK_RECEIVED_PROCESSED"
  | "INGESTION_NOT_ENABLED"
  | "NO_WEEKLY_EMAIL"
  | "SENDER_NOT_AUTHORIZED"
  | "RECIPIENT_NOT_CLIENT"
  | "EXCEL_ONLY_NO_MPP"
  | "MPP_PENDING_REVIEW"
  | "MPP_REVIEW_REJECTED"
  | "MPP_NOT_PROMOTED"
  | "MPP_NOT_PROCESSED"
  | "MPP_EXTRACTION_FAILED"
  | "INGESTION_FAILED";

/** Texto curto PT-BR exibido no Dashboard (motivo do indicador). */
export const CRONOGRAMA_WEEKLY_CAUSE_TEXT: Record<CronogramaWeeklyCause, string> = {
  OK_RECEIVED_PROCESSED: "MPP da semana recebido e processado",
  INGESTION_NOT_ENABLED: "ingestão semanal não habilitada no projeto",
  NO_WEEKLY_EMAIL: "nenhum e-mail semanal recebido",
  SENDER_NOT_AUTHORIZED: "e-mail de remetente não autorizado",
  RECIPIENT_NOT_CLIENT: "e-mail sem destinatário do cliente",
  EXCEL_ONLY_NO_MPP: "recebido só o Excel, sem MPP",
  MPP_PENDING_REVIEW: "MPP aguardando revisão humana",
  MPP_REVIEW_REJECTED: "MPP rejeitado na revisão",
  MPP_NOT_PROMOTED: "anexo MPP ainda não promovido a documento",
  MPP_NOT_PROCESSED: "MPP recebido, aguardando processamento",
  MPP_EXTRACTION_FAILED: "falha na extração do MPP",
  INGESTION_FAILED: "falha na ingestão do e-mail",
};

/** Prioridade (mais proxima do sucesso primeiro) quando ha varios envios na janela. */
const CAUSE_PRIORITY: CronogramaWeeklyCause[] = [
  "MPP_NOT_PROCESSED",
  "MPP_NOT_PROMOTED",
  "MPP_PENDING_REVIEW",
  "MPP_EXTRACTION_FAILED",
  "INGESTION_FAILED",
  "MPP_REVIEW_REJECTED",
  "SENDER_NOT_AUTHORIZED",
  "RECIPIENT_NOT_CLIENT",
  "EXCEL_ONLY_NO_MPP",
  "NO_WEEKLY_EMAIL",
];

export interface WeeklyCronogramaConfigFact {
  enabled: boolean;
  deadlineWeekday: number;
  deadlineTime: string;
  timezone: string;
}

export interface WeeklyCronogramaIntakeFact {
  id: string;
  /** Segunda-feira (YYYY-MM-DD) gravada pela ingestao. */
  weekStart: string;
  status: string;
  /** document_version_id do intake OU duplicate_of_document_version_id (reenvio). */
  mppDocumentVersionId: string | null;
  sha256: string | null;
}

export interface WeeklyCronogramaWorkbookFact {
  id: string;
  /** Instante de envio do e-mail de origem (ISO). */
  emailSentAt: string | null;
  sha256: string | null;
}

export interface WeeklyCronogramaScheduleVersionFact {
  documentVersionId: string;
  extractionStatus: string;
  /** Versao de documento originada de .mpp. */
  isMpp: boolean;
}

export interface WeeklyCronogramaFacts {
  config: WeeklyCronogramaConfigFact | null;
  intakes: WeeklyCronogramaIntakeFact[];
  workbooks: WeeklyCronogramaWorkbookFact[];
  scheduleVersions: WeeklyCronogramaScheduleVersionFact[];
}

export interface CronogramaWeeklyResolution {
  status: IntegrationStatus;
  /** null quando o status armazenado foi mantido sem avaliacao (ERRO/ATENCAO/CONECTADO ou leitura falha). */
  cause: CronogramaWeeklyCause | null;
  /** Texto curto PT-BR do motivo (ou null). */
  detail: string | null;
  expectedWeekStart: string | null;
  currentWeekStart: string | null;
  /** MPP distintos processados (EXTRACTED) na janela — duplicatas contam uma vez. */
  processedMppCount: number;
  /** Excel semanal distintos na janela (informativo; nunca promove). */
  weeklyExcelCount: number;
}

const AUTHORIZED_STATUSES = new Set(["AUTHORIZED_AUTO", "APPROVED_HUMAN_REVIEW", "RECEIVED_DUPLICATE"]);

export function isMppDocumentVersion(mimeType: string | null, fileName: string | null): boolean {
  return (mimeType ?? "").toLowerCase() === "application/vnd.ms-project" || (fileName ?? "").toLowerCase().endsWith(".mpp");
}

function formatShortDate(dateOnly: string): string {
  return `${dateOnly.slice(8, 10)}/${dateOnly.slice(5, 7)}`;
}

/** "<motivo> (sem. dd/mm)" — rotulo curto para o Dashboard. */
export function formatCronogramaWeeklyDetail(cause: CronogramaWeeklyCause, expectedWeekStart: string | null): string {
  const text = CRONOGRAMA_WEEKLY_CAUSE_TEXT[cause];
  return expectedWeekStart ? `${text} (sem. ${formatShortDate(expectedWeekStart)})` : text;
}

export function resolveExpectedWeek(now: Date, config: WeeklyCronogramaConfigFact): { expectedWeekStart: string; currentWeekStart: string } {
  const state = resolveCurrentWeekDeadline(now, {
    deadlineWeekday: config.deadlineWeekday,
    deadlineTime: config.deadlineTime,
    timezone: config.timezone,
  });
  return {
    currentWeekStart: state.weekStart,
    expectedWeekStart: state.isPastDeadline ? state.weekStart : previousWeekStart(state.weekStart),
  };
}

function keep(storedStatus: IntegrationStatus | null): CronogramaWeeklyResolution {
  return {
    status: storedStatus ?? "PENDENTE",
    cause: null,
    detail: null,
    expectedWeekStart: null,
    currentWeekStart: null,
    processedMppCount: 0,
    weeklyExcelCount: 0,
  };
}

export function resolveWeeklyCronogramaStatus(input: {
  storedStatus: IntegrationStatus | null;
  /** null = leitura falhou/indisponivel => fail-safe (mantem o armazenado). */
  facts: WeeklyCronogramaFacts | null;
  now: Date;
}): CronogramaWeeklyResolution {
  const stored = input.storedStatus ?? "PENDENTE";
  // ERRO/ATENCAO armazenados prevalecem; CONECTADO armazenado nao e rebaixado aqui.
  if (stored === "ERRO" || stored === "ATENCAO" || stored === "CONECTADO") return keep(input.storedStatus);
  if (!input.facts) return keep(input.storedStatus);

  const { config, intakes, workbooks, scheduleVersions } = input.facts;
  if (!config || !config.enabled) {
    return { ...keep("PENDENTE"), cause: "INGESTION_NOT_ENABLED", detail: CRONOGRAMA_WEEKLY_CAUSE_TEXT.INGESTION_NOT_ENABLED };
  }

  const { expectedWeekStart, currentWeekStart } = resolveExpectedWeek(input.now, config);
  const inWindow = (weekStart: string) => weekStart >= expectedWeekStart && weekStart <= currentWeekStart;

  const versionByDocument = new Map(scheduleVersions.map((version) => [version.documentVersionId, version]));
  const windowIntakes = intakes.filter((intake) => inWindow(intake.weekStart));
  const windowWorkbooks = workbooks.filter(
    (workbook) => workbook.emailSentAt && inWindow(resolveWeekStart(workbook.emailSentAt, config.timezone))
  );
  const weeklyExcelCount = new Set(windowWorkbooks.map((workbook) => workbook.sha256 ?? workbook.id)).size;

  const processed = new Set<string>();
  const causes = new Set<CronogramaWeeklyCause>();

  for (const intake of windowIntakes) {
    if (AUTHORIZED_STATUSES.has(intake.status)) {
      if (!intake.mppDocumentVersionId) {
        causes.add("MPP_NOT_PROMOTED");
        continue;
      }
      const version = versionByDocument.get(intake.mppDocumentVersionId);
      if (version?.isMpp && version.extractionStatus === "EXTRACTED") {
        processed.add(intake.sha256 ?? intake.mppDocumentVersionId);
      } else if (version?.extractionStatus === "FAILED") {
        causes.add("MPP_EXTRACTION_FAILED");
      } else {
        causes.add("MPP_NOT_PROCESSED");
      }
      continue;
    }
    switch (intake.status) {
      case "PENDING_HUMAN_REVIEW":
        causes.add("MPP_PENDING_REVIEW");
        break;
      case "REJECTED_HUMAN_REVIEW":
        causes.add("MPP_REVIEW_REJECTED");
        break;
      case "REJECTED_UNAUTHORIZED_SENDER":
        causes.add("SENDER_NOT_AUTHORIZED");
        break;
      case "REJECTED_RECIPIENT_MISMATCH":
        causes.add("RECIPIENT_NOT_CLIENT");
        break;
      case "IGNORED_NO_MPP":
        causes.add("EXCEL_ONLY_NO_MPP");
        break;
      case "FAILED":
        causes.add("INGESTION_FAILED");
        break;
      default:
        break; // IGNORED_OUTSIDE_WINDOW etc.: nao e recebimento semanal.
    }
  }

  const base = { expectedWeekStart, currentWeekStart, processedMppCount: processed.size, weeklyExcelCount };

  if (processed.size > 0) {
    // Promocao SOMENTE com MPP de remetente autorizado, processado (EXTRACTED).
    return { status: "CONECTADO", cause: "OK_RECEIVED_PROCESSED", detail: null, ...base };
  }

  if (weeklyExcelCount > 0) causes.add("EXCEL_ONLY_NO_MPP");

  const cause = CAUSE_PRIORITY.find((candidate) => causes.has(candidate)) ?? "NO_WEEKLY_EMAIL";
  return { status: "PENDENTE", cause, detail: formatCronogramaWeeklyDetail(cause, expectedWeekStart), ...base };
}
