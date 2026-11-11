// Orquestração da cópia de EQUIPE entre projetos. Não conhece o Supabase: depende de um "store" injetável,
// o que permite testar a autorização (origem E destino), a prévia e a execução sem banco.
//
// O servidor NÃO confia no que o navegador mostrou: toda etapa reautoriza o usuário nos dois projetos, recarrega
// os dados e recalcula a prévia. A execução só roda se a seleção ainda for a mesma da prévia confirmada.

import { createHash } from "node:crypto";
import {
  buildCandidates,
  buildPreview,
  selectionSignature,
  type CandidateRow,
  type DestinationMember,
  type SourceMember,
  type TeamCopyPreview,
  type TeamSelection,
} from "./team-plan";

export interface ProjectOption {
  id: string;
  name: string;
  code: string;
  client: string;
  location: string;
}

export type CopyItemStatus =
  | "ADDED"
  | "ALREADY_MEMBER"
  | "SKIPPED_SELF"
  | "NOT_ACTIVE_IN_SOURCE"
  | "PROFILE_NOT_FOUND"
  | "ADMIN_NOT_CONFIRMED"
  | "INVALID"
  | "ERROR";

export interface CopyRpcItem {
  user_id: string;
  permission: string;
  area: string | null;
  explicit_admin: boolean;
}

export interface CopyRpcItemResult {
  userId: string;
  status: CopyItemStatus;
  message?: string;
}

export interface CopyRpcResult {
  added: number;
  alreadyMember: number;
  skipped: number;
  errors: number;
  items: CopyRpcItemResult[];
}

export interface CopyStructureStore {
  getActorId(): Promise<string | null>;
  getActiveMembership(projectId: string, userId: string): Promise<{ permission: string; status: string } | null>;
  listAdminProjects(userId: string): Promise<ProjectOption[]>;
  listSourceMembers(projectId: string): Promise<SourceMember[]>;
  listDestinationMembers(projectId: string): Promise<DestinationMember[]>;
  isEmailIngestionEnabled(projectId: string): Promise<boolean>;
  copyTeam(sourceId: string, destinationId: string, items: CopyRpcItem[]): Promise<CopyRpcResult>;
}

export type CopyStructureErrorCode =
  | "AUTH_REQUIRED"
  | "SAME_PROJECT"
  | "SOURCE_FORBIDDEN"
  | "DESTINATION_FORBIDDEN"
  | "INVALID_INPUT"
  | "PREVIEW_STALE"
  | "NOT_CONFIRMED"
  | "NOTHING_TO_COPY"
  | "COPY_FAILED";

export const COPY_STRUCTURE_ERROR_MESSAGES: Record<CopyStructureErrorCode, string> = {
  AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
  SAME_PROJECT: "Origem e destino precisam ser projetos diferentes.",
  SOURCE_FORBIDDEN: "Você precisa ser Administrador ativo do projeto de ORIGEM.",
  DESTINATION_FORBIDDEN: "Você precisa ser Administrador ativo do projeto de DESTINO.",
  INVALID_INPUT: "Dados inválidos. Recarregue a página e tente novamente.",
  PREVIEW_STALE: "A situação mudou desde a prévia. Gere a prévia novamente antes de confirmar.",
  NOT_CONFIRMED: "Confirme a execução na prévia antes de copiar.",
  NOTHING_TO_COPY: "Não há novos vínculos válidos para criar.",
  COPY_FAILED: "Não foi possível concluir a cópia.",
};

export class CopyStructureError extends Error {
  readonly code: CopyStructureErrorCode;

  constructor(code: CopyStructureErrorCode, detail?: string) {
    super(detail ? `${COPY_STRUCTURE_ERROR_MESSAGES[code]} ${detail}` : COPY_STRUCTURE_ERROR_MESSAGES[code]);
    this.name = "CopyStructureError";
    this.code = code;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_COPY_SELECTION = 200;

function isAdminActive(membership: { permission: string; status: string } | null): boolean {
  return membership?.status === "ACTIVE" && membership.permission === "ADMINISTRADOR";
}

/** Autoriza o usuário nos DOIS projetos (a RPC do banco repete a checagem). Devolve o id do executor. */
export async function authorizeCopy(store: CopyStructureStore, sourceId: string, destinationId: string): Promise<string> {
  if (!UUID.test(sourceId) || !UUID.test(destinationId)) throw new CopyStructureError("INVALID_INPUT");
  if (sourceId.toLowerCase() === destinationId.toLowerCase()) throw new CopyStructureError("SAME_PROJECT");
  const actorId = await store.getActorId();
  if (!actorId) throw new CopyStructureError("AUTH_REQUIRED");
  const [source, destination] = await Promise.all([
    store.getActiveMembership(sourceId, actorId),
    store.getActiveMembership(destinationId, actorId),
  ]);
  if (!isAdminActive(destination)) throw new CopyStructureError("DESTINATION_FORBIDDEN");
  if (!isAdminActive(source)) throw new CopyStructureError("SOURCE_FORBIDDEN");
  return actorId;
}

export interface TeamStepData {
  candidates: CandidateRow[];
  /** O destino tem coleta de e-mail habilitada: incluir pessoas dispara o mesmo backfill do cadastro manual. */
  destinationEmailIngestionEnabled: boolean;
}

export async function loadTeamStep(store: CopyStructureStore, input: { sourceId: string; destinationId: string }): Promise<TeamStepData> {
  const actorId = await authorizeCopy(store, input.sourceId, input.destinationId);
  const [source, destination, emailIngestion] = await Promise.all([
    store.listSourceMembers(input.sourceId),
    store.listDestinationMembers(input.destinationId),
    store.isEmailIngestionEnabled(input.destinationId),
  ]);
  return { candidates: buildCandidates(source, destination, actorId), destinationEmailIngestionEnabled: emailIngestion };
}

function validateSelection(selection: readonly TeamSelection[]): void {
  if (!Array.isArray(selection) || selection.length === 0 || selection.length > MAX_COPY_SELECTION) {
    throw new CopyStructureError("INVALID_INPUT");
  }
  for (const item of selection) {
    if (!item || typeof item.userId !== "string" || !UUID.test(item.userId)) throw new CopyStructureError("INVALID_INPUT");
    if (typeof item.permission !== "string") throw new CopyStructureError("INVALID_INPUT");
  }
}

export interface PreviewData {
  preview: TeamCopyPreview;
  /** Assinatura da seleção executável; a execução exige a mesma. */
  signature: string;
  destinationEmailIngestionEnabled: boolean;
}

export async function previewTeamCopy(
  store: CopyStructureStore,
  input: { sourceId: string; destinationId: string; selection: TeamSelection[] }
): Promise<PreviewData> {
  validateSelection(input.selection);
  const step = await loadTeamStep(store, input);
  const preview = buildPreview(input.selection, step.candidates);
  return {
    preview,
    signature: signatureDigest(preview.executable),
    destinationEmailIngestionEnabled: step.destinationEmailIngestionEnabled,
  };
}

export function signatureDigest(items: readonly TeamSelection[]): string {
  return createHash("sha256").update(selectionSignature(items)).digest("hex");
}

export interface ExecuteInput {
  sourceId: string;
  destinationId: string;
  selection: TeamSelection[];
  confirmed: boolean;
  signature: string;
}

export interface ExecuteData {
  result: CopyRpcResult;
  preview: TeamCopyPreview;
}

export async function executeTeamCopy(store: CopyStructureStore, input: ExecuteInput): Promise<ExecuteData> {
  validateSelection(input.selection);
  if (input.confirmed !== true) throw new CopyStructureError("NOT_CONFIRMED");
  const step = await loadTeamStep(store, input); // reautoriza e recarrega: nada do navegador é confiável
  const preview = buildPreview(input.selection, step.candidates);
  if (preview.executable.length === 0) throw new CopyStructureError("NOTHING_TO_COPY");
  if (signatureDigest(preview.executable) !== input.signature) throw new CopyStructureError("PREVIEW_STALE");

  const items: CopyRpcItem[] = preview.executable.map((item) => ({
    user_id: item.userId,
    permission: item.permission,
    area: item.area,
    explicit_admin: item.explicitAdmin === true,
  }));
  const result = await store.copyTeam(input.sourceId, input.destinationId, items);
  return { result, preview };
}
