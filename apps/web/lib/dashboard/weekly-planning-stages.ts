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

// ---------------------------------------------------------------------------------------------
// Correção de 25/11/2026 (fontes do Dashboard): (1) MPP EFETIVO, (2) data/semana da fonte, (3) frescor da sincronização.
// ---------------------------------------------------------------------------------------------

export interface MppAttachmentCandidate {
  email_id: string;
  processing_status: string | null | undefined;
  /** Versão de documento criada a partir do anexo: só existe para o MPP que a regra de recebimento SELECIONOU. */
  document_version_id?: string | null;
}

/**
 * Escolhe, entre os anexos CRONOGRAMA_MPP, o que representa o cronograma da semana: o e-mail mais recente e, dentro dele,
 * o MPP efetivamente selecionado (com versão de documento) ou, na falta, o processado. Antes o painel pegava o "primeiro" do
 * e-mail e, quando o e-mail trazia um segundo .mpp preservado como evidência (ex.: "Estratificação de Tarefas Futuras"),
 * exibia "Recebido, não processado" mesmo com o cronograma da semana já processado.
 */
export function pickEffectiveMppAttachment<T extends MppAttachmentCandidate>(
  candidates: readonly T[],
  sentAtByEmailId: (emailId: string) => string | null | undefined
): T | undefined {
  let best: T | undefined;
  let bestTime = Number.NEGATIVE_INFINITY;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const parsed = Date.parse(sentAtByEmailId(c.email_id) ?? "");
    const time = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
    const rank = c.document_version_id ? 0 : c.processing_status === "PROCESSED" ? 1 : c.processing_status === "FAILED" ? 2 : 3;
    if (best === undefined || time > bestTime || (time === bestTime && rank < bestRank)) {
      best = c;
      bestTime = time;
      bestRank = rank;
    }
  }
  return best;
}

const REFERENCE_TZ = "America/Sao_Paulo";

function formatReferenceDate(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return new Date(t).toLocaleDateString("pt-BR", { timeZone: REFERENCE_TZ });
}

function formatReferenceDateTime(iso: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.toLocaleDateString("pt-BR", { timeZone: REFERENCE_TZ })} ${d.toLocaleTimeString("pt-BR", { timeZone: REFERENCE_TZ, hour: "2-digit", minute: "2-digit" })}`;
}

/** Rótulo "Relatório semanal W43 · 22/10/2026" para dizer de QUAL semana e data vem um indicador. null quando a fonte não existe. */
export function sourceReferenceLabel(input: { kind: string; weekLabel?: string | null; at?: string | null }): string | null {
  const date = input.at ? formatReferenceDate(input.at) : null;
  const week = input.weekLabel?.trim() || null;
  if (!week && !date) return null;
  return [input.kind, week, date ? `· ${date}` : null].filter(Boolean).join(" ").replace(" ·", " ·");
}

/** Idade máxima (h) aceitável da última sincronização, por fonte, conforme o agendamento (e-mail 15 min; Diário diário; Construmanager 6 h). */
export const SYNC_MAX_AGE_HOURS: Readonly<Record<string, number>> = { EMAIL: 2, DIARIO_OBRA: 30, CONSTRUMANAGER: 8 };

export interface SyncFreshness {
  lastSyncAt: string | null;
  ageHours: number | null;
  /** true quando há agendamento esperado e a última sincronização é mais antiga que o limite (ou nunca ocorreu). */
  stale: boolean;
}

/** null para fontes sem sincronização automática (ex.: SSMA/Drive, planilhas): não inventa frescor. */
export function syncFreshness(sourceType: string, lastSyncAt: string | null | undefined, now: Date = new Date()): SyncFreshness | null {
  const limit = SYNC_MAX_AGE_HOURS[sourceType];
  if (limit === undefined) return null;
  const t = lastSyncAt ? Date.parse(lastSyncAt) : Number.NaN;
  if (Number.isNaN(t)) return { lastSyncAt: null, ageHours: null, stale: true };
  const ageHours = Math.max(0, (now.getTime() - t) / (60 * 60 * 1000));
  return { lastSyncAt: lastSyncAt ?? null, ageHours, stale: ageHours > limit };
}

/** "última sincronização 25/11/2026 02:44" ou, se atrasada, o aviso de que a conexão está ativa mas a sincronização automática parou. */
export function syncFreshnessText(f: SyncFreshness): string {
  if (!f.lastSyncAt) return "conectada, sem sincronização registrada — sincronização automática parada ou nunca executada";
  const when = formatReferenceDateTime(f.lastSyncAt) ?? f.lastSyncAt;
  if (!f.stale) return `última sincronização ${when}`;
  const idade = f.ageHours === null ? "" : ` (há ${Math.floor(f.ageHours)} h)`;
  return `última sincronização ${when}${idade} — conexão ativa, mas a sincronização automática parece pausada`;
}
