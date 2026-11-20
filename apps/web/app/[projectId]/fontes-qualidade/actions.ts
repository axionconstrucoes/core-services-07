"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@axion/db/server";
import { buildTriageEvidenceRow, resolveQualityTriageProvider, runQualityTriage } from "@/lib/ai/experts/quality-analyst/triage";
import {
  buildHumanEvidenceRow,
  dedupeOriginTypesFor,
  isIngestionOriginType,
  isUuid,
  mapQualityRpcError,
  parseOriginRef,
  validateIngestionInput,
  type FindByOriginRow,
  type IngestionInput,
  type IngestionOutcome,
} from "@/lib/quality/ingestion";
import { loadTriageSource } from "@/lib/quality/ingestion-source";

// Este módulo é "use server" — só exporta funções async. Tipos e regras vivem em lib/quality/ingestion.ts.
// Escrita SOMENTE por RPC (quality_ncr_create) ou INSERT sob RLS na evidência (quality_can_register + created_by = auth.uid()).
// A automação nunca classifica NC COMPROVADA; nada é enviado a ninguém.

export type IngestionActionResult =
  | { ok: true; outcome: IngestionOutcome }
  | { ok: false; error: string };

export type LookupActionResult =
  | { ok: true; existing: { ncrId: string; code: string; state: string } | null }
  | { ok: false; error: string };

export type TriageActionResult =
  | { ok: true; evidenceId: string | null; summary: string; providerId: string; signals: string[] }
  | { ok: false; error: string; problems?: string[] };


type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Consulta quality_find_by_origin em todos os tipos de origem equivalentes (ver dedupeOriginTypesFor). */
async function findExistingByOrigin(
  supabase: Client,
  projectId: string,
  originType: Parameters<typeof dedupeOriginTypesFor>[0],
  originRef: string,
): Promise<{ error: string | null; row: FindByOriginRow | null }> {
  for (const type of dedupeOriginTypesFor(originType, originRef)) {
    const { data, error } = await supabase.rpc("quality_find_by_origin", {
      p_project_id: projectId,
      p_origin_type: type,
      p_origin_ref: originRef,
    });
    if (error) return { error: mapQualityRpcError(error.message), row: null };
    const row = ((data ?? []) as FindByOriginRow[])[0];
    if (row) return { error: null, row };
  }
  return { error: null, row: null };
}

/** Consulta de deduplicação (Qualidade x SSMA e demais origens) ANTES de oferecer o registro. */
export async function lookupQualityOriginAction(input: { projectId: string; originType: string; originRef: string }): Promise<LookupActionResult> {
  if (!isUuid(input.projectId) || !isIngestionOriginType(input.originType) || !input.originRef) return { ok: false, error: "Origem inválida." };
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: mapQualityRpcError("AUTH_REQUIRED") };
  const found = await findExistingByOrigin(supabase, input.projectId, input.originType, input.originRef);
  if (found.error) return { ok: false, error: found.error };
  const row = found.row;
  return { ok: true, existing: row ? { ncrId: row.id, code: row.code, state: row.state } : null };
}

/** "Registrar indício de Qualidade": dedupe por origem; cria RNC (DETECTADA) + evidência classificada pela pessoa. */
export async function registerQualityIndicationAction(input: IngestionInput): Promise<IngestionActionResult> {
  const validated = validateIngestionInput(input);
  if (!validated.ok) return { ok: false, error: validated.error };
  const v = validated.value;

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: mapQualityRpcError("AUTH_REQUIRED") };

  const found = await findExistingByOrigin(supabase, v.projectId, v.originType, v.originRef);
  if (found.error) return { ok: false, error: found.error };
  const existing = found.row;
  if (existing) return { ok: true, outcome: { status: "EXISTS", ncrId: existing.id, code: existing.code, state: existing.state } };

  const created = await supabase.rpc("quality_ncr_create", {
    p_project_id: v.projectId,
    p_title: v.title,
    p_description: v.description || null,
    p_origin_type: v.originType,
    p_origin_ref: v.originRef,
    p_origin_url: v.originUrl,
  });
  if (created.error) return { ok: false, error: mapQualityRpcError(created.error.message) };
  const result = created.data as { created: boolean; deduplicated: boolean; id: string; code: string } | null;
  if (!result?.id) return { ok: false, error: "Resposta inesperada ao criar a RNC." };
  if (!result.created) return { ok: true, outcome: { status: "DEDUPLICATED", ncrId: result.id, code: result.code } };

  const evidence = await supabase.from("quality_evidence").insert(buildHumanEvidenceRow(v, result.id, auth.user.id));
  revalidatePath(`/${v.projectId}/qualidade`);
  if (evidence.error) {
    return {
      ok: true,
      outcome: {
        status: "CREATED",
        ncrId: result.id,
        code: result.code,
        evidenceRecorded: false,
        evidenceNote: "RNC criada, mas a evidência não foi gravada. Registre a evidência na RNC.",
      },
    };
  }
  return { ok: true, outcome: { status: "CREATED", ncrId: result.id, code: result.code, evidenceRecorded: true, evidenceNote: null } };
}

/** Triagem assistida (provedor SIMULADO, desligado por padrão): grava evidência INFERÊNCIA/SUSPEITA para revisão humana. */
export async function triageQualityOriginAction(input: {
  projectId: string;
  originType: string;
  originRef: string;
  sourceTable: string | null;
  originUrl: string | null;
}): Promise<TriageActionResult> {
  if (!isUuid(input.projectId) || !isIngestionOriginType(input.originType)) return { ok: false, error: "Origem inválida." };
  if (!parseOriginRef(input.originRef)) return { ok: false, error: "A triagem assistida cobre apenas foto SSMA e e-mail com referência válida." };

  const provider = resolveQualityTriageProvider();
  if (!provider) return { ok: false, error: "Triagem assistida indisponível: provedor não habilitado neste ambiente." };

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: mapQualityRpcError("AUTH_REQUIRED") };

  // A RNC da origem precisa existir (registro humano prévio): a triagem anexa evidência a ela, nunca cria RNC.
  const found = await findExistingByOrigin(supabase, input.projectId, input.originType, input.originRef);
  if (found.error) return { ok: false, error: found.error };
  const existing = found.row;
  if (!existing) return { ok: false, error: "Registre primeiro o indício de Qualidade; a triagem é anexada à RNC da origem." };

  const source = await loadTriageSource(supabase, input.projectId, input.originRef);
  if (!source) return { ok: false, error: "A fonte não foi encontrada ou não é elegível à triagem (apenas foto SSMA e e-mail)." };

  const result = await runQualityTriage(provider, source);
  if (!result.ok) return { ok: false, error: "A saída da triagem foi rejeitada pela validação e NÃO foi gravada.", problems: result.problems };

  const insert = await supabase
    .from("quality_evidence")
    .insert(
      buildTriageEvidenceRow({
        projectId: input.projectId,
        ncrId: existing.id,
        userId: auth.user.id,
        evidenceSourceType: input.originType,
        sourceTable: input.sourceTable,
        originRef: input.originRef,
        originUrl: input.originUrl,
        result,
      }),
    )
    .select("id")
    .maybeSingle();
  if (insert.error) {
    if (insert.error.code === "23505") return { ok: false, error: "A triagem desta fonte já foi registrada nesta RNC." };
    return { ok: false, error: mapQualityRpcError(insert.error.message) };
  }
  revalidatePath(`/${input.projectId}/qualidade`);
  return {
    ok: true,
    evidenceId: (insert.data as { id: string } | null)?.id ?? null,
    summary: result.summary,
    providerId: result.providerId,
    signals: result.signals.map((s) => s.id),
  };
}
