// Teste do procedimento de provisionamento (scripts/homolog/provision-acc-homolog.mjs). SEM rede, SEM criar recurso: só dry-run e recusas.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluateProvision, buildCreateCommand, isOutsideRepo, redact } from "./homolog/provision-lib.mjs";
import { OPERATIONAL_REFS } from "./homolog/guard.mjs";

let passed = 0, failed = 0;
const ok = (n, c) => { if (c) { passed += 1; console.log(`OK   ${n}`); } else { failed += 1; console.log(`FAIL ${n}`); } };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(root, "scripts", "homolog", "provision-acc-homolog.mjs");
const outside = path.join(os.tmpdir(), "acc-homolog-ref-teste.txt");
const FAKE = "abcdefghijklmnopqrst";
const ctx = { repoRoot: root };

// ---- puro ----
ok("dry-run sem flags é permitido e não cria recurso", (() => { const v = evaluateProvision({ execute: false }, {}, ctx); return v.ok && v.mode === "dry-run" && !v.createsResource; })());
ok("recusa --execute sem HOMOLOG_AUTHORIZED=SIM", !evaluateProvision({ execute: true, confirmCost: "US$ 10", refFile: outside }, { HOMOLOG_DB_PASSWORD: "x1234" }, ctx).ok);
ok("recusa HOMOLOG_AUTHORIZED diferente de SIM (ex.: true)", !evaluateProvision({ execute: true, confirmCost: "US$ 10", refFile: outside }, { HOMOLOG_AUTHORIZED: "true", HOMOLOG_DB_PASSWORD: "x1234" }, ctx).ok);
ok("recusa --execute sem --confirm-cost", !evaluateProvision({ execute: true, refFile: outside }, { HOMOLOG_AUTHORIZED: "SIM", HOMOLOG_DB_PASSWORD: "x1234" }, ctx).ok);
ok("recusa --execute sem senha no ambiente", !evaluateProvision({ execute: true, confirmCost: "US$ 10", refFile: outside }, { HOMOLOG_AUTHORIZED: "SIM" }, ctx).ok);
ok("recusa ref-file dentro do repositório", !evaluateProvision({ execute: true, confirmCost: "US$ 10", refFile: path.join(root, "ref.txt") }, { HOMOLOG_AUTHORIZED: "SIM", HOMOLOG_DB_PASSWORD: "x1234" }, ctx).ok && !isOutsideRepo(path.join(root, "a", "b"), root));
ok("todas as condições juntas liberam a CRIAÇÃO", (() => { const v = evaluateProvision({ execute: true, confirmCost: "US$ 10", refFile: outside }, { HOMOLOG_AUTHORIZED: "SIM", HOMOLOG_DB_PASSWORD: "x1234" }, ctx); return v.ok && v.createsResource; })());
for (const ref of OPERATIONAL_REFS) {
  ok(`recusa ref operacional ${ref.slice(0, 5)}… (adoção)`, !evaluateProvision({ execute: true, adoptRef: ref, refFile: outside }, { HOMOLOG_AUTHORIZED: "SIM" }, ctx).ok);
  ok(`recusa ref operacional ${ref.slice(0, 5)}… mesmo em dry-run`, !evaluateProvision({ execute: false, adoptRef: ref }, {}, ctx).ok);
}
ok("recusa adoção do ref configurado no app (NEXT_PUBLIC_SUPABASE_URL)", !evaluateProvision({ execute: false, adoptRef: FAKE }, { NEXT_PUBLIC_SUPABASE_URL: `https://${FAKE}.supabase.co` }, ctx).ok);
ok("recusa adoção do ref do vínculo da CLI", !evaluateProvision({ execute: false, adoptRef: FAKE }, {}, { ...ctx, linkedRefText: `${FAKE}\n` }).ok);
ok("adoção (projeto já existente) não cria recurso nem exige custo", (() => { const v = evaluateProvision({ execute: true, adoptRef: FAKE, refFile: outside }, { HOMOLOG_AUTHORIZED: "SIM" }, ctx); return v.ok && !v.createsResource; })());
ok("recusa adoção com ref malformado", !evaluateProvision({ execute: false, adoptRef: "curto" }, {}, ctx).ok);
ok("comando impresso usa variável, nunca a senha", buildCreateCommand().includes('"$HOMOLOG_DB_PASSWORD"') && /--region sa-east-1 --size micro --org-id|--org-id vlkuhdxanitymduyvhxi --region sa-east-1 --size micro/.test(buildCreateCommand()));
ok("redact remove segredos", !redact("senha=SuperSecreta123", ["SuperSecreta123"]).includes("SuperSecreta123"));

// ---- processo real: dry-run NÃO chama rede nem processos filhos (preload que registra e bloqueia) ----
const tmp = mkdtempSync(path.join(os.tmpdir(), "prov-test-"));
const preload = path.join(tmp, "block-net.mjs");
writeFileSync(preload, `
import cp from "node:child_process"; import net from "node:net"; import dns from "node:dns"; import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
const hit = (w) => { fs.writeSync(2, "NETCALL:" + w + "\\n"); process.exit(97); };
for (const k of ["spawn","spawnSync","exec","execSync","execFile","execFileSync","fork"]) cp[k] = () => hit("cp." + k);
net.Socket.prototype.connect = () => hit("net.connect"); net.connect = () => hit("net.connect"); net.createConnection = () => hit("net.createConnection");
dns.lookup = () => hit("dns.lookup");
syncBuiltinESMExports();
`);
const SECRET = "SenhaSuperSecreta-9X";
const envBase = { ...process.env, HOMOLOG_DB_PASSWORD: SECRET, HOMOLOG_DATABASE_URL: `postgresql://u:${SECRET}@db.${FAKE}.supabase.co:5432/postgres` };
delete envBase.HOMOLOG_AUTHORIZED;
const run = (extra, env = envBase, withPreload = true) =>
  spawnSync(process.execPath, [...(withPreload ? ["--import", pathToFileURL(preload).href] : []), script, ...extra], { env, encoding: "utf8" });

const dry = run([]);
ok("dry-run: sai 0", dry.status === 0);
ok("dry-run: NÃO chamou rede/dns/processo filho", !`${dry.stdout}${dry.stderr}`.includes("NETCALL"));
ok("dry-run: imprime o comando de criação com variável", dry.stdout.includes("--org-id vlkuhdxanitymduyvhxi") && dry.stdout.includes("--region sa-east-1") && dry.stdout.includes("--size micro"));
ok("dry-run: não imprime senha nem string de conexão", !`${dry.stdout}${dry.stderr}`.includes(SECRET));

const r1 = run(["--execute", "--confirm-cost", "US$ 10/mes", `--ref-file=${outside}`]);
ok("--execute sem HOMOLOG_AUTHORIZED: recusa (exit 2) sem rede", r1.status === 2 && !`${r1.stdout}${r1.stderr}`.includes("NETCALL"));
const r2 = run(["--execute", `--ref-file=${outside}`], { ...envBase, HOMOLOG_AUTHORIZED: "SIM" });
ok("--execute sem --confirm-cost: recusa sem rede", r2.status === 2 && !`${r2.stdout}${r2.stderr}`.includes("NETCALL"));
for (const ref of OPERATIONAL_REFS) {
  const r = run([`--adopt-ref=${ref}`, "--execute", `--ref-file=${outside}`], { ...envBase, HOMOLOG_AUTHORIZED: "SIM" });
  ok(`processo recusa ref operacional ${ref.slice(0, 5)}… sem rede`, r.status === 2 && !`${r.stdout}${r.stderr}`.includes("NETCALL"));
}
ok("recusas não imprimem a senha", ![r1, r2].some((r) => `${r.stdout}${r.stderr}`.includes(SECRET)));
ok("nenhum arquivo de ref foi criado pelas recusas", !readdirSync(os.tmpdir()).includes("acc-homolog-ref-teste.txt"));
ok("o script não contém senha/valores embutidos (apenas nomes de variável)", !/(password|secret)\s*[:=]\s*["'][^"']{6,}/i.test(readFileSync(script, "utf8")));

console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed ? 1 : 0);
