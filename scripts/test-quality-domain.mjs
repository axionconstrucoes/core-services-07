// Qualidade (fase 1) — domínio PURO: máquina de estados da RNC/garantia, criticidade 4 pilares (pior pilar domina),
// dedupe por origem, guarda "alerta RESOLVIDO não encerra". Nada acessa banco, rede ou IA.
// Também compara a máquina de estados TS com o seed SQL da migration (paridade textual).
//
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-quality-domain.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const Q = await import("../apps/web/lib/quality/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));

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

const ev = (classification, id = "e1") => ({ id, sourceType: "DOCUMENTO", sourceRef: `doc-${id}`, classification });
const EVENTS_VERIF = [{ seq: 10, toState: "VERIFICACAO" }];
const okVerification = { result: "EFICAZ", hasEvidence: true, eventSeqAt: 10 };
const baseClose = {
  entity: "NCR",
  from: "VERIFICACAO",
  to: "ENCERRADA",
  role: "GESTOR",
  justification: "Eficácia verificada em inspeção de reavaliação.",
  actions: [{ status: "EXECUTADA" }],
  verifications: [okVerification],
  events: EVENTS_VERIF,
};

check("paridade: transições TS == seed SQL de quality_state_transitions (mesmas 38 regras)", () => {
  const sql = readFileSync(path.join(here, "..", "supabase", "migrations", "20261122100000_quality_foundation.sql"), "utf8");
  const rows = [...sql.matchAll(/\('(NCR|WARRANTY)', '(\w+)', '(\w+)', '(REGISTER|MANAGE)', (true|false), (true|false)\)/g)].map(
    (m) => `${m[1]}|${m[2]}|${m[3]}|${m[4]}|${m[5]}|${m[6]}`,
  );
  const ts = Q.TRANSITIONS.map((r) => `${r.entity}|${r.from}|${r.to}|${r.minRole}|${r.requiresJustification}|${r.requiresEvidence}`);
  assert.deepEqual([...ts].sort(), [...rows].sort());
  assert.equal(ts.length, rows.length);
  assert.ok(ts.length >= 38);
});

check("estados: 12 estados da RNC (incl. NAO_CONFIRMADA, DUPLICADA, CANCELADA, REABERTA) e só estados válidos nas transições", () => {
  assert.equal(Q.NCR_STATES.length, 12);
  for (const r of Q.TRANSITIONS) {
    const set = r.entity === "NCR" ? Q.NCR_STATES : Q.WARRANTY_STATES;
    assert.ok(set.includes(r.from) && set.includes(r.to), `${r.entity} ${r.from}->${r.to}`);
  }
});

check("fluxo feliz da RNC percorre DETECTADA→...→ENCERRADA sem atalhos", () => {
  const path_ = ["DETECTADA", "TRIAGEM", "INVESTIGACAO", "CONFIRMADA", "PLANO_ACAO", "CORRECAO", "VERIFICACAO", "ENCERRADA"];
  for (let i = 0; i < path_.length - 1; i += 1) assert.ok(Q.findTransition("NCR", path_[i], path_[i + 1]), `${path_[i]}->${path_[i + 1]}`);
  assert.equal(Q.findTransition("NCR", "DETECTADA", "ENCERRADA"), undefined);
  assert.equal(Q.findTransition("NCR", "CORRECAO", "ENCERRADA"), undefined, "correção executada não encerra");
  assert.equal(Q.findTransition("NCR", "INVESTIGACAO", "ENCERRADA"), undefined);
});

check("terminais: DUPLICADA e CANCELADA não saem; ENCERRADA e NAO_CONFIRMADA só reabrem", () => {
  assert.ok(Q.isTerminal("NCR", "DUPLICADA") && Q.isTerminal("NCR", "CANCELADA"));
  assert.deepEqual(Q.allowedTransitions("NCR", "ENCERRADA").map((r) => r.to), ["REABERTA"]);
  assert.deepEqual(Q.allowedTransitions("NCR", "NAO_CONFIRMADA").map((r) => r.to), ["REABERTA"]);
});

check("justificativa obrigatória: cancelar/duplicar/não confirmar/encerrar/reabrir exigem justificativa", () => {
  for (const to of ["CANCELADA", "DUPLICADA"]) {
    const r = Q.evaluateTransition({ entity: "NCR", from: "TRIAGEM", to, role: "GESTOR", justification: "", duplicateOfId: "x" });
    assert.ok(r.blockers.includes("JUSTIFICATION_REQUIRED"), to);
  }
  const short = Q.evaluateTransition({ ...baseClose, justification: "curta" });
  assert.ok(short.blockers.includes("JUSTIFICATION_REQUIRED"));
});

check("evidência obrigatória: NAO_CONFIRMADA, CONFIRMADA e REABERTA exigem evidência informada", () => {
  const r = Q.evaluateTransition({ entity: "NCR", from: "INVESTIGACAO", to: "NAO_CONFIRMADA", role: "GESTOR", justification: "Sem evidência de falha após ensaio." });
  assert.ok(r.blockers.includes("EVIDENCE_REQUIRED"));
  const r2 = Q.evaluateTransition({ entity: "NCR", from: "ENCERRADA", to: "REABERTA", role: "GESTOR", justification: "Recorrência observada na obra." });
  assert.ok(r2.blockers.includes("EVIDENCE_REQUIRED"));
});

check("CASO 5: indício em diário de obra NÃO confirma a RNC (exige NC_COMPROVADA)", () => {
  const ctx = {
    entity: "NCR", from: "INVESTIGACAO", to: "CONFIRMADA", role: "GESTOR",
    justification: "Confirmada após análise do diário.", evidenceIds: ["e1"],
    caseEvidence: [{ id: "e1", sourceType: "DIARIO_OBRA", sourceRef: "diario-2026-11-02", classification: "INDICIO" }],
  };
  const r = Q.evaluateTransition(ctx);
  assert.ok(!r.allowed && r.blockers.includes("CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE"));
  const r2 = Q.evaluateTransition({ ...ctx, caseEvidence: [ev("NC_COMPROVADA")] });
  assert.ok(r2.allowed, r2.blockers.join());
  assert.equal(Q.canSupportConfirmation("SUSPEITA"), false);
  assert.equal(Q.canSupportConfirmation("RISCO_POTENCIAL"), false);
  assert.equal(Q.strongestClassification(["SUSPEITA", "INDICIO"]), "INDICIO");
});

check("papéis: LEITURA nunca muda estado; COLABORADOR registra mas não decide; GESTOR/GERENTE/ADMINISTRADOR gerem", () => {
  const adv = { entity: "NCR", from: "DETECTADA", to: "TRIAGEM" };
  assert.ok(Q.evaluateTransition({ ...adv, role: "LEITURA" }).blockers.includes("FORBIDDEN"));
  assert.ok(Q.evaluateTransition({ ...adv, role: null }).blockers.includes("FORBIDDEN"));
  assert.ok(Q.evaluateTransition({ ...adv, role: "COLABORADOR" }).allowed);
  const cancel = { entity: "NCR", from: "DETECTADA", to: "CANCELADA", justification: "Registro criado por engano." };
  assert.ok(Q.evaluateTransition({ ...cancel, role: "COLABORADOR" }).blockers.includes("FORBIDDEN"));
  for (const role of ["GESTOR", "GERENTE", "ADMINISTRADOR"]) assert.ok(Q.evaluateTransition({ ...cancel, role }).allowed, role);
});

check("CASO 35: encerramento indevido — sem verificação, ineficaz, sem ação executada ou com verificação velha é bloqueado", () => {
  assert.ok(Q.evaluateTransition(baseClose).allowed, "caso feliz");
  const semVerif = Q.evaluateTransition({ ...baseClose, verifications: [] });
  assert.ok(semVerif.blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED"));
  const ineficaz = Q.evaluateTransition({ ...baseClose, verifications: [{ ...okVerification, result: "INEFICAZ" }] });
  assert.ok(ineficaz.blockers.includes("LATEST_VERIFICATION_NOT_EFFECTIVE"));
  const parcial = Q.evaluateTransition({ ...baseClose, verifications: [{ ...okVerification, result: "PARCIAL" }] });
  assert.ok(!parcial.allowed);
  const semEvid = Q.evaluateTransition({ ...baseClose, verifications: [{ ...okVerification, hasEvidence: false }] });
  assert.ok(semEvid.blockers.includes("VERIFICATION_EVIDENCE_REQUIRED"));
  const acoes = Q.evaluateTransition({ ...baseClose, actions: [{ status: "EXECUTADA" }, { status: "EM_ANDAMENTO" }] });
  assert.ok(acoes.blockers.includes("ACTIONS_NOT_EXECUTED"));
  const nenhuma = Q.evaluateTransition({ ...baseClose, actions: [{ status: "CANCELADA" }] });
  assert.ok(nenhuma.blockers.includes("NO_CORRECTIVE_ACTION"));
  const velha = Q.evaluateTransition({ ...baseClose, events: [...EVENTS_VERIF, { seq: 12, toState: "CORRECAO" }] });
  assert.ok(velha.blockers.includes("VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN"));
  // uma verificação EFICAZ antiga NÃO vale se a última é INEFICAZ
  const ultima = Q.evaluateTransition({ ...baseClose, verifications: [okVerification, { ...okVerification, result: "INEFICAZ" }] });
  assert.ok(ultima.blockers.includes("LATEST_VERIFICATION_NOT_EFFECTIVE"));
});

check("CASO 35b: 'correção executada' NÃO equivale a conformidade — VERIFICACAO exige ações executadas mas só ENCERRADA exige eficácia", () => {
  const toVerif = Q.evaluateTransition({ entity: "NCR", from: "CORRECAO", to: "VERIFICACAO", role: "COLABORADOR", actions: [{ status: "EXECUTADA" }] });
  assert.ok(toVerif.allowed);
  const direct = Q.findTransition("NCR", "CORRECAO", "ENCERRADA");
  assert.equal(direct, undefined);
});

check("CASO 36: reabertura — só ENCERRADA/NAO_CONFIRMADA, com justificativa+evidência; verificação anterior invalida o novo encerramento", () => {
  const reopen = Q.evaluateTransition({
    entity: "NCR", from: "ENCERRADA", to: "REABERTA", role: "GESTOR",
    justification: "Infiltração reapareceu após chuva.", evidenceIds: ["e9"],
  });
  assert.ok(reopen.allowed, reopen.blockers.join());
  assert.equal(Q.findTransition("NCR", "REABERTA", "ENCERRADA"), undefined, "reaberta não encerra direto");
  const events = [{ seq: 10, toState: "VERIFICACAO" }, { seq: 20, toState: "REABERTA" }, { seq: 30, toState: "CORRECAO" }, { seq: 31, toState: "VERIFICACAO" }];
  const stale = Q.evaluateTransition({ ...baseClose, events });
  assert.ok(stale.blockers.includes("VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN"));
  const renewed = Q.evaluateTransition({ ...baseClose, events, verifications: [okVerification, { result: "EFICAZ", hasEvidence: true, eventSeqAt: 31 }] });
  assert.ok(renewed.allowed, renewed.blockers.join());
});

check("DUPLICADA exige a RNC original", () => {
  const r = Q.evaluateTransition({ entity: "NCR", from: "TRIAGEM", to: "DUPLICADA", role: "GESTOR", justification: "Mesma foto SSMA da RNC-0001." });
  assert.ok(r.blockers.includes("DUPLICATE_TARGET_INVALID"));
  assert.ok(Q.evaluateTransition({ entity: "NCR", from: "TRIAGEM", to: "DUPLICADA", role: "GESTOR", justification: "Mesma foto SSMA da RNC-0001.", duplicateOfId: "x" }).allowed);
});

check("garantia: encerrar exige verificação EFICAZ vigente + aceite do cliente; reparo executado não basta", () => {
  const base = {
    entity: "WARRANTY", from: "VERIFICADA", to: "ENCERRADA", role: "GESTOR",
    justification: "Cliente aceitou o reparo em vistoria.", verifications: [{ result: "EFICAZ", hasEvidence: true, eventSeqAt: 5 }],
    events: [{ seq: 5, toState: "REPARADA" }], customerAccepted: true,
  };
  assert.ok(Q.evaluateTransition(base).allowed, Q.evaluateTransition(base).blockers.join());
  assert.ok(Q.evaluateTransition({ ...base, customerAccepted: false }).blockers.includes("CUSTOMER_ACCEPTANCE_REQUIRED"));
  assert.ok(Q.evaluateTransition({ ...base, verifications: [] }).blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED"));
  const reincidencia = Q.evaluateTransition({ ...base, events: [{ seq: 5, toState: "REPARADA" }, { seq: 9, toState: "EM_REPARO" }] });
  assert.ok(reincidencia.blockers.includes("VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN"));
  assert.ok(Q.evaluateTransition({ entity: "WARRANTY", from: "EM_REPARO", to: "REPARADA", role: "COLABORADOR" }).blockers.includes("REPAIR_RECORD_REQUIRED"));
});

check("CASO 1: falha estrutural em execução — SEGURANCA CRITICAL domina mesmo com prazo/custo baixos (nunca média)", () => {
  const r = Q.computeCriticality([
    { pillar: "PRAZO", severity: "LOW", sourceRef: "cron-1" },
    { pillar: "CUSTO", severity: "LOW", sourceRef: "orc-1" },
    { pillar: "SEGURANCA", severity: "CRITICAL", sourceRef: "laudo-estrutural-1" },
    { pillar: "QUALIDADE", severity: "MEDIUM", sourceRef: "rnc-1" },
  ]);
  assert.equal(r.criticality, "CRITICAL");
  assert.deepEqual(r.dominantPillars, ["SEGURANCA"]);
  assert.equal(Q.criticalityToRiskLevel(r.criticality), "CRITICAL");
});

check("CASO 34: impactos simultâneos nos 4 pilares — cada pilar preservado; empates listam todos os dominantes", () => {
  const r = Q.computeCriticality([
    { pillar: "PRAZO", severity: "HIGH", sourceRef: "a" },
    { pillar: "CUSTO", severity: "HIGH", sourceRef: "b" },
    { pillar: "SEGURANCA", severity: "MEDIUM", sourceRef: "c" },
    { pillar: "QUALIDADE", severity: "LOW", sourceRef: "d" },
    { pillar: "QUALIDADE", severity: "HIGH", sourceRef: "e" },
  ]);
  assert.equal(r.criticality, "HIGH");
  assert.deepEqual(r.dominantPillars, ["PRAZO", "CUSTO", "QUALIDADE"]);
  assert.deepEqual(r.byPillar, { PRAZO: "HIGH", CUSTO: "HIGH", SEGURANCA: "MEDIUM", QUALIDADE: "HIGH" });
  assert.deepEqual(r.pillarsWithoutData, []);
});

check("criticidade não é média: 1 CRITICAL + 3 LOW continua CRITICAL; 4 MEDIUM continua MEDIUM", () => {
  const four = (s) => ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"].map((pillar, i) => ({ pillar, severity: s[i], sourceRef: String(i) }));
  assert.equal(Q.computeCriticality(four(["LOW", "LOW", "LOW", "CRITICAL"])).criticality, "CRITICAL");
  assert.equal(Q.computeCriticality(four(["MEDIUM", "MEDIUM", "MEDIUM", "MEDIUM"])).criticality, "MEDIUM");
  assert.equal(Q.computeCriticality(four(["HIGH", "LOW", "LOW", "LOW"])).criticality, "HIGH");
});

check("CASO 33: dados insuficientes — sem consequência = SEM_DADOS (nunca baixo); lacunas e probabilidade sem base são sinalizadas", () => {
  const vazio = Q.computeCriticality([]);
  assert.equal(vazio.criticality, "SEM_DADOS");
  assert.equal(Q.criticalityToRiskLevel("SEM_DADOS"), null);
  assert.deepEqual(vazio.pillarsWithoutData, ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"]);
  const parcial = Q.computeCriticality([{ pillar: "PRAZO", severity: "LOW", probability: "PROVAVEL", probabilityBasis: null, sourceRef: null }]);
  assert.equal(parcial.criticality, "LOW");
  assert.ok(parcial.warnings.includes("PROBABILITY_WITHOUT_BASIS:PRAZO"));
  assert.ok(parcial.warnings.includes("CONSEQUENCE_WITHOUT_SOURCE:PRAZO"));
  assert.deepEqual(parcial.pillarsWithoutData, ["CUSTO", "SEGURANCA", "QUALIDADE"]);
  // probabilidade baixa NÃO reduz a severidade
  const rara = Q.computeCriticality([{ pillar: "SEGURANCA", severity: "CRITICAL", probability: "RARA", probabilityBasis: "histórico da obra", sourceRef: "x" }]);
  assert.equal(rara.criticality, "CRITICAL");
});

check("CASO 2: NC em foto SSMA — dedupe por referência de origem (mesma foto = mesma RNC; DUPLICADA/CANCELADA liberam)", () => {
  const key = Q.buildOriginKey("SSMA_FOTO", "ABCDEF-123");
  assert.equal(key, "SSMA_FOTO:abcdef-123");
  assert.equal(Q.buildOriginKey("ssma_foto", "  abcdef-123 "), key);
  assert.equal(Q.buildOriginKey("EMAIL", "<MSG-1@mail.exemplo.invalid>"), "EMAIL:msg-1@mail.exemplo.invalid");
  const existing = [{ id: "n1", state: "TRIAGEM", originKey: key }];
  assert.deepEqual(Q.decideNcrCreation(existing, "SSMA_FOTO", "abcdef-123"), { action: "LINK_EXISTING", originKey: key, existingId: "n1" });
  assert.equal(Q.decideNcrCreation(existing, "SSMA_FOTO", "outra-foto").action, "CREATE");
  assert.equal(Q.decideNcrCreation([{ id: "n1", state: "DUPLICADA", originKey: key }], "SSMA_FOTO", "abcdef-123").action, "CREATE");
  assert.equal(Q.decideNcrCreation([{ id: "n1", state: "CANCELADA", originKey: key }], "SSMA_FOTO", "abcdef-123").action, "CREATE");
  assert.notEqual(Q.buildOriginKey("EMAIL", "x"), Q.buildOriginKey("DOCUMENTO", "x"), "tipos diferentes não colidem");
});

check("alerta RESOLVIDO nunca encerra: guarda devolve alertResolutionClosesEntity=false e lista o que falta", () => {
  assert.equal(Q.mayAlertResolutionCloseEntity(), false);
  const sem = Q.alertResolvedGuard({ entity: "NCR", actions: [{ status: "EXECUTADA" }], verifications: [], events: [] });
  assert.equal(sem.alertResolutionClosesEntity, false);
  assert.equal(sem.closureReady, false);
  assert.ok(sem.blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED"));
  const pronto = Q.alertResolvedGuard({ entity: "NCR", actions: [{ status: "EXECUTADA" }], verifications: [okVerification], events: EVENTS_VERIF });
  assert.equal(pronto.closureReady, true);
  assert.equal(pronto.alertResolutionClosesEntity, false, "mesmo pronto, o alerta não encerra");
});

check("mappers: linha snake_case -> domínio; campo obrigatório ausente falha alto; erros das RPCs são tipados", () => {
  const n = Q.mapNcrRow({ id: "1", project_id: "p", code: "RNC-0001", title: "t", state: "TRIAGEM", origin_type: "EMAIL", origin_ref: "r", origin_key: "EMAIL:r", criticality: "HIGH", row_version: 3 });
  assert.equal(n.rowVersion, 3);
  assert.equal(n.criticality, "HIGH");
  assert.throws(() => Q.mapNcrRow({ id: "1" }), /obrigatório/);
  assert.equal(Q.mapVerificationRow({ result: "EFICAZ", evidence_id: "e", event_seq_at: "7" }).eventSeqAt, 7);
  assert.deepEqual(Q.parseQualityError("VERSION_CONFLICT: versão esperada 1"), { code: "VERSION_CONFLICT", detail: "versão esperada 1" });
  assert.equal(Q.parseQualityError("erro qualquer"), null);
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
