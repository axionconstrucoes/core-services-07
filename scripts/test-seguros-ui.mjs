// U2 (fase 2) — UI do módulo SEGUROS: modelos de visão, formulários, allowlist de RPC, carregador, permissões, envio real inexistente e
// contrato estático das telas. Sem banco, rede, navegador ou IA. Casos nomeados CASO NN (15-33, 37, 38, 39 do escopo U2).
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-seguros-ui.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const web = path.join(root, "apps/web");
const U = (p) => import(`../apps/web/lib/insurance-ui/${p}.ts`);
const M = await U("model");
const F = await U("forms");
const OPS = await U("rpc-ops");
const ERR = await U("errors");
const PERM = await U("permissions");
const FMT = await U("format");
const DATA = await U("data");
const TABS = await U("tabs");
const LAB = await U("labels");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const I = await import("../apps/web/lib/insurance/index.ts");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------ fixtures ------------------------------------------------------------------ */
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-11-20T12:00:00Z");
const TODAY = "2026-11-20";

const policy = (o = {}) => ({ id: id(1), project_id: P1, modality: "SEGURO_GARANTIA_EXECUTANTE", policy_number: "AP-1", insurer_name: "Seguradora Sintética", broker_name: null, contract_document_id: null, contract_number: "CT-9", source_document_id: id(900), source_ref: null, status: "VIGENTE", coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000, currency: "BRL", notes: null, version_no: 1, row_version: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", ...o });
const clause = (o = {}) => ({ id: id(10), project_id: P1, policy_id: id(1), kind: "COBERTURA", title: "Cobertura sintética", clause_text: null, amount: null, deadline_days: null, applies_to: ["INADIMPLEMENTO"], source_document_id: id(900), source_ref: null, source_page: "3", verified: true, added_in_version: 1, ...o });
const claim = (o = {}) => ({ id: id(20), project_id: P1, policy_id: id(1), bank_guarantee_id: null, other_guarantee_id: null, advance_id: null, claim_kind: "INADIMPLEMENTO", title: "Evento sintético", stage: "AVISO", protocol: null, occurrence_date: "2026-06-01", claimed_amount: null, notice_deadline_at: null, notice_deadline_basis: null, contractual_basis_clause_id: null, contractual_basis_note: null, no_instrument_reason: null, decision_outcome: null, source_document_id: id(900), source_ref: null, row_version: 1, created_at: "2026-06-02T00:00:00Z", ...o });
const channel = (o = {}) => ({ id: id(30), project_id: P1, policy_id: id(1), bank_guarantee_id: null, entity_name: "Seguradora Sintética", channel_type: "EMAIL", channel_value: "sinistros@exemplo.invalid", source_document_id: id(900), source_ref: null, active: true, verified_at: "2026-02-01T00:00:00Z", verified_by: null, ...o });
const bank = (o = {}) => ({ id: id(40), project_id: P1, bank_name: "Banco Sintético", guarantee_number: "FB-1", beneficiary_name: null, principal_name: null, amount: 500000, currency: "BRL", start_date: "2026-01-01", end_date: "2027-01-01", calls_on_first_demand: null, claim_procedure_note: null, contract_document_id: null, contract_number: null, source_document_id: id(900), source_ref: null, status: "VIGENTE", notes: null, row_version: 1, ...o });
const endorsement = (o = {}) => ({ id: id(50), project_id: P1, policy_id: id(1), endorsement_seq: 1, state: "SOLICITADO", requested_text: "Incluir o proprietário final como segurado adicional", requested_at: "2026-03-01T00:00:00Z", request_document_id: null, request_ref: "e-mail 01/03", issued_text: null, issued_at: null, issued_document_id: null, issued_number: null, texts_match: null, comparison: null, divergence_note: null, verified_at: null, coverage_effective: false, refusal_note: null, row_version: 1, ...o });
const advance = (o = {}) => ({ id: id(60), project_id: P1, policy_id: id(1), contract_document_id: null, contract_number: null, advanced_amount: 100000, advance_date: "2026-02-01", purpose: "Mobilização", application_documented: false, application_document_id: null, guaranteed_limit: 50000, balance_due_informed: null, indemnifiable_informed: null, source_document_id: id(900), source_ref: null, notes: null, row_version: 1, ...o });
const amort = (n, amount) => ({ id: id(70 + n), project_id: P1, advance_id: id(60), amount, amortized_on: "2026-03-01", source_document_id: id(900), source_ref: null, note: null });
const party = (role, o = {}) => ({ id: id(80 + Math.floor(Math.random() * 1e6)), project_id: P1, policy_id: id(1), party_role: role, party_name: "Parte Sintética", tax_id: null, identification_status: "IDENTIFICADO", source_document_id: id(900), source_ref: null, active: true, added_in_version: 1, ...o });
const ws = (o = {}) => ({ ...DATA.emptyWorkspace(P1), documents: [{ id: id(900), title: "Documento sintético", kind: "APOLICE", latestVersionId: id(901) }], ...o });

/* -------------------------------------------------------------- casos 15 a 20 (sinistros) -------------------------------------------------------------- */
await check("CASO 15: Performance Bond por inadimplemento — fluxo da SEGURADORA, minuta DRAFT, cobertura é inferência com revisão humana", () => {
  const data = ws({ policies: [policy()], clauses: [clause()], channels: [channel()], claims: [claim()] });
  const plan = M.prepareAcionamento(data.claims[0], data, NOW);
  assert.equal(plan.flow.counterpart, "SEGURADORA");
  assert.equal(plan.draftKind, "AVISO_SINISTRO");
  assert.equal(plan.draft.state, "DRAFT");
  assert.equal(plan.coverage.assessment.conclusion, "POTENCIALMENTE_COBERTO");
  assert.equal(plan.coverage.assessment.automatic, false);
  assert.equal(plan.coverage.assessment.requiresHumanReview, true);
  assert.ok(plan.draft.basis.inferences.some((t) => t.includes("INFERÊNCIA")), "cobertura entra na minuta como inferência");
  assert.equal(plan.blockers.length, 0, "canal verificado: sem impedimentos");
});

await check("CASO 16: Performance Bond por atraso — cláusula só de inadimplemento NÃO cobre atraso (informações insuficientes)", () => {
  const data = ws({ policies: [policy()], clauses: [clause({ applies_to: ["INADIMPLEMENTO"] })], claims: [claim({ claim_kind: "ATRASO" })] });
  const cov = M.claimCoverageView(data.claims[0], data, NOW);
  assert.equal(cov.assessment.conclusion, "INFORMACOES_INSUFICIENTES");
});

await check("CASO 17: adiantamento não amortizado — saldo = adiantado - amortizado; garantia insuficiente; indenização NÃO é calculada", () => {
  const data = ws({ policies: [policy()], advances: [advance()], amortizations: [amort(1, 30000)] });
  const v = M.advanceView(data.advances[0], data.amortizations, data.policies);
  assert.equal(v.balance.unamortized, 70000);
  assert.equal(v.balance.guarantee, "INSUFICIENTE");
  assert.equal(v.balance.uncoveredExcess, 20000);
  assert.equal(v.balance.indemnifiableInformed, null, "valor indenizável nunca é derivado");
  assert.equal(v.balance.balanceDueInformed, null);
  const none = M.advanceView(advance({ guaranteed_limit: null, policy_id: null }), [], []);
  assert.equal(none.balance.guarantee, "SEM_DADOS", "sem limite nem apólice: SEM DADOS, não presumido");
  const errs = F.validateForm(F.FORMS.advanceAmortize, { amount: "10", source_ref: "" });
  assert.ok(errs.source_ref, "amortização exige fonte");
});

await check("CASO 18: fiança bancária — fluxo do BANCO, minuta de cobrança, sem avaliação de cobertura de apólice e sem presumir primeira demanda", () => {
  const data = ws({ bankGuarantees: [bank()], claims: [claim({ policy_id: null, bank_guarantee_id: id(40), claim_kind: "FIANCA_BANCARIA" })] });
  const plan = M.prepareAcionamento(data.claims[0], data, NOW);
  assert.equal(plan.flow.counterpart, "BANCO");
  assert.equal(plan.draftKind, "COBRANCA_FIANCA");
  assert.equal(plan.coverage.assessment, null);
  assert.ok(plan.coverage.notApplicableReason.includes("NÃO é seguro"));
  assert.equal(plan.flow.assumptions.firstDemandPresumed, false);
  assert.equal(plan.flow.assumptions.susepProcedurePresumed, false);
  assert.equal(I.bankGuaranteeExecutionStatus({ callsOnFirstDemand: bank().calls_on_first_demand }).firstDemand, "SEM_DADOS");
  assert.ok(plan.blockers.some((b) => b.includes("Nenhum canal oficial")), "sem canal cadastrado: impedimento explícito");
});

await check("CASO 19: RCC entre subcontratadas — checklist de 10 perguntas, resposta sem fonte não conta e nada é presumido", () => {
  assert.equal(I.RCC_QUESTIONS.length, 10);
  const r = I.evaluateRccChecklist({ CAUSADOR: { answer: "Subcontratada A" }, VITIMA: { answer: "Subcontratada B", source: { ref: "contrato B cl. 4" } } });
  assert.equal(r.answeredWithSource, 1);
  assert.equal(r.readyForCoverageAssessment, false);
  assert.ok(r.neverPresumed.some((t) => t.includes("Subcontratadas são terceiros entre si")));
  const src = read("apps/web/components/insurance/panel-support.tsx");
  assert.ok(src.includes("RCC_QUESTIONS.map") && src.includes("evaluateRccChecklist"), "a tela renderiza as 10 perguntas pelo domínio");
});

await check("CASO 20: danos à própria obra — RC não presume cobertura; sem cláusula expressa é informações insuficientes (RC_SEM_PRESUNCAO)", () => {
  const data = ws({ policies: [policy({ modality: "RC_GERAL" })], clauses: [], claims: [claim({ claim_kind: "DANO_PROPRIA_OBRA" })] });
  const a = M.claimCoverageView(data.claims[0], data, NOW).assessment;
  assert.equal(a.conclusion, "INFORMACOES_INSUFICIENTES");
  assert.ok(a.reasons.some((r) => r.code === "RC_SEM_PRESUNCAO"));
  const rcc = I.evaluateRccChecklist({ BENS_TERCEIROS_X_PROPRIA_OBRA: { answer: "própria obra", propertyScope: "PROPRIA_OBRA" } });
  assert.ok(rcc.warnings.some((w) => w.includes("NÃO presumir cobertura")));
});

/* ----------------------------------------------------------- casos 21 e 22 (sujeitos) ----------------------------------------------------------- */
await check("CASO 21: segurado incorreto — divergência do contrato vira INFERÊNCIA com sugestão de endosso de correção", () => {
  const pol = policy();
  const parties = [party("SEGURADO", { party_name: "Empresa Errada Ltda", tax_id: "11.111.111/0001-11" }), party("TOMADOR"), party("SEGURADORA")];
  const audit = M.subjectsAuditFor(pol, parties, { insuredName: "Empresa Certa SA", insuredTaxId: "22.222.222/0001-22" });
  const f = audit.findings.find((x) => x.code === "SEGURADO_INCORRETO");
  assert.ok(f);
  assert.equal(f.epistemic, "INFERENCIA");
  assert.ok(f.text.includes("endosso de correção"));
  assert.equal(audit.requiresHumanReview, true);
});

await check("CASO 22: beneficiário final não identificado — achado de FATO; desativar parte não a apaga", () => {
  const pol = policy();
  const parties = [party("SEGURADO"), party("TOMADOR"), party("SEGURADORA"), party("PROPRIETARIO_FINAL", { party_name: null, identification_status: "NAO_IDENTIFICADO" })];
  const audit = M.subjectsAuditFor(pol, parties, { mentionsFinal: true });
  const f = audit.findings.find((x) => x.code === "BENEFICIARIO_FINAL_NAO_IDENTIFICADO");
  assert.ok(f);
  assert.equal(f.epistemic, "FATO");
  assert.ok(audit.notes.some((n) => n.includes("Não se presume")));
  assert.equal(OPS.buildRpcCall({ projectId: P1, op: "party_set_active", id: id(81), expectedRowVersion: 3, args: { active: false, reason: "parte indevida" } }).rpc, "insurance_policy_party_set_active");
});

/* -------------------------------------------------------------- casos 23 a 24 (endossos) -------------------------------------------------------------- */
await check("CASO 23: endosso solicitado e pendente — sem efeito de cobertura; conta como pendente; aviso permanente na tela", () => {
  const e = endorsement();
  const v = M.endorsementView(e);
  assert.equal(v.extendsCoverage, false);
  assert.ok(v.statusText.includes("pedido não é endosso emitido"));
  assert.deepEqual(v.nextActions, ["EM_ANALISE", "EMITIDO", "RECUSADO"]);
  const k = M.overviewKpis(ws({ policies: [policy()], endorsements: [e] }), TODAY).find((x) => x.id === "endossos-pendentes");
  assert.equal(k.value, 1);
  assert.ok(read("apps/web/components/insurance/panel-instruments.tsx").includes("Pedido de endosso NÃO é endosso emitido."));
  assert.ok(read("apps/web/components/insurance/panel-instruments.tsx").includes('"seguros.endossos.aviso-pedido-nao-e-emitido"'));
});

await check("CASO 24: endosso emitido — EMITIDO ainda sem efeito; CONFERIDO com documento é efetivo; divergência exige nota; comparação textual é FATO", () => {
  const issued = endorsement({ state: "EMITIDO", issued_text: "Incluir o proprietário final como segurado adicional, exceto danos estéticos", issued_number: "E-7", issued_document_id: id(900), issued_at: "2026-03-10T00:00:00Z", texts_match: false });
  const v = M.endorsementView(issued);
  assert.equal(v.extendsCoverage, false);
  assert.deepEqual(v.nextActions, ["CONFERIDO"]);
  assert.equal(v.comparison.epistemic, "FATO");
  assert.ok(v.comparison.onlyIssued.includes("exceto"), "acréscimo restritivo ninguém pediu");
  assert.ok(F.validateEndorsementVerify({ divergence_note: "" }, false).divergence_note, "textos diferentes exigem nota");
  assert.ok(F.validateEndorsementVerify({ divergence_note: "Seguradora acrescentou exclusão de danos estéticos não solicitada" }, false).divergence_note === undefined);
  assert.deepEqual(F.validateEndorsementVerify({}, true), {});
  const done = endorsement({ ...issued, state: "CONFERIDO", coverage_effective: true, verified_at: "2026-03-12T00:00:00Z" });
  assert.equal(M.endorsementView(done).extendsCoverage, true);
  assert.equal(OPS.levelForOp("endorsement_advance", { args: { toState: "CONFERIDO" } }), "MANAGE");
  assert.equal(OPS.levelForOp("endorsement_advance", { args: { toState: "EM_ANALISE" } }), "REGISTER");
});

/* ------------------------------------------------------- casos 25 a 30 (comunicação e estágios) ------------------------------------------------------- */
await check("CASO 25: aviso de sinistro — minuta AVISO_SINISTRO em DRAFT com número da apólice, lacunas como [PREENCHER] e fonte", () => {
  const data = ws({ policies: [policy({ policy_number: null })], claims: [claim({ title: "Atraso de entrega", stage: "AVISO" })], channels: [channel()] });
  const plan = M.prepareAcionamento(data.claims[0], data, NOW);
  assert.equal(plan.draft.draftKind, "AVISO_SINISTRO");
  assert.ok(plan.draft.body.includes("[PREENCHER número da apólice/instrumento]"), "sem número de apólice a lacuna aparece");
  assert.ok(plan.draft.placeholders.length >= 1);
  assert.ok(plan.draft.basis.facts.some((f) => f.includes("Documento sintético")), "fonte documental rastreável na base");
  const call = OPS.buildRpcCall({ projectId: P1, op: "draft_create", data: { draft_kind: "AVISO_SINISTRO", claim_id: id(20), subject: "x", body: "y", generated_by_ai: true } });
  assert.equal(call.params.p_data.generated_by_ai, false, "a interface nunca marca minuta como gerada por IA");
});

await check("CASO 26: expectativa de sinistro — só com base contratual (cláusula da apólice ou nota); minuta EXPECTATIVA_SINISTRO", () => {
  const base = { stage: "EXPECTATIVA", instrument: `policy:${id(1)}`, contractual_basis_clause_id: "", contractual_basis_note: "" };
  assert.ok(F.validateClaimOpen(base).contractual_basis_note);
  assert.deepEqual(F.validateClaimOpen({ ...base, contractual_basis_note: "Cláusula 12 prevê comunicação prévia" }), {});
  assert.ok(F.validateClaimOpen({ ...base, instrument: "bank:x", contractual_basis_clause_id: id(10) }).contractual_basis_clause_id, "cláusula-base exige apólice");
  assert.deepEqual(I.canOpenExpectation({ note: "curto" }), { ok: false, reason: "EXPECTATIVA_BASIS_REQUIRED" });
  const data = ws({ policies: [policy()], claims: [claim({ stage: "EXPECTATIVA" })] });
  assert.equal(M.prepareAcionamento(data.claims[0], data, NOW).draftKind, "EXPECTATIVA_SINISTRO");
  assert.deepEqual(F.deriveClaimInstrument(`policy:${id(1)}`), { policy_id: id(1) });
  assert.deepEqual(F.deriveClaimInstrument("none"), {});
});

await check("CASO 27: regulação — próximos estágios vêm da máquina de estados do domínio e a RPC só aceita estágios válidos", () => {
  assert.deepEqual(M.claimNextStages(claim({ stage: "REGULACAO" })), ["DOC_COMPLEMENTAR", "DECISAO", "NEGATIVA", "ENCERRADO"]);
  assert.deepEqual(M.claimNextStages(claim({ stage: "ENCERRADO" })), []);
  const ok = OPS.buildRpcCall({ projectId: P1, op: "claim_advance", id: id(20), expectedRowVersion: 2, args: { toStage: "REGULACAO" }, data: { note: "Seguradora iniciou a regulação", protocol: "P-1" } });
  assert.equal(ok.rpc, "insurance_claim_advance");
  assert.equal(ok.params.p_to_stage, "REGULACAO");
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "claim_advance", id: id(20), expectedRowVersion: 2, args: { toStage: "PAGO" } }), OPS.InsuranceInputError);
});

await check("CASO 28: negativa de cobertura — exclusão com fonte gera NÃO COBERTO; avanço a NEGATIVA/CONTESTAÇÃO exige nota fundamentada", () => {
  const data = ws({ policies: [policy()], clauses: [clause({ id: id(11), kind: "EXCLUSAO", title: "Exclusão de atraso", applies_to: ["ATRASO"] })], claims: [claim({ claim_kind: "ATRASO", stage: "NEGATIVA" })] });
  assert.equal(M.claimCoverageView(data.claims[0], data, NOW).assessment.conclusion, "NAO_COBERTO");
  assert.ok(M.claimNextStages(data.claims[0]).includes("CONTESTACAO"));
  assert.equal(ERR.mapInsuranceError({ message: "NOTE_REQUIRED" }).code, "NOTE_REQUIRED");
  assert.ok(ERR.mapInsuranceError({ message: "DECISION_DOES_NOT_ALLOW_PAYMENT" }).message.includes("DEFERIDA"));
  assert.ok(read("supabase/migrations/20261122201000_seguros_garantias_rpcs.sql").includes("'NEGATIVA', 'CONTESTACAO', 'DOC_COMPLEMENTAR', 'ENCERRADO') and char_length(coalesce(v_note, '')) < 10"), "a nota obrigatória é regra do banco, espelhada na UI");
});

await check("CASO 29: apólice ausente — evento SEM INSTRUMENTO exige motivo, não tem fluxo nem minuta e a cobertura é informações insuficientes (APOLICE_AUSENTE)", () => {
  const c = claim({ policy_id: null, no_instrument_reason: "Apólice não localizada no arquivo do cliente" });
  const data = ws({ claims: [c] });
  const plan = M.prepareAcionamento(c, data, NOW);
  assert.equal(plan.instrument.kind, "SEM_INSTRUMENTO");
  assert.equal(plan.flow, null);
  assert.equal(plan.draft, null);
  assert.equal(plan.counterpartLabel, "SEM DADOS");
  assert.equal(plan.coverage.assessment.conclusion, "INFORMACOES_INSUFICIENTES");
  assert.ok(plan.coverage.assessment.reasons.some((r) => r.code === "APOLICE_AUSENTE"));
  assert.ok(F.validateClaimOpen({ stage: "AVISO", instrument: "none", no_instrument_reason: "" }).no_instrument_reason);
});

await check("CASO 30: seguradora indisponível — canal ausente, inativo ou não verificado mantém a minuta DRAFT com impedimento explícito", () => {
  assert.equal(M.channelAvailability(null), "SEM_CANAL");
  assert.equal(M.channelAvailability(channel({ active: false })), "INATIVO");
  assert.equal(M.channelAvailability(channel({ verified_at: null })), "NAO_VERIFICADO");
  assert.equal(M.channelAvailability(channel()), "DISPONIVEL");
  for (const ch of [channel({ active: false }), channel({ verified_at: null })]) {
    const data = ws({ policies: [policy()], clauses: [clause()], claims: [claim()], channels: [ch] });
    const plan = M.prepareAcionamento(data.claims[0], data, NOW);
    assert.equal(plan.draft.state, "DRAFT");
    assert.ok(plan.blockers.length >= 1);
    assert.notEqual(plan.channelState, "DISPONIVEL");
  }
  assert.equal(M.bestChannel([channel({ id: id(31), active: false }), channel({ id: id(32), verified_at: null }), channel({ id: id(33) })]).id, id(33));
});

/* ------------------------------------------------- caso 31 (autorização), 32 (envio real), 33 (dados insuficientes) ------------------------------------------------- */
await check("CASO 31: usuário sem autorização — espelho dos níveis idêntico ao SQL; LEITURA não executa nenhuma escrita; ADMIN só o Administrador", () => {
  const sql = read("supabase/migrations/20261122200000_seguros_garantias_model.sql");
  const block = sql.slice(sql.indexOf("create or replace function public.insurance_access"), sql.indexOf("comment on function public.insurance_access"));
  const parse = (lvl) => {
    const m = new RegExp(`when '${lvl}' then pm\\.permission in \\(([^)]*)\\)`).exec(block);
    return m ? [...m[1].matchAll(/'([A-Z]+)'/g)].map((x) => x[1]).sort() : null;
  };
  for (const lvl of ["REGISTER", "MANAGE", "ADMIN"]) assert.deepEqual([...PERM.INSURANCE_LEVEL_ROLES[lvl]].sort(), parse(lvl), `nível ${lvl} diverge do banco`);
  assert.ok(block.includes("when 'READ' then true"));
  for (const op of OPS.ALL_INSURANCE_OPS) {
    assert.equal(OPS.isOpAllowedForPermission("LEITURA", { projectId: P1, op, args: { toState: "EM_ANALISE" } }), false, `LEITURA não pode ${op}`);
    assert.equal(OPS.isOpAllowedForPermission(null, { projectId: P1, op }), false, `sem membership não pode ${op}`);
  }
  assert.equal(OPS.isOpAllowedForPermission("COLABORADOR", { projectId: P1, op: "policy_create" }), false);
  assert.equal(OPS.isOpAllowedForPermission("COLABORADOR", { projectId: P1, op: "claim_open" }), true);
  assert.equal(OPS.isOpAllowedForPermission("GERENTE", { projectId: P1, op: "draft_approve" }), false);
  assert.equal(OPS.isOpAllowedForPermission("ADMINISTRADOR", { projectId: P1, op: "draft_approve" }), true);
  assert.deepEqual(PERM.insuranceCapabilities("LEITURA"), { read: true, register: false, manage: false, admin: false });
  const action = read("apps/web/app/[projectId]/seguros/actions.ts");
  assert.ok(action.indexOf("isOpAllowedForPermission") < action.indexOf("supabase.rpc"), "a permissão é checada ANTES da RPC");
  assert.ok(ERR.mapInsuranceError({ message: "FORBIDDEN" }).message.includes("permissão"));
  const kit = read("apps/web/components/insurance/kit.tsx");
  assert.ok(kit.includes("Requer perfil:") && kit.includes("disabled={disabled}"), "botão desabilitado com explicação");
});

await check("CASO 32: tentativa de envio real bloqueada — nenhuma operação envia; botão Enviar existe só desabilitado; tentativa apenas audita o bloqueio", () => {
  assert.ok(!OPS.ALL_INSURANCE_OPS.some((o) => /send|enviar|dispatch|mail/i.test(o.replace("draft_attempt_send", ""))), "nenhuma operação de envio");
  const call = OPS.buildRpcCall({ projectId: P1, op: "draft_attempt_send", id: id(90) });
  assert.equal(call.rpc, "insurance_draft_attempt_send");
  assert.deepEqual(Object.keys(call.params), ["p_id"]);
  const rpcs = OPS.ALL_INSURANCE_OPS.map((op) => OPS.buildRpcCall({ projectId: P1, op, id: id(1), expectedRowVersion: 1, args: { toState: "EMITIDO", toStage: "AVISO", status: "PENDENTE", items: [{ key: "a" }], reason: "motivo suficiente" }, data: {} }).rpc);
  assert.ok(rpcs.every((r) => !/settings/.test(r)), "nenhuma RPC liga a trava de envio");
  // mesmo com TUDO satisfeito (flag ligada, aprovada, canal verificado) o resultado é bloqueio
  const d = { state: "APROVADA_PARA_ENVIO", approved_body_hash: "abc" };
  const view = M.draftSendView(d, channel(), { real_send_enabled: true });
  assert.equal(view.sendButtonEnabled, false);
  assert.equal(view.result.sent, false);
  assert.equal(view.result.blocked, true);
  assert.deepEqual(view.result.reasons, ["PHASE1_NO_SEND_TRANSPORT"]);
  const off = M.draftSendView({ state: "DRAFT", approved_body_hash: null }, null, null);
  for (const r of ["FLAG_OFF", "NOT_APPROVED", "NO_OFFICIAL_CHANNEL", "PHASE1_NO_SEND_TRANSPORT"]) assert.ok(off.result.reasons.includes(r), r);
  for (const r of off.result.reasons) assert.ok(LAB.SEND_BLOCK_REASON_LABEL[r], `rótulo para ${r}`);
  const panel = read("apps/web/components/insurance/panel-drafts.tsx");
  assert.ok(/<Button[^>]*\bdisabled\b[^>]*data-testid="seguros-send-disabled"/s.test(panel), "botão Enviar permanentemente desabilitado");
  assert.ok(panel.includes("Enviar (indisponível nesta fase)"));
  // nenhum caminho de transporte no módulo
  const files = [...walk(path.join(web, "components/insurance")), ...walk(path.join(web, "lib/insurance-ui")), path.join(web, "app/[projectId]/seguros/actions.ts"), path.join(web, "app/[projectId]/seguros/page.tsx")];
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/\bfetch\(|nodemailer|sendMail|gmail|googleapis|smtp|resend|XMLHttpRequest|navigator\.sendBeacon/i.test(s), `${path.relative(root, f)} contém transporte de envio`);
  }
  assert.ok(read("apps/web/lib/ui/help/modules/seguros-telas.ts").includes("envio real não existe"));
});

await check("CASO 33: dados insuficientes — dado ausente é SEM DADOS (nunca zero) em formatação, indicadores, vigência e cobertura", () => {
  assert.equal(FMT.formatMoney(null), "SEM DADOS");
  assert.equal(FMT.formatDate(null), "SEM DADOS");
  assert.equal(FMT.formatDateTime(undefined), "SEM DADOS");
  assert.equal(FMT.textOrNoData("  "), "SEM DADOS");
  const empty = M.overviewKpis(ws(), TODAY);
  assert.ok(empty.every((k) => k.value === null && M.kpiDisplay(k) === "SEM DADOS"), "tudo vazio => SEM DADOS, não 0");
  const filled = M.overviewKpis(ws({ policies: [policy({ status: "RASCUNHO" })] }), TODAY);
  assert.equal(filled.find((k) => k.id === "apolices-vigentes").value, 0, "com cadastro, zero é zero verdadeiro");
  assert.equal(M.policyValidity({ coverage_start: null, coverage_end: "2027-01-01" }, TODAY), "SEM_DADOS");
  assert.ok(M.policyStatusAlert(policy({ coverage_end: null }), TODAY).includes("SEM DADOS"));
  const data = ws({ policies: [policy({ coverage_start: null, coverage_end: null })], clauses: [clause()], claims: [claim({ occurrence_date: null })] });
  assert.equal(M.claimCoverageView(data.claims[0], data, NOW).assessment.conclusion, "INFORMACOES_INSUFICIENTES");
  assert.equal(M.claimNotice(claim(), NOW).status, "SEM_DADOS");
  assert.equal(FMT.parseDecimalPtBr("1.234,56"), 1234.56);
  assert.equal(FMT.parseDecimalPtBr(""), null);
  assert.ok(Number.isNaN(FMT.parseDecimalPtBr("abc")));
});

/* ---------------------------------------------------------- casos 37 (auditoria), 38 (concorrência), 39 (isolamento) ---------------------------------------------------------- */
await check("CASO 37: auditoria — toda RPC da UI grava insurance_int_audit; a aba lê a trilha append-only; rótulos cobrem os objetos auditados", () => {
  const sql = read("supabase/migrations/20261122201000_seguros_garantias_rpcs.sql");
  const rpcNames = new Set(OPS.ALL_INSURANCE_OPS.map((op) => OPS.buildRpcCall({ projectId: P1, op, id: id(1), expectedRowVersion: 1, args: { toState: "EMITIDO", toStage: "AVISO", status: "PENDENTE", items: [{ key: "a" }] }, data: {} }).rpc));
  for (const name of rpcNames) {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    assert.ok(start >= 0, `RPC ${name} existe`);
    const end = sql.indexOf("\n$$;", sql.indexOf("as $$", start));
    assert.ok(sql.slice(start, end).includes("insurance_int_audit"), `${name} grava auditoria`);
  }
  const model = read("supabase/migrations/20261122200000_seguros_garantias_model.sql");
  assert.ok(model.includes("'insurance_audit_events', 'insurance_policy_versions', 'insurance_claim_steps', 'insurance_advance_amortizations'") && model.includes("insurance_block_mutation"), "trilhas append-only no banco");
  for (const t of ["INSURANCE_POLICY", "INSURANCE_ENDORSEMENT", "INSURANCE_CLAIM", "INSURANCE_DRAFT", "BANK_GUARANTEE", "INSURANCE_CHANNEL"]) assert.ok(LAB.AUDIT_ENTITY_LABEL[t], t);
  assert.ok(DATA.emptyWorkspace(P1).audit.length === 0);
  assert.ok(read("apps/web/lib/insurance-ui/data.ts").includes('"insurance_audit_events"'));
  assert.ok(TABS.SEGUROS_TABS.some((t) => t.id === "auditoria"));
});

await check("CASO 38: concorrência — VERSION_CONFLICT vira aviso de conflito; toda escrita versionada exige row_version; a tela oferece Recarregar", () => {
  const e = ERR.mapInsuranceError({ message: "VERSION_CONFLICT: esperado 2, atual 3" });
  assert.equal(e.conflict, true);
  assert.equal(e.code, "VERSION_CONFLICT");
  assert.ok(e.message.includes("Nada foi gravado"));
  assert.equal(ERR.mapInsuranceError({ message: "INVALID_TRANSITION: EMITIDO -> EM_ANALISE" }).conflict, false);
  const versioned = ["policy_new_version", "party_add", "party_set_active", "clause_add", "bank_update", "other_update", "endorsement_advance", "advance_amortize", "claim_advance", "dossier_item_set", "draft_update", "draft_approve", "draft_cancel"];
  for (const op of versioned) {
    assert.throws(() => OPS.buildRpcCall({ projectId: P1, op, id: id(1), args: { toState: "EMITIDO", toStage: "AVISO", status: "PENDENTE" }, data: {} }), OPS.InsuranceInputError, `${op} sem row_version deve falhar`);
    const sqlText = read("supabase/migrations/20261122201000_seguros_garantias_rpcs.sql");
    assert.ok(sqlText.includes("VERSION_CONFLICT"));
  }
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "claim_advance", id: id(1), expectedRowVersion: 0, args: { toStage: "AVISO" } }), OPS.InsuranceInputError);
  const kit = read("apps/web/components/insurance/kit.tsx");
  assert.ok(kit.includes("runner.error.conflict") && kit.includes("Recarregar dados") && kit.includes("router.refresh()"));
  assert.ok(kit.includes("setValues(defaults)") && kit.indexOf("if (res.ok)") > 0, "o formulário só é limpo em caso de sucesso: o conflito preserva o texto digitado");
});

await check("CASO 39: isolamento entre projetos — o carregador sempre filtra por project_id e descarta linhas estranhas; falha de seção nunca vira lista vazia", async () => {
  const calls = [];
  const rows = { insurance_policies: [policy(), policy({ id: id(2), project_id: P2, policy_number: "OUTRO-PROJETO" })], bank_guarantees: [bank({ project_id: P2 })] };
  const client = {
    from(table) {
      const rec = { table, filters: [] };
      calls.push(rec);
      const q = {
        select() { return q; },
        eq(c, v) { rec.filters.push([c, v]); return q; },
        in() { return q; },
        order() { return q; },
        limit() { return q; },
        maybeSingle() { return Promise.resolve({ data: null, error: null }); },
        then(res) { return Promise.resolve(table === "insurance_claims" ? { data: null, error: { code: "XX000", message: "boom" } } : { data: rows[table] ?? [], error: null }).then(res); },
      };
      return q;
    },
    rpc(name, args) { calls.push({ rpc: name, args }); return Promise.resolve({ data: [{ kind: "VENCIMENTO", project_id: P2, entity_id: id(5) }], error: null }); },
  };
  const load = await DATA.loadInsuranceWorkspace(client, P1, TODAY);
  assert.equal(load.data.policies.length, 1);
  assert.equal(load.data.policies[0].project_id, P1);
  assert.equal(load.data.bankGuarantees.length, 0);
  assert.equal(load.data.dashboardItems.length, 0);
  assert.equal(load.foreignRowsDropped, 3);
  assert.ok(load.errors.claims, "falha de seção é reportada");
  assert.equal(load.moduleUnavailable, false);
  for (const c of calls.filter((x) => x.table)) assert.ok(c.filters.some(([col, v]) => col === "project_id" && v === P1), `${c.table} sem filtro de projeto`);
  assert.equal(calls.find((c) => c.rpc).args.p_project_id, P1);
  const unavailable = await DATA.loadInsuranceWorkspace({ ...client, from(t) { const q = client.from(t); q.then = (res) => Promise.resolve({ data: null, error: { code: "42P01", message: "relation does not exist" } }).then(res); return q; } }, P1, TODAY);
  assert.equal(unavailable.moduleUnavailable, true);
  assert.ok(Object.keys(unavailable.errors).length > 5);
  // toda RPC de escrita recebe o projeto da sessão/rota; o banco valida o resto (REFERENCE_OUT_OF_PROJECT)
  assert.equal(OPS.buildRpcCall({ projectId: P1, op: "claim_open", data: { title: "x" } }).params.p_project_id, P1);
  assert.ok(ERR.mapInsuranceError({ message: "REFERENCE_OUT_OF_PROJECT" }).message.includes("não pertence"));
  assert.throws(() => OPS.buildRpcCall({ projectId: "nao-e-uuid", op: "claim_open", data: {} }), OPS.InsuranceInputError);
});

/* ------------------------------------------------------------------ contratos gerais ------------------------------------------------------------------ */
await check("allowlist de RPC: só chaves conhecidas passam em p_data; campos desconhecidos e tipos perigosos são descartados", () => {
  const c = OPS.buildRpcCall({ projectId: P1, op: "policy_create", data: { modality: "RC_GERAL", insurer_name: "S", status: "VIGENTE", project_id: P2, real_send_enabled: true, evil: { a: 1 }, max_amount: 10 } });
  assert.deepEqual(Object.keys(c.params.p_data).sort(), ["insurer_name", "max_amount", "modality", "status"]);
  assert.equal(c.params.p_project_id, P1, "o projeto vem da rota, nunca do payload");
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "policy_create", data: { max_amount: Number.NaN } }), OPS.InsuranceInputError);
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "nao_existe" }), OPS.InsuranceInputError);
  assert.equal(OPS.isInsuranceOp("insurance_settings_update"), false);
  assert.equal(OPS.buildRpcCall({ projectId: P1, op: "draft_approve", id: id(1), expectedRowVersion: 1, args: { confirmation: "APROVO O CONTEUDO PARA ENVIO" } }).level, "ADMIN");
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "dossier_sync", id: id(1), args: { items: [] } }), OPS.InsuranceInputError);
});

await check("formulários: fonte obrigatória, money pt-BR, datas coerentes, só campos alterados em nova versão, helpIds literais existentes no catálogo", () => {
  const errs = F.validateForm(F.FORMS.policyCreate, { modality: "RC_GERAL", insurer_name: "S", coverage_start: "2026-05-01", coverage_end: "2026-01-01", max_amount: "abc" });
  assert.ok(errs.source_ref && errs.coverage_end && errs.max_amount);
  assert.deepEqual(F.validateForm(F.FORMS.policyCreate, { modality: "RC_GERAL", insurer_name: "S", source_ref: "p. 3", max_amount: "1.234,56" }), {});
  const built = F.buildForm(F.FORMS.policyCreate, { modality: "RC_GERAL", insurer_name: " S ", max_amount: "1.234,56", notes: "", source_ref: "x" });
  assert.equal(built.data.max_amount, 1234.56);
  assert.equal(built.data.insurer_name, "S");
  assert.ok(!("notes" in built.data), "vazio é omitido, nunca zero");
  const initial = { insurer_name: "S", status: "RASCUNHO", max_amount: "1000" };
  const v = F.buildForm(F.FORMS.policyNewVersion, { insurer_name: "S", status: "VIGENTE", max_amount: "1000", reason: "Ativação conforme apólice recebida" }, initial);
  assert.deepEqual(v.data, { status: "VIGENTE" });
  assert.equal(v.args.reason, "Ativação conforme apólice recebida");
  assert.ok(F.validateForm(F.FORMS.policyNewVersion, { insurer_name: "S", status: "RASCUNHO", max_amount: "1000", reason: "Sem alteração nenhuma" }, initial)._form);
  assert.ok(F.validateForm(F.FORMS.policyNewVersion, { insurer_name: "S", status: "VIGENTE", reason: "curto" }, initial).reason);
  assert.ok(F.validateDossierItem({ status: "ANEXADO" }).document_id && F.validateDossierItem({ status: "DISPENSADO" }).note);
  for (const h of F.allFormHelpIds()) assert.ok(ACC_FEATURE_HELP[h], `helpId inexistente: ${h}`);
  for (const t of TABS.SEGUROS_TABS) assert.ok(ACC_FEATURE_HELP[t.helpId], t.helpId);
  assert.equal(TABS.SEGUROS_TABS.length, 12);
});

await check("dossiê, adiantamento e minuta de endosso: checklist por modalidade, progresso e base separada em fatos/inferências/recomendações", () => {
  const pol = policy({ modality: "RC_CRUZADA" });
  const v = M.dossierForPolicy(pol, []);
  assert.ok(v.template.some((t) => t.key === "checklist_rcc"));
  assert.equal(v.progress.complete, false);
  assert.equal(v.missingFromTemplate.length, v.template.length);
  const items = v.template.map((t, i) => ({ id: id(100 + i), policy_id: pol.id, item_key: t.key, label: t.label, required: t.required, status: t.required ? "ANEXADO" : "PENDENTE", document_id: null, note: null, row_version: 1 }));
  const done = M.dossierForPolicy(pol, items);
  assert.equal(done.progress.complete, true);
  assert.equal(done.missingFromTemplate.length, 0);
  const data = ws({ policies: [pol], endorsements: [endorsement()], channels: [channel()] });
  const prep = M.prepareEndorsementDraft(data.endorsements[0], data);
  assert.equal(prep.draft.draftKind, "ENDOSSO");
  assert.equal(prep.draft.state, "DRAFT");
  assert.ok(prep.draft.body.includes("Incluir o proprietário final"));
  assert.ok(prep.draft.basis.recommendations.some((r) => r.includes("NÃO é endosso emitido")));
});

await check("contrato estático das telas: rota, menu, ação de servidor e arquivos 'use server' só exportam async", () => {
  assert.ok(existsSync(path.join(web, "app/[projectId]/seguros/page.tsx")));
  const nav = read("apps/web/lib/ui/nav-items.ts");
  assert.ok(/href: "seguros", label: "Seguros"[^}]*helpId: "seguros\.menu\.item"/.test(nav));
  assert.ok(!/restrictedTo/.test(nav.match(/\{ href: "seguros"[^}]*\}/)[0]), "menu visível a qualquer membro (READ); a RLS decide o conteúdo");
  const action = read("apps/web/app/[projectId]/seguros/actions.ts");
  assert.ok(action.trimStart().startsWith('"use server"'));
  const exported = [...action.matchAll(/^export\s+(.*)$/gm)].map((m) => m[1]);
  assert.ok(exported.length >= 1 && exported.every((x) => x.startsWith("async function")), `exports: ${exported.join(" | ")}`);
  const page = read("apps/web/app/[projectId]/seguros/page.tsx");
  assert.ok(page.includes("getCurrentProjectPermission") && page.includes("notFound()"), "página fail-closed sem membership");
  assert.ok(page.includes('helpId="seguros.pagina.visao-geral"'));
  assert.ok(!/SUPABASE_SERVICE|secret|createSupabaseAdmin|@axion\/db\/admin/i.test(page + action + read("apps/web/lib/insurance-ui/data.ts")), "nunca service role nem segredo");
});

await check("acessibilidade estática: alvos >= 44 px, sem atributo title de ajuda, ícone de ajuda nunca dentro de button/a, rótulos ligados aos campos", () => {
  const dir = path.join(web, "components/insurance");
  for (const f of walk(dir)) {
    const s = readFileSync(f, "utf8");
    assert.ok(!/<(button|a|span|div|input|select|textarea|th|td|li|p|label|nav)\b[^>]*\stitle=/.test(s), `${path.basename(f)} usa title`);
    // HelpHint nunca dentro de <button>…</button> / <Button>…</Button> / <a>…</a>
    for (const m of s.matchAll(/<(button|Button|a|Link)\b[^>]*>([\s\S]*?)<\/\1>/g)) assert.ok(!m[2].includes("<HelpHint"), `${path.basename(f)}: HelpHint dentro de ${m[1]}`);
  }
  const kit = read("apps/web/components/insurance/kit.tsx");
  assert.ok(kit.includes("min-h-11") && kit.includes("htmlFor={id}") && kit.includes("role=\"alert\"") && kit.includes("aria-invalid"));
  const ws2 = read("apps/web/components/insurance/seguros-workspace.tsx");
  assert.ok(ws2.includes("min-h-11") && ws2.includes("overflow-x-auto") && ws2.includes("aria-current"), "abas rolam no celular e têm alvo de toque");
  // sem cor solta: só tokens semânticos (o contraste é auditado por contrast-audit)
  for (const f of walk(dir)) assert.ok(!/(?:bg|text|border)-\[#/.test(readFileSync(f, "utf8")), `${path.basename(f)} usa cor literal`);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
