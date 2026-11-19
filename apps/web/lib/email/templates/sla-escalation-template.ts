// Template do e-mail de escalonamento (seção 12) — LAYOUT UNIVERSAL de alertas do ACC (universal-alert-template.ts):
// cabeçalho com o logotipo oficial e a cor da gravidade, conteúdo à esquerda e os quatro botões à direita
// (RESOLVIDO, EM ANDAMENTO, ENVIAR PARA, ESPECIALISTA). Só o desenho mudou: assunto, destinatários, conteúdo e as ações por
// token (preservadas como "Outras ações") continuam os mesmos.
//
// Escalonamento de SLA não pertence a um caso de risco com formulário de tratamento: os quatro botões ficam NO LAYOUT, porém
// desativados com o motivo visível (nunca simulam uma ação). O título abre a ação no ACC.
//
// Puro, sem I/O — deliberadamente sem "server-only" para ser testável
// tanto pelo bundler do Next.js quanto por um script Node standalone.

import type { AlertSeverity } from "@axion/types";

import { EMAIL_ALERT_ACTION_LABELS } from "@/lib/email-actions/types";
import type { EmailActionButton } from "@/lib/email-actions/render-buttons";
import type { AlertLogoAvailability } from "@/lib/email/templates/alert-box-style";
import { buildUniversalAlertEmail, type UniversalAction } from "@/lib/email/templates/universal-alert-template";

import { alertRiskLevelLabels, buildContractAlertSubject } from "./contract-alert-template";

export interface SlaEscalationEmailInput {
  recipientName: string | null;
  projectName: string;
  severity: AlertSeverity;
  actionTitle: string;
  currentResponsibleName: string | null;
  originalDeadline: string; // já formatado (ex.: "22/08/2026 14:00")
  overdueBy: string; // já formatado (ex.: "2h15min")
  previousLevelLabel: string;
  escalationLevelLabel: string; // ex.: "2º Escalão", "Diretoria"
  recommendedAction: string | null;
  eventUrl: string;
  // Ver contract-alert-template.ts — mesmo padrão, mesma infraestrutura
  // central, nunca duplicada.
  actionButtons: EmailActionButton[];
  /** Logotipos disponíveis como imagem embutida nesta execução (decidido pelo remetente). Ausente = cabeçalho sem imagem. */
  logos?: AlertLogoAvailability;
  /** Identificação curta da ação (ex.: início do id). Ausente = "—". */
  actionCode?: string | null;
}

export interface SlaEscalationEmail {
  subject: string;
  html: string;
  text: string;
  /** Imagens do logotipo que o HTML referencia por Content-ID. */
  logoNeeds: { maroon: boolean; inverted: boolean };
}

const FOOTER =
  "Este escalonamento foi gerado automaticamente pelo motor determinístico de SLA do ACC — não é uma decisão de IA. Você também pode responder diretamente a este e-mail (Responder do Gmail). Os botões abrem o ACC autenticado: nada é registrado, transferido ou concluído apenas pelo clique no e-mail.";

const UNAVAILABLE_REASON = "Abra a ação no ACC para tratar este escalonamento.";

export function buildSlaEscalationEmail(input: SlaEscalationEmailInput): SlaEscalationEmail {
  const riskLabel = alertRiskLevelLabels[input.severity];
  const unavailableReasons: Partial<Record<UniversalAction, string>> = {
    RESOLVIDO: UNAVAILABLE_REASON,
    EM_ANDAMENTO: UNAVAILABLE_REASON,
    ENVIAR_PARA: UNAVAILABLE_REASON,
    ESPECIALISTA: "Consulta ao especialista não disponível neste aviso; abra a ação no ACC.",
  };
  const built = buildUniversalAlertEmail({
    recipientName: input.recipientName,
    logos: input.logos ?? { maroon: false, inverted: false },
    footer: FOOTER,
    occurrence: {
      code: input.actionCode?.trim() || "—",
      projectName: input.projectName,
      areaLabel: "Escalonamento de ação (SLA)",
      severity: input.severity,
      headerLabel: `RISCO ${riskLabel} · ESCALONADO PARA ${input.escalationLevelLabel.toUpperCase()}`,
      title: `Ação sem resolução foi escalada: ${input.actionTitle}`,
      description: `A pendência não foi resolvida por ${input.previousLevelLabel} dentro do prazo e agora exige acompanhamento de ${input.escalationLevelLabel}.`,
      responsibleName: input.currentResponsibleName,
      originalDeadline: input.originalDeadline,
      stateLabel: `Escalonada — ${input.escalationLevelLabel}`,
      specialistLabel: "Especialista da área (consulta pelo ACC)",
      openUrl: input.eventUrl,
      actions: {},
      unavailableReasons,
      details: [
        { label: "Obra", value: input.projectName },
        { label: "Tempo excedido", value: input.overdueBy },
        { label: "Nível anterior", value: input.previousLevelLabel },
        { label: "Nível de escalonamento", value: input.escalationLevelLabel },
        { label: "Ação recomendada", value: input.recommendedAction },
      ],
      extraLinks: input.actionButtons.map((b) => ({ label: EMAIL_ALERT_ACTION_LABELS[b.action], url: b.url })),
    },
  });
  // Assunto preservado (o universal acrescenta área/título; o escalonamento sempre usou só o padrão institucional).
  return { subject: buildContractAlertSubject(input.projectName, input.severity), html: built.html, text: built.text, logoNeeds: built.logoNeeds };
}
