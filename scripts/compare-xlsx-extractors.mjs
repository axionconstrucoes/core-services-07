// Comparação SOMENTE LEITURA de fidelidade entre o extrator XLSX ANTIGO (leitura em memória, ExcelJS DOM, como em
// b173844^) e o NOVO (scripts/lib/xlsx-extract.mjs), célula a célula, sobre versões XLSX reais da WEG.
// Não grava no banco nem no Storage. NUNCA imprime conteúdo de célula, nomes de aba ou de arquivo: só contagens,
// posições (aba por índice, linha, coluna) e o TIPO da diferença. O antigo é executado com proteção por célula
// (valor ilegível => vazio) apenas para conseguir terminar; as ilegíveis são contadas e classificadas.
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readXlsxLines } from "./lib/xlsx-extract.mjs";

const WEG = "00000000-0000-4000-8000-000000000001";
const normalize = (value) => String(value ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
const colLetter = (n) => { let s = ""; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };
const kindOf = (cell) => {
  const v = cell.value;
  if (v == null) return "valor-nulo";
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) return `formula(result=${v.result == null ? "nulo" : typeof v.result})`;
    if ("richText" in v) return "richText";
    if ("hyperlink" in v) return "hyperlink";
    if ("error" in v) return "erro";
    if (v instanceof Date) return "data";
    return "objeto";
  }
  return typeof v;
};

/** Antigo: ExcelJS DOM + eachRow(includeEmpty:false) + eachCell(includeEmpty:true), igual ao código anterior. */
async function oldCells(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const rows = new Map(); // "sheetIdx|row" -> string[] (por coluna, a partir da coluna 1)
  const throws = []; // { kind, sheet, row, col }
  let sheetIdx = 0;
  wb.eachSheet((ws) => {
    sheetIdx += 1;
    const si = sheetIdx;
    ws.eachRow({ includeEmpty: false }, (row, number) => {
      const values = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        let text;
        try { text = cell.text; } catch { throws.push({ kind: kindOf(cell), sheet: si, row: number, col }); text = ""; }
        values.push(normalize(text));
      });
      rows.set(`${si}|${number}`, values);
    });
  });
  return { rows, throws };
}

async function newLines(buffer) {
  const { lines, stats } = await readXlsxLines(buffer, normalize);
  // índice de aba por ordem de aparição (as linhas vêm agrupadas por aba)
  const order = []; const rows = new Map();
  for (const l of lines) { if (!order.includes(l.sheet)) order.push(l.sheet); rows.set(`${order.indexOf(l.sheet) + 1}|${l.row}`, l.text); }
  return { rows, stats, sheets: order.length };
}

// Processo filho: lê com o extrator ANTIGO isolado (ele estoura a memória em arquivos grandes e mataria o processo principal).
if (process.argv[2] === "--old") {
  const { rows, throws } = await oldCells(readFileSync(process.argv[3]));
  writeFileSync(process.argv[4], JSON.stringify({ rows: [...rows], throws }));
  process.exit(0);
}
function oldIsolated(buffer) {
  const dir = mkdtempSync(join(tmpdir(), "acc-xlsx-cmp-"));
  try {
    writeFileSync(join(dir, "in.xlsx"), buffer);
    const r = spawnSync("node", [fileURLToPath(import.meta.url), "--old", join(dir, "in.xlsx"), join(dir, "out.json")], { encoding: "utf8", timeout: 240000, maxBuffer: 1 << 24 });
    if (r.status !== 0) return { falhou: true, sinal: r.signal, estouroMemoria: /heap out of memory|FATAL ERROR/i.test(String(r.stderr)) };
    const j = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    return { rows: new Map(j.rows), throws: j.throws };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

// Modo local (teste): node scripts/compare-xlsx-extractors.mjs arquivo.xlsx
const localFile = process.argv[2];
let versions, supabase;
if (localFile) versions = [{ id: "local000-0000", local: localFile }];
else {
  supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
  const res = await supabase.from("document_versions")
    .select("id,storage_bucket,file_path,file_size_bytes")
    .eq("project_id", WEG).like("mime_type", "%spreadsheetml%").gte("uploaded_at", "2026-11-12").order("uploaded_at").limit(20);
  if (res.error) throw res.error;
  versions = res.data;
}
console.log(`Versões XLSX do lote (WEG): ${versions.length}`);
for (const v of versions) {
  const tag = v.id.slice(0, 8);
  let buffer;
  if (v.local) buffer = (await import("node:fs")).readFileSync(v.local);
  else {
    const { data: blob, error: dl } = await supabase.storage.from(v.storage_bucket).download(v.file_path);
    if (dl || !blob) { console.log(`\n== ${tag} download ERRO`); continue; }
    buffer = Buffer.from(await blob.arrayBuffer());
  }
  console.log(`\n== ${tag} bytes=${buffer.length}`);
  let o, n;
  { const r = oldIsolated(buffer); if (r.falhou) console.log(`antigo: NÃO LEU (processo terminou sem resultado; estouro de memória=${r.estouroMemoria}; sinal=${r.sinal})`); else o = r; }
  try { n = await newLines(buffer); } catch (e) { console.log(`novo: NÃO LEU (${String(e.message).slice(0, 80)})`); }
  if (!n) continue;
  console.log(`novo: rota=${n.stats.rota} abas=${n.sheets} linhas=${n.rows.size} celulasIlegiveis=${n.stats.celulasIlegiveis}`);
  if (!o) continue;
  const oldNonEmpty = new Map([...o.rows].map(([k, vals]) => [k, vals.join(" | ").trim()]).filter(([, t]) => t));
  console.log(`antigo(protegido): linhas(eachRow)=${o.rows.size} linhasComTexto=${oldNonEmpty.size} celulasQueLancam=${o.throws.length}`);
  const byKind = {}; const byCol = {}; const sample = [];
  for (const t of o.throws) { byKind[t.kind] = (byKind[t.kind] ?? 0) + 1; const c = colLetter(t.col); byCol[c] = (byCol[c] ?? 0) + 1; if (sample.length < 6) sample.push(`aba${t.sheet}!${colLetter(t.col)}${t.row}`); }
  console.log(`  ilegíveis por tipo: ${JSON.stringify(byKind)}; por coluna: ${JSON.stringify(byCol)}; exemplos(posição): ${sample.join(", ")}`);
  let onlyOld = 0, onlyNew = 0, same = 0, diffText = 0, diffOnlyLeadingSep = 0, diffLenOnly = 0, diffContent = 0; const dsample = [];
  for (const [k, t] of oldNonEmpty) {
    if (!n.rows.has(k)) { onlyOld += 1; continue; }
    const nt = n.rows.get(k);
    if (nt === t) { same += 1; continue; }
    diffText += 1;
    const strip = (s) => s.replace(/^(\s*\|\s*)+/, "");
    const toks = (s) => s.split("|").map((x) => x.trim()).filter(Boolean).join("|");
    if (strip(nt) === strip(t)) diffOnlyLeadingSep += 1;
    else if (toks(nt) === toks(t)) diffLenOnly += 1; // mesmos valores, só mudou o posicionamento de colunas vazias
    else { diffContent += 1; if (dsample.length < 6) { const [si, r] = k.split("|"); dsample.push(`aba${si}!linha${r}(antigo=${t.length}c,novo=${nt.length}c)`); } }
  }
  for (const k of n.rows.keys()) if (!oldNonEmpty.has(k)) onlyNew += 1;
  console.log(`comparação por linha: iguais=${same} diferentes=${diffText} (só separadores iniciais=${diffOnlyLeadingSep}; mesmos valores, colunas vazias deslocadas=${diffLenOnly}; conteúdo diferente=${diffContent}) soNoAntigo=${onlyOld} soNoNovo=${onlyNew}`);
  if (dsample.length) console.log(`  amostra de conteúdo diferente (posição/tamanho, sem texto): ${dsample.join("; ")}`);
}
