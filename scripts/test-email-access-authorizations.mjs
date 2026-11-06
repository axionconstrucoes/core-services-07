// Autorização INDIVIDUAL de acesso ao e-mail corporativo — regras puras (sem rede, sem envio, sem banco).
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-email-access-authorizations.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const R = await import("../apps/web/lib/email-access-authorizations/rules.ts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0, failed = 0;
function check(name, fn) { try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; } }

console.log("\n======================================\nAUTORIZAÇÃO INDIVIDUAL DE ACESSO AO E-MAIL (regras puras)\n======================================");

const T0 = "2026-11-10T12:00:00.000Z";
const REQ_ID = "<req-1@axion.example>";
const base = () => R.createRequest({ id: "a1", collaboratorEmail: "Maria.Silva@axion.example", mailbox: "maria.silva@axion.example", purpose: "Rastreabilidade contratual", requestMessageId: REQ_ID, requestedAt: T0 });
const reply = (over = {}) => ({ messageId: "<r1@x>", inReplyTo: REQ_ID, references: [REQ_ID], fromEmail: "maria.silva@axion.example", receivedAt: "2026-11-11T09:00:00.000Z", body: "Autorizo", ...over });
const cls = (b) => R.classifyReply(b).result;

check("classifyReply: 'Autorizo' e variações explícitas => AUTORIZO", () => {
  for (const b of ["Autorizo", "autorizo.", "  AUTORIZO  ", "Autorizo, obrigada.", "Eu autorizo"]) assert.equal(cls(b), "AUTORIZO", b);
});
check("classifyReply: 'Não autorizo' (com/sem acento) => NAO_AUTORIZO", () => {
  for (const b of ["Não autorizo", "nao autorizo", "NÃO AUTORIZO.", "Recuso", "Não autorizo, mas obrigado"]) assert.equal(cls(b), "NAO_AUTORIZO", b);
});
check("classifyReply: ambíguo => PENDENTE_REVISAO (nunca aceite)", () => {
  for (const b of ["", "ok", "Sim", "Pode ser", "Autorizo, mas só a pasta Entrada", "Autorizo desde que o TI confirme", "Autorizo?", "Talvez autorizo", "Autorizo e não autorizo", "Quero entender melhor antes", "autorizado", "x ".repeat(300) + " autorizo"]) {
    assert.equal(cls(b), "PENDENTE_REVISAO", JSON.stringify(b.slice(0, 40)));
  }
});
check("classifyReply: ignora a citação da solicitação original (opções 'Autorizo'/'Não autorizo' citadas)", () => {
  assert.equal(cls("Autorizo\n\n> Responda com Autorizo ou Não autorizo"), "AUTORIZO");
  assert.equal(cls("Não autorizo\n\nEm seg, 10 nov 2026, Axion escreveu:\n> Responda: Autorizo"), "NAO_AUTORIZO");
  assert.equal(cls("Autorizo\n\n-----Original Message-----\nResponda Autorizo ou Não autorizo"), "AUTORIZO");
  assert.equal(cls("> Autorizo\n"), "PENDENTE_REVISAO");
});

check("vinculação: In-Reply-To ou References + remetente igual => vinculada", () => {
  const a = base();
  assert.equal(R.linkReplyToRequest(a, reply()).linked, true);
  assert.equal(R.linkReplyToRequest(a, reply({ inReplyTo: null, references: ["<x>", "<REQ-1@axion.example>"] })).linked, true);
  assert.equal(R.linkReplyToRequest(a, reply({ fromEmail: "Maria Silva <MARIA.SILVA@axion.example>" })).linked, true);
});
check("vinculação: outro remetente ou sem referência NÃO vale", () => {
  const a = base();
  assert.equal(R.linkReplyToRequest(a, reply({ fromEmail: "chefe@axion.example" })).linked, false);
  assert.equal(R.linkReplyToRequest(a, reply({ inReplyTo: "<outro@x>", references: [] })).linked, false);
  assert.equal(R.linkReplyToRequest({ ...a, requestMessageId: "" }, reply()).linked, false);
});

check("aceite válido: ACEITE_REGISTRADO, expiração calculada, resposta original preservada", () => {
  const b = base();
  const a = R.applyReply(b, { ...reply(), body: "Autorizo" });
  assert.equal(a.consentStatus, "ACEITE_REGISTRADO");
  assert.equal(a.acceptedAt, "2026-11-11T09:00:00.000Z");
  assert.equal(a.accessExpiresAt, R.computeAccessExpiry("2026-11-11T09:00:00.000Z", 90));
  assert.equal(a.accessExpiresAt, "2027-02-09T09:00:00.000Z");
  assert.equal(a.acceptedReply.fromEmail, "maria.silva@axion.example");
  assert.equal(a.acceptedReply.messageId, "<r1@x>");
  assert.equal(a.acceptedReply.inReplyTo, REQ_ID);
  assert.deepEqual(a.acceptedReply.references, [REQ_ID]);
  assert.equal(a.acceptedReply.bodyHash, R.hashReplyBody("Autorizo"));
  assert.equal(b.consentStatus, "SOLICITADA", "não muta o original");
});
check("recusa vinculada => RECUSADA; ambígua e de outro remetente => estado não muda, resposta guardada para revisão", () => {
  assert.equal(R.applyReply(base(), reply({ body: "Não autorizo" })).consentStatus, "RECUSADA");
  const amb = R.applyReply(base(), reply({ body: "Autorizo, mas só às sextas" }));
  assert.equal(amb.consentStatus, "SOLICITADA");
  assert.equal(amb.pendingReviewReplies.length, 1);
  assert.equal(amb.pendingReviewReplies[0].classification, "PENDENTE_REVISAO");
  const other = R.applyReply(base(), reply({ fromEmail: "intruso@externo.example", body: "Autorizo" }));
  assert.equal(other.consentStatus, "SOLICITADA");
  assert.equal(other.acceptedAt, null);
  assert.equal(other.pendingReviewReplies[0].fromEmail, "intruso@externo.example");
  assert.equal(other.pendingReviewReplies[0].linkedToRequest, false);
});
check("resposta tardia (após o prazo) não gera aceite", () => {
  const a = R.applyReply(base(), reply({ receivedAt: "2026-12-30T09:00:00.000Z" }));
  assert.equal(a.consentStatus, "SOLICITADA");
  assert.equal(a.pendingReviewReplies.length, 1);
});
check("aceite não é sobrescrito por resposta posterior", () => {
  const a = R.applyReply(base(), reply());
  const b = R.applyReply(a, reply({ messageId: "<r2@x>", body: "Não autorizo", receivedAt: "2026-11-12T09:00:00.000Z" }));
  assert.equal(b.consentStatus, "ACEITE_REGISTRADO");
  assert.equal(b.pendingReviewReplies.length, 1);
});

check("canCollect: aceite por e-mail sozinho => false (falta autorização técnica)", () => {
  const a = R.applyReply(base(), reply());
  assert.equal(a.technicalAuthorization, "NENHUMA");
  assert.equal(R.canCollect(a, new Date("2026-11-12T00:00:00Z")), false);
});
check("canCollect: autorização técnica sem aceite => false", () => {
  assert.equal(R.canCollect(R.confirmTechnicalAuthorization(base()), new Date("2026-11-12T00:00:00Z")), false);
  const rec = R.confirmTechnicalAuthorization(R.applyReply(base(), reply({ body: "Não autorizo" })));
  assert.equal(R.canCollect(rec, new Date("2026-11-12T00:00:00Z")), false);
});
check("canCollect: aceite + OAuth => true dentro da validade; false antes do aceite e após a expiração", () => {
  const a = R.confirmTechnicalAuthorization(R.applyReply(base(), reply()));
  assert.equal(R.canCollect(a, new Date("2026-11-12T00:00:00Z")), true);
  assert.equal(R.canCollect(a, new Date("2026-11-11T08:00:00Z")), false);
  assert.equal(R.canCollect(a, new Date("2027-02-10T00:00:00Z")), false);
  assert.equal(R.effectiveStatus(a, new Date("2027-02-10T00:00:00Z")), "EXPIRADA");
});
check("solicitação sem resposta expira (EXPIRADA) e não coleta", () => {
  const a = base();
  assert.equal(R.effectiveStatus(a, new Date("2026-11-20T00:00:00Z")), "SOLICITADA");
  assert.equal(R.effectiveStatus(a, new Date("2026-12-01T00:00:00Z")), "EXPIRADA");
});
check("revogação impede novas coletas e prevalece sobre qualquer outro estado; é idempotente", () => {
  const ok = R.confirmTechnicalAuthorization(R.applyReply(base(), reply()));
  const rev = R.revoke(ok, "2026-11-15T00:00:00.000Z", "pedido do colaborador");
  assert.equal(R.canCollect(rev, new Date("2026-11-16T00:00:00Z")), false);
  assert.equal(R.effectiveStatus(rev, new Date("2026-11-16T00:00:00Z")), "REVOGADA");
  assert.equal(R.revoke(rev, "2026-11-20T00:00:00.000Z", "outra"), rev);
  assert.equal(ok.revokedAt, null, "não muta");
  // resposta posterior não reabre
  const after = R.applyReply(rev, reply({ messageId: "<r9@x>", receivedAt: "2026-11-17T00:00:00.000Z" }));
  assert.equal(R.canCollect(after, new Date("2026-11-18T00:00:00Z")), false);
});
check("hash do corpo é SHA-256 hex estável", () => {
  assert.equal(R.hashReplyBody("Autorizo"), "09c06a114309d73d048a2282f66e65f906e837f9df7864fcb84f40e166d82aba");
  assert.match(R.hashReplyBody("x"), /^[0-9a-f]{64}$/);
});
check("módulo é puro: sem React, sem rede, sem envio; minuta e migration existem", () => {
  const dir = path.join(root, "apps/web/lib/email-access-authorizations");
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(src, /from ["']react|fetch\(|nodemailer|googleapis|supabase|process\.env|sendMail|deliver\(/i, f);
  }
  readFileSync(path.join(root, "docs/autorizacao-acesso-email-minuta.md"), "utf8");
  readFileSync(path.join(root, "supabase/migrations/20261106120000_email_access_authorizations.sql"), "utf8");
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
