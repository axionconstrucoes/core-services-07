// Reserva do limite de IA na FRONTEIRA DO PROVEDOR (frente N6 — docs/ai/governanca-consumo-ia.md).
//
// Problema que resolve: os caminhos de IA reservavam a unidade ANTES de chamar o answerXQuery do Expert; os guards
// determinísticos que vivem dentro dele (MPP ausente/não extraído no Planejamento, contrato ilegível no Jurídico,
// escopo/pergunta inválidos) recusavam DEPOIS da reserva — a unidade era consumida sem nenhuma chamada ao provedor.
// No ciclo de risco isso se repetia a cada ciclo até esgotar o limite do usuário.
//
// Política escolhida (sem estorno): o provedor do Expert é embrulhado por `withQuotaGate`; cada chamada efetiva ao
// provedor (answerQuery / generateAssessment / consolidateExecutiveCuration) reserva UMA unidade imediatamente antes
// de delegar. Consequências:
//   - recusa determinística antes do provedor → nenhuma unidade consumida (não há o que estornar);
//   - reserva recusada → o provedor NÃO é chamado (ExpertQuerySafeError com a mensagem redigida para a tela);
//   - provedor chamado e falhou depois (erro de rede, saída inválida) → a unidade permanece consumida (a chamada pode
//     ter sido cobrada); não existe caminho de devolução, logo não existe abuso por estorno.
//
// O embrulho é transparente: `id` e a resposta do provedor são os do provedor real/fake (o fake continua sendo
// reconhecido por providerId === "fake").

import type { OfficialExpertId } from "../expert-definitions/types";
import { ExpertQuerySafeError } from "../expert-query-request";
import { resolveAiProviderForExpert } from "../providers/resolve-provider-for-expert";
import type { AiProvider, AiProviderResponse } from "../providers/types";
import type { AiConsultReservation } from "../alert-consult/consult-quota";
import { auditSinkOf, buildConsultAuditEntry, type AnyProviderRequest, type ConsultAuditEntry, type ConsultAuditSink } from "./consult-audit";

/** Reserva UMA unidade; recusada = o provedor não é chamado. */
export type ReserveUnit = () => Promise<AiConsultReservation>;

/** Marca auditável (testes e inspeção): este provedor só chama o real depois de reservar. */
export const QUOTA_GATED = Symbol.for("axion.ai.quotaGated");

export function isQuotaGated(provider: AiProvider | null | undefined): boolean {
  return Boolean(provider && (provider as unknown as Record<symbol, unknown>)[QUOTA_GATED] === true);
}

async function passGate(reserve: ReserveUnit): Promise<void> {
  let reservation: AiConsultReservation;
  try {
    reservation = await reserve();
  } catch {
    // Falha fechada: sem reserva confirmada, nenhuma chamada.
    reservation = { ok: false, error: "Não foi possível verificar o limite de consultas de IA agora. Tente novamente." };
  }
  if (!reservation.ok) throw new ExpertQuerySafeError(reservation.error);
}

/**
 * Embrulha `provider`: cada chamada ao provedor reserva uma unidade imediatamente antes de delegar. `audit`
 * (opcional) recebe a trilha da consulta DEPOIS da chamada (resposta ou erro do provedor); nunca bloqueia a resposta.
 */
export function withQuotaGate(provider: AiProvider, reserve: ReserveUnit, auditArg?: ConsultAuditSink, auditExpertId?: string): AiProvider {
  const audit = auditArg ?? auditSinkOf(reserve);
  if (typeof reserve !== "function") {
    throw new Error("Provedor de IA sem reserva do limite — nenhuma chamada será feita.");
  }
  async function run<R extends AnyProviderRequest>(request: R, call: (request: R) => Promise<AiProviderResponse>): Promise<AiProviderResponse> {
    await passGate(reserve);
    let response: AiProviderResponse;
    try {
      response = await call(request);
    } catch (error) {
      await auditSafely(audit, () => buildConsultAuditEntry(auditExpertId ?? request.expertId, request, provider.id, null));
      throw error;
    }
    await auditSafely(audit, () => buildConsultAuditEntry(auditExpertId ?? request.expertId, request, provider.id, response));
    return response;
  }
  const gated = {
    id: provider.id,
    generateAssessment: (request) => run(request, (r) => provider.generateAssessment(r)),
    answerQuery: (request) => run(request, (r) => provider.answerQuery(r)),
    consolidateExecutiveCuration: (request) => run(request, (r) => provider.consolidateExecutiveCuration(r)),
  } satisfies AiProvider;
  Object.defineProperty(gated, QUOTA_GATED, { value: true, enumerable: false });
  return gated;
}

async function auditSafely(audit: ConsultAuditSink | undefined, build: () => ConsultAuditEntry): Promise<void> {
  if (!audit) return;
  try {
    await audit(build());
  } catch {
    // A auditoria nunca descarta a resposta já gerada.
  }
}

/**
 * Provedor do Expert (o informado — só testes — ou o resolvido por Expert em produção) com a reserva na fronteira.
 * `reserve` recebe o Expert para registrar a autoria do consumo (ai_consult_usage.expert_id).
 */
export function gatedProviderForExpert(
  expertId: OfficialExpertId,
  reserve: (expertId: OfficialExpertId) => Promise<AiConsultReservation>,
  base?: AiProvider,
  audit?: ConsultAuditSink
): AiProvider {
  return withQuotaGate(base ?? resolveAiProviderForExpert(expertId), () => reserve(expertId), audit ?? auditSinkOf(reserve), expertId);
}
