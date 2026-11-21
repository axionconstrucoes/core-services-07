// Fase 5 / G — store SQL do pipeline (servidor/worker, conexão de serviço; NUNCA no frontend). Recebe um cliente com `query(sql, params)`
// (ex.: pg.Client) já conectado pelo chamador — este módulo não abre conexões nem lê segredos.
// Tabelas: public.emails (A, só leitura), email_message_classifications/email_risk_signals (B, escrita idempotente),
// email_ingestion_exclusions (A, só leitura), external_org_project_links (C, só leitura), acc_external_candidate_register (C).
import type { RpcClient } from "../external-parties/resolve";
import type { PipelineStore } from "./types";

export interface SqlClient {
  query(sql: string, params?: unknown[]): PromiseLike<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

/**
 * Adaptador RpcClient sobre SQL: executa a função como PAPEL DE SERVIÇO (claims locais da transação), que é o que
 * acc_resolve_external_party / acc_external_candidate_register exigem para ingestão server-side. Somente funções permitidas.
 */
const ALLOWED_RPC: Record<string, { sql: string; args: string[] }> = {
  acc_resolve_external_party: { sql: "select public.acc_resolve_external_party($1::uuid, $2::text) as data", args: ["p_project_id", "p_email"] },
};

export function createSqlRpcClient(client: SqlClient): RpcClient {
  return {
    async rpc(fn, args) {
      const def = ALLOWED_RPC[fn];
      if (!def) return { data: null, error: { message: `RPC não permitida: ${fn}` } };
      try {
        await client.query("begin");
        await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        const r = await client.query(def.sql, def.args.map((a) => args[a]));
        await client.query("commit");
        return { data: r.rows[0]?.data ?? null, error: null };
      } catch (e) {
        await Promise.resolve(client.query("rollback")).catch(() => undefined);
        return { data: null, error: { message: String((e as Error).message ?? e).slice(0, 200) } };
      }
    },
  };
}

export function createSqlPipelineStore(client: SqlClient): PipelineStore {
  return {
    async listEmails({ projectId, ruleVersion, limit }) {
      const r = await client.query(
        `select e.id, e.project_id, e.from_address, e.to_address, e.cc_addresses, e.subject, e.body_text, e.snippet, e.direction,
                e.sent_at, e.attachments_meta, c.status as c_status, c.cannot_reason as c_reason, c.project_link_status as c_link
           from public.emails e
           left join public.email_message_classifications c on c.email_id = e.id and c.rule_version = $2
          where ($1::uuid is null or e.project_id = $1::uuid)
          order by (c.id is not null) asc, e.sent_at asc, e.id asc
          limit $3`,
        [projectId ?? null, ruleVersion, limit],
      );
      return r.rows.map((x) => ({
        id: x.id as string,
        project_id: (x.project_id as string | null) ?? null,
        from_address: String(x.from_address ?? ""),
        to_address: (x.to_address as string | null) ?? null,
        cc_addresses: (x.cc_addresses as string[] | null) ?? null,
        subject: (x.subject as string | null) ?? null,
        body_text: (x.body_text as string | null) ?? null,
        snippet: (x.snippet as string | null) ?? null,
        direction: (x.direction as "INBOUND" | "OUTBOUND" | null) ?? null,
        sent_at: x.sent_at ? new Date(x.sent_at as string).toISOString() : null,
        attachments_meta: (x.attachments_meta as Array<{ filename?: string; status?: string }> | null) ?? null,
        existing: x.c_status ? { status: x.c_status as string, cannot_reason: (x.c_reason as string | null) ?? null, project_link_status: x.c_link as string } : null,
      }));
    },
    async loadProjectContext(projectId) {
      const mine = await client.query(
        "select distinct contract_ref from public.external_org_project_links where project_id = $1::uuid and contract_ref is not null and contract_ref <> '' and status <> 'ENDED'",
        [projectId],
      );
      const others = await client.query(
        "select distinct project_id, contract_ref from public.external_org_project_links where project_id <> $1::uuid and contract_ref is not null and contract_ref <> '' and status <> 'ENDED'",
        [projectId],
      );
      return {
        facts: { projectId, contractRefs: mine.rows.map((x) => String(x.contract_ref)) },
        otherProjectRefs: others.rows.map((x) => ({ projectId: String(x.project_id), ref: String(x.contract_ref) })),
      };
    },
    async listExclusionCounts({ projectId }) {
      const r = await client.query(
        "select reason, count(*)::int as n from public.email_ingestion_exclusions where message_ingested = false and ($1::uuid is null or project_id = $1::uuid) group by reason order by reason",
        [projectId ?? null],
      );
      return r.rows.map((x) => ({ reason: String(x.reason), count: Number(x.n) }));
    },
    async registerCandidate(projectId, email, emailId) {
      await client.query("begin");
      try {
        await client.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
        const r = await client.query("select public.acc_external_candidate_register($1::uuid, $2::text, $3::uuid) as id", [projectId, email, emailId]);
        await client.query("commit");
        return (r.rows[0]?.id as string | null) ?? null;
      } catch (e) {
        await Promise.resolve(client.query("rollback")).catch(() => undefined);
        throw e;
      }
    },
    async upsertClassification(row) {
      const r = await client.query(
        `insert into public.email_message_classifications (email_id, project_id, project_link_status, project_link_basis, officiality, party_kind, organization_id, authority_check, clause_ref, pillars, rule_version, status, cannot_reason, injection_flag)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict (email_id, rule_version) do update set rule_version = excluded.rule_version
         returning id, (xmax = 0) as created`,
        [row.email_id, row.project_id, row.project_link_status, row.project_link_basis, row.officiality, row.party_kind, row.organization_id, row.authority_check, row.clause_ref, row.pillars, row.rule_version, row.status, row.cannot_reason, row.injection_flag],
      );
      return { id: r.rows[0].id as string, created: Boolean(r.rows[0].created) };
    },
    async insertSignals(rows) {
      let n = 0;
      for (const s of rows) {
        const r = await client.query(
          `insert into public.email_risk_signals (email_id, classification_id, project_id, pillar, signal_kind, summary, evidence_excerpt, evidence_ref, is_indication, confirmed, quantified_impact)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (classification_id, pillar, signal_kind) do nothing`,
          [s.email_id, s.classification_id, s.project_id, s.pillar, s.signal_kind, s.summary, s.evidence_excerpt, s.evidence_ref, s.is_indication, s.confirmed, s.quantified_impact ? JSON.stringify(s.quantified_impact) : null],
        );
        n += r.rowCount ?? 0;
      }
      return n;
    },
  };
}
