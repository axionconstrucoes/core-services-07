// FASE 4 / A — COMPETÊNCIAS PROFISSIONAIS: regras PURAS (espelho TS), allowlist de operações, contrato estático das migrations, ligação de UI e ajuda.
// A prova no banco real está em scripts/test-competencias-realpg.mjs. Sem banco, rede ou IA.
// Casos: CASO 31, 37, 39 e CASO F4-A-01..F4-A-12 (versão pura).
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-competencias.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const C = await import("../apps/web/lib/permissions/competences.ts");
const OPS = await import("../apps/web/lib/permissions/competence-ops.ts");
const ERR = await import("../apps/web/lib/insurance-ui/errors.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { ALL_HELP_MANIFESTS } = await import("../apps/web/lib/ui/help/manifests/index.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, "..", p), "utf8").replace(/\r\n/g, "\n");

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
const P2 = "10000000-0000-4000-8000-000000000002";
const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const grant = (o = {}) => ({ userId: U1, projectId: P1, competence: "JURIDICO", status: "ACTIVE", validFrom: "2026-01-01", validUntil: null, ...o });
const TODAY = "2026-11-20";

check("CASO F4-A-01 (puro): hasCompetence espelha acc_user_has_competence — vigente vale; vencida, futura, revogada, outro usuário/projeto, membro inativo e competência desconhecida NÃO valem", () => {
  const H = (g, u = U1, p = P1, any = ["JURIDICO"], today = TODAY, active = true) => C.hasCompetence(g, u, p, any, today, active);
  assert.equal(H([grant()]), true);
  assert.equal(H([grant({ validUntil: TODAY })]), true, "último dia vale (inclusivo)");
  assert.equal(H([grant({ validFrom: TODAY })]), true, "primeiro dia vale (inclusivo)");
  assert.equal(H([grant({ validUntil: "2026-11-19" })]), false, "vencida");
  assert.equal(H([grant({ validFrom: "2026-11-21" })]), false, "ainda não vigente");
  assert.equal(H([grant({ status: "REVOKED" })]), false, "revogada");
  assert.equal(H([grant({ userId: U2 })]), false, "de outra pessoa");
  assert.equal(H([grant({ projectId: P2 })]), false, "de outro projeto");
  assert.equal(H([grant()], U1, P1, ["JURIDICO"], TODAY, false), false, "membro inativo");
  assert.equal(H([grant({ competence: "INVENTADA" })], U1, P1, ["INVENTADA"]), false, "competência fora da lista fechada");
  assert.equal(H([grant({ competence: "SEGUROS" })]), false, "outra competência não substitui");
  assert.equal(H([grant({ competence: "SEGUROS" })], U1, P1, ["SEGUROS", "JURIDICO"]), true, "qualquer uma da lista (any)");
  assert.equal(H(null), false);
  assert.equal(H(undefined), false);
  assert.equal(H([]), false);
  assert.equal(H([grant()], null), false, "sem usuário");
  assert.equal(H([grant()], U1, null), false, "sem projeto");
  assert.equal(H([grant()], U1, P1, []), false, "nenhuma competência pedida");
  assert.equal(H([grant()], U1, P1, ["JURIDICO"], "20/11/2026"), false, "data inválida");
});

check("CASO F4-A-02 (puro): matriz de atos — cada ato exige a competência certa; nível de gestão nunca é suficiente", () => {
  const R = C.COMPETENCE_REQUIREMENTS;
  for (const act of ["CLAIM_DECISAO", "CLAIM_NEGATIVA", "CLAIM_CONTESTACAO", "CLAIM_INDENIZACAO_CUMPRIMENTO"]) assert.deepEqual([...R[act].any], ["JURIDICO"], act);
  assert.deepEqual([...R.DRAFT_APPROVE.any].sort(), ["JURIDICO", "SEGUROS"]);
  assert.deepEqual([...R.ENDORSEMENT_CRITICAL_REVIEW.any].sort(), ["JURIDICO", "SEGUROS"]);
  for (const act of ["QUALITY_NCR_CONFIRMADA", "QUALITY_NCR_NAO_CONFIRMADA", "QUALITY_NCR_ENCERRADA", "QUALITY_WARRANTY_COBERTA", "QUALITY_WARRANTY_NAO_COBERTA"]) assert.deepEqual([...R[act].any], ["TECNICO_RESPONSAVEL"], act);
  for (const act of Object.keys(R)) {
    assert.ok(R[act].any.every((c) => C.COMPETENCES.includes(c)), `${act}: só competências da lista fechada`);
    const txt = C.competenceBlockText(act);
    assert.match(txt, /não substitui/i, `${act}: a mensagem explica que o nível de gestão não substitui`);
    assert.ok(txt.length > 60, act);
  }
  // etapas de sinistro e transições de qualidade
  assert.equal(C.claimStageCompetenceAct("DECISAO"), "CLAIM_DECISAO");
  assert.equal(C.claimStageCompetenceAct("NEGATIVA"), "CLAIM_NEGATIVA");
  assert.equal(C.claimStageCompetenceAct("CONTESTACAO"), "CLAIM_CONTESTACAO");
  assert.equal(C.claimStageCompetenceAct("INDENIZACAO_CUMPRIMENTO"), "CLAIM_INDENIZACAO_CUMPRIMENTO");
  for (const s of ["AVISO", "RECLAMACAO", "DOC_COMPLEMENTAR", "REGULACAO", "EXPECTATIVA", "ENCERRADO", null, undefined]) assert.equal(C.claimStageCompetenceAct(s), null, String(s));
  assert.equal(C.qualityTransitionCompetenceAct("NCR", "CONFIRMADA"), "QUALITY_NCR_CONFIRMADA");
  assert.equal(C.qualityTransitionCompetenceAct("NCR", "NAO_CONFIRMADA"), "QUALITY_NCR_NAO_CONFIRMADA");
  assert.equal(C.qualityTransitionCompetenceAct("NCR", "ENCERRADA"), "QUALITY_NCR_ENCERRADA");
  assert.equal(C.qualityTransitionCompetenceAct("WARRANTY", "COBERTA"), "QUALITY_WARRANTY_COBERTA");
  assert.equal(C.qualityTransitionCompetenceAct("WARRANTY", "NAO_COBERTA"), "QUALITY_WARRANTY_NAO_COBERTA");
  for (const [t, s] of [["NCR", "TRIAGEM"], ["NCR", "CANCELADA"], ["WARRANTY", "ENCERRADA"], ["WARRANTY", "EM_REPARO"], ["NCR", "COBERTA"], ["WARRANTY", "CONFIRMADA"]]) assert.equal(C.qualityTransitionCompetenceAct(t, s), null, `${t}->${s}`);
});

check("CASO F4-A-03 (paridade TS x SQL): os atos do SQL (gatilhos) são exatamente os da matriz TS", () => {
  const sql = read("supabase/migrations/20261124101000_competence_enforcement.sql");
  const stages = /new\.stage in \(([^)]*)\)/.exec(sql)[1].match(/'([A-Z_]+)'/g).map((x) => x.replaceAll("'", "")).sort();
  const tsStages = ["DECISAO", "NEGATIVA", "CONTESTACAO", "INDENIZACAO_CUMPRIMENTO"].filter((s) => C.claimStageCompetenceAct(s)).sort();
  assert.deepEqual(stages, tsStages, "etapas do sinistro");
  assert.ok(/array\['JURIDICO'\]/.test(sql), "sinistro => JURIDICO");
  assert.ok(/array\['SEGUROS', 'JURIDICO'\]/.test(sql), "minuta => SEGUROS ou JURIDICO");
  assert.ok(/array\['TECNICO_RESPONSAVEL'\]/.test(sql), "qualidade => TECNICO_RESPONSAVEL");
  const ncr = /entity_type = 'NCR' and new\.to_state in \(([^)]*)\)/.exec(sql)[1].match(/'([A-Z_]+)'/g).map((x) => x.replaceAll("'", "")).sort();
  assert.deepEqual(ncr, ["CONFIRMADA", "ENCERRADA", "NAO_CONFIRMADA"], "RNC");
  for (const s of ncr) assert.ok(C.qualityTransitionCompetenceAct("NCR", s), `TS cobre ${s}`);
  const war = /entity_type = 'WARRANTY' and new\.to_state in \(([^)]*)\)/.exec(sql)[1].match(/'([A-Z_]+)'/g).map((x) => x.replaceAll("'", "")).sort();
  assert.deepEqual(war, ["COBERTA", "NAO_COBERTA"], "garantia");
  for (const s of war) assert.ok(C.qualityTransitionCompetenceAct("WARRANTY", s), `TS cobre ${s}`);
  assert.ok(/array\['SEGUROS', 'JURIDICO'\]/.test(read("supabase/migrations/20261124102000_endorsement_review_requester_competence.sql")), "endosso crítico => SEGUROS ou JURIDICO");
  // sem redefinição de função de outras frentes (gatilhos, não create or replace das RPCs)
  assert.ok(!/create or replace function public\.(insurance_claim_advance|insurance_draft_approve|quality_transition_core)\b/.test(sql), "não redefine RPCs existentes");
});

check("CASO F4-A-04 (contrato da migration 100000): tabelas com RLS, ZERO escrita direta, append-only, só ADMIN concede, sem autoconcessão, fail-closed, sem acesso anon", () => {
  const sql = read("supabase/migrations/20261124100000_project_competences.sql");
  for (const needle of [
    "create table if not exists public.project_competences", "create table if not exists public.project_competence_events",
    "check (competence in ('TECNICO_RESPONSAVEL', 'JURIDICO', 'SEGUROS'))", "check (granted_by <> user_id)", "project_competences_one_active_idx",
    "enable row level security", "revoke all on public.project_competences, public.project_competence_events from public, anon, authenticated",
    "grant select on public.project_competences, public.project_competence_events to authenticated",
    "insurance_block_mutation", "COMPETENCE_IMMUTABLE", "SELF_GRANT_FORBIDDEN", "TARGET_NOT_ACTIVE_MEMBER", "public.acc_project_tier(p_project_id) <> 'ADMIN'",
    "REASON_REQUIRED", "VERSION_CONFLICT", "pm.status = 'ACTIVE'", "c.valid_from <= current_date", "security definer", "set search_path = ''",
    "revoke all on function public.acc_user_has_competence(uuid, uuid, text[]) from public, anon, authenticated",
    "revoke all on function public.acc_has_competence(uuid, text) from public, anon", "grant execute on function public.acc_has_competence(uuid, text) to authenticated",
    "PROJECT_COMPETENCE_GRANTED", "PROJECT_COMPETENCE_REVOKED",
  ]) assert.ok(sql.includes(needle), `falta: ${needle}`);
  assert.ok(!/grant (insert|update|delete)[^;]*project_competence/i.test(sql), "nenhum grant de escrita");
  assert.ok(!/to anon/i.test(sql), "nada para anon");
  assert.ok(!/create or replace function public\.(has_project_permission|project_permission_for|is_project_member|acc_project_tier|insurance_access|quality_can_)/.test(sql), "não toca nas funções centrais");
});

check("CASO F4-A-05 (contrato 102000): independência só do EMISSOR no CHECK, competência no gatilho e na RPC; idempotente; sem envio real", () => {
  const sql = read("supabase/migrations/20261124102000_endorsement_review_requester_competence.sql");
  for (const needle of [
    "insurance_endorsement_reviews_issuer_independence_check", "check (not dual_required or (issued_by_snapshot is not null and reviewer_id <> issued_by_snapshot))",
    "insurance_endorsement_reviews_zcompetence", "COMPETENCE_REQUIRED", "REVIEWER_IS_ISSUER", "if not exists", "drop trigger if exists", "create or replace function public.insurance_endorsement_review(",
    "grant execute on function public.insurance_endorsement_review(uuid, integer, text, jsonb) to authenticated", "reviewerIsRequester",
  ]) assert.ok(sql.includes(needle), `falta: ${needle}`);
  assert.ok(!sql.includes("REVIEWER_IS_REQUESTER"), "a regra estrita do solicitante saiu");
  assert.ok(!/reviewer_id <> requested_by_snapshot/.test(sql.replace(/--.*$/gm, "")), "CHECK não compara mais com o solicitante");
  assert.ok(!/real_send_enabled\s*=\s*true/i.test(sql), "nada liga o envio real");
});

check("CASO F4-A-06 (allowlist de operações): só conceder/revogar; entrada validada antes da rede; só ADMINISTRADOR espelhado", () => {
  assert.equal(OPS.isCompetenceOp("competence_grant"), true);
  assert.equal(OPS.isCompetenceOp("competence_revoke"), true);
  for (const bad of ["competence_delete", "grant", "", null, undefined, 1]) assert.equal(OPS.isCompetenceOp(bad), false, String(bad));
  const ok = OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: U2, competence: "JURIDICO", data: { valid_until: "2027-01-01", registration_kind: "OAB", registration_number: "  12345  ", basis_note: " ok " } });
  assert.equal(ok.rpc, "project_competence_grant");
  assert.deepEqual(Object.keys(ok.params).sort(), ["p_competence", "p_data", "p_project_id", "p_user_id"]);
  assert.equal(ok.params.p_data.registration_number, "12345", "número normalizado, nunca inventado");
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: U2, competence: "ADVOGADO" }), /Competência inválida/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: "x", op: "competence_grant", userId: U2, competence: "JURIDICO" }), /Identificador inválido/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: "nao", competence: "JURIDICO" }), /Identificador inválido/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: U2, competence: "JURIDICO", data: { valid_until: "amanhã" } }), /Data inválida/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: U2, competence: "JURIDICO", data: { registration_number: "1" } }), /tipo do registro/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: U2, competence: "JURIDICO", data: { registration_kind: "CRM" } }), /Tipo de registro/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_grant", userId: U2, competence: "JURIDICO", data: { registration_kind: "OAB", registration_number: "9".repeat(61) } }), /até 60/);
  const rv = OPS.buildCompetenceCall({ projectId: P1, op: "competence_revoke", id: U2, expectedRowVersion: 1, reason: "Mudou de função na obra" });
  assert.equal(rv.rpc, "project_competence_revoke");
  assert.deepEqual(Object.keys(rv.params).sort(), ["p_expected_row_version", "p_id", "p_reason"]);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_revoke", id: U2, reason: "motivo suficiente" }), /Versão/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_revoke", id: U2, expectedRowVersion: 1, reason: "curto" }), /motivo/);
  assert.throws(() => OPS.buildCompetenceCall({ projectId: P1, op: "competence_delete" }), /Operação desconhecida/);
  for (const p of ["ADMINISTRADOR", "ADMIN"]) assert.equal(OPS.isCompetenceOpAllowed(p), true, p);
  for (const p of ["GESTOR", "GERENTE", "COLABORADOR", "LEITURA", "EDITOR", "VIEWER", "XPTO", null, undefined, ""]) assert.equal(OPS.isCompetenceOpAllowed(p), false, String(p));
  // regra de autoconcessão espelhada na interface
  assert.equal(C.canGrantCompetence(true, U1, U1).ok, false);
  assert.equal(C.canGrantCompetence(true, U1, U2).ok, true);
  assert.equal(C.canGrantCompetence(false, U1, U2).ok, false);
  assert.equal(C.canGrantCompetence(true, null, U2).ok, false);
  const action = read("apps/web/app/[projectId]/seguros/actions-competencias.ts");
  assert.ok(action.indexOf("isCompetenceOpAllowed") < action.indexOf("supabase.rpc"), "permissão checada ANTES da RPC");
  assert.ok(!/service_role|SERVICE_ROLE/.test(action), "sem service role na action");
});

check("CASO F4-A-07 (mensagens): COMPETENCE_REQUIRED e erros de concessão têm texto claro em Seguros, Qualidade e Garantias", () => {
  for (const code of ["COMPETENCE_REQUIRED", "SELF_GRANT_FORBIDDEN", "TARGET_NOT_ACTIVE_MEMBER", "INVALID_COMPETENCE", "ALREADY_ACTIVE", "ALREADY_REVOKED", "INVALID_VALIDITY", "REVIEWER_IS_ISSUER", "ALREADY_REVIEWED"]) {
    const m = ERR.mapInsuranceError({ message: `${code}: detalhe técnico` });
    assert.equal(m.code, code);
    assert.ok(m.message.length > 30 && !/detalhe técnico|SQL|stack/i.test(m.message), code);
  }
  assert.match(ERR.mapInsuranceError({ message: "COMPETENCE_REQUIRED: x" }).message, /não substitui/);
  assert.ok(read("apps/web/lib/quality/mappers.ts").includes("COMPETENCE_REQUIRED"), "Qualidade reconhece o código");
  assert.ok(read("apps/web/lib/garantias/labels.ts").includes("COMPETENCE_REQUIRED:"), "Garantias traduz o código");
});

check("CASO F4-A-08 (UI): bloqueios proativos ligados — sinistro, minuta e endosso usam a competência; painel só chama a Server Action allowlisted; sem service role no cliente", () => {
  const claims = read("apps/web/components/insurance/panel-claims.tsx");
  assert.ok(claims.includes("ClaimStageButton"), "etapa do sinistro");
  const drafts = read("apps/web/components/insurance/panel-drafts.tsx");
  assert.ok(drafts.includes('useCompetenceFor("DRAFT_APPROVE")'), "aprovar minuta");
  const inst = read("apps/web/components/insurance/panel-instruments.tsx");
  assert.ok(inst.includes("hasReviewCompetence") && inst.includes('["SEGUROS", "JURIDICO"]'), "conferir endosso");
  const panel = read("apps/web/components/insurance/panel-competences.tsx");
  assert.ok(panel.includes("runCompetenceAction") && !/supabase/i.test(panel), "painel só usa a Server Action");
  assert.ok(!/service_role|SERVICE_ROLE|process\.env/.test(panel + read("apps/web/components/insurance/use-competence.ts")), "sem segredo no cliente");
  const btn = read("apps/web/components/insurance/competence-buttons.tsx");
  assert.ok(btn.includes("claimStageCompetenceAct") && btn.includes("extraDisabled"), "botão de etapa");
  // dados carregados fora de TABLES: ausência da migration não derruba o módulo; falha => sem competência
  const data = read("apps/web/lib/insurance-ui/data.ts");
  assert.ok(data.includes("competencesError") && data.includes("project_competences"), "carregamento fail-closed");
  assert.ok(!/key: "competences"/.test(data), "competências fora da lista TABLES");
  assert.ok(read("apps/web/components/insurance/seguros-workspace.tsx").includes("CompetencesPanel"), "painel montado na aba Auditoria");
});

check("CASO F4-A-09 (Hover Text): todo helpId usado pelo painel existe no catálogo e no manifesto; textos honestos (registro declarado, não validado)", () => {
  const files = ["apps/web/components/insurance/panel-competences.tsx"];
  const ids = new Set();
  for (const f of files) for (const m of read(f).matchAll(/helpId[=:]\s*"([a-z0-9.\-]+)"/g)) ids.add(m[1]);
  for (const m of read("apps/web/components/insurance/panel-competences.tsx").matchAll(/helpId="([a-z0-9.\-]+)"/g)) ids.add(m[1]);
  assert.ok(ids.size >= 12, `ids encontrados: ${ids.size}`);
  const manifest = ALL_HELP_MANIFESTS.find((m) => m.module === "seguros");
  for (const id of ids) {
    assert.ok(ACC_FEATURE_HELP[id], `falta no catálogo: ${id}`);
    assert.ok(ACC_FEATURE_HELP[id].shortDescription.length <= 160, id);
    assert.ok(manifest.elements.some((e) => e.helpId === id), `falta no manifesto: ${id}`);
  }
  const painel = ACC_FEATURE_HELP["seguros.competencias.painel"];
  assert.match(painel.description, /não a valida/);
  assert.match(painel.description, /não substitui/);
  assert.match(ACC_FEATURE_HELP["seguros.competencias.campo-registro"].description, /não a valida junto ao conselho nem a inventa/);
  // texto de endossos atualizado: o solicitante pode conferir
  assert.match(ACC_FEATURE_HELP["seguros.endossos.conferencias"].description, /Quem solicitou o endosso pode conferir/);
  assert.doesNotMatch(ACC_FEATURE_HELP["seguros.acoes.endosso-conferencia-recusar-abrir"].description, /bloqueado para quem solicitou/);
});

console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
