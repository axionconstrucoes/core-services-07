// Caso de TESTE do piloto: identificado por convenção no próprio registro (sem coluna nova, sem migration).
//   - title começa com "[TESTE PILOTO]"
//   - reference começa com "TESTE-PILOTO"
// Um caso é de teste se QUALQUER das duas marcas estiver presente (mais seguro: nunca contar como real um caso marcado).
// Efeito: aparece com o rótulo "TESTE" nos painéis/detalhe e fica FORA de indicadores, contagens, consolidados e
// planejamento/escalonamento do ciclo recorrente. Casos reais (qualquer outro title/reference) nunca são afetados.

export const PILOT_TEST_CASE_TITLE_PREFIX = "[TESTE PILOTO]";
export const PILOT_TEST_CASE_REFERENCE_PREFIX = "TESTE-PILOTO";
export const PILOT_TEST_CASE_LABEL = "TESTE";

export interface PilotTestCaseCandidate {
  title?: string | null;
  reference?: string | null;
}

export function isPilotTestCase(candidate: PilotTestCaseCandidate | null | undefined): boolean {
  if (!candidate) return false;
  const title = (candidate.title ?? "").trimStart().toUpperCase();
  const reference = (candidate.reference ?? "").trimStart().toUpperCase();
  return title.startsWith(PILOT_TEST_CASE_TITLE_PREFIX) || reference.startsWith(PILOT_TEST_CASE_REFERENCE_PREFIX);
}
