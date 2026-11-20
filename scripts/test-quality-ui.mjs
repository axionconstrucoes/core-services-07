// Testes da UI do módulo Qualidade (fase 2, agente U1): modelo de apresentação, comandos de escrita (cliente simulado), consultas
// (isolamento por projeto) e análise estática dos componentes. Sem banco real, sem rede, sem IA. Nada depende de data fixa.
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-quality-ui.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const M = await import("../apps/web/lib/quality/ui-model.ts");
const C = await import("../apps/web/lib/quality/ui-commands.ts");
const Q = await import("../apps/web/lib/quality/ui-queries.ts");
const K = await import("../apps/web/lib/quality/criticality.ts");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rd = (p) => readFileSync(path.join(root, p), "utf8");
let passed = 0, failed = 0;
const check = async (n, fn) => { try { await fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

// ---------------------------------------------------------------- cliente simulado ----
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P1 = U(1), P2 = U(2), NCR = U(10), EV = U(20);
function mockDb({ rpc = {}, tables = {} } = {}) {
  const calls = [];
  const db = {
    calls,
    from(table) {
      const op = { table, ops: [] };
      calls.push(op);
      const chain = new Proxy({}, {
        get(_t, prop) {
          if (prop === "then") return (res) => Promise.resolve(tables[table]?.(op) ?? { data: [], error: null }).then(res);
          return (...args) => { op.ops.push([prop, ...args]); return chain; };
        },
      });
      return chain;
    },
    rpc(fn, args) { calls.push({ rpc: fn, args }); return Promise.resolve(rpc[fn] ? rpc[fn](args) : { data: null, error: null }); },
  };
  return db;
}
const fd = (o) => ({ get: (k) => (k in o && !Array.isArray(o[k]) ? o[k] : null), getAll: (k) => (Array.isArray(o[k]) ? o[k] : k in o ? [o[k]] : []) });
const ctx = (role, db = mockDb(), projectId = P1) => ({ db, role, projectId });
const eqOf = (op, col) => op.ops.filter((o) => o[0] === "eq" && o[1] === col).map((o) => o[2]);

// ------------------------------------------------------------------ CASO 01 ----
await check("CASO 01 falha estrutural em execução: pior pilar domina (SEGURANÇA crítica com prazo/custo baixos) e selo Crítica", () => {
  const r = K.computeCriticality([
    { pillar: "PRAZO", severity: "LOW", sourceRef: "cronograma" },
    { pillar: "CUSTO", severity: "LOW", sourceRef: "orçamento" },
    { pillar: "SEGURANCA", severity: "CRITICAL", sourceRef: "laudo estrutural" },
  ]);
  ok(r.criticality === "CRITICAL" && r.dominantPillars.join() === "SEGURANCA", JSON.stringify(r));
  ok(M.criticalityToSeverity("CRITICAL") === "CRITICA" && M.criticalityToSeverity("SEM_DADOS") === null, "mapeamento do selo");
  const k = M.computeQualityKpis({ ncrs: [{ state: "INVESTIGACAO", criticality: "CRITICAL", reopen_count: 0, created_at: "2026-01-01T00:00:00Z", closed_at: null }], actions: [], verifications: [], today: "2026-02-01" });
  ok(k.criticasAbertas.value === 1 && k.abertas.value === 1, "KPI crítica");
});

// ------------------------------------------------------------ CASOS 02, 05, 06 ----
await check("CASO 02 NC em foto SSMA: RNC nasce por RPC com origem SSMA_FOTO rastreável; evidência INDÍCIO aceita; dedupe devolve a existente", async () => {
  const db = mockDb({ rpc: { quality_ncr_create: () => ({ data: { created: true, deduplicated: false, id: NCR, code: "RNC-0001", rowVersion: 1 }, error: null }) } });
  const r = await C.createNcrCommand(ctx("COLABORADOR", db), fd({ title: "Fissura na viga", originType: "SSMA_FOTO", originRef: "IMG_0042.jpg" }));
  ok(r.ok && r.entityId === NCR, JSON.stringify(r));
  const call = db.calls.find((c) => c.rpc === "quality_ncr_create");
  ok(call.args.p_origin_type === "SSMA_FOTO" && call.args.p_origin_ref === "IMG_0042.jpg" && call.args.p_project_id === P1, "args da RPC");
  const dup = mockDb({ rpc: { quality_ncr_create: () => ({ data: { created: false, deduplicated: true, id: NCR, code: "RNC-0001" }, error: null }) } });
  const r2 = await C.createNcrCommand(ctx("GESTOR", dup), fd({ title: "Fissura na viga", originType: "SSMA_FOTO", originRef: "IMG_0042.jpg" }));
  ok(r2.ok && r2.code === "DEDUPLICATED" && /nenhuma RNC nova/.test(r2.message), r2.message);
  const sem = await C.createNcrCommand(ctx("GESTOR", mockDb()), fd({ title: "Sem fonte", originType: "SSMA_FOTO", originRef: "" }));
  ok(!sem.ok && sem.code === "ORIGIN_REQUIRED", "origem obrigatória");
});
await check("CASO 02 (cont.) evidência: fonte obrigatória; NC COMPROVADA só com FATO (inferência nunca comprova); fonte imutável (update só classificação/epistêmico)", async () => {
  const db = mockDb({ tables: { quality_evidence: () => ({ data: { id: EV }, error: null }) } });
  const base = { ncrId: NCR, sourceType: "SSMA_FOTO", sourceRef: "IMG_0042.jpg", classification: "INDICIO", epistemic: "FATO" };
  ok((await C.addEvidenceCommand(ctx("COLABORADOR", db), fd(base))).ok, "indício ok");
  const bad = await C.addEvidenceCommand(ctx("COLABORADOR", mockDb()), fd({ ...base, classification: "NC_COMPROVADA", epistemic: "INFERENCIA" }));
  ok(!bad.ok && /FATO/.test(bad.error), "NC comprovada + inferência");
  ok(!(await C.addEvidenceCommand(ctx("COLABORADOR", mockDb()), fd({ ...base, sourceRef: "  " }))).ok, "sem fonte");
  const upd = mockDb({ tables: { quality_evidence: () => ({ data: [{ id: EV }], error: null }) } });
  await C.setEvidenceClassificationCommand(ctx("GESTOR", upd), fd({ evidenceId: EV, expectedVersion: "1", classification: "NC_COMPROVADA", epistemic: "FATO" }));
  const op = upd.calls.find((c) => c.table === "quality_evidence");
  const payload = op.ops.find((o) => o[0] === "update")[1];
  ok(Object.keys(payload).sort().join() === "classification,epistemic", "update restrito: " + Object.keys(payload));
});
await check("CASO 05 indício em diário de obra: evidência DIARIO_OBRA classificada INDÍCIO/FATO com a referência do diário", async () => {
  const db = mockDb({ tables: { quality_evidence: () => ({ data: { id: EV }, error: null }) } });
  const r = await C.addEvidenceCommand(ctx("COLABORADOR", db), fd({ ncrId: NCR, sourceType: "DIARIO_OBRA", sourceRef: "Diário 14/11 p.3", classification: "INDICIO", epistemic: "FATO" }));
  ok(r.ok, r.error);
  const ins = db.calls.find((c) => c.table === "quality_evidence").ops.find((o) => o[0] === "insert")[1];
  ok(ins.source_type === "DIARIO_OBRA" && ins.project_id === P1 && ins.classification === "INDICIO", JSON.stringify(ins));
  ok(M.ORIGIN_LABEL.DIARIO_OBRA === "Diário de obra", "rótulo");
});
await check("CASO 06 relatório de fiscalização: origem FISCALIZACAO aceita na criação da RNC e como fonte de evidência", async () => {
  ok(M.NCR_CREATE_ORIGINS.includes("FISCALIZACAO") && M.EVIDENCE_SOURCE_OPTIONS.includes("FISCALIZACAO"), "opções");
  const db = mockDb({ rpc: { quality_ncr_create: () => ({ data: { created: true, id: NCR, code: "RNC-0002" }, error: null }) } });
  const r = await C.createNcrCommand(ctx("GERENTE", db), fd({ title: "Apontamento da fiscalização", originType: "FISCALIZACAO", originRef: "Relatório 07/2026" }));
  ok(r.ok, r.error);
});

// ------------------------------------------------------------ CASOS 03, 04 ----
await check("CASO 03 reclamação de cliente por e-mail: canal EMAIL_CLIENTE, recebimento e fonte original obrigatórios", async () => {
  const db = mockDb({ tables: { quality_customer_complaints: () => ({ data: { id: U(30) }, error: null }) } });
  const input = { channel: "EMAIL_CLIENTE", receivedAt: "2026-03-10T10:00", subject: "Infiltração no banheiro", sourceRef: "E-mail 'Infiltração' 10/03" };
  ok((await C.addComplaintCommand(ctx("COLABORADOR", db), fd(input))).ok, "ok");
  const ins = db.calls.find((c) => c.table === "quality_customer_complaints").ops.find((o) => o[0] === "insert")[1];
  ok(ins.channel === "EMAIL_CLIENTE" && ins.source_ref && ins.project_id === P1, JSON.stringify(ins));
  ok(!(await C.addComplaintCommand(ctx("COLABORADOR", mockDb()), fd({ ...input, sourceRef: "" }))).ok, "sem fonte");
});
await check("CASO 04 reclamação por e-mail AXION: canal EMAIL_AXION distinto do e-mail do cliente", async () => {
  ok(M.COMPLAINT_CHANNEL_LABEL.EMAIL_AXION === "E-mail AXION" && M.COMPLAINT_CHANNEL_LABEL.EMAIL_CLIENTE === "E-mail do cliente", "rótulos");
  const db = mockDb({ tables: { quality_customer_complaints: () => ({ data: { id: U(31) }, error: null }) } });
  const r = await C.addComplaintCommand(ctx("GESTOR", db), fd({ channel: "EMAIL_AXION", receivedAt: "2026-03-11T09:30", subject: "Reclamação encaminhada", sourceRef: "E-mail AXION 11/03" }));
  ok(r.ok, r.error);
  ok(!(await C.addComplaintCommand(ctx("GESTOR", mockDb()), fd({ channel: "WHATSAPP", receivedAt: "2026-03-11T09:30", subject: "x y z", sourceRef: "a" }))).ok, "canal inválido");
});

// ------------------------------------------------------------------ CASO 31 ----
await check("CASO 31 usuário sem autorização: LEITURA e sessão ausente nunca chegam ao banco; UI oculta formulários", async () => {
  for (const [cmd, data] of [[C.createNcrCommand, { title: "abc", originType: "MANUAL", originRef: "x" }], [C.transitionNcrCommand, { ncrId: NCR, toState: "TRIAGEM", expectedVersion: "1" }], [C.addEvidenceCommand, { ncrId: NCR }], [C.addActionCommand, { ncrId: NCR }]]) {
    const db = mockDb();
    const r = await cmd(ctx("LEITURA", db), fd(data));
    ok(!r.ok && r.code === "FORBIDDEN" && db.calls.length === 0, `LEITURA deveria falhar sem tocar o banco (${r.code})`);
  }
  const noRole = await C.createNcrCommand(ctx(null), fd({ title: "abc", originType: "MANUAL", originRef: "x" }));
  ok(noRole.code === "AUTH_REQUIRED", noRole.code);
  const colab = await C.addVerificationCommand(ctx("COLABORADOR"), fd({ ncrId: NCR }));
  ok(colab.code === "FORBIDDEN", "verificação de eficácia exige gestão");
  ok(M.describeQualityError("new row violates row-level security policy").code === "FORBIDDEN", "RLS => FORBIDDEN");
  const detail = rd("apps/web/app/[projectId]/qualidade/rnc/[ncrId]/page.tsx");
  ok(/canRegister \? <EvidenceForm/.test(detail) && /canManage \? <VerificationForm/.test(detail), "formulários condicionados ao papel");
  ok(/ReadOnlyNote/.test(rd("apps/web/components/quality/sections.tsx")), "aviso somente consulta");
});

// ------------------------------------------------------------------ CASO 33 ----
await check("CASO 33 dados insuficientes: KPIs SEM DADOS (nunca zero); custo sem fonte, probabilidade sem fundamento e ensaio sem laudo recusados", async () => {
  const k = M.computeQualityKpis({ ncrs: [], actions: [], verifications: [], today: "2026-01-01" });
  for (const key of ["abertas", "criticasAbertas", "semCriticidadeAbertas", "reaberturas", "tempoMedioEncerramentoDias", "acoesVencidas", "eficacia"]) ok(k[key].value === null && k[key].display === "SEM DADOS", `${key}: ${k[key].display}`);
  const k2 = M.computeQualityKpis({ ncrs: [{ state: "DETECTADA", criticality: "SEM_DADOS", reopen_count: 0, created_at: "2026-01-01T00:00:00Z", closed_at: null }], actions: [{ status: "PLANEJADA", due_date: null, ncr_id: null }], verifications: [], today: "2026-01-01" });
  ok(k2.acoesVencidas.value === null && k2.eficacia.value === null && k2.tempoMedioEncerramentoDias.value === null && k2.semCriticidadeAbertas.value === 1, "ação sem prazo não é avaliada");
  ok(!(await C.addCostCommand(ctx("GESTOR"), fd({ ncrId: NCR, category: "RETRABALHO", estimatedAmount: "1500,00" }))).ok, "valor sem fonte");
  ok(!(await C.addConsequenceCommand(ctx("GESTOR"), fd({ ncrId: NCR, pillar: "CUSTO", severity: "HIGH", sourceRef: "NF 1", probability: "PROVAVEL" }))).ok, "probabilidade sem fundamento");
  ok(!(await C.addTestCommand(ctx("GESTOR"), fd({ testType: "Compressão", result: "REPROVADO" }))).ok, "reprovado sem laudo");
  const t = M.sumCosts([{ category: "MATERIAL", estimated_amount: null, actual_amount: null, currency: "BRL", source_ref: null }]);
  ok(t.actual === null && t.estimated === null && M.formatMoney(null) === "SEM DADOS", "custo sem valor = SEM DADOS");
  const s = M.sumCosts([{ category: "MATERIAL", estimated_amount: 100, actual_amount: 80, currency: "BRL", source_ref: "NF" }, { category: "MULTA", estimated_amount: null, actual_amount: 20, currency: "BRL", source_ref: "NF2" }]);
  ok(s.actual === 100 && s.estimated === 100, "estimado e realizado somados separadamente");
  ok(M.parseQualityError === undefined || true, "n/a");
});

// ------------------------------------------------------------------ CASO 34 ----
await check("CASO 34 impactos simultâneos nos 4 pilares: cada pilar registrado; criticidade = pior pilar; pilares sem dado explícitos", async () => {
  const all = K.computeCriticality(["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"].map((p, i) => ({ pillar: p, severity: ["MEDIUM", "HIGH", "CRITICAL", "LOW"][i], sourceRef: "fonte" })));
  ok(all.criticality === "CRITICAL" && all.pillarsWithoutData.length === 0, JSON.stringify(all));
  const part = K.computeCriticality([{ pillar: "QUALIDADE", severity: "LOW", sourceRef: "f" }]);
  ok(part.pillarsWithoutData.length === 3, "3 pilares SEM DADOS");
  ok(Object.keys(M.PILLAR_LABEL).join() === "PRAZO,CUSTO,SEGURANCA,QUALIDADE", "4 pilares na UI");
  const db = mockDb({ tables: { quality_consequences: () => ({ data: { id: U(40) }, error: null }) } });
  for (const p of Object.keys(M.PILLAR_LABEL)) ok((await C.addConsequenceCommand(ctx("COLABORADOR", db), fd({ ncrId: NCR, pillar: p, severity: "HIGH", sourceRef: "laudo" }))).ok, p);
});

// ------------------------------------------------------------------ CASO 35 ----
await check("CASO 35 RNC com encerramento indevido: bloqueios do banco desabilitam o botão; erro TRANSITION_BLOCKED é traduzido; encerrar sem eficácia não passa", async () => {
  const opts = M.buildTransitionOptions("NCR", "VERIFICACAO", "GESTOR", { ENCERRADA: ["EFFECTIVENESS_VERIFICATION_REQUIRED"], CORRECAO: [] });
  const enc = opts.find((o) => o.to === "ENCERRADA");
  ok(enc && !enc.enabled && enc.blockers.includes("EFFECTIVENESS_VERIFICATION_REQUIRED") && enc.requiresJustification, "encerrar bloqueado");
  ok(opts.find((o) => o.to === "CORRECAO").enabled, "devolver à correção liberado");
  const colab = M.buildTransitionOptions("NCR", "VERIFICACAO", "COLABORADOR", { ENCERRADA: [] }).find((o) => o.to === "ENCERRADA");
  ok(!colab.enabled && colab.blockers.includes("FORBIDDEN"), "colaborador não encerra");
  const db = mockDb({ rpc: { quality_ncr_transition: () => ({ data: null, error: { message: "TRANSITION_BLOCKED: LATEST_VERIFICATION_NOT_EFFECTIVE,ACTIONS_NOT_EXECUTED" } }) } });
  const r = await C.transitionNcrCommand(ctx("GESTOR", db), fd({ ncrId: NCR, toState: "ENCERRADA", expectedVersion: "4", justification: "encerrando sem eficácia" }));
  ok(!r.ok && r.code === "TRANSITION_BLOCKED" && /não foi EFICAZ/.test(r.error) && /não executadas/.test(r.error), r.error);
  ok(/aria-disabled/.test(rd("apps/web/components/quality/ncr-transition-panel.tsx")), "botão indisponível acessível");
  ok(/quality_transition_blockers/.test(rd("apps/web/lib/quality/ui-queries.ts")), "bloqueios vêm do banco");
  const down = mockDb({ rpc: { quality_transition_blockers: () => ({ data: null, error: { message: "x" } }), quality_closure_readiness: () => ({ data: null, error: { message: "x" } }) }, tables: { quality_ncrs: () => ({ data: { id: NCR, state: "VERIFICACAO", row_version: 1 }, error: null }) } });
  const d = await Q.loadNcrDetail(down, P1, NCR, "GESTOR");
  ok(d.options.every((o) => !o.enabled), "falha ao consultar bloqueios => tudo indisponível (falha fechada)");
});

// ------------------------------------------------------------------ CASO 36 ----
await check("CASO 36 reabertura de RNC: ENCERRADA→REABERTA exige gestão, justificativa (>= 10) e evidência; incrementa o ciclo e invalida verificação anterior", () => {
  const o = M.buildTransitionOptions("NCR", "ENCERRADA", "GESTOR", {}).find((x) => x.to === "REABERTA");
  ok(o.requiresJustification && o.requiresEvidence && o.minRole === "MANAGE" && o.enabled, JSON.stringify(o));
  ok(M.validateTransitionDraft(o, { justification: "curta", evidenceCount: 0, duplicateOf: "" }).join() === "JUSTIFICATION_REQUIRED,EVIDENCE_REQUIRED", "rascunho incompleto");
  ok(M.validateTransitionDraft(o, { justification: "Defeito reapareceu após chuva", evidenceCount: 1, duplicateOf: "" }).length === 0, "rascunho completo");
  ok(!M.buildTransitionOptions("NCR", "ENCERRADA", "COLABORADOR", {}).find((x) => x.to === "REABERTA").enabled, "colaborador não reabre");
  ok(M.describeQualityError("VERSION_CONFLICT: x").conflict && M.BLOCKER_LABEL.VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN, "verificação desatualizada explicada");
});

// ------------------------------------------------------------------ CASO 37 ----
await check("CASO 37 auditoria: linha do tempo mescla estados e auditoria em ordem cronológica reversa; seção é somente leitura", () => {
  const tl = M.buildTimeline(
    [{ seq: 2, from_state: "DETECTADA", to_state: "TRIAGEM", actor_user_id: "u1", justification: null, evidence_ids: [], occurred_at: "2026-05-02T10:00:00Z" }, { seq: 1, from_state: null, to_state: "DETECTADA", actor_user_id: "u1", justification: null, evidence_ids: [], occurred_at: "2026-05-01T10:00:00Z" }],
    [{ id: "a1", occurred_at: "2026-05-03T09:00:00Z", actor_type: "USER", actor_user_id: "u2", action: "QUALITY_QUALITY_EVIDENCE_INSERT", entity_type: "QUALITY_EVIDENCE", entity_id: EV, detail: null }],
  );
  ok(tl.length === 3 && tl[0].kind === "AUDIT" && tl[2].title.startsWith("Registrada como"), JSON.stringify(tl.map((t) => t.title)));
  ok(M.auditActionLabel("QUALITY_NCR_TRANSITION") === "Transição de estado registrada", "rótulo");
  const audit = rd("apps/web/components/quality/sections.tsx").split("export async function AuditSection")[1];
  ok(!/<form|<Button|<Input/.test(audit), "auditoria sem controles de edição");
  ok(!/\.delete\(|\.update\(/.test(rd("apps/web/lib/quality/ui-queries.ts")), "consultas sem escrita");
});

// ------------------------------------------------------------------ CASO 38 ----
await check("CASO 38 concorrência: a transição envia a versão lida; VERSION_CONFLICT vira aviso de recarga; edição otimista com zero linhas = conflito; versão ausente é recusada", async () => {
  const db = mockDb({ rpc: { quality_ncr_transition: () => ({ data: null, error: { message: "VERSION_CONFLICT: versão esperada 3 mas a atual é 4 (outra transição foi aplicada)" } }) } });
  const r = await C.transitionNcrCommand(ctx("GESTOR", db), fd({ ncrId: NCR, toState: "INVESTIGACAO", expectedVersion: "3" }));
  ok(!r.ok && r.conflict === true && r.code === "VERSION_CONFLICT" && /Recarregue/.test(r.error), JSON.stringify(r));
  ok(db.calls.find((c) => c.rpc).args.p_expected_version === 3, "versão enviada");
  const semVersao = await C.transitionNcrCommand(ctx("GESTOR", mockDb()), fd({ ncrId: NCR, toState: "INVESTIGACAO" }));
  ok(semVersao.code === "VERSION_REQUIRED", semVersao.code);
  const zero = mockDb({ tables: { quality_ncrs: () => ({ data: [], error: null }) } });
  const u = await C.updateNcrCommand(ctx("GESTOR", zero), fd({ ncrId: NCR, expectedVersion: "2", rootCause: "x" }));
  ok(u.conflict && eqOf(zero.calls[0], "row_version")[0] === 2 && eqOf(zero.calls[0], "project_id")[0] === P1, "update otimista");
  const form = rd("apps/web/components/quality/ncr-transition-panel.tsx");
  ok(/key=\{version\}/.test(rd("apps/web/app/[projectId]/qualidade/rnc/[ncrId]/page.tsx")) && /state\.conflict/.test(form) && /expectedVersion/.test(form), "painel remonta por versão e bloqueia após conflito");
  ok(/Recarregar a página/.test(rd("apps/web/components/quality/form-kit.tsx")), "ação de recarga");
});

// ------------------------------------------------------------------ CASO 39 ----
await check("CASO 39 isolamento entre projetos: toda consulta e escrita é escopada por project_id; RNC de outro projeto = inexistente; papel resolvido por projeto", async () => {
  const db = mockDb({ tables: { quality_ncrs: () => ({ data: null, error: null }) } });
  const none = await Q.loadNcrDetail(db, P2, NCR, "ADMINISTRADOR");
  ok(none === null && eqOf(db.calls[0], "project_id")[0] === P2, "RNC fora do projeto = null");
  const rec = mockDb();
  await Q.loadOverview(rec, P1); await Q.loadNcrList(rec, P1, { state: "ENCERRADA", q: "viga" }); await Q.loadEvidenceList(rec, P1, {}); await Q.loadActions(rec, P1);
  await Q.loadVerifications(rec, P1); await Q.loadRecurrences(rec, P1); await Q.loadCosts(rec, P1); await Q.loadAuditLog(rec, P1); await Q.loadStateEvents(rec, P1);
  await Q.loadInspections(rec, P1); await Q.loadTests(rec, P1); await Q.loadComplaints(rec, P1); await Q.loadRequirements(rec, P1); await Q.loadNcrCodes(rec, P1);
  const tablesCalls = rec.calls.filter((c) => c.table);
  ok(tablesCalls.length >= 14 && tablesCalls.every((c) => eqOf(c, "project_id")[0] === P1), "toda consulta com eq(project_id)");
  const writes = mockDb({ tables: { quality_corrective_actions: () => ({ data: { id: U(50) }, error: null } ) } });
  await C.addActionCommand(ctx("COLABORADOR", writes, P1), fd({ ncrId: NCR, kind: "CORRETIVA", description: "Refazer a camada", projectId: P2 }));
  ok(writes.calls[0].ops.find((o) => o[0] === "insert")[1].project_id === P1, "project_id vem do contexto autenticado, nunca do formulário");
  const actions = rd("apps/web/app/[projectId]/qualidade/actions.ts");
  ok(/getCurrentProjectPermission\(projectId\)/.test(actions) && !/service_role|createSupabaseAdmin|client-admin/.test(actions), "papel por projeto; sem service_role");
  ok(!(await C.createNcrCommand({ db: mockDb(), role: "GESTOR", projectId: "não-é-uuid" }, fd({ title: "abc", originType: "MANUAL", originRef: "x" }))).ok, "projeto inválido recusado");
});

// ------------------------------------------------------- invariantes gerais ----
await check("segurança: nenhum segredo no frontend, nenhum envio real, sem atributo title de ajuda, nenhum DELETE e sem migrations novas", () => {
  const files = [];
  const walk = (d) => { for (const n of readdirSync(d)) { const p = path.join(d, n); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(n)) files.push(p); } };
  walk(path.join(root, "apps/web/components/quality")); walk(path.join(root, "apps/web/app/[projectId]/qualidade"));
  for (const n of readdirSync(path.join(root, "apps/web/lib/quality"))) if (n.startsWith("ui-")) files.push(path.join(root, "apps/web/lib/quality", n));
  for (const f of files) {
    const s = readFileSync(f, "utf8");
    ok(!/SERVICE_ROLE|service_role|api[_-]?key|process\.env/i.test(s), `segredo/ambiente em ${path.basename(f)}`);
    ok(!/\.delete\(\)|\bsendMail\b|gmail|smtp/i.test(s), `envio/remoção em ${path.basename(f)}`);
    ok(!/<[a-z][a-z0-9]*b[^>]*stitle=/.test(s), `atributo title em ${path.basename(f)}`);
  }
  const forms = files.filter((f) => /components[\\/]quality/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
  ok(!/dangerouslySetInnerHTML/.test(forms), "sem HTML injetado");
});
await check("espelho: transições da UI = máquina de estados da fase 1 (paridade com o catálogo do banco); nenhum estado sem rótulo", async () => {
  const SM = await import("../apps/web/lib/quality/state-machine.ts");
  const sql = rd("supabase/migrations/20261122100000_quality_foundation.sql");
  const dbRows = [...sql.matchAll(/\('NCR', '([A-Z_]+)', '([A-Z_]+)', '(REGISTER|MANAGE)', (true|false), (true|false)\)/g)];
  const ts = SM.TRANSITIONS.filter((t) => t.entity === "NCR");
  ok(dbRows.length === ts.length && dbRows.length > 0, `catálogo ${dbRows.length} x ${ts.length}`);
  for (const t of ts) ok(M.NCR_STATE_LABEL[t.from] && M.NCR_STATE_LABEL[t.to] && M.TRANSITION_VERB[t.to], `rótulo ausente ${t.from}->${t.to}`);
  ok(M.QUALITY_TABS.length === 12 && M.parseTab("xyz") === "dashboard" && M.parseTab("rnc") === "rnc", "abas");
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
