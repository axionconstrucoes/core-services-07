// Serialização (pura) do contexto comercial para o Expert e utilitários
// de rastreabilidade de números. Nenhum valor é transformado: o texto
// repete o valor exatamente como carregado, sempre com o id da fonte.

import { COMMERCIAL_DATA_NOT_AVAILABLE_TEXT, type CommercialContext, type CommercialContextItem } from "./types";

const AVAILABILITY_LABEL: Record<CommercialContextItem["availability"], string> = {
  DISPONIVEL: "DISPONÍVEL",
  SEM_REGISTRO_NA_OBRA: "SEM REGISTRO NESTA OBRA",
  NAO_DISPONIVEL_NO_ACC: COMMERCIAL_DATA_NOT_AVAILABLE_TEXT.toUpperCase(),
  SEM_AUTORIZACAO: "SEM AUTORIZAÇÃO DE ACESSO",
  ERRO_DE_CONSULTA: "ERRO DE CONSULTA (não interpretar como zero)",
};

function formatSource(item: CommercialContextItem): string {
  if (!item.source) return "sem fonte";
  const locator = item.source.locator ? `; ${item.source.locator}` : "";
  return `${item.source.table}#${item.source.recordId}.${item.source.field}${locator}`;
}

function formatValue(item: CommercialContextItem): string {
  if (item.value === null) return "—";
  if (typeof item.value === "number") {
    const suffix = item.unit === "BRL" ? " (R$)" : item.unit === "PERCENT" ? " (%)" : item.unit === "DAYS" ? " dias" : "";
    return `${item.value}${suffix}`;
  }
  return item.value;
}

/** Bloco textual para o Expert — cada linha cita o id (COM-n) que deve ser usado como fonte. */
export function formatCommercialContextForPrompt(context: CommercialContext): string {
  const lines = [
    "CONTEXTO COMERCIAL × ORÇAMENTOS (somente leitura; cite o id COM-n como fonte de qualquer número):",
    `Acesso: ${context.access.status} — ${context.access.reason}`,
  ];
  for (const item of context.items) {
    lines.push(
      `- [${item.id}] ${item.label} | ${AVAILABILITY_LABEL[item.availability]} | valor: ${formatValue(item)} | fonte: ${formatSource(item)}` +
        (item.note ? ` | obs.: ${item.note}` : "")
    );
  }
  if (context.missingEconomicKeys.length > 0) {
    lines.push(
      `Dados econômicos ausentes (${context.missingEconomicKeys.join(", ")}): nenhuma concessão pode ser declarada economicamente aceitável — solicitar análise de Orçamentos.`
    );
  }
  return lines.join("\n");
}

/** Itens numéricos DISPONÍVEIS — os únicos números que o Expert pode citar como dado. */
export function collectCitableCommercialNumbers(context: CommercialContext): Map<string, CommercialContextItem> {
  const result = new Map<string, CommercialContextItem>();
  for (const item of context.items) {
    if (item.availability === "DISPONIVEL" && typeof item.value === "number" && item.source) {
      result.set(item.id, item);
    }
  }
  return result;
}

export function hasAvailableEconomicBasis(context: CommercialContext): boolean {
  return context.missingEconomicKeys.length === 0;
}
