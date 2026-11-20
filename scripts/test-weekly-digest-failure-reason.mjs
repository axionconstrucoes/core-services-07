// Resumo semanal: o motivo da falha grava o diagnóstico seguro do Gmail (puro, sem rede/banco/e-mail).
// Uso: node scripts/test-weekly-digest-failure-reason.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

globalThis.fetch = async () => { throw new Error("NETWORK_BLOCKED"); };
register("./ts-module-resolver.mjs", import.meta.url);
const { buildWeeklyDigestFailureReason, WEEKLY_DIGEST_FAILURE_BASE } = await import("../apps/web/lib/email/weekly-digest-failure-reason");
const { formatGmailSendDiagnostic } = await import("../apps/web/lib/email/gmail-send-error");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };

const diag = formatGmailSendDiagnostic({ stage: "AUTH_REFRESH", httpStatus: 400, apiCode: "invalid_grant", reason: "AUTH_INVALID_GRANT", classification: "DEFINITIVE", correlationId: null });

check("erro do Gmail com diagnóstico: o motivo inclui o trecho normalizado", () => {
  const r = buildWeeklyDigestFailureReason(new Error(`GmailEmailProvider: falha ao enviar via Gmail API. ${diag}`));
  ok(r === `${WEEKLY_DIGEST_FAILURE_BASE} ${diag}`, r);
  ok(r.includes("motivo=AUTH_INVALID_GRANT"), r);
});
check("erro sem diagnóstico (ex.: bloqueio antes da rede): motivo genérico, sem texto livre", () => {
  const r = buildWeeklyDigestFailureReason(new Error("GmailEmailProvider: identidade do remetente do piloto não configurada — envio bloqueado antes de qualquer chamada de rede."));
  ok(r === WEEKLY_DIGEST_FAILURE_BASE, r);
});
check("valores não-Error e texto com segredo/e-mail nunca vazam", () => {
  ok(buildWeeklyDigestFailureReason(undefined) === WEEKLY_DIGEST_FAILURE_BASE, "undefined");
  ok(buildWeeklyDigestFailureReason(null) === WEEKLY_DIGEST_FAILURE_BASE, "null");
  const r = buildWeeklyDigestFailureReason(new Error("token=ya29.SECRET para fulano@exemplo.com"));
  ok(r === WEEKLY_DIGEST_FAILURE_BASE && !/ya29|@/.test(r), r);
});
check("o envio do resumo usa o helper no catch e preserva o guard de RESPONDED", () => {
  const src = readFileSync(path.join(root, "apps/web/lib/email/send-weekly-alert-digest-email.ts"), "utf8");
  ok(/failure_reason: buildWeeklyDigestFailureReason\(error\)/.test(src), "catch não usa o helper");
  ok(!/failure_reason: "Falha no envio do resumo semanal\."/.test(src), "texto fixo remanescente");
  ok(/\.neq\("status", "RESPONDED"\)/.test(src), "guard RESPONDED removido");
});

console.log(`\n${passed} OK, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
