// Coleta da caixa PRÓPRIA de um titular (recebidos + enviados), somente leitura (gmail.readonly).
//
// Modos:
//   --mode=history      histórico completo em janelas de 30 dias, com CHECKPOINT retomável (audit_log_entries);
//                       uma execução processa até --max-windows janelas e para; a próxima continua de onde parou.
//   --mode=incremental  coleta contínua a partir do último checkpoint (sobreposição de 10 min). Sem checkpoint
//                       exige --since explícito — nunca lê a caixa inteira por acidente.
//
// Travas (todas antes de ler qualquer mensagem):
//   - credenciais do slot ausentes => pula (exit 0), só informa NOMES de variáveis faltantes;
//   - monitoramento da obra desligado => pula;
//   - caixa fora da lista explícita da obra (project_email_ingestion_mailboxes, enabled) => pula;
//   - conta autenticada diferente da caixa configurada => erro.
// Deduplicação: id do Gmail nesta caixa (índice único) + Message-ID já importado de OUTRA caixa da obra.
// Sem --apply: simulação (conta; não grava mensagens nem checkpoint).
// Logs públicos: só contagens e identificador opaco da caixa (hash). Nunca endereço, assunto ou token.
// Nada aqui envia, altera, move ou exclui mensagens, nem dispara alertas.
//
// Uso:
//   node --env-file=apps/web/.env.local scripts/gmail-owner-mailbox-sync.mjs --prefix=GOOGLE_GMAIL_TITULAR_1 --mode=history --since=2025-01-01T00:00:00-03:00 --apply
//   node --env-file=apps/web/.env.local scripts/gmail-owner-mailbox-sync.mjs --prefix=GOOGLE_GMAIL_TITULAR_2 --mode=incremental --apply

import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { extractGmailBody } from "./lib/gmail-message-body.mjs";
import { deriveIndividualConsent } from "./lib/gmail-mailbox-gate.mjs";
import {
  OWNER_CHECKPOINT_ACTION,
  OWNER_CHECKPOINT_ENTITY,
  buildOwnerQueries,
  classifyOwnerMessage,
  dedupeRows,
  formatCheckpoint,
  maskId,
  missingOwnerCredentials,
  normalizePrefix,
  ownerCredentialNames,
  parseCheckpoint,
  planWindows,
  resolveStart,
} from "./lib/gmail-owner-mailbox.mjs";

const args = process.argv.slice(2);
const arg = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? null;

const PROJECT_ID = args.find((a) => !a.startsWith("--")) ?? "00000000-0000-4000-8000-000000000001";
const PREFIX = normalizePrefix(arg("prefix"));
const MODE = arg("mode") ?? "incremental";
const SINCE = arg("since");
const UNTIL = arg("until");
const MAX_WINDOWS = Math.max(1, Number(arg("max-windows") ?? 3) || 3);
const APPLY = args.includes("--apply");

if (!PREFIX) {
  console.error("ERRO: informe --prefix=<PREFIXO_DO_SLOT>.");
  process.exit(1);
}
if (!["history", "incremental"].includes(MODE)) {
  console.error("ERRO: --mode deve ser history ou incremental.");
  process.exit(1);
}

const missing = missingOwnerCredentials(PREFIX);
if (missing.length > 0) {
  console.log(`Slot ${PREFIX}: credenciais ausentes (${missing.join(", ")}). Coleta pulada; nada lido.`);
  process.exit(0);
}

const names = ownerCredentialNames(PREFIX);
const mailbox = process.env[names.mailbox].trim().toLowerCase();
const tag = `caixa#${maskId(mailbox)}`;

function required(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Variável ausente: ${name}`);
  return value;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractAddresses(value) {
  if (!value) return [];
  return Array.from(new Set((value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []).map((a) => a.toLowerCase())));
}
function getHeader(headers, name) {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}
function attachmentNames(part, out = []) {
  if (!part) return out;
  if (part.filename) out.push(part.filename);
  for (const child of part.parts ?? []) attachmentNames(child, out);
  return out;
}
const normalizeText = (v = "") => String(v).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: config, error: configError } = await supabase
  .from("project_email_ingestion_configs").select("*").eq("project_id", PROJECT_ID).single();
if (configError || !config) throw new Error(configError?.message ?? "Configuração de ingestão não encontrada.");
if (!config.enabled) {
  console.log("Monitoramento Gmail desativado para a obra. Nada lido.");
  process.exit(0);
}

const { data: allowRows, error: allowError } = await supabase
  .from("project_email_ingestion_mailboxes").select("mailbox_address").eq("config_id", config.id).eq("enabled", true);
if (allowError) throw new Error(allowError.message);
if (!(allowRows ?? []).some((row) => row.mailbox_address.toLowerCase() === mailbox)) {
  console.log(`${tag}: fora da lista explícita de caixas da obra. Coleta pulada; nada lido.`);
  process.exit(0);
}

// Aceite individual no ACC: RECUSA ou REVOGAÇÃO explícita desta caixa nesta obra para a coleta na hora, mesmo com o
// refresh token ainda válido no Google. Consulta ilegível => falha fechada (nada lido).
const { data: consentRows, error: consentError } = await supabase
  .from("email_access_authorizations").select("id,account_email,status,requested_at,decided_at")
  .eq("project_id", PROJECT_ID).eq("account_email", mailbox);
if (consentError) throw new Error(`Aceites individuais ilegíveis (falha fechada): ${consentError.message}`);
const consent = deriveIndividualConsent(consentRows ?? [], mailbox);
if (consent.status === "RECUSADO" || consent.status === "REVOGADO") {
  console.log(`${tag}: aceite individual ${consent.status} no ACC. Coleta bloqueada; nada lido.`);
  process.exit(0);
}

const { data: domains, error: domainError } = await supabase
  .from("project_email_ingestion_domains").select("domain,domain_role").eq("config_id", config.id).eq("enabled", true);
if (domainError) throw new Error(domainError.message);
const clientDomains = new Set((domains ?? []).filter((r) => String(r.domain_role ?? "").toUpperCase() === "CLIENT").map((r) => r.domain.toLowerCase()));
const scopeKeywords = Array.isArray(config.scope_keywords) ? config.scope_keywords : [];
const scopeExactSubjects = Array.isArray(config.scope_exact_subjects) ? config.scope_exact_subjects : [];
const requireScope = config.require_project_scope_match !== false;

function projectMatch({ subject, bodyText, snippet, from, recipients }) {
  if (!requireScope) return true;
  if ([...from, ...recipients].some((a) => clientDomains.has(a.split("@")[1]))) return true;
  const content = [subject, bodyText, snippet].map(normalizeText).join(" ");
  if (scopeKeywords.some((term) => content.includes(normalizeText(term)))) return true;
  return scopeExactSubjects.some((s) => normalizeText(subject) === normalizeText(s));
}

const auth = new google.auth.OAuth2(required(names.clientId), required(names.clientSecret));
auth.setCredentials({ refresh_token: required(names.refreshToken) });
const gmail = google.gmail({ version: "v1", auth });
const profile = await gmail.users.getProfile({ userId: "me" });
if (profile.data.emailAddress?.toLowerCase() !== mailbox) {
  throw new Error(`${tag}: a conta autenticada não coincide com a caixa configurada no slot.`);
}

const { data: lastCheckpoint, error: checkpointError } = await supabase
  .from("audit_log_entries")
  .select("detail,created_at")
  .eq("project_id", PROJECT_ID)
  .eq("action", OWNER_CHECKPOINT_ACTION)
  .eq("entity_type", OWNER_CHECKPOINT_ENTITY)
  .eq("entity_id", maskId(mailbox))
  .like("detail", `mode=${MODE};%`) // checkpoints SEPARADOS: o contínuo nunca encurta o histórico em andamento
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (checkpointError) throw new Error(checkpointError.message);
const parsed = parseCheckpoint(lastCheckpoint?.detail);
const checkpoint = parsed?.mode === MODE ? parsed : null;

const start = resolveStart({ mode: MODE, checkpoint, since: SINCE });
if (!start) {
  console.log(`${tag}: sem checkpoint e sem --since. Defina o início explicitamente. Nada lido.`);
  process.exit(0);
}
const runStartedAt = new Date();
const until = MODE === "history" && UNTIL ? new Date(UNTIL) : runStartedAt;
if (Number.isNaN(until.getTime()) || until > runStartedAt) throw new Error("--until inválido ou no futuro.");
const allWindows = MODE === "history" ? planWindows(start, until) : planWindows(start, until, 3650);
const windows = allWindows.slice(0, MAX_WINDOWS);

console.log("");
console.log("COLETA DA CAIXA DO TITULAR (somente leitura)");
console.log("Slot:", PREFIX, "| Caixa:", tag, "| Modo:", MODE, "|", APPLY ? "APLICAR" : "SIMULAÇÃO");
console.log(`Janelas: ${windows.length} de ${allWindows.length} (${start.toISOString()} -> ${until.toISOString()})`);

async function getMessage(id) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      return (await gmail.users.messages.get({ userId: "me", id, format: "full" })).data;
    } catch (error) {
      const status = error?.status ?? error?.code ?? error?.response?.status;
      if (status === 404) return null; // indisponível na origem: só conta
      if (![403, 429, 500, 502, 503, 504].includes(status) || attempt === 6) throw error;
      await sleep(Math.min(60000, 2000 * 2 ** attempt));
    }
  }
  return null;
}

async function existingSets(rows) {
  const providerIds = new Set();
  const messageIds = new Set();
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    const { data: byId, error: e1 } = await supabase
      .from("emails").select("provider_message_id")
      .eq("project_id", PROJECT_ID).eq("provider", "GMAIL").eq("mailbox_address", mailbox)
      .in("provider_message_id", chunk.map((r) => r.provider_message_id));
    if (e1) throw new Error(e1.message);
    for (const r of byId ?? []) providerIds.add(r.provider_message_id);
    const headers = chunk.map((r) => r.message_id_header).filter(Boolean);
    if (headers.length) {
      const { data: byHeader, error: e2 } = await supabase
        .from("emails").select("message_id_header,mailbox_address")
        .eq("project_id", PROJECT_ID).in("message_id_header", headers);
      if (e2) throw new Error(e2.message);
      for (const r of byHeader ?? []) {
        if (r.mailbox_address?.toLowerCase() !== mailbox) messageIds.add(String(r.message_id_header).trim().toLowerCase());
      }
    }
  }
  return { existingProviderIds: providerIds, existingMessageIds: messageIds };
}

const totals = { candidates: 0, unavailable: 0, received: 0, sent: 0, outOfScope: 0, inserted: 0, sameMailbox: 0, crossMailbox: 0, windowsDone: 0 };
let through = null;

for (const window of windows) {
  const afterEpoch = Math.floor(window.start.getTime() / 1000);
  const beforeEpoch = Math.ceil(window.end.getTime() / 1000);
  const ids = new Set();
  for (const query of buildOwnerQueries({ clientDomains, afterEpoch, beforeEpoch })) {
    let pageToken;
    do {
      const response = await gmail.users.messages.list({ userId: "me", q: query.q, maxResults: 500, pageToken, includeSpamTrash: false });
      for (const m of response.data.messages ?? []) if (m.id) ids.add(m.id);
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  totals.candidates += ids.size;

  const rows = [];
  const list = [...ids];
  for (let i = 0; i < list.length; i += 10) {
    const messages = await Promise.all(list.slice(i, i + 10).map(getMessage));
    for (const message of messages) {
      if (!message) { totals.unavailable += 1; continue; }
      if (!message.id || !message.internalDate) continue;
      const occurredAt = new Date(Number(message.internalDate));
      if (occurredAt < window.start || occurredAt >= window.end) continue;
      const headers = message.payload?.headers ?? [];
      const from = extractAddresses(getHeader(headers, "From"));
      const recipients = Array.from(new Set([
        ...extractAddresses(getHeader(headers, "To")),
        ...extractAddresses(getHeader(headers, "Cc")),
        ...extractAddresses(getHeader(headers, "Bcc")),
      ]));
      const subject = getHeader(headers, "Subject") ?? "(sem assunto)";
      const { bodyText, bodyHtml } = extractGmailBody(message);
      const inScope = projectMatch({ subject, bodyText, snippet: message.snippet ?? "", from, recipients });
      const decision = classifyOwnerMessage({
        from, recipients, mailbox, clientDomains, attachmentNames: attachmentNames(message.payload), projectMatch: inScope,
      });
      if (!decision.eligible || !inScope) { totals.outOfScope += 1; continue; }
      if (decision.direction === "OUTBOUND") totals.sent += 1; else totals.received += 1;
      rows.push({
        project_id: PROJECT_ID,
        from_address: from[0] ?? "",
        to_address: recipients.join(", "),
        subject,
        sent_at: occurredAt.toISOString(),
        snippet: message.snippet ?? "",
        body_text: bodyText || null,
        body_html: bodyHtml || null,
        body_fetched_at: new Date().toISOString(),
        provider: "GMAIL",
        provider_message_id: message.id,
        provider_thread_id: message.threadId ?? null,
        message_id_header: getHeader(headers, "Message-ID"),
        mailbox_address: mailbox,
        direction: decision.direction,
      });
    }
    await sleep(1000); // ~10 req/s, margem na quota do Gmail
  }

  const { fresh, sameMailbox, crossMailbox } = dedupeRows(rows, await existingSets(rows));
  totals.sameMailbox += sameMailbox;
  totals.crossMailbox += crossMailbox;

  if (APPLY) {
    for (let i = 0; i < fresh.length; i += 100) {
      const batch = fresh.slice(i, i + 100);
      const { error } = await supabase.from("emails").insert(batch);
      if (!error) { totals.inserted += batch.length; continue; }
      for (const row of batch) {
        const result = await supabase.from("emails").insert(row);
        if (!result.error) totals.inserted += 1;
        else if (result.error.code === "23505") totals.sameMailbox += 1;
        else throw new Error(result.error.message);
      }
    }
    // Checkpoint só depois que a janela inteira foi gravada: uma falha no meio repete a janela (idempotente).
    const { error: cpError } = await supabase.from("audit_log_entries").insert({
      project_id: PROJECT_ID, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
      action: OWNER_CHECKPOINT_ACTION, entity_type: OWNER_CHECKPOINT_ENTITY, entity_id: maskId(mailbox),
      detail: formatCheckpoint({ mode: MODE, through: window.end }),
    });
    if (cpError) throw new Error(cpError.message);
  }
  through = window.end;
  totals.windowsDone += 1;
  console.log(`Janela ${totals.windowsDone}/${windows.length}: candidatas ${ids.size}, elegíveis ${rows.length}, novas ${fresh.length}.`);
}

if (APPLY) {
  const { error: auditError } = await supabase.from("audit_log_entries").insert({
    project_id: PROJECT_ID, actor_type: "SYSTEM", actor_user_id: null, actor_label: null,
    action: "GMAIL_OWNER_MAILBOX_SYNC_RUN", entity_type: OWNER_CHECKPOINT_ENTITY, entity_id: maskId(mailbox),
    detail: `Modo ${MODE}: ${totals.inserted} novas (${totals.received} recebidas, ${totals.sent} enviadas elegíveis); ` +
      `${totals.sameMailbox} já existentes nesta caixa; ${totals.crossMailbox} já importadas de outra caixa; ` +
      `${totals.outOfScope} fora do escopo; ${totals.unavailable} indisponíveis; janelas ${totals.windowsDone}/${allWindows.length}.`,
  });
  if (auditError) throw new Error(auditError.message);
}

console.table([{ ...totals, janelas_restantes: allWindows.length - totals.windowsDone, checkpoint: through ? through.toISOString() : null }]);
console.log(allWindows.length > totals.windowsDone ? "Histórico INCOMPLETO: execute novamente para continuar do checkpoint." : "Coleta concluída para o período.");
