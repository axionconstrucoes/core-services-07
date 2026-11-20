// Orquestração PURA (dependências injetadas) da consulta "CONSULTAR IA" de um alerta.
//
// Garantias, nesta ordem (falha fechada):
//   1. permissão ativa na obra (getPermission) — sem ela nada é carregado;
//   2. o alerta (evento/providência) é carregado POR OBRA: id de outra obra = inexistente;
//   3. roteamento: especialidade explícita → o Expert dela; "Geral (pelo assunto)" → assunto concreto
//      (lib/ai/routing/expert-topics.ts): um tema → um Expert; multidisciplinar → curadoria multi-Expert
//      (um parecer por Expert + consolidação CEO IA); a AXIA nunca participa;
//   4. limite de IA reservado ANTES de cada chamada de Expert (1 unidade por Expert chamado);
//   5. o Expert roda com o contexto SOMENTE dessa obra;
//   6. nada é gravado: a consulta não altera o alerta, responsável, SLA nem escalonamento.

import { classifyCurationTopic } from "../curation/route-experts";
import type { MultiExpertCuration } from "../curation/types";
import type { OfficialExpertId } from "../expert-definitions/types";
import { resolveExpertQueryErrorMessage } from "../expert-query-request";
import type { ExecutiveCuration } from "../experts/ceo/types";
import { buildAiProviderUiMetadata, type AiProviderUiMetadata } from "../provider-ui-metadata";
import type { ExpertQueryRequest, ExpertQueryResponse } from "../query/types";
import { routeBySubject } from "../routing/expert-topics";
import type { ExpertId } from "../types";

import {
  composeSpecialtyQuestion,
  getAlertConsultSpecialty,
  type AlertConsultSpecialtyId,
  type AlertConsultSubjectKind,
} from "./specialties";

export interface AlertConsultSource {
  kind: "EVENTO" | "CLAUSULA" | "EVIDENCIA" | "PROVIDENCIA" | "ALERTA";
  label: string;
  /** Caminho relativo no ACC (exige login e participação na obra); null = pendente de confirmação. */
  href: string | null;
  note?: string;
}

export interface AlertConsultSubject {
  projectId: string;
  subject: AlertConsultSubjectKind;
  id: string;
  title: string;
  projectName: string;
  /** EVENT: o context builder do Expert monta o contexto; PROJECT: o resumo abaixo vai na pergunta. */
  scope: "EVENT" | "PROJECT";
  /** Texto do registro da providência (null para evento — o contexto vem do builder). */
  contextText: string | null;
  sources: AlertConsultSource[];
}

export type ProjectPermission = "ADMINISTRADOR" | "GESTOR" | "GERENTE" | "COLABORADOR" | "LEITURA";

type Reservation = { ok: true } | { ok: false; error: string };

export interface AlertConsultDeps {
  getPermission(projectId: string): Promise<ProjectPermission | null>;
  /** Carrega o alerta SOMENTE se pertencer à obra informada (e visível ao usuário); senão null. */
  loadSubject(projectId: string, subject: AlertConsultSubjectKind, id: string): Promise<AlertConsultSubject | null>;
  /**
   * Reserva uma unidade do limite diário de consultas de IA para o Expert indicado; recusada = a IA não é
   * chamada (falha fechada). Na curadoria é chamada uma vez por Expert (especialistas + CEO IA).
   */
  reserve?(projectId: string, subject: AlertConsultSubjectKind, id: string, expertId: OfficialExpertId): Promise<Reservation>;
  runExpert(
    expertId: ExpertId,
    request: ExpertQueryRequest,
    /** Pergunta ORIGINAL do usuário (guards que inspecionam a pergunta não devem ver o texto de apoio). */
    userQuestion: string
  ): Promise<{ response: ExpertQueryResponse; audit: { providerId: string; model: string | null } }>;
  /** Curadoria multi-Expert (assunto multidisciplinar). Ausente = o assunto multidisciplinar é recusado, nunca simulado. */
  runCuration?(input: {
    request: ExpertQueryRequest;
    expertIds: OfficialExpertId[];
    reserve(expertId: OfficialExpertId): Promise<Reservation>;
  }): Promise<{ curation: MultiExpertCuration; /** Provider efetivo da consolidação (CEO IA). */ providerId: string }>;
}

export interface AlertConsultInput {
  projectId: string;
  subject: AlertConsultSubjectKind;
  id: string;
  specialtyId: AlertConsultSpecialtyId;
  question: string;
}

/** Parecer de UM Expert dentro da curadoria — autoria preservada. */
export interface AlertConsultExpertOpinion {
  expertId: ExpertId;
  expertName: string;
  response: ExpertQueryResponse;
}

/** Resultado da curadoria multi-Expert exibido na caixa CONSULTAR IA. */
export interface AlertConsultCurationResult {
  topic: string;
  reason: string;
  pareceres: AlertConsultExpertOpinion[];
  /** Experts roteados sem parecer nesta rodada (bloqueio determinístico redigido para a tela). */
  indisponiveis: { expertId: OfficialExpertId; reason: string }[];
  consolidacao: ExecutiveCuration;
}

export interface AlertConsultSuccess {
  /** Resposta do Expert único; null quando a consulta foi multidisciplinar (ver `curation`). */
  response: ExpertQueryResponse | null;
  /** Pareceres por Expert + consolidação do CEO IA; null quando a consulta foi a um Expert único. */
  curation: AlertConsultCurationResult | null;
  specialtyLabel: string;
  /** Expert único consultado, ou "ceo" quando houve curadoria multi-Expert (consolidação). */
  expertId: ExpertId;
  /** Por que este Expert (ou a curadoria) foi escolhido — auditável. */
  routingReason: string;
  /** Provider/modelo efetivo — nunca confundir fake com IA real. */
  meta: AiProviderUiMetadata;
  sources: AlertConsultSource[];
  /** Pergunta como o usuário a escreveu (a pergunta composta enviada ao Expert não é exibida como dele). */
  question: string;
  generatedAt: string;
}

export type AlertConsultOutcome = ({ ok: true } & AlertConsultSuccess) | { ok: false; error: string };

export const CONSULT_NO_ACCESS_MESSAGE = "Você não possui acesso ativo a esta obra.";
export const CONSULT_NOT_FOUND_MESSAGE = "Este alerta não existe ou seu usuário não tem acesso a ele.";
export const CONSULT_MULTI_UNAVAILABLE_MESSAGE =
  "Este assunto envolve mais de uma especialidade e a análise multi-Expert não está disponível agora. Escolha uma especialidade.";
const FALLBACK_ERROR = "Falha ao consultar o especialista de IA.";

export async function runAlertConsult(deps: AlertConsultDeps, input: AlertConsultInput): Promise<AlertConsultOutcome> {
  const specialty = getAlertConsultSpecialty(input.specialtyId);
  if (!specialty) return { ok: false, error: "Selecione uma especialidade." };

  try {
    const permission = await deps.getPermission(input.projectId);
    if (permission === null) return { ok: false, error: CONSULT_NO_ACCESS_MESSAGE };

    const subject = await deps.loadSubject(input.projectId, input.subject, input.id);
    // Defesa em profundidade: mesmo um loader indevido nunca devolve alerta de outra obra.
    if (!subject || subject.projectId !== input.projectId || subject.id !== input.id) {
      return { ok: false, error: CONSULT_NOT_FOUND_MESSAGE };
    }

    const userQuestion = input.question.trim();
    const request: ExpertQueryRequest = {
      scope: subject.scope,
      projectId: input.projectId,
      eventId: subject.scope === "EVENT" ? subject.id : undefined,
      question: composeSpecialtyQuestion(specialty, input.question, subject.contextText),
    };

    // Roteamento: especialidade explícita é sempre respeitada; "AUTO" decide pelo assunto concreto.
    const subjectText = [subject.title, subject.contextText].filter(Boolean).join("\n");
    const routing =
      specialty.expertId === "AUTO"
        ? routeBySubject({ question: userQuestion, subjectText })
        : ({ kind: "SINGLE", expertId: specialty.expertId, topics: [], reason: `Especialidade escolhida: ${specialty.label}.` } as const);

    if (routing.kind === "SINGLE") {
      if (deps.reserve) {
        const reservation = await deps.reserve(input.projectId, input.subject, input.id, routing.expertId as OfficialExpertId);
        if (!reservation.ok) return reservation;
      }
      const result = await deps.runExpert(routing.expertId, request, userQuestion);
      return {
        ok: true,
        // A pergunta exibida é a do usuário; o restante da resposta é o validado pelo Expert.
        response: { ...result.response, question: userQuestion },
        curation: null,
        specialtyLabel: specialty.label,
        expertId: routing.expertId,
        routingReason: routing.reason,
        meta: buildAiProviderUiMetadata(result.audit.providerId, result.audit.model),
        sources: subject.sources,
        question: userQuestion,
        generatedAt: new Date().toISOString(),
      };
    }

    // Multidisciplinar: curadoria multi-Expert existente — nunca um Expert único simulando várias áreas.
    if (!deps.runCuration) return { ok: false, error: CONSULT_MULTI_UNAVAILABLE_MESSAGE };
    const expertIds: OfficialExpertId[] =
      routing.expertIds.length > 0
        ? routing.expertIds
        : (() => {
            const fallback = classifyCurationTopic(`${userQuestion}\n${subject.title}`);
            return [...fallback.primaryExpertIds, ...fallback.supportingExpertIds];
          })();
    const { curation, providerId } = await deps.runCuration({
      request,
      expertIds,
      reserve: async (expertId) =>
        deps.reserve ? deps.reserve(input.projectId, input.subject, input.id, expertId) : { ok: true },
    });
    return {
      ok: true,
      response: null,
      curation: {
        topic: curation.routing.topic,
        reason: routing.reason,
        pareceres: curation.expertResults.map((item) => ({
          expertId: item.expertId,
          expertName: item.response.expertName,
          response: { ...item.response, question: userQuestion },
        })),
        indisponiveis: curation.unavailableExperts ?? [],
        consolidacao: curation.executiveCuration,
      },
      specialtyLabel: specialty.label,
      expertId: "ceo",
      routingReason: routing.reason,
      meta: buildAiProviderUiMetadata(providerId, null),
      sources: subject.sources,
      question: userQuestion,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return { ok: false, error: resolveExpertQueryErrorMessage(error, FALLBACK_ERROR) };
  }
}

