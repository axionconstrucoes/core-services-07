// Indicador "SISTEMA ... " do cabeçalho do Dashboard.
//
// Regra anterior: só ficava verde se TODAS as integrações estivessem
// CONECTADO; qualquer fonte PENDENTE (ex.: pasta ESG/SSMA ainda não
// configurada) mostrava "SISTEMA NÃO OPERACIONAL", como se o ACC
// estivesse fora do ar. Uma fonte pendente de configuração não é
// indisponibilidade do ACC.
//
// O que o selo MEDE: o estado das INTEGRAÇÕES (fontes de dados) da obra — não a disponibilidade da suíte ACC.
// Por isso os rótulos falam de integrações e nunca afirmam que o sistema está fora do ar.
//
// Regra atual (4 níveis):
//   OPERACIONAL      — "INTEGRAÇÕES ATIVAS": todas as fontes CONECTADO.
//   PARCIAL          — "INTEGRAÇÕES PARCIAIS": o ACC responde, mas há fonte PENDENTE ou em ATENCAO
//                      (configuração por concluir ou credencial a renovar); o selo nomeia a fonte.
//   FALHA            — "FALHA EM INTEGRAÇÃO": alguma fonte em ERRO (falha real daquela fonte).
//   SEM_INTEGRACOES  — "SEM INTEGRAÇÕES": nenhuma fonte conhecida para a obra.

import type { IntegrationStatusGroup } from "./resolve-integration-display-status";

export type SystemStatusLevel = "OPERACIONAL" | "PARCIAL" | "FALHA" | "SEM_INTEGRACOES";

export interface SystemStatus {
  level: SystemStatusLevel;
  /** Texto do selo, em maiúsculas. */
  label: string;
  /** Explicação curta, já com os nomes das fontes envolvidas ("" se operacional). */
  reason: string;
}

function names(labels: string[]): string {
  return labels.join(", ");
}

export function resolveSystemStatus(groups: IntegrationStatusGroup[]): SystemStatus {
  const total = groups.reduce((sum, group) => sum + group.count, 0);
  const by = (status: IntegrationStatusGroup["status"]) => groups.find((group) => group.status === status);

  if (total === 0) {
    return { level: "SEM_INTEGRACOES", label: "SEM INTEGRAÇÕES", reason: "Nenhuma integração conhecida para este projeto." };
  }

  const erro = by("ERRO");
  if (erro && erro.count > 0) {
    return { level: "FALHA", label: "FALHA EM INTEGRAÇÃO", reason: `Falha em: ${names(erro.labels)}.` };
  }

  const atencao = by("ATENCAO");
  const pendente = by("PENDENTE");
  const parts: string[] = [];
  if (atencao && atencao.count > 0) parts.push(`${names(atencao.labels)} requer atenção`);
  if (pendente && pendente.count > 0) parts.push(`${names(pendente.labels)} pendente`);

  if (parts.length === 0) {
    return { level: "OPERACIONAL", label: "INTEGRAÇÕES ATIVAS", reason: "" };
  }

  return { level: "PARCIAL", label: "INTEGRAÇÕES PARCIAIS", reason: `${parts.join("; ")}.` };
}
