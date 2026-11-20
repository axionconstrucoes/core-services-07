// Integração N3 × rota de risco: a fila email_reply_confirmations é entregue pela rota /api/cron/risk-alerts, em FALHA
// FECHADA (chave exata), nunca em dry-run nem em execução restrita a uma obra, sem derrubar o ciclo. Verificação estática.
// Uso: node scripts/test-email-reply-confirmations-wiring.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const route = readFileSync(path.join(root, "apps/web/app/api/cron/risk-alerts/route.ts"), "utf8");
let failed = 0;
const check = (name, fn) => {
  try { fn(); console.log("OK  ", name); } catch (e) { failed += 1; console.log("FAIL", name, "->", String(e.message).split("\n")[0]); }
};
check("rota chama deliverEmailReplyConfirmations com o provedor configurado", () => {
  assert.match(route, /deliverEmailReplyConfirmations\(\{ client: createSupabaseAdminClient\(\), provider: getEmailProvider\(\) \}\)/);
});
check("falha fechada: chave exata, sem dry-run e sem execução restrita a uma obra", () => {
  assert.match(route, /if \(input\.dryRun \|\| input\.scoped \|\| process\.env\[EMAIL_REPLY_CONFIRMATIONS_ENABLED_ENV\] !== "true"\) return null;/);
  assert.match(route, /const EMAIL_REPLY_CONFIRMATIONS_ENABLED_ENV = "ACC_EMAIL_REPLY_CONFIRMATIONS_ENABLED";/);
  assert.match(route, /deliverReplyConfirmationsIfEnabled\(\{ dryRun, scoped: Boolean\(projectId\) \}\)/);
});
check("erro na entrega não derruba o ciclo nem vaza detalhes", () => {
  assert.match(route, /catch \{\s*return \{ error: "Falha ao entregar confirmações de resposta por e-mail\." \};/);
});
check("entrega acontece DEPOIS do ciclo de risco", () => {
  assert.ok(route.indexOf("await runRiskAlertCycle(") < route.indexOf("await deliverReplyConfirmationsIfEnabled("));
});
console.log(failed ? `\n${failed} FALHA(S)` : "\nTUDO OK");
process.exit(failed ? 1 : 0);
