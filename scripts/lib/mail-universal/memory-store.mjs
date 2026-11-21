// Fase 5/A — armazenamento EM MEMÓRIA (fixture de teste). Espelha as restrições do banco: índice único por
// (projeto, provedor, caixa, id) => erro 23505, e a identidade universo = processadas + excluídas + falhas.
export function createMemoryStore() {
  const state = { emails: [], sources: [], runs: [], exclusions: [], cursors: new Map(), calls: [] };
  let seq = 0;
  const cursorKey = (p) => `${p.projectId}|${p.provider}|${p.mailbox}`;
  return {
    state,
    async getCursor(p) { return state.cursors.get(cursorKey(p)) ?? null; },
    async saveCursor(p) { state.calls.push("saveCursor"); state.cursors.set(cursorKey(p), p.cursor); },
    async findBySource(p) {
      return state.emails.find((e) => e.project_id === p.projectId && e.provider === p.provider && e.mailbox_address === p.mailbox && e.provider_message_id === p.providerMessageId) ?? null;
    },
    async findByCanonicalKey(p) { return state.emails.find((e) => e.project_id === p.projectId && e.canonical_message_key === p.key) ?? null; },
    async insertEmail(row) {
      state.calls.push("insertEmail");
      if (state.emails.some((e) => e.project_id === row.project_id && e.provider === row.provider && e.mailbox_address === row.mailbox_address && e.provider_message_id === row.provider_message_id)) {
        throw Object.assign(new Error("duplicate key"), { code: "23505" });
      }
      const stored = { ...row, id: `email-${(seq += 1)}` };
      state.emails.push(stored);
      return { id: stored.id };
    },
    async addSource(p) {
      state.calls.push("addSource");
      if (state.sources.some((s) => s.project_id === p.projectId && s.provider === p.provider && s.mailbox === p.mailbox && s.provider_message_id === p.providerMessageId)) return;
      state.sources.push({ email_id: p.emailId, project_id: p.projectId, provider: p.provider, mailbox: p.mailbox, provider_message_id: p.providerMessageId });
    },
    async recordRun(run, exclusions) {
      state.calls.push("recordRun");
      if (run.universeCount !== run.processedCount + run.excludedCount + run.failedCount) throw new Error("CHECK email_sync_runs_identity_check");
      const id = `run-${(seq += 1)}`;
      state.runs.push({ ...run, id });
      for (const x of exclusions) state.exclusions.push({ ...x, runId: id });
      return id;
    },
  };
}
