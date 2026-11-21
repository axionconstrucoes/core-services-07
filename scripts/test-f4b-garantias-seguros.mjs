// FASE 4 / B — Garantias (aceite comprovado) + Seguros (coerência, fundamentação, fonte, consolidação, cobertura específica, RCC, identificação).
// Testes PUROS (sem banco, rede ou IA). A contraparte em Postgres real é scripts/test-f4b-garantias-seguros-realpg.mjs.
// Casos nomeados `CASO F4-B-NN`. Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-f4b-garantias-seguros.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const ACC = await import("../apps/web/lib/garantias/acceptance.ts");
const SM = await import("../apps/web/lib/quality/state-machine.ts");
const I = await import("../apps/web/lib/insurance/index.ts");
const FORMS = await import("../apps/web/lib/insurance-ui/forms.ts");
const OPS = await import("../apps/web/lib/insurance-ui/rpc-ops.ts");
const ERR = await import("../apps/web/lib/insurance-ui/errors.ts");
const GL = await import("../apps/web/lib/garantias/labels.ts");
const AL = await import("../apps/web/lib/garantias/action-logic.ts");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
    failed += 1;
  }
}

/* ------------------------------------------------------------------ 3. Garantias: aceite informado x comprovado ------------------------------------------------------------------ */
check("CASO F4-B-01) aceite: situação e bloqueio de encerramento por status (NENHUM/INFORMADO/COMPROVADO/LEGADO) — espelho do banco", () => {
  const f = (acceptanceStatus, acceptedAt, acceptedByName, state) => ({ acceptanceStatus, acceptedAt, acceptedByName, state });
  assert.equal(ACC.acceptanceDisplay(f("NENHUM", null, null, "VERIFICADA")), "NENHUM");
  assert.equal(ACC.acceptanceDisplay(f("INFORMADO", "2026-11-10T12:00:00Z", "Cliente", "VERIFICADA")), "INFORMADO");
  assert.equal(ACC.acceptanceDisplay(f("COMPROVADO", "2026-11-10T12:00:00Z", "Cliente", "VERIFICADA")), "COMPROVADO");
  assert.equal(ACC.acceptanceDisplay(f("NENHUM", "2026-11-10T12:00:00Z", "Cliente", "ENCERRADA")), "LEGADO");
  assert.equal(ACC.acceptanceBlocker(f("NENHUM", null, null, "VERIFICADA")), "CUSTOMER_ACCEPTANCE_REQUIRED");
  assert.equal(ACC.acceptanceBlocker(f("INFORMADO", "2026-11-10T12:00:00Z", "Cliente", "VERIFICADA")), "CUSTOMER_ACCEPTANCE_NOT_PROVEN");
  assert.equal(ACC.acceptanceBlocker(f("COMPROVADO", "2026-11-10T12:00:00Z", "Cliente", "VERIFICADA")), null);
  // legado: vale para a garantia JÁ encerrada; em caso aberto não libera
  assert.equal(ACC.acceptanceBlocker(f("NENHUM", "2026-11-10T12:00:00Z", "Cliente", "ENCERRADA")), null);
  assert.equal(ACC.acceptanceBlocker(f("NENHUM", "2026-11-10T12:00:00Z", "Cliente", "VERIFICADA")), "CUSTOMER_ACCEPTANCE_NOT_PROVEN");
  // sem nome não é aceite legado
  assert.equal(ACC.acceptanceBlocker(f("NENHUM", "2026-11-10T12:00:00Z", " ", "VERIFICADA")), "CUSTOMER_ACCEPTANCE_REQUIRED");
});

const HASH = createHash("sha256").update("e-mail do cliente sintético").digest("hex");
const proofCtx = (o = {}) => ({ today: "2026-11-25", lastRepairDay: "2026-11-20", internalEmails: ["gestor@axion.example"], registrantName: "Gestor Interno", evidence: { id: "ev-1", epistemic: "FATO", sourceType: "EMAIL" }, ...o });
const proofRaw = (o = {}) => ({ acceptedAt: "2026-11-24", manifestantName: "Maria Cliente", manifestantOrganization: "Cliente SA", manifestantContact: "Maria@Cliente.Example", evidenceId: "ev-1", sourceHash: HASH, note: "", ...o });
check("CASO F4-B-02) aceite COMPROVADO: exige evidência (e-mail/documento FATO), hash SHA-256, data coerente e manifestante EXTERNO — lançamento interno não substitui", () => {
  const ok = ACC.validateProofInput(proofRaw(), proofCtx());
  assert.equal(ok.ok, true);
  assert.equal(ok.input.manifestantContact, "maria@cliente.example", "e-mail normalizado");
  const codes = (raw, ctx) => ACC.validateProofInput(raw, ctx).codes ?? [];
  assert.ok(codes(proofRaw({ sourceHash: "abc" }), proofCtx()).includes("SOURCE_HASH_REQUIRED"));
  assert.ok(codes(proofRaw({ sourceHash: "G".repeat(64) }), proofCtx()).includes("SOURCE_HASH_REQUIRED"));
  assert.ok(codes(proofRaw({ manifestantContact: "sem-arroba" }), proofCtx()).includes("MANIFESTANT_CONTACT_REQUIRED"));
  assert.ok(codes(proofRaw({ manifestantContact: "" }), proofCtx()).includes("MANIFESTANT_CONTACT_REQUIRED"));
  assert.ok(codes(proofRaw({ evidenceId: "" }), proofCtx()).includes("EVIDENCE_REQUIRED"));
  assert.ok(codes(proofRaw(), proofCtx({ evidence: { id: "ev-1", epistemic: "INFERENCIA", sourceType: "EMAIL" } })).includes("EVIDENCE_INVALID"));
  assert.ok(codes(proofRaw(), proofCtx({ evidence: { id: "ev-1", epistemic: "FATO", sourceType: "SSMA_FOTO" } })).includes("EVIDENCE_INVALID"), "foto SSMA não prova aceite");
  assert.ok(codes(proofRaw(), proofCtx({ evidence: null })).includes("EVIDENCE_INVALID"));
  assert.ok(codes(proofRaw({ manifestantContact: "gestor@axion.example" }), proofCtx()).includes("MANIFESTANT_IS_INTERNAL"), "e-mail de membro do projeto");
  assert.ok(codes(proofRaw({ manifestantName: "gestor  INTERNO" }), proofCtx()).includes("MANIFESTANT_IS_INTERNAL"), "nome do próprio registrante");
  assert.ok(codes(proofRaw({ acceptedAt: "2026-11-19" }), proofCtx()).includes("ACCEPTANCE_BEFORE_REPAIR"));
  assert.ok(codes(proofRaw({ acceptedAt: "2026-12-30" }), proofCtx()).includes("INVALID_DATA"), "data futura");
  assert.ok(codes(proofRaw({ acceptedAt: "2026-02-31" }), proofCtx()).includes("INVALID_DATA"), "data inexistente");
  assert.ok(codes(proofRaw({ manifestantName: "A" }), proofCtx()).includes("INVALID_DATA"));
  // sem reparo registrado, não há data mínima
  assert.equal(ACC.validateProofInput(proofRaw({ acceptedAt: "2026-01-01" }), proofCtx({ lastRepairDay: null })).ok, true);
  // a verificação de formato do servidor não depende de dados do banco
  assert.equal(AL.buildAcceptanceProofInput(proofRaw(), "2026-11-25").ok, true);
  assert.equal(AL.buildAcceptanceProofInput(proofRaw({ sourceHash: "x" }), "2026-11-25").ok, false);
});

check("CASO F4-B-03) máquina de estados TS: aceite só INFORMADO não encerra; COMPROVADO libera; precedência de acceptanceStatus sobre o legado customerAccepted", () => {
  const base = { entity: "WARRANTY", from: "VERIFICADA", to: "ENCERRADA", role: "ADMINISTRADOR", justification: "Encerramento após verificação eficaz", verifications: [{ result: "EFICAZ", eventSeqAt: 5, evidenceId: "e" }], events: [{ seq: 5, toState: "VERIFICADA" }], hasRepairRecord: true };
  const blockers = (extra) => SM.evaluateTransition({ ...base, ...extra }).blockers;
  assert.ok(blockers({ acceptanceStatus: "INFORMADO" }).includes("CUSTOMER_ACCEPTANCE_NOT_PROVEN"));
  assert.ok(blockers({ acceptanceStatus: "NENHUM" }).includes("CUSTOMER_ACCEPTANCE_REQUIRED"));
  assert.ok(blockers({ acceptanceStatus: "NENHUM", legacyAcceptance: true }).includes("CUSTOMER_ACCEPTANCE_NOT_PROVEN"));
  assert.ok(!blockers({ acceptanceStatus: "COMPROVADO" }).some((b) => b.startsWith("CUSTOMER_ACCEPTANCE")));
  assert.ok(!blockers({ acceptanceStatus: "INFORMADO", customerAccepted: true }).some((b) => b === "CUSTOMER_ACCEPTANCE_REQUIRED"), "status informado nunca vira REQUIRED");
  assert.ok(blockers({ acceptanceStatus: "INFORMADO", customerAccepted: true }).includes("CUSTOMER_ACCEPTANCE_NOT_PROVEN"), "customerAccepted legado não sobrepõe o status");
  assert.ok(!blockers({ customerAccepted: true }).some((b) => b.startsWith("CUSTOMER_ACCEPTANCE")), "compatibilidade do legado sem status");
  assert.ok(GL.BLOCKER_MESSAGES.CUSTOMER_ACCEPTANCE_NOT_PROVEN && GL.ERROR_MESSAGES.MANIFESTANT_IS_INTERNAL && GL.ERROR_MESSAGES.SOURCE_HASH_REQUIRED, "mensagens ao usuário");
});

/* ------------------------------------------------------------------ 4. Seguros ------------------------------------------------------------------ */
check("CASO F4-B-04) documento fiscal: CPF/CNPJ validados pelos dígitos verificadores; dígitos repetidos e tamanhos errados recusados; normalização", () => {
  for (const v of ["11.222.333/0001-81", "11222333000181", "12.345.678/0001-95", "55.566.677/0001-83", "529.982.247-25", "123.456.789-09"]) assert.equal(I.isValidTaxId(v), true, v);
  for (const v of ["11.111.111/0001-11", "11111111111", "00000000000000", "12.345.678/0001-96", "529.982.247-26", "123", "", null, undefined, "abc"]) assert.equal(I.isValidTaxId(v), false, String(v));
  assert.equal(I.taxIdDigits("11.222.333/0001-81"), "11222333000181");
  assert.equal(I.taxIdDigits("  "), null);
  assert.equal(I.normalizeText("  Construção  ÁÉÍÓÚ, Ç-ã  "), "construcao aeiou c a");
  assert.equal(I.partyEqual({ name: "A B", taxId: "11222333000181" }, { name: "Outro nome", taxId: "11.222.333/0001-81" }), true, "documento igual vale mais que o nome");
  assert.equal(I.partyEqual({ name: "Mesmo", taxId: "11222333000181" }, { name: "Mesmo", taxId: "12345678000195" }), false, "documento diferente diverge mesmo com nome igual");
  assert.equal(I.partyEqual({ name: "Construtora Alfa Ltda" }, { name: "CONSTRUTORA ALFA LTDA." }), true);
  assert.equal(I.partyEqual({ name: "" }, { name: "" }), false, "sem dado nunca é igual");
});

const terms = (o = {}) => ({ insuredName: "Construtora Alfa Ltda", insuredTaxId: "11.222.333/0001-81", beneficiaryName: "Incorporadora Beta SA", beneficiaryTaxId: "12.345.678/0001-95", objectText: "Edifício comercial, Fase 1", coverageStart: "2026-01-01", coverageEnd: "2027-01-01", insuredAmount: 1000000, guaranteedObligation: "Execução da obra conforme contrato", source: { ref: "doc p.1" }, ...o });
const three = (m = {}, a = {}, c = {}) => ({ CONTRATO: terms(c), APOLICE: terms(a), MINUTA: terms(m) });
const md5 = (s) => createHash("md5").update(s).digest("hex");
check("CASO F4-B-05) coerência minuta × apólice × contrato: segurado, beneficiário, objeto, vigência, importância e obrigação; valor ausente não diverge; faltar instrumento = SEM DADOS", () => {
  assert.equal(I.computeCoherence(three()).status, "COERENTE");
  assert.equal(I.computeCoherence(three()).approvalAllowed, true);
  const cases = [
    ["SEGURADO", { insuredName: "Outra Empresa Ltda", insuredTaxId: "98765432000198" }],
    ["BENEFICIARIO", { beneficiaryTaxId: "55566677000183" }],
    ["OBJETO", { objectText: "Galpão industrial" }],
    ["VIGENCIA_INICIO", { coverageStart: "2026-02-01" }],
    ["VIGENCIA_FIM", { coverageEnd: "2027-06-01" }],
    ["IMPORTANCIA_SEGURADA", { insuredAmount: 999999.99 }],
    ["OBRIGACAO_GARANTIDA", { guaranteedObligation: "Pagamento de fornecedores" }],
  ];
  for (const [field, patch] of cases) {
    const r = I.computeCoherence(three(patch));
    assert.equal(r.status, "DIVERGENTE", field);
    assert.equal(r.approvalAllowed, false, field);
    assert.deepEqual(r.divergences.map((d) => d.field), [field], field);
  }
  // diferença só de acento/caixa/pontuação NÃO diverge
  assert.equal(I.computeCoherence(three({ objectText: "EDIFICIO comercial - fase 1." })).status, "COERENTE");
  // valor ausente em um documento: SEM DADOS, não é divergência
  assert.equal(I.computeCoherence(three({ beneficiaryName: null, beneficiaryTaxId: null, objectText: null, insuredAmount: null })).status, "COERENTE");
  // termos de um instrumento ausentes => SEM_DADOS e aprovação bloqueada
  const sem = I.computeCoherence({ CONTRATO: terms(), APOLICE: terms() });
  assert.equal(sem.status, "SEM_DADOS");
  assert.deepEqual(sem.missingKinds, ["MINUTA"]);
  assert.equal(sem.approvalAllowed, false);
  assert.equal(I.computeCoherence({}).status, "SEM_DADOS");
  // justificativa presa ao fingerprint: vale só para os mesmos valores
  const div = I.computeCoherence(three({ coverageEnd: "2027-06-01" }), new Set(), md5);
  const fp = div.divergences[0].fingerprint;
  assert.match(fp, /^[0-9a-f]{32}$/);
  const just = I.computeCoherence(three({ coverageEnd: "2027-06-01" }), new Set([fp]), md5);
  assert.equal(just.status, "DIVERGENTE_JUSTIFICADA");
  assert.equal(just.approvalAllowed, true);
  const changed = I.computeCoherence(three({ coverageEnd: "2027-07-01" }), new Set([fp]), md5);
  assert.equal(changed.status, "DIVERGENTE", "mudou o valor: a justificativa anterior não vale");
  // valores presentes são comparados par a par (contrato x apólice divergem mesmo que a minuta coincida com um deles)
  const r = I.computeCoherence(three({}, {}, { insuredAmount: 2 }));
  assert.deepEqual(r.divergences.map((d) => d.field), ["IMPORTANCIA_SEGURADA"]);
  assert.deepEqual(Object.keys(r.divergences[0].values).sort(), ["APOLICE", "CONTRATO", "MINUTA"]);
  assert.equal(r.divergences[0].canonical, "IMPORTANCIA_SEGURADA|CONTRATO=2.00;APOLICE=1000000.00;MINUTA=1000000.00;");
  // justificativa: texto >= 20 + fonte
  assert.equal(I.validateJustification({ justification: "curta" }).length, 2);
  assert.equal(I.validateJustification({ justification: "Aditivo n. 2 estendeu a vigência (carta anexa).", sourceRef: "aditivo-2" }).length, 0);
  assert.equal(I.validateJustification({ justification: "Aditivo n. 2 estendeu a vigência (carta anexa).", sourceDocumentId: "d1" }).length, 0);
});

check("CASO F4-B-06) fundamentação de sinistro: decisão/indenização/negativa/contestação exigem nota >= 20 + fonte; etapas sem nota ficam bloqueadas", () => {
  const g = I.checkClaimGrounds;
  assert.equal(g("DECISAO", {}), "GROUNDS_REQUIRED");
  assert.equal(g("INDENIZACAO_CUMPRIMENTO", { note: "Pago." , sourceRefs: ["x"] }), "GROUNDS_REQUIRED");
  assert.equal(g("DECISAO", { note: "Decisão da seguradora após regulação do evento" }), "GROUNDS_SOURCES_REQUIRED");
  assert.equal(g("DECISAO", { note: "Decisão da seguradora após regulação do evento", sourceRefs: ["  ", ""] }), "GROUNDS_SOURCES_REQUIRED");
  assert.equal(g("DECISAO", { note: "Decisão da seguradora após regulação do evento", sourceRefs: ["carta 12/11"] }), null);
  assert.equal(g("INDENIZACAO_CUMPRIMENTO", { note: "Pagamento confirmado pela seguradora", documentId: "doc-1" }), null);
  assert.equal(g("NEGATIVA", { note: "curta" }), "NOTE_REQUIRED");
  assert.equal(g("NEGATIVA", { note: "Negada pela seguradora por exclusão" }), "GROUNDS_SOURCES_REQUIRED");
  assert.equal(g("CONTESTACAO", { note: "Contestação protocolada com documentos", sourceRefs: ["protocolo 77"] }), null);
  assert.equal(g("AVISO", {}), null, "etapas operacionais não exigem fundamentação");
  assert.equal(g("REGULACAO", {}), null);
  assert.equal(g("ENCERRADO", { note: "curta" }), "NOTE_REQUIRED");
  assert.equal(I.stageRequiresGrounds("DECISAO") && I.stageRequiresGrounds("INDENIZACAO_CUMPRIMENTO") && !I.stageRequiresGrounds("AVISO"), true);
  // formulário: mesmas regras, no campo certo
  assert.ok(FORMS.validateClaimGrounds("DECISAO", { note: "", source_refs: "" }).note);
  assert.ok(FORMS.validateClaimGrounds("DECISAO", { note: "Decisão da seguradora após regulação do evento", source_refs: "" }).source_refs);
  assert.deepEqual(FORMS.validateClaimGrounds("DECISAO", { note: "Decisão da seguradora após regulação do evento", source_refs: "carta\noutra" }), {});
  const built = FORMS.buildForm(FORMS.FORMS.claimAdvance, { note: "Decisão da seguradora após regulação do evento", source_refs: "carta 1\n\n  carta 2  \n" });
  assert.deepEqual(built.data.source_refs, ["carta 1", "carta 2"]);
  const call = OPS.buildRpcCall({ projectId: "10000000-0000-4000-8000-000000000001", op: "claim_advance", id: "10000000-0000-4000-8000-000000000002", expectedRowVersion: 3, args: { toStage: "DECISAO" }, data: { ...built.data, decision_outcome: "PARCIAL" } });
  assert.deepEqual(call.params.p_data.source_refs, ["carta 1", "carta 2"]);
  assert.equal(call.level, "MANAGE");
  for (const code of ["GROUNDS_REQUIRED", "GROUNDS_SOURCES_REQUIRED", "RCC_NOT_READY", "COHERENCE_BLOCKED", "UPDATE_SOURCE_REQUIRED", "UPDATE_REASON_REQUIRED"]) assert.ok(ERR.mapInsuranceError({ message: `${code}: detalhe` }).message.length > 20, code);
});

check("CASO F4-B-07) atualização de fiança/caução exige FONTE + motivo + campo alterado; a UI manda fonte/motivo no p_data da RPC", () => {
  const c = I.checkGuaranteeUpdate;
  assert.equal(c({ changedKeys: ["amount"] }), "UPDATE_SOURCE_REQUIRED");
  assert.equal(c({ changedKeys: ["amount"], updateSourceRef: "aditivo" }), "UPDATE_REASON_REQUIRED");
  assert.equal(c({ changedKeys: ["amount"], updateSourceRef: "aditivo", updateReason: "curto" }), "UPDATE_REASON_REQUIRED");
  assert.equal(c({ changedKeys: [], updateSourceRef: "aditivo", updateReason: "Aditivo n. 3 reduziu o valor" }), "UPDATE_EMPTY");
  assert.equal(c({ changedKeys: ["update_reason"], updateSourceRef: "aditivo", updateReason: "Aditivo n. 3 reduziu o valor" }), "UPDATE_EMPTY", "só metadados não é atualização");
  assert.equal(c({ changedKeys: ["amount"], updateSourceDocumentId: "doc", updateReason: "Aditivo n. 3 reduziu o valor" }), null);
  const initial = { amount: "100", end_date: "", status: "VIGENTE", notes: "" };
  assert.ok(FORMS.validateGuaranteeUpdate({ ...initial, amount: "90", update_reason: "Aditivo n. 3 reduziu o valor" }, initial).update_source_ref);
  assert.ok(FORMS.validateGuaranteeUpdate({ ...initial, amount: "90", update_source_ref: "aditivo 3" }, initial).update_reason);
  assert.ok(FORMS.validateGuaranteeUpdate({ ...initial, update_source_ref: "aditivo 3", update_reason: "Aditivo n. 3 reduziu o valor" }, initial)._form);
  assert.deepEqual(FORMS.validateGuaranteeUpdate({ ...initial, amount: "90", update_source_ref: "aditivo 3", update_reason: "Aditivo n. 3 reduziu o valor" }, initial), {});
  for (const op of ["bank_update", "other_update"]) {
    const call = OPS.buildRpcCall({ projectId: "10000000-0000-4000-8000-000000000001", op, id: "10000000-0000-4000-8000-000000000002", expectedRowVersion: 2, data: { amount: 90 }, args: { update_source_ref: "aditivo 3", update_reason: "Aditivo n. 3 reduziu o valor", sourceKind: "X" } });
    assert.equal(call.params.p_data.update_source_ref, "aditivo 3");
    assert.equal(call.params.p_data.update_reason, "Aditivo n. 3 reduziu o valor");
    assert.equal(call.params.p_data.amount, 90);
    assert.equal(call.params.p_data.sourceKind, undefined, "só as chaves da allowlist");
  }
  assert.equal(FORMS.FORMS.bankUpdate.requireSource, true);
  assert.deepEqual(FORMS.FORMS.otherUpdate.sourceFields, ["update_source_document_id", "update_source_ref"]);
});

const adv = (o = {}) => ({ id: "a1", policyId: "p1", contractNumber: "CT-1", advanceDate: "2026-03-01", advancedAmount: 1000, guaranteedLimit: null, sourceDocumentId: null, sourceRef: "NF 10", createdAt: "2026-03-02T10:00:00Z", amortizations: [], ...o });
const am = (o = {}) => ({ id: "m1", amount: 100, amortizedOn: "2026-04-01", sourceDocumentId: null, sourceRef: "medição 1", createdAt: "2026-04-02T10:00:00Z", ...o });
check("CASO F4-B-08) adiantamentos consolidados: soma, amortizado e saldo sem dupla contagem; duplicidade excluída; amortização acima do adiantado sinalizada; centavos exatos", () => {
  const r0 = I.consolidateAdvances([adv({ amortizations: [am(), am({ id: "m2", amount: 250.5, amortizedOn: "2026-05-01", sourceRef: "medição 2", createdAt: "2026-05-02T10:00:00Z" })] })], { p1: 1000 });
  assert.deepEqual(r0.totals, { advanced: 1000, amortized: 350.5, unamortized: 649.5, advances: 1, duplicateAdvances: 0, duplicateAmortizations: 0, overAmortized: 0 });
  assert.equal(r0.byPolicy[0].guarantee, "SUFICIENTE");
  // adiantamento duplicado (mesma apólice, contrato, data, valor e fonte): conta UMA vez; amortizações do duplicado passam ao mantido
  const dup = I.consolidateAdvances([
    adv({ id: "a1", amortizations: [am()] }),
    adv({ id: "a2", createdAt: "2026-03-03T10:00:00Z", contractNumber: "ct 1", amortizations: [am({ id: "m9", amount: 50, sourceRef: "medição 9", createdAt: "2026-04-09T10:00:00Z" })] }),
  ], { p1: 10000 });
  assert.equal(dup.totals.advanced, 1000, "sem dupla contagem do adiantado");
  assert.equal(dup.totals.advances, 1);
  assert.equal(dup.totals.duplicateAdvances, 1);
  assert.deepEqual(dup.duplicates.advances, [{ id: "a2", duplicateOf: "a1" }]);
  assert.equal(dup.totals.amortized, 150, "amortizações do duplicado atribuídas ao mantido");
  // amortização duplicada (mesmo valor, data e fonte): conta uma vez
  const dupAm = I.consolidateAdvances([adv({ amortizations: [am(), am({ id: "m3", createdAt: "2026-04-03T10:00:00Z" })] })], {});
  assert.equal(dupAm.totals.amortized, 100);
  assert.deepEqual(dupAm.duplicates.amortizations, [{ id: "m3", duplicateOf: "m1" }]);
  // fonte diferente OU valor diferente NÃO é duplicidade (dois adiantamentos reais)
  const two = I.consolidateAdvances([adv({ id: "a1" }), adv({ id: "a2", sourceRef: "NF 11" }), adv({ id: "a3", advancedAmount: 1000.01 })], {});
  assert.equal(two.totals.advances, 3);
  assert.equal(two.totals.advanced, 3000.01);
  // amortização acima do adiantado (legado): não gera saldo negativo
  const over = I.consolidateAdvances([adv({ advancedAmount: 100, amortizations: [am({ amount: 80 }), am({ id: "m2", amount: 50, sourceRef: "medição 2" })] })], { p1: 5 });
  assert.equal(over.totals.overAmortized, 1);
  assert.deepEqual([over.advances[0].amortized, over.advances[0].unamortized, over.advances[0].overAmount], [100, 0, 30]);
  assert.equal(over.advances[0].guarantee, "SUFICIENTE");
  // teto da apólice: insuficiente / SEM_DADOS (nunca "suficiente" por omissão)
  assert.equal(I.consolidateAdvances([adv()], { p1: 600 }).byPolicy[0].guarantee, "INSUFICIENTE");
  assert.equal(I.consolidateAdvances([adv()], { p1: 600 }).byPolicy[0].uncoveredExcess, 400);
  assert.equal(I.consolidateAdvances([adv()], {}).byPolicy[0].guarantee, "SEM_DADOS");
  assert.equal(I.consolidateAdvances([adv()], {}).byPolicy[0].uncoveredExcess, null);
  // aritmética em centavos
  const fl = I.consolidateAdvances([adv({ advancedAmount: 0.3, amortizations: [am({ amount: 0.1 }), am({ id: "m2", amount: 0.2, sourceRef: "m2" })] })], {});
  assert.equal(fl.totals.unamortized, 0);
  assert.equal(I.consolidateAdvances([], {}).totals.advances, 0);
  assert.deepEqual(I.consolidateAdvances([], {}).byPolicy, []);
  // limites por adiantamento não são somados no teto da apólice (sem dupla contagem de teto)
  const lim = I.consolidateAdvances([adv({ id: "a1", guaranteedLimit: 300 }), adv({ id: "a2", sourceRef: "NF 2", guaranteedLimit: 300 })], { p1: 5000 });
  assert.equal(lim.byPolicy[0].ceiling, 5000);
  assert.equal(lim.byPolicy[0].unamortized, 2000);
  assert.equal(lim.advances[0].guarantee, "INSUFICIENTE", "teto por adiantamento = mínimo entre limite e teto da apólice");
});

const base = { modality: "SEGURO_GARANTIA_EXECUTANTE", claimKind: "INADIMPLEMENTO", eventDate: "2026-06-01", policy: { coverageStart: "2026-01-01", coverageEnd: "2027-01-01" }, clauses: [], endorsements: [] };
const clause = (o) => ({ id: "c1", kind: "COBERTURA", title: "Cobertura de inadimplemento", identifier: "Cláusula 4.2", appliesTo: ["INADIMPLEMENTO"], source: { ref: "apólice p.3" }, verified: true, ...o });
check("CASO F4-B-09) cláusula GENÉRICA não é prova de cobertura: exige cláusula de COBERTURA específica, identificada e com fonte; RC cruzada exige RCC pronto", () => {
  const ok = I.assessCoverage({ ...base, clauses: [clause()] });
  assert.equal(ok.conclusion, "POTENCIALMENTE_COBERTO");
  assert.equal(ok.requiresHumanReview, true);
  // genérica (kind CLAUSULA/OUTRO) com fonte e "aplica-se": NÃO prova
  for (const kind of ["CLAUSULA", "OUTRO"]) {
    const r = I.assessCoverage({ ...base, clauses: [clause({ kind })] });
    assert.equal(r.conclusion, "INFORMACOES_INSUFICIENTES", kind);
    assert.ok(r.reasons.some((x) => x.code === "CLAUSULA_GENERICA_NAO_E_COBERTURA"), kind);
    assert.ok(r.missing.includes("CLAUSULA_DE_COBERTURA_PARA_O_EVENTO"));
  }
  // COBERTURA sem identificação: não prova (legado)
  for (const identifier of [undefined, null, "", " ", "x"]) {
    const r = I.assessCoverage({ ...base, clauses: [clause({ identifier })] });
    assert.equal(r.conclusion, "INFORMACOES_INSUFICIENTES", String(identifier));
    assert.ok(r.reasons.some((x) => x.code === "CLAUSULA_GENERICA_NAO_E_COBERTURA"));
  }
  // identificada mas SEM fonte: continua não valendo
  assert.equal(I.assessCoverage({ ...base, clauses: [clause({ source: {} })] }).conclusion, "INFORMACOES_INSUFICIENTES");
  // cláusula específica de OUTRO evento não cobre este
  assert.equal(I.assessCoverage({ ...base, clauses: [clause({ appliesTo: ["ATRASO"] })] }).conclusion, "INFORMACOES_INSUFICIENTES");
  // exclusão com fonte continua prevalecendo
  assert.equal(I.assessCoverage({ ...base, clauses: [clause(), clause({ id: "x", kind: "EXCLUSAO", title: "Excl", identifier: null })] }).conclusion, "NAO_COBERTO");
  // genérica + específica: a específica vale
  assert.equal(I.assessCoverage({ ...base, clauses: [clause({ id: "g", kind: "CLAUSULA", identifier: null }), clause()] }).conclusion, "POTENCIALMENTE_COBERTO");
  // RC cruzada: sem checklist RCC pronto, nunca passa de INFORMACOES_INSUFICIENTES
  const rc = { ...base, modality: "RC_CRUZADA", claimKind: "RC_CRUZADA", clauses: [clause({ appliesTo: ["RC_CRUZADA"] })] };
  for (const rccReady of [undefined, null, false]) {
    const r = I.assessCoverage({ ...rc, rccReady });
    assert.equal(r.conclusion, "INFORMACOES_INSUFICIENTES");
    assert.ok(r.reasons.some((x) => x.code === "RCC_INCOMPLETO"));
    assert.ok(r.missing.includes("CHECKLIST_RCC_COMPLETO"));
  }
  assert.equal(I.assessCoverage({ ...rc, rccReady: true }).conclusion, "POTENCIALMENTE_COBERTO");
  assert.equal(I.assessCoverage({ ...base, clauses: [clause()], rccReady: false }).conclusion, "POTENCIALMENTE_COBERTO", "RCC só é exigido para RC cruzada");
});

check("CASO F4-B-10) checklist RCC: pronto só com as 10 perguntas COM FONTE e a natureza do bem definida (indefinido não conta)", () => {
  const src = { ref: "apólice cl.5" };
  const answers = {};
  for (const q of I.RCC_QUESTIONS) answers[q.key] = { answer: `resposta ${q.key}`, source: src };
  answers.BENS_TERCEIROS_X_PROPRIA_OBRA.propertyScope = "BENS_TERCEIROS";
  const ready = I.evaluateRccChecklist(answers);
  assert.equal(ready.readyForCoverageAssessment, true);
  assert.deepEqual(ready.missingKeys, []);
  assert.equal(ready.scopeUndefined, false);
  for (const scope of ["INDEFINIDO", null, undefined]) {
    const r = I.evaluateRccChecklist({ ...answers, BENS_TERCEIROS_X_PROPRIA_OBRA: { answer: "x", source: src, propertyScope: scope } });
    assert.equal(r.readyForCoverageAssessment, false, String(scope));
    assert.equal(r.scopeUndefined, true);
  }
  assert.equal(I.evaluateRccChecklist({ ...answers, BENS_TERCEIROS_X_PROPRIA_OBRA: { ...answers.BENS_TERCEIROS_X_PROPRIA_OBRA, propertyScope: "PROPRIA_OBRA" } }).readyForCoverageAssessment, true);
  const semFonte = I.evaluateRccChecklist({ ...answers, CAUSADOR: { answer: "alguém", source: null } });
  assert.equal(semFonte.readyForCoverageAssessment, false);
  assert.deepEqual(semFonte.missingKeys, ["CAUSADOR"]);
  assert.equal(I.evaluateRccChecklist({}).missingKeys.length, 10);
});

check("CASO F4-B-11) identificação de partes: documento fiscal inválido, parte identificada sem documento e duplicidade por documento/nome normalizado viram achados de FATO", () => {
  const P = (role, name, taxId, st = "IDENTIFICADO") => ({ role, name, taxId, identificationStatus: st });
  const codes = (parties) => I.auditPolicySubjects(parties).findings.map((f) => f.code);
  const okParties = [P("SEGURADO", "Construtora Alfa", "11.222.333/0001-81"), P("TOMADOR", "Alfa", null), P("SEGURADORA", "Seg", null), P("BENEFICIARIO", "Beta", "12.345.678/0001-95")];
  assert.ok(!codes(okParties).some((c) => ["DOCUMENTO_FISCAL_INVALIDO", "PARTE_SEM_DOCUMENTO_FISCAL", "PARTE_DUPLICADA"].includes(c)));
  assert.ok(codes([...okParties, P("TOMADOR", "Alfa", "11.111.111/0001-11")]).includes("DOCUMENTO_FISCAL_INVALIDO"));
  assert.ok(codes([P("SEGURADO", "Construtora Alfa", null), ...okParties.slice(1)]).includes("PARTE_SEM_DOCUMENTO_FISCAL"));
  assert.ok(!codes([P("TOMADOR", "Alfa", null), P("SEGURADO", "Alfa", "11222333000181"), P("SEGURADORA", "S", null), P("PROPRIETARIO_FINAL", "Dono", "NAO", "NAO_IDENTIFICADO")]).includes("PARTE_SEM_DOCUMENTO_FISCAL"), "NAO_IDENTIFICADO é estado explícito");
  assert.ok(codes([...okParties, P("SEGURADO", "OUTRO NOME", "11222333000181")]).includes("PARTE_DUPLICADA"), "mesmo documento, nome diferente");
  assert.ok(codes([...okParties, P("TOMADOR", "ALFA", null)]).includes("PARTE_DUPLICADA"), "mesmo nome normalizado sem documento");
  assert.ok(!codes([...okParties, P("SEGURADO", "Construtora Alfa", "11.222.333/0001-81", "NAO_IDENTIFICADO")]).includes("PARTE_DUPLICADA"), "parte não identificada não conta como duplicada");
  assert.ok(I.auditPolicySubjects(okParties).findings.every((f) => f.epistemic !== undefined));
});

/* ------------------------------------------------------------------ estáticos: migrations, RLS, append-only, privilégios, rollback, inventário ------------------------------------------------------------------ */
const MIGS = [
  "20261125100000_warranty_acceptance_proof",
  "20261125200000_insurance_coherence",
  "20261125201000_insurance_subjects_rcc_clause_id",
  "20261125202000_insurance_sources_and_grounds",
  "20261125203000_insurance_advances_consolidated",
];
check("CASO F4-B-12) migrations: RLS por projeto e append-only nas tabelas novas, sem GRANT a anon/PUBLIC, funções definer com search_path vazio, rollback e inventário", () => {
  const inv = read("docs/implantacao/01-inventario-migrations.md");
  const rb = read("docs/implantacao/03-rollback-validacao.md");
  for (const m of MIGS) {
    const sql = read(`supabase/migrations/${m}.sql`);
    assert.ok(existsSync(path.join(root, `supabase/rollbacks/${m}.rollback.sql`)), `${m}: rollback`);
    assert.ok(inv.includes(`| ${m} |`), `${m}: inventário`);
    assert.ok(rb.includes(m), `${m}: rollback/validação documentados`);
    assert.ok(!/grant\s+[^;]*\bto\s+[^;]*\banon\b/i.test(sql), `${m}: sem grant a anon`);
    assert.ok(!/grant\s+(insert|update|delete|all)[^;]*\bto\s+authenticated/i.test(sql), `${m}: sem escrita direta para authenticated`);
    // toda função definer tem search_path vazio
    for (const fn of sql.split(/create or replace function /i).slice(1)) {
      const head = fn.slice(0, fn.indexOf("as $$"));
      if (/security definer/i.test(head)) assert.ok(/set search_path = ''/i.test(head), `${m}: ${head.slice(0, 60).trim()} sem search_path vazio`);
    }
  }
  const tables = { "20261125100000_warranty_acceptance_proof": ["quality_warranty_acceptances"], "20261125200000_insurance_coherence": ["insurance_instrument_terms", "insurance_coherence_justifications"], "20261125202000_insurance_sources_and_grounds": ["insurance_guarantee_updates"] };
  for (const [m, list] of Object.entries(tables)) {
    const sql = read(`supabase/migrations/${m}.sql`);
    for (const t of list) {
      assert.ok(new RegExp(`create table if not exists public\\.${t}\\b`).test(sql), `${t} criada`);
      assert.ok(/enable row level security/.test(sql) && (sql.includes(`'${t}'`) || sql.includes(`on public.${t}`)), `${t}: RLS`);
      assert.ok(sql.includes("f4b_block_mutation") && (sql.includes(`'${t}'`) || sql.includes(`on public.${t}`)), `${t}: append-only`);
    }
  }
  // as RPCs de escrita são o único caminho: revogam de public/anon e concedem só a authenticated
  const coh = read("supabase/migrations/20261125200000_insurance_coherence.sql");
  assert.ok(/revoke all on function public\.%s from public, anon/.test(coh) && /to authenticated/.test(coh));
  // portão de coerência na aprovação (corpo vigente + portão)
  assert.ok(/insurance_int_coherence\(v_pol, d\.id\)/.test(coh) && /COHERENCE_BLOCKED/.test(coh) && /EXPRESS_CONFIRMATION_REQUIRED/.test(coh) && /DRAFT_HAS_PLACEHOLDERS/.test(coh), "aprovação mantém as guardas antigas e acrescenta a coerência");
  const grounds = read("supabase/migrations/20261125202000_insurance_sources_and_grounds.sql");
  for (const code of ["GROUNDS_REQUIRED", "GROUNDS_SOURCES_REQUIRED", "RCC_NOT_READY", "UPDATE_SOURCE_REQUIRED", "UPDATE_REASON_REQUIRED"]) assert.ok(grounds.includes(code), code);
  // autorização por etapa inalterada (Fase 3/B)
  assert.ok(/case when p_to_stage in \('DECISAO', 'NEGATIVA', 'CONTESTACAO', 'INDENIZACAO_CUMPRIMENTO', 'ENCERRADO'\) then 'MANAGE' else 'REGISTER' end/.test(grounds));
  const w = read("supabase/migrations/20261125100000_warranty_acceptance_proof.sql");
  assert.ok(/CUSTOMER_ACCEPTANCE_NOT_PROVEN/.test(w) && /MANIFESTANT_IS_INTERNAL/.test(w) && /SOURCE_HASH_REQUIRED/.test(w) && /ACCEPTANCE_PROOF_REQUIRED/.test(w));
  const code = MIGS.map((m) => read(`supabase/migrations/${m}.sql`).split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")).join("\n");
  assert.ok(!/record_risk_alert_action/.test(code), "não toca o hotfix P0 (fora de comentários)");
});

check("CASO F4-B-13) segurança da UI: nenhuma operação nova envia comunicação; níveis de autorização; Hover Text de todo campo/ação novo", () => {
  assert.ok(!OPS.ALL_INSURANCE_OPS.some((o) => /send|enviar|dispatch|mail/i.test(o.replace("draft_attempt_send", ""))));
  assert.equal(OPS.levelForOp("terms_save", { args: { sourceKind: "CONTRATO" } }), "MANAGE");
  assert.equal(OPS.levelForOp("terms_save", { args: { sourceKind: "APOLICE" } }), "MANAGE");
  assert.equal(OPS.levelForOp("terms_save", { args: { sourceKind: "MINUTA" } }), "REGISTER");
  assert.equal(OPS.levelForOp("coherence_justify"), "MANAGE");
  assert.equal(OPS.isOpAllowedForPermission("COLABORADOR", { projectId: "p", op: "coherence_justify" }), false);
  assert.equal(OPS.isOpAllowedForPermission("COLABORADOR", { projectId: "p", op: "terms_save", args: { sourceKind: "MINUTA" } }), true);
  assert.equal(OPS.isOpAllowedForPermission("COLABORADOR", { projectId: "p", op: "terms_save", args: { sourceKind: "CONTRATO" } }), false);
  assert.equal(OPS.isOpAllowedForPermission("LEITURA", { projectId: "p", op: "terms_save", args: { sourceKind: "MINUTA" } }), false);
  const P = "10000000-0000-4000-8000-000000000001";
  const call = OPS.buildRpcCall({ projectId: P, op: "terms_save", id: "10000000-0000-4000-8000-000000000002", args: { sourceKind: "MINUTA", draftId: "10000000-0000-4000-8000-000000000003" }, data: { insured_name: "X", source_ref: "r", lixo: "ignorado" } });
  assert.equal(call.rpc, "insurance_instrument_terms_save");
  assert.equal(call.params.p_data.lixo, undefined);
  assert.throws(() => OPS.buildRpcCall({ projectId: P, op: "terms_save", id: "10000000-0000-4000-8000-000000000002", args: { sourceKind: "OUTRO" }, data: {} }), OPS.InsuranceInputError);
  assert.throws(() => OPS.buildRpcCall({ projectId: P, op: "terms_save", id: "10000000-0000-4000-8000-000000000002", args: { sourceKind: "MINUTA" }, data: {} }), OPS.InsuranceInputError, "minuta exige o id da minuta");
  // catálogo de ajuda: todo helpId dos formulários existe
  const catalog = read("apps/web/lib/ui/help/modules/seguros-f4b.ts");
  for (const id of FORMS.allFormHelpIds().filter((x) => /^seguros\.(coerencia\.|acoes\.(termos|divergencia)|garantias\.campo-atualizacao|sinistros\.campo-fontes|apolices\.campo-clausula-identificacao)/.test(x))) assert.ok(catalog.includes(`"${id.replace(/^seguros\./, "")}"`), `helpId ${id} no catálogo`);
  const gar = read("apps/web/lib/ui/help/modules/garantias-aceite.ts");
  const panel = read("apps/web/components/garantias/records-panels.tsx");
  for (const m of panel.matchAll(/helpId="(garantias\.detalhe\.aceite[a-z-]*)"/g)) assert.ok(gar.includes(`"${m[1]}"`) || ["garantias.ts", "qualidade-rpc.ts"].some((f) => read(`apps/web/lib/ui/help/modules/${f}`).includes(`"${m[1]}"`)), `helpId ${m[1]} no catálogo`);
  // alvos de toque >= 44 px nos campos do formulário do aceite comprovado
  assert.ok(/id="acp-hash"[\s\S]{0,200}FIELD_CLASS/.test(panel));
  const ui = read("apps/web/components/garantias/ui-bits.tsx");
  assert.ok(/min-h-11/.test(ui), "FIELD_CLASS com min-h-11");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
