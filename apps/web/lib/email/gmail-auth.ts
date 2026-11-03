import "server-only";

export type EmailProviderName = "fake" | "gmail";

export interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
}

// DEFAULT "fake" — nunca cai silenciosamente para fake se "gmail" foi
// explicitamente escolhido e a config estiver incompleta (ver loadGmailConfig).
export function resolveEmailProviderName(): EmailProviderName {
  const raw = (process.env.AXION_EMAIL_PROVIDER ?? "fake").trim().toLowerCase();

  if (raw === "fake" || raw === "gmail") {
    return raw;
  }

  throw new Error(
    `AXION_EMAIL_PROVIDER inválido: "${raw}". Valores permitidos: "fake" ou "gmail".`
  );
}

// FAIL CLOSED: lança erro imediatamente se qualquer variável estiver
// ausente — nunca completa parcialmente, nunca loga os valores.
export function loadGmailConfig(): GmailConfig {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_GMAIL_REFRESH_TOKEN;
  const senderEmail = process.env.GOOGLE_GMAIL_SENDER_EMAIL;

  const missing: string[] = [];
  if (!clientId) missing.push("GOOGLE_GMAIL_CLIENT_ID");
  if (!clientSecret) missing.push("GOOGLE_GMAIL_CLIENT_SECRET");
  if (!refreshToken) missing.push("GOOGLE_GMAIL_REFRESH_TOKEN");
  if (!senderEmail) missing.push("GOOGLE_GMAIL_SENDER_EMAIL");

  if (missing.length > 0) {
    throw new Error(
      `Configuração do GmailEmailProvider incompleta — variáveis ausentes: ${missing.join(", ")}. AXION_EMAIL_PROVIDER=gmail não pode operar sem configuração completa (fail closed).`
    );
  }

  return {
    clientId: clientId!,
    clientSecret: clientSecret!,
    refreshToken: refreshToken!,
    senderEmail: senderEmail!,
  };
}

// Identidade de envio do PROJETO PILOTO (project-pilot-profile.ts): OAuth de uma caixa que realmente pode enviar como o remetente
// institucional do piloto (a própria caixa dele). NUNCA há fallback para o remetente padrão nem troca só do cabeçalho From:
// sem esta configuração completa, a mensagem do projeto piloto não sai (fail closed). Outros projetos não usam estas variáveis.
export function loadGmailPilotSenderConfig(expectedSender: string): GmailConfig {
  const base = {
    clientId: process.env.GOOGLE_GMAIL_CLIENT_ID,
    clientSecret: process.env.GOOGLE_GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_GMAIL_PILOT_REFRESH_TOKEN,
    senderEmail: (process.env.GOOGLE_GMAIL_PILOT_SENDER_EMAIL ?? "").trim().toLowerCase(),
  };
  const missing: string[] = [];
  if (!base.clientId) missing.push("GOOGLE_GMAIL_CLIENT_ID");
  if (!base.clientSecret) missing.push("GOOGLE_GMAIL_CLIENT_SECRET");
  if (!base.refreshToken) missing.push("GOOGLE_GMAIL_PILOT_REFRESH_TOKEN");
  if (!base.senderEmail) missing.push("GOOGLE_GMAIL_PILOT_SENDER_EMAIL");
  if (missing.length > 0) {
    throw new Error(`Remetente do piloto não configurado — variáveis ausentes: ${missing.join(", ")} (fail closed; sem fallback para o remetente padrão).`);
  }
  if (base.senderEmail !== expectedSender.trim().toLowerCase()) {
    throw new Error("GOOGLE_GMAIL_PILOT_SENDER_EMAIL diferente do remetente autorizado do piloto (fail closed).");
  }
  return { clientId: base.clientId!, clientSecret: base.clientSecret!, refreshToken: base.refreshToken!, senderEmail: base.senderEmail };
}
