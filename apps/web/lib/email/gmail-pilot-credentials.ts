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

// ------------------------------------------------------------------
// Identidade de envio POR REMETENTE (modelo de entrega direta do piloto).
//   - crm@axion.com.br (institucional): mesma configuração de sempre do piloto (resolveGmailPilotSenderConfig).
//   - participante autorizado (reynaldo/jaime.ramos/carlos.evandro): credencial PRÓPRIA da pessoa, consentida por ela —
//     GOOGLE_GMAIL_PILOT_USER_<CHAVE>_REFRESH_TOKEN, onde CHAVE = parte local do endereço em maiúsculas com não-alfanuméricos → "_"
//     (ex.: jaime.ramos@ → GOOGLE_GMAIL_PILOT_USER_JAIME_RAMOS_REFRESH_TOKEN). Exige o par de cliente do piloto (ID e SECRET).
// Sem credencial válida a função LANÇA: o chamador bloqueia o envio antes da rede. NUNCA há fallback para outra identidade.
// ------------------------------------------------------------------
import { ACC_PILOT_INSTITUTIONAL_ADDRESS, PILOT_PARTICIPANT_ADDRESSES } from "./project-pilot-profile";

export function pilotParticipantEnvKey(email: string): string {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  return local.replace(/[^a-z0-9]+/g, "_").toUpperCase();
}

export function pilotParticipantRefreshTokenEnvName(email: string): string {
  return `GOOGLE_GMAIL_PILOT_USER_${pilotParticipantEnvKey(email)}_REFRESH_TOKEN`;
}

export function resolveGmailPilotIdentityConfig(sender: string, env: Env): GmailPilotSenderConfig {
  const wanted = sender.trim().toLowerCase();
  if (wanted === ACC_PILOT_INSTITUTIONAL_ADDRESS) return resolveGmailPilotSenderConfig(wanted, env);
  if (!(PILOT_PARTICIPANT_ADDRESSES as readonly string[]).includes(wanted)) {
    throw new Error("Remetente fora das identidades autorizadas do piloto (fail closed).");
  }
  const clientId = env.GOOGLE_GMAIL_PILOT_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_GMAIL_PILOT_CLIENT_SECRET?.trim();
  const tokenName = pilotParticipantRefreshTokenEnvName(wanted);
  const refreshToken = env[tokenName]?.trim();
  const missing: string[] = [];
  if (!present(clientId)) missing.push("GOOGLE_GMAIL_PILOT_CLIENT_ID");
  if (!present(clientSecret)) missing.push("GOOGLE_GMAIL_PILOT_CLIENT_SECRET");
  if (!present(refreshToken)) missing.push(tokenName);
  if (missing.length > 0) {
    throw new Error(`Identidade de envio do participante não configurada — variáveis ausentes: ${missing.join(", ")} (fail closed; sem fallback para outra identidade).`);
  }
  return { clientId: clientId!, clientSecret: clientSecret!, refreshToken: refreshToken!, senderEmail: wanted, clientSource: "PILOT" };
}
