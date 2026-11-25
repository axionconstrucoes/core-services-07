import { google } from "googleapis";
import { pilotMessageEligible, pilotScopeBypass, pilotSenderQuery, pilotSenderTerms } from "./lib/gmail-weg-pilot-sender.mjs";
import { createClient } from "@supabase/supabase-js";
import { participantColumns, participantsFromGmailHeaders } from "./lib/mail-universal/participants.mjs";
import { extractGmailBody } from "./lib/gmail-message-body.mjs";
import { createDelegatedGmailAuth } from "./lib/gmail-delegated-auth.mjs";
import { deriveIndividualConsent, resolveDelegatedReadWindow } from "./lib/gmail-mailbox-gate.mjs";
import { assertStillCollectable, isRetryableGmailError, prepareDelegatedRun, safeErrorDetail } from "./lib/gmail-mailbox-run.mjs";

const args = process.argv.slice(2);

const PROJECT_ID =
  args.find((arg) => !arg.startsWith("--")) ??
  "00000000-0000-4000-8000-000000000001";

if (!args.includes("--apply")) {
  console.error("ERRO: use --apply para autorizar gravação.");
  process.exit(1);
}

// Modo de autenticação. PADRÃO = OAUTH_USUARIO (comportamento histórico, inalterado). DOMAIN_DELEGATION é opt-in explícito,
// somente leitura, uma caixa por execução, e só roda com autorização corporativa + permissão técnica + coleta habilitada
// registradas em email_mailbox_collection_controls (ver scripts/lib/gmail-mailbox-gate.mjs).
const DELEGATION =
  (process.env.ACC_GMAIL_AUTH_MODE ?? "OAUTH_USUARIO").trim().toUpperCase() === "DOMAIN_DELEGATION";
const MAX_MESSAGES = Number(process.env.ACC_GMAIL_MAX_MESSAGES ?? "") || null; // amostra controlada (só no modo delegação)
const TECHNICAL_CHECK_ONLY = process.env.ACC_GMAIL_TECHNICAL_CHECK_ONLY === "true";

function required(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}


function gmailCredentialNames(mailbox) {
  const localPart = mailbox
    .split("@")[0]
    .replace(/[^a-z0-9]+/gi, "_")
    .toUpperCase();

  const specific = {
    clientId: `GOOGLE_GMAIL_${localPart}_CLIENT_ID`,
    clientSecret: `GOOGLE_GMAIL_${localPart}_CLIENT_SECRET`,
    refreshToken: `GOOGLE_GMAIL_${localPart}_REFRESH_TOKEN`,
  };

  if (
    process.env[specific.clientId]?.trim() &&
    process.env[specific.clientSecret]?.trim() &&
    process.env[specific.refreshToken]?.trim()
  ) {
    return specific;
  }

  return {
    clientId: "GOOGLE_GMAIL_INBOUND_CLIENT_ID",
    clientSecret: "GOOGLE_GMAIL_INBOUND_CLIENT_SECRET",
    refreshToken: "GOOGLE_GMAIL_INBOUND_REFRESH_TOKEN",
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAddresses(value) {
  if (!value) return [];

  return Array.from(
    new Set(
      (value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])
        .map((address) => address.toLowerCase())
    )
  );
}

function getHeader(headers, name) {
  return (
    headers.find(
      (header) =>
        header.name?.toLowerCase() === name.toLowerCase()
    )?.value ?? null
  );
}


function normalizeProjectText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function matchesConfiguredProjectScope({
  subject,
  bodyText,
  snippet,
  from,
  recipients,
  clientDomains,
  keywords,
  exactSubjects,
  requireMatch,
}) {
  if (!requireMatch) {
    return true;
  }

  const participantDomains =
    [...from, ...recipients]
      .map(domainOf)
      .filter(Boolean);

  const hasClientParticipant =
    participantDomains.some(
      (domain) => clientDomains.has(domain)
    );

  if (hasClientParticipant) {
    return true;
  }

  const contentText =
    [subject, bodyText, snippet]
      .map(normalizeProjectText)
      .join(" ");

  const hasKeyword =
    keywords.some((term) =>
      contentText.includes(
        normalizeProjectText(term)
      )
    );

  if (hasKeyword) {
    return true;
  }

  const normalizedSubject =
    normalizeProjectText(subject);

  const hasApprovedSubject =
    exactSubjects.some(
      (approvedSubject) =>
        normalizedSubject ===
        normalizeProjectText(approvedSubject)
    );

  return hasApprovedSubject;
}

function domainOf(address) {
  return address.split("@")[1]?.toLowerCase() ?? null;
}

function evaluate(headers, mailbox, allowedDomains) {
  const from = extractAddresses(getHeader(headers, "From"));

  const recipients = Array.from(
    new Set([
      ...extractAddresses(getHeader(headers, "To")),
      ...extractAddresses(getHeader(headers, "Cc")),
      ...extractAddresses(getHeader(headers, "Bcc")),
    ])
  );

  const addresses = Array.from(
    new Set([...from, ...recipients])
  );

  const rejectedDomains = Array.from(
    new Set(
      addresses
        .map(domainOf)
        .filter(Boolean)
        .filter((domain) => !allowedDomains.has(domain))
    )
  );

  const outbound = from.includes(mailbox);

  return {
    eligible: rejectedDomains.length === 0,
    direction: outbound ? "OUTBOUND" : "INBOUND",
    from,
    recipients,
  };
}

async function getMessage(gmail, id) {
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      return await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
    } catch (error) {
      const status =
        error?.status ??
        error?.code ??
        error?.response?.status;

      // Retentativa LIMITADA e só para cota/indisponibilidade. No modo delegação, 403 de PERMISSÃO não é repetido
      // (repetir não muda nada); o caminho histórico mantém o comportamento anterior.
      const retryable = DELEGATION
        ? isRetryableGmailError(error)
        : [403, 429, 500, 502, 503, 504].includes(status);
      if (!retryable || attempt === 6) {
        throw error;
      }

      const wait =
        Math.min(60000, 2000 * (2 ** attempt));

      console.log(
        `Gmail API temporariamente indisponível/quota. Retry em ${wait / 1000}s...`
      );

      await sleep(wait);
    }
  }
}

const supabase = createClient(
  required("NEXT_PUBLIC_SUPABASE_URL"),
  required("SUPABASE_SECRET_KEY"),
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

const { data: config, error: configError, status: configStatus } = await supabase
  .from("project_email_ingestion_configs")
  .select("*")
  .eq("project_id", PROJECT_ID)
  .single();

// Falha de comunicação NÃO pode ser reportada como "configuração não encontrada" (incidente 25/11/2026, runs
// 45552370563 e 45588517558: o edge log registrou HTTP 522 neste GET e o job imprimiu "não encontrada").
// "Não encontrada" só quando o PostgREST respondeu de fato que não há linha (PGRST116) ou devolveu vazio com sucesso.
if (configError && configError.code !== "PGRST116") {
  throw new Error(
    `Falha ao ler a configuração de ingestão (HTTP ${configStatus ?? "?"}${configError.code ? `, ${configError.code}` : ""}): ` +
    (configError.message || "sem mensagem")
  );
}

if (!config && configStatus !== 200 && configStatus !== 406) {
  throw new Error(
    `Falha ao ler a configuração de ingestão (HTTP ${configStatus ?? "?"}, resposta sem dados).`
  );
}

if (!config) {
  throw new Error("Configuração de ingestão não encontrada.");
}

if (!config.enabled) {
  console.log("");
  console.log("Monitoramento Gmail desativado para este projeto.");
  console.log("Nenhuma sincronização foi executada.");
  process.exit(0);
}

if (!config.last_sync_at && !DELEGATION) {
  throw new Error(
    "last_sync_at inexistente. O backfill precisa ser executado primeiro."
  );
}

const { data: mailboxes, error: mailboxError } =
  await supabase
    .from("project_email_ingestion_mailboxes")
    .select("mailbox_address")
    .eq("config_id", config.id)
    .eq("enabled", true);

if (mailboxError) {
  throw new Error(mailboxError.message);
}

const { data: domains, error: domainError } =
  await supabase
    .from("project_email_ingestion_domains")
    .select("domain,domain_role")
    .eq("config_id", config.id)
    .eq("enabled", true);

if (domainError) {
  throw new Error(domainError.message);
}

const mailbox =
  required("GOOGLE_GMAIL_INBOUND_MAILBOX")
    .toLowerCase();

if (
  !mailboxes.some(
    (row) =>
      row.mailbox_address.toLowerCase() === mailbox
  )
) {
  throw new Error(
    `Mailbox ${mailbox} não autorizada para o projeto.`
  );
}

let mailboxControl = null;
if (DELEGATION) {
  // Estado ATUAL desta (obra, caixa): controle + lista da obra + aceite individual (o mais restritivo vale).
  // Tabela de controles ausente/ilegível => FALHA FECHADA com mensagem clara (nada é lido do Gmail).
  const decision = await prepareDelegatedRun({
    supabase,
    projectId: PROJECT_ID,
    mailbox,
    mode: TECHNICAL_CHECK_ONLY ? "technical_check" : "collect",
  });
  if (decision.failClosed) {
    console.error(decision.reason);
    process.exit(1);
  }
  mailboxControl = decision.state.control;
  if (!decision.proceed) {
    console.log(`${TECHNICAL_CHECK_ONLY ? "Teste técnico" : "Coleta"} da caixa ${mailbox} BLOQUEADO: ${decision.blockers.join(", ")}`);
    console.log("Nenhuma mensagem foi lida.");
    if (mailboxControl && !TECHNICAL_CHECK_ONLY) {
      await supabase.rpc("record_mailbox_sync_result", {
        p_project_id: PROJECT_ID, p_mailbox: mailbox, p_status: "BLOQUEADA", p_detail: decision.blockers.join(",").slice(0, 280), p_imported: 0, p_synced_through: null,
      });
    }
    process.exit(0);
  }

  // Qualquer falha daqui em diante fica REGISTRADA na própria caixa (erro do teste técnico => FALHA; erro da coleta =>
  // ERRO, que conta para o teto de retentativas). Só o código/HTTP do erro, nunca tokens ou conteúdo.
  process.on("uncaughtException", async (error) => {
    const detail = safeErrorDetail(error);
    console.error(`Falha na caixa ${mailbox}: ${detail}`);
    try {
      if (TECHNICAL_CHECK_ONLY) {
        await supabase.rpc("record_mailbox_technical_check", { p_project_id: PROJECT_ID, p_mailbox: mailbox, p_ok: false, p_detail: detail });
      } else {
        await supabase.rpc("record_mailbox_sync_result", {
          p_project_id: PROJECT_ID, p_mailbox: mailbox, p_status: "ERRO", p_detail: detail, p_imported: 0, p_synced_through: null,
        });
      }
    } catch (recordError) {
      console.error(`Não foi possível registrar a falha: ${safeErrorDetail(recordError)}`);
    }
    process.exit(1);
  });
} else {
  // Caminho histórico (refresh token): continua igual, mas uma RECUSA ou REVOGAÇÃO explícita do aceite individual
  // desta caixa nesta obra para a coleta na hora. Ausência de linha não muda o comportamento histórico.
  const { data: consentRows, error: consentError } = await supabase
    .from("email_access_authorizations")
    .select("id,account_email,status,requested_at,decided_at")
    .eq("project_id", PROJECT_ID)
    .eq("account_email", mailbox);
  if (consentError) {
    throw new Error(`Aceites individuais ilegíveis (falha fechada): ${consentError.message}`);
  }
  const consent = deriveIndividualConsent(consentRows ?? [], mailbox);
  if (consent.status === "RECUSADO" || consent.status === "REVOGADO") {
    console.log(`Coleta da caixa ${mailbox} BLOQUEADA: aceite individual ${consent.status}. Nenhuma mensagem foi lida.`);
    process.exit(0);
  }
}

const allowedDomains =
  new Set(
    domains.map(
      (row) => row.domain.toLowerCase()
    )
  );

const clientDomains =
  new Set(
    domains
      .filter(
        (row) =>
          String(row.domain_role ?? "")
            .toUpperCase() === "CLIENT"
      )
      .map(
        (row) =>
          row.domain.toLowerCase()
      )
  );

const scopeKeywords =
  Array.isArray(config.scope_keywords)
    ? config.scope_keywords
    : [];

const scopeExactSubjects =
  Array.isArray(config.scope_exact_subjects)
    ? config.scope_exact_subjects
    : [];

const requireProjectScopeMatch =
  config.require_project_scope_match !== false;

/*
 * Overlap de 10 minutos.
 * Mesmo que uma mensagem apareça atrasada no Gmail,
 * a janela se sobrepõe à sincronização anterior.
 *
 * O índice único de provider_message_id protege
 * contra duplicação.
 */
// Delegação: cursor PRÓPRIO da caixa; a sobreposição nunca recua para antes do início do período autorizado e a
// janela nunca passa do fim do período.
const delegatedWindow = DELEGATION && !TECHNICAL_CHECK_ONLY ? resolveDelegatedReadWindow(mailboxControl) : null;
if (DELEGATION && !TECHNICAL_CHECK_ONLY && !delegatedWindow) {
  throw new Error("Caixa sem período inicial (period_start) nem última sincronização: defina o período autorizado.");
}
const lastSyncAt =
  DELEGATION ? (delegatedWindow?.start ?? new Date()) : new Date(config.last_sync_at);

const overlapStart =
  delegatedWindow
    ? delegatedWindow.overlapStart
    : new Date(
      lastSyncAt.getTime() -
      10 * 60 * 1000
    );

const syncStartedAt =
  delegatedWindow ? delegatedWindow.end : new Date(); // delegação: nunca lê além do fim do período autorizado

/*
 * Gmail API aceita epoch seconds em after:/before:.
 * Assim evitamos reler o dia inteiro.
 */
const afterEpoch =
  Math.floor(
    overlapStart.getTime() / 1000
  );

const beforeEpoch =
  Math.ceil(
    syncStartedAt.getTime() / 1000
  );

const senderFilter = pilotSenderTerms(
  PROJECT_ID,
  Array.from(allowedDomains).map((domain) => `from:${domain}`).join(" ")
);

const query =
  `after:${afterEpoch} before:${beforeEpoch} {${senderFilter}} ${pilotSenderQuery(PROJECT_ID)}`.trim();

let auth;
if (DELEGATION) {
  const delegated = await createDelegatedGmailAuth({ mailbox });
  auth = delegated.auth;
  console.log(`Autenticação: delegação em todo o domínio (${delegated.mode}), somente leitura, caixa ${mailbox}.`);
} else {
  const credentialNames =
    gmailCredentialNames(mailbox);

  auth =
    new google.auth.OAuth2(
      required(credentialNames.clientId),
      required(credentialNames.clientSecret)
    );

  auth.setCredentials({
    refresh_token:
      required(credentialNames.refreshToken),
  });
}

const gmail =
  google.gmail({
    version: "v1",
    auth,
  });

const profile =
  await gmail.users.getProfile({
    userId: "me",
  });

if (
  profile.data.emailAddress?.toLowerCase() !== mailbox
) {
  throw new Error(
    "A mailbox autenticada no Gmail não coincide com a mailbox configurada."
  );
}

if (DELEGATION && TECHNICAL_CHECK_ONLY) {
  // Teste técnico: o perfil abaixo já provou a delegação (e a caixa). Registra e encerra SEM ler mensagens.
  // Sucesso só com persistência confirmada: erro do registro falha a execução.
  const { error: techError } = await supabase.rpc("record_mailbox_technical_check", {
    p_project_id: PROJECT_ID, p_mailbox: mailbox, p_ok: true, p_detail: "getProfile ok; escopo gmail.readonly",
  });
  if (techError) {
    console.error(`Teste técnico OK no Google, mas o registro falhou: ${techError.message}`);
    process.exit(1);
  }
  console.log(`Teste técnico OK para ${mailbox}. Nenhuma mensagem lida.`);
  process.exit(0);
}

console.log("");
console.log(
  "AXION Gmail - SINCRONIZAÇÃO INCREMENTAL"
);
console.log(
  "======================================="
);
console.log(
  "Último sync:",
  lastSyncAt.toISOString()
);
console.log(
  "Overlap desde:",
  overlapStart.toISOString()
);
console.log(
  "Mailbox:",
  mailbox
);
console.log("");

let pageToken;
const ids = [];

do {
  const response =
    await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 500,
      pageToken,
      includeSpamTrash: false,
    });

  for (
    const message
    of response.data.messages ?? []
  ) {
    if (message.id) {
      ids.push(message.id);
    }
  }

  pageToken =
    response.data.nextPageToken ??
    undefined;

} while (pageToken);

if (DELEGATION && MAX_MESSAGES && ids.length > MAX_MESSAGES) {
  ids.length = MAX_MESSAGES; // amostra: o ponteiro de leitura NÃO avança (ver persistência no fim)
}

console.log(
  "Mensagens candidatas:",
  ids.length
);

const { data: existingRows, error: existingError } =
  await supabase
    .from("emails")
    .select("provider_message_id")
    .eq("project_id", PROJECT_ID)
    .eq("provider", "GMAIL")
    .eq("mailbox_address", mailbox)
    .gte(
      "sent_at",
      overlapStart.toISOString()
    );

if (existingError) {
  throw new Error(existingError.message);
}

const existingIds =
  new Set(
    (existingRows ?? [])
      .map(
        (row) =>
          row.provider_message_id
      )
      .filter(Boolean)
  );

const rows = [];

let eligible = 0;
let rejected = 0;
let duplicates = 0;
let inbound = 0;
let outbound = 0;

for (
  let index = 0;
  index < ids.length;
  index += 10
) {
  const batch =
    ids.slice(index, index + 10);

  const responses =
    await Promise.all(
      batch.map(
        (id) =>
          getMessage(gmail, id)
      )
    );

  for (const response of responses) {
    const message =
      response.data;

    if (
      !message.id ||
      !message.internalDate
    ) {
      continue;
    }

    const occurredAt =
      new Date(
        Number(message.internalDate)
      );

    if (
      occurredAt < overlapStart ||
      occurredAt > syncStartedAt
    ) {
      continue;
    }

    const headers =
      message.payload?.headers ?? [];

    const { bodyText, bodyHtml } =
      extractGmailBody(message);

    const policy =
      evaluate(
        headers,
        mailbox,
        allowedDomains
      );

    const subject =
      getHeader(headers, "Subject") ??
      "(sem assunto)";

    const projectMatch =
      matchesConfiguredProjectScope({
        subject,
        bodyText,
        snippet:
          message.snippet ?? "",
        from:
          policy.from,
        recipients:
          policy.recipients,
        clientDomains,
        keywords:
          scopeKeywords,
        exactSubjects:
          scopeExactSubjects,
        requireMatch:
          requireProjectScopeMatch,
      });

    if (
      !pilotMessageEligible(PROJECT_ID, policy) ||
      !(projectMatch || pilotScopeBypass(PROJECT_ID))
    ) {
      rejected += 1;
      continue;
    }

    eligible += 1;

    if (
      existingIds.has(message.id)
    ) {
      duplicates += 1;
      continue;
    }

    if (
      policy.direction === "INBOUND"
    ) {
      inbound += 1;
    } else {
      outbound += 1;
    }

    rows.push({
      project_id:
        PROJECT_ID,

      from_address:
        policy.from[0] ?? "",

      to_address:
        policy.recipients.join(", "),

      subject,

      sent_at:
        occurredAt.toISOString(),

      snippet:
        message.snippet ?? "",

      body_text:
        bodyText || null,

      body_html:
        bodyHtml || null,

      body_fetched_at:
        new Date().toISOString(),

      provider:
        "GMAIL",

      provider_message_id:
        message.id,

      provider_thread_id:
        message.threadId ?? null,

      message_id_header:
        getHeader(
          headers,
          "Message-ID"
        ),

      mailbox_address:
        mailbox,

      direction:
        policy.direction,

      // Fase 5/A: cc/bcc/domínios só com a migration 20261201100000 aplicada (ACC_EMAILS_PARTICIPANT_COLUMNS=1).
      ...participantColumns(participantsFromGmailHeaders(headers)),
    });
  }

  /*
   * 10 requests/segundo aproximadamente.
   * Mantém margem abaixo da quota Gmail.
   */
  await sleep(1000);
}

if (DELEGATION) {
  // Revogação EFETIVA: relê o estado da caixa imediatamente antes de gravar. Revogada, desligada, fora do período
  // ou fora da lista durante a leitura => nada é gravado e o cursor não avança.
  const still = await assertStillCollectable({ supabase, projectId: PROJECT_ID, mailbox });
  if (!still.ok) {
    console.log(`Coleta da caixa ${mailbox} interrompida antes da gravação: ${still.reason ?? still.blockers.join(", ")}`);
    console.log("Nenhuma mensagem foi gravada.");
    await supabase.rpc("record_mailbox_sync_result", {
      p_project_id: PROJECT_ID, p_mailbox: mailbox, p_status: "BLOQUEADA",
      p_detail: `INTERROMPIDA_ANTES_DA_GRAVACAO:${still.blockers.join(",")}`.slice(0, 280), p_imported: 0, p_synced_through: null,
    });
    process.exit(0);
  }
}

let inserted = 0;

for (
  let index = 0;
  index < rows.length;
  index += 100
) {
  const batch =
    rows.slice(
      index,
      index + 100
    );

  const { error } =
    await supabase
      .from("emails")
      .insert(batch);

  if (!error) {
    inserted +=
      batch.length;

    continue;
  }

  /*
   * Fallback individual para corrida de concorrência.
   */
  for (const row of batch) {
    const result =
      await supabase
        .from("emails")
        .insert(row);

    if (!result.error) {
      inserted += 1;
    } else if (
      result.error.code === "23505"
    ) {
      duplicates += 1;
    } else {
      throw new Error(
        result.error.message
      );
    }
  }
}

const completedAt =
  new Date().toISOString();

if (DELEGATION) {
  // Modo delegação: estado POR CAIXA (o last_sync_at compartilhado da configuração não é tocado).
  const sampleRun = Boolean(MAX_MESSAGES);
  const { error: recordError } = await supabase.rpc("record_mailbox_sync_result", {
    p_project_id: PROJECT_ID,
    p_mailbox: mailbox,
    p_status: "SUCESSO",
    p_detail: `${inserted} novas; ${duplicates} duplicadas; ${rejected} rejeitadas pelo perímetro${sampleRun ? " (AMOSTRA: ponteiro não avançou)" : ""}.`,
    p_imported: inserted,
    p_synced_through: sampleRun ? null : syncStartedAt.toISOString(), // início da janela lida (mensagens chegadas durante a leitura não são puladas)
  });
  if (recordError) throw new Error(recordError.message);
}

const { error: updateError } = DELEGATION
  ? { error: null }
  : await supabase
    .from(
      "project_email_ingestion_configs"
    )
    .update({
      last_sync_at:
        completedAt,

      updated_at:
        completedAt,
    })
    .eq("id", config.id);

if (updateError) {
  throw new Error(
    updateError.message
  );
}

const { error: integrationError } = DELEGATION
  ? { error: null }
  : await supabase
    .from("project_integrations")
    .update({
      status:
        "CONECTADO",

      last_sync_at:
        completedAt,

      detail:
        `Sincronização incremental Gmail concluída: ` +
        `${inserted} novas mensagens. ` +
        `Monitoramento automático ainda ` +
        `${config.enabled ? "habilitado" : "desabilitado"}.`,

      updated_at:
        completedAt,
    })
    .eq(
      "project_id",
      PROJECT_ID
    )
    .eq(
      "source_type",
      "EMAIL"
    );

if (integrationError) {
  throw new Error(
    integrationError.message
  );
}

const { error: auditError } =
  await supabase
    .from("audit_log_entries")
    .insert({
      project_id:
        PROJECT_ID,

      actor_type:
        "SYSTEM",

      actor_user_id:
        null,

      actor_label:
        null,

      action:
        "Sincronização incremental Gmail executada",

      entity_type:
        "EmailIngestionRun",

      entity_id:
        `GMAIL-INCREMENTAL:${completedAt}`,

      detail:
        `${inserted} novas; ` +
        `${duplicates} duplicadas; ` +
        `${rejected} rejeitadas pelo perímetro.`,
    });

if (auditError) {
  throw new Error(
    auditError.message
  );
}

console.log("");
console.log("RESULTADO");
console.log("---------");

console.table([
  {
    candidatas:
      ids.length,

    elegiveis:
      eligible,

    inseridas:
      inserted,

    duplicadas:
      duplicates,

    inbound_novas:
      inbound,

    outbound_novas:
      outbound,

    rejeitadas:
      rejected,

    monitoramento_automatico:
      config.enabled,
  },
]);

console.log("");
console.log(
  "SINCRONIZAÇÃO INCREMENTAL concluída."
);
