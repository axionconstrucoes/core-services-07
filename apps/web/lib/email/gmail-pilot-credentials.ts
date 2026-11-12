// Credenciais da identidade de envio do PROJETO PILOTO. Puro (sem I/O, sem "server-only") para ser testável sem rede.
//
// Isolamento opcional do cliente OAuth do piloto:
//   - GOOGLE_GMAIL_PILOT_CLIENT_ID + GOOGLE_GMAIL_PILOT_CLIENT_SECRET (AMBAS) => a identidade do piloto usa ESTE par de cliente
//     com GOOGLE_GMAIL_PILOT_REFRESH_TOKEN, sem depender do cliente compartilhado com o remetente padrão;
//   - só UMA delas definida => fail closed (configuração ambígua; nenhuma chamada de rede);
//   - nenhuma => comportamento anterior: cliente compartilhado GOOGLE_GMAIL_CLIENT_ID/SECRET.
// O remetente padrão (loadGmailConfig) nunca lê estas variáveis. Nenhum valor é incluído em mensagens de erro.

export interface GmailPilotSenderConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
  clientSource: "PILOT" | "SHARED";
}

type Env = Record<string, string | undefined>;

const present = (value: string | undefined) => typeof value === "string" && value.trim().length > 0;

export function resolveGmailPilotSenderConfig(expectedSender: string, env: Env): GmailPilotSenderConfig {
  const pilotClientId = env.GOOGLE_GMAIL_PILOT_CLIENT_ID;
  const pilotClientSecret = env.GOOGLE_GMAIL_PILOT_CLIENT_SECRET;
  const hasPilotId = present(pilotClientId);
  const hasPilotSecret = present(pilotClientSecret);

  if (hasPilotId !== hasPilotSecret) {
    throw new Error(
      "Remetente do piloto não configurado — GOOGLE_GMAIL_PILOT_CLIENT_ID e GOOGLE_GMAIL_PILOT_CLIENT_SECRET precisam estar ambos definidos ou ambos ausentes (fail closed; sem fallback para o remetente padrão)."
    );
  }

  const clientSource: "PILOT" | "SHARED" = hasPilotId ? "PILOT" : "SHARED";
  const clientId = (hasPilotId ? pilotClientId : env.GOOGLE_GMAIL_CLIENT_ID)?.trim();
  const clientSecret = (hasPilotSecret ? pilotClientSecret : env.GOOGLE_GMAIL_CLIENT_SECRET)?.trim();
  const refreshToken = env.GOOGLE_GMAIL_PILOT_REFRESH_TOKEN?.trim();
  const senderEmail = (env.GOOGLE_GMAIL_PILOT_SENDER_EMAIL ?? "").trim().toLowerCase();

  const missing: string[] = [];
  if (!clientId) missing.push(clientSource === "PILOT" ? "GOOGLE_GMAIL_PILOT_CLIENT_ID" : "GOOGLE_GMAIL_CLIENT_ID");
  if (!clientSecret) missing.push(clientSource === "PILOT" ? "GOOGLE_GMAIL_PILOT_CLIENT_SECRET" : "GOOGLE_GMAIL_CLIENT_SECRET");
  if (!refreshToken) missing.push("GOOGLE_GMAIL_PILOT_REFRESH_TOKEN");
  if (!senderEmail) missing.push("GOOGLE_GMAIL_PILOT_SENDER_EMAIL");
  if (missing.length > 0) {
    throw new Error(`Remetente do piloto não configurado — variáveis ausentes: ${missing.join(", ")} (fail closed; sem fallback para o remetente padrão).`);
  }
  if (senderEmail !== expectedSender.trim().toLowerCase()) {
    throw new Error("GOOGLE_GMAIL_PILOT_SENDER_EMAIL diferente do remetente autorizado do piloto (fail closed).");
  }
  return { clientId: clientId!, clientSecret: clientSecret!, refreshToken: refreshToken!, senderEmail, clientSource };
}
