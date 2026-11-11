// Manual: nenhuma busca de mensagens novas, nenhum envio e nenhuma chamada ao Drive.
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { pilotSenderMatches } from "./lib/gmail-weg-pilot-sender.mjs";
import { extractGmailBody } from "./lib/gmail-message-body.mjs";
import { RecoveryStageError, failureRecord } from "./lib/gmail-recovery-diagnostics.mjs";
import { RECOVERY, recoveryOptions, assertRecoveryAuthorization, isRecoveryRow, assertRecoveryMessage, collectRecoveryAttachments } from "./lib/gmail-recovery-policy.mjs";

export async function recoverExisting({ supabase, gmail, options, ingestAttachments }) {
  const checked = async (query) => {
    const { data, error } = await query;
    if (error) { const failure = new Error("Falha de consulta ao banco."); failure.recoveryDb = true; failure.code = /^[A-Za-z0-9_.-]{1,16}$/.test(String(error.code ?? "")) ? `DB_${error.code}` : "DB_ERRO"; throw failure; }
    return data;
  };

  async function assertAuthorized() {
    const config = await checked(supabase.from("project_email_ingestion_configs").select("id,project_id,enabled").eq("project_id", RECOVERY.projectId).single());
    const mailboxes = await checked(supabase.from("project_email_ingestion_mailboxes").select("mailbox_address,enabled").eq("config_id", config.id).eq("mailbox_address", RECOVERY.mailbox));
    const authorizations = await checked(supabase.from("email_access_authorizations").select("project_id,account_email,user_id,status,requested_at,decided_at,decided_by_user_id").eq("project_id", RECOVERY.projectId).eq("account_email", RECOVERY.mailbox).order("requested_at", { ascending: false }));
    assertRecoveryAuthorization(config, mailboxes, authorizations);
  }

  await assertAuthorized();
  if ((await gmail.users.getProfile({ userId: "me" })).data.emailAddress?.toLowerCase() !== RECOVERY.mailbox) throw new Error("Credencial autentica outra caixa.");

  // Paginação estável antes de atualizar: nenhum deslocamento causado pelo preenchimento dos corpos.
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await checked(supabase.from("emails")
      .select("id,project_id,provider,provider_message_id,provider_thread_id,mailbox_address,from_address,sent_at,body_text,body_html")
      .eq("project_id", RECOVERY.projectId).eq("provider", "GMAIL").eq("mailbox_address", RECOVERY.mailbox)
      .ilike("from_address", "%@weg.net")
      .gte("sent_at", RECOVERY.start).lte("sent_at", RECOVERY.end).order("id").range(offset, offset + 499));
    rows.push(...page);
    if (page.length < 500) break;
  }
  const missingMailbox = await supabase.from("emails").select("id", { count: "exact", head: true })
    .eq("project_id", RECOVERY.projectId).eq("provider", "GMAIL").is("mailbox_address", null)
    .gte("sent_at", RECOVERY.start).lte("sent_at", RECOVERY.end);
  if (missingMailbox.error) throw new Error(missingMailbox.error.message);
  const candidates = rows.filter(isRecoveryRow).filter((row) => options.kind !== "bodies" || (!row.body_text && !row.body_html));
  const batch = candidates.slice(0, options.limit);
  const stats = { modo: options.apply ? "APPLY" : "DRY_RUN", tipo: options.kind, candidatas: candidates.length, analisadas: 0, restantes: candidates.length - batch.length, sem_caixa_excluidas: missingMailbox.count, corpos: 0, anexos_pendentes: 0, anexos_gravados: 0, anexos_existentes: 0, falhas: 0, falhas_detalhe: [] };
  let ingest = ingestAttachments;
  if (options.kind === "attachments" && options.apply && !ingest) {
    register("./ts-module-resolver.mjs", import.meta.url);
    ({ ingestEmailAttachmentsForMessage: ingest } = await import("../apps/web/lib/email/attachments/ingest-email-attachments"));
  }
  for (const row of batch) {
    // Revogação ou desligamento interrompe a próxima leitura; falha de consulta bloqueia.
    await assertAuthorized();
    let stage = "gmail_get";
    try {
      const { data: message } = await gmail.users.messages.get({ userId: "me", id: row.provider_message_id, format: "full" });
      stage = "validar_mensagem";
      assertRecoveryMessage(row, message);
      stage = "validar_remetente";
      const fromHeader = (message.payload?.headers ?? []).find((item) => item.name?.toLowerCase() === "from")?.value ?? "";
      const addresses = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
      // Apenas a quantidade de endereços do cabeçalho é registrada (nunca os endereços).
      if (addresses.length !== 1) throw new RecoveryStageError(`REMETENTE_COM_${addresses.length}_ENDERECOS`);
      if (!pilotSenderMatches(RECOVERY.projectId, addresses)) throw new Error("Remetente diferente do piloto.");
      stats.analisadas++;
      stage = options.kind === "bodies" ? "extrair_corpo" : "consultar_anexos";
      if (options.kind === "bodies") {
        const { bodyText, bodyHtml } = extractGmailBody(message);
        if (!bodyText && !bodyHtml) throw new Error("Corpo vazio no provedor.");
        if (options.apply) {
          await assertAuthorized();
          // Não sobrescreve um corpo preenchido por outra execução.
          const changed = await checked(supabase.from("emails").update({ body_text: bodyText || null, body_html: bodyHtml || null, body_fetched_at: new Date().toISOString() })
            .eq("id", row.id).eq("project_id", RECOVERY.projectId).eq("mailbox_address", RECOVERY.mailbox)
            .or("body_text.is.null,body_text.eq.\"\"").or("body_html.is.null,body_html.eq.\"\"").select("id"));
          stats.corpos += changed.length;
        } else stats.corpos++;
      } else {
        stage = "consultar_anexos";
        const parts = collectRecoveryAttachments(message.payload);
        const existing = await checked(supabase.from("email_attachments").select("gmail_attachment_id").eq("project_id", RECOVERY.projectId).eq("email_id", row.id));
        const ids = new Set(existing.map((item) => item.gmail_attachment_id));
        const pending = parts.filter((part) => !ids.has(part.gmailAttachmentId));
        stage = "recuperar_gravar_anexos";
        stats.anexos_existentes += parts.length - pending.length;
        stats.anexos_pendentes += pending.length;
        if (options.apply && pending.length) {
          await assertAuthorized();
          const results = await ingest(supabase, {
            projectId: RECOVERY.projectId, emailId: row.id, gmailMessageId: row.provider_message_id,
            gmailThreadId: row.provider_thread_id, receivedAt: row.sent_at, parts: pending,
            downloadAttachmentBytes: async (part) => {
              await assertAuthorized();
              const { data } = await gmail.users.messages.attachments.get({ userId: "me", messageId: row.provider_message_id, id: part.gmailAttachmentId });
              return Buffer.from(data.data ?? "", "base64url");
            },
          });
          for (const result of results) {
            if (result.status === "INGESTED") stats.anexos_gravados++;
            else if (result.status === "ALREADY_INGESTED") stats.anexos_existentes++;
            else {
              stats.falhas++;
              const code = /^[A-Z_]{1,40}$/.test(String(result.status)) ? `RESULTADO_${result.status}` : "RESULTADO_NAO_CLASSIFICADO";
              stats.falhas_detalhe.push({ etapa: stage, email_id: String(row.id), codigo: code });
            }
          }
        }
      }
    } catch (error) {
      // Não publica assunto, corpo, nome de anexo nem resposta de provedor em logs públicos.
      stats.falhas++;
      const detail = failureRecord(stage, row.id, error);
      stats.falhas_detalhe.push(detail);
      console.error(`Falha na recuperação: etapa=${detail.etapa} email_id=${detail.email_id} codigo=${detail.codigo}; conteúdo omitido.`);
    }
  }
  return stats;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = recoveryOptions(process.argv.slice(2));
    const required = (name) => { const value = process.env[name]?.trim(); if (!value) throw new Error(`Variável obrigatória: ${name}`); return value; };
    const supabase = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
    const auth = new google.auth.OAuth2(required("GOOGLE_GMAIL_REYNALDO_CLIENT_ID"), required("GOOGLE_GMAIL_REYNALDO_CLIENT_SECRET"));
    auth.setCredentials({ refresh_token: required("GOOGLE_GMAIL_REYNALDO_REFRESH_TOKEN") });
    const gmail = google.gmail({ version: "v1", auth });
    const stats = await recoverExisting({ supabase, gmail, options });
    console.log(JSON.stringify(stats, null, 2));
    if (stats.falhas) process.exitCode = 1;
  } catch {
    console.error("Recuperação bloqueada ou interrompida; verificar autorização, caixa e configuração. Conteúdo omitido.");
    process.exitCode = 1;
  }
}
