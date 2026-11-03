// Guarda dos runners de PostgreSQL real (scripts/sql/lib/disposable-target.mjs): só container "supabase_db_acc-disposable-*"
// e API local fora da faixa de desenvolvimento. Não usa Docker nem rede: cada caso roda num processo filho.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), "sql", "lib", "disposable-target.mjs");
const libUrl = pathToFileURL(lib).href;
let passed = 0;
let failed = 0;
function run(fn, value, extra = "") {
  const code = `import { ${fn} } from ${JSON.stringify(libUrl)}; console.log(${fn}("T_VAR"${extra}));`;
  return spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...process.env, T_VAR: value }, encoding: "utf8" });
}
function check(name, ok) {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}`);
  ok ? (passed += 1) : (failed += 1);
}

for (const v of ["supabase_db_acc-disposable-test-e2", "supabase_db_acc-disposable-clean"]) {
  const r = run("requireDisposableContainer", v);
  check(`container aceito: ${v}`, r.status === 0 && r.stdout.trim() === v);
}
for (const v of ["supabase_db_axion-contract-intelligence", "supabase_db_acc-disposable-", "acc-disposable-x", "supabase_db_acc-disposable-a;rm", "", "postgres"]) {
  check(`container recusado: ${JSON.stringify(v)}`, run("requireDisposableContainer", v).status === 1);
}
check("nome legado aceito só quando declarado", run("requireDisposableContainer", "supabase_db_acc-gerente-compat-test").status === 1 &&
  run("requireDisposableContainer", "supabase_db_acc-gerente-compat-test", ', { legacyNames: ["supabase_db_acc-gerente-compat-test"] }').status === 0);
for (const v of ["http://127.0.0.1:57321", "http://localhost:55513"]) check(`API local aceita: ${v}`, run("requireLocalApiUrl", v).status === 0);
for (const v of ["http://127.0.0.1:54321", "https://abc.supabase.co", "http://127.0.0.1", "http://user:pw@127.0.0.1:57321", "http://127.0.0.1:57321/rest/v1", "http://192.168.0.5:57321", "http://127.0.0.1:80", ""]) {
  check(`API recusada: ${JSON.stringify(v)}`, run("requireLocalApiUrl", v).status === 1);
}
console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
