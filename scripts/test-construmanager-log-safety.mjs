// Garante que o worker do Construmanager nao imprime nomes de arquivo,
// pasta ou id do fornecedor em logs publicos do GitHub Actions.
import assert from "node:assert/strict";
import fs from "node:fs";
import { opaqueRef, redactNames } from "./lib/construmanager-log-safety.mjs";

const ref = opaqueRef("0b5c7e0e-1111-2222-3333-444455556666");
assert.match(ref, /^ref-[0-9a-f]{10}$/);
assert.equal(ref, opaqueRef("0b5c7e0e-1111-2222-3333-444455556666"), "deterministico");
assert.notEqual(ref, opaqueRef("outro"));

assert.equal(
  redactNames("Falha ao abrir PROJETO-EXEC-REV3.pdf no pacote", "PROJETO-EXEC-REV3.pdf"),
  "Falha ao abrir [nome omitido] no pacote"
);
assert.equal(redactNames("entrada PROJETO-EXEC-REV3 ausente", "PROJETO-EXEC-REV3.pdf"), "entrada [nome omitido] ausente");
assert.equal(redactNames("sem nome", ""), "sem nome");
assert.equal(redactNames(null, "x.pdf"), "");

const worker = fs.readFileSync(new URL("./construmanager-content-worker.mjs", import.meta.url), "utf8");
const logCalls = worker.match(/log\(\s*`[\s\S]*?`\s*\)|log\(\s*\n\s*`[\s\S]*?`\s*(\+\s*`[\s\S]*?`\s*)*\)/g) ?? [];
assert.ok(logCalls.length > 10, "deveria encontrar chamadas de log");
for (const call of logCalls) {
  assert.ok(!/\$\{[^}]*source_name\s*\}/.test(call), `log expoe source_name: ${call.slice(0, 80)}`);
  assert.ok(!/construmanager_object_id/.test(call), `log expoe id do fornecedor: ${call.slice(0, 80)}`);
  assert.ok(!/\$\{[^}]*\.name\s*\}/.test(call), `log expoe .name: ${call.slice(0, 80)}`);
}
console.log(`OK construmanager log safety (${logCalls.length} chamadas de log verificadas)`);
