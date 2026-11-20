// Carrega, SOB RLS (cliente de sessão), o texto descritivo da fonte para a triagem assistida. Somente leitura.
// Sem dado -> devolve texto vazio (o contexto declara "SEM DADOS"); nunca inventa conteúdo.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QualityTriageSource } from "../ai/experts/quality-analyst/triage";
import { parseOriginRef } from "./ingestion";

const MAX_TEXT = 6000;

function clip(value: unknown): string {
  return typeof value === "string" ? value.slice(0, MAX_TEXT) : "";
}

export async function loadTriageSource(
  supabase: SupabaseClient,
  projectId: string,
  originRef: string,
): Promise<QualityTriageSource | null> {
  const parsed = parseOriginRef(originRef);
  if (!parsed) return null;

  if (parsed.kind === "email") {
    const { data } = await supabase
      .from("emails")
      .select("id,subject,snippet,body_text")
      .eq("id", parsed.id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; subject: string | null; snippet: string | null; body_text: string | null };
    return {
      kind: "EMAIL",
      sourceType: "EMAIL",
      sourceId: row.id,
      label: clip(row.subject).slice(0, 200) || "E-mail sem assunto",
      text: [clip(row.subject), clip(row.body_text) || clip(row.snippet)].filter(Boolean).join("\n\n"),
      locator: null,
    };
  }

  if (parsed.kind === "email_attachment") {
    const { data } = await supabase
      .from("email_attachments")
      .select("id,original_file_name,mime_type")
      .eq("id", parsed.id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; original_file_name: string; mime_type: string | null };
    return {
      kind: "PHOTO",
      sourceType: "PHOTO",
      sourceId: row.id,
      label: clip(row.original_file_name).slice(0, 200),
      text: `Anexo de e-mail: ${clip(row.original_file_name)} (${row.mime_type ?? "tipo não informado"}). O conteúdo do arquivo não é lido nesta triagem.`,
      locator: null,
    };
  }

  if (parsed.kind === "ssma_field_record") {
    const { data } = await supabase
      .from("ssma_field_records")
      .select("id,kind,category,description,location")
      .eq("id", parsed.id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; kind: string; category: string; description: string; location: string };
    return {
      kind: "PHOTO",
      sourceType: "PHOTO",
      sourceId: row.id,
      label: `${clip(row.category)} · ${clip(row.location)}`.slice(0, 200),
      text: [`Categoria: ${clip(row.category)}`, `Local: ${clip(row.location)}`, `Descrição: ${clip(row.description)}`].join("\n"),
      locator: null,
    };
  }

  if (parsed.kind === "ssma_form_submission") {
    const { data } = await supabase
      .from("ssma_form_submissions")
      .select("id,checklist_title,field_values")
      .eq("id", parsed.id)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) return null;
    const row = data as { id: string; checklist_title: string; field_values: Record<string, unknown> | null };
    const values = Object.entries(row.field_values ?? {})
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join("\n");
    return {
      kind: "PHOTO",
      sourceType: "PHOTO",
      sourceId: row.id,
      label: clip(row.checklist_title).slice(0, 200),
      text: clip(`Checklist: ${row.checklist_title}\n${values}`),
      locator: null,
    };
  }

  // Documentos (diário, fiscalização): a triagem assistida cobre apenas foto e e-mail nesta fase.
  return null;
}
