"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import {
  addActionCommand,
  addComplaintCommand,
  addConsequenceCommand,
  addCostCommand,
  addEvidenceCommand,
  addInspectionCommand,
  addRecurrenceCommand,
  addRequirementCommand,
  addTestCommand,
  addVerificationCommand,
  createNcrCommand,
  isUuid,
  setActionStatusCommand,
  setEvidenceClassificationCommand,
  transitionNcrCommand,
  updateNcrCommand,
  type CommandCtx,
} from "@/lib/quality/ui-commands";
import { initialQualityActionState, type QualityActionState } from "@/lib/quality/ui-action-state";
import type { QualityDb } from "@/lib/quality/ui-queries";

// Server Actions da Qualidade: finas — toda a regra está em lib/quality/ui-commands.ts (testável). O cliente é o do USUÁRIO (RLS);
// nunca service_role. Arquivo "use server": só exporta funções async.

type Command = (ctx: CommandCtx, fd: FormData) => Promise<QualityActionState>;

async function run(fd: FormData, command: Command): Promise<QualityActionState> {
  const projectId = String(fd.get("projectId") ?? "");
  if (!isUuid(projectId)) return { ...initialQualityActionState, error: "Projeto inválido.", code: "INVALID_PROJECT" };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ...initialQualityActionState, error: "Sessão expirada. Entre novamente.", code: "AUTH_REQUIRED" };
  const role = await getCurrentProjectPermission(projectId);
  const state = await command({ db: supabase as unknown as QualityDb, role, projectId }, fd);
  if (state.ok) revalidatePath(`/${projectId}/qualidade`, "layout");
  return state;
}

export async function createNcrAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, createNcrCommand);
}
export async function transitionNcrAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, transitionNcrCommand);
}
export async function updateNcrAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, updateNcrCommand);
}
export async function addEvidenceAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addEvidenceCommand);
}
export async function setEvidenceClassificationAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, setEvidenceClassificationCommand);
}
export async function addActionAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addActionCommand);
}
export async function setActionStatusAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, setActionStatusCommand);
}
export async function addVerificationAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addVerificationCommand);
}
export async function addConsequenceAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addConsequenceCommand);
}
export async function addCostAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addCostCommand);
}
export async function addRecurrenceAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addRecurrenceCommand);
}
export async function addComplaintAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addComplaintCommand);
}
export async function addInspectionAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addInspectionCommand);
}
export async function addTestAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addTestCommand);
}
export async function addRequirementAction(_prev: QualityActionState, fd: FormData): Promise<QualityActionState> {
  return run(fd, addRequirementCommand);
}
