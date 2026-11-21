// Fase 5/A — evidência por LEITURA DE CÓDIGO/CONFIG/CI do que o Gmail está configurado para ler (nenhuma chamada real) e prova de que
// o Outlook/Graph NÃO tem integração real no repositório. Os caminhos de LEITURA usam só gmail.readonly; o envio usa credencial
// separada (gmail.send). Uso: node scripts/test-f5-a-gmail-escopos.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e.message.split("\n")[0]}`); }
}
const READONLY = "https://www.googleapis.com/auth/gmail.readonly";
const WRITE_SCOPES = /gmail\.(modify|compose|insert|settings\.[a-z]+)|mail\.google\.com\/(?!.*readonly)/;
const WRITE_CALLS = /messages\.(send|modify|trash|untrash|delete|batchModify|batchDelete|insert|import)\(|users\.drafts\.|threads\.(modify|trash|delete)\(/;

const READ_PATH = [
  "scripts/gmail-inbound-sync.mjs", "scripts/gmail-inbound-ingest.mjs", "scripts/gmail-owner-mailbox-sync.mjs", "scripts/gmail-attachment-ingest.mjs",
  "scripts/gmail-ata-ingestion-worker.mjs", "scripts/gmail-recover-existing.mjs", "scripts/lib/gmail-delegated-auth.mjs", "scripts/lib/gmail-delegation-config.mjs",
  "scripts/lib/gmail-mailbox-gate.mjs", "scripts/lib/gmail-owner-mailbox.mjs", "scripts/gmail-inbound-oauth.mjs", "scripts/lib/mail-universal/gmail-reader.mjs",
  "apps/web/lib/risk-alerts/replies/inbound-credentials.ts", "apps/web/lib/email/inbound/gmail-inbound-auth.ts",
].filter((f) => existsSync(path.join(root, f)));

check("a lista de arquivos de leitura existe (nada foi renomeado em silêncio)", () => {
  assert.ok(READ_PATH.length >= 10, `só ${READ_PATH.length} arquivos de leitura encontrados`);
});

check("nenhum caminho de LEITURA do Gmail chama método de escrita (enviar/modificar/apagar/rascunho)", () => {
  for (const f of READ_PATH) assert.ok(!WRITE_CALLS.test(read(f)), `${f}: chamada de escrita no caminho de leitura`);
});

check("nenhum caminho de LEITURA pede escopo além de gmail.readonly", () => {
  for (const f of READ_PATH) assert.ok(!WRITE_SCOPES.test(read(f)), `${f}: escopo de escrita no caminho de leitura`);
});

check("escopo declarado da delegação de domínio, do OAuth de leitura, da porta por caixa e do leitor universal é EXATAMENTE gmail.readonly", () => {
  assert.ok(read("scripts/lib/gmail-delegation-config.mjs").includes(`GMAIL_READER_DWD_SCOPE = "${READONLY}"`));
  assert.ok(read("scripts/lib/gmail-mailbox-gate.mjs").includes(`GMAIL_READONLY_SCOPE = "${READONLY}"`));
  assert.ok(read("scripts/lib/mail-universal/gmail-reader.mjs").includes(`GMAIL_REQUIRED_SCOPE = "${READONLY}"`));
  assert.ok(read("apps/web/lib/risk-alerts/replies/inbound-credentials.ts").includes(`RISK_ALERTS_INBOUND_GMAIL_SCOPE = "${READONLY}"`));
  assert.ok(read("scripts/gmail-inbound-oauth.mjs").includes(READONLY));
});

check("o fluxo de delegação usa o escopo de leitura na asserção JWT (não há escopo configurável por variável de ambiente)", () => {
  const auth = read("scripts/lib/gmail-delegated-auth.mjs");
  assert.ok(auth.includes("scope: GMAIL_READONLY_SCOPE") && auth.includes("scopes: [GMAIL_READONLY_SCOPE]"), "asserção JWT e chave de serviço usam o escopo de leitura");
  assert.ok(!/process\.env\.[A-Z_]*SCOPE/.test(auth), "escopo não pode vir de variável de ambiente");
});

check("o ENVIO usa credencial e escopo SEPARADOS (gmail.send) e fica fora do leitor", () => {
  assert.ok(read("scripts/gmail-outbound-oauth.mjs").includes("gmail.send"));
  assert.ok(read("apps/web/lib/email/gmail-email-provider.ts").includes("messages.send("));
  assert.ok(!read("scripts/lib/mail-universal/gmail-reader.mjs").includes("gmail.send"));
});

check("workflows de leitura Gmail: nenhum pede escopo de escrita; delegação só em workflow MANUAL (sem schedule) e a coleta incremental usa a credencial de leitura", () => {
  const dir = path.join(root, ".github", "workflows");
  const workflows = readdirSync(dir).filter((f) => /^gmail-.*\.yml$/.test(f));
  assert.ok(workflows.length >= 3, "workflows gmail-*.yml esperados");
  for (const f of workflows) {
    const text = readFileSync(path.join(dir, f), "utf8");
    assert.ok(!WRITE_SCOPES.test(text), `${f}: escopo de escrita`);
    assert.ok(!/gmail\.send/.test(text), `${f}: gmail.send em workflow de leitura`);
  }
  const delegated = readFileSync(path.join(dir, "gmail-delegated-sync.yml"), "utf8");
  assert.ok(!/^\s*schedule:/m.test(delegated), "a delegação não pode rodar agendada sem decisão do dono");
  assert.ok(delegated.includes("gmail.readonly"));
});

check("estado declarado da delegação: PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN (não alegamos leitura de caixas não conectadas)", () => {
  assert.ok(read("scripts/lib/gmail-delegation-config.mjs").includes('GOOGLE_DELEGATION_STATUS = "PENDENTE_AUTORIZACAO_NO_GOOGLE_ADMIN"'));
});

// ---------- Outlook / Microsoft Graph ----------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(mjs|ts|tsx|js|yml|yaml)$/.test(entry.name)) out.push(full);
  }
  return out;
}
check("Outlook/Graph: NÃO existe cliente, credencial, workflow nem dependência real do Microsoft Graph no repositório (só o leitor com transporte falso)", () => {
  const offenders = [];
  for (const dirName of ["scripts", "apps/web/lib", "apps/web/app", ".github"]) {
    for (const file of walk(path.join(root, dirName))) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      if (rel.startsWith("scripts/lib/mail-universal/") || rel.startsWith("scripts/test-f5-a-")) continue;
      if (/graph\.microsoft\.com|login\.microsoftonline\.com|@azure\/msal|@microsoft\/microsoft-graph-client|AZURE_CLIENT_SECRET|MS_GRAPH_/.test(readFileSync(file, "utf8"))) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, [], `uso real do Graph inesperado: ${offenders.join(", ")}`);
  const pkg = read("package.json") + read("apps/web/package.json");
  assert.ok(!/msal|microsoft-graph|@azure\//.test(pkg), "dependência Microsoft no package.json");
});

check("Outlook/Graph: o leitor declara a permissão mínima (Mail.Read de aplicativo) e o documento de bloqueio existe", () => {
  assert.ok(read("scripts/lib/mail-universal/graph-reader.mjs").includes('GRAPH_REQUIRED_PERMISSION = "Mail.Read"'));
  const doc = read("docs/monitoramento-email-universal.md");
  for (const term of ["BLOQUEIO", "Mail.Read", "consentimento", "App registration", "NÃO está comprovado"]) assert.ok(doc.includes(term), `doc sem "${term}"`);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
