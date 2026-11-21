// Fase 6/H5: garante que TODA migration pendente da sequencia de implantacao tem arquivo de rollback em supabase/rollbacks/ e que
// nenhum rollback contem comando perigoso sem guarda. So le arquivos; sem rede, sem banco.
// O ensaio em Postgres REAL (aplicar onda -> rollback em ordem inversa, 2x -> reaplicar; P0 intacto) esta em
// scripts/ensaio-implantacao-ondas-realpg.mjs (secao "Ensaio de ROLLBACK por ondas"; ACC_ENSAIO_ROLLBACKS=0 desliga).
// Uso: node scripts/test-implantacao-rollbacks.mjs
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message}`); }
}
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };

const seq = JSON.parse(read("scripts/data/implantacao-sequencia.json"));
const pendentes = [...seq.ondas.flatMap((o) => o.migrations), ...seq.adiadas.map((a) => a.migration)];
const rbDir = path.join(root, "supabase", "rollbacks");
const rbFiles = readdirSync(rbDir).filter((f) => f.endsWith(".rollback.sql")).sort();
const rbText = (stem) => read(`supabase/rollbacks/${stem}.rollback.sql`);

// remove comentarios de linha e de bloco (mantem o conteudo de strings e de blocos $$, onde tambem se executa SQL)
const semComentarios = (sql) => sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
// divide em statements por ';' ignorando ';' dentro de blocos $tag$...$tag$ e de strings
function statements(sql) {
  const out = []; let cur = ""; let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") { let j = i + 1; while (j < sql.length) { if (sql[j] === "'" && sql[j + 1] === "'") j += 2; else if (sql[j] === "'") break; else j++; } cur += sql.slice(i, j + 1); i = j + 1; continue; }
    if (c === "$") { const m = /^\$([A-Za-z_0-9]*)\$/.exec(sql.slice(i)); if (m) { const end = sql.indexOf(m[0], i + m[0].length); cur += sql.slice(i, end + m[0].length); i = end + m[0].length; continue; } }
    if (c === ";") { out.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

check("toda migration pendente da sequência (ondas + adiadas) tem arquivo de rollback <versão>_<nome>.rollback.sql", () => {
  const faltam = pendentes.filter((m) => !existsSync(path.join(rbDir, `${m}.rollback.sql`)));
  assert(faltam.length === 0, `sem rollback: ${faltam.join(", ")}`);
  assert(pendentes.length >= 69, `esperadas >= 69 pendentes na sequência, há ${pendentes.length}`);
});

check("todo arquivo de rollback corresponde a uma migration existente (nome idêntico, sem órfãos)", () => {
  const migs = new Set(readdirSync(path.join(root, "supabase", "migrations")).map((f) => f.replace(/\.sql$/, "")));
  const orfaos = rbFiles.map((f) => f.replace(/\.rollback\.sql$/, "")).filter((s) => !migs.has(s));
  assert(orfaos.length === 0, `rollback sem migration: ${orfaos.join(", ")}`);
});

check("nenhum rollback contém marcador pendente de revisão (MANUAL-REVISAR/TODO/FIXME)", () => {
  const ruins = rbFiles.filter((f) => /MANUAL-REVISAR|\bTODO\b|\bFIXME\b/.test(read(`supabase/rollbacks/${f}`)));
  assert(ruins.length === 0, ruins.join(", "));
});

check("nenhum rollback usa DROP sem IF EXISTS (exceto o drop de constraint dinâmico que recria a definição), DROP ... CASCADE ou TRUNCATE", () => {
  const erros = [];
  for (const f of rbFiles) {
    const sql = semComentarios(read(`supabase/rollbacks/${f}`));
    for (const m of sql.matchAll(/\bdrop\s+(table|function|trigger|policy|index|constraint|column|view|type|schema|extension|materialized\s+view)\s+(?!if\s+exists\b)([^\n;]{0,60})/gi)) {
      if (/^constraint$/i.test(m[1]) && /^%/.test(m[2].trim())) continue; // alter table %s drop constraint %I (seguido do add constraint)
      erros.push(`${f}: ${m[0].trim()}`);
    }
    if (/\bcascade\b/i.test(sql)) erros.push(`${f}: usa CASCADE`);
    if (/\btruncate\b/i.test(sql)) erros.push(`${f}: usa TRUNCATE`);
  }
  assert(erros.length === 0, erros.slice(0, 8).join(" | "));
});

check("nenhum rollback apaga/atualiza linhas sem WHERE (delete/update)", () => {
  const erros = [];
  for (const f of rbFiles) {
    for (const st of statements(semComentarios(read(`supabase/rollbacks/${f}`)))) {
      if (/^(delete\s+from)\b/i.test(st) && !/\bwhere\b/i.test(st)) erros.push(`${f}: ${st.slice(0, 80)}`);
      if (/^update\s+public\./i.test(st) && !/\bwhere\b/i.test(st)) erros.push(`${f}: ${st.slice(0, 80)}`);
    }
  }
  assert(erros.length === 0, erros.slice(0, 6).join(" | "));
});

check("todo rollback que apaga tabela ou coluna tem GUARDA que RECUSA quando há dado/evidência (ROLLBACK_BLOCKED)", () => {
  const erros = [];
  for (const f of rbFiles) {
    const sql = semComentarios(read(`supabase/rollbacks/${f}`));
    const apaga = /\bdrop\s+table\b/i.test(sql) || /\bdrop\s+column\b/i.test(sql);
    if (apaga && !/ROLLBACK_BLOCKED/.test(sql)) erros.push(f);
  }
  assert(erros.length === 0, `apaga tabela/coluna sem guarda: ${erros.join(", ")}`);
});

check("todo rollback é transacional (begin ... commit/rollback) e os que recusam por desenho terminam em rollback", () => {
  const erros = [];
  for (const f of rbFiles) {
    const sql = semComentarios(read(`supabase/rollbacks/${f}`));
    if (!/^\s*begin\s*;/im.test(sql) || !/\b(commit|rollback)\s*;\s*$/i.test(sql.trim())) erros.push(f);
  }
  assert(erros.length === 0, `sem begin/commit: ${erros.join(", ")}`);
});

check("nenhum rollback redefine record_risk_alert_action nem reaplica o corpo antigo (P0 md5 930f6d75898793479b418950b0053bd9 nunca é rebaixado)", () => {
  const erros = [];
  for (const f of rbFiles) {
    const sql = semComentarios(read(`supabase/rollbacks/${f}`));
    if (/create\s+(or\s+replace\s+)?function\s+(public\.)?record_risk_alert_action\b/i.test(sql)) erros.push(`${f}: redefine a função`);
    if (/\$ACC_FN\$|ACC_NO_REGRESSION/.test(sql)) erros.push(`${f}: reaplica o corpo intermediário`);
    if (/alter\s+function\s+(public\.)?record_risk_alert_action|grant\s+[^;]*record_risk_alert_action|revoke\s+[^;]*record_risk_alert_action/i.test(sql)) erros.push(`${f}: altera ACL/owner do P0`);
    if (/c2f015a91b8f4e94c52a68c3536cb89d/.test(sql)) erros.push(`${f}: cita o md5 do corpo intermediário`);
  }
  assert(erros.length === 0, erros.join(" | "));
});

check("migrations que redefinem record_risk_alert_action têm rollback NO-OP (comentado) e não o rebaixam", () => {
  const afetam = pendentes.filter((m) => /create\s+(or\s+replace\s+)?function\s+public\.record_risk_alert_action|\$ACC_FN\$/i.test(read(`supabase/migrations/${m}.sql`).replace(/^\s*--.*$/gm, "")));
  assert(afetam.length >= 3, `esperadas >= 3 migrations que afetam o P0 (130000, 151000, 101000), achei ${afetam.length}`);
  for (const m of afetam) {
    const sql = rbText(m);
    assert(/record_risk_alert_action/.test(sql) && /NO-OP/i.test(sql), `${m}: rollback sem o comentário NO-OP sobre o P0`);
  }
});

check("rollbacks IRREVERSÍVEIS recusam com mensagem clara (restaurar do backup/PITR) e estão marcados IRREVERSÍVEL no doc 03", () => {
  const irrev = rbFiles.filter((f) => /ROLLBACK_IRREVERSIVEL/.test(read(`supabase/rollbacks/${f}`)));
  assert(irrev.length >= 1, "esperado ao menos 1 rollback irreversível (20261121177000: dados de SLA)");
  const d3 = read("docs/implantacao/03-rollback-validacao.md");
  for (const f of irrev) {
    const stem = f.replace(/\.rollback\.sql$/, "");
    const sql = read(`supabase/rollbacks/${f}`);
    assert(/backup\/PITR/i.test(sql) && /raise exception/i.test(sql), `${f}: sem mensagem de recusa com backup/PITR`);
    const linha = d3.split("\n").find((l) => l.startsWith(`| ${stem} |`));
    assert(linha && /IRREVERS[ÍI]VEL/.test(linha), `${stem}: não marcada IRREVERSÍVEL no doc 03`);
  }
});

check("o ensaio de rollback em Postgres real está no ensaio por ondas (aplicar -> rollback inverso 2x -> reaplicar, P0, guarda de dados) e é local-only", () => {
  const src = read("scripts/ensaio-implantacao-ondas-realpg.mjs");
  assert(/Ensaio de ROLLBACK por ondas/.test(src) && /idempotencia/.test(src) && /ROLLBACK_BLOCKED/.test(src) && /ROLLBACK_IRREVERSIVEL/.test(src));
  assert(/127\.0\.0\.1/.test(src) && /55434/.test(src) && /RECUSADO/.test(src));
});

check("este teste e o ensaio estão na lista de testes", () => {
  const lista = read("scripts/test-scripts.list");
  assert(/^scripts\/test-implantacao-rollbacks\.mjs$/m.test(lista), "test-implantacao-rollbacks fora da lista");
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
