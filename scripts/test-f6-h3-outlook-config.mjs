// Fase 6/H3 — a configuração do Outlook/Graph é SOMENTE LEITURA, mínima e não executável por engano. Sem rede, sem segredos.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); }
}

check("manifesto do Entra: só Mail.Read de APLICATIVO (Role), sem Mail.ReadWrite/Send, sem redirect, sem segredo", () => {
  const m = JSON.parse(read("scripts/outlook/entra-app-manifest.json"));
  const access = m.requiredResourceAccess.flatMap((r) => r.resourceAccess);
  assert.equal(access.length, 1);
  assert.deepEqual([access[0].id, access[0].type], ["810c84a8-4a9e-49e6-bf7d-12d183f40d01", "Role"]);
  assert.equal(m.signInAudience, "AzureADMyOrg");
  assert.deepEqual(m.web.redirectUris, []);
  const structured = JSON.stringify({ r: m.requiredResourceAccess, p: m.passwordCredentials, k: m.keyCredentials });
  assert.ok(!/ReadWrite|Mail\.Send|secretText|"value"/.test(structured));
});

check("política de acesso: RestrictAccess, simulação por padrão e recusa sem confirmação explícita (não executável por engano)", () => {
  const ps = read("scripts/outlook/exchange-application-access-policy.ps1");
  assert.ok(ps.includes("-AccessRight RestrictAccess") && !ps.includes("-AccessRight FullAccess"));
  assert.ok(ps.includes("ACC_OUTLOOK_POLICY_CONFIRMED") && ps.includes("[switch]$Apply") && ps.includes("SIMULACAO"));
  assert.ok(/if \(-not \$Apply\)[\s\S]*return/.test(ps), "sem -Apply só imprime");
  assert.ok(ps.includes("Test-ApplicationAccessPolicy") && ps.includes("ROLLBACK"));
});

check("documentos: achado do MX (Google), opções A/B/C, não comprovado, checklist de consentimento e variáveis ACC_GRAPH_*", () => {
  const a = read("docs/outlook-achado-crm-axion-mx-google.md");
  for (const t of ["aspmx.l.google.com", "mail: null", "Opções", "**A", "**B", "**C", "NÃO está comprovado", "Exchange Online"]) assert.ok(a.includes(t), `achado sem "${t}"`);
  const c = read("docs/outlook-configuracao-graph.md");
  for (const t of ["ACC_GRAPH_TENANT_ID", "ACC_GRAPH_CLIENT_SECRET", "ACC_GRAPH_MAILBOXES", "Application Access Policy".split(" ")[0], "Mail.Read", "Checklist de consentimento", "Denied", "RestrictAccess", "NÃO está comprovado"]) assert.ok(c.includes(t), `config sem "${t}"`);
  assert.ok(existsSync(path.join(root, "docs/relatorio-cobertura-gmail.md")));
});

check("nenhum segredo/valor literal nos arquivos desta frente (heurística: tokens, chaves, refresh)", () => {
  const files = ["scripts/outlook/entra-app-manifest.json", "scripts/outlook/exchange-application-access-policy.ps1", "docs/outlook-configuracao-graph.md", "docs/outlook-achado-crm-axion-mx-google.md", "docs/relatorio-cobertura-gmail.md", "scripts/lib/mail-universal/graph-config.mjs"];
  for (const f of files) assert.ok(!/(1\/\/[0-9A-Za-z_-]{20,}|ya29\.[0-9A-Za-z_-]{20,}|eyJ[0-9A-Za-z_-]{20,}\.|sk-[A-Za-z0-9]{20,}|[A-Za-z0-9~._-]{3}8Q~[A-Za-z0-9~._-]{20,})/.test(read(f)), `${f}: parece conter segredo`);
});

check("o transporte do Graph não contém método de escrita nem pede contentBytes; só GET e o POST do token", () => {
  const src = read("scripts/lib/mail-universal/graph-transport.mjs");
  assert.ok(!/method:\s*"(PATCH|PUT|DELETE)"/.test(src));
  assert.ok(!/sendMail|\/move|\/copy|\/forward|\/reply|contentBytes/i.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")));
  assert.ok((src.match(/method: "(GET|POST)"/g) ?? []).length === 2);
});

check("scripts/outlook contém só os arquivos esperados", () => {
  assert.deepEqual(readdirSync(path.join(root, "scripts/outlook")).sort(), ["entra-app-manifest.json", "exchange-application-access-policy.ps1"]);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
