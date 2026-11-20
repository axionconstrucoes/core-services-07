// Templates dos e-mails de alerta de risco — puros, sem I/O. Desde o TEMPLATE UNIVERSAL, o desenho (logotipo oficial,
// cores por gravidade, quatro botões RESOLVIDO / EM ANDAMENTO / ENVIAR PARA / ESPECIALISTA) vive em
// lib/email/templates/universal-alert-template.ts; aqui só se monta o CONTEÚDO do alerta de risco.
//
// Conteúdo mínimo (imediato/escalonamento): projeto, grau de risco, origem, resumo, impacto, prazo aplicável, nível
// atual, responsável, data/hora, recomendação, link seguro para o ACC (rota do projeto — sem token, sem URL assinada),
// necessidade de confirmação e de justificativa. Consolidado: resumo executivo, quantidade por risco, itens Médios,
// itens Baixos, prazos, responsáveis e os QUATRO botões em CADA ocorrência.
// Nunca: tokens no texto, anexos, conteúdo contratual extenso, dados de outro projeto. Os botões são LINKS para a página
// autenticada do alerta (a ação só é gravada por POST após confirmação); nada é gravado por GET.

import type { AlertSeverity } from "@axion/types";

import type { EmailActionButton } from "@/lib/email-actions/render-buttons";
import { EMAIL_ALERT_ACTION_LABELS } from "@/lib/email-actions/types";
import { ALERT_TONES, type AlertLogoAvailability } from "@/lib/email/templates/alert-box-style";
import { alertRiskLevelLabels, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
import { buildUniversalAlertEmail, buildUniversalDigestEmail, type UniversalActionLinks, type UniversalOccurrence } from "@/lib/email/templates/universal-alert-template";
import type { ReplyMailtoLinks } from "@/lib/email-replies/reply-mailto";
import { slaAreaLabels } from "@/lib/labels";
import type { SlaArea, SlaRiskLevel } from "@/lib/sla/types";

import { type AlertActionType, type DigestContent, type DigestItem, type ImmediateAlertContent } from "./types";

export const RISK_LEVEL_TO_SEVERITY: Record<SlaRiskLevel, AlertSeverity> = {
  LOW: "BAIXA",
  MEDIUM: "MEDIA",
  HIGH: "ALTA",
  CRITICAL: "CRITICA",
};

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
  /** Logotipos que o HTML referencia por Content-ID (o chamador anexa; sem isso, o e-mail não usa logo embutido). */
  logoNeeds?: { maroon: boolean; inverted: boolean };
}

export function formatDateTimeBR(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

// ------------------------------------------------------------------
// Paleta: UMA só (a aprovada, em alert-box-style.ts). RISK_EMAIL_THEMES continua exportado, derivado dela, para quem
// precisa das cores por grau de risco (CRÍTICO vermelho, ALTO amarelo, MÉDIO e BAIXO brancos).
// ------------------------------------------------------------------
export interface RiskEmailTheme {
  background: string;
  foreground: string;
  border: string;
}

export const RISK_EMAIL_THEMES: Record<SlaRiskLevel, RiskEmailTheme> = {
  CRITICAL: { background: ALERT_TONES.CRITICA.background, foreground: ALERT_TONES.CRITICA.text, border: ALERT_TONES.CRITICA.border },
  HIGH: { background: ALERT_TONES.ALTA.background, foreground: ALERT_TONES.ALTA.text, border: ALERT_TONES.ALTA.border },
  MEDIUM: { background: ALERT_TONES.MEDIA.background, foreground: ALERT_TONES.MEDIA.text, border: ALERT_TONES.MEDIA.border },
  LOW: { background: ALERT_TONES.BAIXA.background, foreground: ALERT_TONES.BAIXA.text, border: ALERT_TONES.BAIXA.border },
};

/** Instrução de resposta direta no corpo do e-mail (status + previsão), conforme o grau de risco. */
export function replyInstructionFor(riskLevel: SlaRiskLevel): string {
  const needsTime = riskLevel === "HIGH" || riskLevel === "CRITICAL";
  return needsTime
    ? 'Responda a este e-mail com o status e a previsão de conclusão com DATA e HORÁRIO (Brasília). Ex.: "Em andamento. Conclusão prevista para 20/11/2026 às 15h." A resposta não suspende prazos nem escalonamentos.'
    : 'Responda a este e-mail com o status e a DATA prevista de conclusão. Ex.: "Tomando providências. Conclusão prevista para 20/11/2026." A resposta não suspende prazos.';
}

/** Link seguro: rota interna do projeto (exige login no ACC) — nunca token/URL assinada. */
export function buildProjectLink(baseUrl: string, projectId: string, path: string): string {
  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return `${cleanBase}/${projectId}/${cleanPath}`;
}

const DEFAULT_NO_LOGOS: AlertLogoAvailability = { maroon: false, inverted: false };

const SPECIALIST_BY_AREA: Partial<Record<SlaArea, string>> = {
  ESG_SSMA: "Especialista SSMA",
  ENGENHARIA: "Especialista Engenharia",
  PLANEJAMENTO: "Especialista Planejamento",
  JURIDICO: "Especialista Jurídico/Contratos",
};
function specialistLabelFor(area: SlaArea): string {
  return SPECIALIST_BY_AREA[area] ?? `Especialista (${slaAreaLabels[area]}) — consulta geral`;
}

/**
 * Links dos quatro botões de um caso. Os três de tratamento usam o link com token (quando emitido) ou o link
 * autenticado SEM token (?acao=…, só PRÉ-SELECIONA o formulário; a autorização é a sessão + a validação do servidor).
 * ESPECIALISTA é sempre o link autenticado da consulta (somente leitura). Sem caso registrado, os botões ficam
 * desativados com o motivo (nunca um link inventado).
 */
export function buildCaseActionLinks(baseUrl: string, projectId: string, caseId: string | null | undefined, tokenLinks?: Partial<Record<AlertActionType, string>>): { links: UniversalActionLinks; unavailableReasons: Partial<Record<keyof UniversalActionLinks, string>> } {
  const plain = (acao: string) => (caseId ? `${buildProjectLink(baseUrl, projectId, `alertas/${caseId}`)}?acao=${acao}` : null);
  const reason = "Disponível após o registro do caso no ACC.";
  return {
    links: {
      RESOLVIDO: tokenLinks?.RESOLVED ?? plain("RESOLVED"),
      EM_ANDAMENTO: tokenLinks?.TAKING_ACTION ?? plain("TAKING_ACTION"),
      ENVIAR_PARA: tokenLinks?.FORWARD ?? plain("FORWARD"),
      ESPECIALISTA: plain("ESPECIALISTA"),
    },
    unavailableReasons: caseId ? {} : { RESOLVIDO: reason, EM_ANDAMENTO: reason, ENVIAR_PARA: reason, ESPECIALISTA: reason },
  };
}

function toBuilt(email: { subject: string; html: string; text: string; logoNeeds: { maroon: boolean; inverted: boolean } }, subjectOverride?: string): BuiltEmail {
  return { subject: subjectOverride ?? email.subject, html: email.html, text: email.text, logoNeeds: email.logoNeeds };
}

// ------------------------------------------------------------------ imediato / escalonamento

export interface ImmediateEmailInput {
  content: ImmediateAlertContent;
  projectId: string;
  projectName: string;
  recipientName: string | null;
  baseUrl: string;
  timeZone: string;
  generatedAt: string;
  actionButtons: EmailActionButton[];
  /** Links das ações formais com token curto/expirável (página autenticada). */
  actionLinks?: Partial<Record<AlertActionType, string>>;
  /** Código visível do alerta (fallback de correlação da resposta por e-mail). */
  visibleCode?: string | null;
  /** Id do caso de risco (monta os links autenticados dos quatro botões). */
  caseId?: string | null;
  /** Logotipos disponíveis nesta execução (o chamador carrega os arquivos oficiais). */
  logos?: AlertLogoAvailability;
  /** Atalhos "Responder por e-mail" (mailto com token POR ITEM já gravado). Ausente => sem atalhos. */
  replyByEmail?: ReplyMailtoLinks | null;
}

export function buildImmediateRiskAlertEmail(input: ImmediateEmailInput): BuiltEmail {
  const { content } = input;
  const severity = RISK_LEVEL_TO_SEVERITY[content.riskLevel];
  const riskLabel = alertRiskLevelLabels[severity];
  const isEscalation = content.kind === "ESCALATION";
  const subjectBase = buildContractAlertSubject(input.projectName, severity);
  const codeTag = input.visibleCode ? ` [ACC-ALERTA:${input.visibleCode}]` : "";
  const reissue = content.reissue ?? null;
  const subject =
    (reissue
      ? `${subjectBase} - REEMISSÃO (comunicação anterior não entregue)${isEscalation ? ` - ${content.levelLabel.toUpperCase()}` : ""}`
      : isEscalation
        ? `${subjectBase} - ESCALONADO ${content.levelLabel.toUpperCase()}`
        : content.changed
          ? `${subjectBase} - ATUALIZADO`
          : subjectBase) + codeTag;
  const headline = reissue
    ? `REEMISSÃO — risco ${riskLabel} já existente, cuja comunicação anterior NÃO foi entregue: ${content.caseTitle}`
    : isEscalation
      ? `Risco sem tratamento escalado para ${content.levelLabel}`
      : content.changed
        ? `Risco ${riskLabel} atualizado: ${content.caseTitle}`
        : `Novo risco ${riskLabel}: ${content.caseTitle}`;
  const originUrl = buildProjectLink(input.baseUrl, input.projectId, content.originPath);
  const actionUrl = content.slaActionId ? buildProjectLink(input.baseUrl, input.projectId, `acoes/${content.slaActionId}`) : buildProjectLink(input.baseUrl, input.projectId, "acoes");
  const requirements = [
    content.requiresAcknowledgment ? "confirmação de ciência obrigatória" : "confirmação de ciência não exigida",
    content.requiresJustification ? "justificativa obrigatória em caso de atraso" : "justificativa de atraso não exigida",
  ].join("; ");
  const { links, unavailableReasons } = buildCaseActionLinks(input.baseUrl, input.projectId, input.caseId, input.actionLinks);

  const details: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Grau de risco", value: riskLabel },
    { label: "Origem", value: `${content.reference} · área ${slaAreaLabels[content.area]}` },
    { label: "Resumo", value: content.summary },
    { label: "Impacto", value: content.impact || null },
    { label: "Tipo de prazo", value: content.deadlineLabel },
    { label: "Nível atual", value: isEscalation ? `${content.levelLabel}` : content.levelLabel },
    { label: "Observação do nível", value: content.levelNote ?? null },
    { label: "Nível anterior", value: content.previousLevelLabel },
    { label: "Motivo do escalonamento", value: content.escalationReason },
    ...(reissue
      ? [
          { label: "Reemissão", value: `Não é um risco novo. ${reissue.note}` },
          { label: "Etapa atual do SLA", value: `${reissue.stageReachedLabel} (alcançada pelos prazos originais; nada foi reiniciado)` },
          {
            label: "Comunicação anterior (NÃO entregue)",
            value:
              reissue.priorCommunications.length === 0
                ? "Nenhuma comunicação anterior registrada para este caso."
                : reissue.priorCommunications
                    .map((p) => `${formatDateTimeBR(p.at, input.timeZone)} — ${p.levelLabel}${p.recipientName ? ` (${p.recipientName})` : ""}: ${p.outcome === "SUPPRESSED" ? `suprimida${p.reason ? ` (${p.reason})` : ""}` : "aceita pelo Gmail, mas entregue em outra caixa"}`)
                    .join("; "),
          },
        ]
      : []),
    { label: "Resposta do responsável", value: content.responderLine ?? null },
    { label: "Previsão de conclusão", value: content.forecastLine ?? null },
    { label: "Recomendação do Expert", value: content.recommendation },
    { label: "Exigências da Matriz", value: requirements },
    { label: "Gerado em", value: formatDateTimeBR(input.generatedAt, input.timeZone) },
  ];

  const occurrence: UniversalOccurrence = {
    code: input.visibleCode ?? content.reference,
    projectName: input.projectName,
    areaLabel: slaAreaLabels[content.area],
    severity,
    title: headline,
    description: content.summary,
    evidences: [{ label: `Evidência de origem: ${content.reference}`, url: originUrl }],
    responsibleName: content.responsibleName,
    originalDeadline: formatDateTimeBR(content.deadlineAt, input.timeZone),
    stateLabel: isEscalation ? `Escalonado — ${content.levelLabel}` : content.changed ? "Atualizado" : "Aberto",
    specialistLabel: specialistLabelFor(content.area),
    openUrl: actionUrl,
    actions: links,
    unavailableReasons,
    details: details.filter((d) => d.label !== "Resumo"),
    replyInstruction: `${replyInstructionFor(content.riskLevel)}${input.visibleCode ? ` Código do alerta: ${input.visibleCode}.` : ""}`,
    extraLinks: input.actionButtons.map((b) => ({ label: EMAIL_ALERT_ACTION_LABELS[b.action], url: b.url })),
    replyByEmail: input.replyByEmail ?? null,
  };
  const built = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    occurrence,
    logos: input.logos ?? DEFAULT_NO_LOGOS,
    footer: "Alerta gerado automaticamente pelo ACC a partir da Matriz de responsabilidades e prazos do projeto — não é uma decisão de IA. Os botões abrem o ACC autenticado: nada é registrado, transferido ou concluído apenas pelo clique no e-mail.",
  });
  return toBuilt(built, subject);
}

// ------------------------------------------------------------------ consolidado semanal

export interface DigestEmailInput {
  content: DigestContent;
  projectId: string;
  projectName: string;
  recipientName: string | null;
  baseUrl: string;
  timeZone: string;
  generatedAt: string;
  /** caseKey -> id do caso registrado (os quatro botões de cada ocorrência levam ao caso). */
  caseIdByKey?: ReadonlyMap<string, string>;
  logos?: AlertLogoAvailability;
  /** caseId -> atalhos "Responder por e-mail" do ITEM (token próprio por ocorrência). */
  replyByEmailByCaseId?: ReadonlyMap<string, ReplyMailtoLinks>;
}

const DIGEST_STATE_LABEL: Record<DigestItem["state"], string> = { NEW: "Novo", CHANGED: "Alterado", OPEN: "Em aberto", CLOSED: "Encerrado" };

function digestOccurrence(item: DigestItem, input: DigestEmailInput): UniversalOccurrence {
  const caseId = input.caseIdByKey?.get(item.caseKey) ?? null;
  const { links, unavailableReasons } = buildCaseActionLinks(input.baseUrl, input.projectId, caseId);
  const url = buildProjectLink(input.baseUrl, input.projectId, item.slaActionId ? `acoes/${item.slaActionId}` : item.originPath);
  return {
    code: item.reference,
    projectName: input.projectName,
    areaLabel: slaAreaLabels[item.area],
    severity: RISK_LEVEL_TO_SEVERITY[item.riskLevel],
    title: item.title,
    description: item.summary,
    responsibleName: item.responsibleName,
    originalDeadline: item.deadlineAt ? formatDateTimeBR(item.deadlineAt, input.timeZone) : null,
    stateLabel: DIGEST_STATE_LABEL[item.state],
    specialistLabel: specialistLabelFor(item.area),
    openUrl: url,
    actions: links,
    unavailableReasons,
    // Encerrado/concluído: tique verde no resumo NOVO (e-mails já entregues não se atualizam).
    completed: item.state === "CLOSED",
    replyByEmail: caseId && item.state !== "CLOSED" ? (input.replyByEmailByCaseId?.get(caseId) ?? null) : null,
  };
}

export function buildRiskDigestEmail(input: DigestEmailInput): BuiltEmail {
  const { content } = input;
  const [year, month, day] = content.window.split("-");
  const subject = `OBRA ${input.projectName.toUpperCase()} - CONSOLIDADO SEMANAL DE RISCOS BAIXO/MÉDIO (${day}/${month}/${year})`;
  const summary = `${content.mediumItems.length} risco(s) MÉDIO(S), ${content.lowItems.length} risco(s) BAIXO(S) em aberto; ${content.closedItems.length} encerrado(s) desde o último consolidado.`;
  const occurrences = [...content.mediumItems, ...content.lowItems, ...content.closedItems].map((item) => digestOccurrence(item, input));
  const built = buildUniversalDigestEmail({
    recipientName: input.recipientName,
    projectName: input.projectName,
    summaryLine: summary,
    windowLabel: `Janela: quarta-feira ${day}/${month}/${year} 07:00 (${input.timeZone}) · gerado em ${formatDateTimeBR(input.generatedAt, input.timeZone)}`,
    occurrences,
    logos: input.logos ?? DEFAULT_NO_LOGOS,
    footer: `Riscos BAIXO e MÉDIO não geram e-mail individual: são reunidos neste consolidado às quartas-feiras, 07:00 (${input.timeZone}). Alertas ALTO e CRÍTICO são enviados imediatamente. Cada ocorrência é tratada individualmente pelos seus quatro botões.`,
  });
  return toBuilt(built, subject);
}

// ------------------------------------------------------------------ acompanhamento na MESMA thread

export interface FollowUpEmailInput {
  kind: "FORWARD" | "RETURNED" | "EXPERT_ANSWER" | "ACTION_CONFIRMATION";
  projectId: string;
  projectName: string;
  recipientName: string | null;
  baseUrl: string;
  timeZone: string;
  generatedAt: string;
  caseId: string;
  caseTitle: string;
  riskLevel: SlaRiskLevel;
  visibleCode: string | null;
  /** Pares rótulo/valor específicos do tipo (responsável anterior/novo, prazo, instrução, recomendação...). */
  rows: Array<[string, string | null]>;
  /** Parágrafos livres (ex.: resposta do Expert — recomenda, não executa). */
  paragraphs?: string[];
  requiresHumanReview?: boolean;
  actionLinks?: Partial<Record<AlertActionType, string>>;
  /** Título alternativo (ex.: pedido de previsão de conclusão). */
  titleOverride?: string;
  /** Área do alerta (define o especialista); sem ela, consulta geral. */
  area?: SlaArea;
  logos?: AlertLogoAvailability;
  /** Atalhos "Responder por e-mail" (mailto com token POR ITEM já gravado). Ausente => sem atalhos. */
  replyByEmail?: ReplyMailtoLinks | null;
}

const FOLLOW_UP_TITLES: Record<FollowUpEmailInput["kind"], string> = {
  FORWARD: "Alerta encaminhado para você",
  RETURNED: "Alerta devolvido ao responsável anterior (sem ação do encaminhado)",
  EXPERT_ANSWER: "Resposta do Expert (recomendação — revisão humana)",
  ACTION_CONFIRMATION: "Ação registrada no alerta",
};

export function buildAlertFollowUpEmail(input: FollowUpEmailInput): BuiltEmail {
  const title = input.titleOverride ?? FOLLOW_UP_TITLES[input.kind];
  const severity = RISK_LEVEL_TO_SEVERITY[input.riskLevel];
  const codeTag = input.visibleCode ? ` [ACC-ALERTA:${input.visibleCode}]` : "";
  const subject = `${buildContractAlertSubject(input.projectName, severity)} - ${title.toUpperCase()}${codeTag}`;
  const alertUrl = buildProjectLink(input.baseUrl, input.projectId, `alertas/${input.caseId}`);
  const { links, unavailableReasons } = buildCaseActionLinks(input.baseUrl, input.projectId, input.caseId, input.actionLinks);
  const area = input.area ?? null;
  const occurrence: UniversalOccurrence = {
    code: input.visibleCode ?? input.caseId.slice(0, 8),
    projectName: input.projectName,
    areaLabel: area ? slaAreaLabels[area] : "—",
    severity,
    title,
    description: input.caseTitle,
    stateLabel: "Aberto",
    // "Responsável atual" vai no campo próprio da ocorrência (sem repetir na lista de detalhes).
    responsibleName: input.rows.find(([label]) => label === "Responsável atual")?.[1] ?? undefined,
    specialistLabel: area ? specialistLabelFor(area) : "Especialista (consulta geral)",
    openUrl: alertUrl,
    actions: links,
    unavailableReasons,
    details: [...input.rows.filter(([label]) => label !== "Responsável atual").map(([label, value]) => ({ label, value })), { label: "Gerado em", value: formatDateTimeBR(input.generatedAt, input.timeZone) }],
    notices: [
      ...(input.paragraphs ?? []),
      ...(input.requiresHumanReview ? ["O Expert apenas recomenda: nenhuma ação foi executada e o alerta continua aberto até decisão humana."] : []),
    ],
    replyInstruction: replyInstructionFor(input.riskLevel),
    replyByEmail: input.replyByEmail ?? null,
  };
  const built = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    occurrence,
    logos: input.logos ?? DEFAULT_NO_LOGOS,
    footer: "Mensagem gerada pelo ACC na conversa deste alerta. Você pode responder diretamente a este e-mail.",
  });
  return toBuilt(built, subject);
}
