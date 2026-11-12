// Apenas SELECT pelo cliente de sessão (RLS). Nunca lê tokens OAuth nem conteúdo de e-mails ou arquivos.
// Cada bloco falha isoladamente: erro de consulta vira "sem comprovação" (nunca verde) e a página continua.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MailboxEvidence, MatrixEvidence, SharedEvidence } from "./user-integration-matrix";

type Row = Record<string, unknown>;

async function pages(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(offset, offset + 999);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const { count: value, error } = await query;
  return error ? null : value ?? 0;
}

const tally = (rows: Row[] | null, field: string) => {
  const map = new Map<string, number>();
  for (const row of rows ?? []) map.set(String(row[field]), (map.get(String(row[field])) ?? 0) + 1);
  return map;
};
const sum = (map: Map<string, number>) => [...map.values()].reduce((a, b) => a + b, 0);

export async function getUserIntegrationEvidence(supabase: SupabaseClient, projectId: string): Promise<MatrixEvidence> {
  const warnings: string[] = [];
  const [auth, controls, emailRows, attachmentRows, unassigned, ingestionConfig, recipientConfig, emailIntegration, systemOutput] = await Promise.all([
    supabase.from("email_access_authorizations").select("user_id,account_email,status,requested_at").eq("project_id", projectId).order("requested_at", { ascending: false }),
    supabase.from("email_mailbox_collection_controls").select("mailbox_address,technical_permission_status,collection_enabled,individual_consent_status,corporate_authorization_status,period_start,period_end,revoked_at,last_sync_at,last_sync_status").eq("project_id", projectId),
    pages((from, to) => supabase.from("emails").select("mailbox_address,sent_at").eq("project_id", projectId).eq("provider", "GMAIL").not("mailbox_address", "is", null).order("id").range(from, to)),
    pages((from, to) => supabase.from("email_attachments").select("processing_status,storage_path,emails!inner(mailbox_address)").eq("project_id", projectId).order("id").range(from, to)),
    count(supabase.from("emails").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("provider", "GMAIL").is("mailbox_address", null)),
    supabase.from("project_email_ingestion_configs").select("id,enabled,window_mode,custom_start_at,custom_end_at,monitoring_started_at,last_sync_at").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_weekly_schedule_ingestion_configs").select("pilot_recipient_allowlist_user_ids").eq("project_id", projectId).maybeSingle(),
    supabase.from("project_integrations").select("status").eq("project_id", projectId).eq("source_type", "EMAIL").maybeSingle(),
    count(supabase.from("emails").select("id", { count: "exact", head: true }).eq("project_id", projectId).is("provider", null).is("mailbox_address", null)),
  ]);
  if (auth.error) warnings.push("Não foi possível conferir os aceites individuais.");
  if (controls.error) warnings.push("O controle técnico de coleta por caixa não está disponível em produção (tabela ausente ou ilegível). A coleta atual é avaliada pela execução do coletor OAuth, atribuída somente à caixa autenticada por ele; as demais caixas ficam NÃO COMPROVADAS e as importações já feitas valem apenas como histórico.");
  if (emailRows === null) warnings.push("Não foi possível conferir as mensagens importadas por caixa.");
  if (attachmentRows === null) warnings.push("Não foi possível conferir os anexos por caixa.");

  let ingestion: MatrixEvidence["ingestion"] = null;
  if (!ingestionConfig.error && ingestionConfig.data) {
    const mailboxRows = await supabase.from("project_email_ingestion_mailboxes").select("mailbox_address,enabled").eq("config_id", ingestionConfig.data.id);
    if (!mailboxRows.error) ingestion = { projectEnabled: ingestionConfig.data.enabled === true, mailboxes: (mailboxRows.data ?? []).map((r) => ({ mailbox: String(r.mailbox_address), enabled: r.enabled === true })) };
  }
  if (!ingestion) warnings.push("Não foi possível conferir a habilitação das caixas na configuração de ingestão.");

  let mailboxes: MailboxEvidence[] | null = null;
  if (emailRows !== null) {
    const map = new Map<string, MailboxEvidence>();
    const get = (mailbox: string) => map.get(mailbox) ?? (map.set(mailbox, { mailbox, emails: 0, bodiesAvailable: null, lastMessageAt: null, attachments: 0, attachmentsStored: 0, attachmentsProcessed: 0, attachmentsPending: 0, attachmentsError: 0 }), map.get(mailbox)!);
    for (const row of emailRows) {
      const item = get(String(row.mailbox_address).trim().toLowerCase());
      item.emails++;
      const sent = row.sent_at as string | null;
      if (sent && (!item.lastMessageAt || Date.parse(sent) > Date.parse(item.lastMessageAt))) item.lastMessageAt = sent;
    }
    for (const row of attachmentRows ?? []) {
      const owner = row.emails as { mailbox_address?: string | null } | null;
      if (!owner?.mailbox_address) continue;
      const item = get(owner.mailbox_address.trim().toLowerCase());
      item.attachments++;
      if (row.storage_path) item.attachmentsStored++;
      if (row.processing_status === "PROCESSED") item.attachmentsProcessed++;
      else if (row.processing_status === "PENDING") item.attachmentsPending++;
      else item.attachmentsError++;
    }
    // Disponibilidade do corpo: contagem no servidor (sem trazer o conteúdo).
    await Promise.all([...map.values()].map(async (item) => {
      item.bodiesAvailable = await count(supabase.from("emails").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("provider", "GMAIL").eq("mailbox_address", item.mailbox).or("body_text.neq.,body_html.neq."));
    }));
    mailboxes = [...map.values()];
  }

  const oauth: MatrixEvidence["oauth"] = !ingestionConfig.error && ingestionConfig.data ? {
    enabled: ingestionConfig.data.enabled === true, windowMode: (ingestionConfig.data.window_mode as string) ?? null,
    customStartAt: (ingestionConfig.data.custom_start_at as string) ?? null, customEndAt: (ingestionConfig.data.custom_end_at as string) ?? null,
    monitoringStartedAt: (ingestionConfig.data.monitoring_started_at as string) ?? null, lastSyncAt: (ingestionConfig.data.last_sync_at as string) ?? null,
    integrationStatus: emailIntegration.error ? null : ((emailIntegration.data?.status as string) ?? null),
  } : null;
  const shared = await getSharedEvidence(supabase, projectId, warnings);
  return {
    measuredAt: new Date().toISOString(),
    alertRecipientUserIds: recipientConfig.error ? null : ((recipientConfig.data?.pilot_recipient_allowlist_user_ids as string[] | null) ?? []),
    authorizations: auth.error ? null : (auth.data as MatrixEvidence["authorizations"]),
    controls: controls.error ? null : (controls.data as MatrixEvidence["controls"]),
    ingestion,
    mailboxes: emailRows === null ? null : mailboxes,
    unassignedEmails: unassigned,
    systemOutputEmails: systemOutput,
    oauth,
    shared,
    warnings,
  };
}

async function getSharedEvidence(supabase: SupabaseClient, projectId: string, warnings: string[]): Promise<SharedEvidence> {
  const [integrations, diarioRuns, diarioCount, cmRuns, cmLinks, workbooks, sheets, ssmaSubmissions, ssmaPhotos] = await Promise.all([
    supabase.from("project_integrations").select("source_type,status,last_sync_at,last_connection_check_at,last_connection_error").eq("project_id", projectId),
    supabase.from("diario_de_obra_sync_runs").select("status,completed_at,error_count,created_count").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1),
    count(supabase.from("diario_de_obra_reports").select("id", { count: "exact", head: true }).eq("project_id", projectId)),
    supabase.from("construmanager_sync_runs").select("status,completed_at").eq("project_id", projectId).order("started_at", { ascending: false }).limit(1),
    pages((from, to) => supabase.from("construmanager_content_links").select("download_status,requires_human_decision").eq("project_id", projectId).order("id").range(from, to)),
    pages((from, to) => supabase.from("weekly_report_workbooks").select("status,created_at").eq("project_id", projectId).order("id").range(from, to)),
    pages((from, to) => supabase.from("weekly_report_sheets").select("status").eq("project_id", projectId).order("id").range(from, to)),
    count(supabase.from("ssma_form_submissions").select("id", { count: "exact", head: true }).eq("project_id", projectId)),
    pages((from, to) => supabase.from("ssma_submission_photos").select("drive_sync_status,drive_file_id").eq("project_id", projectId).order("id").range(from, to)),
  ]);
  const integ = (type: string) => (integrations.data as Row[] | null)?.find((row) => row.source_type === type) ?? null;
  const run = (diarioRuns.data as Row[] | null)?.[0] ?? null;
  const cmRun = (cmRuns.data as Row[] | null)?.[0] ?? null;
  if (integrations.error) warnings.push("Não foi possível conferir o estado das integrações da obra.");
  const cm = tally(cmLinks, "download_status");
  const wb = tally(workbooks, "status");
  const sh = tally(sheets, "status");
  const ph = tally(ssmaPhotos, "drive_sync_status");
  // SINCRONIZADA só conta com identificador do arquivo no Drive (status isolado não prova acesso ao material).
  const syncedWithFile = (ssmaPhotos ?? []).filter((r) => r.drive_sync_status === "SYNCED" && r.drive_file_id).length;
  const ssma = integ("ESG_SSMA");
  const wbDates = (workbooks ?? []).map((r) => String(r.created_at)).sort();
  return {
    diario: integrations.error || diarioCount === null || diarioRuns.error ? null : {
      reports: diarioCount, lastRunStatus: (run?.status as string) ?? null, lastRunAt: (run?.completed_at as string) ?? null,
      lastRunErrors: run ? Number(run.error_count) : null, lastRunCreated: run ? Number(run.created_count) : null,
      integrationStatus: (integ("DIARIO_OBRA")?.status as string) ?? null,
    },
    weekly: workbooks === null || sheets === null ? null : {
      workbooks: sum(wb), workbooksExtracted: wb.get("EXTRACTED") ?? 0, workbooksPartial: wb.get("PARTIAL") ?? 0, workbooksPendingReview: wb.get("PENDING_HUMAN_REVIEW") ?? 0,
      workbooksOther: sum(wb) - (wb.get("EXTRACTED") ?? 0) - (wb.get("PARTIAL") ?? 0) - (wb.get("PENDING_HUMAN_REVIEW") ?? 0),
      sheets: sum(sh), sheetsExtracted: sh.get("EXTRACTED") ?? 0, sheetsPartial: sh.get("PARTIAL") ?? 0, sheetsMissing: sh.get("MISSING_SHEET") ?? 0, sheetsPendingReview: sh.get("PENDING_HUMAN_REVIEW") ?? 0,
      sheetsOther: sum(sh) - (sh.get("EXTRACTED") ?? 0) - (sh.get("PARTIAL") ?? 0) - (sh.get("MISSING_SHEET") ?? 0) - (sh.get("PENDING_HUMAN_REVIEW") ?? 0),
      lastAt: wbDates.length ? wbDates[wbDates.length - 1] : null,
    },
    construmanager: integrations.error || cmLinks === null || cmRuns.error ? null : {
      integrationStatus: (integ("CONSTRUMANAGER")?.status as string) ?? null, lastRunStatus: (cmRun?.status as string) ?? null, lastRunAt: (cmRun?.completed_at as string) ?? null,
      stored: cm.get("ARMAZENADO") ?? 0, pending: cm.get("PENDENTE") ?? 0,
      humanDecision: cmLinks.filter((r) => r.requires_human_decision === true).length,
      other: sum(cm) - (cm.get("ARMAZENADO") ?? 0) - (cm.get("PENDENTE") ?? 0),
    },
    ssma: integrations.error || ssmaSubmissions === null || ssmaPhotos === null ? null : {
      integrationStatus: (ssma?.status as string) ?? null, lastSyncAt: (ssma?.last_sync_at as string) ?? null,
      lastCheckAt: (ssma?.last_connection_check_at as string) ?? null, lastCheckError: Boolean(ssma?.last_connection_error),
      submissions: ssmaSubmissions, photos: sum(ph), photosSynced: syncedWithFile,
      photosFailed: ph.get("FAILED") ?? 0, photosPending: sum(ph) - syncedWithFile - (ph.get("FAILED") ?? 0),
    },
  };
}
