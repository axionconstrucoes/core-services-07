// Fase 5 / G — store EM MEMÓRIA do pipeline (testes puros e dry-run local). Mesma semântica de idempotência do SQL:
// classificação única por (email_id, rule_version); sinal único por (classification_id, pillar, signal_kind).
import type { ClassificationRow, SignalRow } from "../email-classification/persist";
import type { ExclusionCount, PipelineEmailRow, PipelineStore, ProjectContext } from "./types";

export type MemoryEmail = Omit<PipelineEmailRow, "existing">;

export interface MemoryStore extends PipelineStore {
  classifications: Array<ClassificationRow & { id: string }>;
  signals: Array<SignalRow & { id: string }>;
  candidates: Array<{ projectId: string; email: string; emailId: string; messageCount: number }>;
  /** Mensagens originais: o pipeline nunca as altera (teste compara o snapshot). */
  emails: MemoryEmail[];
}

export function createMemoryStore(seed: {
  emails: MemoryEmail[];
  contexts?: Record<string, ProjectContext>;
  exclusions?: ExclusionCount[];
}): MemoryStore {
  const classifications: MemoryStore["classifications"] = [];
  const signals: MemoryStore["signals"] = [];
  const candidates: MemoryStore["candidates"] = [];
  let seq = 0;
  const nextId = (p: string) => `${p}-${String(++seq).padStart(4, "0")}`;
  return {
    emails: seed.emails,
    classifications,
    signals,
    candidates,
    async listEmails({ projectId, ruleVersion, limit }) {
      return seed.emails
        .filter((e) => !projectId || e.project_id === projectId)
        .map((e) => {
          const c = classifications.find((x) => x.email_id === e.id && x.rule_version === ruleVersion);
          return { ...e, existing: c ? { status: c.status, cannot_reason: c.cannot_reason, project_link_status: c.project_link_status } : null };
        })
        .sort((a, b) => Number(a.existing !== null) - Number(b.existing !== null)) // sem classificação primeiro (igual ao SQL)
        .slice(0, limit);
    },
    async loadProjectContext(projectId) {
      return seed.contexts?.[projectId] ?? { facts: { projectId }, otherProjectRefs: [] };
    },
    async listExclusionCounts() {
      return seed.exclusions ?? [];
    },
    async registerCandidate(projectId, email, emailId) {
      const hit = candidates.find((c) => c.projectId === projectId && c.email === email);
      if (hit) hit.messageCount += hit.emailId === emailId ? 0 : 1;
      else candidates.push({ projectId, email, emailId, messageCount: 1 });
      return `cand-${projectId}-${email}`;
    },
    async upsertClassification(row) {
      const hit = classifications.find((x) => x.email_id === row.email_id && x.rule_version === row.rule_version);
      if (hit) return { id: hit.id, created: false };
      const id = nextId("cls");
      classifications.push({ ...row, id });
      return { id, created: true };
    },
    async insertSignals(rows) {
      let n = 0;
      for (const s of rows) {
        if (signals.some((x) => x.classification_id === s.classification_id && x.pillar === s.pillar && x.signal_kind === s.signal_kind)) continue;
        signals.push({ ...s, id: nextId("sig") });
        n += 1;
      }
      return n;
    },
  };
}
