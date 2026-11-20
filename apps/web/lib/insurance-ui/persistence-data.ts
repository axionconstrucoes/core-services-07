// Leitura (sob RLS, cliente do USUÁRIO) do que a Fase 3/E persiste em Seguros: sujeitos ESPERADOS e checklists RCC. Somente SELECT, sempre
// filtrado por project_id (defesa em profundidade; a RLS é a autoridade). Falha de uma seção NUNCA vira lista vazia silenciosa:
// o erro é devolvido e a tela o exibe. Linhas de outro projeto são descartadas. Sem dado => listas vazias (a tela mostra SEM DADOS).
import type { RccAnswer, RccKey } from "../insurance/rcc-checklist";
import type { PartyRole } from "../insurance/types";
import { isModuleUnavailable } from "./errors";
import type { InsuranceClientLike } from "./data";
import type { ExpectedSubjectView, RccChecklistView, SubjectSourceKind } from "./persistence";

export interface PersistedSupport {
  /** todas as versões dos sujeitos esperados (a tela deriva a vigente = maior versão por apólice e papel) */
  expectedSubjects: ExpectedSubjectView[];
  /** todas as versões dos checklists RCC, com as respostas */
  rccChecklists: RccChecklistView[];
  /** seção -> mensagem; vazio = tudo carregado */
  errors: Partial<Record<"expectedSubjects" | "rccChecklists", string>>;
  /** módulo ainda não habilitado neste banco (migrations pendentes) */
  unavailable: boolean;
}

export const EMPTY_PERSISTED: PersistedSupport = { expectedSubjects: [], rccChecklists: [], errors: {}, unavailable: false };

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function mapExpectedSubjectRow(r: Row & { policy_id?: string }): ExpectedSubjectView | null {
  if (typeof r.id !== "string" || typeof r.policy_id !== "string") return null;
  return {
    id: r.id,
    policyId: r.policy_id,
    partyRole: String(r.party_role) as PartyRole,
    expectation: r.expectation === "NAO_ESPERADO" ? "NAO_ESPERADO" : "ESPERADO",
    expectedName: s(r.expected_name),
    expectedTaxId: s(r.expected_tax_id),
    sourceKind: (s(r.source_kind) ?? "OUTRO") as SubjectSourceKind,
    sourceDocumentId: s(r.source_document_id),
    sourceRef: s(r.source_ref),
    versionNo: Number(r.version_no ?? 0),
    note: s(r.note),
    createdBy: s(r.created_by),
    createdAt: String(r.created_at ?? ""),
  };
}

export async function loadPersistedSupport(client: InsuranceClientLike, projectId: string): Promise<PersistedSupport> {
  const out: PersistedSupport = { expectedSubjects: [], rccChecklists: [], errors: {}, unavailable: false };
  const fail = (key: keyof PersistedSupport["errors"], e: { message?: string | null; code?: string | null } | null) => {
    if (isModuleUnavailable(e)) out.unavailable = true;
    out.errors[key] = "Falha ao carregar esta seção.";
  };
  await Promise.all([
    (async () => {
      try {
        const { data, error } = (await client.from("insurance_expected_subjects").select("*").eq("project_id", projectId).order("version_no", { ascending: false }).limit(2000)) as { data: Row[] | null; error: { message?: string; code?: string } | null };
        if (error) return fail("expectedSubjects", error);
        out.expectedSubjects = (data ?? []).filter((r) => r.project_id === projectId).map(mapExpectedSubjectRow).filter((x): x is NonNullable<typeof x> => x !== null);
      } catch {
        fail("expectedSubjects", { message: "exceção" });
      }
    })(),
    (async () => {
      try {
        const { data: heads, error } = (await client.from("insurance_rcc_checklists").select("*").eq("project_id", projectId).order("version_no", { ascending: false }).limit(1000)) as { data: Row[] | null; error: { message?: string; code?: string } | null };
        if (error) return fail("rccChecklists", error);
        const own = (heads ?? []).filter((h) => h.project_id === projectId);
        if (!own.length) return;
        const { data: items, error: e2 } = (await client.from("insurance_rcc_checklist_items").select("*").eq("project_id", projectId).in("checklist_id", own.map((h) => h.id)).limit(20000)) as { data: Row[] | null; error: { message?: string; code?: string } | null };
        if (e2) return fail("rccChecklists", e2);
        const byList = new Map<string, Row[]>();
        for (const it of items ?? []) {
          if (it.project_id !== projectId) continue;
          const k = String(it.checklist_id);
          byList.set(k, [...(byList.get(k) ?? []), it]);
        }
        out.rccChecklists = own.map((h): RccChecklistView => {
          const answers: Partial<Record<RccKey, RccAnswer>> = {};
          for (const it of byList.get(String(h.id)) ?? []) {
            if (typeof it.answer !== "string") continue;
            answers[String(it.question_key) as RccKey] = {
              answer: it.answer,
              source: { documentId: s(it.source_document_id), ref: s(it.source_ref), page: s(it.source_page) },
              propertyScope: s(it.property_scope) as RccAnswer["propertyScope"],
            };
          }
          return { id: String(h.id), versionNo: Number(h.version_no ?? 0), policyId: String(h.policy_id), claimId: s(h.claim_id), note: s(h.note), createdBy: s(h.created_by), createdAt: String(h.created_at ?? ""), answers };
        });
      } catch {
        fail("rccChecklists", { message: "exceção" });
      }
    })(),
  ]);
  return out;
}

/** Sujeitos esperados VIGENTES de uma apólice (maior versão por papel). */
export function currentExpectedFor(all: Array<ExpectedSubjectView & { policyId?: string }>, policyId: string): ExpectedSubjectView[] {
  const best = new Map<string, ExpectedSubjectView>();
  for (const v of all) {
    if (v.policyId !== policyId) continue;
    const cur = best.get(v.partyRole);
    if (!cur || v.versionNo > cur.versionNo) best.set(v.partyRole, v);
  }
  return [...best.values()];
}

/** Checklist RCC vigente (maior versão) da apólice, sem evento. */
export function latestRccFor(all: RccChecklistView[], policyId: string): { latest: RccChecklistView | null; versions: RccChecklistView[] } {
  const versions = all.filter((c) => c.policyId === policyId && c.claimId === null).sort((a, b) => b.versionNo - a.versionNo);
  return { latest: versions[0] ?? null, versions };
}
