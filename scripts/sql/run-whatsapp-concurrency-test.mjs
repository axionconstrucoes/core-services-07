// Concorrência real no PostgreSQL descartável: N sessões inserindo em paralelo o MESMO registro do WhatsApp simulado
// (a instrução que o servidor usa: INSERT ... ON CONFLICT (idempotency_key) DO NOTHING RETURNING) => exatamente uma insere.
// Precisa de dados COMMITADOS (sessões independentes), então cria um projeto de teste próprio e o remove no `finally`,
// mesmo em caso de falha. Só toca nas linhas deste teste (projeto de id fixo e cascata); nada mais é apagado.
//
// Uso:
//   ACC_WA_CONC_TEST_DB_CONTAINER="supabase_db_acc-disposable-test-e2" \
//   ACC_WA_CONC_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true \
//   node scripts/sql/run-whatsapp-concurrency-test.mjs
import { spawn, spawnSync } from "node:child_process";
import { requireDisposableContainer } from "./lib/disposable-target.mjs";

const container = requireDisposableContainer("ACC_WA_CONC_TEST_DB_CONTAINER");
if (process.env.ACC_WA_CONC_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error('ACC_WA_CONC_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE precisa ser exatamente "true".');
  process.exit(2);
}

const PROJECT = "88888888-8888-4888-8888-888888899902";
const PARALLEL = 12;
const psqlArgs = ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"];

function psqlSync(sql) {
  const r = spawnSync("docker", psqlArgs, { input: sql, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`psql falhou: ${r.stderr}`);
  return r.stdout.trim();
}
function psqlAsync(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", psqlArgs);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err))));
    child.stdin.end(sql);
  });
}

let failed = false;
function check(name, ok, detail = "") {
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${ok ? "" : ` ${detail}`}`);
  if (!ok) failed = true;
}

const insertSql = (key, status = "SIMULATED") =>
  `insert into public.whatsapp_simulated_messages (project_id, source_type, source_id, escalation_level, risk_level, status, idempotency_key)
   values ('${PROJECT}', 'SLA_ACTION', 'conc-1', 'DIRETORIA', 'CRITICAL', '${status}', '${key}')
   on conflict (idempotency_key) do nothing returning id;`;

try {
  psqlSync(`delete from public.projects where id = '${PROJECT}';`); // resíduo de execução anterior interrompida (somente este projeto)
  psqlSync(
    `insert into public.projects (id, code, name, client, location, start_date, baseline_end_date)
     values ('${PROJECT}', 'TST-WA-CONC', 'Projeto descartável (concorrência WhatsApp)', 'Cliente teste', 'Local', '2026-01-01', '2026-12-31');`
  );

  const key = "wa:SLA_ACTION:conc-1:ESCALATION:DIRETORIA:user-x";
  const results = await Promise.all(Array.from({ length: PARALLEL }, () => psqlAsync(insertSql(key))));
  const inserted = results.filter((r) => r.length > 0).length;
  check(`${PARALLEL} sessões simultâneas, mesma chave: exatamente 1 insere`, inserted === 1, `(inseriram ${inserted})`);
  check("uma única linha persistida", psqlSync(`select count(*) from public.whatsapp_simulated_messages where project_id='${PROJECT}' and idempotency_key='${key}';`) === "1");

  const other = await Promise.all(
    ["a", "b", "c"].map((k) => Promise.all(Array.from({ length: 4 }, () => psqlAsync(insertSql(`wa:conc:${k}`, "SKIPPED")))))
  );
  check("chaves distintas continuam independentes (3 chaves x 4 sessões => 3 linhas)", other.flat().filter((r) => r.length > 0).length === 3);
} catch (error) {
  failed = true;
  console.log(`FAIL execução: ${error.message}`);
} finally {
  try {
    psqlSync(`delete from public.projects where id = '${PROJECT}';`);
    const left = psqlSync(
      `select (select count(*) from public.projects where id='${PROJECT}') || ',' || (select count(*) from public.whatsapp_simulated_messages where project_id='${PROJECT}');`
    );
    check("limpeza: nenhum resíduo do teste (projeto, mensagens)", left === "0,0", `(${left})`);
  } catch (error) {
    failed = true;
    console.log(`FAIL limpeza: ${error.message}`);
  }
}

console.log(`\nRESULTADO: ${failed ? "FALHOU" : "sem falhas"}`);
process.exit(failed ? 1 : 0);
