// Configuração do canal WhatsApp. DESATIVADO por padrão e SOMENTE simulado: não existe provedor real nesta base.
// Habilitar exige ACC_WHATSAPP_ENABLED="true" (comparação estrita) E provedor "simulated"; qualquer outro valor de
// ACC_WHATSAPP_PROVIDER mantém o canal desligado (fail-closed) — nunca cai para um provedor real por engano.

export type WhatsappConfig =
  | { enabled: true; provider: "simulated" }
  | { enabled: false; reason: "DISABLED" | "PROVIDER_UNSUPPORTED" };

export function getWhatsappConfig(env: Record<string, string | undefined> = process.env): WhatsappConfig {
  if (env.ACC_WHATSAPP_ENABLED !== "true") return { enabled: false, reason: "DISABLED" };
  const provider = (env.ACC_WHATSAPP_PROVIDER ?? "simulated").trim();
  if (provider !== "simulated") return { enabled: false, reason: "PROVIDER_UNSUPPORTED" };
  return { enabled: true, provider: "simulated" };
}
