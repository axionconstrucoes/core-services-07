// FASE 3 / E — REVISÃO FUNCIONAL de Garantias e Seguros: cada defeito corrigido tem um teste que FALHARIA no código anterior.
// Puro (sem banco, sem rede, sem IA). Defeitos: (1) garantia legal potencial com prazo FORA era "potencialmente coberto";
// (2) exclusão/condição SEM fonte aplicável ao evento era ignorada em silêncio (falso conforto); (3) data do evento com hora do último
// dia da vigência virava "fora da vigência"; (4) "1.500" em Garantias virava R$ 1,50; (5) fiança/caução exibiam "Regulação" da seguradora.
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const W = await import("../apps/web/lib/ai/legal/warranty-coverage.ts");
const I = await import("../apps/web/lib/insurance/index.ts");
const AL = await import("../apps/web/lib/garantias/action-logic.ts");
const CL = await import("../apps/web/lib/insurance-ui/claim-labels.ts");
const LB = await import("../apps/web/lib/insurance-ui/labels.ts");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`);
    failed += 1;
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const items = () => W.WARRANTY_COVERAGE_ITEMS.map((d) => (d.optional ? { key: d.key, status: "NAO_APLICAVEL", value: null, evidence: "não cabível" } : { key: d.key, status: "PREENCHIDO", value: `v ${d.key}`, evidence: "fonte" }));
const sig = (o = {}) => ({ contractualWarranty: "VIGENTE", legalWarrantyPotential: "SIM", hiddenDefect: "NAO", claimDeadline: "DENTRO", maintenance: "COMPROVADA", legalControversy: false, ...o });

check("CASO 11 (revisão) garantia legal potencial SIM com prazo de reclamação FORA NÃO é 'potencialmente coberto' (vira condicionada; humano decide)", () => {
  const foraVigente = W.deriveWarrantyCoverage({ items: items(), signals: sig({ claimDeadline: "FORA" }) });
  eq(foraVigente.conclusion, "COBERTURA CONDICIONADA", "vigente + FORA");
  const foraDecorrida = W.deriveWarrantyCoverage({ items: items(), signals: sig({ contractualWarranty: "DECORRIDA", claimDeadline: "FORA" }) });
  eq(foraDecorrida.conclusion, "COBERTURA CONDICIONADA", "decorrida + legal SIM + FORA");
  ok(foraDecorrida.reasons.some((r) => /NÃO exclui automaticamente/.test(r)), "expiração não exclui automaticamente");
  eq(W.deriveWarrantyCoverage({ items: items(), signals: sig() }).conclusion, "POTENCIALMENTE COBERTO", "dentro do prazo continua coberto");
  eq(W.deriveWarrantyCoverage({ items: items(), signals: sig({ legalWarrantyPotential: "NAO" }) }).conclusion, "POTENCIALMENTE COBERTO", "contratual vigente + dentro (legal NAO) continua coberto");
  eq(W.deriveWarrantyCoverage({ items: items(), signals: sig({ contractualWarranty: "DECORRIDA", legalWarrantyPotential: "NAO", claimDeadline: "DENTRO" }) }).conclusion, "COBERTURA CONDICIONADA", "decorrida + legal NAO + dentro: sem regime aplicável conclusivo");
});

const src = { ref: "Apólice p.3" };
const base = { modality: "SEGURO_GARANTIA_EXECUTANTE", claimKind: "INADIMPLEMENTO", eventDate: "2026-06-01", policy: { coverageStart: "2026-01-01", coverageEnd: "2027-01-01" } };
const clause = (kind, appliesTo, extra = {}) => ({ id: `${kind}-${appliesTo.join()}`, kind, title: `${kind} sintética`, appliesTo, source: src, verified: true, ...extra });

check("CASO 28/33 (revisão) exclusão/condição/franquia/sublimite SEM fonte aplicável ao evento não é ignorada: cobertura vira CONDICIONADO com o motivo; sem cláusula restritiva continua POTENCIALMENTE_COBERTO", () => {
  for (const kind of ["EXCLUSAO", "CONDICAO", "FRANQUIA", "SUBLIMITE"]) {
    const a = I.assessCoverage({ ...base, clauses: [clause("COBERTURA", ["INADIMPLEMENTO"]), clause(kind, ["INADIMPLEMENTO"], { source: {} })] });
    eq(a.conclusion, "CONDICIONADO", `${kind} sem fonte`);
    ok(a.reasons.some((r) => r.code === "CLAUSULA_RESTRITIVA_SEM_FONTE" && r.epistemic === "FATO"), `${kind}: motivo registrado como fato`);
    ok(a.requiresHumanReview && a.automatic === false, "revisão humana");
  }
  eq(I.assessCoverage({ ...base, clauses: [clause("COBERTURA", ["INADIMPLEMENTO"])] }).conclusion, "POTENCIALMENTE_COBERTO", "sem restritiva: inalterado");
  // restritiva sem fonte para OUTRO tipo de evento não interfere
  eq(I.assessCoverage({ ...base, clauses: [clause("COBERTURA", ["INADIMPLEMENTO"]), clause("EXCLUSAO", ["ATRASO"], { source: {} })] }).conclusion, "POTENCIALMENTE_COBERTO", "exclusão de outro tipo de evento");
  // exclusão COM fonte continua prevalecendo
  eq(I.assessCoverage({ ...base, clauses: [clause("COBERTURA", ["INADIMPLEMENTO"]), clause("EXCLUSAO", ["INADIMPLEMENTO"])] }).conclusion, "NAO_COBERTO", "exclusão com fonte prevalece");
  // cobertura SEM fonte continua sendo desconsiderada (CASO 33)
  eq(I.assessCoverage({ ...base, clauses: [clause("COBERTURA", ["INADIMPLEMENTO"], { source: {} })] }).conclusion, "INFORMACOES_INSUFICIENTES", "cobertura sem fonte");
});

check("CASO 15/16 (revisão) vigência compara a DATA: instante ISO no último dia da vigência não é 'fora da vigência'; o dia seguinte é", () => {
  const cl = [clause("COBERTURA", ["INADIMPLEMENTO"])];
  eq(I.assessCoverage({ ...base, eventDate: "2027-01-01T10:30:00Z", clauses: cl }).conclusion, "POTENCIALMENTE_COBERTO", "último dia com hora");
  eq(I.assessCoverage({ ...base, eventDate: "2026-01-01T00:00:00Z", clauses: cl }).conclusion, "POTENCIALMENTE_COBERTO", "primeiro dia com hora");
  eq(I.assessCoverage({ ...base, eventDate: "2027-01-02", clauses: cl }).conclusion, "CONDICIONADO", "dia seguinte");
  eq(I.assessCoverage({ ...base, eventDate: "2025-12-31T23:59:59Z", clauses: cl }).conclusion, "CONDICIONADO", "dia anterior ao início");
  eq(I.assessCoverage({ ...base, claimKind: "ATRASO", clauses: [clause("COBERTURA", ["ATRASO"])] }).conclusion, "POTENCIALMENTE_COBERTO", "Performance Bond por atraso (CASO 16)");
});

check("CASO 17 (revisão) Garantias: '1.500' é mil e quinhentos (não 1,50); formatos pt-BR e ponto decimal preservados; negativo/ilegível recusados", () => {
  const p = (v) => { const errors = []; const r = AL.parseMoney({ x: v }, "x", "Custo", errors); return [r, errors.length]; };
  eq(p("1.500"), [1500, 0], "1.500");
  eq(p("12.345.678"), [12345678, 0], "12.345.678");
  eq(p("1.234,56"), [1234.56, 0], "1.234,56");
  eq(p("1234,56"), [1234.56, 0], "1234,56");
  eq(p("1234.56"), [1234.56, 0], "1234.56");
  eq(p("R$ 2.000"), [2000, 0], "R$ 2.000");
  eq(p("0.5"), [0.5, 0], "0.5");
  eq(p(""), [null, 0], "vazio = SEM DADOS");
  eq(p("-3")[1], 1, "negativo");
  eq(p("abc")[1], 1, "ilegível");
});

check("CASO 18 (revisão) fiança bancária/caução: etapas com termos do BANCO/EMISSOR (sem 'Regulação' da seguradora); seguro e instrumento ausente mantêm os rótulos padrão", () => {
  eq(CL.claimStageLabelFor("REGULACAO", "SEGURO"), LB.CLAIM_STAGE_LABEL.REGULACAO, "seguro inalterado");
  eq(CL.claimStageLabelFor("REGULACAO", "SEM_INSTRUMENTO"), LB.CLAIM_STAGE_LABEL.REGULACAO, "sem instrumento: padrão (nada presumido)");
  for (const kind of ["FIANCA_BANCARIA", "CAUCAO", "CARTA_FIANCA_NAO_BANCARIA", "OUTRA_GARANTIA"]) {
    for (const stage of Object.keys(LB.CLAIM_STAGE_LABEL)) {
      const l = CL.claimStageLabelFor(stage, kind);
      ok(l && !/seguradora|sinistro|regula/i.test(l), `${kind}/${stage}: "${l}" não deve usar termos da seguradora`);
    }
  }
  ok(/banco/i.test(CL.claimStageLabelFor("AVISO", "FIANCA_BANCARIA")) && /emissor/i.test(CL.claimStageLabelFor("AVISO", "CAUCAO")), "contraparte correta");
  eq(CL.claimStageLabelFor("XPTO", "FIANCA_BANCARIA"), "XPTO", "estágio desconhecido não é inventado");
  ok(I.claimFlowFor("FIANCA_BANCARIA").assumptions.firstDemandPresumed === false, "primeira demanda não presumida (inalterado)");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
