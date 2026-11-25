// Manifesto — FASE 4 / D: destinatário externo no cadastro de canal oficial (aba Canais oficiais). Arquivo NOVO; entra em ./seguros.ts por UMA linha.
import type { HelpManifest } from "../types";

const ROUTE = "/[projectId]/seguros";

export const SEGUROS_DESTINATARIOS_ELEMENTS: HelpManifest["elements"] = [
  { route: ROUTE, tab: "Canais oficiais", kind: "field", label: "Confirmo o destinatário externo", helpId: "seguros.canais.campo-confirmar-externo" },
  { route: ROUTE, tab: "Canais oficiais", kind: "field", label: "Motivo do canal externo", helpId: "seguros.canais.campo-motivo-externo" },
];
