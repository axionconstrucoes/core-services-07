// Conteúdo (puro) dos e-mails de registro crítico e de ação corretiva em atraso. Sem I/O.
// Diferencia FATO (o que foi registrado), PRAZO/ESTADO (dados do sistema) e a necessidade de revisão humana.

import { alertRiskLevelLabels, BADGE_STYLES, buildContractAlertSubject } from "@/lib/email/templates/contract-alert-template";
import type { MailContent } from "./core";

export interface FieldNotificationContext {
  projectName: string;
  recipientName: string | null;
  category: string;
  location: string;
  description: string;
  occurredAt: string; // já formatado (pt-BR, America/Sao_Paulo)
  reportedByName: string;
  accUrl: string;
  /** Somente ACTION_OVERDUE */
  dueDate?: string; // já formatado dd/mm/aaaa
  daysOverdue?: number;
  responsibleName?: string | null;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clip = (v: string, n = 400) => (v.length > n ? `${v.slice(0, n - 1)}…` : v);

function build(kind: "CRITICAL_RECORD" | "ACTION_OVERDUE", ctx: FieldNotificationContext): MailContent {
  const severity = kind === "CRITICAL_RECORD" ? "CRITICA" : "ALTA";
  const badge = BADGE_STYLES[severity];
  const riskLabel = alertRiskLevelLabels[severity];
  const title = kind === "CRITICAL_RECORD" ? "REGISTRO CRÍTICO DE CAMPO · SSMA" : "AÇÃO CORRETIVA EM ATRASO · SSMA";
  const subject = `${kind === "CRITICAL_RECORD" ? "Registro crítico de campo" : "Ação corretiva em atraso"} — ${buildContractAlertSubject(ctx.projectName, severity)}`;
  const greeting = ctx.recipientName ? `Olá, ${ctx.recipientName}.` : "Olá.";
  const lead = kind === "CRITICAL_RECORD"
    ? `Foi registrado, em campo, um registro de risco CRÍTICO na obra ${ctx.projectName}.`
    : `A ação corretiva do registro abaixo, na obra ${ctx.projectName}, está com o prazo vencido e não foi concluída.`;
  const facts: Array<[string, string]> = [
    ["Categoria", ctx.category],
    ["Local", ctx.location],
    ["Fato registrado em", ctx.occurredAt],
    ["Registrado por", ctx.reportedByName],
    ["Descrição (como informada)", clip(ctx.description)],
  ];
  if (kind === "ACTION_OVERDUE") {
    facts.push(["Prazo da ação", ctx.dueDate ?? "—"], ["Dias de atraso", String(ctx.daysOverdue ?? "—")], ["Responsável", ctx.responsibleName ?? "não definido"]);
  }
  const footer = "Comunicação automática determinística do ACC. Os dados acima são o registro original; a avaliação do risco e as providências exigem revisão humana.";
  const text = [
    "ACC · AXION CONTROLE DE CONTRATOS",
    `RISCO ${riskLabel} · ${title}`,
    "",
    greeting,
    lead,
    ...facts.map(([k, v]) => `${k}: ${v}`),
    "",
    `ABRIR NO ACC: ${ctx.accUrl}`,
    "",
    footer,
  ].join("\n");
  const rows = facts.map(([k, v]) => `<tr><td style="vertical-align:top"><strong>${esc(k)}</strong></td><td style="padding-left:12px">${esc(v)}</td></tr>`).join("");
  const html = `<table role="presentation" width="100%" style="background:#fff;color:#000;padding:24px"><tr><td><p style="color:#000;font-weight:700">ACC · AXION CONTROLE DE CONTRATOS</p><p><span style="display:inline-block;background:${badge.background};color:${badge.color};font-weight:700;padding:6px 12px;border-radius:999px">RISCO ${esc(riskLabel)} · ${esc(title)}</span></p><p style="color:#000">${esc(greeting)}</p><p style="color:#000">${esc(lead)}</p><table role="presentation" style="color:#000">${rows}</table><p><a href="${esc(ctx.accUrl)}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700">ABRIR NO ACC</a></p><p style="color:#6b7280;font-size:11px">${esc(footer)}</p></td></tr></table>`;
  return { subject, text, html };
}

export const buildCriticalRecordEmail = (ctx: FieldNotificationContext) => build("CRITICAL_RECORD", ctx);
export const buildOverdueActionEmail = (ctx: FieldNotificationContext) => build("ACTION_OVERDUE", ctx);
