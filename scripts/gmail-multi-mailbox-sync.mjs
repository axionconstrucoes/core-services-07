// Gmail POR CAIXA — orquestrador da execução agendada (workflow gmail-inbound-sync.yml). Ver docs/gmail-coleta-por-caixa.md.
//
// Lê do BANCO quais caixas da obra estão autorizadas (lista da obra + controle por caixa + aceite individual AUTORIZADO
// + credencial) e roda scripts/gmail-inbound-sync.mjs UMA VEZ POR CAIXA, em processos separados: cada caixa tem
// cursor, estado, erros e retentativa próprios, e a falha de uma não impede as outras. Caixas pendentes, recusadas,
// revogadas ou sem credencial são PULADAS e relatadas (log público só com identificador opaco; auditoria no banco).
//
// Compatibilidade:
//   - migration 20261214100000 não aplicada => modo histórico de UMA caixa (GOOGLE_GMAIL_INBOUND_MAILBOX), igual ao
//     comportamento anterior, com aviso no log;
//   - a caixa legada (GOOGLE_GMAIL_INBOUND_MAILBOX) sem controle por caixa ligado continua no caminho histórico.
//
// Uso:
//   node scripts/gmail-multi-mailbox-sync.mjs [projectId] --apply [--with-attachments]
//   node scripts/gmail-multi-mailbox-sync.mjs [projectId] --plan            (só mostra o plano; não lê o Gmail)
//   node scripts/gmail-multi-mailbox-sync.mjs [projectId] --apply --technical-check
//        (teste técnico por caixa: renova a credencial e lê SÓ o perfil; nenhuma mensagem)
//   node scripts/gmail-multi-mailbox-sync.mjs [projectId] --compare --since=2026-11-23
//        (comparação SÓ DE METADADOS: ids do Gmail via messages.list x emails.provider_message_id, por caixa; não grava nada)
import { spawn } from "node:child_process";
import { google } from "googleapis";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { normalizeMailbox } from "./lib/gmail-mailbox-gate.mjs";
import {
  PER_MAILBOX_MIGRATION,
  compareMailboxIds,
  decideRunMode,
  formatPlanForLog,
  mailboxesForComparison,
  maskMailbox,
  perimeterQueryTerms,
  planMailboxCollection,
  resolveMailboxCredential,
  splitPerimeterDomains,
} from "./lib/gmail-per-mailbox.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const PROJECT_ID = args.find((arg) => !arg.startsWith("--")) ?? "00000000-0000-4000-8000-000000000001";
const APPLY = args.includes("--apply");
const PLAN_ONLY = args.includes("--plan");
const TECHNICAL_CHECK = args.includes("--technical-check");
const WITH_ATTACHMENTS = args.includes("--with-attachments");
const COMPARE = args.includes("--compare");
const SINCE = (args.find((arg) => arg.startsWith("--since=")) ?? "--since=2026-11-23").split("=")[1];

if (!APPLY && !PLAN_ONLY && !COMPARE) {
  console.error("ERRO: use --apply para autorizar gravação (ou --plan para só ver o plano, ou --compare para comparar metadados).");
  process.exit(1);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function runChild(script, childArgs, env, label) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script), ...childArgs], { env, stdio: "inherit" });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", (error) => {
      console.error(`${label}: falha ao iniciar (${error.message}).`);
      resolve(1);
    });
  });
}

const legacyMailbox = normalizeMailbox(process.env.GOOGLE_GMAIL_INBOUND_MAILBOX) || null;

async function runLegacy(reason) {
  console.log(`MODO HISTÓRICO (uma caixa): ${reason}`);
  if (!legacyMailbox) {
    console.log("GOOGLE_GMAIL_INBOUND_MAILBOX não definido: nada a coletar no modo histórico.");
    return 0;
  }
  if (PLAN_ONLY || TECHNICAL_CHECK) return 0;
  const env = { ...process.env };
  delete env.ACC_GMAIL_PER_MAILBOX;
  return runChild("gmail-inbound-sync.mjs", [PROJECT_ID, "--apply"], env, "caixa legada");
}

const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 0) Comparação SÓ DE METADADOS (não grava nada; funciona com ou sem a migration 20261214100000).
if (COMPARE) {
  const sinceDate = new Date(SINCE);
  if (Number.isNaN(sinceDate.getTime())) throw new Error("--since inválido (use AAAA-MM-DD).");
  const { data: cfg, error: cfgError } = await supabase.from("project_email_ingestion_configs").select("id").eq("project_id", PROJECT_ID).maybeSingle();
  if (cfgError || !cfg) throw new Error(`Configuração de ingestão ilegível: ${cfgError?.message ?? "não encontrada"}`);
  const [allowlistR, consentsR, controlsR, domainsR] = await Promise.all([
    supabase.from("project_email_ingestion_mailboxes").select("mailbox_address,enabled").eq("config_id", cfg.id),
    supabase.from("email_access_authorizations").select("id,account_email,status,requested_at,decided_at").eq("project_id", PROJECT_ID),
    supabase.from("email_mailbox_collection_controls").select("mailbox_address,individual_consent_status,revoked_at").eq("project_id", PROJECT_ID),
    supabase.from("project_email_ingestion_domains").select("domain,domain_role,enabled").eq("config_id", cfg.id),
  ]);
  for (const r of [allowlistR, consentsR, controlsR, domainsR]) if (r.error) throw new Error(r.error.message);
  const perimeter = splitPerimeterDomains(domainsR.data ?? []);
  const terms = perimeterQueryTerms(perimeter.external);
  const targets = mailboxesForComparison({ allowlist: allowlistR.data, consents: consentsR.data, controls: controlsR.data });
  console.log(`COMPARAÇÃO (só metadados) desde ${sinceDate.toISOString()}; perímetro: ${perimeter.external.length} domínio(s) externo(s); ${targets.length} caixa(s) comparável(is).`);
  for (const { mailbox, credential } of targets) {
    const auth = new google.auth.OAuth2(process.env[credential.names.clientId], process.env[credential.names.clientSecret]);
    auth.setCredentials({ refresh_token: process.env[credential.names.refreshToken] });
    const gmail = google.gmail({ version: "v1", auth });
    const gmailIds = [];
    let pageToken;
    do {
      const response = await gmail.users.messages.list({ userId: "me", q: `after:${Math.floor(sinceDate.getTime() / 1000)} {${terms}}`, maxResults: 500, pageToken, includeSpamTrash: false });
      for (const m of response.data.messages ?? []) if (m.id) gmailIds.push(m.id);
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
    const dbIds = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from("emails").select("provider_message_id").eq("project_id", PROJECT_ID).eq("provider", "GMAIL")
        .eq("mailbox_address", mailbox).gte("sent_at", sinceDate.toISOString()).range(from, from + 999);
      if (error) throw new Error(error.message);
      dbIds.push(...(data ?? []).map((row) => row.provider_message_id));
      if (!data || data.length < 1000) break;
    }
    const result = compareMailboxIds({ gmailIds, dbIds });
    console.log(JSON.stringify({ caixa: maskMailbox(mailbox), gmail: result.gmail, banco: result.db, conferem: result.matched, faltam_no_banco: result.missingInDb.length, so_no_banco: result.onlyInDb.length, exemplos_faltantes: result.missingInDb.slice(0, 20) }));
  }
  process.exit(0);
}

// 1) A migration da coleta por caixa está aplicada? (coluna nova no controle + opção de e-mail interno na configuração)
const probeControls = await supabase.from("email_mailbox_collection_controls").select("last_imported_message_id").limit(1);
const probeConfig = await supabase.from("project_email_ingestion_configs").select("id,enabled,include_internal_only_messages").eq("project_id", PROJECT_ID).maybeSingle();
const runMode = decideRunMode({ controlsError: probeControls.error, configError: probeConfig.error });
if (runMode.mode === "LEGACY_FALLBACK") {
  const code = await runLegacy(`migration ${PER_MAILBOX_MIGRATION} não aplicada; coleta por caixa indisponível neste banco.`);
  process.exit(code);
}
if (runMode.mode === "ERROR") throw new Error(`Controles/configuração ilegíveis (falha fechada): ${runMode.reason}`);
const config = probeConfig.data;
if (!config) throw new Error("Configuração de ingestão não encontrada.");
if (!config.enabled) {
  console.log("Monitoramento Gmail desativado para este projeto. Nenhuma caixa foi lida.");
  process.exit(0);
}

// 2) Estado atual da obra: lista explícita, controles por caixa e aceites individuais.
const [allowlistResult, controlsResult, consentsResult] = await Promise.all([
  supabase.from("project_email_ingestion_mailboxes").select("mailbox_address,enabled").eq("config_id", config.id),
  supabase.from("email_mailbox_collection_controls").select("*").eq("project_id", PROJECT_ID),
  supabase.from("email_access_authorizations").select("id,account_email,status,requested_at,decided_at").eq("project_id", PROJECT_ID),
]);
for (const [name, result] of [["lista da obra", allowlistResult], ["controles por caixa", controlsResult], ["aceites individuais", consentsResult]]) {
  if (result.error) throw new Error(`Falha ao ler ${name} (falha fechada): ${result.error.message}`);
}

const plan = planMailboxCollection({
  allowlist: allowlistResult.data ?? [],
  controls: controlsResult.data ?? [],
  consents: consentsResult.data ?? [],
  legacyMailbox,
});

console.log("");
console.log("AXION Gmail - COLETA POR CAIXA");
console.log("==============================");
for (const line of formatPlanForLog(plan)) console.log(line);
console.log(`Resumo: ${plan.collect.length} a coletar; ${plan.skipped.length} puladas; legada=${plan.legacy?.run ? "sim" : "não"}.`);

if (PLAN_ONLY) process.exit(0);

// Auditoria do plano (no banco: endereço e motivos; nunca credenciais).
await supabase.from("audit_log_entries").insert({
  project_id: PROJECT_ID,
  actor_type: "SYSTEM",
  actor_user_id: null,
  actor_label: null,
  action: TECHNICAL_CHECK ? "GMAIL_PER_MAILBOX_TECHNICAL_CHECK_PLAN" : "GMAIL_PER_MAILBOX_PLAN",
  entity_type: "EmailIngestionRun",
  entity_id: `GMAIL-POR-CAIXA:${new Date().toISOString()}`,
  detail: [
    ...plan.collect.map((item) => `COLETAR ${item.mailbox} (${item.credential.source})`),
    ...plan.skipped.map((item) => `PULADA ${item.mailbox}: ${item.reasons.join(",")}`),
    plan.legacy ? `LEGADA ${plan.legacy.mailbox}: ${plan.legacy.run ? "executar" : "não executar"} (${plan.legacy.reason})` : null,
  ].filter(Boolean).join("; ").slice(0, 2000),
}).then(({ error }) => { if (error) console.log(`Aviso: plano não auditado (${error.message}).`); });

const failures = [];

// 3) Teste técnico por caixa: caixas com controle e credencial (o gate do teste roda dentro do processo da caixa).
if (TECHNICAL_CHECK) {
  for (const control of controlsResult.data ?? []) {
    const mailbox = normalizeMailbox(control.mailbox_address);
    if (!resolveMailboxCredential(mailbox, control)) {
      console.log(`TESTE   ${maskMailbox(mailbox)} pulado: SEM_CREDENCIAL`);
      continue;
    }
    const env = { ...process.env, ACC_GMAIL_PER_MAILBOX: "true", ACC_GMAIL_TECHNICAL_CHECK_ONLY: "true", ACC_GMAIL_AUTH_MODE: "OAUTH_USUARIO", GOOGLE_GMAIL_INBOUND_MAILBOX: mailbox };
    const code = await runChild("gmail-inbound-sync.mjs", [PROJECT_ID, "--apply"], env, maskMailbox(mailbox));
    if (code !== 0) failures.push(maskMailbox(mailbox));
  }
  console.log(failures.length ? `Teste técnico com falha em: ${failures.join(", ")}` : "Teste técnico concluído.");
  process.exit(failures.length ? 1 : 0);
}

// 4) Caixa legada no caminho histórico (enquanto não migrar para o controle por caixa).
if (plan.legacy?.run) {
  const code = await runLegacy(`caixa legada ${maskMailbox(plan.legacy.mailbox)} (${plan.legacy.reason}).`);
  if (code !== 0) failures.push(`legada:${maskMailbox(plan.legacy.mailbox)}`);
}

// 5) Uma execução isolada por caixa autorizada.
for (const item of plan.collect) {
  const shown = maskMailbox(item.mailbox);
  console.log("");
  console.log(`--- ${shown} (${item.credential.source}) ---`);
  const env = { ...process.env, ACC_GMAIL_PER_MAILBOX: "true", ACC_GMAIL_AUTH_MODE: "OAUTH_USUARIO", GOOGLE_GMAIL_INBOUND_MAILBOX: item.mailbox };
  delete env.ACC_GMAIL_TECHNICAL_CHECK_ONLY;
  const code = await runChild("gmail-inbound-sync.mjs", [PROJECT_ID, "--apply"], env, shown);
  if (code !== 0) {
    failures.push(shown);
    continue;
  }
  // Anexos/atas da caixa (mesmo worker do caminho histórico), só com credencial OAuth própria da caixa.
  if (WITH_ATTACHMENTS && item.credential.mode === "OAUTH_USUARIO" && item.mailbox !== legacyMailbox) {
    const names = item.credential.names;
    const workerEnv = {
      ...process.env,
      GOOGLE_GMAIL_INBOUND_MAILBOX: item.mailbox,
      GOOGLE_GMAIL_INBOUND_CLIENT_ID: process.env[names.clientId],
      GOOGLE_GMAIL_INBOUND_CLIENT_SECRET: process.env[names.clientSecret],
      GOOGLE_GMAIL_INBOUND_REFRESH_TOKEN: process.env[names.refreshToken],
    };
    const workerCode = await runChild("gmail-ata-ingestion-worker.mjs", [PROJECT_ID], workerEnv, `${shown} anexos`);
    if (workerCode !== 0) failures.push(`${shown}:anexos`);
  }
}

console.log("");
console.log(failures.length ? `Coleta por caixa concluída com falhas: ${failures.join(", ")}` : "Coleta por caixa concluída.");
process.exit(failures.length ? 1 : 0);
