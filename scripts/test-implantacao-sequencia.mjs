// Consistencia da sequencia de implantacao ensaiada (scripts/data/implantacao-sequencia.json) com o diretorio de migrations,
// o inventario e as restricoes P0. So le arquivos; sem rede, sem banco.
// Uso: node scripts/test-implantacao-sequencia.mjs
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
const local = readdirSync(path.join(root, "supabase", "migrations")).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
const inv = read("docs/implantacao/01-inventario-migrations.md");
const registered = new Set([...inv.matchAll(/^\| (\d{14}_[a-z0-9_]+) \| aplicada-registrada \|/gm)].map((m) => m[1]));
const ordered = seq.ondas.flatMap((o) => o.migrations);
const deferred = seq.adiadas.map((a) => a.migration);
const HOTFIX = "20261121090000_hotfix_risk_alert_action_authorization";

check("toda migration pendente aparece exatamente uma vez na sequência (onda, adiada ou já efetiva)", () => {
  const all = [...ordered, ...deferred, ...seq.jaEfetivaNaoReaplicar];
  assert(new Set(all).size === all.length, "migration repetida na sequência");
  // Fase 5: migrations >= 20261201 (frentes A-E) sao descobertas pelo ensaio (onda F5) e adicionadas ao JSON na integracao.
  const pending = local.filter((s) => !registered.has(s));
  const missing = pending.filter((s) => !all.includes(s) && s.slice(0, 14) < "20261201000000");
  const extra = all.filter((s) => !pending.includes(s));
  assert(missing.length === 0, `faltam na sequência: ${missing.join(", ")}`);
  assert(extra.length === 0, `na sequência sem ser pendente/inexistente: ${extra.join(", ")}`);
});

check("o hotfix 20261121090000 NÃO está na sequência executável (não reaplicar) e está declarado como já efetivo", () => {
  assert(!ordered.includes(HOTFIX) && !deferred.includes(HOTFIX), "hotfix na sequência de aplicação");
  assert(seq.jaEfetivaNaoReaplicar.length === 1 && seq.jaEfetivaNaoReaplicar[0] === HOTFIX);
});

check("20261121177000 (SLA, decisão) e 20261123302000 (app) estão adiadas, fora das ondas principais", () => {
  assert(deferred.includes("20261121177000_sla_medio_baixo_prazos_aprovados"));
  assert(deferred.includes("20261123302000_quality_revoke_direct_writes"));
  assert(!ordered.some((s) => deferred.includes(s)));
});

check("dentro das ondas a ordem é a numérica (as 3 fora de ordem vêm primeiro, por serem as de menor versão)", () => {
  const versions = ordered.map((s) => s.slice(0, 14));
  assert(JSON.stringify(versions) === JSON.stringify([...versions].sort()), "ordem não é numérica");
  const first3 = versions.slice(0, 3);
  assert(JSON.stringify(first3) === JSON.stringify(["20261107090000", "20261116090000", "20261118140000"]), `primeiras: ${first3}`);
});

check("dependências declaradas das adiadas são aplicadas antes na sequência (ou são pré-requisito presente)", () => {
  for (const d of seq.adiadas) for (const dep of d.depende) assert(ordered.includes(dep) || registered.has(dep), `${d.migration} depende de ${dep}`);
});

check("o portão P0 é a última migration da sequência principal (só as ondas J, K e L, sem tocar record_risk_alert_action, vem depois) e existe com rollback", () => {
  // Cauda após o portão: ondas J (Fase 4/D), K (Fase 5) e L (Fase 6), todas sem tocar record_risk_alert_action.
  const afterJ = seq.ondas.filter((o) => o.id === "J" || o.id === "K" || o.id === "L").flatMap((o) => o.migrations);
  const main = ordered.filter((s) => !afterJ.includes(s));
  const last = main[main.length - 1];
  assert(last === "20261126100000_p0_gate_record_risk_alert_action", `última: ${last}`);
  assert(ordered.slice(main.length).join() === afterJ.join(), "as ondas J, K e L devem ser a cauda da sequência");
  for (const j of afterJ) assert(!/record_risk_alert_action/.test(read(`supabase/migrations/${j}.sql`).replace(/^s*--.*$/gm, "")), `${j} toca record_risk_alert_action`);
  assert(existsSync(path.join(root, "supabase", "rollbacks", `${last}.rollback.sql`)), "rollback ausente");
});

check("o portão P0 não redefine função, não altera dados nem SLAs e confere o md5 do corpo protegido", () => {
  const sql = read("supabase/migrations/20261126100000_p0_gate_record_risk_alert_action.sql").replace(/^\s*--.*$/gm, "");
  assert(!/create\s+(or\s+replace\s+)?function/i.test(sql), "redefine função");
  assert(!/\b(insert\s+into|update\s+public|delete\s+from|truncate|drop\s)/i.test(sql), "altera dados/objetos");
  assert(sql.includes("930f6d75898793479b418950b0053bd9") && /replace\(p\.prosrc, chr\(13\)/.test(sql), "sem conferência do md5 sem CR");
  assert(/revoke all on function public\.record_risk_alert_action\(uuid, text, jsonb\) from public, anon/.test(sql));
});

check("a verificação P0 (SQL de leitura) não escreve e usa o mesmo md5 do hotfix", () => {
  const sql = read("scripts/sql/p0-verificar-record-risk-alert-action.sql").replace(/^\s*--.*$/gm, "");
  assert(/^\s*select/i.test(sql.trim()), "deve ser um SELECT");
  assert(!/\b(insert|update|delete|alter|create|drop|grant|revoke)\b/i.test(sql), "contém escrita");
  assert(sql.includes("930f6d75898793479b418950b0053bd9"));
});

check("o ensaio é local-only: recusa host diferente de 127.0.0.1:55434 e não contém comando de aplicação operacional", () => {
  const src = read("scripts/ensaio-implantacao-ondas-realpg.mjs");
  assert(/127\.0\.0\.1/.test(src) && /55434/.test(src) && /RECUSADO/.test(src));
  assert(!/supabase\.co|plbcvwostmdmdmrziwmd|apply_migration|db push/i.test(src), "referência operacional no ensaio");
});

check("o ensaio é parametrizável: lê o diretório (ACC_ENSAIO_MIGRATIONS_DIR) e inclui migrations novas na onda F5, com idempotência e P0", () => {
  const src = read("scripts/ensaio-implantacao-ondas-realpg.mjs");
  assert(/ACC_ENSAIO_MIGRATIONS_DIR/.test(src) && /id: "F5"/.test(src) && /tailStems/.test(src));
  assert(/idempotente\(s\)/.test(src), "sem teste de idempotência da onda F5");
});

check("os documentos 07 e 08 existem e o 07 cita todas as ondas, a regra de não reaplicar o hotfix e o status de nada aplicado", () => {
  const d7 = read("docs/implantacao/07-sequencia-ensaiada.md");
  assert(/nada foi aplicado/i.test(d7) && /NÃO é reaplicada/.test(d7));
  for (const o of seq.ondas) assert(d7.includes(`| ${o.id}`) || d7.includes(`| ${o.id} `), `onda ${o.id} ausente no 07`);
  assert(existsSync(path.join(root, "docs", "implantacao", "08-relatorio-ensaio-ondas.md")));
  assert(/0 falha\(s\)/.test(read("docs/implantacao/08-relatorio-ensaio-ondas.md")), "relatório do ensaio com falhas");
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
