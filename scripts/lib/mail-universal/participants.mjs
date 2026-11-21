// Fase 5/A — participantes de uma mensagem (puro: sem rede/banco). Cobre From, To, Cc, Bcc (Gmail e Graph).
const ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

export function extractAddresses(value) {
  if (!value) return [];
  return [...new Set((String(value).match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
}

export function domainOf(address) {
  const parts = String(address ?? "").trim().toLowerCase().split("@");
  return parts.length === 2 && parts[1] ? parts[1] : null;
}

const uniq = (list) => [...new Set(list)];

/** @param {{from?:string[],to?:string[],cc?:string[],bcc?:string[]}} p */
export function involvedDomains(p) {
  return uniq([...(p.from ?? []), ...(p.to ?? []), ...(p.cc ?? []), ...(p.bcc ?? [])].map(domainOf).filter(Boolean)).sort();
}

/** Participantes a partir de cabeçalhos no formato Gmail ([{name,value}]). */
export function participantsFromGmailHeaders(headers) {
  const get = (name) => headers.find((h) => String(h.name ?? "").toLowerCase() === name)?.value ?? null;
  return { from: extractAddresses(get("from")), to: extractAddresses(get("to")), cc: extractAddresses(get("cc")), bcc: extractAddresses(get("bcc")) };
}

/** Domínio EXATO (sem subdomínio, sem sufixo): "weg.net" casa a@weg.net; não casa a@weg.net.exemplo, a@xweg.net, a@sub.weg.net. */
export function hasParticipantInDomain(participants, domain) {
  const target = String(domain).toLowerCase();
  return [...(participants.from ?? []), ...(participants.to ?? []), ...(participants.cc ?? []), ...(participants.bcc ?? [])]
    .some((address) => domainOf(address) === target);
}

/** Colunas extras de public.emails (migration 20261201100000). Só são enviadas quando ACC_EMAILS_PARTICIPANT_COLUMNS=1 (migration aplicada). */
export function participantColumns(participants, env = process.env) {
  if (env.ACC_EMAILS_PARTICIPANT_COLUMNS !== "1") return {};
  return { cc_addresses: participants.cc ?? [], bcc_addresses: participants.bcc ?? [], involved_domains: involvedDomains(participants) };
}
