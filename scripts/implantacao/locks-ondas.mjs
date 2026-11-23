// Lock e tempo por onda: analise estatica das migrations de scripts/data/implantacao-sequencia.json contra os TAMANHOS REAIS
// da copia de producao (JSON gerado por scripts/implantacao/sql/tamanhos-tabelas.sql). Docs: docs/implantacao/28.
// Somente leitura de arquivos; sem rede e sem banco.
//   node scripts/implantacao/locks-ondas.mjs --tamanhos tamanhos.json --catalogo catalogo-antes.json [--md saida.md] [--json saida.json]
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analisarMigration, classificarRisco, estimarSegundos } from "./locks-ondas-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const o = {};
for (let i = 2; i < process.argv.length; i += 2) o[process.argv[i].replace(/^--/, "")] = process.argv[i + 1];
if (!o.tamanhos || !o.catalogo) { console.error("uso: --tamanhos <json> --catalogo <json> [--md f] [--json f]"); process.exit(2); }

const tamanhos = JSON.parse(readFileSync(o.tamanhos, "utf8"));
const cat = JSON.parse(readFileSync(o.catalogo, "utf8"));
const existentes = new Set(cat.colunas.map((c) => c.tabela));
const seq = JSON.parse(readFileSync(path.join(root, "scripts", "data", "implantacao-sequencia.json"), "utf8"));
const grupos = [...seq.ondas.map((w) => ({ id: w.id, migrations: w.migrations })), ...seq.adiadas.map((a) => ({ id: `adiada ${a.onda}`, migrations: [a.migration] }))];
const ordem = { BAIXO: 0, REVISAR: 1, MEDIO: 2, ALTO: 3 };

const linhas = [];
const json = [];
for (const g of grupos) {
  let pior = "BAIXO";
  let seg = 0;
  const migs = [];
  for (const m of g.migrations) {
    const sql = readFileSync(path.join(root, "supabase", "migrations", `${m}.sql`), "utf8").replace(/\r\n/g, "\n");
    const itens = analisarMigration(m, sql, { tamanhos, existentes });
    const relevantes = itens.filter((i) => !i.nova && i.tabela);
    let piorM = "BAIXO";
    let segM = 0;
    for (const i of itens) {
      i.risco = classificarRisco(i);
      i.segundos = estimarSegundos(i);
      if (ordem[i.risco] > ordem[piorM]) piorM = i.risco;
      segM += i.segundos;
    }
    if (ordem[piorM] > ordem[pior]) pior = piorM;
    seg += segM;
    migs.push({ migration: m, risco: piorM, segundos: Number(segM.toFixed(2)), operacoesEmTabelaExistente: relevantes.length, itens });
  }
  json.push({ onda: g.id, risco: pior, segundosEstimados: Number(seg.toFixed(2)), migrations: migs });
}

linhas.push("| Onda | Migration | Risco | Operacoes em tabela existente (tipo tabela linhas MB) | Obs |", "|---|---|---|---|---|");
for (const w of json) {
  for (const m of w.migrations) {
    const ops = m.itens.filter((i) => !i.nova && i.tabela && (i.varre || i.rewrite || i.escreve || i.indice || i.irreversivel || ["DROP COLUMN", "RENAME"].includes(i.tipo)));
    const resumo = [...new Map(ops.map((i) => [`${i.tipo} ${i.tabela}`, i])).values()].map((i) => `${i.tipo} ${i.tabela} (${i.linhas} l, ${(i.bytes / 1048576).toFixed(1)} MB)`).join("; ");
    const obs = [...new Set(m.itens.filter((i) => i.irreversivel).map((i) => `${i.tipo} IRREVERSIVEL`)), ...new Set(m.itens.filter((i) => i.tipo.startsWith("DO (bloco")).map((i) => `DO dinamico (limite superior ${i.linhas} l, ${(i.bytes / 1048576).toFixed(1)} MB)`)), ...new Set(m.itens.filter((i) => i.tipo.startsWith("SELECT")).map((i) => `${i.tipo}: revisar`))].join("; ");
    linhas.push(`| ${w.onda} | ${m.migration} | ${m.risco} | ${resumo || "-"} | ${obs || "-"} |`);
  }
}
const resumoOndas = ["| Onda | Migrations | Pior risco | Tempo estimado com lock (s, ordem de grandeza) |", "|---|---|---|---|", ...json.map((w) => `| ${w.onda} | ${w.migrations.length} | ${w.risco} | ${w.segundosEstimados} |`)];
const md = `${resumoOndas.join("\n")}\n\n${linhas.join("\n")}\n`;
if (o.md) writeFileSync(o.md, md);
if (o.json) writeFileSync(o.json, `${JSON.stringify(json, null, 1)}\n`);
console.log(md);
