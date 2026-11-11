// Piloto WEG: todos os remetentes do domínio exato weg.net.
export const WEG_PILOT_PROJECT = "00000000-0000-4000-8000-000000000001";
export const WEG_PILOT_DOMAIN = "weg.net";

export function pilotSenderMatches(projectId, addresses) {
  if (projectId !== WEG_PILOT_PROJECT) return true;
  return addresses.length === 1 && /^[^\s@]+@weg\.net$/i.test(String(addresses[0]).trim());
}

export function pilotMessageEligible(projectId, policy) {
  return projectId === WEG_PILOT_PROJECT ? pilotSenderMatches(projectId, policy.from) : policy.eligible;
}

export function pilotSenderQuery(projectId) {
  return projectId === WEG_PILOT_PROJECT ? `from:${WEG_PILOT_DOMAIN}` : "";
}
