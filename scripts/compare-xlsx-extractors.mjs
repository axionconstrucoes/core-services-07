// Comparação SOMENTE LEITURA de fidelidade entre o extrator XLSX ANTIGO (leitura em memória, ExcelJS DOM, como em
// b173844^) e o NOVO (scripts/lib/xlsx-extract.mjs), célula a célula, sobre versões XLSX reais da WEG.
// Não grava no banco nem no Storage. NUNCA imprime conteúdo de célula, nomes de aba ou de arquivo: só contagens,
// posições (aba por índice, linha, coluna) e o TIPO da diferença. O antigo é executado em processo filho (estoura a
// memória em arquivo grande) e com proteção por célula (valor ilegível => vazio) apenas para conseguir terminar.
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
  const merged = cell.isMerged && cell.master !== cell ? "+escrava-de-mesclagem" : cell.isMerged ? "+mestre-de-mesclagem" : "";
  if (v == null) return `valor-nulo${merged}`;
  if (typeof v === "object") {
    if ("formula" in v || "sharedFormula" in v) return `formula(result=${v.result == null ? "nulo" : typeof v.result})${merged}`;
    if ("richText" in v) return `richText${merged}`;
    if ("hyperlink" in v) return `hyperlink${merged}`;
    if ("error" in v) return `erro${merged}`;
    if (v instanceof Date) return `data${merged}`;
    return `objeto${merged}`;
  }
  return `${typeof v}${merged}`;
};

/** Antigo: ExcelJS DOM + eachRow(includeEmpty:false) + eachCell(includeEmpty:true), igual ao código anterior.
 *  Guarda duas versões da linha: `all` (como o antigo gravava) e `own` (sem células escravas de mesclagem, que o DOM
 *  preenche com o valor da célula mestre). Chave interna por NOME da aba (nunca impresso). */
async function oldCells(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const rows = []; // [key, { all, own, si }]
  const throws = []; // { kind, sheet, row, col }
  const sheets = [];
  wb.eachSheet((ws) => {
    sheets.push(ws.name);
    const si = sheets.length;
    ws.eachRow({ includeEmpty: false }, (row, number) => {
      const all = [], own = [];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        let text;
        try { text = cell.text; } catch { throws.push({ kind: kindOf(cell), sheet: si, row: number, col }); text = ""; }
        const t = normalize(text);
        all.push(t);
        if (!(cell.isMerged && cell.master !== cell)) own.push(t);
      });
      rows.push([`${ws.name}|${number}`, { all, own, si }]);
    });
  });
  return { rows, throws, sheets: sheets.length };
}

async function newLines(buffer) {
  const { lines, stats } = await readXlsxLines(buffer, normalize);
  const rows = new Map();
  const names = [];
  for (const l of lines) { if (!names.includes(l.sheet)) names.push(l.sheet); rows.set(`${l.sheet}|${l.row}`, l.text); }
  return { rows, stats, sheets: names.length };
}

// Processo filho: lê com o extrator ANTIGO isolado.
if (process.argv[2] === "--old") {
  const r = await oldCells(readFileSync(process.argv[3]));
  writeFileSync(process.argv[4], JSON.stringify(r));
  process.exit(0);
}
function oldIsolated(buffer) {
  const dir = mkdtempSync(join(tmpdir(), "acc-xlsx-cmp-"));
  try {
    writeFileSync(join(dir, "in.xlsx"), buffer);
    const r = spawnSync("node", [fileURLToPath(import.meta.url), "--old", join(dir, "in.xlsx"), join(dir, "out.json")], { encoding: "utf8", timeout: 240000, maxBuffer: 1 << 24 });
    if (r.status !== 0) return { falhou: true, sinal: r.signal, estouroMemoria: /heap out of memory|FATAL ERROR/i.test(String(r.stderr)) };
    const j = JSON.parse(readFileSync(join(dir, "out.json"), "utf8"));
    return { rows: new Map(j.rows), throws: j.throws, sheets: j.sheets };
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const toks = (s) => s.split("|").map((x) => x.trim()).filter(Boolean);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

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
  if (v.local) buffer = readFileSync(v.local);
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
  const oldRows = new Map([...o.rows].map(([k, r]) => [k, { ...r, text: r.all.join(" | ").trim() }]).filter(([, r]) => r.text));
  console.log(`antigo(protegido): abas=${o.sheets} linhas(eachRow)=${o.rows.size} linhasComTexto=${oldRows.size} celulasQueLancam=${o.throws.length}`);
  const byKind = {}; const byCol = {}; const sample = [];
  for (const t of o.throws) { byKind[t.kind] = (byKind[t.kind] ?? 0) + 1; const c = colLetter(t.col); byCol[c] = (byCol[c] ?? 0) + 1; if (sample.length < 6) sample.push(`aba${t.sheet}!${colLetter(t.col)}${t.row}`); }
  console.log(`  ilegíveis por tipo: ${JSON.stringify(byKind)}; por coluna: ${JSON.stringify(byCol)}; exemplos(posição): ${sample.join(", ")}`);
  let exact = 0, ownEqual = 0, tokEqual = 0, tokEqualOwn = 0, differ = 0, onlyOld = 0, onlyNew = 0, extraCellsInNew = 0, missingInNew = 0;
  const dsample = [];
  for (const [k, r] of oldRows) {
    if (!n.rows.has(k)) { onlyOld += 1; continue; }
    const nt = n.rows.get(k);
    if (nt === r.text) { exact += 1; continue; }
    if (nt === r.own.join(" | ").trim()) { ownEqual += 1; continue; }
    if (same(toks(nt), toks(r.text))) { tokEqual += 1; continue; }
    if (same(toks(nt), toks(r.own.join(" | ")))) { tokEqualOwn += 1; continue; }
    differ += 1;
    const a = new Set(toks(r.all.join(" | "))), b = new Set(toks(nt));
    extraCellsInNew += [...b].filter((x) => !a.has(x)).length;
    missingInNew += [...a].filter((x) => !b.has(x)).length;
    if (dsample.length < 6) dsample.push(`aba${r.si}!linha${k.split("|").pop()}(antigo=${r.text.length}c,novo=${nt.length}c)`);
  }
  for (const k of n.rows.keys()) if (!oldRows.has(k)) onlyNew += 1;
  console.log(`comparação por linha: idênticas=${exact}; idênticas se ignorar células escravas de mesclagem=${ownEqual}; mesmos valores (só posição de colunas vazias)=${tokEqual}; idem sem escravas=${tokEqualOwn}; DIFERENTES=${differ} (valores só no novo=${extraCellsInNew}, valores só no antigo=${missingInNew}); linhas só no antigo=${onlyOld}; linhas só no novo=${onlyNew}`);
  if (dsample.length) console.log(`  amostra das diferentes (posição/tamanho, sem texto): ${dsample.join("; ")}`);
}
