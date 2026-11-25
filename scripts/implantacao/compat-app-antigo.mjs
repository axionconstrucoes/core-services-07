// CLI da compatibilidade do app antigo (codigo da `main`) com o schema novo. Docs: docs/implantacao/28.
// Somente leitura: `git show`/`git ls-tree` do ref e, se pedido, psql READ ONLY num PostgreSQL LOCAL descartavel.
// Nunca le dados de tabela, nunca usa rede, token ou Supabase remoto.
//
//   node scripts/implantacao/compat-app-antigo.mjs catalogo --psql <psql> --banco <db> --out catalogo.json
//        (PGHOST/PGPORT/PGUSER/PGPASSWORD do ambiente; recusa host que nao seja 127.0.0.1/localhost)
//   node scripts/implantacao/compat-app-antigo.mjs extrair --ref main --out uso.json [--catalogo a.json]...
//   node scripts/implantacao/compat-app-antigo.mjs comparar --antes a.json --depois b.json --uso uso.json [--out r.json] [--md r.md]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { comparar, ehArquivoDeProducao, extrairUso, mencoesLiterais } from "./compat-app-antigo-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");

function args(argv) {
  const o = { _: [], catalogo: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) { o._.push(a); continue; }
    const k = a.slice(2);
    const v = argv[i + 1];
    if (k === "catalogo") o.catalogo.push(v); else o[k] = v;
    i += 1;
  }
  return o;
}
const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const lerJson = (p) => JSON.parse(readFileSync(p, "utf8"));

export function renderMarkdown({ resumo, achados }, meta = {}) {
  const L = [];
  L.push(`Resumo: ${resumo.rpcsUsadas} RPCs verificadas (${resumo.rpcsOk} sem achados); ${resumo.tabelasUsadas} tabelas verificadas (${resumo.tabelasOk} sem achados).`);
  const por = (n) => achados.filter((a) => a.nivel === n);
  L.push(`Achados: ${por("BLOQUEANTE").length} BLOQUEANTE, ${por("ATENCAO").length} ATENCAO, ${por("INFO").length} INFO.`);
  if (meta.ref) L.push(`Codigo analisado: ${meta.ref}.`);
  for (const nivel of ["BLOQUEANTE", "ATENCAO", "INFO"]) {
    const lista = por(nivel);
    if (!lista.length) continue;
    L.push("", `## ${nivel}`, "", "| Tipo | Objeto | Detalhe |", "|---|---|---|");
    for (const a of lista) L.push(`| ${a.tipo} | ${a.objeto} | ${a.detalhe.replace(/\|/g, "/")} |`);
  }
  return `${L.join("\n")}\n`;
}

function main() {
  const o = args(process.argv.slice(2));
  const cmd = o._[0];
  if (cmd === "catalogo") {
    const host = process.env.PGHOST ?? "";
    if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("recusado: PGHOST precisa ser local (127.0.0.1)");
    if (!o.psql || !o.banco || !o.out) throw new Error("uso: catalogo --psql <psql> --banco <db> --out <arquivo>");
    const sql = path.join(here, "sql", "catalogo-compat.sql");
    const env = { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" };
    const out = execFileSync(o.psql, ["-X", "-At", "-d", o.banco, "-f", sql], { env, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
    JSON.parse(out);
    writeFileSync(o.out, out);
    console.log(`catalogo gravado: ${o.out}`);
  } else if (cmd === "extrair") {
    const ref = o.ref ?? "main";
    const arquivos = {};
    for (const p of git("ls-tree", "-r", "--name-only", ref).split("\n").filter(Boolean)) {
      if (ehArquivoDeProducao(p)) arquivos[p] = git("show", `${ref}:${p}`);
    }
    const uso = extrairUso(arquivos);
    const nomes = new Set();
    for (const c of o.catalogo) {
      const cat = lerJson(c);
      for (const f of cat.funcoes) nomes.add(f.nome);
      for (const x of cat.colunas) nomes.add(x.tabela);
    }
    uso.mencoes = nomes.size ? mencoesLiterais(arquivos, nomes) : {};
    uso.ref = ref;
    writeFileSync(o.out, `${JSON.stringify(uso, null, 1)}\n`);
    console.log(`uso extraido de ${ref}: ${uso.arquivosAnalisados} arquivos, ${Object.keys(uso.rpcs).length} RPCs, ${Object.keys(uso.tabelas).length} tabelas, ${uso.dinamicos.rpc.length} .rpc(dinamico), ${uso.dinamicos.from.length} .from(dinamico)`);
  } else if (cmd === "comparar") {
    const uso = lerJson(o.uso);
    const r = comparar({ antes: lerJson(o.antes), depois: lerJson(o.depois), uso, mencoes: uso.mencoes ?? {} });
    if (o.out) writeFileSync(o.out, `${JSON.stringify(r, null, 1)}\n`);
    const md = renderMarkdown(r, { ref: uso.ref });
    if (o.md) writeFileSync(o.md, md);
    console.log(md);
    process.exitCode = r.achados.some((a) => a.nivel === "BLOQUEANTE") ? 1 : 0;
  } else {
    console.error("uso: catalogo | extrair | comparar (ver cabecalho do arquivo)");
    process.exitCode = 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (e) { console.error(`ERRO: ${e.message}`); process.exitCode = 2; }
}
