// Coleta da caixa PRÓPRIA de um titular (ex.: planejador da obra) — regras PURAS: sem rede, sem banco, sem segredos.
//
// Diferente do Gmail Inbound Sync (que lê uma caixa e importa só o que vem do cliente), aqui a caixa é do
// titular e a coleta cobre os DOIS sentidos:
//   - RECEBIDOS: remetente único do domínio do cliente (mesma regra do piloto WEG: pilotSenderMatches);
//   - ENVIADOS pelo titular: com algum destinatário do cliente, OU com anexo .mpp e casamento de escopo da obra
//     (cronograma semanal enviado internamente).
// Somente leitura (gmail.readonly). Nada aqui envia, altera ou exclui mensagens.
//
// Credenciais por PREFIXO (slot neutro, sem nome de pessoa no repositório público):
//   <PREFIX>_MAILBOX, <PREFIX>_REFRESH_TOKEN e, opcionalmente, <PREFIX>_CLIENT_ID/_CLIENT_SECRET
//   (sem eles, usa o cliente OAuth compartilhado GOOGLE_GMAIL_OWNER_CLIENT_ID/_CLIENT_SECRET).

import crypto from "node:crypto";

export const OWNER_CHECKPOINT_ACTION = "GMAIL_OWNER_MAILBOX_CHECKPOINT";
export const OWNER_CHECKPOINT_ENTITY = "EMAIL_OWNER_MAILBOX";
export const DEFAULT_WINDOW_DAYS = 30;
export const INCREMENTAL_OVERLAP_MS = 10 * 60 * 1000;

export function normalizePrefix(value) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

/** Nomes das variáveis do slot. O cliente OAuth do slot tem precedência sobre o compartilhado. */
export function ownerCredentialNames(prefix, env = process.env) {
  const p = normalizePrefix(prefix);
  const own = { clientId: `${p}_CLIENT_ID`, clientSecret: `${p}_CLIENT_SECRET` };
  const useOwn = Boolean(env[own.clientId]?.trim() && env[own.clientSecret]?.trim());
  return {
    clientId: useOwn ? own.clientId : "GOOGLE_GMAIL_OWNER_CLIENT_ID",
    clientSecret: useOwn ? own.clientSecret : "GOOGLE_GMAIL_OWNER_CLIENT_SECRET",
    refreshToken: `${p}_REFRESH_TOKEN`,
    mailbox: `${p}_MAILBOX`,
  };
}

/** Lista o que falta (só NOMES de variáveis, nunca valores). Vazio = slot pronto. */
export function missingOwnerCredentials(prefix, env = process.env) {
  const names = ownerCredentialNames(prefix, env);
  return Object.values(names).filter((name) => !env[name]?.trim());
}

/** Identificador opaco para logs públicos (nunca o endereço). */
export function maskId(value) {
  return crypto.createHash("sha256").update(String(value ?? "").toLowerCase()).digest("hex").slice(0, 10);
}

function domainOf(address) {
  return String(address ?? "").split("@")[1]?.toLowerCase() ?? null;
}

/**
 * Consultas Gmail (somente leitura) para uma janela [afterEpoch, beforeEpoch).
 * RECEBIDOS: de cada domínio do cliente. ENVIADOS: para o cliente (To/Cc/Bcc) e enviados com .mpp.
 */
export function buildOwnerQueries({ clientDomains, afterEpoch, beforeEpoch }) {
  const domains = Array.from(clientDomains ?? []).map((d) => String(d).toLowerCase()).filter(Boolean).sort();
  if (domains.length === 0) throw new Error("Nenhum domínio de cliente configurado para a obra.");
  const window = `after:${afterEpoch} before:${beforeEpoch}`;
  const from = domains.map((d) => `from:${d}`).join(" ");
  const to = domains.flatMap((d) => [`to:${d}`, `cc:${d}`, `bcc:${d}`]).join(" ");
  return [
    { kind: "RECEIVED", q: `${window} {${from}}` },
    { kind: "SENT_TO_CLIENT", q: `${window} in:sent {${to}}` },
    { kind: "SENT_MPP", q: `${window} in:sent has:attachment filename:mpp` },
  ];
}

export function hasMppAttachment(attachmentNames = []) {
  return attachmentNames.some((name) => /\.mpp$/i.test(String(name ?? "").trim()));
}

/**
 * Classifica UMA mensagem da caixa do titular.
 * @returns {{ eligible: boolean, direction: "INBOUND"|"OUTBOUND", reason: string }}
 */
export function classifyOwnerMessage({ from = [], recipients = [], mailbox, clientDomains, attachmentNames = [], projectMatch = false }) {
  const owner = String(mailbox ?? "").toLowerCase();
  const clients = new Set(Array.from(clientDomains ?? []).map((d) => String(d).toLowerCase()));
  const outbound = from.map((a) => String(a).toLowerCase()).includes(owner);
  if (outbound) {
    const toClient = recipients.some((address) => clients.has(domainOf(address)));
    if (toClient) return { eligible: true, direction: "OUTBOUND", reason: "SENT_TO_CLIENT" };
    if (hasMppAttachment(attachmentNames) && projectMatch) return { eligible: true, direction: "OUTBOUND", reason: "SENT_MPP_IN_SCOPE" };
    return { eligible: false, direction: "OUTBOUND", reason: "SENT_OUT_OF_SCOPE" };
  }
  // Mesma regra do piloto: exatamente um remetente, do domínio do cliente.
  const single = from.length === 1 && clients.has(domainOf(from[0]));
  return single
    ? { eligible: true, direction: "INBOUND", reason: "RECEIVED_FROM_CLIENT" }
    : { eligible: false, direction: "INBOUND", reason: "RECEIVED_OUT_OF_SCOPE" };
}

/** Janelas consecutivas [start, end) de `days` dias, do início até `until`. */
export function planWindows(start, until, days = DEFAULT_WINDOW_DAYS) {
  const windows = [];
  const step = days * 24 * 3600 * 1000;
  let cursor = new Date(start).getTime();
  const end = new Date(until).getTime();
  if (!Number.isFinite(cursor) || !Number.isFinite(end)) throw new Error("Janela inválida.");
  while (cursor < end) {
    const next = Math.min(cursor + step, end);
    windows.push({ start: new Date(cursor), end: new Date(next) });
    cursor = next;
  }
  return windows;
}

/** Checkpoint gravado em audit_log_entries.detail: "mode=history;through=<ISO>". */
export function formatCheckpoint({ mode, through }) {
  return `mode=${mode};through=${new Date(through).toISOString()}`;
}

export function parseCheckpoint(detail) {
  const match = /mode=(history|incremental);through=([0-9T:.\-Z]+)/.exec(String(detail ?? ""));
  if (!match) return null;
  const through = new Date(match[2]);
  return Number.isNaN(through.getTime()) ? null : { mode: match[1], through };
}

/**
 * Início da leitura. history: checkpoint (retoma) ou --since. incremental: checkpoint − sobreposição;
 * sem checkpoint exige --since explícito (nunca lê "tudo" por acidente).
 */
export function resolveStart({ mode, checkpoint, since }) {
  if (checkpoint?.through) {
    const t = new Date(checkpoint.through).getTime();
    return new Date(mode === "incremental" ? t - INCREMENTAL_OVERLAP_MS : t);
  }
  if (since) {
    const s = new Date(since);
    if (Number.isNaN(s.getTime())) throw new Error("--since inválido.");
    return s;
  }
  return null;
}

/**
 * Deduplicação: (1) mesmo id do Gmail nesta caixa (índice único do banco); (2) mesma mensagem já importada de
 * OUTRA caixa da obra (mesmo cabeçalho Message-ID). Nunca apaga nem altera o registro existente.
 */
export function dedupeRows(rows, { existingProviderIds = new Set(), existingMessageIds = new Set() } = {}) {
  const fresh = [];
  let sameMailbox = 0;
  let crossMailbox = 0;
  const seenIds = new Set();
  const seenHeaders = new Set();
  for (const row of rows) {
    const header = row.message_id_header ? String(row.message_id_header).trim().toLowerCase() : null;
    if (existingProviderIds.has(row.provider_message_id) || seenIds.has(row.provider_message_id)) {
      sameMailbox += 1;
      continue;
    }
    if (header && (existingMessageIds.has(header) || seenHeaders.has(header))) {
      crossMailbox += 1;
      continue;
    }
    seenIds.add(row.provider_message_id);
    if (header) seenHeaders.add(header);
    fresh.push(row);
  }
  return { fresh, sameMailbox, crossMailbox };
}
