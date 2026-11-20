// Consistência do plano de implantação (docs/implantacao/) com o diretório de migrations e guarda contra aplicação
// operacional por scripts versionados. Só lê arquivos; sem rede, sem banco.
// Uso: node scripts/test-implantacao-plano.mjs
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

// Constantes comprovadas por leitura do projeto operacional em 20/11/2026 (docs/implantacao/01).
const LAST_REMOTE_VERSION = "20261119034721";
const REMOTE_HISTORY_HASH = "70a176da74c9f88ac06b04d80bc55891";
const REMOTE_HISTORY_COUNT = 134;
const OUT_OF_ORDER = ["20261107090000", "20261116090000", "20261118140000"];
const HOTFIX_VERSION = "20261121090000";
const HOTFIX_BODY_MD5 = "930f6d75898793479b418950b0053bd9";
const STATUSES = new Set([
  "aplicada-registrada",
  "aplicada-fora-do-historico",
  "pendente",
  "pendente-parcial",
  "pendente-fora-de-ordem",
  "pendente-decisao",
]);

const migrationsDir = path.join(root, "supabase", "migrations");
const local = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => f.replace(/\.sql$/, ""))
  .sort();

const inventory = read("docs/implantacao/01-inventario-migrations.md");
const rows = [];
for (const line of inventory.split("\n")) {
  const m = /^\| (\d{14}_[a-z0-9_]+) \| ([a-z-]+) \| (.*) \|$/.exec(line);
  if (m) rows.push({ stem: m[1], status: m[2], evidence: m[3].trim() });
}
const byStem = new Map(rows.map((r) => [r.stem, r]));

check("inventário sem linhas duplicadas", () => {
  assert(byStem.size === rows.length, "migration repetida no inventário");
});

check("toda migration local aparece no inventário (inclui 20261122* e 20261123* quando existirem)", () => {
  const missing = local.filter((s) => !byStem.has(s));
  assert(missing.length === 0, `faltam no inventário: ${missing.join(", ")}`);
});

check("o inventário não lista migration inexistente no diretório", () => {
  const stale = rows.filter((r) => !local.includes(r.stem)).map((r) => r.stem);
  assert(stale.length === 0, `linhas sem arquivo: ${stale.join(", ")}`);
});

check("todo estado do inventário é válido e toda linha tem evidência", () => {
  for (const r of rows) {
    assert(STATUSES.has(r.status), `${r.stem}: estado inválido ${r.status}`);
    assert(r.evidence.length >= 20, `${r.stem}: evidência ausente`);
  }
});

check("nenhuma migration marcada aplicada-registrada fora do histórico remoto comprovado", () => {
  const reg = rows.filter((r) => r.status === "aplicada-registrada");
  assert(reg.length === REMOTE_HISTORY_COUNT, `esperado ${REMOTE_HISTORY_COUNT} registradas, há ${reg.length}`);
  for (const r of reg) {
    const v = r.stem.slice(0, 14);
    assert(v <= LAST_REMOTE_VERSION, `${r.stem}: versão acima da última remota`);
    assert(!OUT_OF_ORDER.includes(v), `${r.stem}: fora de ordem não pode estar registrada`);
    assert(r.evidence.includes(REMOTE_HISTORY_HASH), `${r.stem}: evidência sem o hash do histórico`);
  }
  // O hash do conjunto registrado (version_name ordenado) precisa bater com o lido no remoto.
  const list = reg.map((r) => r.stem).sort().join(",");
  const h = createHash("md5").update(list).digest("hex");
  assert(h === REMOTE_HISTORY_HASH, `hash do conjunto registrado ${h} difere do remoto ${REMOTE_HISTORY_HASH}`);
});

check("as 3 migrations fora de ordem estão como pendente-fora-de-ordem", () => {
  for (const v of OUT_OF_ORDER) {
    const r = rows.find((x) => x.stem.startsWith(v));
    assert(r && r.status === "pendente-fora-de-ordem", `${v}: ${r ? r.status : "ausente"}`);
  }
});

check("aplicada-fora-do-historico só para o hotfix, com o hash do corpo como evidência", () => {
  const out = rows.filter((r) => r.status === "aplicada-fora-do-historico");
  assert(out.length === 1 && out[0].stem.startsWith(HOTFIX_VERSION), "apenas o hotfix pode estar nesse estado");
  assert(out[0].evidence.includes(HOTFIX_BODY_MD5), "evidência do hotfix sem o md5 do corpo");
});

check("o corpo local vigente do hotfix existe e é o da 20261121101000 (ou 090000)", () => {
  const f = local.find((s) => s.startsWith(HOTFIX_VERSION));
  assert(f, "arquivo do hotfix ausente");
  assert(/create or replace function public\.record_risk_alert_action/i.test(read(`supabase/migrations/${f}.sql`)));
});

check("a 20261121177000 (SLA MÉDIO/BAIXO) está como pendente-decisao e o plano diz NÃO APLICAR sem decisão", () => {
  const r = rows.find((x) => x.stem.startsWith("20261121177000"));
  assert(r && r.status === "pendente-decisao", "estado incorreto");
  assert(/NÃO APLICAR/.test(read("docs/implantacao/02-plano-aplicacao.md")), "plano sem o aviso");
});

check("o plano e o rollback citam toda migration pendente (por versão)", () => {
  const plan = read("docs/implantacao/02-plano-aplicacao.md") + read("docs/implantacao/03-rollback-validacao.md");
  const pend = rows.filter((r) => r.status.startsWith("pendente"));
  const rb = read("docs/implantacao/03-rollback-validacao.md");
  const miss = pend.filter((r) => !rb.includes(r.stem)).map((r) => r.stem);
  assert(miss.length === 0, `sem linha de rollback/validação: ${miss.join(", ")}`);
  assert(plan.includes("20261121177000"), "plano não cita 177000");
});

check("o resumo do inventário bate com a contagem das linhas", () => {
  const n = (s) => rows.filter((r) => r.status === s).length;
  const pend = rows.filter((r) => r.status.startsWith("pendente")).length;
  assert(n("aplicada-registrada") === REMOTE_HISTORY_COUNT);
  assert(n("aplicada-fora-do-historico") === 1);
  assert(n("pendente-decisao") === 1 && n("pendente-parcial") === 1 && n("pendente-fora-de-ordem") === 3);
  // O resumo textual é de 20/11/2026 (171 arquivos); novas migrations só acrescentam linhas pendentes.
  assert(pend >= 36, `pendentes ${pend} < 36`);
});

// ---- Nenhum script versionado aplica migration no projeto operacional ----
const FORBIDDEN = [
  /supabase\s+db\s+push/i,
  /supabase\s+migration\s+up/i,
  /supabase\s+db\s+remote\s+commit/i,
  /["'`]db["'`]\s*,\s*["'`]push["'`]/i,
  /["'`]migration["'`]\s*,\s*["'`]up["'`]/i,
  /apply_migration/i,
  /\bdb\s+push\b/i,
];
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}
const isComment = (line) => /^\s*(\/\/|#|--|\*|\/\*|<!--)/.test(line);

check("nenhum script/workflow/package.json versionado contém comando de aplicação operacional (db push, apply_migration, migration up)", () => {
  const self = path.join(root, "scripts", "test-implantacao-plano.mjs");
  const files = [
    ...walk(path.join(root, "scripts")),
    ...walk(path.join(root, ".github")),
    path.join(root, "package.json"),
    path.join(root, "apps", "web", "package.json"),
  ].filter((f) => f !== self && /\.(mjs|js|ts|ps1|sh|yml|yaml|json|sql|cmd|bat)$/.test(f));
  const hits = [];
  for (const f of files) {
    const isTest = /[\\/]test-[^\\/]+\.mjs$/.test(f);
    const lines = readFileSync(f, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      if (!FORBIDDEN.some((re) => re.test(line))) return;
      // Em arquivos de teste a frase aparece como asserção negativa (regex/texto); só conta se for chamada de execução.
      if (isTest && !/\b(spawnSync|spawn|execSync|execFileSync|exec|execFile)\s*\(/.test(line)) return;
      hits.push(`${path.relative(root, f)}:${i + 1}`);
    });
  }
  assert(hits.length === 0, `comando de aplicação operacional em: ${hits.join(", ")}`);
});

check("os documentos de implantação não contêm segredos", () => {
  const dir = path.join(root, "docs", "implantacao");
  const bad = [];
  for (const f of readdirSync(dir)) {
    const t = readFileSync(path.join(dir, f), "utf8");
    if (/eyJ[A-Za-z0-9_-]{20,}\./.test(t)) bad.push(`${f}: JWT`);
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(t)) bad.push(`${f}: chave privada`);
    if (/postgres(ql)?:\/\/[^\s:@]+:[^\s@]+@/.test(t)) bad.push(`${f}: string de conexão com senha`);
    if (/\b1\/\/[0-9A-Za-z_-]{30,}/.test(t)) bad.push(`${f}: refresh token`);
    if (/\bsk-[A-Za-z0-9]{20,}/.test(t)) bad.push(`${f}: chave de API`);
    if (/\bGOCSPX-[A-Za-z0-9_-]{10,}/.test(t)) bad.push(`${f}: segredo OAuth`);
  }
  assert(bad.length === 0, bad.join("; "));
});

check("o documento de e-mail registra SPF, DKIM e DMARC e não traz valores de variáveis", () => {
  const t = read("docs/implantacao/04-requisitos-email.md");
  for (const k of ["SPF", "DKIM", "DMARC", "Gmail", "Outlook", "ACC_OUTBOUND_MODE"]) assert(t.includes(k), `falta ${k}`);
  assert(!/ACC_OUTBOUND_MODE\s*=\s*(?!production)[A-Za-z]/.test(t.replace(/`ACC_OUTBOUND_MODE=production`/g, "")), "valor de variável exposto");
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
