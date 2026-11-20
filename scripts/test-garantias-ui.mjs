// Garantias e Assistência Técnica (fase 2 / U3) — lógica pura da UI + análise estática do JSX/ações.
// Casos do conjunto de 40 cobertos: 7, 8, 9, 10, 11, 12, 13, 14, 31, 33, 38, 39.
// Nada acessa banco, rede ou IA; nenhuma data fixa (a data de referência é injetada).
//
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-garantias-ui.mjs

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

const CF = await import("../apps/web/lib/garantias/coverage-form.ts");
const AL = await import("../apps/web/lib/garantias/action-logic.ts");
const SM = await import("../apps/web/lib/garantias/summary.ts");
const LB = await import("../apps/web/lib/garantias/labels.ts");
const Q = await import("../apps/web/lib/quality/index.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { GARANTIAS_MANIFEST } = await import("../apps/web/lib/ui/help/manifests/garantias.ts");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}

const caseView = (over = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  projectId: "22222222-2222-4222-8222-222222222222",
  code: "GAR-001",
  contractRef: "CT-1",
  serviceSystem: "Pintura externa",
  state: "ABERTA",
  deliveredAt: "2025-01-10",
  discoveredAt: "2025-06-02",
  communicatedAt: "2025-06-03",
  warrantyTerms: "Garantia de 2 anos",
  warrantyTermsRef: "Termo de garantia, cláusula 8",
  customerComplaint: null,
  defectDescription: "Descascamento da pintura",
  causeCategory: "A_DEFINIR",
  causeNotes: null,
  hiddenDefect: false,
  solidityAndSafety: false,
  responsibleUserId: null,
  dueDate: null,
  estimatedCost: null,
  actualCost: null,
  supplierName: null,
  supplierWarrantyUntil: null,
  builderWarrantyUntil: null,
  originType: "EMAIL",
  originRef: "msg-1",
  ncrId: null,
  criticality: "SEM_DADOS",
  acceptedAt: null,
  acceptedByName: null,
  stateJustification: null,
  closedAt: null,
  reopenCount: 0,
  createdAt: "2025-06-03T10:00:00Z",
  updatedAt: "2025-06-03T10:00:00Z",
  rowVersion: 1,
  ...over,
});

/** Preenche todos os 16 itens (com fonte) para isolar o efeito dos sinais. */
function fullForm(signals) {
  const form = CF.emptyCoverageForm();
  for (const key of Object.keys(form.items)) form.items[key] = { status: "PREENCHIDO", value: `conteúdo ${key}`, source: `fonte ${key}` };
  form.items["prazo-decadencial"] = { status: "NAO_APLICAVEL", value: "", source: "não há decadência no enquadramento" };
  form.items["prazo-prescricional"] = { status: "NAO_APLICAVEL", value: "", source: "não há prescrição no enquadramento" };
  form.signals = { ...form.signals, ...signals };
  return form;
}
const conclusion = (form) => CF.evaluateCoverageForm(form).derivation.conclusion;

const NEGATIVE = { contractualWarranty: "DECORRIDA", legalWarrantyPotential: "NAO", hiddenDefect: "NAO", claimDeadline: "FORA", maintenance: "NAO_EXIGIDA", legalControversy: false };

// ---------------------------------------------------------------- CASO 7
check("CASO 07 defeito pós-entrega: abertura valida campos, exige origem rastreável e aceita datas reais", () => {
  const ok = AL.buildCreateCasePayload({ serviceSystem: "Fachada", defectDescription: "Trinca na fachada", originType: "EMAIL", originRef: "msg-123", deliveredAt: "2025-02-10", estimatedCost: "1.234,50" });
  assert.equal(ok.ok, true);
  assert.equal(ok.payload.data.estimated_cost, 1234.5);
  assert.equal(ok.payload.data.origin_ref, "msg-123");
  assert.equal(AL.buildCreateCasePayload({ serviceSystem: "F", defectDescription: "x" }).ok, false);
  const semOrigem = AL.buildCreateCasePayload({ serviceSystem: "Fachada", defectDescription: "Trinca na fachada", originType: "EMAIL" });
  assert.equal(semOrigem.ok, false);
  assert.match(semOrigem.errors.join(" "), /fonte rastre/i);
  assert.equal(AL.buildCreateCasePayload({ serviceSystem: "Fachada", defectDescription: "Trinca", deliveredAt: "2025-13-45" }).ok, false);
  assert.equal(AL.buildCreateCasePayload({ serviceSystem: "Fachada", defectDescription: "Trinca", estimatedCost: "-5" }).ok, false);
});

// ---------------------------------------------------------------- CASO 8
check("CASO 08 pintura: manutenção sem comprovante vira COBERTURA CONDICIONADA, nunca exclusão", () => {
  const form = CF.prefillCoverageForm(caseView({ serviceSystem: "Pintura" }), { records: 2, withoutProof: 2, status: "SEM_COMPROVANTE" });
  assert.equal(form.signals.maintenance, "NAO_COMPROVADA");
  const f = fullForm({ ...form.signals, contractualWarranty: "VIGENTE", legalWarrantyPotential: "SIM", hiddenDefect: "NAO", claimDeadline: "DENTRO" });
  assert.equal(conclusion(f), "COBERTURA CONDICIONADA");
  assert.ok(CF.evaluateCoverageForm(f).derivation.reasons.some((r) => /manutenção exigida sem comprovação/.test(r)));
});

// ---------------------------------------------------------------- CASO 9
check("CASO 09 impermeabilização: vício oculto (SIM) mantém cobertura condicionada e prazos a confirmar", () => {
  const f = fullForm({ contractualWarranty: "VIGENTE", legalWarrantyPotential: "SIM", hiddenDefect: "SIM", claimDeadline: "DENTRO", maintenance: "COMPROVADA" });
  const ev = CF.evaluateCoverageForm(f);
  assert.equal(ev.derivation.conclusion, "COBERTURA CONDICIONADA");
  assert.ok(ev.derivation.reasons.some((r) => /vício oculto potencial/.test(r)));
});

// ---------------------------------------------------------------- CASO 10
check("CASO 10 máquina em garantia: garantia contratual vigente, dentro do prazo, manutenção comprovada => POTENCIALMENTE COBERTO", () => {
  const f = fullForm({ contractualWarranty: "VIGENTE", legalWarrantyPotential: "NAO", hiddenDefect: "NAO", claimDeadline: "DENTRO", maintenance: "COMPROVADA" });
  assert.equal(conclusion(f), "POTENCIALMENTE COBERTO");
  assert.equal(CF.evaluateCoverageForm(f).derivation.requiresHumanReview, true);
});

// ---------------------------------------------------------------- CASO 11
check("CASO 11 máquina após término contratual: garantia DECORRIDA não exclui automaticamente; NÃO COBERTO só com todos os regimes fundamentados", () => {
  const parcial = fullForm({ ...NEGATIVE, legalWarrantyPotential: "INDETERMINADO" });
  const evParcial = CF.evaluateCoverageForm(parcial);
  assert.equal(evParcial.derivation.conclusion, "COBERTURA CONDICIONADA");
  assert.ok(evParcial.derivation.reasons.some((r) => /NÃO exclui automaticamente/.test(r)));
  assert.match(CF.NO_AUTO_EXCLUSION_NOTICE, /NÃO exclui a cobertura automaticamente/);
  assert.match(CF.NO_AUTO_EXCLUSION_NOTICE, /cinco anos/);
  const completo = fullForm(NEGATIVE);
  assert.equal(conclusion(completo), "POTENCIALMENTE NÃO COBERTO");
  const semFund = fullForm(NEGATIVE);
  semFund.items.fundamentacao = { status: "SEM_DADOS", value: "", source: "" };
  assert.notEqual(conclusion(semFund), "POTENCIALMENTE NÃO COBERTO");
});

// ---------------------------------------------------------------- CASO 12
check("CASO 12 vício oculto: marca do caso pré-seleciona o sinal SIM; desmarcado NÃO vira 'não há' (continua indeterminado)", () => {
  assert.equal(CF.prefillCoverageForm(caseView({ hiddenDefect: true }), null).signals.hiddenDefect, "SIM");
  assert.equal(CF.prefillCoverageForm(caseView({ hiddenDefect: false }), null).signals.hiddenDefect, "INDETERMINADO");
});

// ---------------------------------------------------------------- CASO 13
check("CASO 13 solidez e segurança: aviso próprio, sem prazo universal; controvérsia encaminha ao responsável humano", () => {
  const notices = CF.coverageNotices({ solidityAndSafety: true, legalControversy: true });
  assert.ok(notices.includes(CF.SOLIDITY_NOTICE));
  assert.match(CF.SOLIDITY_NOTICE, /NÃO se aplica prazo universal/);
  assert.ok(notices.includes(CF.COVERAGE_ESCALATION_NOTICE));
  assert.ok(!CF.coverageNotices({}).includes(CF.SOLIDITY_NOTICE));
  const f = fullForm({ contractualWarranty: "VIGENTE", legalWarrantyPotential: "SIM", hiddenDefect: "NAO", claimDeadline: "DENTRO", maintenance: "COMPROVADA", legalControversy: true });
  const ev = CF.evaluateCoverageForm(f);
  assert.equal(ev.derivation.conclusion, "COBERTURA CONDICIONADA");
  assert.equal(ev.derivation.routeToHumanResponsible, true);
  const panel = read("apps/web/components/garantias/coverage-panel.tsx");
  assert.match(panel, /Encaminhar a responsável humano/);
  assert.match(panel, /coverageNotices\(\{ solidityAndSafety, legalControversy/);
});

// ---------------------------------------------------------------- CASO 14
check("CASO 14 ausência de comprovantes: UI só CONSTATA o fato (quality_warranty_maintenance_status) e não conclui perda de garantia", () => {
  assert.match(LB.MAINTENANCE_STATUS_LABELS.SEM_COMPROVANTE, /SEM comprovante/);
  assert.match(LB.MAINTENANCE_STATUS_LABELS.SEM_REGISTRO, /SEM DADOS/);
  assert.match(CF.MAINTENANCE_FACT_NOTICE, /não conclui perda de garantia/);
  const sem = CF.prefillCoverageForm(caseView(), { records: 3, withoutProof: 1, status: "SEM_COMPROVANTE" });
  assert.equal(sem.signals.maintenance, "NAO_COMPROVADA");
  assert.equal(CF.prefillCoverageForm(caseView(), { records: 3, withoutProof: 0, status: "COMPROVADO" }).signals.maintenance, "COMPROVADA");
  const nada = CF.prefillCoverageForm(caseView(), { records: 0, withoutProof: 0, status: "SEM_REGISTRO" });
  assert.equal(nada.signals.maintenance, "SEM_DADOS");
  assert.equal(nada.items["exigencias-manutencao"].status, "SEM_DADOS");
  const records = read("apps/web/components/garantias/records-panels.tsx");
  assert.match(records, /SEM COMPROVANTE/);
  assert.match(records, /MAINTENANCE_FACT_NOTICE/);
});

// ---------------------------------------------------------------- CASO 31
check("CASO 31 usuário sem autorização: LEITURA não registra nem transiciona; UI desabilita com motivo e a ação recusa antes do banco", () => {
  assert.equal(Q.roleSatisfies("LEITURA", "REGISTER"), false);
  assert.equal(Q.roleSatisfies("COLABORADOR", "MANAGE"), false);
  assert.equal(Q.roleSatisfies("GESTOR", "MANAGE"), true);
  const forbidden = AL.translateDbError({ message: "FORBIDDEN: a transição X -> Y exige perfil de gestão" });
  assert.equal(forbidden.code, "FORBIDDEN");
  assert.equal(AL.translateDbError({ code: "42501", message: "new row violates row-level security policy" }).code, "FORBIDDEN");
  const panel = read("apps/web/components/garantias/transition-panel.tsx");
  assert.match(panel, /somente consulta \(LEITURA\)/);
  assert.match(panel, /exige perfil de gestão/);
  const actions = read("apps/web/app/[projectId]/garantias/actions.ts");
  assert.match(actions, /roleSatisfies\(role, min\)/);
  assert.match(actions, /"MANAGE"/);
});

// ---------------------------------------------------------------- CASO 33
check("CASO 33 dados insuficientes: formulário vazio => INFORMAÇÕES INSUFICIENTES; sem casos => SEM DADOS (nunca zero)", () => {
  const ev = CF.evaluateCoverageForm(CF.emptyCoverageForm());
  assert.equal(ev.derivation.conclusion, "INFORMAÇÕES INSUFICIENTES");
  assert.equal(ev.missingLabels.length, 16);
  assert.ok(ev.derivation.missingCoreItems.length >= 6);
  const sum = SM.summarizeCases([], "2000-01-01");
  assert.deepEqual(sum, { total: null, open: null, reopened: null, overdue: null, highCritical: null });
  const home = read("apps/web/components/garantias/garantias-home.tsx");
  assert.match(home, /"SEM DADOS"/);
  const semFonte = CF.emptyCoverageForm();
  semFonte.items["tipo-defeito"] = { status: "PREENCHIDO", value: "trinca", source: "" };
  assert.ok(CF.evaluateCoverageForm(semFonte).itemProblems.some((p) => /PREENCHIDO sem valor\/evidência/.test(p)));
  assert.equal(AL.parseMoney({ x: "" }, "x", "Custo", []), null);
});

check("indicadores da lista: contagens reais, prazo vencido só com prazo informado (data injetada)", () => {
  const today = "2030-06-15";
  const cases = [
    caseView({ id: "a", state: "ABERTA", dueDate: "2030-06-01", criticality: "HIGH" }),
    caseView({ id: "b", state: "ENCERRADA", dueDate: "2030-01-01", reopenCount: 1 }),
    caseView({ id: "c", state: "EM_REPARO", dueDate: null, criticality: "CRITICAL" }),
    caseView({ id: "d", state: "REABERTA", dueDate: "2030-12-01", reopenCount: 2 }),
  ];
  assert.deepEqual(SM.summarizeCases(cases, today), { total: 4, open: 3, reopened: 2, overdue: 1, highCritical: 2 });
});

// ---------------------------------------------------------------- CASO 38
check("CASO 38 concorrência: versão lida é enviada; conflito gera erro claro e a UI oferece recarregar", () => {
  const e = AL.translateDbError({ message: "VERSION_CONFLICT: versão esperada 3 mas a atual é 4 (outra transição foi aplicada)" });
  assert.equal(e.code, "VERSION_CONFLICT");
  assert.match(e.message, /Nada foi gravado/);
  assert.equal(AL.versionConflict().code, "VERSION_CONFLICT");
  const actions = read("apps/web/app/[projectId]/garantias/actions.ts");
  assert.match(actions, /\.eq\("row_version", expectedVersion\)/);
  assert.match(actions, /p_expected_version: input\.expectedVersion/);
  const transition = read("apps/web/components/garantias/transition-panel.tsx");
  assert.match(transition, /expectedVersion: rowVersion/);
  const form = read("apps/web/components/garantias/action-form.tsx");
  assert.match(form, /VERSION_CONFLICT/);
  assert.match(form, /Recarregar versão atual/);
  assert.equal(AL.validateTransitionInput({ caseId: "11111111-1111-4111-8111-111111111111", fromState: "ABERTA", toState: "EM_VISTORIA", expectedVersion: 0, justification: null, evidenceIds: [] }).length > 0, true);
});

check("transições: justificativa/evidência obrigatórias e estados inválidos são barrados antes do banco (espelho da máquina de estados)", () => {
  const base = { caseId: "11111111-1111-4111-8111-111111111111", expectedVersion: 2, evidenceIds: [] };
  assert.deepEqual(AL.validateTransitionInput({ ...base, fromState: "ABERTA", toState: "EM_VISTORIA", justification: null }), []);
  assert.ok(AL.validateTransitionInput({ ...base, fromState: "EM_ANALISE", toState: "COBERTA", justification: "curta" }).length >= 2);
  assert.deepEqual(AL.validateTransitionInput({ ...base, fromState: "EM_ANALISE", toState: "COBERTA", justification: "Cobertura confirmada pelo laudo.", evidenceIds: ["11111111-1111-4111-8111-111111111111"] }), []);
  assert.ok(AL.validateTransitionInput({ ...base, fromState: "ABERTA", toState: "ENCERRADA", justification: "tentativa indevida de encerramento" }).some((m) => /não prevista/.test(m)));
  assert.ok(LB.blockerMessage("CUSTOMER_ACCEPTANCE_REQUIRED").includes("aceite"));
});

// ---------------------------------------------------------------- CASO 39
check("CASO 39 isolamento entre projetos: leitura filtra project_id, usa o cliente do usuário (RLS) e caso alheio vira 404", () => {
  const data = read("apps/web/lib/garantias/data.ts");
  const actions = read("apps/web/app/[projectId]/garantias/actions.ts");
  for (const src of [data, actions]) {
    assert.doesNotMatch(src, /createSupabaseAdminClient|service_role|admin"/);
    assert.match(src, /createSupabaseServerClient/);
  }
  assert.match(data, /\.eq\("project_id", projectId\)/);
  assert.match(data, /if \(error \|\| !caseRow\) return null/);
  const page = read("apps/web/app/[projectId]/garantias/[caseId]/page.tsx");
  assert.match(page, /if \(!detail\) notFound\(\)/);
  assert.match(page, /isUuid\(caseId\)/);
  assert.match(actions, /\.eq\("project_id", projectId\)/);
  assert.match(actions, /project_id: projectId/);
  assert.equal(AL.isUuid("not-a-uuid"), false);
});

// ---------------------------------------------------------------- transversais
check("sem envio real: nenhuma tela do módulo envia e-mail/aviso (sem mailto, fetch, sendMail); escrita só por Server Actions", () => {
  const dir = path.join(root, "apps/web/components/garantias");
  for (const f of readdirSync(dir)) {
    const src = readFileSync(path.join(dir, f), "utf8");
    assert.doesNotMatch(src, /mailto:|sendMail|sendEmail|fetch\(|createSupabase/, f);
  }
  assert.doesNotMatch(read("apps/web/app/[projectId]/garantias/actions.ts"), /sendEmail|sendMail|gmail|nodemailer/i);
});

check("a conclusão é derivada: nenhum campo permite digitar a conclusão; avisos permanentes presentes", () => {
  const panel = read("apps/web/components/garantias/coverage-panel.tsx");
  assert.match(panel, /deriveWarrantyCoverage|evaluateCoverageForm/);
  assert.doesNotMatch(panel, /name="conclusion"|setConclusion/);
  assert.match(CF.COVERAGE_DISCLAIMER, /NÃO é parecer jurídico/);
  assert.match(CF.UNCONFIRMED_REFERENCES_NOTICE, /NÃO confirmadas em texto oficial/);
  const refs = read("apps/web/components/garantias/references-panel.tsx");
  assert.match(refs, /Manual do Proprietário/);
  assert.match(refs, /referência histórica/i);
  assert.match(refs, /UNCONFIRMED_REFERENCES_NOTICE/);
});

check("ajuda: todo helpId usado nas telas existe no catálogo, está no manifesto e nenhuma ajuda usa title", () => {
  const files = [];
  const walk = (d) => {
    for (const n of readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = `${d}/${n.name}`;
      if (n.isDirectory()) walk(rel);
      else if (/\.tsx$/.test(n.name)) files.push(rel);
    }
  };
  walk("apps/web/components/garantias");
  walk("apps/web/app/[projectId]/garantias");
  const used = new Set();
  for (const f of files) for (const m of read(f).matchAll(/helpId="(garantias\.[a-z0-9.-]+)"/g)) used.add(m[1]);
  assert.ok(used.size >= 100, `ids usados: ${used.size}`);
  const inManifest = new Set(GARANTIAS_MANIFEST.elements.map((e) => e.helpId));
  for (const id of used) {
    assert.ok(ACC_FEATURE_HELP[id], `sem catálogo: ${id}`);
    assert.ok(inManifest.has(id), `fora do manifesto: ${id}`);
  }
  for (const f of files) assert.doesNotMatch(read(f), /<(?:div|span|a|button|input|select|textarea|p|th|td|label)\b[^>]*\stitle=/, `${f} usa atributo title`);
  assert.ok(ACC_FEATURE_HELP["garantias.menu.garantias"]);
  assert.match(read("apps/web/lib/ui/nav-items.ts"), /href: "garantias", label: "Garantias"/);
});

check("alvos de toque >= 44 px: botões e campos do módulo usam min-h-11", () => {
  const ui = read("apps/web/components/garantias/ui-bits.tsx");
  assert.match(ui, /BUTTON_CLASS =\s*\n?\s*"[^"]*min-h-11/);
  assert.match(ui, /FIELD_CLASS =\s*\n?\s*"[^"]*min-h-11/);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
