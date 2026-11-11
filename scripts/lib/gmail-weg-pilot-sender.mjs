// Piloto WEG: remetente confirmado nas mensagens da Bruna Santelli Mancino.
export const WEG_PILOT_PROJECT = "00000000-0000-4000-8000-000000000001";
export const WEG_PILOT_SENDER = "bmancino@weg.net";

export function pilotSenderMatches(projectId, addresses) {
  if (projectId !== WEG_PILOT_PROJECT) return true;
  return addresses.length === 1 && String(addresses[0]).trim().toLowerCase() === WEG_PILOT_SENDER;
}

export function pilotSenderQuery(projectId) {
  return projectId === WEG_PILOT_PROJECT ? `from:${WEG_PILOT_SENDER}` : "";
}
