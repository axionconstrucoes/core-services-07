// FASE 3 / E — persistência de pareceres de garantia, checklist RCC e sujeitos esperados: testes PUROS (sem banco, sem rede, sem IA).
// O comportamento no banco é provado por scripts/test-f3e-persistencia-realpg.mjs (Postgres real). Aqui: contratos TS, validações,
// mapeadores, auditoria de sujeitos com expectativas persistidas, permissões espelhadas e garantias estáticas (nada de segredo/envio).
import { register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const W = await import("../apps/web/lib/ai/legal/warranty-coverage.ts");
const CF = await import("../apps/web/lib/garantias/coverage-form.ts");
const OP = await import("../apps/web/lib/garantias/opinion.ts");
const PS = await import("../apps/web/lib/insurance-ui/persistence.ts");
const PD = await import("../apps/web/lib/insurance-ui/persistence-data.ts");
const RCC = await import("../apps/web/lib/insurance/rcc-checklist.ts");
const SA = await import("../apps/web/lib/insurance/subjects-audit.ts");
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
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`);
    failed += 1;
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
const throws = (fn, re, m) => { try { fn(); } catch (e) { ok(re.test(e.message), `${m}: erro inesperado ${e.message}`); return; } throw new Error(`${m}: deveria lançar`); };

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";
const SRC = "Contrato 001, cláusula 7";
function fullForm(signals = {}) {
  const f = CF.emptyCoverageForm();
  for (const def of W.WARRANTY_COVERAGE_ITEMS) {
    f.items[def.key] = def.optional
      ? { status: "NAO_APLICAVEL", value: "", source: "Não cabível (justificativa)" }
      : { status: "PREENCHIDO", value: `conteúdo ${def.key}`, source: SRC };
  }
  f.signals = { contractualWarranty: "VIGENTE", legalWarrantyPotential: "SIM", hiddenDefect: "NAO", claimDeadline: "DENTRO", maintenance: "COMPROVADA", legalControversy: false, ...signals };
  return f;
}

// ----------------------------------------------------------------------------------------------- parecer
check("CASO F3-E-01 (puro) payload do parecer: 16 itens na ordem, conclusão DERIVADA, versão do motor/referências e snapshot das referências", () => {
  const b = OP.buildOpinionPayload(fullForm());
  ok(b.ok, "formulário completo deve gerar payload");
  const p = b.payload;
  eq(p.items.map((i) => i.key), W.WARRANTY_COVERAGE_ITEMS.map((d) => d.key), "ordem dos 16 itens");
  eq(p.conclusion, "POTENCIALMENTE COBERTO", "conclusão derivada");
  eq(p.engineVersion, OP.WARRANTY_COVERAGE_ENGINE_VERSION, "engine_version");
  ok(/refs\/\d{4}-\d{2}-\d{2}/.test(p.engineVersion) && p.referencesVersion, "versão das referências no motor e separada");
  ok(p.referencesSnapshot.length > 0 && p.referencesSnapshot.every((r) => r.id && r.verification && typeof r.isSecondary === "boolean"), "snapshot: id, estado de verificação, fonte secundária");
});

check("CASO F3-E-02 (puro) conclusão nunca vem do navegador: o payload ignora qualquer conclusão no formulário e recalcula", () => {
  const f = fullForm({ legalControversy: true });
  f.conclusion = "POTENCIALMENTE COBERTO"; // tentativa de injeção
  const b = OP.buildOpinionPayload(f);
  ok(b.ok && b.payload.conclusion === "COBERTURA CONDICIONADA", "recalculada a partir dos sinais");
  const clean = OP.sanitizeCoverageForm({ ...f, items: f.items, signals: { ...f.signals, extra: "x" } });
  ok(!("conclusion" in clean) && !("extra" in clean.signals), "sanitização remove chaves desconhecidas");
});

check("CASO F3-E-03 (puro) item PREENCHIDO sem fonte impede o payload; NAO_APLICAVEL sem justificativa também", () => {
  const f = fullForm(); f.items["tipo-defeito"].source = "";
  const b = OP.buildOpinionPayload(f);
  ok(!b.ok && b.errors.some((e) => /tipo-defeito.*PREENCHIDO sem valor\/evidência/.test(e)), "sem fonte");
  const g = fullForm(); g.items["prazo-decadencial"].source = "";
  ok(!OP.buildOpinionPayload(g).ok, "NAO_APLICAVEL sem justificativa");
  const h = fullForm(); h.items["vicio-oculto"].status = "NAO_APLICAVEL";
  ok(!OP.buildOpinionPayload(h).ok, "NAO_APLICAVEL em item obrigatório");
});

check("CASO 11/14 (puro) linguagem proibida bloqueia a gravação: cinco anos universal e exclusão automática por expiração", () => {
  const f = fullForm(); f.items.fundamentacao.value = "Aplica-se o prazo de cinco anos para todo e qualquer defeito, sem exceção.";
  const b = OP.buildOpinionPayload(f);
  ok(!b.ok, `deveria bloquear: ${JSON.stringify(b)}`);
  const g = fullForm(); g.items.fundamentacao.value = "A garantia contratual expirou, logo não cabe qualquer reclamação, sem direito a reparo.";
  ok(!OP.buildOpinionPayload(g).ok, "exclusão automática por expiração");
});

check("CASO 33 (puro) dados insuficientes: formulário vazio gera INFORMAÇÕES INSUFICIENTES com os itens SEM DADOS listados (nunca 'não coberto')", () => {
  const b = OP.buildOpinionPayload(CF.emptyCoverageForm());
  ok(b.ok, "vazio é gravável (é um registro de que faltam dados)");
  eq(b.payload.conclusion, "INFORMAÇÕES INSUFICIENTES", "conclusão");
  ok(b.payload.missing.length >= 7, "faltantes listados");
  ok(b.payload.items.every((i) => i.status !== "PREENCHIDO"), "nenhum item inventado");
});

check("mapOpinionVersions / formFromOpinion: ida e volta preserva fontes e sinais; entrada inesperada => lista vazia; versão defasada detectada", () => {
  const b = OP.buildOpinionPayload(fullForm({ hiddenDefect: "SIM" }));
  const raw = [{ id: UUID, versionNo: 2, engineVersion: "antigo", items: b.payload.items, signals: b.payload.signals, conclusion: b.payload.conclusion, reasons: b.payload.reasons, missing: [], legalControversy: false, routeToHuman: false, referencesSnapshot: b.payload.referencesSnapshot, referencesVersion: "x", note: null, supersedesId: UUID2, createdBy: UUID, createdAt: "2026-11-23T10:00:00Z" }];
  const v = OP.mapOpinionVersions(raw);
  eq(v.length, 1, "uma versão");
  eq(v[0].versionNo, 2, "número");
  ok(OP.isOpinionStale(v[0]), "engine diferente => desatualizada");
  const f = OP.formFromOpinion(v[0]);
  eq(f.items["tipo-defeito"].source, SRC, "fonte recarregada");
  eq(f.signals.hiddenDefect, "SIM", "sinal recarregado");
  eq(OP.mapOpinionVersions(null), [], "null"); eq(OP.mapOpinionVersions("x"), [], "texto"); eq(OP.mapOpinionVersions([{ foo: 1 }]), [], "linha sem id/versão");
  ok(!OP.isOpinionStale({ engineVersion: OP.WARRANTY_COVERAGE_ENGINE_VERSION }), "versão atual não é defasada");
});

check("mapOpinionError: códigos estáveis do banco viram mensagens claras; erro desconhecido não vaza SQL", () => {
  for (const code of ["VERSION_CONFLICT", "CONCLUSION_MISMATCH", "ITEM_SOURCE_REQUIRED", "FORBIDDEN", "AUTH_REQUIRED", "INVALID_ITEMS", "INVALID_SIGNALS"]) {
    const r = OP.mapOpinionError({ message: `${code}: detalhe` });
    eq(r.code, code, `código ${code}`); ok(r.message.length > 20, `mensagem ${code}`);
  }
  const u = OP.mapOpinionError({ message: 'insert into "quality_warranty_coverage_opinions" (secret) failed', code: "XX000" });
  eq(u.code, "UNKNOWN", "desconhecido"); ok(!/insert|secret|quality_warranty/.test(u.message), "sem vazar SQL");
  eq(OP.mapOpinionError({ message: "x", code: "42501" }).code, "FORBIDDEN", "42501 => FORBIDDEN");
  eq(OP.mapOpinionError({ message: "x", code: "42883" }).code, "UNAVAILABLE", "função inexistente => indisponível");
});

// ----------------------------------------------------------------------------------------------- RCC
const rccAll = () => {
  const a = {};
  for (const q of RCC.RCC_QUESTIONS) a[q.key] = { answer: `resposta ${q.key}`, source: { ref: "Apólice cl. 3" } };
  a.BENS_TERCEIROS_X_PROPRIA_OBRA.propertyScope = "BENS_TERCEIROS";
  return a;
};

check("CASO F3-E-04 (puro) RCC: resposta sem fonte é recusada ANTES de ir ao servidor; sem resposta = SEM DADOS (omitida); escopo obrigatório", () => {
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "rcc_save", policyId: UUID2, expectedVersion: 0, rccAnswers: { CAUSADOR: { answer: "Subcontratada X" } } }), /fonte/i, "sem fonte");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "rcc_save", policyId: UUID2, expectedVersion: 0, rccAnswers: { VITIMA: { answer: "", source: { ref: "r" } } } }), /sem resposta/i, "fonte sem resposta");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "rcc_save", policyId: UUID2, expectedVersion: 0, rccAnswers: { BENS_TERCEIROS_X_PROPRIA_OBRA: { answer: "x", source: { ref: "r" } } } }), /natureza do bem/i, "escopo");
  const call = PS.buildPersistenceCall({ projectId: UUID, op: "rcc_save", policyId: UUID2, expectedVersion: 0, rccAnswers: { CAUSADOR: { answer: "Subcontratada X", source: { ref: "RO 12" } }, VITIMA: { answer: "   " } } });
  eq(call.rpc, "insurance_rcc_checklist_save", "RPC");
  eq(call.params.p_items, [{ key: "CAUSADOR", answer: "Subcontratada X", sourceRef: "RO 12" }], "só o respondido (o resto é SEM DADOS no banco)");
  eq(call.level, "REGISTER", "nível");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "rcc_save", policyId: UUID2, rccAnswers: rccAll() }), /versão/i, "sem versão esperada");
});

check("CASO 19/20 (puro) RCC: nada presumido — 10/10 com fonte é 'pronto' só com revisão humana; própria obra gera aviso", () => {
  const a = rccAll(); a.BENS_TERCEIROS_X_PROPRIA_OBRA.propertyScope = "PROPRIA_OBRA";
  const ev = RCC.evaluateRccChecklist(a);
  ok(ev.readyForCoverageAssessment && ev.requiresHumanReview === true, "10/10");
  ok(ev.warnings.some((w) => /NÃO presumir cobertura/.test(w)), "própria obra: não presumir");
  ok(ev.neverPresumed.length >= 3, "nunca presumido");
  const call = PS.buildPersistenceCall({ projectId: UUID, op: "rcc_save", policyId: UUID2, expectedVersion: 3, rccAnswers: a, note: "  revisão  " });
  eq(call.params.p_items.length, 10, "10 respostas"); eq(call.params.p_note, "revisão", "nota aparada");
  eq(call.params.p_items.find((i) => i.key === "BENS_TERCEIROS_X_PROPRIA_OBRA").propertyScope, "PROPRIA_OBRA", "escopo enviado");
});

check("mapRccGet: reconstrói respostas com fonte; linhas SEM DADOS ficam fora; entrada vazia => sem versão", () => {
  const got = PS.mapRccGet({ latest: { id: UUID, versionNo: 2, policyId: UUID2, claimId: null, note: null, createdBy: UUID, createdAt: "2026-11-23T10:00:00Z",
    items: [{ key: "CAUSADOR", answer: "X", sourceDocumentId: UUID, sourceRef: "cl. 3", sourcePage: "4", propertyScope: null }, { key: "VITIMA", answer: null }, { key: "XPTO", answer: "y" }] },
    versions: [{ id: UUID, versionNo: 2, answered: 1, createdBy: UUID, createdAt: "x" }] });
  eq(Object.keys(got.latest.answers), ["CAUSADOR"], "só respondida e conhecida");
  eq(got.latest.answers.CAUSADOR.source, { documentId: UUID, ref: "cl. 3", page: "4" }, "fonte");
  eq(PS.mapRccGet(null), { latest: null, versions: [] }, "vazio");
});

// ----------------------------------------------------------------------------------------------- sujeitos esperados
check("sujeitos esperados: validação local exige fonte, nome/CNPJ quando ESPERADO e nenhum quando NAO_ESPERADO", () => {
  const base = { partyRole: "SEGURADO", expectation: "ESPERADO", expectedName: "Construtora Alfa", sourceKind: "CONTRATO", sourceRef: "cl. 2" };
  eq(PS.validateExpectedSubjectForm(base), [], "válido");
  ok(PS.validateExpectedSubjectForm({ ...base, sourceRef: "" }).some((e) => /fonte/i.test(e)), "sem fonte");
  ok(PS.validateExpectedSubjectForm({ ...base, expectedName: "" }).some((e) => /nome/i.test(e)), "sem nome/CNPJ");
  ok(PS.validateExpectedSubjectForm({ ...base, expectation: "NAO_ESPERADO" }).some((e) => /não leva nome/i.test(e)), "NAO_ESPERADO com nome");
  ok(PS.validateExpectedSubjectForm({ ...base, partyRole: "CORRETOR" }).length > 0, "papel inválido");
  ok(PS.validateExpectedSubjectForm({ ...base, sourceKind: "BOATO" }).length > 0, "tipo de fonte inválido");
  const call = PS.buildPersistenceCall({ projectId: UUID, op: "subject_save", policyId: UUID2, expectedVersion: 0, subject: base });
  eq(call.level, "MANAGE", "nível MANAGE (altera o parâmetro da auditoria)");
  eq(call.rpc, "insurance_expected_subject_save", "RPC");
  eq(call.params.p_data, { party_role: "SEGURADO", expectation: "ESPERADO", source_kind: "CONTRATO", expected_name: "Construtora Alfa", source_ref: "cl. 2" }, "dados");
});

check("CASO 21/22 (puro) auditoria compara apólice x esperados PERSISTIDOS: segurado incorreto, beneficiário final não identificado, divergência com a fonte, NAO_ESPERADO; nada presumido", () => {
  const parties = [
    { role: "SEGURADO", name: "Construtora Alfa Ltda", taxId: "11.111.111/0001-11", identificationStatus: "IDENTIFICADO" },
    { role: "TOMADOR", name: "Axion", identificationStatus: "IDENTIFICADO" },
    { role: "SEGURADORA", name: "Seguradora X", identificationStatus: "IDENTIFICADO" },
  ];
  const view = (partyRole, expectation, extra = {}) => ({ id: UUID, partyRole, expectation, expectedName: null, expectedTaxId: null, sourceKind: "CONTRATO", sourceDocumentId: null, sourceRef: "cl. 2", versionNo: 1, note: null, createdBy: UUID, createdAt: "", ...extra });
  const codes = (cur) => SA.auditPolicySubjects(parties, PS.toAuditExpected(cur)).findings.map((f) => f.code);
  ok(codes([]).includes("SEGURADO_NAO_CONFERIDO"), "sem expectativa: não conferido");
  ok(codes([view("SEGURADO", "ESPERADO", { expectedName: "Beta SA", expectedTaxId: "22222222000122" })]).includes("SEGURADO_INCORRETO"), "CASO 21");
  ok(!codes([view("SEGURADO", "ESPERADO", { expectedTaxId: "11111111000111" })]).includes("SEGURADO_INCORRETO"), "CNPJ coincide");
  ok(codes([view("PROPRIETARIO_FINAL", "ESPERADO", { expectedName: "Cliente Final" })]).includes("BENEFICIARIO_FINAL_NAO_IDENTIFICADO"), "CASO 22");
  ok(!codes([view("PROPRIETARIO_FINAL", "NAO_ESPERADO")]).includes("BENEFICIARIO_FINAL_NAO_IDENTIFICADO"), "NAO_ESPERADO não exige identificação");
  const withFinal = [...parties, { role: "PROPRIETARIO_FINAL", name: "Outra Empresa", identificationStatus: "IDENTIFICADO" }];
  const a = SA.auditPolicySubjects(withFinal, PS.toAuditExpected([view("PROPRIETARIO_FINAL", "ESPERADO", { expectedName: "Cliente Final", sourceKind: "EDITAL" })]));
  const d = a.findings.find((f) => f.code === "SUJEITO_ESPERADO_DIVERGENTE");
  ok(d && d.epistemic === "INFERENCIA" && /Edital/.test(d.text), "divergência é inferência e cita a fonte");
  ok(!a.findings.some((f) => f.code === "SEGURADO_INCORRETO"), "beneficiário divergente não vira erro de segurado");
  ok(a.findings.every((f) => f.code !== "SEGURADO_INCORRETO"), "sem presumir beneficiário = segurado");
  ok(a.notes.some((n) => /Não se presume que o beneficiário final deva figurar como segurado/.test(n)), "nota permanente");
  const none = SA.auditPolicySubjects(withFinal, PS.toAuditExpected([view("PROPRIETARIO_FINAL", "NAO_ESPERADO")]));
  ok(none.findings.some((f) => f.code === "SUJEITO_NAO_ESPERADO_CADASTRADO" && f.severity === "INFO"), "NAO_ESPERADO cadastrado => INFO");
  // retrocompatibilidade: chamada sem expectedByRole continua idêntica
  const legacy = SA.auditPolicySubjects(parties, { insured: { name: "Incorporadora Beta" } });
  ok(legacy.findings.some((f) => f.code === "SEGURADO_INCORRETO"), "entrada antiga ainda funciona");
});

check("currentExpectedFor/latestRccFor: vigente = maior versão por apólice e papel; outra apólice não vaza", () => {
  const v = (policyId, partyRole, versionNo) => ({ id: `${policyId}-${partyRole}-${versionNo}`, policyId, partyRole, expectation: "ESPERADO", versionNo });
  const cur = PD.currentExpectedFor([v("A", "SEGURADO", 1), v("A", "SEGURADO", 3), v("A", "TOMADOR", 1), v("B", "SEGURADO", 9)], "A");
  eq(cur.map((c) => [c.partyRole, c.versionNo]).sort(), [["SEGURADO", 3], ["TOMADOR", 1]], "vigentes de A");
  const r = PD.latestRccFor([{ id: "1", policyId: "A", claimId: null, versionNo: 1, answers: {} }, { id: "2", policyId: "A", claimId: null, versionNo: 2, answers: {} }, { id: "3", policyId: "A", claimId: "E", versionNo: 7, answers: {} }, { id: "4", policyId: "B", claimId: null, versionNo: 5, answers: {} }], "A");
  eq([r.latest.versionNo, r.versions.length], [2, 2], "vigente sem evento; B e evento fora");
});

// ----------------------------------------------------------------------------------------------- permissões e segurança
check("CASO 31 (puro) permissões espelhadas: RCC grava com REGISTER, sujeitos esperados com MANAGE, leitura com READ; sem papel => nada", () => {
  const roles = { LEITURA: [false, false, true], COLABORADOR: [true, false, true], GESTOR: [true, true, true], GERENTE: [true, true, true], ADMINISTRADOR: [true, true, true] };
  for (const [role, [rcc, subj, read]] of Object.entries(roles)) {
    eq(PS.isPersistenceOpAllowed(role, "rcc_save"), rcc, `${role} rcc_save`);
    eq(PS.isPersistenceOpAllowed(role, "subject_save"), subj, `${role} subject_save`);
    eq(PS.isPersistenceOpAllowed(role, "rcc_get") && PS.isPersistenceOpAllowed(role, "subjects_get"), read, `${role} leitura`);
  }
  for (const op of PS.ALL_PERSISTENCE_OPS) ok(!PS.isPersistenceOpAllowed(null, op) && !PS.isPersistenceOpAllowed(undefined, op), `sem papel: ${op}`);
  ok(!PS.isPersistenceOp("send_mail") && !PS.isPersistenceOp("real_send") && PS.ALL_PERSISTENCE_OPS.length === 4, "só 4 operações; nenhuma de envio");
});

check("CASO 38/39 (puro) entradas inválidas nunca chegam ao banco: UUIDs, versão ausente/negativa, operação desconhecida", () => {
  throws(() => PS.buildPersistenceCall({ projectId: "x", op: "rcc_get", policyId: UUID2 }), /Projeto inválido/, "projeto");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "rcc_get", policyId: "x" }), /Apólice inválida/, "apólice");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "rcc_get", policyId: UUID2, claimId: "x" }), /Evento/, "evento");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "subject_save", policyId: UUID2, expectedVersion: -1, subject: { partyRole: "SEGURADO", expectation: "ESPERADO", expectedName: "A", sourceKind: "CONTRATO", sourceRef: "r" } }), /Versão/, "versão negativa");
  throws(() => PS.buildPersistenceCall({ projectId: UUID, op: "xpto", policyId: UUID2 }), /desconhecida/, "operação");
});

check("mapPersistenceError: códigos do RCC/sujeitos têm mensagem própria; VERSION_CONFLICT marca conflito; SQL não vaza", () => {
  eq(PS.mapPersistenceError({ message: "VERSION_CONFLICT: esperado 1, atual 2" }).conflict, true, "conflito");
  for (const c of ["SOURCE_REQUIRED", "PROPERTY_SCOPE_REQUIRED", "CLAIM_POLICY_MISMATCH", "INVALID_ITEMS", "FORBIDDEN", "REFERENCE_OUT_OF_PROJECT"]) ok(PS.mapPersistenceError({ message: `${c}: x` }).code === c, c);
  const u = PS.mapPersistenceError({ message: "select * from insurance_rcc_checklists", code: "XX000" });
  ok(u.code === "UNKNOWN" && !/select|insurance_rcc/.test(u.message), "não vaza");
});

check("CASO 32 (estático) nenhum código novo envia comunicação nem usa segredo/cliente administrativo; migrations só como arquivos, sem trava de envio", () => {
  const files = ["apps/web/app/[projectId]/garantias/actions-parecer.ts", "apps/web/app/[projectId]/seguros/actions-persistencia.ts", "apps/web/lib/garantias/opinion.ts", "apps/web/lib/garantias/opinion-data.ts",
    "apps/web/lib/insurance-ui/persistence.ts", "apps/web/lib/insurance-ui/persistence-data.ts", "apps/web/components/garantias/coverage-history.tsx", "apps/web/components/insurance/panel-subjects-persisted.tsx"];
  for (const f of files) {
    const src = read(f);
    ok(!/service_role|SERVICE_ROLE|createSupabaseAdminClient|process\.env|sendMail|send_mail|nodemailer|resend|smtp|fetch\(/i.test(src), `${f}: sem segredo/envio/rede`);
  }
  for (const f of ["20261123400000_f3e_persistence_model", "20261123401000_f3e_warranty_opinion_rpcs", "20261123402000_f3e_insurance_persistence_rpcs"]) {
    const sql = read(`supabase/migrations/${f}.sql`);
    ok(!/real_send_enabled\s*=|update\s+public\.insurance_settings|record_risk_alert_action|sla_matrix|drop\s+table\s+public\.(?!f3e)/i.test(sql.replace(/--.*$/gm, "")), `${f}: não toca trava de envio, hotfix P0 nem SLAs`);
    ok(!/create or replace function public\.(quality_can_|insurance_access|acc_project_tier|has_project_permission|record_risk_alert_action)/i.test(sql), `${f}: não redefine funções de permissão existentes`);
  }
});

check("RLS e append-only declarados nas 4 tabelas novas (inspeção do SQL): select só por wrapper central; sem policy de escrita; triggers de bloqueio", () => {
  const sql = read("supabase/migrations/20261123400000_f3e_persistence_model.sql");
  for (const t of ["quality_warranty_coverage_opinions", "insurance_rcc_checklists", "insurance_rcc_checklist_items", "insurance_expected_subjects"]) {
    ok(new RegExp(`'${t}'`).test(sql) || new RegExp(`public\\.${t}`).test(sql), `${t} presente`);
  }
  ok(/enable row level security/.test(sql) && /quality_can_read\(project_id\)/.test(sql) && /insurance_access\(project_id, ''READ''\)/.test(sql), "RLS com wrappers centrais");
  ok(!/create policy [^;]*for (insert|update|delete|all)/i.test(sql), "nenhuma policy de escrita");
  ok(/before update or delete/.test(sql) && /before truncate/.test(sql), "triggers append-only e anti-truncate");
  ok(/grant select on/.test(sql) && !/grant (insert|update|delete)/i.test(sql), "só SELECT concedido");
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
