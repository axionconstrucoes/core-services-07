// FASE 5 / E — governança, regras PURAS (espelho TS), contrato estático das migrations 20261205* e honestidade do roteiro de homologação.
// A prova no banco real está em scripts/test-f5-e-governanca-realpg.mjs. Sem banco, rede ou IA. Cenários 25, 26 e 27 (versão pura).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const H = await import("../apps/web/lib/governance/competence-habilitation.ts");
const OPS = await import("../apps/web/lib/governance/competence-request-ops.ts");
const SB = await import("../apps/web/lib/governance/external-send-binding.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 300)}`);
    failed += 1;
  }
}
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
const PID = "10000000-0000-4000-8000-000000000001";
const DID = "20000000-0000-4000-8000-000000000001";
const base = { requestedBy: U(1), targetUserId: U(2), validatorUserId: U(3), validatorIsProjectAdmin: true, validatorIsActiveDesignated: false, evidenceChecked: true, evidenceDocumentInProject: true, note: "Diploma conferido no documento anexado.", requestStatus: "PENDING", expired: false };

check("validação de habilitação: solicitante e beneficiário nunca validam; só 2º administrador ou designado ativo; evidência conferida e nota", () => {
  assert.deepEqual(H.canApproveCompetenceRequest(base), { ok: true, validatorKind: "SECOND_ADMIN" });
  assert.equal(H.canApproveCompetenceRequest({ ...base, validatorUserId: U(1) }).code, "INDEPENDENT_VALIDATOR_REQUIRED");
  assert.equal(H.canApproveCompetenceRequest({ ...base, validatorUserId: U(2) }).code, "INDEPENDENT_VALIDATOR_REQUIRED");
  assert.deepEqual(H.canApproveCompetenceRequest({ ...base, validatorIsProjectAdmin: false, validatorIsActiveDesignated: true }), { ok: true, validatorKind: "DESIGNATED" });
  assert.equal(H.canApproveCompetenceRequest({ ...base, validatorIsProjectAdmin: false }).code, "FORBIDDEN");
  assert.equal(H.canApproveCompetenceRequest({ ...base, evidenceChecked: false }).code, "EVIDENCE_CHECK_REQUIRED");
  assert.equal(H.canApproveCompetenceRequest({ ...base, note: "curta" }).code, "NOTE_REQUIRED");
  assert.equal(H.canApproveCompetenceRequest({ ...base, evidenceDocumentInProject: false }).code, "EVIDENCE_REQUIRED");
  assert.equal(H.canApproveCompetenceRequest({ ...base, requestStatus: "APPROVED" }).code, "NOT_PENDING");
  assert.equal(H.canApproveCompetenceRequest({ ...base, expired: true }).code, "EXPIRED");
});
check("só habilitação VALIDATED ou MAINTENANCE dá autoridade; UNVALIDATED e desconhecido não", () => {
  assert.equal(H.habilitationGrantsAuthority("VALIDATED"), true);
  assert.equal(H.habilitationGrantsAuthority("MAINTENANCE"), true);
  for (const s of ["UNVALIDATED", "", null, undefined, "PENDING"]) assert.equal(H.habilitationGrantsAuthority(s), false);
});
check("operações de competência: allowlist, evidência obrigatória (CREA/OAB sozinho não basta), confirmação de evidência", () => {
  const c = OPS.buildCompetenceRequestCall({ op: "request_create", projectId: PID, userId: U(2), competence: "JURIDICO", evidenceDocumentId: DID, registrationKind: "OAB", registrationNumber: "1" });
  assert.equal(c.rpc, "project_competence_request_create");
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "request_create", projectId: PID, userId: U(2), competence: "JURIDICO", registrationKind: "OAB", registrationNumber: "1" }), /Identificador inválido/);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "request_approve", id: PID, expectedRowVersion: 1, note: "x".repeat(25) }), /conferida/);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "project_competence_grant" }), /desconhecida/);
  assert.equal(OPS.isCompetenceRequestOp("competence_grant"), false);
});
const DOM = [{ domain: "axion.com.br", kind: "TENANT", active: true }];
const EXT = "contato@cliente-qualquer.com.br";
const INT = "a@axion.com.br";
check("CENÁRIO 25: externo exige aprovação; qualquer domínio externo válido é aceito (sem allowlist); inválido não", () => {
  assert.equal(SB.requiresExternalSendApproval("ENVIO_NOVO", [EXT], DOM), true);
  assert.equal(SB.requiresExternalSendApproval("ENVIO_NOVO", [INT], DOM), false);
  assert.equal(SB.requiresExternalSendApproval("ENVIO_NOVO", ["x@dominio-inedito.engineering"], []), true);
  assert.equal(SB.normalizeRecipientList(["a@b.com\r\nBcc: x@y.com"]), null);
  assert.deepEqual(SB.normalizeRecipientList([EXT.toUpperCase(), INT, EXT]), [INT, EXT].sort());
});
check("leitura/consulta de mensagens já recebidas ou enviadas NÃO exige a aprovação excepcional de novo envio", () => {
  for (const a of SB.MESSAGE_READ_ACTIONS) assert.equal(SB.requiresExternalSendApproval(a, [EXT], DOM), false);
});
check("CENÁRIO 27: COLABORADOR prepara; aprovação conforme a matriz (minuta só ADMIN)", () => {
  assert.equal(SB.canPrepareSend("REGISTER"), true);
  assert.equal(SB.canPrepareSend("READ"), false);
  assert.equal(SB.canApproveSend("REGISTER", "OUTRO"), false);
  assert.equal(SB.canApproveSend("MANAGE", "SOLICITACAO_ACAO"), true);
  assert.equal(SB.canApproveSend("MANAGE", "SEGUROS_MINUTA"), false);
  assert.equal(SB.canApproveSend("ADMIN", "SEGUROS_MINUTA"), true);
});
check("CENÁRIO 26: uso único, só o aprovador, mesma ação/destinatários/hash, 24 h", () => {
  const h = SB.hashExternalSendContent({ subject: "s", body: "texto" });
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, SB.hashExternalSendContent({ subject: "s", body: "texto\r\n" }));
  assert.notEqual(h, SB.hashExternalSendContent({ subject: "s", body: "texto2" }));
  const p = { projectId: "p", context: "SOLICITACAO_ACAO", action: "SOLICITACAO_ACAO", recipients: [INT, EXT].sort(), externalRecipients: [EXT], contentHash: h, preparedBy: U(5), status: "APPROVED", decidedBy: U(3), decidedAtMs: 1_000_000 };
  const a = { userId: U(3), tier: "MANAGE", action: "SOLICITACAO_ACAO", recipients: [EXT, INT], contentHash: h, nowMs: 1_001_000 };
  assert.equal(SB.canConsumeSend(p, a).ok, true);
  assert.equal(SB.canConsumeSend({ ...p, status: "CONSUMED" }, a).code, "ALREADY_USED");
  assert.equal(SB.canConsumeSend(p, { ...a, userId: U(4) }).code, "CONFIRMER_ONLY");
  assert.equal(SB.canConsumeSend(p, { ...a, contentHash: "0".repeat(64) }).code, "CONTENT_CHANGED");
  assert.equal(SB.canConsumeSend(p, { ...a, action: "RESPOSTA" }).code, "ACTION_MISMATCH");
  assert.equal(SB.canConsumeSend(p, { ...a, recipients: [EXT] }).code, "RECIPIENTS_CHANGED");
  assert.equal(SB.canConsumeSend(p, { ...a, nowMs: 1_000_000 + 25 * 3600_000 }).code, "EXPIRED");
  assert.equal(SB.canConsumeSend({ ...p, status: "PREPARED" }, a).code, "NOT_APPROVED");
});
check("migrations 20261205*: RLS nas tabelas novas, rollback, sem envio real, sem tocar no hotfix P0, sem grant a anon/public", () => {
  for (const f of ["20261205100000_competence_validation_requests", "20261205101000_closed_case_material_change_guards", "20261205102000_external_send_single_use_confirmation"]) {
    const sql = read(`supabase/migrations/${f}.sql`);
    assert.match(read(`supabase/rollbacks/${f}.rollback.sql`), /drop|create or replace/);
    assert.doesNotMatch(sql, /record_risk_alert_action/, f);
    assert.doesNotMatch(sql, /grant (select|insert|update|delete)[^;]* to (anon|public)\b/i, f);
    assert.doesNotMatch(sql, /pg_net|http_post|net\.http/i, `${f} não envia nada`);
    for (const m of sql.matchAll(/create table if not exists public\.(\w+)/g)) assert.match(sql, new RegExp(`alter table public\\.${m[1]} enable row level security`), `RLS ${m[1]}`);
  }
  assert.match(read("supabase/migrations/20261205100000_competence_validation_requests.sql"), /HABILITATION_VALIDATION_REQUIRED/);
  assert.match(read("supabase/migrations/20261205102000_external_send_single_use_confirmation.sql"), /confirmation_id uuid primary key/);
});
check("roteiro: 36 linhas com status honesto; nenhuma EXECUTADO-AUTENTICADO sem pessoa logada; sem NÃO EXECUTADO residual", () => {
  const t = read("docs/homologacao-autenticada-roteiro.md");
  const rows = t.split("\n").filter((l) => /^\| /.test(l) && /\*\*(EXECUTADO-BANCO-REAL|BLOQUEADO|FIXTURE|EXECUTADO-AUTENTICADO)\*\*/.test(l));
  assert.equal(rows.length, 36);
  assert.equal(rows.filter((l) => l.includes("**EXECUTADO-AUTENTICADO**")).length, 0);
  assert.equal(t.split("\n").filter((l) => /\| NÃO EXECUTADO \| —/.test(l)).length, 0);
  assert.match(t, /pré-condição 0\.2/);
});
console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
