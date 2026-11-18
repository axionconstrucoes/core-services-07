// Validação do fluxo REAL de leitura de respostas SEM efeitos: usa o parser de Gmail real
// (extractInboundFromGmail) sobre mensagens RFC822 controladas e o processador real
// (processAlertReplies) contra os dados REAIS de produção (leitura), com TODAS as escritas
// interceptadas em memória. Nenhuma linha é gravada, nenhuma confirmação é enfileirada no
// banco e nenhum e-mail é enviado. Saída mascarada (sem nomes, e-mails ou corpo).
//
// Uso (credenciais server-side do .env.local, nunca impressas):
//   node scripts/risk-alert-replies-dry-run.mjs --env=<caminho do .env.local> --case=<case_id> --sender-user=<user_id>

import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? "").split("=").slice(1).join("=");
const envPath = arg("env");
const caseId = arg("case");
const senderUserId = arg("sender-user");
if (!envPath || !caseId || !senderUserId) {
  console.error("uso: --env=<.env.local> --case=<case_id> --sender-user=<user_id>");
  process.exit(2);
}
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("credenciais do Supabase ausentes");
  process.exit(2);
}

const { createClient } = await import("@supabase/supabase-js");
const { createSupabaseRiskAlertStore } = await import("../apps/web/lib/risk-alerts/supabase-store");
const { processAlertReplies } = await import("../apps/web/lib/risk-alerts/replies/process-alert-replies");
const { extractInboundFromGmail } = await import("../apps/web/lib/risk-alerts/replies/gmail-reply-extract");
const { buildReplyConfirmationParts } = await import("../apps/web/lib/risk-alerts/replies/reply-confirmation");
const { formatDateTimeBR } = await import("../apps/web/lib/risk-alerts/build-risk-alert-emails");

const client = createClient(url, key, { auth: { persistSession: false } });
const realStore = createSupabaseRiskAlertStore(client);

const { data: caseRow, error: caseError } = await client.from("risk_alert_cases").select("id,project_id,risk_level,state,status,title,reference").eq("id", caseId).maybeSingle();
if (caseError || !caseRow) throw new Error("caso não encontrado");
if (!/TESTE/i.test(`${caseRow.title} ${caseRow.reference}`)) throw new Error("recusado: o dry-run só roda contra o caso de TESTE do piloto");
const projectId = caseRow.project_id;
const { data: sender } = await client.from("profiles").select("email").eq("id", senderUserId).maybeSingle();
const { data: outbound } = await client.from("alert_email_messages").select("message_id_header,sent_at").eq("case_id", caseId).eq("direction", "OUTBOUND").not("message_id_header", "is", null).order("sent_at", { ascending: false }).limit(1);
const rootMessageId = outbound?.[0]?.message_id_header;
if (!sender?.email || !rootMessageId) throw new Error("remetente ou mensagem raiz do caso indisponível");

const READS = new Set(["loadProjectSnapshot", "loadCorrelationIndex", "loadCaseSnapshotForAction", "loadCaseForecastEvents", "loadCaseRecord", "loadReplyTimingContext"]);
function dryStore(inbound, extraHistory = []) {
  const captured = { updates: [], transitions: [], audits: [], forecastReplies: [], confirmations: [] };
  const writes = {
    async listInboundToProcess() { return inbound; },
    async updateInboundMessage(id, patch) { captured.updates.push({ id, status: patch.status, statusReason: patch.statusReason, classification: patch.classification, correlationMethod: patch.correlationMethod }); },
    async applyTransition(_caseId, transition) { captured.transitions.push(transition); return { state: transition.caseUpdate.state, escalationId: null }; },
    async audit(_p, events) { captured.audits.push(...events.map((e) => e.action)); },
    async recordForecastReply(input) { captured.forecastReplies.push({ forecastAt: input.forecastAt }); },
    async enqueueReplyConfirmation(_p, _c, entry) { captured.confirmations.push(entry); },
    async loadCaseForecastEvents(id) { return [...(await realStore.loadCaseForecastEvents(id)), ...extraHistory]; },
  };
  const store = new Proxy({}, {
    get(_t, prop) {
      if (prop in writes) return writes[prop];
      if (READS.has(prop)) return realStore[prop].bind(realStore);
      return () => { throw new Error(`dry-run: chamada não permitida (${String(prop)})`); };
    },
    has(_t, prop) { return prop in writes || READS.has(prop); },
  });
  return { store, captured };
}

const b64 = (s) => Buffer.from(s, "utf8").toString("base64url");
function rfc822ToGmail(raw, id, internalDate) {
  const [head, ...rest] = raw.replace(/\r\n/g, "\n").split("\n\n");
  const headers = head.split("\n").map((line) => { const i = line.indexOf(":"); return { name: line.slice(0, i), value: line.slice(i + 1).trim() }; });
  return { id, threadId: `t-${id}`, internalDate: String(new Date(internalDate).getTime()), labelIds: ["INBOX"], payload: { mimeType: "text/plain", headers, body: { data: b64(rest.join("\n\n")) } } };
}
const tomorrow = new Date(Date.now() + 2 * 24 * 3600 * 1000);
const dd = String(tomorrow.getUTCDate()).padStart(2, "0");
const mm = String(tomorrow.getUTCMonth() + 1).padStart(2, "0");
const yyyy = tomorrow.getUTCFullYear();
function raw({ from = sender.email, body, extra = "", msgId }) {
  return `From: ${from}\nTo: crm+alerta-dryrun@axion.com.br\nSubject: RE: alerta [ACC-ALERTA:DRYRUN]\nMessage-ID: <${msgId}@dryrun.local>\nIn-Reply-To: ${rootMessageId}\nReferences: ${rootMessageId}\n${extra}Content-Type: text/plain; charset=utf-8\n\n${body}`;
}
function inbound(gmail, id) {
  const ex = extractInboundFromGmail(gmail, "crm@axion.com.br");
  return { id, projectId, providerMessageId: ex.providerMessageId, headers: ex.headers, bodyOriginal: ex.bodyOriginal, receivedAt: ex.receivedAt };
}
const nowIso = new Date().toISOString();
const recent = new Date(Date.now() - 5 * 60 * 1000).toISOString();
const quoted = `\n\nEm seg., 17 de nov. de 2026 às 19:21, crm escreveu:\n> Previsão: 30/12/${yyyy} às 10h\n> texto antigo`;

const SCENARIOS = [
  { name: "A status + data/horário + histórico citado", msgs: [{ body: `Em andamento. Conclusão prevista para ${dd}/${mm}/${yyyy} às 15h.${quoted}` }] },
  { name: "B em andamento sem data", msgs: [{ body: "Tomando providências, retorno em breve." }] },
  { name: "C só data (ALTO exige horário)", msgs: [{ body: `Providenciando. Previsão ${dd}/${mm}/${yyyy}.` }] },
  { name: "D datas contraditórias", msgs: [{ body: `Em andamento, previsão ${dd}/${mm}/${yyyy} às 15h ou conclusão em ${dd}/${mm}/${yyyy} às 18h.` }] },
  { name: "E remetente fora do domínio", msgs: [{ from: "alguem@example.com", body: "Em andamento. Previsão 30/11/2026 às 10h." }] },
  { name: "F resposta automática", msgs: [{ body: "Estou ausente.", extra: "Auto-Submitted: auto-replied\n" }] },
  { name: "G duplicada no lote", msgs: [{ body: `Em andamento. Previsão ${dd}/${mm}/${yyyy} às 15h.`, msgId: "dup" }, { body: `Em andamento. Previsão ${dd}/${mm}/${yyyy} às 15h.`, msgId: "dup" }] },
  { name: "H fora de ordem (já há atualização mais recente)", history: [{ actionType: "TAKING_ACTION", forecastAt: new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString(), effectiveAt: nowIso, createdAt: nowIso, actorUserId: senderUserId, text: null }], msgs: [{ body: `Em andamento. Previsão ${dd}/${mm}/${yyyy} às 15h.`, at: recent }] },
];

console.log(`Dry-run sobre o caso de TESTE (risco ${caseRow.risk_level}, estado ${caseRow.state}); escritas interceptadas; nenhum e-mail.`);
for (const scenario of SCENARIOS) {
  const messages = scenario.msgs.map((m, i) => inbound(rfc822ToGmail(raw({ from: m.from, body: m.body, extra: m.extra, msgId: m.msgId ?? `${scenario.name[0]}${i}-${Date.now()}` }), `dry-${scenario.name[0]}-${i}`, m.at ?? recent), `dry-${scenario.name[0]}-${i}`));
  const { store, captured } = dryStore(messages, scenario.history ?? []);
  const result = await processAlertReplies(store, projectId, nowIso, ["crm@axion.com.br"]);
  const t = captured.transitions[0];
  const conf = t?.outbox.find((e) => e.idempotencyKey.includes(":REPLY_CONFIRMATION:")) ?? captured.confirmations[0] ?? null;
  const parts = conf ? buildReplyConfirmationParts(conf.payloadSummary, { timeZone: "America/Sao_Paulo", formatDate: (iso) => formatDateTimeBR(iso, "America/Sao_Paulo"), responsibleName: "<mascarado>" }) : null;
  console.log(`\n== ${scenario.name}`);
  console.log(`   resultado: applied=${result.applied} recorded=${result.recorded} ignored=${result.ignored} unauthorized=${result.unauthorized} review=${result.reviewRequired + result.pendingHumanReview}`);
  console.log(`   mensagens: ${captured.updates.map((u) => `${u.status}${u.correlationMethod ? `/${u.correlationMethod}` : ""} (${u.statusReason ?? ""})`).join(" | ")}`);
  if (t) {
    console.log(`   transição: ${t.expectedState} -> ${t.caseUpdate.state}; previsão=${t.forecast?.status ?? "-"} ${t.forecast?.forecastAt ? formatDateTimeBR(t.forecast.forecastAt, "America/Sao_Paulo") : ""}${t.forecast?.problem ? ` (${t.forecast.problem})` : ""}`);
    console.log(`   outbox planejada (não gravada): ${t.outbox.map((e) => `${e.notificationType}/${e.status}`).join(", ") || "-"}; escalonamento: ${t.escalation ? `${t.escalation.fromLevel}->${t.escalation.toLevel}` : "-"}`);
  }
  if (captured.forecastReplies.length) console.log(`   histórico (não gravado): ${captured.forecastReplies.length} REPLY_RECEIVED`);
  if (captured.audits.length) console.log(`   auditoria (não gravada): ${captured.audits.join(", ")}`);
  if (parts) console.log(`   confirmação (não enviada): ${parts.rows.filter(([l]) => l !== "Responsável atual").map(([l, v]) => `${l}: ${v}`).join(" · ")}`);
}
console.log("\nNenhuma escrita foi feita no banco e nenhum e-mail foi enviado.");
