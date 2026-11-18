// Intenções operacionais recebidas pelo próprio e-mail.
// Análise pura e conservadora: nunca muda responsável, estado ou SLA.
// Operações sensíveis exigem confirmação/validação antes da aplicação.
export type EmailOperationalIntent =
  | "RESOLVE"
  | "TRANSFER"
  | "BLOCKED"
  | "STATUS"
  | "FORECAST_UPDATE"
  | "EVIDENCE"
  | "UNDETERMINED";

export interface EmailIntentAssessment {
  intent: EmailOperationalIntent;
  requiresReview: boolean;
  reason: string;
}

/**
 * Recebe apenas o texto novo já isolado por parseReplyBody, sem assunto,
 * citações ou assinatura. Evita executar comandos presentes no histórico.
 */
export function assessOperationalEmailIntent(cleanText: string): EmailIntentAssessment {
  const text = cleanText.normalize("NFC").trim();
  if (!text) return { intent: "UNDETERMINED", requiresReview: true, reason: "Resposta vazia" };

  const resolve = /\b(resolvid[oa]|conclu[íi]d[oa]|finalizad[oa]|pend[êe]ncia encerrada|problema solucionado)\b/i.test(text);
  const transfer = /\b(encaminh(?:o|ar|ei|ad[oa])|transfer(?:ir|ido|ida|ência)|reatribuir|novo respons[áa]vel|passar para)\b/i.test(text);
  const blocked = /\b(impediment[oa]|bloquead[oa]|n[ãa]o consigo|dependemos de|aguardando libera[çc][ãa]o)\b/i.test(text);
  const evidence = /\b(anex[oa]|evid[êe]ncia|foto(?:grafia)?s?|comprovante|documento anexado)\b/i.test(text);
  const forecast = /\b(nova previs[ãa]o|previs[ãa]o atualizada|alter(?:o|ar|amos) a previs[ãa]o|nova data de conclus[ãa]o)\b/i.test(text);
  const status = /\b(em andamento|providenciando|em execu[çc][ãa]o|iniciado|tratando)\b/i.test(text);
  const detected: EmailOperationalIntent[] = [];
  if (resolve) detected.push("RESOLVE");
  if (transfer) detected.push("TRANSFER");
  if (blocked) detected.push("BLOCKED");
  if (evidence) detected.push("EVIDENCE");
  if (forecast) detected.push("FORECAST_UPDATE");
  if (status) detected.push("STATUS");

  // Várias ações podem coexistir na resposta. Não presumir uma ação destrutiva
  // nem perder informação: revisão por pessoa autorizada.
  if (detected.length > 1) {
    return { intent: "UNDETERMINED", requiresReview: true, reason: "Múltiplas intenções operacionais" };
  }
  if (detected.length === 0) {
    return { intent: "UNDETERMINED", requiresReview: false, reason: "Sem comando operacional explícito" };
  }
  const intent = detected[0];
  if (intent === "STATUS") return { intent, requiresReview: false, reason: "Atualização de andamento" };
  if (intent === "FORECAST_UPDATE") return { intent, requiresReview: false, reason: "Atualização de previsão; exigir validação de data" };
  return { intent, requiresReview: true, reason: "Operação exige validação de permissão e registro específico" };
}
