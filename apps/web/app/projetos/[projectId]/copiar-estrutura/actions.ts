"use server";

// Server Actions de "Copiar estrutura de outro projeto" (categoria: equipe e perfis de acesso).
// Cada ação reautoriza o usuário como ADMINISTRADOR ativo na ORIGEM e no DESTINO (ver service.ts) e usa só o
// cliente de sessão. Nada é enviado: nenhum convite, nenhum e-mail.

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import {
  CopyStructureError,
  executeTeamCopy,
  loadTeamStep,
  previewTeamCopy,
  type CopyRpcResult,
  type PreviewData,
  type TeamStepData,
} from "@/lib/projects/copy-structure/service";
import { createSupabaseCopyStructureStore } from "@/lib/projects/copy-structure/supabase-store";
import type { TeamCopyPreview, TeamSelection } from "@/lib/projects/copy-structure/team-plan";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function guard<T>(run: (store: ReturnType<typeof createSupabaseCopyStructureStore>) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const store = createSupabaseCopyStructureStore(await createSupabaseServerClient());
    return { ok: true, data: await run(store) };
  } catch (error) {
    if (error instanceof CopyStructureError) return { ok: false, error: error.message };
    return { ok: false, error: "Não foi possível concluir a operação. Tente novamente." };
  }
}

export async function loadTeamCandidatesAction(input: { sourceId: string; destinationId: string }): Promise<ActionResult<TeamStepData>> {
  return guard((store) => loadTeamStep(store, input));
}

export async function previewTeamCopyAction(input: {
  sourceId: string;
  destinationId: string;
  selection: TeamSelection[];
}): Promise<ActionResult<PreviewData>> {
  return guard((store) => previewTeamCopy(store, input));
}

export async function executeTeamCopyAction(input: {
  sourceId: string;
  destinationId: string;
  selection: TeamSelection[];
  confirmed: boolean;
  signature: string;
}): Promise<ActionResult<{ result: CopyRpcResult; preview: TeamCopyPreview }>> {
  const outcome = await guard((store) => executeTeamCopy(store, input));
  if (outcome.ok) revalidatePath(`/${input.destinationId}/usuarios`);
  return outcome;
}
