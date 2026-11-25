// Modelo de apresentação do módulo Qualidade (fase 2 — UI). PURO: sem banco, rede, IA ou React.
// Rótulos em português, mensagens dos bloqueios/erros das RPCs, KPIs do dashboard e regras de exibição.
// A UI NUNCA é a autoridade: RLS e as RPCs (quality_*) decidem; este módulo apenas explica e antecipa o que o banco fará.

import { allowedTransitions, roleSatisfies, TRANSITIONS, isTerminal } from "./state-machine";
import { parseQualityError } from "./mappers";
import type { Criticality, QualityEntityType, QualityRole } from "./types";

// ---------------------------------------------------------------- rótulos ----

export const NCR_STATE_LABEL: Record<string, string> = {
  DETECTADA: "Detectada",
  TRIAGEM: "Em triagem",
  INVESTIGACAO: "Em investigação",
  CONFIRMADA: "Confirmada",
  PLANO_ACAO: "Plano de ação",
  CORRECAO: "Em correção",
  VERIFICACAO: "Em verificação",
  ENCERRADA: "Encerrada",
  NAO_CONFIRMADA: "Não confirmada",
  DUPLICADA: "Duplicada",
  CANCELADA: "Cancelada",
  REABERTA: "Reaberta",
};

export const ORIGIN_LABEL: Record<string, string> = {
  SSMA_FOTO: "Foto SSMA",
  EMAIL: "E-mail",
  DIARIO_OBRA: "Diário de obra",
  FISCALIZACAO: "Relatório de fiscalização",
  INSPECAO: "Inspeção",
  ENSAIO_LAUDO: "Ensaio / laudo",
  DOCUMENTO: "Documento",
  RECLAMACAO_CLIENTE: "Reclamação de cliente",
  GARANTIA: "Garantia",
  MANUAL: "Registro manual",
  OUTRO: "Outro",
};

/** Origens aceitas ao CRIAR uma RNC pela interface (as demais origens do banco vêm de fluxos próprios). */
export const NCR_CREATE_ORIGINS = [
  "SSMA_FOTO",
  "EMAIL",
  "DIARIO_OBRA",
  "FISCALIZACAO",
  "INSPECAO",
  "ENSAIO_LAUDO",
  "DOCUMENTO",
  "RECLAMACAO_CLIENTE",
  "MANUAL",
] as const;

export const EVIDENCE_SOURCE_OPTIONS = [
  "SSMA_FOTO",
  "EMAIL",
  "DIARIO_OBRA",
  "FISCALIZACAO",
  "INSPECAO",
  "ENSAIO_LAUDO",
  "DOCUMENTO",
  "OUTRO",
] as const;

export const CLASSIFICATION_LABEL: Record<string, string> = {
  SUSPEITA: "Suspeita",
  INDICIO: "Indício",
  NC_COMPROVADA: "NC comprovada",
  RISCO_POTENCIAL: "Risco potencial",
};
export const CLASSIFICATION_ORDER = ["SUSPEITA", "INDICIO", "NC_COMPROVADA", "RISCO_POTENCIAL"] as const;

export const EPISTEMIC_LABEL: Record<string, string> = {
  FATO: "Fato",
  INFERENCIA: "Inferência",
  RECOMENDACAO: "Recomendação",
};

export const CRITICALITY_LABEL: Record<string, string> = {
  CRITICAL: "Crítica",
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
  SEM_DADOS: "SEM DADOS",
};
export const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export const PILLAR_LABEL: Record<string, string> = {
  PRAZO: "Prazo",
  CUSTO: "Custo",
  SEGURANCA: "Segurança",
  QUALIDADE: "Qualidade",
};
export const PROBABILITY_LABEL: Record<string, string> = {
  RARA: "Rara",
  IMPROVAVEL: "Improvável",
  POSSIVEL: "Possível",
  PROVAVEL: "Provável",
  QUASE_CERTA: "Quase certa",
};
export const CONSEQUENCE_STATUS_LABEL: Record<string, string> = {
  ABERTA: "Aberta",
  EM_TRATAMENTO: "Em tratamento",
  MITIGADA: "Mitigada",
  ACEITA: "Aceita",
  ENCERRADA: "Encerrada",
};

export const ACTION_KIND_LABEL: Record<string, string> = { CONTENCAO: "Contenção", CORRETIVA: "Corretiva", PREVENTIVA: "Preventiva" };
export const ACTION_STATUS_LABEL: Record<string, string> = {
  PLANEJADA: "Planejada",
  EM_ANDAMENTO: "Em andamento",
  EXECUTADA: "Executada",
  CANCELADA: "Cancelada",
};
export const VERIFICATION_RESULT_LABEL: Record<string, string> = { EFICAZ: "Eficaz", INEFICAZ: "Ineficaz", PARCIAL: "Parcial" };

export const COMPLAINT_CHANNEL_LABEL: Record<string, string> = {
  EMAIL_CLIENTE: "E-mail do cliente",
  EMAIL_AXION: "E-mail AXION",
  TELEFONE: "Telefone",
  PORTAL: "Portal",
  PRESENCIAL: "Presencial",
  OUTRO: "Outro",
};
export const COMPLAINT_STATUS_LABEL: Record<string, string> = {
  RECEBIDA: "Recebida",
  EM_ANALISE: "Em análise",
  PROCEDENTE: "Procedente",
  IMPROCEDENTE: "Improcedente",
  ENCERRADA: "Encerrada",
};
export const INSPECTION_RESULT_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  CONFORME: "Conforme",
  NAO_CONFORME: "Não conforme",
  PARCIAL: "Parcial",
};
export const TEST_RESULT_LABEL: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
  INCONCLUSIVO: "Inconclusivo",
};
export const COST_CATEGORY_LABEL: Record<string, string> = {
  RETRABALHO: "Retrabalho",
  MATERIAL: "Material",
  MAO_DE_OBRA: "Mão de obra",
  MULTA: "Multa",
  GARANTIA: "Garantia",
  PERDA_PRAZO: "Perda de prazo",
  OUTRO: "Outro",
};

export const label = (map: Record<string, string>, key: string | null | undefined): string => (key ? (map[key] ?? key) : "SEM DADOS");

// ------------------------------------------------- bloqueios e erros (PT) ----

export const BLOCKER_LABEL: Record<string, string> = {
  CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE: "Confirmar exige ao menos uma evidência classificada como NC comprovada.",
  ACTION_PLAN_REQUIRED: "Registre ao menos uma ação (CAPA) não cancelada antes do plano de ação.",
  NO_CORRECTIVE_ACTION: "Não há ação corretiva registrada.",
  ACTIONS_NOT_EXECUTED: "Há ações ainda não executadas (ou canceladas).",
  NOT_IN_VERIFICATION: "A RNC precisa estar em verificação para ser encerrada.",
  EFFECTIVENESS_VERIFICATION_REQUIRED: "Falta a verificação de eficácia.",
  LATEST_VERIFICATION_NOT_EFFECTIVE: "A última verificação de eficácia não foi EFICAZ.",
  VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN: "A verificação é anterior ao último ciclo de correção ou reabertura; registre nova verificação.",
  VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN: "A verificação é anterior ao último reparo ou reabertura; registre nova verificação.",
  VERIFICATION_EVIDENCE_REQUIRED: "A verificação de eficácia precisa de evidência.",
  NOT_REPAIRED: "O caso precisa estar reparado.",
  NOT_VERIFIED: "O caso precisa estar verificado.",
  REPAIR_RECORD_REQUIRED: "Falta o registro de reparo executado.",
  CUSTOMER_ACCEPTANCE_REQUIRED: "Falta o aceite do cliente.",
  CUSTOMER_ACCEPTANCE_NOT_PROVEN: "O aceite do cliente foi só informado: falta o aceite comprovado.",
  FORBIDDEN: "Seu perfil não permite esta transição.",
  JUSTIFICATION_REQUIRED: "Justificativa obrigatória (mínimo de 10 caracteres).",
  EVIDENCE_REQUIRED: "Evidência obrigatória nesta transição.",
  DUPLICATE_TARGET_INVALID: "Informe a RNC original (mesmo projeto e ativa).",
  INVALID_TRANSITION: "Transição não permitida a partir do estado atual.",
  BLOCKERS_UNAVAILABLE: "Não foi possível consultar os bloqueios no banco; por segurança a transição fica indisponível.",
};

export const blockerLabel = (code: string): string => BLOCKER_LABEL[code] ?? `Bloqueio: ${code}`;

export interface QualityActionError {
  code: string;
  message: string;
  /** VERSION_CONFLICT: outra pessoa alterou o registro; a tela deve ser recarregada antes de tentar de novo. */
  conflict: boolean;
}

const ERROR_LABEL: Record<string, string> = {
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  FORBIDDEN: "Você não tem autorização para esta ação neste projeto.",
  VERSION_REQUIRED: "Versão do registro não informada. Recarregue a página.",
  VERSION_CONFLICT: "Conflito de versão: outra pessoa alterou este registro. Recarregue a página para ver o estado atual e tente de novo.",
  INVALID_TRANSITION: "Transição não permitida a partir do estado atual.",
  JUSTIFICATION_REQUIRED: "Justificativa obrigatória (mínimo de 10 caracteres).",
  EVIDENCE_REQUIRED: "Evidência obrigatória nesta transição.",
  EVIDENCE_INVALID: "Evidência inexistente ou pertencente a outro caso/projeto.",
  DUPLICATE_TARGET_INVALID: "Informe a RNC original (mesmo projeto e ativa).",
  TRANSITION_BLOCKED: "Transição bloqueada.",
  ORIGIN_REQUIRED: "Toda RNC aponta para a fonte original: informe a referência da origem.",
  INVALID_DATA: "Dados inválidos para este registro.",
  INVALID_STATE: "O registro não está num estado que permita esta ação.",
  EVIDENCE_LOCKED: "Esta evidência sustenta uma verificação, um aceite ou uma decisão; registre uma nova evidência em vez de reclassificá-la.",
  EPISTEMIC_INVALID: "NC comprovada exige tipo epistêmico FATO: inferência ou recomendação não comprovam uma não conformidade.",
  CASE_NOT_ACTIVE: "O caso está encerrado, cancelado ou fora do fluxo: reabra antes de registrar ou editar.",
  COST_SOURCE_REQUIRED: "Valor sem fonte não é aceito: informe a fonte (nota, orçamento, medição). Sem valor o custo fica SEM DADOS.",
  LINK_TARGET_INVALID: "O alerta e a entidade precisam existir e ser do mesmo projeto.",
  DUPLICATE_EVIDENCE: "Esta fonte já foi registrada como evidência neste caso (nada foi duplicado).",
  DUPLICATE_RECORD: "Registro já existente para esta fonte (nada foi duplicado).",
};

/** Códigos cuja mensagem do banco já é legível e específica (em português): é exibida no lugar do texto genérico. */
const DETAIL_CODES = new Set(["INVALID_DATA", "INVALID_STATE", "CASE_NOT_ACTIVE", "COST_SOURCE_REQUIRED", "EPISTEMIC_INVALID", "LINK_TARGET_INVALID", "EVIDENCE_LOCKED"]);

/** Converte a mensagem crua do Postgres/PostgREST em erro estável e legível (nunca expõe SQL ou detalhes internos). */
export function describeQualityError(raw: string | null | undefined): QualityActionError {
  const text = (raw ?? "").trim();
  const parsed = parseQualityError(text);
  if (parsed) {
    let message = ERROR_LABEL[parsed.code] ?? "Operação recusada.";
    if (parsed.detail && (DETAIL_CODES.has(parsed.code) || (parsed.code === "FORBIDDEN" && /perfil de gestão/i.test(parsed.detail)))) message = parsed.detail;
    if (parsed.code === "TRANSITION_BLOCKED") {
      const codes = parsed.detail.split(",").map((c) => c.trim()).filter(Boolean);
      message = `Transição bloqueada: ${codes.map(blockerLabel).join(" ")}`;
    }
    return { code: parsed.code, message, conflict: parsed.code === "VERSION_CONFLICT" };
  }
  if (/row-level security|permission denied|42501/i.test(text)) return { code: "FORBIDDEN", message: ERROR_LABEL.FORBIDDEN, conflict: false };
  if (/duplicate key|23505/i.test(text)) return { code: "DUPLICATE", message: "Registro já existente para esta fonte (nada foi duplicado).", conflict: false };
  if (/violates check constraint|23514/i.test(text)) return { code: "INVALID_DATA", message: "Dados fora das regras do registro (campo obrigatório ou valor inválido).", conflict: false };
  if (/foreign key|23503/i.test(text)) return { code: "INVALID_REFERENCE", message: "Referência inválida (registro de outro projeto ou inexistente).", conflict: false };
  return { code: "ERROR", message: "Não foi possível concluir a operação. Nenhum dado foi alterado.", conflict: false };
}

// ------------------------------------------------------- criticidade ----

export type AlertSeverityKey = "BAIXA" | "MEDIA" | "ALTA" | "CRITICA";
/** Reaproveita o selo de risco do ACC (cores validadas). SEM_DADOS não tem selo de risco: é exibido como texto "SEM DADOS". */
export function criticalityToSeverity(c: Criticality | string | null | undefined): AlertSeverityKey | null {
  switch (c) {
    case "CRITICAL": return "CRITICA";
    case "HIGH": return "ALTA";
    case "MEDIUM": return "MEDIA";
    case "LOW": return "BAIXA";
    default: return null;
  }
}

// ----------------------------------------------------- transições da RNC ----

export interface TransitionOption {
  to: string;
  toLabel: string;
  requiresJustification: boolean;
  requiresEvidence: boolean;
  minRole: "REGISTER" | "MANAGE";
  roleAllowed: boolean;
  /** Bloqueios devolvidos por quality_transition_blockers (autoridade do banco) + papel. */
  blockers: string[];
  enabled: boolean;
}

/** Opções de transição a partir do estado atual. `blockersByTarget` vem da RPC quality_transition_blockers (não é recalculado aqui). */
export function buildTransitionOptions(
  entity: QualityEntityType,
  state: string,
  role: QualityRole | null,
  blockersByTarget: Readonly<Record<string, readonly string[]>>,
): TransitionOption[] {
  return allowedTransitions(entity, state).map((rule) => {
    const roleAllowed = roleSatisfies(role, rule.minRole);
    const blockers = [...(roleAllowed ? [] : ["FORBIDDEN"]), ...(blockersByTarget[rule.to] ?? [])];
    return {
      to: rule.to,
      toLabel: label(NCR_STATE_LABEL, rule.to),
      requiresJustification: rule.requiresJustification,
      requiresEvidence: rule.requiresEvidence,
      minRole: rule.minRole,
      roleAllowed,
      blockers,
      enabled: blockers.length === 0,
    };
  });
}

/** Verifica no cliente o que o banco exigirá (justificativa >= 10, evidência, RNC original). O servidor revalida tudo. */
export function validateTransitionDraft(
  opt: Pick<TransitionOption, "requiresJustification" | "requiresEvidence" | "to">,
  draft: { justification: string; evidenceCount: number; duplicateOf: string },
): string[] {
  const missing: string[] = [];
  if (opt.requiresJustification && draft.justification.trim().length < 10) missing.push("JUSTIFICATION_REQUIRED");
  if (opt.requiresEvidence && draft.evidenceCount === 0) missing.push("EVIDENCE_REQUIRED");
  if (opt.to === "DUPLICADA" && !draft.duplicateOf) missing.push("DUPLICATE_TARGET_INVALID");
  return missing;
}

/** Rótulos do botão por destino (verbos de ação). */
export const TRANSITION_VERB: Record<string, string> = {
  TRIAGEM: "Enviar para triagem",
  INVESTIGACAO: "Iniciar investigação",
  CONFIRMADA: "Confirmar NC",
  NAO_CONFIRMADA: "Marcar como não confirmada",
  PLANO_ACAO: "Ir para plano de ação",
  CORRECAO: "Ir para correção",
  VERIFICACAO: "Enviar para verificação",
  ENCERRADA: "Encerrar RNC",
  REABERTA: "Reabrir RNC",
  DUPLICADA: "Marcar como duplicada",
  CANCELADA: "Cancelar RNC",
};

// ---------------------------------------------------- evidências (rascunho) ----

export interface EvidenceDraft {
  sourceType: string;
  sourceRef: string;
  classification: string;
  epistemic: string;
}

/**
 * Regras de exibição/cadastro da evidência (a UI orienta; o banco guarda a fonte imutável):
 *  - a fonte (sourceRef) é obrigatória — toda evidência aponta para o original;
 *  - NC COMPROVADA só com tipo epistêmico FATO (inferência ou recomendação não comprovam NC);
 *  - SUSPEITA/INDÍCIO/RISCO POTENCIAL aceitam qualquer tipo epistêmico.
 */
export function validateEvidenceDraft(d: EvidenceDraft): string[] {
  const errors: string[] = [];
  if (!d.sourceRef.trim()) errors.push("Informe a referência da fonte original (e-mail, foto, diário, relatório…).");
  if (!(d.sourceType in ORIGIN_LABEL)) errors.push("Tipo de fonte inválido.");
  if (!(d.classification in CLASSIFICATION_LABEL)) errors.push("Classificação inválida.");
  if (!(d.epistemic in EPISTEMIC_LABEL)) errors.push("Tipo epistêmico inválido.");
  if (d.classification === "NC_COMPROVADA" && d.epistemic !== "FATO") {
    errors.push("NC comprovada exige tipo epistêmico FATO: inferência ou recomendação não comprovam uma não conformidade.");
  }
  return errors;
}

// -------------------------------------------------------------- KPIs ----

export interface NcrKpiRow {
  state: string;
  criticality: string;
  reopen_count: number | null;
  created_at: string;
  closed_at: string | null;
}
export interface ActionKpiRow {
  status: string;
  due_date: string | null;
  ncr_id: string | null;
}
export interface VerificationKpiRow {
  result: string;
  ncr_id: string | null;
  created_at: string;
}

export interface Kpi {
  /** null = SEM DADOS. */
  value: number | null;
  display: string;
  detail: string;
}

export interface QualityKpis {
  totalNcrs: number;
  abertas: Kpi;
  criticasAbertas: Kpi;
  semCriticidadeAbertas: Kpi;
  reaberturas: Kpi;
  tempoMedioEncerramentoDias: Kpi;
  acoesVencidas: Kpi;
  eficacia: Kpi;
  porEstado: Array<{ state: string; label: string; count: number }>;
}

const SEM_DADOS = (detail: string): Kpi => ({ value: null, display: "SEM DADOS", detail });
const num = (value: number, detail: string, suffix = ""): Kpi => ({ value, display: `${value}${suffix}`, detail });

/** Estados em que a RNC não está mais em tratamento. */
export function isNcrOpen(state: string): boolean {
  return !isTerminal("NCR", state) && !["ENCERRADA", "NAO_CONFIRMADA", "DUPLICADA", "CANCELADA"].includes(state);
}

const DAY_MS = 86_400_000;

/**
 * KPIs do dashboard de Qualidade. `today` é injetado (YYYY-MM-DD) para o cálculo de "ações vencidas" nunca depender de data fixa.
 * Regra de ausência: sem nenhuma RNC registrada, os indicadores de RNC são SEM DADOS (nunca zero); ação sem prazo não entra em "vencidas".
 */
export function computeQualityKpis(input: {
  ncrs: readonly NcrKpiRow[];
  actions: readonly ActionKpiRow[];
  verifications: readonly VerificationKpiRow[];
  today: string;
}): QualityKpis {
  const { ncrs, actions, verifications, today } = input;
  const total = ncrs.length;
  const open = ncrs.filter((n) => isNcrOpen(n.state));

  const counts = new Map<string, number>();
  for (const n of ncrs) counts.set(n.state, (counts.get(n.state) ?? 0) + 1);
  const porEstado = [...counts.entries()]
    .map(([state, count]) => ({ state, label: label(NCR_STATE_LABEL, state), count }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));

  const none = "Nenhuma RNC registrada neste projeto.";
  const abertas = total === 0 ? SEM_DADOS(none) : num(open.length, `${open.length} de ${total} RNC em tratamento`);
  const criticas = total === 0 ? SEM_DADOS(none) : num(open.filter((n) => n.criticality === "CRITICAL").length, "RNC em tratamento com criticidade Crítica (pior pilar domina)");
  const semCrit = total === 0 ? SEM_DADOS(none) : num(open.filter((n) => n.criticality === "SEM_DADOS").length, "RNC em tratamento sem consequência registrada (criticidade SEM DADOS)");
  const reab = total === 0 ? SEM_DADOS(none) : num(ncrs.reduce((s, n) => s + (n.reopen_count ?? 0), 0), `${ncrs.filter((n) => (n.reopen_count ?? 0) > 0).length} RNC com reabertura`);

  const closed = ncrs.filter((n) => n.state === "ENCERRADA" && n.closed_at);
  let tempo: Kpi = SEM_DADOS("Nenhuma RNC encerrada com data de encerramento.");
  if (closed.length > 0) {
    const days = closed.map((n) => (Date.parse(n.closed_at as string) - Date.parse(n.created_at)) / DAY_MS).filter((d) => Number.isFinite(d) && d >= 0);
    if (days.length > 0) {
      const avg = days.reduce((s, d) => s + d, 0) / days.length;
      tempo = { value: Math.round(avg * 10) / 10, display: `${(Math.round(avg * 10) / 10).toLocaleString("pt-BR")} dias`, detail: `Média sobre ${days.length} RNC encerrada(s)` };
    }
  }

  const withDue = actions.filter((a) => a.due_date);
  const venc = actions.length === 0
    ? SEM_DADOS("Nenhuma ação (CAPA) registrada.")
    : withDue.length === 0
      ? SEM_DADOS("Nenhuma ação possui prazo informado; vencimento não calculável.")
      : num(withDue.filter((a) => (a.status === "PLANEJADA" || a.status === "EM_ANDAMENTO") && (a.due_date as string) < today).length, `${withDue.length} ação(ões) com prazo; ${actions.length - withDue.length} sem prazo (não avaliadas)`);

  // Eficácia: última verificação de cada RNC (as verificações são append-only; a mais recente vale).
  const latestByNcr = new Map<string, VerificationKpiRow>();
  for (const v of verifications) {
    if (!v.ncr_id) continue;
    const cur = latestByNcr.get(v.ncr_id);
    if (!cur || v.created_at >= cur.created_at) latestByNcr.set(v.ncr_id, v);
  }
  const latest = [...latestByNcr.values()];
  const eficacia = latest.length === 0
    ? SEM_DADOS("Nenhuma verificação de eficácia registrada.")
    : (() => {
        const ok = latest.filter((v) => v.result === "EFICAZ").length;
        const pct = Math.round((1000 * ok) / latest.length) / 10;
        return { value: pct, display: `${pct.toLocaleString("pt-BR")}%`, detail: `${ok} de ${latest.length} RNC com última verificação EFICAZ` } satisfies Kpi;
      })();

  return { totalNcrs: total, abertas, criticasAbertas: criticas, semCriticidadeAbertas: semCrit, reaberturas: reab, tempoMedioEncerramentoDias: tempo, acoesVencidas: venc, eficacia, porEstado };
}

// --------------------------------------------- custos de não qualidade ----

export interface CostRow {
  category: string;
  estimated_amount: number | string | null;
  actual_amount: number | string | null;
  currency: string;
  source_ref: string | null;
}
export interface CostTotals {
  /** soma dos valores REAIS informados (com fonte); null = SEM DADOS. Estimado e real NUNCA são somados entre si. */
  actual: number | null;
  estimated: number | null;
  rowsWithValue: number;
  rowsWithoutValue: number;
  currency: string | null;
  mixedCurrency: boolean;
}

export function sumCosts(rows: readonly CostRow[]): CostTotals {
  const withSource = rows.filter((r) => r.source_ref && r.source_ref.trim());
  const toNum = (v: number | string | null): number | null => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const act = withSource.map((r) => toNum(r.actual_amount)).filter((v): v is number => v !== null);
  const est = withSource.map((r) => toNum(r.estimated_amount)).filter((v): v is number => v !== null);
  const currencies = new Set(withSource.filter((r) => toNum(r.actual_amount) !== null || toNum(r.estimated_amount) !== null).map((r) => r.currency));
  const mixed = currencies.size > 1;
  const sum = (arr: number[]) => (arr.length === 0 || mixed ? null : Math.round(arr.reduce((s, v) => s + v, 0) * 100) / 100);
  return {
    actual: sum(act),
    estimated: sum(est),
    rowsWithValue: withSource.filter((r) => toNum(r.actual_amount) !== null || toNum(r.estimated_amount) !== null).length,
    rowsWithoutValue: rows.length - withSource.filter((r) => toNum(r.actual_amount) !== null || toNum(r.estimated_amount) !== null).length,
    currency: currencies.size === 1 ? [...currencies][0] : null,
    mixedCurrency: mixed,
  };
}

export function formatMoney(value: number | string | null | undefined, currency = "BRL"): string {
  if (value === null || value === undefined || value === "") return "SEM DADOS";
  const n = Number(value);
  if (!Number.isFinite(n)) return "SEM DADOS";
  return n.toLocaleString("pt-BR", { style: "currency", currency });
}

// --------------------------------------------------------- linha do tempo ----

export interface TimelineItem {
  at: string;
  kind: "STATE" | "AUDIT";
  title: string;
  detail: string | null;
  actor: string | null;
  /** seq do evento de estado (quando kind = STATE). */
  seq?: number;
}

export interface StateEventRow {
  seq: number | string;
  from_state: string | null;
  to_state: string;
  actor_user_id: string | null;
  justification: string | null;
  evidence_ids: string[] | null;
  occurred_at: string;
}
export interface AuditRow {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  detail: string | null;
}

const AUDIT_ACTION_LABEL: Array<[RegExp, string]> = [
  [/QUALITY_NCR_TRANSITION/, "Transição de estado registrada"],
  [/QUALITY_NCR_DEDUPED/, "Origem já tinha RNC ativa (nenhuma RNC duplicada foi criada)"],
  [/_INSERT$/, "Registro criado"],
  [/_UPDATE$/, "Registro alterado"],
];

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL.find(([re]) => re.test(action))?.[1] ?? action;
}

/** Une eventos de estado e auditoria numa única linha do tempo cronológica (mais recente primeiro). */
export function buildTimeline(events: readonly StateEventRow[], audits: readonly AuditRow[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...events.map((e): TimelineItem => ({
      at: e.occurred_at,
      kind: "STATE",
      seq: Number(e.seq),
      title: e.from_state ? `${label(NCR_STATE_LABEL, e.from_state)} → ${label(NCR_STATE_LABEL, e.to_state)}` : `Registrada como ${label(NCR_STATE_LABEL, e.to_state)}`,
      detail: e.justification,
      actor: e.actor_user_id,
    })),
    ...audits.map((a): TimelineItem => ({
      at: a.occurred_at,
      kind: "AUDIT",
      title: auditActionLabel(a.action),
      detail: null,
      actor: a.actor_type === "SYSTEM" ? "Sistema" : a.actor_user_id,
    })),
  ];
  return items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : (b.seq ?? 0) - (a.seq ?? 0)));
}

// ------------------------------------------------------------- abas ----

export const QUALITY_TABS = [
  { key: "dashboard", label: "Dashboard", helpId: "qualidade.abas.dashboard" },
  { key: "rnc", label: "RNC", helpId: "qualidade.abas.rnc" },
  { key: "evidencias", label: "Evidências", helpId: "qualidade.abas.evidencias" },
  { key: "inspecoes", label: "Inspeções", helpId: "qualidade.abas.inspecoes" },
  { key: "reclamacoes", label: "Reclamações", helpId: "qualidade.abas.reclamacoes" },
  { key: "ensaios", label: "Ensaios e laudos", helpId: "qualidade.abas.ensaios" },
  { key: "requisitos", label: "Requisitos", helpId: "qualidade.abas.requisitos" },
  { key: "capa", label: "Ações (CAPA)", helpId: "qualidade.abas.capa" },
  { key: "eficacia", label: "Eficácia", helpId: "qualidade.abas.eficacia" },
  { key: "recorrencias", label: "Recorrências", helpId: "qualidade.abas.recorrencias" },
  { key: "custos", label: "Custos de não qualidade", helpId: "qualidade.abas.custos" },
  { key: "auditoria", label: "Auditoria", helpId: "qualidade.abas.auditoria" },
] as const;
export type QualityTabKey = (typeof QUALITY_TABS)[number]["key"];

export function parseTab(value: string | undefined): QualityTabKey {
  return QUALITY_TABS.find((t) => t.key === value)?.key ?? "dashboard";
}

/** Catálogo de transições do módulo (espelho do banco) — exposto para testes de paridade da UI. */
export const NCR_TRANSITION_TARGETS: ReadonlySet<string> = new Set(TRANSITIONS.filter((t) => t.entity === "NCR").map((t) => t.to));
