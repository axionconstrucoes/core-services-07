// Situação do PROVEDOR DE IA por Expert e rótulo "SIMULADA" — PURO (recebe o ambiente; nunca lê valores secretos nem os imprime).
//
// Regra de produto (Fase 6/H2c): resposta de provedor FAKE jamais é apresentada como análise real. Todo texto de
// Expert gerado por provedor que não é real sai com o rótulo SIMULADA (persistido no próprio texto, para que e-mail,
// histórico do caso e telas mostrem o mesmo aviso sem depender de coluna extra).
//
// Resolução do nome do provedor = mesma de resolve-provider-for-expert.ts (variável do Expert > AXION_AI_PROVIDER > "fake").
// "Real" = provedor "anthropic" COM ANTHROPIC_API_KEY e ANTHROPIC_MODEL presentes (sem eles o provedor falha fechado e
// nenhuma resposta é produzida — nunca cai em fake).

import { EXPERT_PROVIDER_ENV_VAR } from "../providers/resolve-provider-for-expert";
import type { OfficialExpertId } from "../expert-definitions/types";

export type EnvLike = Readonly<Record<string, string | undefined>>;

export type ExpertProviderState = "SIMULADO_FAKE" | "REAL_CONFIGURADO" | "REAL_INCOMPLETO" | "NAO_IMPLEMENTADO";

export interface ExpertProviderStatus {
  expertId: OfficialExpertId;
  providerName: string;
  /** De onde veio o nome (somente NOMES de variáveis — nunca valores secretos). */
  source: "ESPECIFICA" | "GLOBAL" | "PADRAO";
  specificVar: string;
  state: ExpertProviderState;
  /** Nomes (não valores) das variáveis obrigatórias ausentes quando o provedor real está incompleto. */
  missing: string[];
  /** true somente quando uma resposta REAL pode ser produzida. */
  isReal: boolean;
  label: string;
}

const REQUIRED_FOR_ANTHROPIC = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"] as const;
const present = (value: string | undefined) => value !== undefined && value.trim() !== "";

export function describeExpertProvider(expertId: OfficialExpertId, env: EnvLike): ExpertProviderStatus {
  const specificVar = EXPERT_PROVIDER_ENV_VAR[expertId];
  let raw = "fake";
  let source: ExpertProviderStatus["source"] = "PADRAO";
  if (present(env[specificVar])) {
    raw = env[specificVar]!;
    source = "ESPECIFICA";
  } else if (present(env.AXION_AI_PROVIDER)) {
    raw = env.AXION_AI_PROVIDER!;
    source = "GLOBAL";
  }
  const providerName = raw.trim().toLowerCase();
  if (providerName === "fake") {
    return { expertId, providerName, source, specificVar, state: "SIMULADO_FAKE", missing: [], isReal: false, label: "SIMULADA (provedor fake/teste)" };
  }
  if (providerName === "anthropic") {
    const missing = REQUIRED_FOR_ANTHROPIC.filter((name) => !present(env[name]));
    return missing.length === 0
      ? { expertId, providerName, source, specificVar, state: "REAL_CONFIGURADO", missing, isReal: true, label: "IA real (Anthropic) configurada" }
      : { expertId, providerName, source, specificVar, state: "REAL_INCOMPLETO", missing: [...missing], isReal: false, label: `IA real incompleta: faltam ${missing.join(", ")} — nenhuma resposta é produzida (falha fechada)` };
  }
  return { expertId, providerName, source, specificVar, state: "NAO_IMPLEMENTADO", missing: [], isReal: false, label: `Provedor "${providerName}" não implementado — nenhuma resposta é produzida` };
}

export const ALL_EXPERT_IDS: readonly OfficialExpertId[] = ["commercial-director", "esg-director", "ceo", "legal-consultant", "planning-director", "engineering-director", "quality-analyst"];

export function listExpertProviderStatus(env: EnvLike): ExpertProviderStatus[] {
  return ALL_EXPERT_IDS.map((id) => describeExpertProvider(id, env));
}

// ---------------------------------------------------------------- rótulo SIMULADA

export const SIMULATED_ANSWER_LABEL = "RESPOSTA SIMULADA — provedor de teste (fake); NÃO é análise real de IA.";
export const SIMULATED_SUBJECT_TAG = "[SIMULADA]";

/** Provedor que produz análise real (hoje só "anthropic"). Qualquer outro id é tratado como simulado. */
export function isRealProviderId(providerId: string | null | undefined): boolean {
  return (providerId ?? "").trim().toLowerCase() === "anthropic";
}

export function isSimulatedAnswerText(text: string | null | undefined): boolean {
  return (text ?? "").trimStart().startsWith(SIMULATED_ANSWER_LABEL);
}

/** Prefixa o rótulo quando NENHUM provedor real produziu a resposta; idempotente. Provedor real: texto intocado. */
export function labelAnswerForProvider(text: string, providerIds: ReadonlyArray<string | null | undefined>): string {
  const allReal = providerIds.length > 0 && providerIds.every(isRealProviderId);
  if (allReal || isSimulatedAnswerText(text)) return text;
  const mixed = providerIds.some(isRealProviderId);
  const label = mixed ? `${SIMULATED_ANSWER_LABEL} (parte desta resposta veio de provedor de teste)` : SIMULATED_ANSWER_LABEL;
  return `${label}\n\n${text}`;
}
