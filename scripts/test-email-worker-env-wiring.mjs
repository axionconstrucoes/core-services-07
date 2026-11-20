// Fiação das chaves de resposta por e-mail no WORKER (GitHub Actions): a fase `replies` (token por item, risco e SSMA) lê as chaves
// ACC_EMAIL_* do ambiente do processo do worker. Se o workflow não as repassa, a configuração do servidor (Vercel) e a do worker divergem
// (ex.: o atalho ESPECIALISTA aparece no e-mail, mas o worker o recusa). Verificação estática, sem rede e sem data fixa.
// Uso: node scripts/test-email-worker-env-wiring.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
const workflow = read(".github/workflows/weekly-schedule-email-ingestion.yml");
const workflowLines = workflow.split(/\r?\n/).map((line) => line.trim());
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0]}`);
  }
};

// Chaves ACC_EMAIL_* lidas por módulos de email-replies/ (compartilhados com o worker) — todas precisam ser repassadas ao worker.
const dir = "apps/web/lib/email-replies";
const sharedKeys = new Set();
for (const file of readdirSync(path.join(root, dir)).filter((f) => f.endsWith(".ts"))) {
  for (const m of read(`${dir}/${file}`).matchAll(/"(ACC_EMAIL_[A-Z_]+)"/g)) sharedKeys.add(m[1]);
}

check("o código compartilhado expõe as 5 chaves esperadas (sem chave nova esquecida)", () => {
  const expected = ["ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR", "ACC_EMAIL_SPECIALIST_ENABLED", "ACC_EMAIL_TOKEN_OWNER_STRICT", "ACC_EMAIL_TRUSTED_AUTHSERV_IDS", "ACC_EMAIL_WORKSPACE_TENANT_DOMAINS"];
  assert.deepEqual([...sharedKeys].sort(), expected, `chaves em email-replies/: ${[...sharedKeys].sort().join(", ")}`);
});

check("o workflow do worker repassa cada chave ACC_EMAIL_* de resposta como variável (vars.*), nunca como segredo", () => {
  for (const key of sharedKeys) {
    const expectedLine = key + ": ${{ vars." + key + " }}";
    assert.ok(workflowLines.includes(expectedLine), `${key} não repassada ao worker`);
  }
});

check("as fases do worker leem as chaves do env do processo (env = process.env)", () => {
  for (const f of ["scripts/lib/token-replies-phase.mjs", "scripts/lib/ssma-replies-phase.mjs"]) {
    const src = read(f);
    assert.ok(/env = process\.env/.test(src), `${f}: env padrão`);
    assert.ok(/isSpecialistEmailEnabled\(env\)/.test(src) && /resolveSenderRateLimit\(env\)/.test(src) && /resolveTrustedAuthservIds\(env\)/.test(src), `${f}: leitura via env`);
  }
});

check("nenhuma chave de resposta vai como segredo e nenhum valor fixo é gravado no workflow", () => {
  assert.ok(!/secrets\.ACC_EMAIL_/.test(workflow), "chave ACC_EMAIL_* como segredo");
  for (const line of workflowLines) {
    if (/^ACC_EMAIL_[A-Z_]+:/.test(line)) assert.ok(/: \$\{\{ vars\.ACC_EMAIL_[A-Z_]+ \}\}$/.test(line), `valor fixo: ${line}`);
  }
});

console.log(failed ? `\n${failed} FALHA(S)` : "\nTUDO OK");
process.exit(failed ? 1 : 0);
