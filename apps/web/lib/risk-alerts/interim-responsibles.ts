// Responsável operacional TEMPORÁRIO do Nível 1 de uma área da Matriz (ex.: FINANCEIRO da WEG
// enquanto a titular definitiva ainda não concluiu o cadastro). Puro, sem I/O.
//
// Fonte: registros append-only em audit_log_entries (sem migration, sem alterar a Matriz):
//   action      = SLA_INTERIM_RESPONSIBLE_ASSIGNED | SLA_INTERIM_RESPONSIBLE_REVOKED
//   entity_type = SLA_AREA_RESPONSIBLES
//   entity_id   = "<projectId>:<AREA>"
//   actor_type  = USER (somente registro humano vale; SYSTEM/LEGACY são ignorados)
//   detail      = JSON { "area": "FINANCEIRO", "interimUserId": "<uuid>", "reason": "..." }
// O registro MAIS RECENTE por área decide: ASSIGNED => substituição ativa; REVOKED => encerrada.
//
// Regras:
// - A Matriz NÃO é alterada: a titular definitiva (usuário ou convite pendente) continua gravada
//   em sla_area_responsibles e aparece em `definitive`.
// - Enquanto ativa, o Nível 1 da área para os ALERTAS é somente o substituto (o corresponsável e a
//   titular ficam fora). A ativação do convite da titular no primeiro login NÃO troca o roteamento:
//   a troca exige um registro REVOKED explícito. O status `definitiveStatus` informa quando ela
//   está apta (usuário ativo, membro ACTIVE do projeto e na allowlist do piloto).
// - Níveis 2 e 3 (escalonamento) não mudam.

import type { SlaArea, SlaAreaResponsibles } from "@/lib/sla/types";

import type { RecipientProfile } from "./types";

export const INTERIM_ASSIGNED_ACTION = "SLA_INTERIM_RESPONSIBLE_ASSIGNED";
export const INTERIM_REVOKED_ACTION = "SLA_INTERIM_RESPONSIBLE_REVOKED";
export const INTERIM_ENTITY_TYPE = "SLA_AREA_RESPONSIBLES";

export interface InterimAuditRow {
  id?: string;
  project_id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string | null;
}

export interface InterimResponsible {
  area: SlaArea;
  interimUserId: string;
  assignedAt: string;
  assignedByUserId: string;
  reason: string | null;
}

export type DefinitiveStatus =
  /** Titular definitiva ainda é convite pendente (sem cadastro/aceite). */
  | "PENDING_INVITATION"
  /** Titular com usuário, mas sem membership ACTIVE no projeto. */
  | "NOT_ACTIVE_MEMBER"
  /** Titular ativa, mas fora da allowlist do piloto. */
  | "NOT_IN_PILOT_ALLOWLIST"
  /** Apta a assumir os recebimentos (exige registro REVOKED explícito para trocar). */
  | "READY_TO_TAKE_OVER"
  /** Sem titular definitiva configurada na Matriz. */
  | "NO_DEFINITIVE";

export interface InterimStatus {
  area: SlaArea;
  interimUserId: string;
  definitiveUserId: string | null;
  definitiveInvitationId: string | null;
  definitiveStatus: DefinitiveStatus;
}

function parseDetail(detail: string | null): { area?: unknown; interimUserId?: unknown; reason?: unknown } | null {
  if (!detail) return null;
  try {
    const value = JSON.parse(detail);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Substituições ATIVAS por área (o registro humano mais recente por área decide). */
export function resolveActiveInterims(projectId: string, rows: InterimAuditRow[]): Map<SlaArea, InterimResponsible> {
  const latest = new Map<string, InterimAuditRow>();
  for (const row of rows) {
    if (row.project_id !== projectId) continue;
    if (row.entity_type !== INTERIM_ENTITY_TYPE) continue;
    if (row.action !== INTERIM_ASSIGNED_ACTION && row.action !== INTERIM_REVOKED_ACTION) continue;
    if (row.actor_type !== "USER" || !row.actor_user_id) continue;
    const [entityProject, area] = row.entity_id.split(":");
    if (entityProject !== projectId || !area) continue;
    const current = latest.get(area);
    if (!current || row.occurred_at > current.occurred_at) latest.set(area, row);
  }
  const active = new Map<SlaArea, InterimResponsible>();
  for (const [area, row] of latest) {
    if (row.action !== INTERIM_ASSIGNED_ACTION) continue;
    const detail = parseDetail(row.detail);
    if (!detail || detail.area !== area || typeof detail.interimUserId !== "string" || !UUID.test(detail.interimUserId)) continue;
    active.set(area as SlaArea, {
      area: area as SlaArea,
      interimUserId: detail.interimUserId,
      assignedAt: row.occurred_at,
      assignedByUserId: row.actor_user_id!,
      reason: typeof detail.reason === "string" ? detail.reason : null,
    });
  }
  return active;
}

/** Linhas da Matriz como o MOTOR DE ALERTAS deve enxergá-las (a Matriz gravada não muda). */
export function applyInterimResponsibles(rows: SlaAreaResponsibles[], interims: Map<SlaArea, InterimResponsible>): SlaAreaResponsibles[] {
  return rows.map((row) => {
    const interim = interims.get(row.area);
    if (!interim) return row;
    return {
      ...row,
      responsibleDirectUserId: interim.interimUserId,
      responsibleDirectInvitationId: null,
      responsibleDirectName: null,
      secondaryResponsibleUserId: null,
      secondaryResponsibleInvitationId: null,
      secondaryResponsibleName: null,
    };
  });
}

export function describeInterimStatus(
  rows: SlaAreaResponsibles[],
  interims: Map<SlaArea, InterimResponsible>,
  recipients: Map<string, RecipientProfile>,
  allowlist: string[] | null
): InterimStatus[] {
  const result: InterimStatus[] = [];
  for (const interim of interims.values()) {
    const row = rows.find((r) => r.area === interim.area) ?? null;
    const definitiveUserId = row?.responsibleDirectUserId ?? null;
    const definitiveInvitationId = row?.responsibleDirectInvitationId ?? null;
    let definitiveStatus: DefinitiveStatus;
    if (definitiveUserId) {
      const profile = recipients.get(definitiveUserId);
      if (!profile || profile.membershipStatus !== "ACTIVE") definitiveStatus = "NOT_ACTIVE_MEMBER";
      else if (!(allowlist ?? []).includes(definitiveUserId)) definitiveStatus = "NOT_IN_PILOT_ALLOWLIST";
      else definitiveStatus = "READY_TO_TAKE_OVER";
    } else if (definitiveInvitationId) {
      definitiveStatus = "PENDING_INVITATION";
    } else {
      definitiveStatus = "NO_DEFINITIVE";
    }
    result.push({ area: interim.area, interimUserId: interim.interimUserId, definitiveUserId, definitiveInvitationId, definitiveStatus });
  }
  return result;
}
