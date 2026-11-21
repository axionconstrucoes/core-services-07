// FASE 6 / H2b — testes PUROS: pilares (só PRAZO/CUSTO/SEGURANCA/QUALIDADE), áreas funcionais (JURIDICO/COMERCIAL), paridade TS x SQL do
// mapeamento, regras da revisão humana (confirmar/descartar, vínculo pendente, delegação), solicitações de alteração de dados globais,
// e verificações estáticas das migrations/rollbacks/ações/telas. Sem rede, sem banco, sem IA.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-f6-h2b-sinais-pilares.mjs
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const P = await import("../apps/web/lib/email-classification/pillars.ts");
const R = await import("../apps/web/lib/email-classification/rules.ts");
const REV = await import("../apps/web/lib/email-classification/review.ts");
const CR = await import("../apps/web/lib/external-parties/change-requests.ts");
const { classifyEmail } = await import("../apps/web/lib/email-classification/classify.ts");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try { fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${e instanceof Error ? e.message : e}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const M1 = read("supabase/migrations/20261209100000_email_signal_pillars_and_review.sql");
const M2 = read("supabase/migrations/20261209101000_external_org_global_admin_and_change_requests.sql");

check("pilares: SOMENTE PRAZO, CUSTO, SEGURANCA, QUALIDADE; áreas funcionais JURIDICO e COMERCIAL (não são pilares)", () => {
  eq([...P.PILLARS], ["PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE"], "pilares");
  eq([...P.FUNCTIONAL_AREAS], ["JURIDICO", "COMERCIAL"], "áreas");
  ok(!P.PILLARS.includes("JURIDICO") && !P.PILLARS.includes("COMERCIAL"), "Jurídico/Comercial não podem ser pilares");
});

check("mapeamento: toda regra do motor produz pilar válido ou nulo, ao menos um eixo, e nunca JURIDICO como pilar; regras jurídicas => área JURIDICO; CUSTO => COMERCIAL", () => {
  for (const rule of R.SIGNAL_RULES) {
    const a = P.signalAxes(rule.kind, rule.pillar);
    ok(a.pillar === null || P.PILLARS.includes(a.pillar), `${rule.id}: pilar inválido ${a.pillar}`);
    ok(a.pillar !== null || a.functional_area !== null, `${rule.id}: sem pilar nem área`);
    if (rule.pillar === "JURIDICO") eq(a.functional_area, "JURIDICO", `${rule.id} área`);
    if (rule.pillar === "CUSTO") eq(a.functional_area, "COMERCIAL", `${rule.id} área`);
    if (["PRAZO", "SEGURANCA", "QUALIDADE"].includes(rule.pillar)) eq([a.pillar, a.functional_area], [rule.pillar, null], `${rule.id} sem área`);
  }
  eq(P.signalAxes("PLEITO", "JURIDICO"), { pillar: "CUSTO", functional_area: "JURIDICO" }, "PLEITO: pilar de impacto CUSTO + área JURIDICO");
  eq(P.signalAxes("DESCUMPRIMENTO_INDICIO", "JURIDICO"), { pillar: null, functional_area: "JURIDICO" }, "descumprimento: sem pilar");
  for (const k of ["NOTIFICACAO_OFICIAL", "ORDEM_FORA_DE_DELEGACAO", "ALTERACAO_CONTRATUAL_SEM_FORMALIZACAO", "DEPENDE_APROVACAO_CLIENTE"]) {
    eq(P.signalAxes(k, "JURIDICO").functional_area, "JURIDICO", `${k} área`);
  }
});

check("PARIDADE TS x SQL: a função SQL email_signal_functional_area_for lista exatamente os tipos jurídicos do TS; pilar de impacto idêntico", () => {
  const m = /p_kind in \(([^)]*)\)/.exec(M1);
  ok(m, "lista de tipos jurídicos no SQL");
  const sqlKinds = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]).sort();
  eq(sqlKinds, [...P.LEGAL_SIGNAL_KINDS].sort(), "tipos jurídicos");
  ok(/when p_kind = 'PLEITO' then 'CUSTO'/.test(M1) && P.impactPillarFor("PLEITO") === "CUSTO" && P.impactPillarFor("RECLAMACAO_FORMAL") === null, "pilar de impacto");
  ok(/when p_pillar = 'CUSTO' then 'COMERCIAL'/.test(M1) && P.functionalAreaFor("REAJUSTE_AUMENTO_PRECO", "CUSTO") === "COMERCIAL", "CUSTO => COMERCIAL");
  // todo tipo jurídico emitido pelas regras/classificador está coberto
  for (const r of R.SIGNAL_RULES.filter((x) => x.pillar === "JURIDICO")) ok(P.LEGAL_SIGNAL_KINDS.has(r.kind), `${r.kind} ausente do mapeamento`);
});

check("compatibilidade com o coletor de D: legacyPillarOf devolve JURIDICO para a área jurídica, pilar para os demais; nunca vazio", () => {
  eq(P.legacyPillarOf({ pillar: "CUSTO", functional_area: "JURIDICO" }), "JURIDICO", "PLEITO");
  eq(P.legacyPillarOf({ pillar: null, functional_area: "JURIDICO" }), "JURIDICO", "descumprimento");
  eq(P.legacyPillarOf({ pillar: "CUSTO", functional_area: "COMERCIAL" }), "CUSTO", "custo");
  eq(P.legacyPillarOf({ pillar: "PRAZO", functional_area: null }), "PRAZO", "prazo");
  const loader = read("apps/web/lib/risk-alerts/load-email-risk-signals.ts");
  ok(loader.includes("legacyPillarOf") && loader.includes('"DISCARDED"'), "loader usa o contrato legado e ignora descartados");
  ok(/create or replace view public\.email_risk_signals_legacy/.test(M1) && /security_invoker = true/.test(M1), "view de compatibilidade (security_invoker)");
});

check("classificador ponta a ponta: e-mail de reclamação/ordem fora de delegação gera sinais com ÁREA jurídica e SEM pilar JURIDICO; custo gera COMERCIAL", () => {
  const ctx = {
    facts: { projectId: "P1", contractRefs: ["CT-1"] },
    internalDomains: ["axion.com.br"],
    partyByEmail: { "cli@cliente.com": { matches: [{ organization_id: "o1", org_kind: "CLIENTE", link_status: "ACTIVE", role_in_project: "CLIENTE", delegation_scope: [], valid_now: true }], ambiguous: false, domain_shared: false, known: true } },
  };
  const r = classifyEmail({ id: "e1", candidateProjectId: "P1", subject: "Reclamação formal CT-1", bodyText: "Reclamamos formalmente do atraso na entrega dos materiais e solicitamos aditivo com reajuste de preço de 8%.", from: "cli@cliente.com" }, ctx);
  ok(r.signals.length >= 2, `sinais: ${r.signals.length}`);
  for (const s of r.signals) {
    ok(s.pillar === null || P.PILLARS.includes(s.pillar), `pilar inválido ${s.pillar}`);
    ok(s.pillar !== null || s.functional_area !== null, "sem eixo");
  }
  ok(r.signals.some((s) => s.functional_area === "JURIDICO"), "área jurídica presente");
  ok(r.signals.some((s) => s.pillar === "CUSTO" && (s.functional_area === "COMERCIAL" || s.functional_area === "JURIDICO")), "custo com área");
  ok(r.pillars.every((p) => P.PILLARS.includes(p)), `classification.pillars só com pilares: ${r.pillars}`);
});

check("revisão: quem pode revisar — MANAGE/ADMIN por papel; demais só com delegação vigente, não revogada e com escopo (TODAS/pilar/área); NONE nunca", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const d = (o = {}) => ({ id: "d1", user_id: "u1", scope: "PRAZO", valid_from: "2026-11-01T00:00:00Z", valid_until: "2026-12-01T00:00:00Z", revoked_at: null, ...o });
  const sigPrazo = { pillar: "PRAZO", functional_area: null };
  const sigJur = { pillar: "CUSTO", functional_area: "JURIDICO" };
  const via = (tier, delegations, sig) => REV.reviewerVia({ tier, userId: "u1", delegations, now }, sig);
  eq(via("MANAGE", [], sigPrazo), "TIER", "gestor"); eq(via("ADMIN", [], sigJur), "TIER", "admin");
  eq(via("REGISTER", [], sigPrazo), null, "colaborador sem delegação"); eq(via("READ", [], sigPrazo), null, "leitura sem delegação");
  eq(via("NONE", [d({ scope: "TODAS" })], sigPrazo), null, "sem membership ativa nunca");
  eq(via("REGISTER", [d()], sigPrazo), "DELEGATION", "delegação por pilar");
  eq(via("REGISTER", [d()], sigJur), null, "fora do escopo");
  eq(via("REGISTER", [d({ scope: "JURIDICO" })], sigJur), "DELEGATION", "delegação por área");
  eq(via("READ", [d({ scope: "TODAS" })], sigJur), "DELEGATION", "TODAS");
  eq(via("REGISTER", [d({ revoked_at: "2026-11-10T00:00:00Z" })], sigPrazo), null, "revogada");
  eq(via("REGISTER", [d({ valid_until: "2026-11-21T11:59:59Z" })], sigPrazo), null, "vencida");
  eq(via("REGISTER", [d({ valid_from: "2026-11-22T00:00:00Z" })], sigPrazo), null, "ainda não vigente");
  eq(via("REGISTER", [d({ user_id: "outro" })], sigPrazo), null, "delegação de outra pessoa");
});

check("revisão: vínculo CANDIDATO/AMBÍGUO/organização sem vínculo ativo => PENDENTE (confirmar bloqueado, descartar permitido); validado => aguarda revisão; decididos são finais", () => {
  const sig = (review_status = "PENDING") => ({ pillar: "PRAZO", functional_area: null, review_status });
  const cls = (o = {}) => ({ project_link_status: "LINKED", status: "ANALYZED", organization_id: null, ...o });
  eq(REV.signalReviewState(sig(), cls(), null).state, "AWAITING_REVIEW", "vinculado");
  eq(REV.signalReviewState(sig(), cls({ project_link_status: "CANDIDATE" }), null).state, "PENDING_LINK_VALIDATION", "candidata");
  eq(REV.signalReviewState(sig(), cls({ project_link_status: "AMBIGUOUS" }), null).state, "PENDING_LINK_VALIDATION", "ambígua");
  eq(REV.signalReviewState(sig(), null, null).state, "PENDING_LINK_VALIDATION", "sem classificação");
  eq(REV.signalReviewState(sig(), cls({ status: "CANNOT_ANALYZE" }), null).state, "PENDING_LINK_VALIDATION", "não analisada");
  eq(REV.signalReviewState(sig(), cls({ organization_id: "o1" }), false).state, "PENDING_LINK_VALIDATION", "organização só candidata");
  eq(REV.signalReviewState(sig(), cls({ organization_id: "o1" }), true).state, "AWAITING_REVIEW", "organização validada");
  eq(REV.signalReviewState(sig("CONFIRMED"), cls(), null).state, "CONFIRMED", "confirmado");
  eq(REV.signalReviewState(sig("DISCARDED"), cls({ project_link_status: "CANDIDATE" }), null).state, "DISCARDED", "descartado");
  eq(REV.reviewActions("PENDING_LINK_VALIDATION", "TIER"), { canConfirm: false, canDiscard: true }, "pendente: só descartar");
  eq(REV.reviewActions("AWAITING_REVIEW", "DELEGATION"), { canConfirm: true, canDiscard: true }, "aguardando");
  eq(REV.reviewActions("AWAITING_REVIEW", null), { canConfirm: false, canDiscard: false }, "sem permissão");
  eq(REV.reviewActions("CONFIRMED", "TIER"), { canConfirm: false, canDiscard: false }, "decidido é final");
});

check("revisão: códigos de erro da RPC mapeados; texto de terceiros sanitizado (sem controles/bidi) e truncado", () => {
  eq(REV.reviewErrorCode("PENDING_LINK_VALIDATION: x"), "vinculo-pendente", "vínculo");
  eq(REV.reviewErrorCode("ALREADY_REVIEWED: x"), "ja-revisado", "repetida");
  eq(REV.reviewErrorCode("NOTE_REQUIRED"), "justificativa", "nota");
  eq(REV.reviewErrorCode("FORBIDDEN: x"), "permissao", "permissão");
  eq(REV.reviewErrorCode("INVALID_VALIDITY"), "validade", "validade");
  eq(REV.reviewErrorCode("coisa estranha"), "falha", "desconhecido");
  const t = REV.safeText("a\r\nb‮c​d   e", 50);
  ok(!/[\r\n‮​]/.test(t) && t === "a b c d e", `sanitização: ${JSON.stringify(t)}`);
  eq(REV.safeText("x".repeat(500), 20).length, 20, "truncado");
  eq(REV.MAX_DELEGATION_DAYS, 180, "máximo de 180 dias");
});

check("organizações globais: só ADMIN altera direto; GESTOR/GERENTE solicitam; demais nada; pedido descrito sem interpretar conteúdo; erros mapeados", () => {
  eq(CR.globalDataMode("ADMIN"), "DIRECT", "admin"); eq(CR.globalDataMode("MANAGE"), "REQUEST", "gestor");
  for (const t of ["REGISTER", "READ", "NONE"]) eq(CR.globalDataMode(t), "NONE", t);
  eq(CR.CHANGE_KINDS.length, 4, "tipos");
  ok(CR.describeChange("DOMAIN_SET", { domain: "x.com.br", active: false }).includes("desativar"), "domínio");
  ok(!/[\r\n]/.test(CR.describeChange("ORG_CREATE", { legal_name: "A\r\nB Ltda", org_kind: "OUTRO" })), "sem quebra de linha");
  eq(CR.changeErrorCode("ALREADY_DECIDED: x"), "ja-decidida", "decidida"); eq(CR.changeErrorCode("NOTE_REQUIRED"), "nota", "nota"); eq(CR.changeErrorCode("FORBIDDEN: x"), "permissao", "permissão");
});

check("migrations: aditivas e idempotentes, SECURITY DEFINER com search_path vazio, RLS, auditoria append-only, sem escrita direta, sem envio de e-mail nem segredos; rollbacks presentes", () => {
  for (const [name, sql] of [["20261209100000", M1], ["20261209101000", M2]]) {
    ok(existsSync(path.join(root, "supabase/rollbacks", `${name}_${name === "20261209100000" ? "email_signal_pillars_and_review" : "external_org_global_admin_and_change_requests"}.rollback.sql`)), `${name}: rollback`);
    const defs = [...sql.matchAll(/create or replace function public\.([a-z_]+)\([^)]*\)([\s\S]*?)\$\$;/g)];
    ok(defs.length > 0, `${name}: funções`);
    for (const d of defs) if (/security definer/.test(d[2])) ok(/set search_path = ''/.test(d[2]), `${name}: ${d[1]} sem search_path vazio`);
    ok(!/\b(smtp|sendmail|api_key|secret|password|token)\b/i.test(sql.replace(/--.*$/gm, "")), `${name}: termos proibidos`);
  }
  ok(/drop constraint if exists/.test(M1) && /add column if not exists/.test(M1) && /create index if not exists/.test(M1), "idempotência M1");
  ok(/legacy_pillar/.test(M1) && /ROLLBACK_BLOCKED/.test(read("supabase/rollbacks/20261209100000_email_signal_pillars_and_review.rollback.sql")), "pilar original preservado; rollback recusa apagar evidência");
  ok(/email_signal_review_audit_guard/.test(M1) && /before update or delete/.test(M1) && /before truncate/.test(M1), "auditoria append-only");
  ok(/revoke all on public\.email_signal_review_audit, public\.email_signal_review_delegations from public, anon, authenticated/.test(M1), "sem escrita direta (M1)");
  ok(/revoke all on public\.external_org_change_requests from public, anon, authenticated/.test(M2), "sem escrita direta (M2)");
  ok(/interval '180 days'/.test(M1), "delegação <= 180 dias");
  ok(/acc_external_assert_global_admin/.test(M2) && !/perform public\.acc_external_assert_manage\(p_project_id\);\s*if v_id is null/.test(M2), "RPCs globais exigem ADMIN");
  ok(/PENDING_LINK_VALIDATION/.test(M1), "vínculo pendente bloqueia a confirmação");
});

check("ações e telas: sinais-email usa a RPC (sem escrita direta), valida membership no servidor, sem envio de e-mail; contatos-externos: GESTOR/GERENTE solicitam, só ADMIN decide; Hover Text nos controles novos", () => {
  const a = read("apps/web/app/[projectId]/integracoes/sinais-email/actions.ts");
  const pg = read("apps/web/app/[projectId]/integracoes/sinais-email/page.tsx");
  ok(a.includes("email_risk_signal_review") && a.includes("acc_email_signal_delegate_grant") && a.includes("acc_email_signal_delegate_revoke"), "RPCs");
  ok(!/\.from\(["'](email_risk_signals|email_signal_review_delegations)["']\)\s*\.(insert|update|delete|upsert)/.test(a), "sem escrita direta");
  ok(a.includes('tier === "NONE"') && a.includes('needAdmin && tier !== "ADMIN"'), "guarda no servidor");
  ok(!/sendMail|nodemailer|gmail\.users\.messages\.send|smtp/i.test(a + pg), "sem envio");
  ok(pg.includes("notFound()") && /min-h-11/.test(pg), "rota fechada a quem não é membro; alvos >= 44px");
  const ca = read("apps/web/app/[projectId]/integracoes/contatos-externos/actions.ts");
  ok(ca.includes("acc_external_change_request") && ca.includes("acc_external_change_decide") && ca.includes("guardAdmin") && ca.includes('globalDataMode(tier) === "REQUEST"'), "solicitar/decidir");
  const cp = read("apps/web/app/[projectId]/integracoes/contatos-externos/page.tsx");
  ok(cp.includes("integracoes.contatos-externos.solicitacoes") && cp.includes("integracoes.contatos-externos.acao-aprovar-solicitacao") && cp.includes("integracoes/sinais-email"), "ajuda e link para a nova rota");
  for (const id of [...pg.matchAll(/helpId="([^"]+)"/g)].map((m) => m[1])) ok(read("apps/web/lib/ui/help/modules/sinais-email.ts").includes(`"${id}"`) || read("apps/web/lib/ui/help/modules/sinais-email.ts").includes(id.split(".").pop()), `helpId sem catálogo: ${id}`);
  const nav = read("apps/web/lib/ui/nav-items.ts");
  ok(!/sinais-email/.test(nav), "nav-items.ts NÃO foi editado (dono: H2a)");
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed === 0 ? 0 : 1);
