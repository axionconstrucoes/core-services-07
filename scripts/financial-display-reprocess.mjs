// Reprocessamento APENAS DE EXIBIÇÃO da aba Financeiro das planilhas
// semanais já extraídas (indicador informativo).
//
// - Padrão: --dry-run (só leitura). Gravação exige --apply E a variável
//   ACC_FINANCIAL_DISPLAY_REPROCESS_CONFIRM=REPROCESSAR-EXIBICAO.
// - Lê do Storage só o docProps/core.xml (data de último salvamento) de cada
//   arquivo, conferindo o SHA-256 registrado. Nada é alterado no Storage.
// - Grava SOMENTE weekly_report_sheets.metrics (valor anterior preservado em
//   metrics.previousMetrics) e cutoff_date (anterior em
//   metrics.previousCutoffDate; corte definido por humano nunca muda).
//   Classificação, motivos e alertas da aba NÃO são tocados => casos,
//   SLAs e notificações não mudam. Uma auditoria por leitura gravada.
// - Idempotente: entradas iguais (hash) => SKIP_UNCHANGED.
// - Log mascarado (repositório público): id opaco, datas e flags; nenhum
//   valor monetário, nome de arquivo ou id. --report=<arquivo> grava o
//   detalhe completo LOCALMENTE (nunca usar no CI).
//
// Uso:
//   node --env-file=apps/web/.env.local scripts/financial-display-reprocess.mjs <projectId> [--dry-run] [--report=saida.json]
//   ACC_FINANCIAL_DISPLAY_REPROCESS_CONFIRM=REPROCESSAR-EXIBICAO node ... <projectId> --apply

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { register } from "node:module";
import { createClient } from "@supabase/supabase-js";

register("./ts-module-resolver.mjs", import.meta.url);
const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const { planFinancialDisplayReprocess, maskedPlanLine, FINANCIAL_DISPLAY_REPROCESS_VERSION } = await import("../apps/web/lib/schedule/weekly-report/financial-display-reprocess.ts");
const { parseCorePropertiesDates } = await import("../apps/web/lib/schedule/weekly-report/read-workbook.ts");
const { toBrasiliaDate } = await import("../apps/web/lib/schedule/weekly-report/analyze-sheets.ts");

const args = process.argv.slice(2);
const projectId = args.find((arg) => /^[0-9a-f-]{36}$/i.test(arg));
const apply = args.includes("--apply");
const reportPath = args.find((arg) => arg.startsWith("--report="))?.slice("--report=".length) ?? null;
const CONFIRM = "REPROCESSAR-EXIBICAO";
const MAX_CORE_XML_BYTES = 64 * 1024;

if (!projectId) {
  console.error("Uso: financial-display-reprocess.mjs <projectId> [--dry-run|--apply] [--report=arquivo]");
  process.exit(2);
}
if (apply && process.env.ACC_FINANCIAL_DISPLAY_REPROCESS_CONFIRM !== CONFIRM) {
  console.error(`--apply exige ACC_FINANCIAL_DISPLAY_REPROCESS_CONFIRM=${CONFIRM}. Nada foi gravado.`);
  process.exit(2);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.");
  process.exit(2);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

function fail(message) {
  // Mensagem genérica: nunca ecoa dados do banco no log público.
  console.error(`ERRO: ${message}`);
  process.exit(1);
}

const { data: sheets, error: sheetsError } = await supabase
  .from("weekly_report_sheets")
  .select("id,workbook_id,status,data,metrics,cutoff_date,source_locator")
  .eq("project_id", projectId)
  .eq("category", "FINANCEIRO")
  .in("status", ["EXTRACTED", "HUMAN_MAPPED", "HUMAN_VALIDATED"]);
if (sheetsError) fail("falha ao listar abas Financeiro");

const workbookIds = [...new Set((sheets ?? []).map((row) => row.workbook_id))];
const { data: workbooks, error: wbError } = workbookIds.length
  ? await supabase.from("weekly_report_workbooks").select("id,email_id,email_attachment_id,file_name,file_sha256,work_week_label,created_at").in("id", workbookIds)
  : { data: [], error: null };
if (wbError) fail("falha ao listar planilhas");
const workbookById = new Map(workbooks.map((row) => [row.id, row]));

const emailIds = [...new Set(workbooks.map((row) => row.email_id).filter(Boolean))];
const { data: emails } = emailIds.length ? await supabase.from("emails").select("id,sent_at,subject").in("id", emailIds) : { data: [] };
const emailById = new Map((emails ?? []).map((row) => [row.id, row]));

const attachmentIds = [...new Set(workbooks.map((row) => row.email_attachment_id).filter(Boolean))];
const { data: attachments } = attachmentIds.length ? await supabase.from("email_attachments").select("id,storage_bucket,storage_path,sha256_hash").in("id", attachmentIds) : { data: [] };
const attachmentById = new Map((attachments ?? []).map((row) => [row.id, row]));

const { data: curvaSheets } = workbookIds.length
  ? await supabase.from("weekly_report_sheets").select("workbook_id,metrics").eq("category", "CURVA_S").in("workbook_id", workbookIds)
  : { data: [] };
const contentWeekByWorkbook = new Map((curvaSheets ?? []).map((row) => [row.workbook_id, row.metrics?.cutoffPeriod ?? null]));

// Data de último salvamento por SHA-256 (arquivos idênticos leem uma vez).
const modifiedBySha = new Map();
async function documentModifiedDate(workbook) {
  if (modifiedBySha.has(workbook.file_sha256)) return modifiedBySha.get(workbook.file_sha256);
  let result = { date: null, note: "SEM_ANEXO" };
  const attachment = attachmentById.get(workbook.email_attachment_id);
  if (attachment?.storage_bucket && attachment?.storage_path) {
    const { data: blob, error } = await supabase.storage.from(attachment.storage_bucket).download(attachment.storage_path);
    if (error || !blob) result = { date: null, note: "DOWNLOAD_FALHOU" };
    else {
      const buffer = Buffer.from(await blob.arrayBuffer());
      const sha = createHash("sha256").update(buffer).digest("hex");
      if (sha !== workbook.file_sha256) result = { date: null, note: "SHA_DIVERGENTE" };
      else {
        try {
          const zip = await JSZip.loadAsync(buffer);
          const entry = zip.file(/^docProps\/core\.xml$/i)[0];
          const size = Number(entry?._data?.uncompressedSize ?? 0);
          if (!entry || size > MAX_CORE_XML_BYTES) result = { date: null, note: "SEM_CORE_XML" };
          else {
            const dates = parseCorePropertiesDates(await entry.async("string"));
            result = { date: toBrasiliaDate(dates.documentModifiedAt), note: dates.documentModifiedAt ? "OK" : "SEM_DATA" };
          }
        } catch {
          result = { date: null, note: "PACOTE_ILEGIVEL" };
        }
      }
    }
  }
  modifiedBySha.set(workbook.file_sha256, result);
  return result;
}

// Ordem cronológica do pacote (envio) para as "versões anteriores".
const enriched = (sheets ?? [])
  .map((sheet) => {
    const workbook = workbookById.get(sheet.workbook_id);
    const email = workbook?.email_id ? emailById.get(workbook.email_id) : null;
    return { sheet, workbook, email, sentAt: email?.sent_at ?? workbook?.created_at ?? "" };
  })
  .filter((item) => item.workbook)
  .sort((a, b) => a.sentAt.localeCompare(b.sentAt));

const plans = [];
const report = [];
for (const item of enriched) {
  const { sheet, workbook, email } = item;
  const modified = await documentModifiedDate(workbook);
  const seenSha = new Set([workbook.file_sha256]);
  const previousVersions = [];
  for (const other of enriched) {
    if (other.sentAt >= item.sentAt) break;
    if (seenSha.has(other.workbook.file_sha256)) continue;
    seenSha.add(other.workbook.file_sha256);
    const rows = Array.isArray(other.sheet.data?.rows) ? other.sheet.data.rows : [];
    previousVersions.push({ label: other.workbook.work_week_label ?? null, rows: rows.map((row) => ({ period: row.period, previsto: typeof row.values?.previsto === "number" ? row.values.previsto : null })) });
  }
  const plan = planFinancialDisplayReprocess({
    sheetId: sheet.id,
    sheetStatus: sheet.status,
    data: sheet.data,
    currentMetrics: sheet.metrics,
    currentCutoffDate: sheet.cutoff_date,
    columnLetters: sheet.source_locator?.columns ?? null,
    fileName: workbook.file_name,
    emailSentDate: toBrasiliaDate(email?.sent_at ?? null),
    emailSubject: email?.subject ?? null,
    subjectWeekLabel: workbook.work_week_label ?? null,
    contentWeekLabel: contentWeekByWorkbook.get(workbook.id) ?? null,
    documentModifiedDate: modified.date,
    previousVersions,
  });
  plans.push(plan);
  console.log(`${maskedPlanLine(plan)} metadado=${modified.note}`);
  report.push({ sheetId: sheet.id, workbookId: workbook.id, weekLabel: workbook.work_week_label, fileName: workbook.file_name, emailSentAt: email?.sent_at ?? null, documentModified: modified, ...plan.summary, action: plan.action, newCutoffDate: plan.newCutoffDate, baseEvidence: plan.newMetrics?.baseEvidence ?? [], alerts: (plan.newMetrics?.displayOnlyAlerts ?? []).map((alert) => alert.code) });
}

if (reportPath) {
  if (process.env.GITHUB_ACTIONS) fail("--report não é permitido no CI (repositório público).");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Relatório completo gravado localmente.`);
}

const counts = plans.reduce((acc, plan) => ({ ...acc, [plan.action]: (acc[plan.action] ?? 0) + 1 }), {});
console.log(`Resumo: ${plans.length} leitura(s) — ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhuma"} — modo ${apply ? "APPLY" : "DRY-RUN (nada gravado)"}`);

if (!apply) process.exit(0);

let written = 0;
let auditsRecovered = 0;
for (const plan of plans.filter((item) => item.action === "UPDATE" || item.action === "SKIP_UNCHANGED")) {
  const marker = `[${FINANCIAL_DISPLAY_REPROCESS_VERSION}:${plan.inputsHash}]`;
  if (plan.action === "SKIP_UNCHANGED") {
    // Idempotência da auditoria: se uma execução anterior gravou a métrica e caiu antes da auditoria, completa só a auditoria.
    const { count } = await supabase.from("audit_log_entries").select("id", { count: "exact", head: true }).eq("entity_id", plan.sheetId).eq("action", "WEEKLY_REPORT_FINANCIAL_DISPLAY_REPROCESSED").like("detail", `%${marker}%`);
    if ((count ?? 0) > 0) continue;
    auditsRecovered += 1;
  } else {
    // Grava SOMENTE métricas e corte; classificação/motivos/alertas intocados.
    const { error } = await supabase.from("weekly_report_sheets").update({ metrics: plan.newMetrics, cutoff_date: plan.newCutoffDate }).eq("id", plan.sheetId);
    if (error) fail("falha ao gravar métricas de exibição (execução interrompida; reexecute — é idempotente)");
    written += 1;
  }
  const s = plan.summary;
  const { error: auditError } = await supabase.from("audit_log_entries").insert({
    project_id: projectId,
    actor_type: "SYSTEM",
    actor_user_id: null,
    actor_label: null,
    action: "WEEKLY_REPORT_FINANCIAL_DISPLAY_REPROCESSED",
    entity_type: "WEEKLY_REPORT_SHEET",
    entity_id: plan.sheetId,
    detail:
      `Reprocessamento SOMENTE de exibição (${FINANCIAL_DISPLAY_REPROCESS_VERSION}, informativo): referência ${s.referenceDate ?? "indefinida"} (${s.referenceSource}), corte ${s.cutoffDate ?? "—"}, base ${s.baseKind}, ` +
      `${s.comparable ? `desvio ${s.deviationPercent}%` : `não mensurável (${s.reasons.join("; ")})`}; método anterior ${s.previousMethod} (${s.previousDeviationPercent ?? "—"}%) preservado em metrics.previousMetrics. ` +
      "Classificação, motivos, alertas e casos não alterados; nenhuma notificação. " + marker,
  });
  if (auditError) fail("falha ao gravar auditoria (métrica já gravada; reexecute — a auditoria faltante é completada)");
}
console.log(`Gravadas ${written} leitura(s); auditorias completadas ${auditsRecovered}.`);
