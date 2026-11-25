// Carregador SOMENTE LEITURA do contexto comercial × orçamentário de uma
// obra para o Diretor Comercial IA.
//
// Regras:
// - usa exclusivamente o client de SESSÃO recebido (RLS do usuário) —
//   nunca service role; sem usuário de sessão identificado ou sem
//   membership ACTIVE na obra, nada é lido (SEM_AUTORIZACAO);
// - dados financeiros do relatório semanal (aba FINANCEIRO) só com a
//   mesma regra de acesso do dashboard financeiro (lib/financial/access);
// - cada item DISPONIVEL leva tabela/registro/campo de origem;
// - o que o ACC não tem é marcado "Dado não disponível no ACC" e o que a
//   obra não registrou é marcado SEM_REGISTRO_NA_OBRA — nunca um valor
//   estimado, somado, arredondado ou derivado;
// - falha de leitura vira ERRO_DE_CONSULTA daquela categoria, nunca
//   exceção que derrube a consulta ao Expert, nunca "zero".
// Nenhuma escrita, nenhuma chamada a sistema externo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateFinancialDashboardAccess } from "../financial/access";
import { COMMERCIAL_DATA_INVENTORY, ECONOMIC_CORE_KEYS, getInventoryEntry } from "./inventory";
import {
  COMMERCIAL_DATA_NOT_AVAILABLE_TEXT,
  type CommercialContext,
  type CommercialContextAccess,
  type CommercialContextItem,
  type CommercialDataAvailability,
  type CommercialDataKey,
  type CommercialSourceRef,
  type CommercialValueUnit,
} from "./types";

export interface LoadCommercialContextInput {
  projectId: string;
  /** Proposta adicional em foco — restringe a leitura de propostas a ela. */
  proposalId?: string | null;
  /** Relógio injetável (testes). */
  now?: () => Date;
}

const MAX_ROWS = 20;
const VALID_FINANCIAL_SHEET_STATUSES = ["EXTRACTED", "HUMAN_MAPPED", "HUMAN_VALIDATED"];
const FINANCIAL_COLUMNS_FOR_CONTEXT = [
  "acumulado_previsto",
  "acumulado_realizado",
  "medido",
  "faturado",
  "recebido",
] as const;

type Row = Record<string, unknown>;

class ItemCollector {
  private readonly items: CommercialContextItem[] = [];

  push(item: Omit<CommercialContextItem, "id">): void {
    if (item.availability === "DISPONIVEL" && !item.source) {
      // Invariante: nunca um valor disponível sem fonte rastreável.
      throw new Error(`Item comercial DISPONIVEL sem fonte: ${item.label}`);
    }
    this.items.push({ ...item, id: `COM-${this.items.length + 1}` });
  }

  marker(key: CommercialDataKey, availability: Exclude<CommercialDataAvailability, "DISPONIVEL">, note: string): void {
    const entry = getInventoryEntry(key);
    this.push({
      key,
      label: entry.label,
      availability,
      value: availability === "NAO_DISPONIVEL_NO_ACC" ? COMMERCIAL_DATA_NOT_AVAILABLE_TEXT : null,
      unit: null,
      source: null,
      note,
    });
  }

  has(key: CommercialDataKey): boolean {
    return this.items.some((item) => item.key === key);
  }

  all(): CommercialContextItem[] {
    return this.items;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** numeric do Postgres pode chegar como number ou string — nunca "0" para ausente. */
function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function source(table: string, recordId: unknown, field: string, locator: string | null = null): CommercialSourceRef {
  return { table, recordId: String(recordId), field, locator };
}

async function runQuery(query: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Row[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  if (data === null || data === undefined) return [];
  return Array.isArray(data) ? (data as Row[]) : [data as Row];
}

async function resolveAccess(supabase: SupabaseClient, projectId: string): Promise<CommercialContextAccess> {
  let userId: string | null = null;
  try {
    const auth = (supabase as { auth?: { getUser?: () => Promise<{ data: { user: { id: string } | null } }> } }).auth;
    if (!auth || typeof auth.getUser !== "function") {
      return { status: "NAO_AUTORIZADO", userId: null, financialAccess: false, reason: "Client sem sessão de usuário." };
    }
    const { data } = await auth.getUser();
    userId = data?.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return {
      status: "NAO_AUTORIZADO",
      userId: null,
      financialAccess: false,
      reason: "Sessão de usuário não identificada — o contexto comercial só é lido com a sessão (RLS) do usuário.",
    };
  }

  try {
    const rows = await runQuery(
      supabase
        .from("project_memberships")
        .select("permission,status,area")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .limit(1)
    );
    const membership = rows[0];
    if (!membership || membership.status !== "ACTIVE") {
      return { status: "NAO_AUTORIZADO", userId, financialAccess: false, reason: "Sem membership ACTIVE nesta obra." };
    }
    const financial = evaluateFinancialDashboardAccess({
      permission: (membership.permission as string | null) ?? null,
      status: (membership.status as string | null) ?? null,
      area: (membership.area as string | null) ?? null,
    });
    return { status: "AUTORIZADO", userId, financialAccess: financial.allowed, reason: financial.reason };
  } catch (error) {
    return {
      status: "NAO_AUTORIZADO",
      userId,
      financialAccess: false,
      reason: `Falha ao verificar membership: ${(error as Error).message}`,
    };
  }
}

async function guarded(
  collector: ItemCollector,
  keys: CommercialDataKey[],
  load: () => Promise<void>
): Promise<void> {
  try {
    await load();
  } catch (error) {
    // Mesmo com leitura parcial, a falha fica explícita — nunca um
    // conjunto incompleto apresentado como completo.
    for (const key of keys) {
      collector.marker(key, "ERRO_DE_CONSULTA", `Falha de leitura: ${(error as Error).message}`);
    }
  }
}

async function loadProject(supabase: SupabaseClient, projectId: string, collector: ItemCollector): Promise<void> {
  const rows = await runQuery(
    supabase
      .from("projects")
      .select("id,code,name,client,contract_number,start_date,baseline_end_date")
      .eq("id", projectId)
      .limit(1)
  );
  const project = rows[0];
  if (!project) {
    collector.marker("CONTRATO_BASE", "SEM_REGISTRO_NA_OBRA", "Obra não encontrada ou não visível para o usuário.");
    return;
  }
  const fields: Array<[string, string, CommercialValueUnit]> = [
    ["client", "Cliente", "TEXT"],
    ["contract_number", "Número do contrato", "TEXT"],
    ["start_date", "Início contratual", "DATE"],
    ["baseline_end_date", "Término contratual (linha de base)", "DATE"],
  ];
  for (const [field, label, unit] of fields) {
    const value = asString(project[field]);
    if (value === null) continue;
    collector.push({
      key: "CONTRATO_BASE",
      label,
      availability: "DISPONIVEL",
      value,
      unit,
      source: source("projects", project.id, field),
      note: null,
    });
  }
  if (!collector.has("CONTRATO_BASE")) {
    collector.marker("CONTRATO_BASE", "SEM_REGISTRO_NA_OBRA", "Obra sem dados contratuais básicos preenchidos.");
  }
}

async function loadProposals(
  supabase: SupabaseClient,
  projectId: string,
  proposalId: string | null,
  collector: ItemCollector
): Promise<string[]> {
  let query = supabase
    .from("project_additional_proposals")
    .select(
      "id,proposal_number,title,status,proposal_date,proposed_value,contracted_value,scope_approval_status,commercial_approval_status,schedule_extension_status,formalization_type"
    )
    .eq("project_id", projectId);
  if (proposalId) query = query.eq("id", proposalId);
  const rows = await runQuery(query.order("created_at", { ascending: false }).limit(MAX_ROWS));

  if (rows.length === 0) {
    collector.marker("PROPOSTAS_ADICIONAIS", "SEM_REGISTRO_NA_OBRA", "Nenhuma proposta de adicional registrada.");
    collector.marker("PRECO_DE_VENDA", "SEM_REGISTRO_NA_OBRA", "Nenhuma proposta com preço registrado.");
    return [];
  }

  for (const row of rows) {
    const ref = `${String(row.proposal_number)} — ${String(row.title)}`;
    collector.push({
      key: "PROPOSTAS_ADICIONAIS",
      label: `Proposta ${ref}: estágio e aprovações`,
      availability: "DISPONIVEL",
      value:
        `status=${String(row.status)}; aprovação de escopo=${String(row.scope_approval_status)}; ` +
        `aprovação comercial=${String(row.commercial_approval_status)}; prorrogação de prazo=${String(row.schedule_extension_status)}`,
      unit: "TEXT",
      source: source("project_additional_proposals", row.id, "status"),
      note: asString(row.proposal_date) ? `Data da proposta: ${String(row.proposal_date)}` : null,
    });

    const proposed = asNumber(row.proposed_value);
    if (proposed !== null) {
      collector.push({
        key: "PRECO_DE_VENDA",
        label: `Preço de venda proposto (estimativa registrada) — proposta ${ref}`,
        availability: "DISPONIVEL",
        value: proposed,
        unit: "BRL",
        source: source("project_additional_proposals", row.id, "proposed_value"),
        note: "Valor registrado na proposta; não informa custo, BDI nem margem.",
      });
    }
    const contracted = asNumber(row.contracted_value);
    if (contracted !== null) {
      collector.push({
        key: "PRECO_DE_VENDA",
        label: `Valor contratado — proposta ${ref}`,
        availability: "DISPONIVEL",
        value: contracted,
        unit: "BRL",
        source: source("project_additional_proposals", row.id, "contracted_value"),
        note: null,
      });
    }
    const formalization = asString(row.formalization_type);
    if (formalization) {
      collector.push({
        key: "CONDICOES_DE_CONTRATACAO",
        label: `Forma de formalização — proposta ${ref}`,
        availability: "DISPONIVEL",
        value: formalization,
        unit: "TEXT",
        source: source("project_additional_proposals", row.id, "formalization_type"),
        note: null,
      });
    }
  }
  if (!collector.has("PRECO_DE_VENDA")) {
    collector.marker("PRECO_DE_VENDA", "SEM_REGISTRO_NA_OBRA", "Propostas sem valor registrado.");
  }
  return rows.map((row) => String(row.id));
}

async function loadBudgetFiles(
  supabase: SupabaseClient,
  projectId: string,
  proposalIds: string[],
  collector: ItemCollector
): Promise<void> {
  if (proposalIds.length > 0) {
    const sources = await runQuery(
      supabase
        .from("additional_proposal_drive_sources")
        .select("id,proposal_id,file_name,source_classification,drive_modified_time,processing_status")
        .in("proposal_id", proposalIds)
        .in("source_classification", ["AXION_ESTIMATE", "AXION_PROPOSAL"])
        .limit(MAX_ROWS)
    );
    for (const row of sources) {
      collector.push({
        key: "ORCAMENTO_BASE_E_REVISOES",
        label: `Arquivo ${row.source_classification === "AXION_ESTIMATE" ? "de orçamento/estimativa" : "de proposta"} AXION: ${String(row.file_name)}`,
        availability: "DISPONIVEL",
        value: String(row.file_name),
        unit: "TEXT",
        source: source("additional_proposal_drive_sources", row.id, "file_name", asString(row.drive_modified_time)),
        note: "Somente metadados do arquivo — linhas e valores do orçamento não são extraídos pelo ACC.",
      });
    }
  }

  const documents = await runQuery(
    supabase
      .from("documents")
      .select("id,kind,title,document_versions(id,version_label,document_date,source_type)")
      .eq("project_id", projectId)
      .in("kind", ["PLANILHA", "PROPOSTA_AXION"])
      .limit(MAX_ROWS)
  );
  for (const doc of documents) {
    const versions = Array.isArray(doc.document_versions) ? (doc.document_versions as Row[]) : [];
    const budgetVersions = versions.filter(
      (version) => version.source_type === "ORCAMENTO" || doc.kind === "PROPOSTA_AXION"
    );
    for (const version of budgetVersions) {
      collector.push({
        key: "ORCAMENTO_BASE_E_REVISOES",
        label: `${doc.kind === "PROPOSTA_AXION" ? "Proposta AXION" : "Planilha de orçamento"} "${String(doc.title)}" — versão ${String(version.version_label)}`,
        availability: "DISPONIVEL",
        value: `${String(doc.title)} (${String(version.version_label)}, ${String(version.document_date)})`,
        unit: "TEXT",
        source: source("document_versions", version.id, "version_label", `documents.id=${String(doc.id)}`),
        note: "Somente metadados da versão — o conteúdo do orçamento não é estruturado no ACC.",
      });
    }
  }

  if (!collector.has("ORCAMENTO_BASE_E_REVISOES")) {
    collector.marker(
      "ORCAMENTO_BASE_E_REVISOES",
      "SEM_REGISTRO_NA_OBRA",
      "Nenhum arquivo de orçamento/proposta AXION registrado para esta obra."
    );
  }
}

async function loadBudgetResponses(supabase: SupabaseClient, projectId: string, collector: ItemCollector): Promise<void> {
  const rows = await runQuery(
    supabase
      .from("construmanager_version_impact_reviews")
      .select("id,price_impact,schedule_impact,budget_response,status,budget_responded_at,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(MAX_ROWS)
  );
  for (const row of rows) {
    if (row.price_impact !== "SIM" && row.status !== "PENDENTE_ORCAMENTO" && !asString(row.budget_response)) continue;
    const response = asString(row.budget_response);
    collector.push({
      key: "RESPOSTAS_DE_ORCAMENTOS",
      label: `Revisão de projeto com impacto de preço=${String(row.price_impact)} (status ${String(row.status)})`,
      availability: "DISPONIVEL",
      value: response ?? "Aguardando resposta de Orçamentos",
      unit: "TEXT",
      source: source("construmanager_version_impact_reviews", row.id, response ? "budget_response" : "status"),
      note: asString(row.budget_responded_at) ? `Respondido em ${String(row.budget_responded_at)}` : null,
    });
  }
  if (!collector.has("RESPOSTAS_DE_ORCAMENTOS")) {
    collector.marker("RESPOSTAS_DE_ORCAMENTOS", "SEM_REGISTRO_NA_OBRA", "Nenhuma revisão encaminhada a Orçamentos.");
  }
}

async function loadContractChanges(supabase: SupabaseClient, projectId: string, collector: ItemCollector): Promise<void> {
  const rows = await runQuery(
    supabase
      .from("contract_changes")
      .select("id,code,title,status,client_formalization_status,schedule_impact_status,technical_additional_days")
      .eq("project_id", projectId)
      .eq("status", "OPEN")
      .limit(MAX_ROWS)
  );
  for (const row of rows) {
    collector.push({
      key: "ALTERACOES_CONTRATUAIS",
      label: `Alteração contratual ${String(row.code)} — ${String(row.title)}`,
      availability: "DISPONIVEL",
      value: `formalização com o cliente=${String(row.client_formalization_status)}; impacto de prazo=${String(row.schedule_impact_status)}`,
      unit: "TEXT",
      source: source("contract_changes", row.id, "client_formalization_status"),
      note: null,
    });
    const days = asNumber(row.technical_additional_days);
    if (days !== null) {
      collector.push({
        key: "CRONOGRAMA_E_IMPACTOS_FINANCEIROS",
        label: `Dias adicionais (estimativa técnica revisada por humano) — ${String(row.code)}`,
        availability: "DISPONIVEL",
        value: days,
        unit: "DAYS",
        source: source("contract_changes", row.id, "technical_additional_days"),
        note: null,
      });
    }
  }
  if (!collector.has("ALTERACOES_CONTRATUAIS")) {
    collector.marker("ALTERACOES_CONTRATUAIS", "SEM_REGISTRO_NA_OBRA", "Nenhuma alteração contratual aberta.");
  }
}

async function loadExecutionRisks(supabase: SupabaseClient, projectId: string, collector: ItemCollector): Promise<void> {
  const rows = await runQuery(
    supabase
      .from("project_delivery_items")
      .select("id,title,status,risk,blocks_delivery,deadline")
      .eq("project_id", projectId)
      .in("risk", ["ALTA", "CRITICA"])
      .limit(MAX_ROWS)
  );
  for (const row of rows) {
    if (row.status === "CONCLUIDO" || row.status === "NAO_APLICAVEL") continue;
    collector.push({
      key: "RISCOS_DE_EXECUCAO",
      label: `Providência de entrega com risco ${String(row.risk)}: ${String(row.title)}`,
      availability: "DISPONIVEL",
      value: `status=${String(row.status)}; bloqueia entrega=${row.blocks_delivery === true ? "sim" : "não"}`,
      unit: "TEXT",
      source: source("project_delivery_items", row.id, "risk"),
      note: asString(row.deadline) ? `Prazo: ${String(row.deadline)}` : null,
    });
  }
  if (!collector.has("RISCOS_DE_EXECUCAO")) {
    collector.marker("RISCOS_DE_EXECUCAO", "SEM_REGISTRO_NA_OBRA", "Nenhuma providência aberta com risco alto/crítico.");
  }
}

async function loadSchedule(
  supabase: SupabaseClient,
  projectId: string,
  financialAccess: boolean,
  collector: ItemCollector
): Promise<void> {
  const baselines = await runQuery(
    supabase
      .from("project_schedule_baselines")
      .select("id,schedule_version_id,effective_from")
      .eq("project_id", projectId)
      .is("superseded_at", null)
      .limit(1)
  );
  const baseline = baselines[0];
  if (baseline) {
    collector.push({
      key: "CRONOGRAMA_E_IMPACTOS_FINANCEIROS",
      label: "Linha de base de cronograma vigente",
      availability: "DISPONIVEL",
      value: `schedule_version_id=${String(baseline.schedule_version_id)}`,
      unit: "TEXT",
      source: source("project_schedule_baselines", baseline.id, "schedule_version_id"),
      note: asString(baseline.effective_from) ? `Vigente desde ${String(baseline.effective_from)}` : null,
    });
  }

  if (!financialAccess) {
    collector.marker(
      "CRONOGRAMA_E_IMPACTOS_FINANCEIROS",
      "SEM_AUTORIZACAO",
      "Aba FINANCEIRO do relatório semanal não lida: usuário sem acesso financeiro nesta obra."
    );
    return;
  }

  const sheets = await runQuery(
    supabase
      .from("weekly_report_sheets")
      .select("id,workbook_id,status,cutoff_date,data,original_sheet_name")
      .eq("project_id", projectId)
      .eq("category", "FINANCEIRO")
      .in("status", VALID_FINANCIAL_SHEET_STATUSES)
      .order("cutoff_date", { ascending: false })
      .limit(1)
  );
  const sheet = sheets[0];
  const data = (sheet?.data ?? null) as { unit?: string; rows?: Array<{ period?: string; values?: Record<string, unknown>; sourceRow?: number }> } | null;
  const unit: CommercialValueUnit | null = data?.unit === "CURRENCY" ? "BRL" : data?.unit === "PERCENT" ? "PERCENT" : null;
  const rows = Array.isArray(data?.rows) ? data!.rows! : [];
  const lastRow = [...rows].reverse().find((row) => row.values && Object.values(row.values).some((v) => typeof v === "number"));

  if (!sheet || !lastRow || unit === null) {
    collector.marker(
      "CRONOGRAMA_E_IMPACTOS_FINANCEIROS",
      "SEM_REGISTRO_NA_OBRA",
      sheet && unit === null
        ? "Aba FINANCEIRO com unidade não identificada — valores não usados."
        : "Nenhuma aba FINANCEIRO válida do relatório semanal."
    );
    return;
  }

  for (const column of FINANCIAL_COLUMNS_FOR_CONTEXT) {
    const value = asNumber(lastRow.values?.[column]);
    if (value === null) continue;
    collector.push({
      key: "CRONOGRAMA_E_IMPACTOS_FINANCEIROS",
      label: `Relatório semanal FINANCEIRO — ${column} (período ${String(lastRow.period ?? "?")}, corte ${String(sheet.cutoff_date ?? "?")})`,
      availability: "DISPONIVEL",
      value,
      unit,
      source: source(
        "weekly_report_sheets",
        sheet.id,
        `data.rows.values.${column}`,
        lastRow.sourceRow !== undefined ? `linha ${lastRow.sourceRow} da aba ${String(sheet.original_sheet_name ?? "FINANCEIRO")}` : null
      ),
      note: "Valor realizado/medido da obra — não é custo orçado nem margem.",
    });
  }
}

/**
 * Carrega o contexto comercial × orçamentário de uma obra, somente
 * leitura, com a sessão do usuário. Nunca lança por falha de dado — cada
 * categoria com erro é marcada ERRO_DE_CONSULTA.
 */
export async function loadCommercialContext(
  supabase: SupabaseClient,
  input: LoadCommercialContextInput
): Promise<CommercialContext> {
  const now = input.now ?? (() => new Date());
  const proposalId = input.proposalId ?? null;
  const access = await resolveAccess(supabase, input.projectId);
  const collector = new ItemCollector();

  if (access.status === "AUTORIZADO") {
    await guarded(collector, ["CONTRATO_BASE"], () => loadProject(supabase, input.projectId, collector));
    let proposalIds: string[] = [];
    await guarded(collector, ["PROPOSTAS_ADICIONAIS", "PRECO_DE_VENDA", "CONDICOES_DE_CONTRATACAO"], async () => {
      proposalIds = await loadProposals(supabase, input.projectId, proposalId, collector);
    });
    await guarded(collector, ["ORCAMENTO_BASE_E_REVISOES"], () =>
      loadBudgetFiles(supabase, input.projectId, proposalIds, collector)
    );
    await guarded(collector, ["RESPOSTAS_DE_ORCAMENTOS"], () => loadBudgetResponses(supabase, input.projectId, collector));
    await guarded(collector, ["ALTERACOES_CONTRATUAIS"], () => loadContractChanges(supabase, input.projectId, collector));
    await guarded(collector, ["RISCOS_DE_EXECUCAO"], () => loadExecutionRisks(supabase, input.projectId, collector));
    await guarded(collector, ["CRONOGRAMA_E_IMPACTOS_FINANCEIROS"], () =>
      loadSchedule(supabase, input.projectId, access.financialAccess, collector)
    );
    if (!collector.has("CONDICOES_DE_CONTRATACAO")) {
      collector.marker(
        "CONDICOES_DE_CONTRATACAO",
        "SEM_REGISTRO_NA_OBRA",
        "Sem forma de formalização registrada; o texto das cláusulas chega pelo contexto contratual (baseContratual)."
      );
    }
  }

  // Categorias sem estrutura no ACC — sempre explícitas, nunca omitidas.
  for (const entry of COMMERCIAL_DATA_INVENTORY) {
    if (collector.has(entry.key)) continue;
    if (entry.presence === "NAO") {
      collector.marker(entry.key, "NAO_DISPONIVEL_NO_ACC", entry.note);
    } else {
      collector.marker(entry.key, "SEM_AUTORIZACAO", access.reason);
    }
  }

  const items = collector.all();
  const missingEconomicKeys = ECONOMIC_CORE_KEYS.filter(
    (key) => !items.some((item) => item.key === key && item.availability === "DISPONIVEL")
  );

  return {
    projectId: input.projectId,
    proposalId,
    loadedAt: now().toISOString(),
    access,
    items,
    missingEconomicKeys,
  };
}
