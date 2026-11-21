// Piloto WEG (Fase 5/A): TODA mensagem acessível nas caixas autorizadas em que o domínio EXATO weg.net aparece em
// qualquer participante (From, To, Cc, Bcc) entra na amostra — recebidas, enviadas, cópias e threads. Sem filtro por
// palavra-chave. Fase 6/H3: weg.net E subdomínios legítimos (*.weg.net, fronteira de domínio) contam; "weg.net.exemplo", "evilweg.net" e "weg.net.evil.com" NÃO.
// Estas funções só decidem LEITURA; as travas de ENVIO (only-recipient-guard, pilot-outbound-guard) são outros arquivos e não foram tocadas.
export const WEG_PILOT_PROJECT = "00000000-0000-4000-8000-000000000001";
export const WEG_PILOT_DOMAIN = "weg.net";

const WEG_ADDRESS = /^[^\s@]+@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*weg\.net$/i;

/** Verdadeiro se QUALQUER endereço da lista pertence ao domínio exato weg.net. Outros projetos: sem restrição aqui. */
export function pilotSenderMatches(projectId, addresses) {
  if (projectId !== WEG_PILOT_PROJECT) return true;
  return (addresses ?? []).some((address) => WEG_ADDRESS.test(String(address).trim()));
}

/** Todos os participantes de uma política de mensagem (from + recipients[to+cc+bcc] + cc/bcc explícitos quando houver). */
export function policyParticipants(policy) {
  return [...(policy?.from ?? []), ...(policy?.recipients ?? []), ...(policy?.cc ?? []), ...(policy?.bcc ?? [])];
}

export function pilotMessageEligible(projectId, policy) {
  return projectId === WEG_PILOT_PROJECT ? pilotSenderMatches(projectId, policyParticipants(policy)) : policy.eligible;
}

/** No piloto WEG a seleção NÃO usa palavra-chave/assunto aprovado: o participante @weg.net é o único critério. */
export function pilotScopeBypass(projectId) {
  return projectId === WEG_PILOT_PROJECT;
}

/** Termos (sem chaves) do Gmail: o domínio em From, To, Cc ou Bcc. Para outros projetos devolve o filtro padrão recebido. */
export function pilotSenderTerms(projectId, defaultTerms = "") {
  return projectId === WEG_PILOT_PROJECT ? ["from", "to", "cc", "bcc"].map((field) => field + ":" + WEG_PILOT_DOMAIN).join(" ") : defaultTerms;
}

/** Consulta do Gmail com chaves (OR). A conferência real dos cabeçalhos continua em pilotMessageEligible. */
export function pilotSenderQuery(projectId) {
  return projectId === WEG_PILOT_PROJECT ? "{" + pilotSenderTerms(projectId) + "}" : "";
}
