// Testes do carregador de contexto comercial × Orçamentos
// (apps/web/lib/commercial) — somente leitura, com client Supabase falso
// (sem rede, sem banco). Prova: dado ausente é marcado (nunca fabricado),
// todo número DISPONIVEL tem fonte rastreável e vem exatamente do
// registro, acesso financeiro respeitado, sem sessão nada é lido, falha
// de leitura vira ERRO_DE_CONSULTA (nunca zero) e nenhuma escrita ocorre.
//
// Uso:
//   node --import ./scripts/lib/block-live-ai.mjs scripts/test-commercial-context-loader.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { createFakeCommercialSupabase } from "./lib/fake-commercial-supabase.mjs";

register("./ts-module-resolver.mjs", import.meta.url);

const { loadCommercialContext } = await import("../apps/web/lib/commercial/load-commercial-context.ts");
const { COMMERCIAL_DATA_INVENTORY, ECONOMIC_CORE_KEYS } = await import("../apps/web/lib/commercial/inventory.ts");
const { formatCommercialContextForPrompt, collectCitableCommercialNumbers } = await import(
  "../apps/web/lib/commercial/format-commercial-context.ts"
);

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

const PROJECT = "proj-1";
const OTHER = "proj-2";

function baseTables(overrides = {}) {
  return {
    project_memberships: [
      { project_id: PROJECT, user_id: "user-1", permission: "GERENTE", status: "ACTIVE", area: null },
      { project_id: PROJECT, user_id: "viewer", permission: "LEITURA", status: "ACTIVE", area: "ENGENHARIA" },
      { project_id: PROJECT, user_id: "inactive", permission: "GERENTE", status: "INACTIVE", area: null },
    ],
    projects: [
      { id: PROJECT, code: "WEG-01", name: "Obra WEG", client: "Cliente X", contract_number: "CT-123", start_date: "2026-01-10", baseline_end_date: "2026-12-20" },
    ],
    project_additional_proposals: [
      {
        id: "prop-1", project_id: PROJECT, proposal_number: "AD-01", title: "Reforço de fundação", status: "IN_NEGOTIATION",
        proposal_date: "2026-10-01", proposed_value: 152340.55, contracted_value: null,
        scope_approval_status: "APPROVED", commercial_approval_status: "PENDING", schedule_extension_status: "TO_BE_REQUESTED",
        formalization_type: null,
      },
      {
        id: "prop-other", project_id: OTHER, proposal_number: "AD-99", title: "De outra obra", status: "CONTRACTED",
        proposed_value: 999999, contracted_value: 888888,
      },
    ],
    additional_proposal_drive_sources: [
      { id: "src-1", proposal_id: "prop-1", file_name: "Orcamento AD-01 rev2.xlsx", source_classification: "AXION_ESTIMATE", drive_modified_time: "2026-10-02T10:00:00Z" },
      { id: "src-2", proposal_id: "prop-1", file_name: "Planilha cliente.xlsx", source_classification: "CLIENT_SPREADSHEET" },
    ],
    documents: [],
    construmanager_version_impact_reviews: [
      { id: "rev-1", project_id: PROJECT, price_impact: "SIM", schedule_impact: "NAO", budget_response: null, status: "PENDENTE_ORCAMENTO" },
    ],
    contract_changes: [
      { id: "cc-1", project_id: PROJECT, code: "ALT-03", title: "Mudança de traçado", status: "OPEN", client_formalization_status: "PENDING", schedule_impact_status: "EXTENSION_REQUIRED", technical_additional_days: 12 },
    ],
    project_delivery_items: [
      { id: "di-1", project_id: PROJECT, title: "Ligação definitiva de energia", status: "PENDENTE", risk: "CRITICA", blocks_delivery: true },
      { id: "di-2", project_id: PROJECT, title: "Já concluída", status: "CONCLUIDO", risk: "ALTA", blocks_delivery: true },
    ],
    project_schedule_baselines: [{ id: "bl-1", project_id: PROJECT, schedule_version_id: "sv-1", superseded_at: null, effective_from: "2026-02-01" }],
    weekly_report_sheets: [
      {
        id: "sheet-1", project_id: PROJECT, category: "FINANCEIRO", status: "HUMAN_VALIDATED", cutoff_date: "2026-11-14",
        original_sheet_name: "FINANCEIRO", workbook_id: "wb-1",
        data: { unit: "CURRENCY", rows: [{ period: "S45", values: { medido: 1200000, faturado: 1100000, recebido: null }, sourceRow: 18 }] },
      },
    ],
    ...overrides,
  };
}

const NOW = () => new Date("2026-11-20T12:00:00Z");

await check("inventário cobre as 13 categorias de Orçamentos pedidas + estágio/alterações e marca o núcleo econômico", () => {
  const keys = COMMERCIAL_DATA_INVENTORY.map((entry) => entry.key);
  for (const key of [
    "ORCAMENTO_BASE_E_REVISOES", "CUSTOS_DIRETOS", "CUSTOS_INDIRETOS", "BDI", "PRECO_DE_VENDA", "MARGEM_PREVISTA",
    "CONTINGENCIAS", "PREMISSAS_DO_ORCAMENTO", "PRODUTIVIDADE", "ALTERNATIVAS_DE_ENGENHARIA", "RISCOS_DE_EXECUCAO",
    "CRONOGRAMA_E_IMPACTOS_FINANCEIROS", "CONDICOES_DE_CONTRATACAO",
  ]) {
    assert.ok(keys.includes(key), `falta ${key}`);
  }
  assert.deepEqual([...ECONOMIC_CORE_KEYS].sort(), ["BDI", "CONTINGENCIAS", "CUSTOS_DIRETOS", "CUSTOS_INDIRETOS", "MARGEM_PREVISTA"]);
});

await check("dado inexistente no ACC é marcado 'Dado não disponível no ACC' — sem valor numérico e sem fonte", async () => {
  const supabase = createFakeCommercialSupabase({ tables: baseTables() });
  const ctx = await loadCommercialContext(supabase, { projectId: PROJECT, now: NOW });
  for (const key of ["CUSTOS_DIRETOS", "CUSTOS_INDIRETOS", "BDI", "MARGEM_PREVISTA", "CONTINGENCIAS", "PREMISSAS_DO_ORCAMENTO", "PRODUTIVIDADE", "ALTERNATIVAS_DE_ENGENHARIA"]) {
    const item = ctx.items.find((i) => i.key === key);
    assert.ok(item, `item ${key} ausente (deveria ser marcado, nunca omitido)`);
    assert.equal(item.availability, "NAO_DISPONIVEL_NO_ACC");
    assert.equal(item.value, "Dado não disponível no ACC");
    assert.equal(item.source, null);
  }
  assert.deepEqual([...ctx.missingEconomicKeys].sort(), [...ECONOMIC_CORE_KEYS].sort());
});

await check("todo item DISPONIVEL tem fonte; números são exatamente os do registro (nada somado/arredondado/inventado)", async () => {
  const supabase = createFakeCommercialSupabase({ tables: baseTables() });
  const ctx = await loadCommercialContext(supabase, { projectId: PROJECT, now: NOW });
  for (const item of ctx.items.filter((i) => i.availability === "DISPONIVEL")) {
    assert.ok(item.source && item.source.table && item.source.recordId && item.source.field, `sem fonte: ${item.label}`);
  }
  const numbers = [...collectCitableCommercialNumbers(ctx).values()].map((i) => [i.source.table, i.source.recordId, i.source.field, i.value]);
  assert.deepEqual(numbers.sort(), [
    ["contract_changes", "cc-1", "technical_additional_days", 12],
    ["project_additional_proposals", "prop-1", "proposed_value", 152340.55],
    ["weekly_report_sheets", "sheet-1", "data.rows.values.faturado", 1100000],
    ["weekly_report_sheets", "sheet-1", "data.rows.values.medido", 1200000],
  ].sort());
  // recebido=null nunca vira 0
  assert.ok(!ctx.items.some((i) => i.source?.field === "data.rows.values.recebido"));
  // dado de outra obra nunca entra
  assert.ok(!ctx.items.some((i) => i.source?.recordId === "prop-other"));
  // providência concluída não é risco aberto
  assert.ok(!ctx.items.some((i) => i.source?.recordId === "di-2"));
  // planilha do cliente não é orçamento AXION
  assert.ok(!ctx.items.some((i) => i.source?.recordId === "src-2"));
  assert.ok(ctx.items.some((i) => i.source?.recordId === "src-1" && i.key === "ORCAMENTO_BASE_E_REVISOES"));
  assert.ok(ctx.items.some((i) => i.key === "RESPOSTAS_DE_ORCAMENTOS" && i.value === "Aguardando resposta de Orçamentos"));
});

await check("sem acesso financeiro: aba FINANCEIRO não é lida e é marcada SEM_AUTORIZACAO", async () => {
  const supabase = createFakeCommercialSupabase({ userId: "viewer", tables: baseTables() });
  const ctx = await loadCommercialContext(supabase, { projectId: PROJECT, now: NOW });
  assert.equal(ctx.access.status, "AUTORIZADO");
  assert.equal(ctx.access.financialAccess, false);
  assert.ok(!supabase.calls.includes("weekly_report_sheets"), "não pode nem consultar a aba FINANCEIRO");
  assert.ok(ctx.items.some((i) => i.key === "CRONOGRAMA_E_IMPACTOS_FINANCEIROS" && i.availability === "SEM_AUTORIZACAO"));
  assert.ok(!ctx.items.some((i) => i.source?.table === "weekly_report_sheets"));
});

await check("sem sessão de usuário ou sem membership ACTIVE: nada é lido, tudo marcado (SEM_AUTORIZACAO / não disponível)", async () => {
  for (const userId of [null, "inactive", "estranho"]) {
    const supabase = createFakeCommercialSupabase({ userId, tables: baseTables() });
    const ctx = await loadCommercialContext(supabase, { projectId: PROJECT, now: NOW });
    assert.equal(ctx.access.status, "NAO_AUTORIZADO");
    assert.ok(ctx.items.every((i) => i.availability !== "DISPONIVEL"));
    assert.ok(supabase.calls.every((t) => t === "project_memberships"), `leu tabelas sem autorização: ${supabase.calls}`);
  }
  // client sem auth (ex.: objeto de teste) não lança
  const ctx = await loadCommercialContext({}, { projectId: PROJECT, now: NOW });
  assert.equal(ctx.access.status, "NAO_AUTORIZADO");
});

await check("falha de leitura vira ERRO_DE_CONSULTA da categoria — nunca zero, nunca derruba o carregamento", async () => {
  const supabase = createFakeCommercialSupabase({ tables: baseTables(), failTables: ["project_additional_proposals"] });
  const ctx = await loadCommercialContext(supabase, { projectId: PROJECT, now: NOW });
  const errored = ctx.items.filter((i) => i.availability === "ERRO_DE_CONSULTA").map((i) => i.key);
  assert.ok(errored.includes("PROPOSTAS_ADICIONAIS") && errored.includes("PRECO_DE_VENDA"));
  assert.ok(!ctx.items.some((i) => i.key === "PRECO_DE_VENDA" && i.availability === "DISPONIVEL"));
  assert.ok(ctx.items.some((i) => i.key === "ALTERACOES_CONTRATUAIS" && i.availability === "DISPONIVEL"), "demais categorias seguem");
});

await check("obra sem registros: categorias existentes marcadas SEM_REGISTRO_NA_OBRA, sem número algum", async () => {
  const empty = baseTables({
    project_additional_proposals: [], construmanager_version_impact_reviews: [], contract_changes: [],
    project_delivery_items: [], project_schedule_baselines: [], weekly_report_sheets: [], additional_proposal_drive_sources: [],
  });
  const ctx = await loadCommercialContext(createFakeCommercialSupabase({ tables: empty }), { projectId: PROJECT, now: NOW });
  assert.equal(collectCitableCommercialNumbers(ctx).size, 0);
  for (const key of ["PRECO_DE_VENDA", "PROPOSTAS_ADICIONAIS", "ORCAMENTO_BASE_E_REVISOES", "RISCOS_DE_EXECUCAO"]) {
    assert.ok(ctx.items.some((i) => i.key === key && i.availability === "SEM_REGISTRO_NA_OBRA"), key);
  }
});

await check("proposta em foco restringe a leitura àquela proposta", async () => {
  const tables = baseTables();
  tables.project_additional_proposals.push({ id: "prop-2", project_id: PROJECT, proposal_number: "AD-02", title: "Outra", status: "POSSIBLE_ADDITIONAL", proposed_value: 10 });
  const ctx = await loadCommercialContext(createFakeCommercialSupabase({ tables }), { projectId: PROJECT, proposalId: "prop-2", now: NOW });
  assert.ok(ctx.items.some((i) => i.source?.recordId === "prop-2"));
  assert.ok(!ctx.items.some((i) => i.source?.recordId === "prop-1"));
});

await check("bloco de prompt cita id COM-n, situação e fonte de cada item, e avisa que falta base econômica", async () => {
  const ctx = await loadCommercialContext(createFakeCommercialSupabase({ tables: baseTables() }), { projectId: PROJECT, now: NOW });
  const text = formatCommercialContextForPrompt(ctx);
  for (const item of ctx.items) assert.ok(text.includes(`[${item.id}]`));
  assert.match(text, /project_additional_proposals#prop-1\.proposed_value/);
  assert.match(text, /DADO NÃO DISPONÍVEL NO ACC/);
  assert.match(text, /solicitar análise de Orçamentos/);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
