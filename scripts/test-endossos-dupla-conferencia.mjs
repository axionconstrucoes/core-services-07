// FASE 3 / C — ENDOSSOS COM DUPLA CONFERÊNCIA HUMANA INDEPENDENTE: regras PURAS (domínio + view models + allowlist de RPC + ajuda + contrato da
// migration). Sem banco, rede ou IA. A prova no banco real está em scripts/test-endossos-dupla-conferencia-realpg.mjs (mesmos nomes de caso).
// Casos: CASO 21-24, 31, 37, 38, 39 e CASO F3-C-01..F3-C-12 (versão pura).
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-endossos-dupla-conferencia.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const I = await import("../apps/web/lib/insurance/index.ts");
const M = await import("../apps/web/lib/insurance-ui/model.ts");
const OPS = await import("../apps/web/lib/insurance-ui/rpc-ops.ts");
const F = await import("../apps/web/lib/insurance-ui/forms.ts");
const LAB = await import("../apps/web/lib/insurance-ui/labels.ts");
const DATA = await import("../apps/web/lib/insurance-ui/data.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8");

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

const P1 = "10000000-0000-4000-8000-000000000001";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQ = id(701);
const ISS = id(702);
const A = id(703);
const B = id(704);
const endorsement = (o = {}) => ({
  id: id(50), project_id: P1, policy_id: id(1), endorsement_seq: 1, state: "EMITIDO", requested_text: "Incluir o proprietário final como segurado adicional", requested_at: "2026-03-01T00:00:00Z",
  request_document_id: null, request_ref: "e-mail", issued_text: "Incluir o proprietário final como segurado adicional", issued_at: "2026-03-10T00:00:00Z", issued_document_id: id(902), issued_number: "E-7",
  texts_match: true, comparison: null, divergence_note: null, verified_at: null, coverage_effective: false, refusal_note: null, row_version: 3,
  requested_by: REQ, issued_by: ISS, verified_by: null, change_kinds: ["SEGURADO"], requires_dual_review: true, dual_review_reason: "CLASSIFICACAO_CRITICA", legacy_single_review: false, review_round: 1, ...o,
});
const review = (o = {}) => ({ id: id(900 + Math.floor(Math.random() * 1e5)), project_id: P1, endorsement_id: id(50), review_round: 1, review_no: 1, reviewer_id: A, outcome: "APROVADO", note: null, texts_match: true, dual_required: true, reviewed_at: "2026-03-11T10:00:00Z", ...o });

check("CASO 23: pedido NÃO é endosso emitido — só CONFERIDO + efetivo + documento emitido amplia cobertura; EM_REVISAO nunca", () => {
  for (const state of ["SOLICITADO", "EM_ANALISE", "EMITIDO", "RECUSADO", "EM_REVISAO"]) {
    assert.equal(I.endorsementExtendsCoverage({ id: "x", state, coverageEffective: false, issuedDocumentId: "d" }), false, state);
    assert.equal(I.endorsementExtendsCoverage({ id: "x", state, coverageEffective: true, issuedDocumentId: "d" }), false, `${state} mesmo com flag forjada`);
  }
  assert.equal(I.endorsementExtendsCoverage({ id: "x", state: "CONFERIDO", coverageEffective: true, issuedDocumentId: "d" }), true);
  assert.match(I.endorsementStatusLabel({ id: "x", state: "EM_REVISAO", coverageEffective: false }), /sem efeito de cobertura/);
});

check("CASO 24: máquina de estados — CONFERIDO só a partir de EMITIDO; EM_REVISAO sai por nova emissão ou recusa; CONFERIDO/RECUSADO terminais", () => {
  const T = I.canTransitionEndorsement;
  assert.equal(T("SOLICITADO", "CONFERIDO"), false);
  assert.equal(T("EM_ANALISE", "CONFERIDO"), false);
  assert.equal(T("EMITIDO", "CONFERIDO"), true);
  assert.equal(T("EMITIDO", "EM_REVISAO"), true);
  assert.equal(T("EM_REVISAO", "EMITIDO"), true);
  assert.equal(T("EM_REVISAO", "RECUSADO"), true);
  assert.equal(T("EM_REVISAO", "CONFERIDO"), false, "EM_REVISAO nunca vai direto a CONFERIDO");
  for (const to of ["SOLICITADO", "EM_ANALISE", "EMITIDO", "RECUSADO", "EM_REVISAO", "CONFERIDO"]) {
    assert.equal(T("CONFERIDO", to), false, `CONFERIDO -> ${to}`);
    assert.equal(T("RECUSADO", to), false, `RECUSADO -> ${to}`);
  }
  assert.equal(I.compareEndorsementTexts("A  B", "a b").textsMatch, true, "comparação solicitado x emitido preservada");
  assert.deepEqual(I.compareEndorsementTexts("a b", "a b c").onlyIssued, ["c"]);
});

check("CASO F3-C-07 (puro): classificação fail-closed — sem classificação, lista vazia, valor crítico e texto divergente exigem dupla; só não crítico + texto igual é simples", () => {
  const R = I.dualReviewReason;
  assert.equal(R(null, null), "SEM_CLASSIFICACAO");
  assert.equal(R(undefined, true), "SEM_CLASSIFICACAO");
  assert.equal(R([], true), "SEM_CLASSIFICACAO");
  for (const k of I.CRITICAL_CHANGE_KINDS) assert.equal(R([k], true), "CLASSIFICACAO_CRITICA", k);
  assert.equal(R(["DADOS_CADASTRAIS", "SEGURADO"], true), "CLASSIFICACAO_CRITICA", "um crítico basta");
  assert.equal(R(["PRORROGACAO_VIGENCIA"], false), "TEXTO_DIVERGENTE");
  assert.equal(R(["PRORROGACAO_VIGENCIA"], null), null);
  assert.equal(R(["PRORROGACAO_VIGENCIA", "DADOS_CADASTRAIS", "OUTRO_NAO_CRITICO"], true), null);
  // os cinco grupos do escopo estão todos cobertos como críticos
  for (const g of ["SEGURADO", "BENEFICIARIO_PARTES", "OBRIGACAO_GARANTIDA", "VALOR_IMPORTANCIA_SEGURADA", "VALOR_LIMITE", "VALOR_PREMIO", "VALOR_GARANTIDO", "COBERTURA_CLAUSULA", "COBERTURA_EXCLUSAO", "COBERTURA_SUBLIMITE", "COBERTURA_FRANQUIA"]) assert.ok(I.CRITICAL_CHANGE_KINDS.includes(g), g);
  assert.equal(I.requiresDualReview(["VALOR_PREMIO"], true), true);
  // normalização e validação (espelho de insurance_int_endorsement_kinds)
  assert.equal(I.normalizeChangeKinds(undefined), null);
  assert.deepEqual(I.normalizeChangeKinds([" dados_cadastrais ", "DADOS_CADASTRAIS", ""]), ["DADOS_CADASTRAIS"]);
  assert.throws(() => I.normalizeChangeKinds(["INVENTADO"]), /INVALID_CHANGE_KINDS/);
  assert.throws(() => I.normalizeChangeKinds("SEGURADO"), /INVALID_CHANGE_KINDS/);
  assert.deepEqual([...I.ALL_CHANGE_KINDS].sort(), Object.keys(LAB.CHANGE_KIND_LABEL).sort(), "rótulos cobrem todos os valores");
});

const st = (o = {}) => ({ requiresDualReview: true, legacySingleReview: false, state: "EMITIDO", reviewRound: 1, requestedBy: REQ, issuedBy: ISS, ...o });
const rv = (reviewerId, outcome = "APROVADO", reviewRound = 1) => ({ reviewRound, reviewNo: 1, reviewerId, outcome });

check("CASO F3-C-01/02/03/04 + F4-A-01 (puro): independência — emissor, mesmo usuário duas vezes, não-gestor e SEM competência são bloqueados; o SOLICITANTE pode conferir com competência", () => {
  const B_ = (u, mgr, s, r, comp = true) => I.reviewBlock(u, mgr, s, r, comp);
  assert.equal(B_(B, true, st(), []), null, "usuário independente com competência confere");
  assert.equal(B_(REQ, true, st(), []), null, "Fase 4/A: o solicitante PODE conferir (nível MANAGE + competência)");
  assert.equal(B_(REQ, true, st(), [], false), "NO_COMPETENCE", "solicitante sem competência é bloqueado");
  assert.equal(B_(B, true, st(), [], false), "NO_COMPETENCE", "qualquer conferente de endosso crítico precisa de competência");
  assert.equal(I.reviewBlock(B, true, st(), []), "NO_COMPETENCE", "fail-closed: competência não informada = sem competência");
  assert.equal(B_(ISS, true, st(), []), "IS_ISSUER", "conferente = quem emitiu");
  assert.equal(B_(ISS, true, st(), [], false), "IS_ISSUER", "o emissor é barrado antes da competência");
  assert.equal(B_(A, true, st(), [rv(A)]), "ALREADY_REVIEWED", "mesmo usuário em duas conferências");
  assert.equal(B_(A, true, st(), [rv(A, "RECUSADO")]), "ALREADY_REVIEWED", "mesmo usuário aprovando e depois recusando");
  assert.equal(B_(B, true, st(), [rv(A)]), null, "o segundo conferente, distinto, passa");
  assert.equal(B_(REQ, true, st(), [rv(A)]), null, "solicitante como 2º conferente");
  assert.equal(B_(A, false, st(), []), "NOT_MANAGER", "COLABORADOR/LEITURA não conferem (competência não substitui o nível)");
  assert.equal(B_(null, true, st(), []), "NO_USER");
  for (const state of ["SOLICITADO", "EM_ANALISE", "CONFERIDO", "RECUSADO", "EM_REVISAO"]) assert.equal(B_(B, true, st({ state }), []), "NOT_EMITTED", state);
  // nova rodada: quem conferiu na rodada anterior pode conferir de novo (a rodada reinicia)
  assert.equal(B_(A, true, st({ reviewRound: 2 }), [rv(A, "APROVADO", 1)]), null);
  // conferência simples (não crítico): sem exigência de competência nem independência de solicitante/emissor (regra do banco), a de repetição sim
  assert.equal(B_(REQ, true, st({ requiresDualReview: false }), [], false), null);
  assert.equal(B_(A, true, st({ requiresDualReview: false }), [rv(A)]), "ALREADY_REVIEWED");
  for (const c of ["NOT_EMITTED", "NO_USER", "NOT_MANAGER", "NO_COMPETENCE", "IS_ISSUER", "ALREADY_REVIEWED"]) assert.ok(I.reviewBlockText(c).length > 20, c);
  assert.equal(I.reviewBlockText("IS_REQUESTER"), undefined, "o código IS_REQUESTER deixou de existir (Fase 4/A)");
});

check("CASO F3-C-05/06 (puro): andamento — dupla exige 2 aprovações, simples 1, legado 1 já cumprida; recusa é contada à parte", () => {
  assert.equal(I.reviewsRequired(st()), 2);
  assert.equal(I.reviewsRequired(st({ requiresDualReview: false })), 1);
  assert.equal(I.reviewsRequired(st({ requiresDualReview: false, legacySingleReview: true })), 1);
  assert.equal(I.reviewsRequired(st({ requiresDualReview: true, legacySingleReview: true })), 1, "legado nunca vira dupla");
  const p0 = I.reviewProgress(st(), []);
  assert.deepEqual([p0.required, p0.approved, p0.remaining], [2, 0, 2]);
  const p1 = I.reviewProgress(st(), [rv(A)]);
  assert.deepEqual([p1.approved, p1.remaining], [1, 1]);
  const p2 = I.reviewProgress(st(), [rv(A), rv(B)]);
  assert.deepEqual([p2.approved, p2.remaining], [2, 0]);
  const pr = I.reviewProgress(st({ state: "EM_REVISAO" }), [rv(A), rv(B, "RECUSADO")]);
  assert.deepEqual([pr.approved, pr.refused], [1, 1]);
  const p3 = I.reviewProgress(st({ reviewRound: 2 }), [rv(A, "APROVADO", 1), rv(B, "RECUSADO", 1)]);
  assert.deepEqual([p3.approved, p3.refused, p3.remaining], [0, 0, 2], "outra rodada não conta");
  assert.match(I.reviewProgressLabel(st(), p1), /1 de 2 conferência\(s\) aprovada\(s\) \(dupla conferência independente\)/);
  assert.match(I.reviewProgressLabel(st({ requiresDualReview: false }), I.reviewProgress(st({ requiresDualReview: false }), [])), /conferência simples/);
  assert.match(I.reviewProgressLabel(st({ legacySingleReview: true, state: "CONFERIDO" }), p0), /histórica|histórico/);
  assert.match(I.reviewProgressLabel(st({ state: "EM_REVISAO" }), pr), /recusada|Em revisão|recusada/i);
});

check("CASO F3-C-09 (puro): dados legados — CONFERIDO histórico continua com efeito, sem dupla e sem reabrir", () => {
  const legacy = endorsement({ state: "CONFERIDO", coverage_effective: true, verified_by: A, verified_at: "2026-03-12T00:00:00Z", legacy_single_review: true, requires_dual_review: false, dual_review_reason: null, change_kinds: null });
  const v = M.endorsementView(legacy, [], A, true);
  assert.equal(v.extendsCoverage, true);
  assert.deepEqual(v.nextActions, []);
  assert.equal(v.reviewState.legacySingleReview, true);
  assert.match(v.progressText, /hist/i);
  assert.equal(v.reviewBlock, "NOT_EMITTED");
});

check("CASO 24/38/39 (view model): endorsementView — andamento 1 de 2, bloqueio por usuário e conferências de outro endosso/rodada ignoradas", () => {
  const e = endorsement();
  const reviews = [review({ reviewer_id: A }), review({ endorsement_id: id(99), reviewer_id: B }), review({ review_round: 0, reviewer_id: B })];
  const asB = M.endorsementView(e, reviews, B, true, true);
  assert.equal(asB.progress.approved, 1);
  assert.equal(asB.reviewBlock, null, "B ainda pode conferir (as conferências de outro endosso não contam)");
  assert.equal(asB.currentReviews.length, 1);
  assert.equal(M.endorsementView(e, reviews, A, true, true).reviewBlock, "ALREADY_REVIEWED");
  assert.equal(M.endorsementView(e, reviews, REQ, true, true).reviewBlock, null, "Fase 4/A: solicitante com competência pode conferir");
  assert.equal(M.endorsementView(e, reviews, REQ, true).reviewBlock, "NO_COMPETENCE", "sem competência informada: bloqueado (fail-closed)");
  assert.equal(M.endorsementView(e, reviews, ISS, true, true).reviewBlock, "IS_ISSUER");
  assert.equal(M.endorsementView(e, reviews, B, false, true).reviewBlock, "NOT_MANAGER");
  // fail-closed: linha de banco antigo, sem os campos novos, é tratada como dupla conferência
  const old = { ...e };
  delete old.requires_dual_review;
  delete old.review_round;
  assert.equal(M.endorsementView(old, [], B, true).reviewState.requiresDualReview, true);
  // EM_REVISAO oferece nova emissão ou recusa, nunca conferência
  assert.deepEqual(M.endorsementView(endorsement({ state: "EM_REVISAO" })).nextActions, ["EMITIDO", "RECUSADO"]);
  assert.deepEqual(M.endorsementView(endorsement({ state: "EMITIDO" })).nextActions, ["CONFERIDO"]);
  const ws = { ...DATA.emptyWorkspace(P1), endorsements: [endorsement({ state: "EM_REVISAO" }), endorsement({ id: id(51), state: "CONFERIDO", coverage_effective: true })] };
  assert.equal(M.overviewKpis(ws, "2026-11-20").find((k) => k.id === "endossos-pendentes").value, 1, "EM_REVISAO conta como pendente; CONFERIDO não");
  assert.deepEqual(DATA.emptyWorkspace(P1).endorsementReviews, []);
});

check("CASO 31 (allowlist): a UI só confere por insurance_endorsement_review, nível MANAGE; resultado inválido e versão ausente são recusados antes da rede", () => {
  assert.equal(OPS.levelForOp("endorsement_review"), "MANAGE");
  const ok = OPS.buildRpcCall({ projectId: P1, op: "endorsement_review", id: id(50), expectedRowVersion: 3, args: { outcome: "APROVADO" }, data: { note: "Texto confere com o documento anexo.", divergence_note: "x", lixo: "descartado", change_kinds: ["X"] } });
  assert.equal(ok.rpc, "insurance_endorsement_review");
  assert.equal(ok.level, "MANAGE");
  assert.deepEqual(Object.keys(ok.params.p_data).sort(), ["divergence_note", "note"], "allowlist de chaves");
  assert.equal(ok.params.p_outcome, "APROVADO");
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "endorsement_review", id: id(50), expectedRowVersion: 3, args: { outcome: "TALVEZ" } }), OPS.InsuranceInputError);
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "endorsement_review", id: id(50), args: { outcome: "APROVADO" } }), OPS.InsuranceInputError, "sem row_version");
  assert.throws(() => OPS.buildRpcCall({ projectId: P1, op: "endorsement_review", id: "x", expectedRowVersion: 1, args: { outcome: "APROVADO" } }), OPS.InsuranceInputError);
  // a classificação trafega no pedido e na emissão (e só nelas)
  const rq = OPS.buildRpcCall({ projectId: P1, op: "endorsement_request", id: id(1), data: { requested_text: "x y z", change_kinds: ["SEGURADO", "VALOR_PREMIO"], lixo: 1 } });
  assert.deepEqual(rq.params.p_data.change_kinds, ["SEGURADO", "VALOR_PREMIO"]);
  assert.equal(rq.params.p_data.lixo, undefined);
  const em = OPS.buildRpcCall({ projectId: P1, op: "endorsement_advance", id: id(50), expectedRowVersion: 2, args: { toState: "EMITIDO" }, data: { issued_text: "t", change_kinds: ["COBERTURA_EXCLUSAO"] } });
  assert.deepEqual(em.params.p_data.change_kinds, ["COBERTURA_EXCLUSAO"]);
  assert.ok(OPS.ALL_INSURANCE_OPS.includes("endorsement_review"));
  assert.ok(!OPS.ALL_INSURANCE_OPS.some((o) => /send|enviar|dispatch|mail/i.test(o.replace("draft_attempt_send", ""))), "nenhuma operação de envio");
  // permissão espelho: COLABORADOR e LEITURA não conferem; GESTOR/GERENTE/ADMINISTRADOR sim
  for (const [role, expected] of [["LEITURA", false], ["COLABORADOR", false], ["GESTOR", true], ["GERENTE", true], ["ADMINISTRADOR", true], [null, false]]) {
    assert.equal(OPS.isOpAllowedForPermission(role, { projectId: P1, op: "endorsement_review", args: { outcome: "APROVADO" } }), expected, String(role));
  }
});

check("CASO 24 (formulários): classificação no pedido e na emissão, formulário de recusa com nota >= 20, validação de divergência preservada", () => {
  const f = F.FORMS;
  assert.ok(f.endorsementRequest.fields.some((x) => x.name === "change_kinds" && x.type === "multi"));
  assert.ok(f.endorsementIssue.fields.some((x) => x.name === "change_kinds" && x.type === "multi"));
  const refuse = f.endorsementReviewRefuse;
  assert.equal(refuse.fields[0].minLength, 20);
  assert.ok(F.validateForm(refuse, { note: "curta" }).note, "nota curta recusada");
  assert.deepEqual(F.validateForm(refuse, { note: "Segurado incorreto na minuta emitida; devolver à seguradora." }), {});
  const built = F.buildForm(f.endorsementRequest, { requested_text: "Incluir beneficiário", change_kinds: "SEGURADO,VALOR_PREMIO" });
  assert.deepEqual(built.data.change_kinds, ["SEGURADO", "VALOR_PREMIO"]);
  assert.equal(F.buildForm(f.endorsementRequest, { requested_text: "Incluir beneficiário" }).data.change_kinds, undefined, "sem classificação => omitido => crítico no banco");
  assert.ok(F.validateEndorsementVerify({ divergence_note: "" }, false).divergence_note);
  assert.deepEqual(F.validateEndorsementVerify({}, true), {});
  for (const spec of [f.endorsementRequest, f.endorsementIssue, f.endorsementReviewRefuse]) for (const fld of spec.fields) assert.ok(fld.helpId && Boolean(ACC_FEATURE_HELP[fld.helpId]), `${spec.id}.${fld.name}: Hover Text ${fld.helpId}`);
  assert.ok(Boolean(ACC_FEATURE_HELP[refuse.helpId]) && Boolean(ACC_FEATURE_HELP[refuse.submitHelpId]), "ajuda do formulário de recusa");
});

check("Hover Text (Fase 3/C): todos os elementos novos têm ajuda no catálogo e entrada no manifesto; rótulos de estado/classificação completos", () => {
  const ids = ["seguros.endossos.campo-classificacao", "seguros.endossos.campo-classificacao-emissao", "seguros.endossos.conferencias", "seguros.endossos.status-dupla", "seguros.endossos.coluna-conferencias",
    "seguros.endossos.form-conferencia-recusa", "seguros.endossos.campo-nota-recusa-conferencia", "seguros.acoes.endosso-conferencia-recusar-abrir", "seguros.acoes.endosso-conferencia-recusar"];
  const manifest = read("apps/web/lib/ui/help/manifests/seguros-endossos-dupla.ts");
  for (const hid of ids) {
    assert.ok(Boolean(ACC_FEATURE_HELP[hid]), `catálogo: ${hid}`);
    assert.ok(manifest.includes(`"${hid}"`), `manifesto: ${hid}`);
  }
  assert.ok(LAB.ENDORSEMENT_STATE_LABEL.EM_REVISAO);
  for (const r of ["SEM_CLASSIFICACAO", "CLASSIFICACAO_CRITICA", "TEXTO_DIVERGENTE"]) assert.ok(LAB.DUAL_REVIEW_REASON_LABEL[r], r);
});

check("CASO 37/F3-C-12 (contrato da migration): constraints, triggers, RLS, append-only, GRANTs e ausência de envio real", () => {
  const sql = read("supabase/migrations/20261123200000_endorsement_dual_review.sql");
  for (const needle of [
    "create table if not exists public.insurance_endorsement_reviews",
    "unique (endorsement_id, review_round, reviewer_id)",
    "reviewer_id <> requested_by_snapshot", "reviewer_id <> issued_by_snapshot",
    "insurance_endorsements_dual_classification_check", "insurance_endorsements_guard", "insurance_endorsement_review_prepare",
    "enable row level security", "insurance_block_mutation", "'MANAGE'", "grant execute on function public.insurance_endorsement_review",
    "LEGACY_FLAG_IMMUTABLE", "CLASSIFICATION_DOWNGRADE", "REVIEWER_IS_ISSUER", "ALREADY_REVIEWED", "VERSION_CONFLICT", "insurance_int_audit",
  ]) assert.ok(sql.includes(needle), needle);
  assert.ok(!/real_send_enabled\s*=\s*true/i.test(sql) && !/update public\.insurance_settings/i.test(sql), "a migration não toca na trava de envio real");
  assert.ok(!/record_risk_alert_action/.test(sql), "não toca o hotfix P0");
  assert.ok(!/grant (insert|update|delete)/i.test(sql), "sem escrita direta para authenticated");
  const doc = read("docs/permissoes-matriz-central.md");
  assert.ok(/dupla confer/i.test(doc), "matriz central documenta a dupla conferência");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
