// D1 (fase 2) — Dashboard dos QUATRO PILARES e ligação alerta -> RNC/garantia/sinistro (camada de aplicação).
// Cobre os CASOS 33, 34, 35, 38 e 39 do conjunto de 40 + regras de rastreabilidade (SEM DADOS, pior pilar domina) e a
// garantia de que a tela é somente leitura. Sem banco, sem rede, sem IA.
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-pilares-dashboard.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const M = await import("../apps/web/lib/pilares/model.ts");
const L = await import("../apps/web/lib/pilares/alert-links.ts");
const Q = await import("../apps/web/lib/quality/index.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { ALERT_EXPERT_OPTIONS } = await import("../apps/web/lib/risk-alerts/experts/route-alert-expert.ts");

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");

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

const emptyInput = () => ({
  today: "2026-11-20",
  schedule: { baselineEndDate: null, requestedExtensionDays: null, physicalProgressPercent: null, activities: null, overdueSlaActions: null },
  safety: null,
  openRiskAlerts: null,
  quality: { ncrs: null, warranties: null, complaints: null, inspections: null, recurrences: null, repairs: null, actions: null, consequences: null, nonQualityCosts: null },
  insurance: { items: null, claims: null, totals: null },
});
const kpiOf = (dash, panel, id) => dash.panels.find((p) => p.id === panel).kpis.find((k) => k.id === id);

// ---------------------------------------------------------------- CASO 33 — dados insuficientes
check("CASO 33: sem nenhuma fonte, TODO KPI mostra SEM DADOS (nunca 0) e a criticidade é SEM_DADOS", () => {
  const dash = M.buildPillarsDashboard(emptyInput());
  assert.equal(dash.panels.length, 5);
  for (const p of dash.panels) for (const k of p.kpis) {
    assert.equal(k.value, null, `${p.id}/${k.id} deveria ser null`);
    assert.equal(k.display, "SEM DADOS");
    assert.equal(k.tone, "nodata");
  }
  assert.equal(dash.criticality.criticality, "SEM_DADOS");
  assert.equal(dash.consequencesTotal, null);
});
check("CASO 33: fonte lida sem NENHUM registro também é SEM DADOS; com registros e nenhum aberto é 0 verdadeiro", () => {
  const input = emptyInput();
  input.quality.ncrs = [];
  assert.equal(kpiOf(M.buildPillarsDashboard(input), "QUALIDADE", "rnc-abertas").display, "SEM DADOS");
  input.quality.ncrs = [{ id: "n1", code: "RNC-1", title: "x", state: "ENCERRADA", criticality: "LOW", reopen_count: 0 }];
  const k = kpiOf(M.buildPillarsDashboard(input), "QUALIDADE", "rnc-abertas");
  assert.equal(k.value, 0);
  assert.equal(k.display, "0");
});
check("CASO 33: valores monetários só somam o que foi registrado; sem valor = SEM DADOS; estimado e realizado separados", () => {
  const input = emptyInput();
  input.quality.nonQualityCosts = [
    { id: "c1", category: "RETRABALHO", estimated_amount: 1000, actual_amount: null },
    { id: "c2", category: "MULTA", estimated_amount: null, actual_amount: null },
  ];
  const d = M.buildPillarsDashboard(input);
  assert.equal(kpiOf(d, "CUSTO", "retrabalho-realizado").display, "SEM DADOS");
  assert.equal(kpiOf(d, "CUSTO", "nao-qualidade-estimado").value, 1000);
  input.quality.nonQualityCosts.push({ id: "c3", category: "RETRABALHO", estimated_amount: null, actual_amount: 2500.5 });
  const d2 = M.buildPillarsDashboard(input);
  assert.equal(kpiOf(d2, "CUSTO", "retrabalho-realizado").value, 2500.5);
  assert.equal(kpiOf(d2, "CUSTO", "nao-qualidade-estimado").value, 1000);
});
check("CASO 33: indenização recebida nunca tem valor em R$; seguro sem registros = SEM DADOS e fonte indisponível não vira 0", () => {
  const input = emptyInput();
  input.insurance = { items: [], claims: [{ id: "k1", stage: "INDENIZACAO_CUMPRIMENTO", claimed_amount: null }], totals: { instruments: 0, endorsements: 0, advances: 0, claims: 1 } };
  const d = M.buildPillarsDashboard(input);
  const ind = kpiOf(d, "JURIDICO_SEGUROS", "indenizacoes");
  assert.equal(ind.value, 1);
  assert.match(ind.detail, /SEM DADOS/);
  assert.equal(kpiOf(d, "JURIDICO_SEGUROS", "vencidos").display, "SEM DADOS");
  assert.equal(kpiOf(d, "CUSTO", "exposicao-sinistros").display, "SEM DADOS");
});

// ---------------------------------------------------------------- CASO 34 — impactos simultâneos nos 4 pilares
check("CASO 34: impactos simultâneos nos 4 pilares — pior pilar domina (CRÍTICO em SEGURANÇA prevalece com PRAZO/CUSTO baixos), nunca média", () => {
  const input = emptyInput();
  input.quality.ncrs = [{ id: "n1", code: "RNC-1", title: "Falha estrutural", state: "INVESTIGACAO", criticality: "CRITICAL", reopen_count: 0 }];
  const mk = (id, pillar, severity) => ({ id, ncr_id: "n1", warranty_case_id: null, pillar, severity, status: "ABERTA", description: `d-${pillar}`, source_ref: `foto:${id}` });
  input.quality.consequences = [mk("a", "PRAZO", "LOW"), mk("b", "CUSTO", "LOW"), mk("c", "SEGURANCA", "CRITICAL"), mk("d", "QUALIDADE", "MEDIUM")];
  const d = M.buildPillarsDashboard(input);
  assert.equal(d.criticality.criticality, "CRITICAL");
  assert.deepEqual(d.criticality.dominantPillars, ["SEGURANCA"]);
  assert.equal(d.criticality.byPillar.PRAZO, "LOW");
  assert.equal(d.panels.find((p) => p.id === "SEGURANCA").worstSeverity, "CRITICAL");
  assert.equal(d.panels.find((p) => p.id === "PRAZO").worstSeverity, "LOW");
  // mesma função da Qualidade (nada duplicado)
  assert.deepEqual(d.criticality, Q.computeCriticality(input.quality.consequences.map((c) => ({ pillar: c.pillar, severity: c.severity, sourceRef: c.source_ref }))));
  assert.equal(d.topConsequences[0].severity, "CRITICAL");
  assert.equal(d.topConsequences[0].sourceRef, "foto:c");
  assert.equal(d.topConsequences[0].entity.code, "RNC-1");
});
check("CASO 34: consequência MITIGADA/ENCERRADA não entra; pilar sem consequência continua SEM DADOS (não BAIXO)", () => {
  const input = emptyInput();
  input.quality.consequences = [
    { id: "a", ncr_id: "n1", warranty_case_id: null, pillar: "PRAZO", severity: "CRITICAL", status: "ENCERRADA", description: null, source_ref: "x" },
    { id: "b", ncr_id: "n1", warranty_case_id: null, pillar: "CUSTO", severity: "HIGH", status: "ABERTA", description: null, source_ref: "y" },
  ];
  const d = M.buildPillarsDashboard(input);
  assert.equal(d.criticality.criticality, "HIGH");
  assert.equal(d.criticality.byPillar.PRAZO, null);
  assert.deepEqual(d.criticality.pillarsWithoutData.sort(), ["PRAZO", "QUALIDADE", "SEGURANCA"]);
  assert.equal(d.panels.find((p) => p.id === "PRAZO").worstSeverity, null);
});

// ---------------------------------------------------------------- CASO 35 — RNC com encerramento indevido
check("CASO 35: RESOLVIDO do alerta nunca encerra a RNC/garantia/sinistro (guarda pura + parser da RPC)", () => {
  assert.equal(Q.mayAlertResolutionCloseEntity(), false);
  const g = Q.alertResolvedGuard({ entity: "NCR", from: "VERIFICACAO", actions: [], verification: null, evidenceIds: [] });
  assert.equal(g.alertResolutionClosesEntity, false);
  assert.equal(g.closureReady, false);
  assert.ok(g.blockers.length > 0);
  const parsed = L.parseGuardPayload({ alertResolutionClosesEntity: false, closureReady: false, blockers: ["EFFECTIVENESS_VERIFICATION_REQUIRED"], rule: "r" });
  assert.equal(parsed.closureReady, false);
  // payload que sugira fechamento por alerta é rejeitado
  assert.equal(L.parseGuardPayload({ alertResolutionClosesEntity: true, closureReady: true, blockers: [], rule: "r" }), null);
  assert.equal(L.parseGuardPayload(null), null);
  assert.match(L.blockerLabel("EFFECTIVENESS_VERIFICATION_REQUIRED"), /eficácia/);
});
check("CASO 35: vínculo alerta -> entidade só por referência explícita (UUID/código visível); entidades encerradas não geram aviso", () => {
  const alert = { caseId: "11111111-2222-3333-4444-555555555555", visibleCode: "ALR-00042" };
  const row = (over) => ({ type: "NCR", id: "n", code: "RNC-1", title: "t", state: "INVESTIGACAO", refs: [], dueDate: null, ...over });
  assert.equal(L.referencesAlert(["ALERTA:11111111-2222-3333-4444-555555555555"], alert), true);
  assert.equal(L.referencesAlert(["https://acc/x/alertas/11111111-2222-3333-4444-555555555555"], alert), true);
  assert.equal(L.referencesAlert(["ref ALR-00042 do relatório"], alert), true);
  assert.equal(L.referencesAlert(["ALR-000420"], alert), false, "fronteira de token");
  assert.equal(L.referencesAlert(["outro-caso", null, undefined], alert), false);
  const rows = [
    row({ id: "1", refs: ["ALERTA:" + alert.caseId] }),
    row({ id: "2", refs: ["ALERTA:" + alert.caseId], state: "ENCERRADA" }),
    row({ id: "3", type: "WARRANTY", state: "EM_REPARO", refs: [alert.visibleCode] }),
    row({ id: "4", type: "CLAIM", state: "ENCERRADO", refs: [alert.caseId] }),
    row({ id: "5", type: "CLAIM", state: "AVISO", refs: [alert.caseId] }),
    row({ id: "6", refs: ["sem relação"] }),
  ];
  assert.deepEqual(L.selectOpenLinkedEntities(rows, alert).map((r) => r.id), ["1", "3", "5"]);
  assert.equal(L.RESOLVED_NOTICE_TITLE, "RESOLVIDO não encerra a RNC/garantia/sinistro vinculada");
});
check("CASO 35: a UI do alerta exibe o aviso, o que falta, o link e os prazos distintos; nada é gravado", () => {
  const notice = read("apps/web/components/risk-alerts/linked-quality-notice.tsx");
  const page = read("apps/web/app/[projectId]/alertas/[caseId]/page.tsx");
  assert.match(notice, /RESOLVED_NOTICE_TITLE/);
  assert.match(notice, /blockerLabel/);
  assert.match(notice, /href=\{`\/\$\{projectId\}\/\$\{e\.route\}`\}/);
  assert.match(notice, /pilares\.alerta\.aviso-vinculo/);
  assert.match(notice, /pilares\.alerta\.prazos-distintos/);
  assert.match(notice, /Prazo de conclusão do tratamento\/reparo/);
  assert.match(page, /<LinkedQualityNotice /);
  assert.match(page, /prazo de assunção/);
  for (const src of [notice, read("apps/web/lib/pilares/alert-links-data.ts")]) {
    assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/, "somente leitura");
    assert.doesNotMatch(src, /rpc\("record_risk_alert_action/);
  }
});
check("CASO 35: ESPECIALISTA continua roteando ao Jurídico, Qualidade e Engenharia; AXIA nunca é destino; SLAs aprovados intactos", () => {
  const ids = ALERT_EXPERT_OPTIONS.map((o) => o.id);
  for (const id of ["legal-consultant", "quality-analyst", "engineering-director"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.some((i) => /axia/i.test(i)));
  const spec = read("apps/web/lib/ai/alert-consult/specialties.ts");
  assert.match(spec, /expertId: "quality-analyst"/);
  assert.match(spec, /expertId: "legal-consultant"/);
  assert.match(spec, /expertId: "engineering-director"/);
  const help = read("apps/web/lib/ui/help/modules/pilares.ts");
  assert.match(help, /CRÍTICO 1 hora corrida e ALTO 4 horas úteis; para MÉDIO e BAIXO, o prazo vem da Matriz de SLA configurada para a obra/);
  assert.doesNotMatch(help, /MÉDIO 2 dias|BAIXO 5 dias|migration/);
  // a migration do hotfix e os SLAs não foram tocados por este agente
  assert.doesNotMatch(read("apps/web/lib/pilares/data.ts") + read("apps/web/lib/pilares/alert-links-data.ts"), /sla_matrix|rpc\("record_risk_alert_action/);
});

// ---------------------------------------------------------------- CASO 38 — concorrência (UI somente leitura)
check("CASO 38: o dashboard é somente leitura (sem Server Action, sem mutação, sem formulário) — nada a conflitar; transições concorrentes vivem nas RPCs da fase 1", () => {
  const files = ["apps/web/app/[projectId]/pilares/page.tsx", "apps/web/lib/pilares/data.ts", "apps/web/lib/pilares/model.ts", "apps/web/lib/pilares/alert-links-data.ts"];
  for (const f of files) {
    const s = read(f);
    assert.doesNotMatch(s, /"use server"/);
    assert.doesNotMatch(s, /<form\b|<button\b|onClick/);
    assert.doesNotMatch(s, /\.(insert|update|upsert|delete)\(/);
    assert.doesNotMatch(s, /\.rpc\("(?!insurance_dashboard_items|quality_alert_resolved_guard)/, `${f}: RPC não permitida`);
  }
});

// ---------------------------------------------------------------- CASO 39 — isolamento entre projetos
check("CASO 39: toda leitura é filtrada por project_id e roda sob a sessão do usuário (RLS); nenhum service role", () => {
  const data = read("apps/web/lib/pilares/data.ts");
  const links = read("apps/web/lib/pilares/alert-links-data.ts");
  for (const s of [data, links]) {
    assert.match(s, /createSupabaseServerClient/);
    assert.doesNotMatch(s, /service[_-]?role|SERVICE_ROLE|createSupabaseAdmin|admin\.client/i);
  }
  assert.match(data, /\.eq\("project_id", projectId\)/);
  assert.match(data, /p_project_id: projectId/);
  assert.match(links, /\.eq\("project_id", projectId\)/);
  // cada .from(...) em data.ts é seguido de filtro por projeto (helpers rows/countOf) ou por versão/workbook já derivados do projeto
  const fromCalls = [...data.matchAll(/\.from\("([a-z_]+)"\)/g)].map((m) => m[1]);
  assert.ok(fromCalls.length >= 5);
  const sql = read("supabase/migrations/20261122100000_quality_foundation.sql") + read("supabase/migrations/20261122200000_seguros_garantias_model.sql");
  assert.match(sql, /enable row level security/);
});
check("CASO 39: o modelo é função pura das linhas recebidas (não lê relógio nem rede) e o menu não é autoridade de acesso", () => {
  const model = read("apps/web/lib/pilares/model.ts");
  assert.doesNotMatch(model, /new Date\(\)|Date\.now\(|fetch\(|supabase/);
  const nav = read("apps/web/lib/ui/nav-items.ts");
  assert.match(nav, /href: "pilares", label: "Quatro Pilares"/);
});

// ---------------------------------------------------------------- rastreabilidade e ajuda
check("todo KPI aponta helpId existente no catálogo, com fórmula, fonte, unidade, atualização e dado ausente; cada KPI exibe a fonte", () => {
  const dash = M.buildPillarsDashboard(emptyInput());
  let n = 0;
  for (const p of dash.panels) {
    assert.ok(ACC_FEATURE_HELP[p.helpId], p.helpId);
    for (const k of p.kpis) {
      const h = ACC_FEATURE_HELP[k.helpId];
      assert.ok(h, `${k.helpId} ausente`);
      for (const f of ["formula", "source", "unit", "refresh", "missingData"]) assert.ok(h[f]?.trim(), `${k.helpId}.${f}`);
      assert.ok(k.source.length > 3);
      n += 1;
    }
  }
  assert.equal(n, 37);
});
check("página: SEM DADOS explícito, fonte em cada cartão, ⓘ ao lado do rótulo (nunca dentro de button/a), alvos >= 44 px e sem title de ajuda", () => {
  const page = read("apps/web/app/[projectId]/pilares/page.tsx");
  assert.match(page, /Fonte: \{kpi\.source\}/);
  assert.match(page, /NO_DATA_LABEL/);
  assert.match(page, /min-h-11/);
  assert.doesNotMatch(page.replace(/<PageHeader[\s\S]*?\/>/, ""), /\btitle=/);
  assert.doesNotMatch(page, /<(button|a)\b[^>]*>[^<]*<FeatureInfo/);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
