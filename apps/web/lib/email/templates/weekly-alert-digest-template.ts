import type { AlertLogoAvailability } from "./alert-box-style";
import { buildUniversalDigestEmail } from "./universal-alert-template";

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
  logos?: AlertLogoAvailability;
}

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
  const greeting = input.recipientName ? `Olá, ${input.recipientName}.` : "Olá.";
  const subject = `🔵 [RESUMO SEMANAL] RISCOS MÉDIOS E BAIXOS · ACC · OBRA ${input.projectName.toUpperCase()}`;

  const summary = `${mediumCount} risco(s) médio(s) e ${lowCount} risco(s) baixo(s).`;
  const built = buildUniversalDigestEmail({
    recipientName: input.recipientName,
    projectName: input.projectName,
    heading: `Resumo semanal — ${input.projectName}`,
    summaryLine: summary,
    windowLabel: "Todos os itens precisam de uma resposta para concluir o resumo.",
    logos: input.logos ?? { maroon: false, inverted: false },
    responseLink: { label: "Responder todos os itens no ACC", url: input.responseUrl },
    footer: "Opções disponíveis: Ciente, Estudando solução, Resolvido ou Direcionar para outra pessoa. O direcionamento não altera os prazos nem o escalonamento.",
    occurrences: items.map((item) => ({
      code: item.actionId.slice(0, 8).toUpperCase(),
      projectName: input.projectName,
      areaLabel: "Resumo semanal",
      severity: item.riskLevel === "MEDIUM" ? "MEDIA" : "BAIXA",
      title: item.title,
      description: item.description,
      originalDeadline: item.dueAt,
      responsibleName: "",
      stateLabel: "Aguardando resposta",
      specialistLabel: "Especialista da área",
      openUrl: input.responseUrl,
      actions: {},
    })),
  });

  const textItems = items.map((item, index) => {
    const risk = item.riskLevel === "MEDIUM" ? "MÉDIO" : "BAIXO";
    return `${index + 1}. [RISCO ${risk}] ${item.title}${item.description ? ` — ${item.description}` : ""}${item.dueAt ? ` — Prazo: ${item.dueAt}` : ""}`;
  });

  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    "",
    greeting,
    `Resumo semanal — ${input.projectName}`,
    `${mediumCount} risco(s) médio(s) e ${lowCount} risco(s) baixo(s).`,
    "",
    ...textItems,
    "",
    "Responda todos os itens no ACC:",
    input.responseUrl,
    "",
    "Opções: Ciente, Estudando solução, Resolvido ou Direcionar para outra pessoa.",
    "O direcionamento não altera os prazos nem o escalonamento.",
  ].join("\n");

  return { ...built, subject, text, mediumCount, lowCount };
}
