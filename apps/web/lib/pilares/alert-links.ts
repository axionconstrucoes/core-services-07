// LIGAÇÃO ALERTA -> RNC / GARANTIA / SINISTRO (camada de APLICAÇÃO; nenhuma alteração em record_risk_alert_action nem nos SLAs).
// Puro: sem I/O.
//
// FASE 3/D — VÍNCULO ESTRUTURADO: a tabela `acc_alert_links` (FK composta por projeto, histórico append-only; RPCs acc_alert_link_create /
// acc_alert_link_unlink) é a FONTE PRIMÁRIA do vínculo. A CONVENÇÃO TEXTUAL abaixo continua valendo como FALLBACK para dados antigos ainda não
// migrados: um vínculo estruturado ATIVO sempre aparece; um vínculo estruturado DESFEITO por humano EXCLUI a ligação por convenção (a decisão
// humana prevalece sobre o texto); sem nenhum dos dois, vale a convenção. Veja combineLinkedEntities.
//
// CONVENÇÃO DE VÍNCULO (legado): uma RNC, garantia ou sinistro está vinculado a um caso de alerta quando a referência de origem registrada
// (origin_ref da RNC/garantia, source_ref de evidência ou de sinistro) contém o id do caso (UUID) ou o código visível do alerta
// (ex.: "ALERTA:<caseId>" ou a URL /<projeto>/alertas/<caseId>). Sem referência, sem vínculo: a UI nunca presume ligação.
//
// REGRA (CLAUDE.md 11/12): RESOLVIDO do alerta é decisão de comunicação/SLA e NUNCA encerra a RNC/garantia/sinistro vinculada;
// o encerramento exige a transição própria (quality_*_transition / insurance_claim_advance) com verificação de eficácia/estágio.

import { isNcrOpen, isWarrantyOpen } from "./model";

export type LinkedEntityType = "NCR" | "WARRANTY" | "CLAIM";

export interface AlertRef {
  caseId: string;
  /** Código visível do alerta (pode ser vazio). */
  visibleCode: string;
}

export interface LinkedEntityRow {
  type: LinkedEntityType;
  id: string;
  code: string | null;
  title: string;
  state: string;
  /** Referências de origem da própria entidade e das evidências ligadas a ela. */
  refs: Array<string | null | undefined>;
  /** Prazo de CONCLUSÃO do reparo/tratamento da entidade (due_date) — distinto do prazo de ASSUNÇÃO do alerta. */
  dueDate: string | null;
}

/** Código visível só entra na busca/comparação quando é específico o bastante para não gerar falso vínculo. */
export function isSearchableVisibleCode(code: string | null | undefined): code is string {
  return typeof code === "string" && /^[A-Za-z0-9._-]{5,40}$/.test(code);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** true se alguma referência cita o caso (UUID) ou o código visível, respeitando fronteira de token. */
export function referencesAlert(refs: ReadonlyArray<string | null | undefined>, alert: AlertRef): boolean {
  const id = alert.caseId.trim().toLowerCase();
  const code = isSearchableVisibleCode(alert.visibleCode) ? alert.visibleCode.trim() : null;
  for (const raw of refs) {
    if (!raw) continue;
    const ref = raw.toLowerCase();
    if (id && ref.includes(id)) return true;
    if (code && new RegExp(`(^|[^a-z0-9])${escapeRegex(code.toLowerCase())}($|[^a-z0-9])`).test(ref)) return true;
  }
  return false;
}

const CLAIM_CLOSED = "ENCERRADO";

// ---------------------------------------------------------------- vínculo estruturado (tabela acc_alert_links)
export type StructuredEntityType = "RNC" | "GARANTIA" | "SINISTRO";
export type LinkOrigin = "ESTRUTURADO" | "CONVENCAO";

export interface StructuredLink {
  entityType: StructuredEntityType;
  entityId: string;
  /** false = desvinculado por uma pessoa (com motivo); exclui a ligação por convenção textual. */
  active: boolean;
  /** MANUAL (pessoa) ou BACKFILL_CONVENTION (migração conservadora da convenção textual). */
  linkSource: string;
}

export const STRUCTURED_TO_ENTITY: Record<StructuredEntityType, LinkedEntityType> = { RNC: "NCR", GARANTIA: "WARRANTY", SINISTRO: "CLAIM" };

export function isStructuredEntityType(v: unknown): v is StructuredEntityType {
  return v === "RNC" || v === "GARANTIA" || v === "SINISTRO";
}

const linkKey = (type: LinkedEntityType, id: string): string => `${type}:${id.toLowerCase()}`;

export type LinkedEntityWithOrigin = LinkedEntityRow & { origin: LinkOrigin };

/**
 * Une o vínculo ESTRUTURADO (já resolvido em linhas de entidade) com o vínculo por CONVENÇÃO TEXTUAL (fallback).
 *  - ativo estruturado => aparece (origem ESTRUTURADO), sem precisar de texto;
 *  - desvinculado estruturado => NÃO aparece pela convenção (decisão humana prevalece);
 *  - sem linha estruturada => vale a convenção (origem CONVENCAO), como antes;
 *  - só entidades ABERTAS são retornadas; sem duplicidade (tipo + id).
 */
export function combineLinkedEntities(
  links: readonly StructuredLink[],
  structuredRows: readonly LinkedEntityRow[],
  conventionRows: readonly LinkedEntityRow[],
  alert: AlertRef,
): LinkedEntityWithOrigin[] {
  const active = new Set<string>();
  const undone = new Set<string>();
  for (const l of links) (l.active ? active : undone).add(linkKey(STRUCTURED_TO_ENTITY[l.entityType], l.entityId));
  const out: LinkedEntityWithOrigin[] = [];
  const seen = new Set<string>();
  for (const r of structuredRows) {
    const k = linkKey(r.type, r.id);
    if (!active.has(k) || seen.has(k) || !isLinkedEntityOpen(r)) continue;
    seen.add(k);
    out.push({ ...r, origin: "ESTRUTURADO" });
  }
  for (const r of selectOpenLinkedEntities(conventionRows, alert)) {
    const k = linkKey(r.type, r.id);
    if (active.has(k) || undone.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push({ ...r, origin: "CONVENCAO" });
  }
  return out;
}

export function isLinkedEntityOpen(e: Pick<LinkedEntityRow, "type" | "state">): boolean {
  if (e.type === "NCR") return isNcrOpen(e.state);
  if (e.type === "WARRANTY") return isWarrantyOpen(e.state);
  return e.state !== CLAIM_CLOSED;
}

/** Entidades ABERTAS vinculadas ao alerta (as encerradas não geram aviso). */
export function selectOpenLinkedEntities(rows: readonly LinkedEntityRow[], alert: AlertRef): LinkedEntityRow[] {
  return rows.filter((r) => isLinkedEntityOpen(r) && referencesAlert(r.refs, alert));
}

export const ENTITY_TYPE_LABELS: Record<LinkedEntityType, string> = { NCR: "RNC", WARRANTY: "Garantia", CLAIM: "Sinistro" };
export const ENTITY_ROUTE: Record<LinkedEntityType, string> = { NCR: "qualidade", WARRANTY: "garantias", CLAIM: "seguros" };

/** Título FIXO do aviso (brief da fase 2); as entidades realmente vinculadas são listadas abaixo dele. */
export const RESOLVED_NOTICE_TITLE = "RESOLVIDO não encerra a RNC/garantia/sinistro vinculada";

/** Rótulos legíveis para os códigos de bloqueio de quality_closure_readiness (o que FALTA para encerrar). */
export const BLOCKER_LABELS: Record<string, string> = {
  NOT_IN_VERIFICATION: "ainda não está em verificação",
  NOT_REPAIRED: "o reparo ainda não foi registrado",
  NOT_VERIFIED: "a verificação ainda não foi feita",
  ACTION_PLAN_REQUIRED: "falta plano de ação",
  NO_CORRECTIVE_ACTION: "não há ação corretiva",
  ACTIONS_NOT_EXECUTED: "há ações corretivas ainda não executadas",
  REPAIR_RECORD_REQUIRED: "falta o registro do reparo",
  CUSTOMER_ACCEPTANCE_REQUIRED: "falta o aceite do cliente",
  EFFECTIVENESS_VERIFICATION_REQUIRED: "falta a verificação de eficácia com evidência",
  VERIFICATION_EVIDENCE_REQUIRED: "a verificação de eficácia não tem evidência",
  LATEST_VERIFICATION_NOT_EFFECTIVE: "a última verificação não foi EFICAZ",
  VERIFICATION_STALE_AFTER_CORRECTION_OR_REOPEN: "a verificação é anterior à última correção ou reabertura",
  VERIFICATION_STALE_AFTER_REPAIR_OR_REOPEN: "a verificação é anterior ao último reparo ou reabertura",
  CONFIRMATION_REQUIRES_NC_COMPROVADA_EVIDENCE: "falta evidência classificada NC COMPROVADA",
};

export function blockerLabel(code: string): string {
  return BLOCKER_LABELS[code] ?? `pendência registrada pelo banco (${code})`;
}

export interface ClosureGuard {
  alertResolutionClosesEntity: false;
  closureReady: boolean;
  blockers: string[];
  rule: string;
}

/** Valida o retorno JSON de public.quality_alert_resolved_guard; qualquer outro formato => null (a UI mostra "indisponível"). */
export function parseGuardPayload(payload: unknown): ClosureGuard | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (p.alertResolutionClosesEntity !== false) return null;
  if (typeof p.closureReady !== "boolean" || !Array.isArray(p.blockers) || typeof p.rule !== "string") return null;
  return { alertResolutionClosesEntity: false, closureReady: p.closureReady, blockers: p.blockers.filter((b): b is string => typeof b === "string"), rule: p.rule };
}
