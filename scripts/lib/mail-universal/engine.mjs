// Fase 5/A — motor de sincronização universal e reconciliação. Puro: leitor e armazenamento são injetados
// (testes usam transporte FALSO + armazenamento em memória). NÃO classifica risco (Frente B) e NÃO envia nada.
//
// Garantias:
//  - DRY_RUN é o padrão: nada é gravado em emails, origens ou cursor; só se devolve (e opcionalmente registra) a reconciliação.
//  - Identidade de reconciliação: universo = processadas + excluídas + falhas. Cada mensagem tem destino e motivo.
//  - Idempotência: mesma mensagem (provedor+caixa+id) lida de novo = "processada" sem duplicar; mesma mensagem em outra caixa
//    (mesma chave canônica) = UMA linha em emails + origem extra, contada como exclusão DUPLICATE_CROSS_MAILBOX.
//  - Recuperação: se houve falha, o cursor NÃO avança; a próxima execução relê a janela (com sobreposição) sem duplicar.
//  - Anexo indisponível não descarta a mensagem: ela entra com attachments_meta status UNAVAILABLE e a lacuna é registrada.
import { canonicalMessageKey } from "./canonical.mjs";
import { evaluateEligibility } from "./eligibility.mjs";
import { involvedDomains } from "./participants.mjs";
import { normalizeMailbox } from "./reader.mjs";

export const DEFAULT_OVERLAP_MS = 10 * 60 * 1000;
const MAX_GAPS = 200;
const safeDetail = (error) => String(error?.message ?? error ?? "erro").replace(/\s+/g, " ").slice(0, 200);

/** Linha de public.emails (migration 20261201100000 aplicada). */
export function toEmailRow(message, projectId, canonicalKey) {
  return {
    project_id: projectId,
    from_address: message.from[0] ?? "",
    to_address: message.to.join(", "),
    cc_addresses: message.cc,
    bcc_addresses: message.bcc,
    involved_domains: involvedDomains(message),
    subject: message.subject,
    sent_at: message.sentAt,
    snippet: message.snippet,
    body_text: message.bodyText,
    body_html: message.bodyHtml,
    body_fetched_at: new Date().toISOString(),
    provider: message.provider,
    provider_message_id: message.providerMessageId,
    provider_thread_id: message.threadId,
    message_id_header: message.internetMessageId,
    mailbox_address: message.mailbox,
    direction: message.direction,
    canonical_message_key: canonicalKey,
    attachments_meta: message.attachments.map((a) => ({ filename: a.filename, mime: a.mime, size: a.size, status: a.available === true ? "AVAILABLE" : "UNAVAILABLE" })),
    provider_labels: message.labels,
  };
}

async function withRetry(fn, { attempts, sleep }) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (error?.retryable === false || attempt === attempts) break;
      await sleep(2 ** attempt * 100);
    }
  }
  throw last;
}

/**
 * @param {{
 *  reader: import("./reader.mjs").MailReader, store: object, projectId: string, mailbox: string,
 *  rule: object, period: { start: string, end: string }, mode?: "DRY_RUN"|"APPLY", overlapMs?: number, now?: Date,
 *  retry?: { attempts?: number }, sleep?: (ms:number)=>Promise<void>, persistRun?: boolean,
 * }} options
 */
export async function runMailboxSync(options) {
  const { reader, store, projectId, rule, period, mode = "DRY_RUN", overlapMs = DEFAULT_OVERLAP_MS, now = new Date(), persistRun = true } = options;
  const mailbox = normalizeMailbox(options.mailbox);
  const apply = mode === "APPLY";
  const attempts = options.retry?.attempts ?? 3;
  const sleep = options.sleep ?? (async () => {});
  const cursor = await store.getCursor({ projectId, provider: reader.provider, mailbox });

  const windowStartMs = cursor?.lastWindowEnd ? Math.max(Date.parse(period.start), Date.parse(cursor.lastWindowEnd) - overlapMs) : Date.parse(period.start);
  const windowEndMs = Math.min(Date.parse(period.end), now.getTime());
  const window = { start: new Date(windowStartMs).toISOString(), end: new Date(Math.max(windowStartMs, windowEndMs)).toISOString() };

  const counts = { universe: 0, eligible: 0, processed: 0, excluded: 0, failed: 0, replayed: 0, inserted: 0, attachmentsUnavailable: 0 };
  const gaps = [];
  const exclusions = [];
  const gap = (g) => { if (gaps.length < MAX_GAPS) gaps.push(g); };
  const exclude = (id, reason, detail, ingested = false) => exclusions.push({ provider: reader.provider, providerMessageId: id, reason, detail: detail ?? null, messageIngested: ingested });
  const finish = async (status, nextCursor) => {
    const run = {
      provider: reader.provider, mailbox, projectId, periodStart: window.start, periodEnd: window.end,
      universeCount: counts.universe, eligibleCount: counts.eligible, processedCount: counts.processed, excludedCount: counts.excluded, failedCount: counts.failed,
      gaps, status, mode, ruleId: rule.id ?? null,
    };
    if (persistRun) run.id = await store.recordRun(run, exclusions);
    if (apply && status === "COMPLETED" && nextCursor) await store.saveCursor({ projectId, provider: reader.provider, mailbox, cursor: nextCursor, lastSuccessAt: now.toISOString() });
    return { run, counts, exclusions, cursorAdvanced: apply && status === "COMPLETED" && Boolean(nextCursor), window };
  };

  let listed;
  try {
    listed = await withRetry(() => reader.list({ mailbox, cursor, window }), { attempts, sleep });
  } catch (error) {
    gap({ type: "LIST_FAILED", detail: safeDetail(error) });
    gap({ type: "CURSOR_NOT_ADVANCED", detail: "listagem falhou" });
    return finish("FAILED", null);
  }

  const seenIds = new Set();
  const runKeys = new Map(); // chave canônica -> emailId (ou "dry") dentro desta execução
  for (const ref of listed.refs) {
    const refKey = `${ref.folder ?? ""}:${ref.id}`;
    if (seenIds.has(refKey)) continue;
    seenIds.add(refKey);
    counts.universe += 1;

    if (ref.removed) { counts.excluded += 1; exclude(ref.id, "REMOVED_AT_PROVIDER", "removida no provedor (delta)"); continue; }

    let message;
    try {
      message = await withRetry(() => reader.getMessage(mailbox, ref), { attempts, sleep });
    } catch (error) {
      counts.failed += 1;
      exclude(ref.id, "FETCH_FAILED", safeDetail(error));
      gap({ type: "FETCH_FAILED", id: ref.id, detail: safeDetail(error) });
      continue;
    }

    const verdict = evaluateEligibility(message, rule, period);
    if (!verdict.eligible) { counts.excluded += 1; exclude(ref.id, verdict.reason, null); continue; }
    counts.eligible += 1;

    // Mesma mensagem, mesma caixa: idempotência.
    const same = await store.findBySource({ projectId, provider: reader.provider, mailbox, providerMessageId: message.providerMessageId });
    if (same) { counts.processed += 1; counts.replayed += 1; continue; }

    // Mesma mensagem em outra caixa (ou repetida na mesma): uma linha só; origem extra.
    const key = canonicalMessageKey({ internetMessageId: message.internetMessageId, provider: reader.provider, mailbox, providerMessageId: message.providerMessageId });
    const existing = runKeys.has(key) ? { id: runKeys.get(key) } : await store.findByCanonicalKey({ projectId, key });
    if (existing) {
      if (apply && existing.id !== "dry") await store.addSource({ emailId: existing.id, projectId, provider: reader.provider, mailbox, providerMessageId: message.providerMessageId });
      counts.excluded += 1;
      exclude(ref.id, "DUPLICATE_CROSS_MAILBOX", "mesma mensagem já ingerida (chave canônica)");
      continue;
    }

    // Anexos: indisponível não descarta a mensagem.
    for (const attachment of message.attachments) {
      let ok = attachment.available === true;
      if (attachment.available !== false && reader.probeAttachment) ok = await reader.probeAttachment(mailbox, message, attachment).catch(() => false);
      attachment.available = ok;
      if (!ok) {
        counts.attachmentsUnavailable += 1;
        exclude(ref.id, "ATTACHMENT_UNAVAILABLE", attachment.filename, true);
        gap({ type: "ATTACHMENT_UNAVAILABLE", id: ref.id, detail: attachment.filename });
      }
    }

    if (!apply) { runKeys.set(key, "dry"); counts.processed += 1; continue; }
    try {
      const { id } = await store.insertEmail(toEmailRow(message, projectId, key));
      await store.addSource({ emailId: id, projectId, provider: reader.provider, mailbox, providerMessageId: message.providerMessageId });
      runKeys.set(key, id);
      counts.processed += 1;
      counts.inserted += 1;
    } catch (error) {
      if (error?.code === "23505") { counts.processed += 1; counts.replayed += 1; continue; }
      counts.failed += 1;
      exclude(ref.id, "INSERT_FAILED", safeDetail(error));
      gap({ type: "INSERT_FAILED", id: ref.id, detail: safeDetail(error) });
    }
  }

  const status = counts.failed > 0 ? "PARTIAL" : apply ? "COMPLETED" : "DRY_RUN";
  if (counts.failed > 0) gap({ type: "CURSOR_NOT_ADVANCED", detail: `${counts.failed} falha(s): a próxima execução relê a janela (idempotente)` });
  // Identidade de reconciliação (também garantida por CHECK no banco).
  if (counts.universe !== counts.processed + counts.excluded + counts.failed) throw new Error("RECONCILIATION_IDENTITY_BROKEN");
  const finalStatus = !apply && counts.failed === 0 ? "DRY_RUN" : status;
  // No DRY_RUN o cursor nunca avança (o finish só avança em APPLY + COMPLETED).
  return finish(finalStatus, listed.nextCursor);
}
