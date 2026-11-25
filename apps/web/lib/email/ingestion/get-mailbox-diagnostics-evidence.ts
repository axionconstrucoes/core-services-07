// Coleta das evidências por caixa, SOMENTE leitura pelo cliente de sessão (RLS). Nunca lê tokens nem conteúdo de e-mails.
// Cada bloco falha isoladamente: consulta com erro vira "indisponível" (nunca "comprovado").
import type { SupabaseClient } from "@supabase/supabase-js";

import type { DiagnosticsCounts, DiagnosticsControl, MailboxDiagnosticsEvidence } from "./mailbox-diagnostics";

type Row = Record<string, unknown>;

const CONTROL_COLUMNS =
  "mailbox_address,auth_mode,corporate_authorization_status,corporate_authorized_at,corporate_authorization_ref,individual_consent_status," +
  "technical_permission_status,technical_checked_at,technical_check_detail,collection_enabled,period_start,period_end," +
  "last_sync_at,last_sync_status,last_sync_detail,last_sync_imported,revoked_at,revoked_reason,updated_at";

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  return /does not exist|could not find the table|schema cache/i.test(String(error.message ?? ""));
}

async function pages(build: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[] | null> {
  const out: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await build(offset, offset + 999);
    if (error) return null;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

async function loadControls(supabase: SupabaseClient, projectId: string): Promise<Pick<MailboxDiagnosticsEvidence, "controls" | "controlsAvailability">> {
  // Colunas da migration 20261121110000 são opcionais: se ainda não existirem, lê sem elas.
  const full = await supabase.from("email_mailbox_collection_controls").select(`${CONTROL_COLUMNS},consecutive_errors,last_error_at`).eq("project_id", projectId);
  if (!full.error) return { controls: (full.data ?? []) as unknown as DiagnosticsControl[], controlsAvailability: "OK" };
  if (isMissingRelation(full.error) && !/column/i.test(full.error.message ?? "")) return { controls: [], controlsAvailability: "MISSING" };
  const basic = await supabase.from("email_mailbox_collection_controls").select(CONTROL_COLUMNS).eq("project_id", projectId);
  if (!basic.error) return { controls: (basic.data ?? []) as unknown as DiagnosticsControl[], controlsAvailability: "OK" };
  return { controls: [], controlsAvailability: isMissingRelation(basic.error) ? "MISSING" : "ERROR" };
}

export async function getMailboxDiagnosticsEvidence(supabase: SupabaseClient, projectId: string): Promise<MailboxDiagnosticsEvidence> {
  const [members, config, controls, authorizations, emailRows, attachmentRows, unassigned] = await Promise.all([
    supabase.from("project_memberships").select("user_id,permission,status,profiles(name,email)").eq("project_id", projectId),
    supabase.from("project_email_ingestion_configs").select("id,enabled,last_sync_at").eq("project_id", projectId).maybeSingle(),
    loadControls(supabase, projectId),
    supabase.from("email_access_authorizations").select("id,user_id,account_email,status,requested_at,decided_at").eq("project_id", projectId),
    pages((from, to) => supabase.from("emails").select("mailbox_address,sent_at").eq("project_id", projectId).eq("provider", "GMAIL").not("mailbox_address", "is", null).order("id").range(from, to)),
    pages((from, to) => supabase.from("email_attachments").select("processing_status,storage_path,emails!inner(mailbox_address)").eq("project_id", projectId).order("id").range(from, to)),
    supabase.from("emails").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("provider", "GMAIL").is("mailbox_address", null),
  ]);

  let allowlist: MailboxDiagnosticsEvidence["allowlist"] = null;
  if (!config.error) {
    if (!config.data) allowlist = [];
    else {
      const rows = await supabase.from("project_email_ingestion_mailboxes").select("mailbox_address,enabled").eq("config_id", config.data.id);
      if (!rows.error) allowlist = (rows.data ?? []).map((row) => ({ mailbox: String(row.mailbox_address).trim().toLowerCase(), enabled: row.enabled === true }));
    }
  }

  let counts: Record<string, DiagnosticsCounts> | null = null;
  if (emailRows !== null && attachmentRows !== null) {
    counts = {};
    const get = (mailbox: string) =>
      (counts![mailbox] ??= { emails: 0, bodies: 0, lastMessageAt: null, attachments: 0, attachmentsStored: 0, attachmentsProcessed: 0, attachmentsPending: 0, attachmentsFailed: 0 });
    for (const row of emailRows) {
      const item = get(String(row.mailbox_address).trim().toLowerCase());
      item.emails += 1;
      const sent = row.sent_at as string | null;
      if (sent && (!item.lastMessageAt || Date.parse(sent) > Date.parse(item.lastMessageAt))) item.lastMessageAt = sent;
    }
    for (const row of attachmentRows) {
      const owner = row.emails as { mailbox_address?: string | null } | null;
      if (!owner?.mailbox_address) continue;
      const item = get(owner.mailbox_address.trim().toLowerCase());
      item.attachments += 1;
      if (row.storage_path) item.attachmentsStored += 1;
      if (row.processing_status === "PROCESSED") item.attachmentsProcessed += 1;
      else if (row.processing_status === "PENDING") item.attachmentsPending += 1;
      else item.attachmentsFailed += 1;
    }
    // Corpo disponível: contagem no servidor, sem trazer o conteúdo.
    await Promise.all(Object.entries(counts).map(async ([mailbox, item]) => {
      const { count, error } = await supabase.from("emails").select("id", { count: "exact", head: true })
        .eq("project_id", projectId).eq("provider", "GMAIL").eq("mailbox_address", mailbox).or("body_text.neq.,body_html.neq.");
      item.bodies = error ? null : count ?? 0;
    }));
  }

  return {
    measuredAt: new Date().toISOString(),
    members: members.error ? null : (members.data ?? []).map((row) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const p = profile as { name?: string; email?: string } | null;
      return { userId: String(row.user_id), name: p?.name ?? "Colaborador", email: String(p?.email ?? "").toLowerCase(), permission: String(row.permission), status: String(row.status) };
    }),
    allowlist,
    projectIngestionEnabled: config.error ? null : config.data ? config.data.enabled === true : false,
    oauthProjectLastSyncAt: config.error ? null : ((config.data?.last_sync_at as string | null) ?? null),
    controlsAvailability: controls.controlsAvailability,
    controls: controls.controls,
    authorizations: authorizations.error ? null : ((authorizations.data ?? []) as MailboxDiagnosticsEvidence["authorizations"]),
    counts,
    unassignedEmails: unassigned.error ? null : unassigned.count ?? 0,
  };
}

export type ProcessedMessage = { id: string; subject: string; sentAt: string; direction: string | null; hasBody: boolean; attachments: { name: string; status: string; stored: boolean }[] };

/** Últimas mensagens EFETIVAMENTE importadas desta caixa (metadados; o corpo só é testado como presente/ausente). */
export async function getProcessedMessages(supabase: SupabaseClient, projectId: string, mailbox: string, limit = 20): Promise<ProcessedMessage[] | null> {
  const { data, error } = await supabase
    .from("emails")
    .select("id,subject,sent_at,direction,email_attachments(original_file_name,processing_status,storage_path)")
    .eq("project_id", projectId).eq("provider", "GMAIL").eq("mailbox_address", mailbox)
    .order("sent_at", { ascending: false }).limit(limit);
  if (error) return null;
  const ids = (data ?? []).map((row) => row.id as string);
  const withBody = new Set<string>();
  if (ids.length > 0) {
    const bodies = await supabase.from("emails").select("id").in("id", ids).or("body_text.neq.,body_html.neq.");
    for (const row of bodies.data ?? []) withBody.add(row.id as string);
  }
  return (data ?? []).map((row) => ({
    id: row.id as string,
    subject: String(row.subject ?? "(sem assunto)"),
    sentAt: String(row.sent_at),
    direction: (row.direction as string | null) ?? null,
    hasBody: withBody.has(row.id as string),
    attachments: ((row.email_attachments as Row[] | null) ?? []).map((att) => ({ name: String(att.original_file_name), status: String(att.processing_status), stored: Boolean(att.storage_path) })),
  }));
}
