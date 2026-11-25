// Manifesto — FASE 4 / A: competências profissionais (painel na aba Auditoria). Arquivo NOVO; entra em ./seguros.ts por UMA linha.
import type { HelpManifest } from "../types";

const ROUTE = "/[projectId]/seguros";

export const SEGUROS_COMPETENCIAS_ELEMENTS: HelpManifest["elements"] = [
  { route: ROUTE, tab: "Auditoria", kind: "message", label: "Competências profissionais (painel)", helpId: "seguros.competencias.painel" },
  { route: ROUTE, tab: "Auditoria", kind: "message", label: "Minhas competências vigentes", helpId: "seguros.competencias.minhas" },
  { route: ROUTE, tab: "Auditoria", kind: "status", label: "Coluna: situação da competência", helpId: "seguros.competencias.coluna-situacao" },
  { route: ROUTE, tab: "Auditoria", kind: "table", label: "Coluna: registro profissional (declarado)", helpId: "seguros.competencias.coluna-registro" },
  { route: ROUTE, tab: "Auditoria", kind: "button", label: "Formulário: conceder competência", helpId: "seguros.competencias.form-conceder" },
  { route: ROUTE, tab: "Auditoria", kind: "field", label: "Pessoa (membro ativo)", helpId: "seguros.competencias.campo-pessoa" },
  { route: ROUTE, tab: "Auditoria", kind: "field", label: "Competência", helpId: "seguros.competencias.campo-competencia" },
  { route: ROUTE, tab: "Auditoria", kind: "field", label: "Validade da competência", helpId: "seguros.competencias.campo-validade" },
  { route: ROUTE, tab: "Auditoria", kind: "field", label: "Registro profissional (opcional)", helpId: "seguros.competencias.campo-registro" },
  { route: ROUTE, tab: "Auditoria", kind: "field", label: "Observação / base da concessão", helpId: "seguros.competencias.campo-observacao" },
  { route: ROUTE, tab: "Auditoria", kind: "button", label: "Conceder competência", helpId: "seguros.competencias.conceder" },
  { route: ROUTE, tab: "Auditoria", kind: "button", label: "Revogar (abrir)", helpId: "seguros.competencias.revogar-abrir" },
  { route: ROUTE, tab: "Auditoria", kind: "button", label: "Formulário: revogar competência", helpId: "seguros.competencias.form-revogar" },
  { route: ROUTE, tab: "Auditoria", kind: "field", label: "Motivo da revogação", helpId: "seguros.competencias.campo-motivo-revogacao" },
  { route: ROUTE, tab: "Auditoria", kind: "button", label: "Confirmar revogação", helpId: "seguros.competencias.revogar" },
];
