// S1 — domínio PURO de seguros/garantias (apps/web/lib/insurance). Sem banco, rede ou IA.
// Casos nomeados CASO NN conforme o conjunto do programa (15-33 e 37-39 do escopo S1; 37-39 também em test-insurance-realpg.mjs).
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-insurance-domain.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const I = await import("../apps/web/lib/insurance/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));

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

const src = { ref: "apolice-sintetica p.3" };
const clause = (o) => ({ id: "c1", kind: "COBERTURA", title: "Cobertura sintética", identifier: "Cláusula 4.1", appliesTo: [], source: src, verified: true, ...o });
const pol = { coverageStart: "2026-01-01", coverageEnd: "2027-01-01" };
const base = { modality: "SEGURO_GARANTIA_EXECUTANTE", claimKind: "INADIMPLEMENTO", eventDate: "2026-06-01", policy: pol, clauses: [], endorsements: [] };

check("CASO 15 (Performance Bond por inadimplemento): cobertura nunca automática; com cláusula sourced e verificada = POTENCIALMENTE_COBERTO + revisão humana", () => {
  const r = I.assessCoverage({ ...base, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })] });
  assert.equal(r.conclusion, "POTENCIALMENTE_COBERTO");
  assert.equal(r.automatic, false);
  assert.equal(r.requiresHumanReview, true);
  assert.equal(r.epistemic, "INFERENCIA");
  assert.ok(r.evidence.length === 1);
});

check("CASO 16 (Performance Bond por atraso): cláusula só de inadimplemento NÃO cobre atraso; sem cláusula de atraso => INFORMACOES_INSUFICIENTES; com cláusula + franquia => CONDICIONADO", () => {
  const onlyInad = I.assessCoverage({ ...base, claimKind: "ATRASO", clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })] });
  assert.equal(onlyInad.conclusion, "INFORMACOES_INSUFICIENTES");
  const cond = I.assessCoverage({
    ...base, claimKind: "ATRASO",
    clauses: [clause({ appliesTo: ["ATRASO"] }), clause({ id: "f1", kind: "FRANQUIA", title: "Franquia", appliesTo: ["ATRASO"] })],
  });
  assert.equal(cond.conclusion, "CONDICIONADO");
  assert.ok(cond.reasons.some((x) => x.code === "FRANQUIA_APLICAVEL"));
});

check("CASO 17 (adiantamento não amortizado): adiantado != saldo não amortizado != saldo devido != indenizável; limite garantido; amortização não excede o saldo", () => {
  const b = I.computeAdvanceBalance({ advancedAmount: 500000, amortizations: [100000, 50000.5], guaranteedLimit: 300000 });
  assert.equal(b.unamortized, 349999.5);
  assert.equal(b.guarantee, "INSUFICIENTE");
  assert.equal(b.uncoveredExcess, 49999.5);
  assert.equal(b.balanceDueInformed, null);
  assert.equal(b.indemnifiableInformed, null);
  assert.equal(I.computeAdvanceBalance({ advancedAmount: 100, amortizations: [] }).guarantee, "SEM_DADOS");
  assert.equal(I.computeAdvanceBalance({ advancedAmount: 100, amortizations: [100] }).guarantee, "SUFICIENTE");
  assert.equal(I.canAmortize({ advancedAmount: 100, amortizations: [60] }, 41), false);
  assert.equal(I.canAmortize({ advancedAmount: 100, amortizations: [60] }, 40), true);
});

check("CASO 18 (fiança bancária): fluxo do BANCO separado do da seguradora; sem procedimento SUSEP e sem primeira demanda presumidos; SEM DADOS quando o instrumento não informa", () => {
  const f = I.claimFlowFor("FIANCA_BANCARIA");
  const s = I.claimFlowFor("SEGURO");
  assert.equal(f.counterpart, "BANCO");
  assert.equal(s.counterpart, "SEGURADORA");
  assert.deepEqual(f.assumptions, { susepProcedurePresumed: false, firstDemandPresumed: false, legalDeadlinePresumed: false });
  assert.ok(f.mustReadInstrumentFirst);
  assert.ok(!f.steps.join(" ").toLowerCase().includes("regulação"));
  assert.ok(f.notes.join(" ").includes("NÃO é seguro"));
  assert.equal(I.claimFlowFor("CAUCAO").counterpart, "EMISSOR");
  assert.equal(I.claimFlowFor("CARTA_FIANCA_NAO_BANCARIA").counterpart, "EMISSOR");
  assert.deepEqual(I.bankGuaranteeExecutionStatus({ callsOnFirstDemand: null }), { firstDemand: "SEM_DADOS", procedure: "SEM_DADOS" });
  assert.equal(I.bankGuaranteeExecutionStatus({ callsOnFirstDemand: true, claimProcedureNote: "cl. 5" }).firstDemand, "SIM_CONFORME_INSTRUMENTO");
});

check("CASO 19 (RCC entre subcontratadas): checklist com as 10 perguntas; só pronto para avaliação com as 10 respondidas COM fonte; não presume subcontratadas como terceiros", () => {
  assert.equal(I.RCC_QUESTIONS.length, 10);
  assert.deepEqual(I.RCC_QUESTIONS.map((q) => q.key), ["CAUSADOR", "VITIMA", "ABRANGENCIA_SEGURADOS", "OBJETO", "BENS_TERCEIROS_X_PROPRIA_OBRA", "EXCLUSOES", "SUBLIMITES", "FRANQUIAS", "ENDOSSOS", "AVISO"]);
  const empty = I.evaluateRccChecklist({});
  assert.equal(empty.readyForCoverageAssessment, false);
  assert.ok(empty.items.every((i) => i.status === "SEM_DADOS"));
  const full = Object.fromEntries(I.RCC_QUESTIONS.map((q) => [q.key, { answer: "resposta", source: src, propertyScope: "BENS_TERCEIROS" }]));
  assert.equal(I.evaluateRccChecklist(full).readyForCoverageAssessment, true);
  const semFonte = I.evaluateRccChecklist({ ...full, CAUSADOR: { answer: "Sub A" } });
  assert.equal(semFonte.readyForCoverageAssessment, false);
  assert.ok(semFonte.neverPresumed.some((x) => x.includes("terceiros entre si")));
});

check("CASO 20 (danos à própria obra): RC não presume cobertura; sem cláusula expressa = INFORMACOES_INSUFICIENTES; exclusão com fonte = NAO_COBERTO; RCC alerta propriaobra", () => {
  const semClausula = I.assessCoverage({ ...base, modality: "RC_CRUZADA", claimKind: "DANO_PROPRIA_OBRA", clauses: [clause({ appliesTo: ["RC_CRUZADA"] })] });
  assert.equal(semClausula.conclusion, "INFORMACOES_INSUFICIENTES");
  assert.ok(semClausula.reasons.some((r) => r.code === "RC_SEM_PRESUNCAO"));
  const excl = I.assessCoverage({ ...base, modality: "RC_GERAL", claimKind: "DANO_PROPRIA_OBRA", clauses: [clause({ id: "x1", kind: "EXCLUSAO", title: "Danos à obra do segurado", appliesTo: ["DANO_PROPRIA_OBRA"] })] });
  assert.equal(excl.conclusion, "NAO_COBERTO");
  const rcc = I.evaluateRccChecklist({ BENS_TERCEIROS_X_PROPRIA_OBRA: { answer: "a obra", source: src, propertyScope: "PROPRIA_OBRA" } });
  assert.ok(rcc.warnings.some((w) => w.includes("própria obra")));
  assert.ok(rcc.neverPresumed.some((x) => x.includes("danos à própria obra")));
});

check("CASO 21 (segurado incorreto): segurado diferente do esperado pelo contrato vira achado de INFERENCIA; igual por CNPJ ou nome normalizado não gera achado", () => {
  const parties = [{ role: "SEGURADO", name: "Empresa Errada Ltda", taxId: "11.111.111/0001-11", identificationStatus: "IDENTIFICADO" }];
  const a = I.auditPolicySubjects(parties, { insured: { name: "Contratante Correta SA", taxId: "22.222.222/0001-22" } });
  const f = a.findings.find((x) => x.code === "SEGURADO_INCORRETO");
  assert.ok(f && f.epistemic === "INFERENCIA" && f.severity === "ALTA");
  assert.equal(a.requiresHumanReview, true);
  const ok = I.auditPolicySubjects(parties, { insured: { taxId: "11111111000111" } });
  assert.ok(!ok.findings.some((x) => x.code === "SEGURADO_INCORRETO"));
  const noInsured = I.auditPolicySubjects([], {});
  assert.ok(noInsured.findings.some((x) => x.code === "SEGURADO_AUSENTE"));
});

check("CASO 22 (beneficiário final não identificado): achado FATO; sem presumir que o beneficiário final deva ser segurado", () => {
  const a = I.auditPolicySubjects(
    [{ role: "SEGURADO", name: "Contratante", identificationStatus: "IDENTIFICADO" }, { role: "PROPRIETARIO_FINAL", identificationStatus: "NAO_IDENTIFICADO" }],
    { contractMentionsFinalBeneficiary: true },
  );
  const f = a.findings.find((x) => x.code === "BENEFICIARIO_FINAL_NAO_IDENTIFICADO");
  assert.ok(f && f.epistemic === "FATO");
  assert.ok(a.notes.join(" ").includes("Não se presume"));
  assert.ok(!a.findings.some((x) => /deve.*segurado/i.test(x.text)));
});

check("CASO 23 (endosso solicitado e pendente): solicitado/em análise NÃO ampliam cobertura; CONDICIONADO quando o argumento se apoia nele", () => {
  assert.equal(I.endorsementExtendsCoverage({ id: "e1", state: "SOLICITADO", coverageEffective: false }), false);
  assert.equal(I.endorsementExtendsCoverage({ id: "e1", state: "EM_ANALISE", coverageEffective: false }), false);
  assert.match(I.endorsementStatusLabel({ id: "e1", state: "SOLICITADO", coverageEffective: false }), /pedido não é endosso emitido/);
  const r = I.assessCoverage({ ...base, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })], endorsements: [{ id: "e1", state: "SOLICITADO", coverageEffective: false }], reliesOnEndorsementIds: ["e1"] });
  assert.equal(r.conclusion, "CONDICIONADO");
  assert.ok(r.reasons.some((x) => x.code === "ENDOSSO_SEM_EFEITO"));
});

check("CASO 24 (endosso emitido): EMITIDO ainda sem efeito; só CONFERIDO com documento emitido amplia; transições monotônicas; comparação solicitado x emitido", () => {
  assert.equal(I.endorsementExtendsCoverage({ id: "e", state: "EMITIDO", coverageEffective: false, issuedDocumentId: "d" }), false);
  assert.equal(I.endorsementExtendsCoverage({ id: "e", state: "CONFERIDO", coverageEffective: true, issuedDocumentId: null }), false);
  assert.equal(I.endorsementExtendsCoverage({ id: "e", state: "CONFERIDO", coverageEffective: true, issuedDocumentId: "d" }), true);
  assert.equal(I.canTransitionEndorsement("SOLICITADO", "CONFERIDO"), false);
  assert.equal(I.canTransitionEndorsement("EMITIDO", "CONFERIDO"), true);
  assert.equal(I.canTransitionEndorsement("CONFERIDO", "SOLICITADO"), false);
  const same = I.compareEndorsementTexts("Prorrogação  da vigência", "prorrogação da vigência");
  assert.equal(same.textsMatch, true);
  const diff = I.compareEndorsementTexts("Inclusão do beneficiário Alfa", "Inclusão do beneficiário Alfa exceto danos à própria obra");
  assert.equal(diff.textsMatch, false);
  assert.deepEqual(diff.onlyRequested, []);
  assert.ok(diff.onlyIssued.includes("exceto") && diff.onlyIssued.includes("própria"));
  const ok = I.assessCoverage({ ...base, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })], endorsements: [{ id: "e1", state: "CONFERIDO", coverageEffective: true, issuedDocumentId: "d" }], reliesOnEndorsementIds: ["e1"] });
  assert.equal(ok.conclusion, "POTENCIALMENTE_COBERTO");
});

check("CASO 25 (aviso de sinistro) e 26 (expectativa): expectativa só com base contratual da própria apólice; prazo de aviso só de dado cadastrado (SEM_DADOS caso contrário)", () => {
  assert.deepEqual(I.canOpenExpectation({}), { ok: false, reason: "EXPECTATIVA_BASIS_REQUIRED" });
  assert.deepEqual(I.canOpenExpectation({ note: "curta" }), { ok: false, reason: "EXPECTATIVA_BASIS_REQUIRED" });
  assert.equal(I.canOpenExpectation({ note: "Cláusula 7 prevê comunicação prévia" }).ok, true);
  assert.equal(I.canOpenExpectation({ clauseId: "c", clausePolicyId: "p1", policyId: "p2" }).reason, "EXPECTATIVA_BASIS_MISMATCH");
  assert.equal(I.canOpenExpectation({ clauseId: "c", clausePolicyId: "p1", policyId: "p1" }).ok, true);
  const now = new Date("2026-11-20T12:00:00Z");
  assert.equal(I.evaluateNoticeDeadline(null, null, now).status, "SEM_DADOS");
  assert.equal(I.evaluateNoticeDeadline("2026-11-10T00:00:00Z", "cl. 7", now).status, "VENCIDO");
  assert.equal(I.evaluateNoticeDeadline("2026-12-10T00:00:00Z", "cl. 7", now).status, "NO_PRAZO");
  const venc = I.assessCoverage({ ...base, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })], noticeDeadline: { status: "VENCIDO", daysRemaining: -3, basis: "cl. 7" } });
  assert.equal(venc.conclusion, "CONDICIONADO");
  assert.ok(venc.reasons.some((x) => x.code === "PRAZO_DE_AVISO_VENCIDO"));
});

check("CASO 27 (regulação) e 28 (negativa de cobertura): máquina de estados do sinistro — negativa não vira pagamento; contestação possível; encerrado terminal", () => {
  assert.equal(I.canTransitionClaim("AVISO", "REGULACAO"), true);
  assert.equal(I.canTransitionClaim("REGULACAO", "DECISAO"), true);
  assert.equal(I.canTransitionClaim("NEGATIVA", "INDENIZACAO_CUMPRIMENTO"), false);
  assert.equal(I.canTransitionClaim("NEGATIVA", "CONTESTACAO"), true);
  assert.equal(I.canTransitionClaim("CONTESTACAO", "REGULACAO"), true);
  assert.equal(I.canTransitionClaim("EXPECTATIVA", "REGULACAO"), false);
  assert.deepEqual(I.nextClaimStages("ENCERRADO"), []);
  for (const s of I.CLAIM_STAGES) assert.ok(Array.isArray(I.nextClaimStages(s)));
});

check("CASO 29 (apólice ausente): INFORMACOES_INSUFICIENTES sem afirmar cobertura nem ausência dela", () => {
  const r = I.assessCoverage({ ...base, policy: null, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })] });
  assert.equal(r.conclusion, "INFORMACOES_INSUFICIENTES");
  assert.ok(r.missing.includes("APOLICE"));
  assert.ok(r.recommendations.some((x) => /não afirmar cobertura/i.test(x)));
});

check("CASO 30 (seguradora indisponível): sem canal oficial cadastrado a minuta segue DRAFT e o envio é bloqueado por NO_OFFICIAL_CHANNEL; endereço nunca inventado", () => {
  const d = I.buildDraft("AVISO_SINISTRO", { sources: [] });
  assert.equal(d.state, "DRAFT");
  assert.ok(d.placeholders.length > 0);
  assert.doesNotMatch(d.body, /@|https?:\/\//, "minuta não inventa e-mail nem URL");
  const r = I.evaluateSendAttempt({ flagEnabled: false, draftState: "DRAFT", approvedBodyHash: null, bodyHash: "h", channel: null });
  assert.ok(r.reasons.includes("NO_OFFICIAL_CHANNEL") && r.sent === false);
});

check("CASO 32 (tentativa de envio real bloqueada): bloqueada em TODAS as combinações (flag ligada, aprovada, canal verificado); flag só liga com 'true'; helpers lançam RealSendBlockedError", async () => {
  for (const flag of [false, true]) for (const state of ["DRAFT", "APROVADA_PARA_ENVIO", "CANCELADA"]) for (const chan of [null, { registered: true, active: true, verified: true }]) {
    const r = I.evaluateSendAttempt({ flagEnabled: flag, draftState: state, approvedBodyHash: "h", bodyHash: "h", channel: chan });
    assert.equal(r.sent, false);
    assert.equal(r.blocked, true);
    assert.ok(r.reasons.includes("PHASE1_NO_SEND_TRANSPORT"));
  }
  const all = I.evaluateSendAttempt({ flagEnabled: true, draftState: "APROVADA_PARA_ENVIO", approvedBodyHash: "h", bodyHash: "h", channel: { registered: true, active: true, verified: true } });
  assert.deepEqual(all.reasons, ["PHASE1_NO_SEND_TRANSPORT"]);
  assert.ok(I.evaluateSendAttempt({ flagEnabled: true, draftState: "APROVADA_PARA_ENVIO", approvedBodyHash: "old", bodyHash: "h", channel: null }).reasons.includes("APPROVAL_STALE"));
  assert.equal(I.isRealSendFlagOn({}), false);
  assert.equal(I.isRealSendFlagOn({ ACC_INSURANCE_REAL_SEND_ENABLED: "1" }), false);
  assert.equal(I.isRealSendFlagOn({ ACC_INSURANCE_REAL_SEND_ENABLED: "TRUE" }), false);
  assert.equal(I.isRealSendFlagOn({ ACC_INSURANCE_REAL_SEND_ENABLED: "true" }), true);
  assert.equal(I.INSURANCE_REAL_SEND_TRANSPORT_AVAILABLE, false);
  assert.throws(() => I.assertRealSendAllowed(), I.RealSendBlockedError);
  let called = false;
  await assert.rejects(() => I.guardedSend(async () => { called = true; }), I.RealSendBlockedError);
  assert.equal(called, false, "o emissor nunca é chamado");
});

check("CASO 33 (dados insuficientes): sem vigência/data do evento/cláusula => INFORMACOES_INSUFICIENTES; cláusula sem fonte é desconsiderada; minuta com lacunas usa [PREENCHER]", () => {
  assert.equal(I.assessCoverage({ ...base, policy: { coverageStart: null, coverageEnd: null }, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })] }).conclusion, "INFORMACOES_INSUFICIENTES");
  assert.equal(I.assessCoverage({ ...base, eventDate: null, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })] }).conclusion, "INFORMACOES_INSUFICIENTES");
  const semFonte = I.assessCoverage({ ...base, clauses: [clause({ appliesTo: ["INADIMPLEMENTO"], source: {} })] });
  assert.equal(semFonte.conclusion, "INFORMACOES_INSUFICIENTES");
  assert.ok(semFonte.reasons.some((r) => r.code === "CLAUSULA_SEM_FONTE"));
  const fora = I.assessCoverage({ ...base, eventDate: "2028-01-01", clauses: [clause({ appliesTo: ["INADIMPLEMENTO"] })] });
  assert.equal(fora.conclusion, "CONDICIONADO");
  const d = I.buildDraft("RECLAMACAO", { sources: ["doc-1"] });
  assert.match(d.body, /\[PREENCHER descrição do evento\]/);
  assert.equal(I.evaluateRccChecklist({}).answeredWithSource, 0);
});

check("DOSSIÊ: checklist por modalidade (9 modalidades), sem duplicar chaves; progresso exige itens obrigatórios", () => {
  for (const m of I.POLICY_MODALITIES) {
    const items = I.buildDossierChecklist(m);
    assert.ok(items.length >= 7, m);
    assert.equal(new Set(items.map((i) => i.key)).size, items.length, m);
    assert.ok(items.every((i) => i.basis === "ROTEIRO_OPERACIONAL_CONFERIR_NA_APOLICE"));
  }
  assert.ok(I.buildDossierChecklist("ADIANTAMENTO_PAGAMENTO").some((i) => i.key === "aplicacao_documentada"));
  assert.ok(I.buildDossierChecklist("RC_CRUZADA").some((i) => i.key === "checklist_rcc"));
  assert.equal(I.dossierProgress([{ key: "a", required: true, status: "PENDENTE" }]).complete, false);
  assert.equal(I.dossierProgress([{ key: "a", required: true, status: "ANEXADO" }]).complete, true);
});

check("MINUTAS: 5 tipos, sempre DRAFT, basis separa fato/inferência/recomendação, sem endereço inventado", () => {
  for (const k of ["AVISO_SINISTRO", "EXPECTATIVA_SINISTRO", "RECLAMACAO", "ENDOSSO", "COBRANCA_FIANCA"]) {
    const d = I.buildDraft(k, { policyOrGuaranteeNumber: "X-1", eventDescription: "evento", eventDate: "2026-01-01", endorsementRequestedText: "texto", sources: ["doc-1"] });
    assert.equal(d.state, "DRAFT");
    assert.deepEqual(Object.keys(d.basis).sort(), ["facts", "inferences", "recommendations"]);
    assert.equal(d.placeholders.length, 0);
    assert.match(d.internalNote, /NÃO ENVIADA/);
  }
});

check("REFERÊNCIAS: Lei 15.040/2024, Código Civil, CDC, SUSEP/CNSP, Circular 662/2022 e Manual do Proprietário registrados com status, fonte e limitações", () => {
  const ids = I.INSURANCE_REFERENCES.map((r) => r.id);
  for (const id of ["LEI_15040_2024", "CODIGO_CIVIL_2002", "CDC_8078_1990", "SUSEP_CNSP_GERAL", "CIRCULAR_SUSEP_662_2022", "MANUAL_PROPRIETARIO_3ED_2013"]) assert.ok(ids.includes(id), id);
  assert.ok(I.INSURANCE_REFERENCES.every((r) => r.limitations.length > 0 && r.source && r.checkedAt));
  assert.equal(I.INSURANCE_REFERENCES.find((r) => r.id === "CIRCULAR_SUSEP_662_2022").status, "CONFIRMADO_FONTE_SECUNDARIA");
  assert.equal(I.INSURANCE_REFERENCES.find((r) => r.id === "CDC_8078_1990").status, "NAO_VERIFICADO_NESTA_RODADA");
  assert.ok(I.INSURANCE_REFERENCES.find((r) => r.id === "MANUAL_PROPRIETARIO_3ED_2013").limitations.join(" ").includes("galpões"));
});

check("CASO 37/38/39 (estático): migrations do S1 — RLS em toda tabela, RPCs com FOR UPDATE/VERSION_CONFLICT/auditoria, sem estado 'enviada', sem grant a anon", () => {
  const dir = path.join(here, "..", "supabase", "migrations");
  const mine = readdirSync(dir).filter((f) => /^20261122(20\d{4})_/.test(f));
  assert.equal(mine.length, 2);
  const model = readFileSync(path.join(dir, mine.find((f) => f.includes("model"))), "utf8");
  const rpcs = readFileSync(path.join(dir, mine.find((f) => f.includes("rpcs"))), "utf8");
  assert.ok(/enable row level security/.test(model));
  assert.ok(!/'ENVIADA'|'ENVIADO'|'SENT'/.test(model + rpcs.replace(/--.*$/gm, "")), "nenhum estado de envio");
  assert.ok(/real_send_enabled boolean not null default false/.test(model));
  assert.ok(/VERSION_CONFLICT/.test(rpcs) && /for update/.test(rpcs));
  assert.ok(/insurance_int_audit/.test(rpcs));
  assert.ok(!/to anon/i.test(model + rpcs));
  const secdef = rpcs.match(/security definer\s+set search_path = ''/g) ?? [];
  assert.ok(secdef.length >= 25, `security definer com search_path fixo: ${secdef.length}`);
  // as migrations existentes e o hotfix P0 seguem intocados: só arquivos novos com prefixo 2026112220
  assert.ok(mine.every((f) => f > "20261122200000" || f === "20261122200000_seguros_garantias_model.sql"));
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
