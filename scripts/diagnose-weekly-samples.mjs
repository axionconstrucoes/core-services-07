// Diagnóstico MANUAL e SOMENTE LEITURA de uma lista FECHADA de planilhas semanais da WEG (amostras dos casos humanos).
// - Lê o arquivo do Storage só para olhar a ESTRUTURA do pacote (nomes de abas, dimensões, gráficos); NUNCA lê células.
// - Não grava no banco nem no Storage; não reprocessa nada.
// - O repositório é PÚBLICO: o log traz apenas classes de um vocabulário fechado, índices, dimensões e contagens
//   (veja scripts/lib/weekly-sample-structure.mjs). Sem nomes de aba/arquivo/pessoas, sem conteúdo, sem credenciais.
import { createClient } from "@supabase/supabase-js";
import { createRequire, register } from "node:module";
import { inspectPackage, summarizeStructure } from "./lib/weekly-sample-structure.mjs";

register("./ts-module-resolver.mjs", import.meta.url);
const require = createRequire(import.meta.url);
const JSZip = require("jszip");
const { identifyWeeklyReportSheets } = await import("../apps/web/lib/schedule/weekly-report/identify-sheets.ts");
const { readWorkbookSafely } = await import("../apps/web/lib/schedule/weekly-report/read-workbook.ts");
const { processWorkbookGrids } = await import("../apps/web/lib/schedule/weekly-report/process-workbook.ts");

const WEG = "00000000-0000-4000-8000-000000000001";
/** Lista FECHADA (prefixos de SHA-256): 4 casos humanos + controles/referências. Nada além disto é lido. */
const SAMPLE_SHA_PREFIXES = [
  { sha6: "cdb30d", rotulo: "caso3-W12" },
  { sha6: "c90845", rotulo: "caso2-W34" },
  { sha6: "d62d19", rotulo: "controle-W34" },
  { sha6: "eab51f", rotulo: "caso4-W14" },
  { sha6: "675757", rotulo: "caso4-W15" },
  { sha6: "d9c5c0", rotulo: "caso4-W16" },
  { sha6: "bcb3f0", rotulo: "referencia-W20" },
  { sha6: "54af29", rotulo: "referencia-W41-extraida" },
];
const MAX_BYTES = 60 * 1024 * 1024;

{
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  for (const { sha6, rotulo } of SAMPLE_SHA_PREFIXES) {
    console.log(`\n== ${rotulo} (sha ${sha6})`);
    const { data: wbs, error } = await supabase.from("weekly_report_workbooks")
      .select("id,work_week_number,status,email_attachment_id,file_size_bytes,extracted_at")
      .eq("project_id", WEG).like("file_sha256", `${sha6}%`).limit(1);
    if (error || !wbs?.length) { console.log("registro: não encontrado"); continue; }
    const wb = wbs[0];
    console.log(`semana=${wb.work_week_number} status_gravado=${wb.status} gravado_em=${String(wb.extracted_at ?? "").slice(0, 10)}`);
    const { data: rec } = await supabase.from("weekly_report_sheets").select("category,status").eq("workbook_id", wb.id);
    const gravado = Object.fromEntries((rec ?? []).map((r) => [r.category, r.status]));
    if (!wb.email_attachment_id) { console.log("sem anexo vinculado"); continue; }
    const { data: att } = await supabase.from("email_attachments")
      .select("storage_bucket,storage_path,file_size_bytes").eq("id", wb.email_attachment_id).eq("project_id", WEG).single();
    if (!att?.storage_path || Number(att.file_size_bytes) > MAX_BYTES) { console.log("arquivo indisponível ou acima do limite"); continue; }
    const { data: blob, error: dlError } = await supabase.storage.from(att.storage_bucket).download(att.storage_path);
    if (dlError || !blob) { console.log("download: erro"); continue; }
    try {
      const { sheets, pkg } = await inspectPackage(JSZip, Buffer.from(await blob.arrayBuffer()));
      console.log(JSON.stringify(summarizeStructure(sheets, identifyWeeklyReportSheets, pkg), null, 1));
      // SIMULAÇÃO EM MEMÓRIA com o parser ATUAL (nada gravado, nenhum conteúdo no log): só status por categoria e códigos de alerta.
      try {
        const buf = Buffer.from(await blob.arrayBuffer());
        const reading = await readWorkbookSafely({ buffer: buf, fileName: "amostra.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const ctx = { fileName: "amostra.xlsx", workWeekLabel: null, thresholds: [], mppFacts: null, officialBaseline: null, previousDeviationPp: null, previousBaselineSheet: null, criticalActivityCount: null, humanDecisions: {} };
        const res = processWorkbookGrids({ grids: reading.grids, safety: reading.safety, sheetIndex: reading.sheetIndex }, ctx);
        const sim = Object.fromEntries(res.sheets.map((s) => [s.category, s.status]));
        const codigos = {};
        for (const s of res.sheets) for (const a of s.alerts ?? []) codigos[`${s.category}:${a.code}`] = (codigos[`${s.category}:${a.code}`] ?? 0) + 1;
        const mudou = Object.keys(sim).filter((k) => gravado[k] && gravado[k] !== sim[k]);
        console.log(JSON.stringify({ SIMULACAO_PARSER_ATUAL_EM_MEMORIA_NADA_GRAVADO: true, status_workbook_simulado: res.status, status_por_categoria_simulado: sim, status_por_categoria_gravado: gravado, categorias_que_mudariam: mudou, codigos_de_alerta: codigos }));
      } catch (e) {
        console.log(`simulacao: erro ${String(e?.message ?? e).replace(/[^w .:-]/g, "?").slice(0, 60)}`);
      }
    } catch (e) {
      console.log(`estrutura: erro ${String(e?.message ?? e).replace(/[^\w .:-]/g, "?").slice(0, 80)}`);
    }
  }
}
