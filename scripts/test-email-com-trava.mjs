// Respostas/alertas por e-mail COM a trava de modulos aplicada (PGlite descartavel, sem rede, sem e-mail real).
// Roda cada suite SQL de e-mail duas vezes: sem trava (linha de base) e com ACC_TEST_COM_TRAVA=1. Prova: a trava nao
// altera nenhum resultado do tratamento de alertas por e-mail (SLA, resumo semanal, alerta de contrato, SSMA, especialista, risco/hotfix P0).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SUITES = [
  "test-email-replies-n3-sql.mjs",
  "test-ssma-email-replies-sql.mjs",
  "test-email-specialist-sql.mjs",
  "test-risk-alert-action-guard-sql.mjs",
  "test-hotfix-risk-alert-authorization-sql.mjs",
];
function rodar(suite, comTrava) {
  const env = { ...process.env, ACC_TEST_COM_TRAVA: comTrava ? "1" : "0" };
  const r = spawnSync(process.execPath, ["--import", "./lib/block-live-ai.mjs", path.join(here, suite)], { cwd: here, env, encoding: "utf8", timeout: 20 * 60 * 1000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  const ok = (out.match(/^OK /gm) ?? []).length;
  const fail = (out.match(/^FAIL /gm) ?? []).length;
  return { status: r.status, ok, fail, aplicada: /\[COM TRAVA\] trava de modulos aplicada: (\d+)/.exec(out)?.[1] ?? null, out };
}
let falhas = 0;
for (const s of SUITES) {
  const base = rodar(s, false);
  const trava = rodar(s, true);
  const igual = base.status === 0 && trava.status === 0 && base.ok === trava.ok && base.fail === 0 && trava.fail === 0 && trava.aplicada && Number(trava.aplicada) >= 5;
  console.log(`${igual ? "OK  " : "FAIL"} ${s}: sem trava ${base.ok} OK/${base.fail} FAIL (exit ${base.status}); com trava ${trava.ok} OK/${trava.fail} FAIL (exit ${trava.status}); trava conferida em ${trava.aplicada ?? "NAO APLICADA"} RPCs de amostra (+3 liberadas)`);
  if (!igual) { falhas += 1; console.log((trava.out.split("\n").filter((l) => /^FAIL|Error|erro/i.test(l)).slice(0, 8)).join("\n")); }
}
console.log(`\n${SUITES.length - falhas}/${SUITES.length} suites equivalentes com e sem a trava`);
process.exit(falhas ? 1 : 0);
