// Fase 5/F: o reinventario documentado (docs/implantacao/09) bate com o diretorio de migrations, o inventario (01) e a sequencia JSON.
// So le arquivos; sem rede, sem banco. Uso: node scripts/test-f5-f-reinventario.mjs
import { readdirSync, readFileSync } from "node:fs";
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

const local = readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql"));
const inv = read("docs/implantacao/01-inventario-migrations.md");
const rows = [...inv.matchAll(/^\| (\d{14}_[a-z0-9_]+) \| ([a-z-]+) \|/gm)].map((m) => ({ stem: m[1], status: m[2] }));
const n = (pred) => rows.filter(pred).length;
const doc9 = read("docs/implantacao/09-fase5-reinventario-e-preparacao.md");
const seq = JSON.parse(read("scripts/data/implantacao-sequencia.json"));

check("o inventário tem uma linha por arquivo local e o total documentado no 09 bate com o diretório", () => {
  assert(rows.length === local.length, `linhas ${rows.length} != arquivos ${local.length}`);
  // O 09 documenta o estado de 21/11/2026 (192 arquivos, 57 pendentes); novas migrations só podem aumentar.
  assert(local.length >= 192, `arquivos ${local.length} < 192`);
  assert(/\*\*192\*\*/.test(doc9) && /\*\*57\*\*/.test(doc9), "09 sem os totais 192/57");
});

check("pendentes = linhas pendente*; registradas = 134; hotfix efetivo = 1", () => {
  assert(n((r) => r.status === "aplicada-registrada") === 134);
  assert(n((r) => r.status === "aplicada-fora-do-historico") === 1);
  assert(n((r) => r.status.startsWith("pendente")) >= 57, "pendentes < 57");
});

check("a sequência ensaiada cobre as 57 pendentes de 21/11/2026 (55 em ondas + 2 adiadas)", () => {
  const inWaves = seq.ondas.flatMap((o) => o.migrations).length;
  assert(inWaves + seq.adiadas.length >= 57, `ondas ${inWaves} + adiadas ${seq.adiadas.length}`);
});

check("o 09 declara que nada foi aplicado e que o hotfix P0 não foi reaplicado", () => {
  assert(/nada foi aplicado/i.test(doc9) && /NÃO foi reaplicado/.test(doc9));
});

check("o ensaio aceita ACC_ENSAIO_MIGRATIONS_DIR e continua local-only", () => {
  const src = read("scripts/ensaio-implantacao-ondas-realpg.mjs");
  assert(/ACC_ENSAIO_MIGRATIONS_DIR/.test(src) && /127\.0\.0\.1/.test(src) && /55434/.test(src));
});

check("o 04 documenta SPF/DKIM/DMARC como bloqueio de ENVIO (não de leitura) e o bloqueio exato do Graph", () => {
  const t = read("docs/implantacao/04-requisitos-email.md");
  assert(/NÃO bloqueiam a LEITURA/.test(t) && /Mail\.Read/.test(t) && /CONSENTIMENTO DE ADMINISTRADOR/.test(t));
  assert(/Outlook = NÃO monitorado/.test(t));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
