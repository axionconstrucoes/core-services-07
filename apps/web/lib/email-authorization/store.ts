import "server-only";

import { createSupabaseServerClient } from "@axion/db/server";

import type { AuthorizationStatus, EmailAuthScopeSnapshot } from "./notice";

// Leituras da autorização de e-mails por obra. Tudo passa pela sessão do usuário: a RLS das tabelas só deixa
// o titular e os administradores da obra enxergarem as linhas (migration 20261029120000).

export interface EmailAuthorization {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userEmail: string;
  accountEmail: string;
  status: AuthorizationStatus;
  requestedAt: string;
  decidedAt: string | null;
  noticeVersion: string;
  scopeSnapshot: EmailAuthScopeSnapshot | null;
  connectionStatus: string | null;
}

export interface EmailAuthorizationEvent {
  id: string;
  eventType: "SOLICITADA" | "AUTORIZADA" | "RECUSADA" | "REVOGADA";
  actorName: string | null;
  occurredAt: string;
  noticeVersion: string;
  note: string | null;
}

type Row = {
  id: string;
  project_id: string;
  user_id: string;
  account_email: string;
  status: AuthorizationStatus;
  requested_at: string;
  decided_at: string | null;
  notice_version: string;
  scope_snapshot: EmailAuthScopeSnapshot | null;
  profiles: { name: string; email: string } | { name: string; email: string }[] | null;
};

const COLUMNS = "id, project_id, user_id, account_email, status, requested_at, decided_at, notice_version, scope_snapshot, profiles:user_id(name,email)";

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function connectionStatuses(accountEmails: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (accountEmails.length === 0) return result;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("email_accounts").select("email_address, status").in("email_address", accountEmails);
  for (const row of data ?? []) result.set(row.email_address as string, row.status as string);
  return result;
}

function map(row: Row, connections: Map<string, string>): EmailAuthorization {
  const profile = one(row.profiles);
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    userName: profile?.name ?? "Colaborador",
    userEmail: profile?.email ?? "",
    accountEmail: row.account_email,
    status: row.status,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    noticeVersion: row.notice_version,
    scopeSnapshot: row.scope_snapshot,
    connectionStatus: connections.get(row.account_email) ?? null,
  };
}

export async function getEmailAuthorization(id: string): Promise<EmailAuthorization | null> {
  if (!/^[0-9a-fA-F-]{36}$/.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("email_access_authorizations").select(COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as Row;
  return map(row, await connectionStatuses([row.account_email]));
}

export async function listProjectEmailAuthorizations(projectId: string): Promise<EmailAuthorization[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_access_authorizations")
    .select(COLUMNS)
    .eq("project_id", projectId)
    .order("requested_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as unknown as Row[];
  const connections = await connectionStatuses([...new Set(rows.map((row) => row.account_email))]);
  return rows.map((row) => map(row, connections));
}

export async function getEmailAuthorizationEvents(id: string): Promise<EmailAuthorizationEvent[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("email_access_authorization_events")
    .select("id, event_type, occurred_at, notice_version, note, profiles:actor_user_id(name)")
    .eq("authorization_id", id)
    .order("occurred_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = one((row as { profiles: { name: string } | { name: string }[] | null }).profiles);
    return {
      id: row.id as string,
      eventType: row.event_type as EmailAuthorizationEvent["eventType"],
      actorName: profile?.name ?? null,
      occurredAt: row.occurred_at as string,
      noticeVersion: row.notice_version as string,
      note: (row.note as string | null) ?? null,
    };
  });
}
