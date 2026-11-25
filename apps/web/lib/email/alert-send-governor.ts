// Puro, sem I/O — deliberadamente sem "server-only" (testável por script Node e importável pelo ciclo de alertas).
//
// GOVERNADOR DE ENVIO DE ALERTAS (decisão D8 da Diretoria; doc 35).
//
// O que faz: um ÚNICO ponto de estrangulamento (GovernedEmailProvider, ver governed-email-provider.ts) decide, ANTES de qualquer
// transporte, se uma mensagem automática pode sair, a partir de: kill switch global; habilitação progressiva por PROJETO, FONTE e TIPO;
// limite por hora e por dia (contados de forma PERSISTENTE em audit_log_entries, sem migration nova); deduplicação por chave estável.
// Tamanho de lote por execução: capBatchSize / chunkIntoBatches (usados pelo ciclo de risco).
//
// O que NUNCA faz: não altera destinatário, Cc, assunto, corpo; não lê nem afrouxa a trava de saída do piloto
// (pilot-outbound-guard.ts) — ele só RESTRINGE. A decisão "permitido" apenas deixa a mensagem seguir para o provedor, que continua
// aplicando integralmente a trava do piloto e o perfil do projeto.
//
// Configuração (variáveis de ambiente, validada com FALHA FECHADA: valor inválido bloqueia tudo e é auditado):
//   ACC_ALERT_KILL_SWITCH         "true" bloqueia TODO envio automático; ausente/"false" não bloqueia; qualquer outro valor = inválido.
//   ACC_ALERT_MAX_PER_HOUR        inteiro >= 0 (janela móvel de 60 min). Ausente = sem limite (comportamento atual).
//   ACC_ALERT_MAX_PER_DAY         inteiro >= 0 (janela móvel de 24 h). Ausente = sem limite (comportamento atual).
//   ACC_ALERT_BATCH_SIZE          inteiro >= 1: máximo de envios por execução do ciclo de risco. Ausente = sem limite.
//   ACC_ALERT_ENABLED_PROJECTS    lista de UUIDs separados por vírgula. Ausente = todos os projetos (a trava do piloto continua valendo).
//   ACC_ALERT_ENABLED_SOURCES     lista de FONTES (ALERT_SOURCES). Ausente = fontes legadas (todas, exceto as reservadas CRONOGRAMA e DIARIO).
//   ACC_ALERT_ENABLED_TYPES       lista de TIPOS (ALERT_TYPE_CATALOG). Ausente = todos os tipos das fontes habilitadas.
// Com ACC_OUTBOUND_MODE=production o governador exige allowlist de projetos E ao menos um limite (hora ou dia): sem isso, bloqueia.

import { createHash } from "node:crypto";

export const ALERT_SOURCES = [
  "RISCO",
  "RELATORIO_SEMANAL",
  "CONTRATO",
  "SLA",
  "ACOES",
  "SSMA",
  "SISTEMA",
  "CONSTRUMANAGER",
  "AUTORIZACAO",
  "EMAIL",
  "ENTREGAVEIS",
  "CRONOGRAMA",
  "DIARIO",
] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];

/** Fontes RESERVADAS: ainda não têm emissor no código; ficam bloqueadas por padrão e só abrem por habilitação explícita. */
export const RESERVED_ALERT_SOURCES: readonly AlertSource[] = ["CRONOGRAMA", "DIARIO"];
/** Fontes habilitadas quando ACC_ALERT_ENABLED_SOURCES está ausente (= emissores que JÁ enviam hoje). */
export const LEGACY_DEFAULT_SOURCES: readonly AlertSource[] = ALERT_SOURCES.filter((s) => !RESERVED_ALERT_SOURCES.includes(s));

/** Tipo de alerta -> fonte. A fonte de uma mensagem é SEMPRE derivada do tipo (nunca informada à parte). */
export const ALERT_TYPE_CATALOG = {
  RISK_IMMEDIATE: "RISCO",
  RISK_ESCALATION: "RISCO",
  RISK_DIGEST: "RISCO",
  RISK_FORWARD: "RISCO",
  RISK_RETURNED: "RISCO",
  RISK_EXPERT_ANSWER: "RISCO",
  RISK_ACTION_CONFIRMATION: "RISCO",
  RISK_PILOT_SINGLE: "RISCO",
  WEEKLY_DIGEST: "RELATORIO_SEMANAL",
  CONTRACT_ALERT: "CONTRATO",
  CONTRACT_ALERT_BATCH: "CONTRATO",
  SLA_ESCALATION: "SLA",
  ACTION_REQUEST: "ACOES",
  SSMA_ACCIDENT: "SSMA",
  SSMA_FIELD_NOTIFICATION: "SSMA",
  SYSTEM_HEALTH: "SISTEMA",
  VERSION_IMPACT_REVIEW: "CONSTRUMANAGER",
  EMAIL_AUTHORIZATION: "AUTORIZACAO",
  EMAIL_REPLY_CONFIRMATION: "EMAIL",
  EMAIL_SPECIALIST: "EMAIL",
  DELIVERY_ITEM_REMINDER: "ENTREGAVEIS",
  SCHEDULE_ALERT: "CRONOGRAMA",
  DAILY_LOG_ALERT: "DIARIO",
} as const satisfies Record<string, AlertSource>;
export type AlertType = keyof typeof ALERT_TYPE_CATALOG;

const RISK_NOTIFICATION_TYPES: Readonly<Record<string, AlertType>> = {
  IMMEDIATE: "RISK_IMMEDIATE",
  ESCALATION: "RISK_ESCALATION",
  DIGEST: "RISK_DIGEST",
  FORWARD: "RISK_FORWARD",
  RETURNED: "RISK_RETURNED",
  EXPERT_ANSWER: "RISK_EXPERT_ANSWER",
  ACTION_CONFIRMATION: "RISK_ACTION_CONFIRMATION",
};

/** Tipo de governança de uma linha da risk_alert_outbox (notification_type). Desconhecido => null (o governador bloqueia). */
export function riskAlertGovernanceType(notificationType: string, pilotSingle = false): AlertType | null {
  if (pilotSingle) return "RISK_PILOT_SINGLE";
  return RISK_NOTIFICATION_TYPES[notificationType] ?? null;
}

/** Contexto de governança que cada emissor informa em SendEmailInput.governance. */
export interface AlertGovernanceContext {
  /** Tipo do alerta (ALERT_TYPE_CATALOG) ou null quando o emissor não soube classificar (bloqueado). */
  type: AlertType | null;
  projectId: string | null;
  /** Chave estável do evento (ex.: idempotency_key da outbox). Com ela, o mesmo evento nunca é admitido duas vezes na janela. */
  dedupKey?: string | null;
  /** CRITICAL: alerta crítico. Nunca é descartado pelo limite (fica na fila, adiado) e pode usar a reserva de cota. */
  priority?: "CRITICAL" | null;
}

export type GovernorEnv = Readonly<Record<string, string | undefined>>;

export interface GovernorConfig {
  killSwitch: boolean;
  maxPerHour: number | null;
  maxPerDay: number | null;
  /** Reserva de cota (por hora / por dia) que SÓ alertas críticos podem usar. Padrão 0 (sem reserva). */
  criticalReservePerHour: number;
  criticalReservePerDay: number;
  batchSize: number | null;
  /** null = todos os projetos. */
  enabledProjects: ReadonlySet<string> | null;
  enabledSources: ReadonlySet<AlertSource>;
  /** null = todos os tipos das fontes habilitadas. */
  enabledTypes: ReadonlySet<AlertType> | null;
  outboundProduction: boolean;
  /** Mensagens de configuração inválida (nunca incluem valores sensíveis). Não vazio => tudo bloqueado. */
  invalid: readonly string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseInt0(raw: string | undefined, name: string, min: number, invalid: string[]): number | null {
  if (raw === undefined) return null;
  const v = raw.trim();
  if (!/^\d{1,9}$/.test(v)) {
    invalid.push(`${name} deve ser inteiro >= ${min}`);
    return null;
  }
  const n = Number(v);
  if (n < min) {
    invalid.push(`${name} deve ser inteiro >= ${min}`);
    return null;
  }
  return n;
}

function parseList(raw: string | undefined, name: string, invalid: string[]): string[] | null {
  if (raw === undefined) return null;
  const items = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (items.length === 0 || raw.split(",").some((s) => s.trim().length === 0)) {
    invalid.push(`${name} está vazio ou tem item vazio`);
    return null;
  }
  return items;
}

/** Lê e valida a configuração. NUNCA lança: valor inválido vira `invalid` (o governador bloqueia tudo e audita). */
export function parseGovernorConfig(env: GovernorEnv): GovernorConfig {
  const invalid: string[] = [];

  let killSwitch = false;
  const ks = env.ACC_ALERT_KILL_SWITCH;
  if (ks !== undefined) {
    if (ks === "true") killSwitch = true;
    else if (ks !== "false") invalid.push("ACC_ALERT_KILL_SWITCH deve ser exatamente true ou false");
  }

  const maxPerHour = parseInt0(env.ACC_ALERT_MAX_PER_HOUR, "ACC_ALERT_MAX_PER_HOUR", 0, invalid);
  const maxPerDay = parseInt0(env.ACC_ALERT_MAX_PER_DAY, "ACC_ALERT_MAX_PER_DAY", 0, invalid);
  const criticalReservePerHour = parseInt0(env.ACC_ALERT_CRITICAL_RESERVE_PER_HOUR, "ACC_ALERT_CRITICAL_RESERVE_PER_HOUR", 0, invalid) ?? 0;
  const criticalReservePerDay = parseInt0(env.ACC_ALERT_CRITICAL_RESERVE_PER_DAY, "ACC_ALERT_CRITICAL_RESERVE_PER_DAY", 0, invalid) ?? 0;
  const batchSize = parseInt0(env.ACC_ALERT_BATCH_SIZE, "ACC_ALERT_BATCH_SIZE", 1, invalid);

  let enabledProjects: Set<string> | null = null;
  const projects = parseList(env.ACC_ALERT_ENABLED_PROJECTS, "ACC_ALERT_ENABLED_PROJECTS", invalid);
  if (projects) {
    enabledProjects = new Set();
    for (const p of projects) {
      if (!UUID_RE.test(p)) invalid.push("ACC_ALERT_ENABLED_PROJECTS tem um item que não é UUID");
      else enabledProjects.add(p.toLowerCase());
    }
  }

  let enabledSources = new Set<AlertSource>(LEGACY_DEFAULT_SOURCES);
  const sources = parseList(env.ACC_ALERT_ENABLED_SOURCES, "ACC_ALERT_ENABLED_SOURCES", invalid);
  if (sources) {
    enabledSources = new Set();
    for (const s of sources) {
      if (!(ALERT_SOURCES as readonly string[]).includes(s)) invalid.push("ACC_ALERT_ENABLED_SOURCES tem fonte desconhecida");
      else enabledSources.add(s as AlertSource);
    }
  }

  let enabledTypes: Set<AlertType> | null = null;
  const types = parseList(env.ACC_ALERT_ENABLED_TYPES, "ACC_ALERT_ENABLED_TYPES", invalid);
  if (types) {
    enabledTypes = new Set();
    for (const t of types) {
      if (!Object.prototype.hasOwnProperty.call(ALERT_TYPE_CATALOG, t)) invalid.push("ACC_ALERT_ENABLED_TYPES tem tipo desconhecido");
      else enabledTypes.add(t as AlertType);
    }
  }

  // Mesma regra da trava do piloto: SÓ o valor exato "production" é modo de produção (qualquer outro valor = piloto).
  const outboundProduction = env.ACC_OUTBOUND_MODE === "production";

  return { killSwitch, maxPerHour, maxPerDay, criticalReservePerHour, criticalReservePerDay, batchSize, enabledProjects, enabledSources, enabledTypes, outboundProduction, invalid };
}

export type GovernorSuppressionReason =
  | "INVALID_CONFIG"
  | "KILL_SWITCH"
  | "NO_GOVERNANCE_CONTEXT"
  | "TYPE_UNKNOWN"
  | "SOURCE_NOT_ENABLED"
  | "TYPE_NOT_ENABLED"
  | "PROJECT_NOT_ENABLED"
  | "PRODUCTION_REQUIRES_ALLOWLIST_AND_LIMIT"
  | "NO_PROJECT_CONTEXT"
  | "LEDGER_UNAVAILABLE"
  | "DUPLICATE"
  | "HOURLY_LIMIT"
  | "DAILY_LIMIT";

export type StaticDecision = { allow: true; source: AlertSource; type: AlertType } | { allow: false; reason: GovernorSuppressionReason; detail: string };

/** Limite efetivo: alerta crítico usa o limite cheio; os demais deixam a reserva livre para os críticos. */
export function effectiveLimit(limit: number, reserve: number, ctx: AlertGovernanceContext | undefined | null): number {
  return ctx?.priority === "CRITICAL" ? limit : Math.max(0, limit - reserve);
}

/** True quando a decisão exige consultar o ledger persistente (limite/deduplicação). Sem limites, o caminho padrão não toca no banco. */
export function ledgerRequired(config: GovernorConfig): boolean {
  return config.maxPerHour !== null || config.maxPerDay !== null;
}

/** Decisão estática (sem I/O). Ordem fixa; a primeira regra que bloqueia vence. */
export function evaluateStaticPolicy(config: GovernorConfig, ctx: AlertGovernanceContext | undefined | null): StaticDecision {
  if (config.invalid.length > 0) return { allow: false, reason: "INVALID_CONFIG", detail: config.invalid.join("; ") };
  if (config.killSwitch) return { allow: false, reason: "KILL_SWITCH", detail: "ACC_ALERT_KILL_SWITCH=true" };
  if (!ctx) return { allow: false, reason: "NO_GOVERNANCE_CONTEXT", detail: "emissor sem classificação de governança" };
  if (!ctx.type || !Object.prototype.hasOwnProperty.call(ALERT_TYPE_CATALOG, ctx.type)) return { allow: false, reason: "TYPE_UNKNOWN", detail: "tipo de alerta desconhecido" };
  const source = ALERT_TYPE_CATALOG[ctx.type];
  if (!config.enabledSources.has(source)) return { allow: false, reason: "SOURCE_NOT_ENABLED", detail: `fonte ${source} não habilitada` };
  if (config.enabledTypes && !config.enabledTypes.has(ctx.type)) return { allow: false, reason: "TYPE_NOT_ENABLED", detail: `tipo ${ctx.type} não habilitado` };
  if (config.enabledProjects) {
    const pid = ctx.projectId?.toLowerCase() ?? null;
    if (!pid || !config.enabledProjects.has(pid)) return { allow: false, reason: "PROJECT_NOT_ENABLED", detail: "projeto não habilitado" };
  }
  if (config.outboundProduction && (config.enabledProjects === null || !ledgerRequired(config))) {
    return { allow: false, reason: "PRODUCTION_REQUIRES_ALLOWLIST_AND_LIMIT", detail: "ACC_OUTBOUND_MODE=production exige ACC_ALERT_ENABLED_PROJECTS e limite por hora/dia" };
  }
  return { allow: true, source, type: ctx.type };
}

// ---------------------------------------------------------------- ledger (porta) e admissão

export const GOVERNOR_ACTIONS = {
  ADMITTED: "ALERT_GOVERNOR_ADMITTED",
  RELEASED: "ALERT_GOVERNOR_RELEASED",
  SUPPRESSED: "ALERT_GOVERNOR_SUPPRESSED",
  /** Adiado: a mensagem NÃO foi enviada nem descartada; continua na fila (PENDING) sem gastar tentativa. */
  DEFERRED: "ALERT_GOVERNOR_DEFERRED",
} as const;
export type GovernorAction = (typeof GOVERNOR_ACTIONS)[keyof typeof GOVERNOR_ACTIONS];

export interface GovernorLedgerEntry {
  action: GovernorAction;
  projectId: string;
  /** ADMITTED/RELEASED: id da admissão (`<hash da dedupKey>.<uuid>`). SUPPRESSED: id próprio. */
  entityId: string;
  detail: Record<string, unknown>;
}

/** Porta de persistência (implementada sobre audit_log_entries; em memória nos testes). Nunca apaga nada (append-only). */
export interface GovernorLedger {
  /**
   * Posição (1 = primeira) da admissão `entityId` entre as admissões LÍQUIDAS (ADMITTED sem RELEASED) desde `sinceIso`, ordenadas por
   * (occurred_at, entity_id). Desempate determinístico: com várias execuções simultâneas no limite, as `limite` primeiras vencem e as demais
   * recuam (nunca todas recuam). Admissão não encontrada ou janela grande demais => Number.MAX_SAFE_INTEGER (fail-closed).
   */
  rankOfNetAdmission(sinceIso: string, entityId: string): Promise<number>;
  /** Existe admissão líquida (não liberada) com esta chave de deduplicação desde `sinceIso`? */
  hasNetAdmissionForKey(keyHash: string, sinceIso: string): Promise<boolean>;
  /** Admissões líquidas na janela (usado só pelo portão de capacidade, sem gravar nada). */
  countNetAdmissions(sinceIso: string): Promise<number>;
  record(entry: GovernorLedgerEntry): Promise<void>;
}

export const HOUR_MS = 3600e3;
export const DAY_MS = 24 * HOUR_MS;

export function hashDedupKey(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export interface Admission {
  allow: true;
  source: AlertSource;
  type: AlertType;
  /** null quando o ledger não foi usado (sem limites configurados). */
  admissionId: string | null;
  projectId: string | null;
}
export interface Suppression {
  allow: false;
  reason: GovernorSuppressionReason;
  detail: string;
  type: AlertType | null;
  projectId: string | null;
}
export type AdmissionResult = Admission | Suppression;

export interface AdmitInput {
  config: GovernorConfig;
  ctx: AlertGovernanceContext | undefined | null;
  ledger: (() => GovernorLedger) | GovernorLedger | null;
  now: Date;
  newId: () => string;
}

async function auditSuppression(input: AdmitInput, s: Suppression): Promise<void> {
  // Auditoria é obrigatória quando há projeto e ledger; falha de auditoria nunca libera o envio (já está suprimido).
  if (!s.projectId || !input.ledger) return;
  try {
    const ledger = typeof input.ledger === "function" ? input.ledger() : input.ledger;
    await ledger.record({
      action: GOVERNOR_ACTIONS.SUPPRESSED,
      projectId: s.projectId,
      entityId: input.newId(),
      detail: { reason: s.reason, detail: s.detail, type: s.type, source: s.type ? ALERT_TYPE_CATALOG[s.type] : null, at: input.now.toISOString() },
    });
  } catch {
    // sem ledger/banco: a supressão continua valendo; a evidência fica no erro devolvido ao emissor.
  }
}

/** Decide e (quando há limites) registra a admissão de forma persistente. FALHA FECHADA em qualquer erro do ledger. */
export async function admitAlertSend(input: AdmitInput): Promise<AdmissionResult> {
  const { config, ctx, now } = input;
  const projectId = ctx?.projectId ?? null;
  const base = evaluateStaticPolicy(config, ctx);
  if (!base.allow) {
    const s: Suppression = { allow: false, reason: base.reason, detail: base.detail, type: ctx?.type ?? null, projectId };
    await auditSuppression(input, s);
    return s;
  }
  const suppress = async (reason: GovernorSuppressionReason, detail: string): Promise<Suppression> => {
    const s: Suppression = { allow: false, reason, detail, type: base.type, projectId };
    await auditSuppression(input, s);
    return s;
  };

  if (!ledgerRequired(config)) {
    return { allow: true, source: base.source, type: base.type, admissionId: null, projectId };
  }
  if (!projectId) return suppress("NO_PROJECT_CONTEXT", "limite ativo, mas o envio não informa o projeto");
  if (!input.ledger) return suppress("LEDGER_UNAVAILABLE", "ledger indisponível com limite ativo");

  try {
    const ledger = typeof input.ledger === "function" ? input.ledger() : input.ledger;
    const keyHash = hashDedupKey(ctx?.dedupKey ?? `__nokey__:${input.newId()}`);
    if (ctx?.dedupKey && (await ledger.hasNetAdmissionForKey(keyHash, new Date(now.getTime() - DAY_MS).toISOString()))) {
      return await suppress("DUPLICATE", "evento já admitido na janela de 24 h (proteção contra reenvio)");
    }
    const admissionId = `${keyHash}.${input.newId()}`;
    // Inserir PRIMEIRO e ranquear DEPOIS: instâncias simultâneas se enxergam e só as primeiras `limite` (ordem determinística) seguem.
    await ledger.record({
      action: GOVERNOR_ACTIONS.ADMITTED,
      projectId,
      entityId: admissionId,
      detail: { type: base.type, source: base.source, at: now.toISOString() },
    });
    const releaseAndSuppress = async (reason: "HOURLY_LIMIT" | "DAILY_LIMIT", detail: string): Promise<Suppression> => {
      await ledger.record({ action: GOVERNOR_ACTIONS.RELEASED, projectId, entityId: admissionId, detail: { reason, at: now.toISOString() } });
      return suppress(reason, detail);
    };
    if (config.maxPerHour !== null) {
      const n = await ledger.rankOfNetAdmission(new Date(now.getTime() - HOUR_MS).toISOString(), admissionId);
      if (n > effectiveLimit(config.maxPerHour, config.criticalReservePerHour, ctx)) return await releaseAndSuppress("HOURLY_LIMIT", `limite de ${config.maxPerHour} envio(s) na última hora atingido`);
    }
    if (config.maxPerDay !== null) {
      const n = await ledger.rankOfNetAdmission(new Date(now.getTime() - DAY_MS).toISOString(), admissionId);
      if (n > effectiveLimit(config.maxPerDay, config.criticalReservePerDay, ctx)) return await releaseAndSuppress("DAILY_LIMIT", `limite de ${config.maxPerDay} envio(s) nas últimas 24 h atingido`);
    }
    return { allow: true, source: base.source, type: base.type, admissionId, projectId };
  } catch {
    return suppress("LEDGER_UNAVAILABLE", "falha ao consultar/gravar o ledger persistente (fail-closed)");
  }
}

/** Devolve a admissão (a mensagem COM CERTEZA não saiu): libera a cota e permite nova tentativa do mesmo evento. */
export async function releaseAdmission(ledger: GovernorLedger | null, admission: Admission, now: Date, reason: string): Promise<void> {
  if (!ledger || !admission.admissionId || !admission.projectId) return;
  try {
    await ledger.record({ action: GOVERNOR_ACTIONS.RELEASED, projectId: admission.projectId, entityId: admission.admissionId, detail: { reason, at: now.toISOString() } });
  } catch {
    // Sem liberar, a cota fica consumida: errar para o lado de enviar MENOS.
  }
}

// ---------------------------------------------------------------- lotes

/** Limita o tamanho pedido ao ACC_ALERT_BATCH_SIZE (null = sem limite). Nunca aumenta o pedido. */
export function capBatchSize(requested: number, config: Pick<GovernorConfig, "batchSize">): number {
  return config.batchSize === null ? requested : Math.min(requested, config.batchSize);
}

/** Divide `items` em lotes de no máximo `size` (size inválido => um item por lote, o mais conservador). */
export function chunkIntoBatches<T>(items: readonly T[], size: number | null): T[][] {
  if (size === null) return items.length === 0 ? [] : [items.slice()];
  const n = Number.isInteger(size) && size >= 1 ? size : 1;
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

// ---------------------------------------------------------------- portão de capacidade (ANTES da reivindicação/claim)

export type CapacityResult = { allowed: true } | { allowed: false; reason: GovernorSuppressionReason; detail: string };

/**
 * Consulta SEM gravar admissão: há capacidade para mais um envio deste tipo agora? Usado pelos fluxos com outbox/claim ANTES de
 * reivindicar a linha, para que a mensagem ADIADA (limite por hora/dia, kill switch, projeto/fonte/tipo não habilitado) continue
 * PENDING, sem tentativa gasta e sem ir a FAILED. É só um pré-filtro: a decisão final continua em admitAlertSend (no envio).
 */
export async function peekAlertCapacity(input: AdmitInput): Promise<CapacityResult> {
  const { config, ctx, now } = input;
  const base = evaluateStaticPolicy(config, ctx);
  if (!base.allow) return { allowed: false, reason: base.reason, detail: base.detail };
  if (!ledgerRequired(config)) return { allowed: true };
  if (!ctx?.projectId) return { allowed: false, reason: "NO_PROJECT_CONTEXT", detail: "limite ativo, mas o envio não informa o projeto" };
  if (!input.ledger) return { allowed: false, reason: "LEDGER_UNAVAILABLE", detail: "ledger indisponível com limite ativo" };
  try {
    const ledger = typeof input.ledger === "function" ? input.ledger() : input.ledger;
    if (config.maxPerHour !== null) {
      const n = await ledger.countNetAdmissions(new Date(now.getTime() - HOUR_MS).toISOString());
      if (n >= effectiveLimit(config.maxPerHour, config.criticalReservePerHour, ctx)) return { allowed: false, reason: "HOURLY_LIMIT", detail: "limite por hora atingido" };
    }
    if (config.maxPerDay !== null) {
      const n = await ledger.countNetAdmissions(new Date(now.getTime() - DAY_MS).toISOString());
      if (n >= effectiveLimit(config.maxPerDay, config.criticalReservePerDay, ctx)) return { allowed: false, reason: "DAILY_LIMIT", detail: "limite diário atingido" };
    }
    return { allowed: true };
  } catch {
    return { allowed: false, reason: "LEDGER_UNAVAILABLE", detail: "falha ao consultar o ledger (fail-closed)" };
  }
}
