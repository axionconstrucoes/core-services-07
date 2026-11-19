// Template puro do único resumo semanal de riscos MÉDIO e BAIXO — LAYOUT UNIVERSAL de alertas do ACC
// (universal-alert-template.ts): uma caixa por item, com cabeçalho/logotipo e os quatro botões.
// Formulários dentro de e-mail não são confiáveis entre clientes; por isso os botões RESOLVIDO, EM ANDAMENTO e
// ENVIAR PARA abrem a MESMA tela autenticada de resposta (Ciente, Estudando solução, Resolvido, Direcionar), que exige
// resposta de todos os itens antes do envio. Nada é registrado só pelo clique. ESPECIALISTA fica desativado com o motivo.

import type { AlertLogoAvailability } from "@/lib/email/templates/alert-box-style";
import { buildUniversalDigestEmail, type UniversalOccurrence } from "@/lib/email/templates/universal-alert-template";

export type WeeklyDigestRiskLevel = "MEDIUM" | "LOW";

export interface WeeklyAlertDigestItem {
  actionId: string;
  title: string;
  description: string;
  riskLevel: WeeklyDigestRiskLevel;
  dueAt: string | null;
}

export interface WeeklyAlertDigestEmailInput {
  recipientName: string | null;
  projectName: string;
  items: WeeklyAlertDigestItem[];
  responseUrl: string;
  /** Logotipos disponíveis como imagem embutida nesta execução (decidido pelo remetente). Ausente = cabeçalho sem imagem. */
  logos?: AlertLogoAvailability;
}

const RISK = {
  MEDIUM: { label: "MÉDIO", severity: "MEDIA" },
  LOW: { label: "BAIXO", severity: "BAIXA" },
} as const;

const SPECIALIST_UNAVAILABLE = "Consulta ao especialista não disponível neste resumo; abra o alerta no ACC.";

export function sortWeeklyDigestItems(items: WeeklyAlertDigestItem[]): WeeklyAlertDigestItem[] {
  return [...items].sort((a, b) => {
    const byRisk = (a.riskLevel === "MEDIUM" ? 0 : 1) - (b.riskLevel === "MEDIUM" ? 0 : 1);
    if (byRisk !== 0) return byRisk;
    return a.title.localeCompare(b.title, "pt-BR");
  });
}

export function buildWeeklyAlertDigestEmail(input: WeeklyAlertDigestEmailInput) {
  const items = sortWeeklyDigestItems(input.items);
  const mediumCount = items.filter((item) => item.riskLevel === "MEDIUM").length;
  const lowCount = items.length - mediumCount;
  // Assunto preservado.
  const subject = `🔵 [RESUMO SEMANAL] RISCOS MÉDIOS E BAIXOS · ACC · OBRA ${input.projectName.toUpperCase()}`;

  const occurrences: UniversalOccurrence[] = items.map((item, index) => ({
    code: item.actionId.slice(0, 8).toUpperCase(),
    projectName: input.projectName,
    areaLabel: "Resumo semanal",
    severity: RISK[item.riskLevel].severity,
    title: item.title,
    description: item.description || item.title,
    // O resumo é enviado ao responsável pelos itens.
    responsibleName: input.recipientName,
    originalDeadline: item.dueAt,
    stateLabel: "Aguardando resposta",
    specialistLabel: "Especialista da área (consulta pelo ACC)",
    openUrl: input.responseUrl,
    actions: { RESOLVIDO: input.responseUrl, EM_ANDAMENTO: input.responseUrl, ENVIAR_PARA: input.responseUrl },
    unavailableReasons: { ESPECIALISTA: SPECIALIST_UNAVAILABLE },
    notices: ["Opções na tela de resposta: Ciente, Estudando solução, Resolvido ou Direcionar para outra pessoa. O direcionamento não altera os prazos nem o escalonamento."],
    // Um único chamado textual para responder tudo (os botões de cada caixa abrem a mesma tela).
    extraLinks: index === 0 ? [{ label: "Responder todos os itens no ACC", url: input.responseUrl }] : [],
  }));

  const built = buildUniversalDigestEmail({
    recipientName: input.recipientName,
    projectName: input.projectName,
    summaryLine: `${mediumCount} risco(s) médio(s) e ${lowCount} risco(s) baixo(s). Todos precisam de uma resposta antes do envio.`,
    windowLabel: "Resumo semanal",
    occurrences,
    logos: input.logos ?? { maroon: false, inverted: false },
    footer: "Resumo semanal gerado pelo ACC. Responda todos os itens na tela autenticada do ACC: nada é registrado, transferido ou concluído apenas pelo clique no e-mail.",
  });

  return { subject, html: built.html, text: built.text, mediumCount, lowCount, logoNeeds: built.logoNeeds };
}
