// Fase 5/A — armazenamento sobre Supabase (service_role, SOMENTE no servidor/worker; nunca no frontend). Exige a migration
// 20261201100000 aplicada. Testado com cliente Supabase FALSO (test-f5-a-store-adapter.mjs) e as tabelas validadas em
// PostgreSQL real local (test-f5-a-monitoramento-realpg.mjs). Nenhuma chamada ao banco operacional é feita por testes.
const fail = (error) => Object.assign(new Error(error.message ?? "erro do banco"), { code: error.code });

export function createSupabaseStore(client) {
  return {
    async getCursor({ projectId, provider, mailbox }) {
      const { data, error } = await client.from("email_sync_cursors").select("cursor").eq("project_id", projectId).eq("provider", provider).eq("mailbox", mailbox).maybeSingle();
      if (error) throw fail(error);
      return data?.cursor ?? null;
    },
    async saveCursor({ projectId, provider, mailbox, cursor, lastSuccessAt }) {
      const { error } = await client.from("email_sync_cursors").upsert(
        { project_id: projectId, provider, mailbox, cursor, last_success_at: lastSuccessAt, updated_at: new Date().toISOString() },
        { onConflict: "project_id,provider,mailbox" },
      );
      if (error) throw fail(error);
    },
    async findBySource({ projectId, provider, mailbox, providerMessageId }) {
      const { data, error } = await client.from("emails").select("id").eq("project_id", projectId).eq("provider", provider).eq("mailbox_address", mailbox).eq("provider_message_id", providerMessageId).maybeSingle();
      if (error) throw fail(error);
      return data ?? null;
    },
    async findByCanonicalKey({ projectId, key }) {
      const { data, error } = await client.from("emails").select("id").eq("project_id", projectId).eq("canonical_message_key", key).limit(1);
      if (error) throw fail(error);
      return data?.[0] ?? null;
    },
    async insertEmail(row) {
      const { data, error } = await client.from("emails").insert(row).select("id").single();
      if (error) throw fail(error);
      return { id: data.id };
    },
    async addSource({ emailId, projectId, provider, mailbox, providerMessageId }) {
      const { error } = await client.from("email_message_sources").insert({ email_id: emailId, project_id: projectId, provider, mailbox, provider_message_id: providerMessageId });
      if (error && error.code !== "23505") throw fail(error);
    },
    async recordRun(run, exclusions) {
      const { data, error } = await client.from("email_sync_reconciliation_runs").insert({
        provider: run.provider, mailbox: run.mailbox, project_id: run.projectId, period_start: run.periodStart, period_end: run.periodEnd,
        universe_count: run.universeCount, eligible_count: run.eligibleCount, processed_count: run.processedCount, excluded_count: run.excludedCount, failed_count: run.failedCount,
        gaps: run.gaps, status: run.status, mode: run.mode, rule_id: run.ruleId,
      }).select("id").single();
      if (error) throw fail(error);
      if (exclusions.length > 0) {
        const rows = exclusions.map((x) => ({ run_id: data.id, project_id: run.projectId, provider: x.provider, provider_message_id: x.providerMessageId, reason: x.reason, detail: x.detail, message_ingested: x.messageIngested }));
        for (let i = 0; i < rows.length; i += 500) {
          const res = await client.from("email_ingestion_exclusions").insert(rows.slice(i, i + 500));
          if (res.error) throw fail(res.error);
        }
      }
      return data.id;
    },
  };
}
