// Manifesto — FASE 3 / C: endossos com dupla conferência humana independente (aba Endossos). Arquivo NOVO; entra em ./seguros.ts por UMA linha.
import type { HelpManifest } from "../types";

const ROUTE = "/[projectId]/seguros";

export const SEGUROS_ENDOSSOS_DUPLA_ELEMENTS: HelpManifest["elements"] = [
  { route: ROUTE, tab: "Endossos", kind: "field", label: "O que o endosso altera (classificação)", helpId: "seguros.endossos.campo-classificacao" },
  { route: ROUTE, tab: "Endossos", kind: "field", label: "Itens que o texto emitido altera", helpId: "seguros.endossos.campo-classificacao-emissao" },
  { route: ROUTE, tab: "Endossos", kind: "message", label: "Conferência humana independente", helpId: "seguros.endossos.conferencias" },
  { route: ROUTE, tab: "Endossos", kind: "status", label: "Dupla conferência exigida, simples ou histórica", helpId: "seguros.endossos.status-dupla" },
  { route: ROUTE, tab: "Endossos", kind: "table", label: "Coluna: conferências", helpId: "seguros.endossos.coluna-conferencias" },
  { route: ROUTE, tab: "Endossos", kind: "button", label: "Formulário: recusar a conferência", helpId: "seguros.endossos.form-conferencia-recusa" },
  { route: ROUTE, tab: "Endossos", kind: "field", label: "Motivo da recusa da conferência", helpId: "seguros.endossos.campo-nota-recusa-conferencia" },
  { route: ROUTE, tab: "Endossos", kind: "button", label: "Recusar conferência (abrir)", helpId: "seguros.acoes.endosso-conferencia-recusar-abrir" },
  { route: ROUTE, tab: "Endossos", kind: "button", label: "Registrar recusa da conferência", helpId: "seguros.acoes.endosso-conferencia-recusar" },
];
