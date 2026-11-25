// Rótulos das etapas do evento conforme o INSTRUMENTO (Fase 3 / E): fiança bancária, caução e carta de fiança NÃO seguem o procedimento da
// seguradora. A máquina de estados do banco é única (insurance_claim_transition_allowed), mas os termos exibidos não podem sugerir
// "regulação pela seguradora" para um banco/emissor. Seguro (ou instrumento ausente) mantém os rótulos originais. Puro, sem I/O.
import { CLAIM_STAGE_LABEL } from "./labels";

export type ClaimInstrumentKind = "SEGURO" | "FIANCA_BANCARIA" | "CAUCAO" | "CARTA_FIANCA_NAO_BANCARIA" | "OUTRA_GARANTIA" | "SEM_INSTRUMENTO";

function counterpart(kind: ClaimInstrumentKind): string {
  return kind === "FIANCA_BANCARIA" ? "o banco" : "o emissor";
}

/** Rótulo da etapa para o instrumento do evento. Seguro/instrumento ausente: rótulo padrão (seguradora). */
export function claimStageLabelFor(stage: string, kind: ClaimInstrumentKind): string {
  if (kind === "SEGURO" || kind === "SEM_INSTRUMENTO") return CLAIM_STAGE_LABEL[stage] ?? stage;
  const who = counterpart(kind);
  const map: Record<string, string> = {
    EXPECTATIVA: "Expectativa de acionamento (somente se o instrumento prevê)",
    AVISO: `Notificação a${who === "o banco" ? "o banco" : "o emissor"}`,
    RECLAMACAO: "Cobrança / pedido de execução do instrumento",
    DOC_COMPLEMENTAR: "Documentação complementar exigida pelo instrumento",
    REGULACAO: `Análise por parte d${who}`,
    DECISAO: `Resposta d${who}`,
    INDENIZACAO_CUMPRIMENTO: "Pagamento / cumprimento",
    NEGATIVA: "Recusa",
    CONTESTACAO: "Contestação",
    ENCERRADO: "Encerrado",
  };
  return map[stage] ?? CLAIM_STAGE_LABEL[stage] ?? stage;
}
