// Leitura SOMENTE LEITURA de email_risk_signals + email_message_classifications (Frente B) para a fonte "EMAIL" do motor.
// Duas consultas (sem depender de FK embutida no PostgREST). Tabelas ausentes (migrations da Frente B ainda não
// aplicadas) => lista vazia, declarado: nenhum caso EMAIL é criado — nunca erro que derrube o ciclo dos demais casos.
import type { SupabaseClient } from "@supabase/supabase-js";

import { legacyPillarOf } from "@/lib/email-classification/pillars";

import type { EmailRiskSignalRow } from "./collect-email-risk-cases";

const MISSING_RELATION_CODES = new Set(["42P01", "PGRST205", "PGRST200"]);
const SIGNAL_LIMIT = 500;

type Row = Record<string, unknown>;

export async function loadEmailRiskSignalRows(client: SupabaseClient, projectId: string): Promise<EmailRiskSignalRow[]> {
  const { data: signals, error } = await client
    .from("email_risk_signals")
    .select("id,email_id,classification_id,project_id,pillar,functional_area,signal_kind,summary,evidence_excerpt,evidence_ref,is_indication,confirmed,quantified_impact,created_at")
    .eq("project_id", projectId)
    .eq("is_indication", true)
    .neq("review_status", "DISCARDED") // Fase 6/H2b: sinal descartado por revisão humana não gera caso
    .order("created_at", { ascending: false })
    .limit(SIGNAL_LIMIT);
  if (error) {
    if (MISSING_RELATION_CODES.has(String((error as { code?: string }).code ?? ""))) return [];
    throw new Error(`Falha ao carregar sinais de risco de e-mail: ${error.message}`);
  }
  const rows = (signals ?? []) as Row[];
  if (rows.length === 0) return [];
  const classificationIds = Array.from(new Set(rows.map((row) => row.classification_id as string | null).filter((id): id is string => Boolean(id))));
  const { data: classifications, error: classificationError } = classificationIds.length
    ? await client
        .from("email_message_classifications")
        .select("id,project_link_status,status,officiality,authority_check,clause_ref,rule_version,injection_flag")
        .in("id", classificationIds)
    : { data: [] as Row[], error: null };
  if (classificationError) throw new Error(`Falha ao carregar classificações de e-mail: ${classificationError.message}`);
  const byId = new Map(((classifications ?? []) as Row[]).map((row) => [row.id as string, row]));
  return rows.map((row) => {
    const c = byId.get(row.classification_id as string);
    return {
      id: row.id as string,
      email_id: row.email_id as string,
      project_id: (row.project_id as string | null) ?? null,
      // Fase 6/H2b: pilar agora só PRAZO/CUSTO/SEGURANCA/QUALIDADE; área jurídica volta como JURIDICO (contrato que este coletor lê).
      pillar: legacyPillarOf({ pillar: (row.pillar as string | null) ?? null, functional_area: (row.functional_area as string | null) ?? null }) ?? "",
      signal_kind: row.signal_kind as string,
      summary: (row.summary as string | null) ?? null,
      evidence_excerpt: (row.evidence_excerpt as string | null) ?? null,
      evidence_ref: (row.evidence_ref as string | null) ?? null,
      is_indication: Boolean(row.is_indication),
      confirmed: Boolean(row.confirmed),
      quantified_impact: row.quantified_impact ?? null,
      created_at: row.created_at as string,
      classification: c
        ? {
            project_link_status: c.project_link_status as string,
            status: c.status as string,
            officiality: (c.officiality as string | null) ?? null,
            authority_check: (c.authority_check as string | null) ?? null,
            clause_ref: (c.clause_ref as string | null) ?? null,
            rule_version: (c.rule_version as string | null) ?? null,
            injection_flag: Boolean(c.injection_flag),
          }
        : null,
    };
  });
}
