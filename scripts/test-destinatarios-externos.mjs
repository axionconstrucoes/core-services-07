// Fase 4 / D — destinatário externo de e-mail, parte PURA (sem banco, rede ou IA): validação/normalização, classificação de domínio,
// decisão com confirmação, anti-injeção de cabeçalho, limites, paridade de regras com a migration 20261127100000 e ligação nos pontos
// de destinatário (server actions). A prova em Postgres real está em scripts/test-destinatarios-externos-realpg.mjs.
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-destinatarios-externos.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const V = await import("../apps/web/lib/email/recipient-validation.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8").replace(/\r\n/g, "\n");

import { INVALID, VALID } from "./fixtures/destinatarios-vetores.mjs";

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message.split("\n")[0]}`);
    failed += 1;
  }
}

const DOMAINS = [
  { domain: "axion.com.br", kind: "TENANT", active: true },
  { domain: "parceiro.com.br", kind: "PERMITIDO", active: true },
  { domain: "antigo.com.br", kind: "PERMITIDO", active: false },
];

check("validateRecipientEmail: endereços válidos são normalizados (aparar + minúsculas)", () => {
  assert.equal(V.validateRecipientEmail("  Nome.Sobrenome+Tag@Axion.Com.Br ").email, "nome.sobrenome+tag@axion.com.br");
  for (const e of VALID) assert.equal(V.validateRecipientEmail(e).ok, true, e);
});

check("validateRecipientEmail: recusa vazio, sem @, lista, espaço, controle, domínio reservado, IP e limites", () => {
  for (const e of INVALID) assert.equal(V.validateRecipientEmail(e).ok, false, JSON.stringify(e));
});

check("anti-injeção de cabeçalho: CR/LF/NUL/U+2028 NUNCA viram válidos por truncamento (mesmo com endereço correto antes)", () => {
  for (const tail of ["\r\nBcc: v@x.com", "\nCc: v@x.com", "\r", "\n", "\u0000", "\u0085", " ", " ", "%0d%0aBcc:v@x.com"]) {
    const r = V.validateRecipientEmail(`ok@axion.com.br${tail}`);
    assert.equal(r.ok, false, JSON.stringify(tail));
  }
  assert.equal(V.validateRecipientEmail("a@b.com\r\nBcc: x@y.com").code, "CONTROL_CHARS");
});

check("limites: 254 no total, 64 na parte local, 63 por rótulo", () => {
  assert.equal(V.validateRecipientEmail(`${"a".repeat(64)}@${"b".repeat(63)}.com`).ok, true);
  assert.equal(V.validateRecipientEmail(`${"a".repeat(65)}@b.com`).ok, false);
  assert.equal(V.validateRecipientEmail(`a@${"b".repeat(64)}.com`).ok, false);
  const long = `a@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.${"e".repeat(63)}.com`;
  assert.ok(long.length > 254);
  assert.equal(V.validateRecipientEmail(long).code, "TOO_LONG");
});

check("classifyRecipientDomain: INTERNO, PERMITIDO, EXTERNO, INVALID; subdomínio e domínio inativo NÃO herdam (fail-closed)", () => {
  assert.equal(V.classifyRecipientDomain("a@axion.com.br", DOMAINS), "INTERNO");
  assert.equal(V.classifyRecipientDomain("A@AXION.COM.BR", DOMAINS), "INTERNO");
  assert.equal(V.classifyRecipientDomain("a@parceiro.com.br", DOMAINS), "PERMITIDO");
  assert.equal(V.classifyRecipientDomain("a@antigo.com.br", DOMAINS), "EXTERNO");
  assert.equal(V.classifyRecipientDomain("a@sub.axion.com.br", DOMAINS), "EXTERNO");
  assert.equal(V.classifyRecipientDomain("a@axion.com.br.evil.com", DOMAINS), "EXTERNO");
  assert.equal(V.classifyRecipientDomain("a@fakeaxion.com.br", DOMAINS), "EXTERNO");
  assert.equal(V.classifyRecipientDomain("a@cliente.com", DOMAINS), "EXTERNO");
  assert.equal(V.classifyRecipientDomain("nao-e-email", DOMAINS), "INVALID");
  assert.equal(V.classifyRecipientDomain("a@cliente.com", []), "EXTERNO", "lista vazia nunca libera");
});

check("decideRecipient: interno/permitido segue sem confirmação", () => {
  for (const e of ["a@axion.com.br", "b@parceiro.com.br"]) {
    const d = V.decideRecipient(e, DOMAINS);
    assert.equal(d.ok, true);
    assert.equal(d.needsConfirmation, false);
  }
});

check("decideRecipient: externo SEM confirmação é recusado; confirmação sem motivo/curto/longo demais é recusada; ok só com ambos", () => {
  assert.equal(V.decideRecipient("x@cliente.com", DOMAINS).code, "EXTERNAL_CONFIRMATION_REQUIRED");
  assert.equal(V.decideRecipient("x@cliente.com", DOMAINS, null).code, "EXTERNAL_CONFIRMATION_REQUIRED");
  assert.equal(V.decideRecipient("x@cliente.com", DOMAINS, { confirmed: false, reason: "motivo suficientemente longo" }).code, "EXTERNAL_CONFIRMATION_REQUIRED");
  assert.equal(V.decideRecipient("x@cliente.com", DOMAINS, { confirmed: true, reason: "" }).code, "REASON_REQUIRED");
  assert.equal(V.decideRecipient("x@cliente.com", DOMAINS, { confirmed: true, reason: "curto" }).code, "REASON_REQUIRED");
  assert.equal(V.decideRecipient("x@cliente.com", DOMAINS, { confirmed: true, reason: "x".repeat(1001) }).code, "REASON_REQUIRED");
  const ok = V.decideRecipient("  X@Cliente.com ", DOMAINS, { confirmed: true, reason: "  Cliente pediu o envio da solicitação.  " });
  assert.equal(ok.ok, true);
  assert.equal(ok.needsConfirmation, true);
  assert.equal(ok.email, "x@cliente.com");
  assert.equal(ok.reason, "Cliente pediu o envio da solicitação.");
});

check("decideRecipient: endereço inválido é recusado ANTES de qualquer confirmação (confirmação não conserta endereço ruim)", () => {
  const d = V.decideRecipient("a@b.com\r\nBcc: x@y.com", DOMAINS, { confirmed: true, reason: "motivo suficientemente longo" });
  assert.equal(d.ok, false);
  assert.equal(d.code, "CONTROL_CHARS");
});

check("recipientMessageForCode: lista fechada (código desconhecido/propriedade herdada nunca vira mensagem)", () => {
  assert.ok(V.recipientMessageForCode("EXTERNAL_CONFIRMATION_REQUIRED"));
  assert.equal(V.recipientMessageForCode("<script>alert(1)</script>"), null);
  assert.equal(V.recipientMessageForCode("constructor"), null);
  assert.equal(V.recipientMessageForCode("__proto__"), null);
  assert.equal(V.recipientMessageForCode(undefined), null);
});

const SQL = read("supabase/migrations/20261127100000_external_recipient_controls.sql");

check("migration: mesma regex de e-mail do TS, mesmos limites e mesmos domínios reservados", () => {
  assert.ok(SQL.includes("'^[a-z0-9._%+-]{1,64}@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,24}$'"));
  assert.ok(V.RECIPIENT_LIMITS.maxTotal === 254 && SQL.includes("> 254"));
  assert.ok(SQL.includes("(example\\.(com|net|org)|example|invalid|test|localhost|local)$"));
});

check("migration: trilha append-only, RLS só gestão, sem escrita direta, confirmação só por RPC com MANAGE/ADMIN e motivo >= 10", () => {
  assert.match(SQL, /external_recipient_confirmations_append_only before update or delete/);
  assert.match(SQL, /before truncate on public\.external_recipient_confirmations/);
  assert.match(SQL, /revoke insert, update, delete, truncate on public\.external_recipient_confirmations from authenticated/);
  assert.match(SQL, /using \(public\.acc_project_tier\(project_id\) in \('MANAGE', 'ADMIN'\)\)/);
  assert.match(SQL, /if v_tier not in \('MANAGE', 'ADMIN'\) then raise exception 'FORBIDDEN'/);
  assert.match(SQL, /char_length\(btrim\(reason\)\) between 10 and 1000/);
  assert.match(SQL, /security definer\s+set search_path = ''/);
  assert.doesNotMatch(SQL, /grant execute on function public\.acc_external_recipient_confirmed/, "helper interno não é exposto");
  assert.doesNotMatch(SQL, /to anon/i);
});

check("migration: não redefine nenhuma função existente nem altera dado (apenas objetos novos e um gatilho)", () => {
  const created = [...SQL.matchAll(/create or replace function public\.(\w+)/g)].map((m) => m[1]);
  assert.deepEqual(created.sort(), [
    "acc_email_normalize", "acc_external_recipient_confirm", "acc_external_recipient_confirmed", "acc_recipient_domain_status",
    "acc_recipient_domains_guard", "external_recipient_confirmations_guard", "insurance_channel_recipient_guard",
  ].sort());
  assert.doesNotMatch(SQL, /^\s*(update|delete)\s/im);
  assert.match(SQL, /before insert or update of channel_type, channel_value on public\.insurance_official_channels/);
});

check("migration: nenhuma função/ACL do hotfix P0 (record_risk_alert_action) é tocada", () => {
  assert.doesNotMatch(SQL, /record_risk_alert_action/);
});

check("ponto de destinatário 1 (solicitação por e-mail): servidor valida e confirma ANTES de emitir botões e enviar", () => {
  const src = read("apps/web/app/[projectId]/action-requests/actions.ts");
  const iPrepare = src.indexOf("prepareRecipient(");
  assert.ok(iPrepare > 0);
  assert.ok(iPrepare < src.indexOf("issueEmailAlertActionButtons({"), "prepareRecipient antes de emitir botões");
  assert.ok(iPrepare < src.indexOf("sendActionRequestNotification({"), "prepareRecipient antes do envio");
  assert.match(src, /if \(!prepared\.ok\) \{\s*redirect\(/);
  assert.match(src, /const recipientEmail = prepared\.email;/);
  assert.doesNotMatch(src, /getRequiredString\(formData, "recipientEmail"\)/, "o e-mail bruto não segue adiante");
});

check("ponto de destinatário 2 (canal oficial de Seguros, tipo e-mail): confirmação no servidor E gatilho no banco", () => {
  const src = read("apps/web/app/[projectId]/seguros/actions.ts");
  assert.match(src, /input\.op === "channel_register" && input\.data\?\.channel_type === "EMAIL"/);
  assert.ok(src.indexOf("prepareRecipient(") < src.indexOf("buildRpcCall(input)"));
  assert.match(src, /context: "SEGUROS_CANAL"/);
  assert.match(SQL, /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/);
});

check("a página mostra o problema por código FIXO e o formulário tem confirmação, motivo, Hover Text e alvos >= 44 px", () => {
  const page = read("apps/web/app/[projectId]/action-requests/[actionRequestId]/page.tsx");
  assert.match(page, /recipientMessageForCode\(/);
  assert.match(page, /name="externalConfirm"/);
  assert.match(page, /name="externalReason"/);
  assert.match(page, /campo-confirmar-externo/);
  assert.match(page, /campo-motivo-externo/);
  assert.match(page, /label htmlFor="action-request-external-confirm" className="flex min-h-11/);
});

check("nenhum envio real foi introduzido: os módulos novos não importam provedor de e-mail", () => {
  for (const f of ["apps/web/lib/email/external-recipient.ts", "apps/web/lib/email/recipient-validation.ts"]) {
    const s = read(f);
    assert.doesNotMatch(s, /getEmailProvider|gmail|sendMail|\.send\(/i, f);
  }
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
