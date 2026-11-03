// Provedor SIMULADO de WhatsApp: nunca abre conexão, nunca lê credencial. Só devolve um identificador determinístico e
// guarda as mensagens em memória (útil nos testes). Não existe provedor real nesta base.

export interface WhatsappMessage {
  to: string;
  text: string;
  idempotencyKey: string;
}

export interface WhatsappSendResult {
  provider: "simulated";
  status: "SIMULATED";
  providerMessageId: string;
}

export interface WhatsappProvider {
  dispatch(message: WhatsappMessage): Promise<WhatsappSendResult>;
}

export class SimulatedWhatsappProvider implements WhatsappProvider {
  readonly sent: WhatsappMessage[] = [];

  async dispatch(message: WhatsappMessage): Promise<WhatsappSendResult> {
    this.sent.push(message);
    return { provider: "simulated", status: "SIMULATED", providerMessageId: `simulated:${message.idempotencyKey}` };
  }
}
