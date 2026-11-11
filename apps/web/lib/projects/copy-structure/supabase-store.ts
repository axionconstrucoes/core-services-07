// Adaptador Supabase do serviço de cópia de equipe. Usa SOMENTE o cliente de sessão do usuário (RLS em vigor):
// nenhuma service-role, nenhum INSERT direto em project_memberships. A escrita é a RPC copy_project_team, que
// valida Administrador nos dois projetos no banco e audita.

import { createSupabaseServerClient } from "@axion/db/server";
import {
  CopyStructureError,
  type CopyItemStatus,
  type CopyRpcItem,
  type CopyRpcResult,
  type CopyStructureStore,
  type ProjectOption,
} from "./service";
import type { DestinationMember, SourceMember } from "./team-plan";

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const KNOWN_STATUS: readonly CopyItemStatus[] = [
  "ADDED",
  "ALREADY_MEMBER",
  "SKIPPED_SELF",
  "NOT_ACTIVE_IN_SOURCE",
  "PROFILE_NOT_FOUND",
  "ADMIN_NOT_CONFIRMED",
  "INVALID",
  "ERROR",
];

interface RpcPayload {
  added?: number;
  already_member?: number;
  skipped?: number;
  errors?: number;
  items?: { user_id: string; status: string; message?: string }[];
}

export function mapCopyRpcResult(payload: RpcPayload | null): CopyRpcResult {
  const items = (payload?.items ?? []).map((item) => ({
    userId: item.user_id,
    status: (KNOWN_STATUS as readonly string[]).includes(item.status) ? (item.status as CopyItemStatus) : ("ERROR" as const),
    message: item.message,
  }));
  return {
    added: payload?.added ?? 0,
    alreadyMember: payload?.already_member ?? 0,
    skipped: payload?.skipped ?? 0,
    errors: payload?.errors ?? 0,
    items,
  };
}

export function createSupabaseCopyStructureStore(db: Db): CopyStructureStore {
  return {
    async getActorId() {
      const { data } = await db.auth.getUser();
      return data.user?.id ?? null;
    },

    async getActiveMembership(projectId, userId) {
      const { data } = await db
        .from("project_memberships")
        .select("permission,status")
        .eq("project_id", projectId)
        .eq("user_id", userId)
        .maybeSingle();
      return data ? { permission: String(data.permission), status: String(data.status) } : null;
    },

    async listAdminProjects(userId): Promise<ProjectOption[]> {
      const { data: memberships } = await db
        .from("project_memberships")
        .select("project_id")
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .eq("permission", "ADMINISTRADOR");
      const ids = (memberships ?? []).map((row) => row.project_id as string);
      if (ids.length === 0) return [];
      const { data: projects } = await db
        .from("projects")
        .select("id,name,code,client,location,workspace_type")
        .in("id", ids)
        .eq("workspace_type", "OBRA")
        .order("name");
      return (projects ?? []).map((project) => ({
        id: project.id as string,
        name: project.name as string,
        code: project.code as string,
        client: project.client as string,
        location: project.location as string,
      }));
    },

    async listSourceMembers(projectId): Promise<SourceMember[]> {
      const { data: memberships, error } = await db
        .from("project_memberships")
        .select("user_id,permission,area,status")
        .eq("project_id", projectId);
      if (error) throw new CopyStructureError("COPY_FAILED", error.message);
      const ids = (memberships ?? []).map((row) => row.user_id as string);
      if (ids.length === 0) return [];
      const { data: profiles, error: profileError } = await db
        .from("profiles")
        .select("id,name,email,origin,title")
        .in("id", ids);
      if (profileError) throw new CopyStructureError("COPY_FAILED", profileError.message);
      const byId = new Map((profiles ?? []).map((profile) => [profile.id as string, profile]));
      return (memberships ?? []).map((row) => {
        const profile = byId.get(row.user_id as string);
        return {
          userId: row.user_id as string,
          name: (profile?.name as string | undefined) ?? "(sem nome)",
          email: (profile?.email as string | null | undefined) ?? null,
          origin: (profile?.origin as string | null | undefined) ?? null,
          title: (profile?.title as string | null | undefined) ?? null,
          permission: String(row.permission),
          area: (row.area as string | null) ?? null,
          status: String(row.status),
        };
      });
    },

    async listDestinationMembers(projectId): Promise<DestinationMember[]> {
      const { data, error } = await db
        .from("project_memberships")
        .select("user_id,permission,area,status")
        .eq("project_id", projectId);
      if (error) throw new CopyStructureError("COPY_FAILED", error.message);
      return (data ?? []).map((row) => ({
        userId: row.user_id as string,
        permission: String(row.permission),
        area: (row.area as string | null) ?? null,
        status: String(row.status),
      }));
    },

    async isEmailIngestionEnabled(projectId) {
      const { data } = await db.from("project_email_ingestion_configs").select("enabled").eq("project_id", projectId).maybeSingle();
      return data?.enabled === true;
    },

    async copyTeam(sourceId, destinationId, items: CopyRpcItem[]) {
      const { data, error } = await db.rpc("copy_project_team", {
        p_source_project_id: sourceId,
        p_destination_project_id: destinationId,
        p_items: items,
      });
      if (error) throw new CopyStructureError("COPY_FAILED", error.message);
      return mapCopyRpcResult(data as RpcPayload | null);
    },
  };
}
