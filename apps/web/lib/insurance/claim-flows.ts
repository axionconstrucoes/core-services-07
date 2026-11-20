// Fluxos SEPARADOS: seguradora x banco x emissor de caução/carta. Nenhum procedimento é presumido.
import type { InstrumentKind } from "./types";

export interface ClaimFlow {
  instrument: InstrumentKind;
  counterpart: "SEGURADORA" | "BANCO" | "EMISSOR";
  steps: string[];
  /** Presunções PROIBIDAS neste fluxo. */
  assumptions: { susepProcedurePresumed: false; firstDemandPresumed: false; legalDeadlinePresumed: false };
  mustReadInstrumentFirst: true;
  notes: string[];
}

const NO_ASSUME = { susepProcedurePresumed: false, firstDemandPresumed: false, legalDeadlinePresumed: false } as const;

export function claimFlowFor(instrument: InstrumentKind): ClaimFlow {
  if (instrument === "SEGURO") {
    return {
      instrument,
      counterpart: "SEGURADORA",
      steps: [
        "Conferir apólice vigente, versão e endossos CONFERIDOS (pedido/emissão não conferida não amplia cobertura)",
        "Registrar expectativa de sinistro apenas se contratualmente prevista",
        "Aviso de sinistro pelo canal oficial cadastrado, com protocolo",
        "Reclamação formal e documentação complementar quando solicitada",
        "Regulação pela seguradora",
        "Decisão: indenização/cumprimento ou negativa",
        "Em caso de negativa: contestação fundamentada",
      ],
      assumptions: NO_ASSUME,
      mustReadInstrumentFirst: true,
      notes: ["Prazos de aviso/manifestação/prescrição: conferir o texto da apólice e a lei aplicável (ver references.ts); não presumidos aqui."],
    };
  }
  const counterpart = instrument === "FIANCA_BANCARIA" ? "BANCO" : "EMISSOR";
  return {
    instrument,
    counterpart,
    steps: [
      "Ler o instrumento: cláusula de execução, exigências documentais, prazos, foro e forma de notificação",
      `Notificar o ${counterpart === "BANCO" ? "banco" : "emissor"} pelo canal cadastrado, conforme o instrumento`,
      "Cobrança/execução conforme o instrumento",
      "Registrar resposta, pagamento ou recusa e, se houver, contestar",
    ],
    assumptions: NO_ASSUME,
    mustReadInstrumentFirst: true,
    notes: [
      instrument === "FIANCA_BANCARIA"
        ? "Fiança bancária NÃO é seguro: não aplicar procedimento SUSEP de sinistro por presunção, nem pagamento à primeira demanda sem texto expresso."
        : "Caução / carta de fiança não bancária NÃO é seguro nem fiança bancária: seguir somente o instrumento.",
    ],
  };
}

export interface BankGuaranteeTerms {
  callsOnFirstDemand: boolean | null;
  claimProcedureNote?: string | null;
}
export function bankGuaranteeExecutionStatus(t: BankGuaranteeTerms): { firstDemand: "SIM_CONFORME_INSTRUMENTO" | "NAO_CONFORME_INSTRUMENTO" | "SEM_DADOS"; procedure: "REGISTRADO" | "SEM_DADOS" } {
  return {
    firstDemand: t.callsOnFirstDemand === null ? "SEM_DADOS" : t.callsOnFirstDemand ? "SIM_CONFORME_INSTRUMENTO" : "NAO_CONFORME_INSTRUMENTO",
    procedure: t.claimProcedureNote?.trim() ? "REGISTRADO" : "SEM_DADOS",
  };
}
