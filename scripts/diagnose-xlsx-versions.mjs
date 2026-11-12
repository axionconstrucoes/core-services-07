// Diagnóstico SOMENTE LEITURA de versões XLSX com falha de extração (WEG). Não grava no banco nem no Storage.
// Para cada versão: tamanho, entradas do zip (nomes técnicos e tamanhos), o leitor ANTIGO (em memória) e o NOVO,
// cada um em processo filho (para medir estouro de memória). Nunca imprime conteúdo de células nem nomes de arquivo.
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import ExcelJS from "exceljs";

const WEG = "00000000-0000-4000-8000-000000000001";
const SELF = fileURLToPath(import.meta.url);

if (process.argv[2] === "--child") {
  const [, , , mode, path] = process.argv;
  const buffer = readFileSync(path);
  const t0 = Date.now();
  const out = { mode };
  try {
    if (mode === "antigo") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer);
      let rows = 0, cellsFailed = 0;
      wb.eachSheet((ws) => ws.eachRow({ includeEmpty: false }, (row) => {
        rows += 1;
        row.eachCell({ includeEmpty: true }, (c) => { try { void c.text; } catch { cellsFailed += 1; } });
      }));
      out.ok = true; out.linhas = rows; out.celulasQueLancam = cellsFailed;
    } else {
      const { readXlsxLines } = await import("./lib/xlsx-extract.mjs");
      const { lines, stats } = await readXlsxLines(buffer);
      out.ok = true; out.rota = stats.rota; out.linhas = lines.length; out.celulasIlegiveis = stats.celulasIlegiveis;
      out.caracteres = lines.reduce((n, l) => n + l.text.length, 0);
    }
  } catch (error) {
    out.ok = false;
    out.erro = String(error?.message ?? error).slice(0, 160);
    out.frames = String(error?.stack ?? "").split("\n").slice(1, 6).map((f) => f.replace(/.*node_modules[\/]/, "node_modules/").replace(/\(.*node_modules[\/]/, "(node_modules/").trim().slice(0, 140));
  }
  out.ms = Date.now() - t0;
  out.rssMaxMB = Math.round(process.resourceUsage().maxRSS / 1024);
  console.log("RESULT " + JSON.stringify(out));
  process.exit(0);
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { data: versions, error } = await supabase.from("document_versions")
  .select("id,storage_bucket,file_path,file_size_bytes,processing_status,mime_type")
  .eq("project_id", WEG).like("mime_type", "%spreadsheetml%").in("processing_status", ["FAILED", "PROCESSING"])
  .gte("uploaded_at", "2026-11-12").order("uploaded_at").limit(10);
if (error) throw error;
console.log(`Versões XLSX com falha (WEG): ${versions.length}`);
const dir = mkdtempSync(join(tmpdir(), "acc-xlsx-diag-"));
for (const v of versions) {
  const { data: blob, error: dlError } = await supabase.storage.from(v.storage_bucket).download(v.file_path);
  console.log(`\n== ${v.id} status=${v.processing_status} tamanho=${v.file_size_bytes}`);
  if (dlError || !blob) { console.log(`download: ERRO ${dlError?.message ?? "vazio"}`); continue; }
  const buffer = Buffer.from(await blob.arrayBuffer());
  console.log(`bytes lidos=${buffer.length}`);
  try {
    const zip = await JSZip.loadAsync(buffer);
    const entries = [];
    for (const [name, file] of Object.entries(zip.files)) if (!file.dir) entries.push([name, file._data?.uncompressedSize ?? 0]);
    entries.sort((a, b) => b[1] - a[1]);
    console.log(`zip: ${entries.length} entradas; ordem das 6 primeiras: ${entries.slice(0).map((e) => e[0]).slice(0, 0).join("") || Object.keys(zip.files).slice(0, 6).join(", ")}`);
    console.log("maiores: " + entries.slice(0, 6).map(([n, s]) => `${n.replace(/[^\w./-]/g, "?")}=${s}`).join("; "));
    const wbXml = await zip.file("xl/workbook.xml")?.async("string");
    console.log(`abas=${(wbXml?.match(/<sheet\b/g) ?? []).length} nomesDefinidos=${(wbXml?.match(/<definedName\b/g) ?? []).length}`);
  } catch (e) { console.log(`zip: ERRO ${String(e.message).slice(0, 120)}`); }
  const path = join(dir, "arquivo.xlsx");
  writeFileSync(path, buffer);
  for (const mode of ["antigo", "novo"]) {
    const r = spawnSync("node", [SELF, "--child", mode, path], { encoding: "utf8", timeout: 240000, maxBuffer: 1 << 24 });
    const line = (r.stdout ?? "").split("\n").find((l) => l.startsWith("RESULT "));
    console.log(line ? `${mode}: ${line.slice(7)}` : `${mode}: SEM RESULTADO exit=${r.status} sinal=${r.signal} ${String(r.stderr ?? "").split("\n").filter((l) => /heap|memory|FATAL/i.test(l)).slice(0, 2).join(" | ").slice(0, 200)}`);
  }
}
rmSync(dir, { recursive: true, force: true });
