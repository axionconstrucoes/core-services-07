// Fase 5 / G — o "chamador" do pipeline: emails (A) -> resolver partes (C) -> classificar (B) -> persistir classificação/sinais (B)
// -> registrar candidatos de contato novo (C). D transforma os sinais em casos de risco (collect-email-risk-cases.ts) — não é tocado aqui.
//
// Garantias (CLAUDE.md 11/12 + briefing Fase 5):
//  - DRY_RUN por padrão: sem `apply` nada é gravado (nem candidatos). Idempotente por (email_id, rule_version) e por (classificação, pilar, tipo).
//  - Mensagem sem projeto => UNLINKED / CANNOT_ANALYZE / EXTERNA_NAO_CLASSIFICADA (nunca oficial). A mensagem original nunca é alterada.
//  - Resolução em lote com cache por (projeto, e-mail); contexto do projeto com cache por projeto.
//  - Falha de resolução/contexto NÃO congela uma classificação: a mensagem falha e será reprocessada (a classificação é idempotente por versão).
//  - Candidatos só para participantes externos desconhecidos, só quando a classificação foi CRIADA agora e sem injeção; ficam PENDING (decisão humana).
import { classifyEmail } from "../email-classification/classify";
import { persistClassification } from "../email-classification/persist";
import { domainOf, forwardedOriginalSender, isForwarded } from "../email-classification/text";
import { RULE_VERSION, UNKNOWN_PARTY, type ClassificationResult, type PartyResolution } from "../email-classification/types";
import type { RpcClient } from "../external-parties/resolve";
import type {
  PartyResolver,
  PipelineEmailRow,
  PipelineMessageOutcome,
  PipelineOptions,
  PipelineReconciliation,
  PipelineReport,
  ProjectContext,
} from "./types";

const ADDRESS = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const DEFAULT_LIMIT = 500;

export function extractAddresses(value: string | null | undefined): string[] {
  if (!value) return [];
  return [...new Set((String(value).match(ADDRESS) ?? []).map((a) => a.toLowerCase()))];
}

function inc(map: Record<string, number>, key: string) {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Resolvedor estrito sobre um RpcClient (cliente service_role, servidor). Diferente de `resolveExternalParty` (fail-closed para
 * autorização), aqui um ERRO de transporte/forma LANÇA: a mensagem falha e é reprocessada, em vez de congelar uma classificação
 * "desconhecida" causada por falha transitória. Resposta válida "known=false" continua sendo desconhecido (fail-closed real).
 */
export function createRpcPartyResolver(client: RpcClient): PartyResolver {
  return async (projectId, email) => {
    const { data, error } = await client.rpc("acc_resolve_external_party", { p_project_id: projectId, p_email: email });
    if (error) throw new Error(`acc_resolve_external_party falhou: ${error.message}`);
    const d = data as Partial<PartyResolution> | null;
    if (!d || typeof d !== "object" || !Array.isArray(d.matches) || typeof d.ambiguous !== "boolean" || typeof d.known !== "boolean") {
      throw new Error("acc_resolve_external_party devolveu forma inesperada");
    }
    return { matches: d.matches, ambiguous: d.ambiguous, domain_shared: d.domain_shared === true, known: d.known };
  };
}

function unlinkedResult(row: PipelineEmailRow): ClassificationResult {
  return {
    email_id: row.id,
    project_id: null,
    project_link_status: "UNLINKED",
    project_link_basis: "mensagem sem projeto (emails.project_id ausente): não classificada como oficial",
    officiality: "EXTERNA_NAO_CLASSIFICADA",
    party_kind: "DESCONHECIDA",
    organization_id: null,
    authority_check: "NOT_APPLICABLE",
    clause_ref: null,
    pillars: [],
    rule_version: RULE_VERSION,
    status: "CANNOT_ANALYZE",
    cannot_reason: "SEM_PROJETO",
    injection_flag: false,
    signals: [],
    notes: [],
  };
}

export async function runEmailPipeline(opts: PipelineOptions): Promise<PipelineReport> {
  const { store, resolveParty } = opts;
  const apply = opts.apply === true;
  const ruleVersion = opts.ruleVersion ?? RULE_VERSION;
  const internal = new Set((opts.internalDomains ?? []).map((d) => d.toLowerCase()));
  const isInternal = (addr: string) => internal.has(domainOf(addr));

  const rows = await store.listEmails({ projectId: opts.projectId ?? null, ruleVersion, limit: opts.limit ?? DEFAULT_LIMIT });
  const notIngested = await store.listExclusionCounts({ projectId: opts.projectId ?? null });

  const resolutionCache = new Map<string, PartyResolution>();
  const ctxCache = new Map<string, ProjectContext>();
  const stats = { requested: 0, cached: 0 };

  async function resolveCached(projectId: string, email: string): Promise<PartyResolution> {
    const key = `${projectId}|${email}`;
    const hit = resolutionCache.get(key);
    if (hit) {
      stats.cached += 1;
      return hit;
    }
    stats.requested += 1;
    const r = await resolveParty(projectId, email);
    resolutionCache.set(key, r);
    return r;
  }
  async function contextFor(projectId: string): Promise<ProjectContext> {
    const hit = ctxCache.get(projectId);
    if (hit) return hit;
    const c = await store.loadProjectContext(projectId);
    ctxCache.set(projectId, c);
    return c;
  }

  const outcomes: PipelineMessageOutcome[] = [];
  const failedIds = new Map<string, string>();
  const pendingReason = new Map<string, "PENDENTE_DRY_RUN" | "SEM_PROJETO">();
  const classifiedNow = new Map<string, { status: string; cannot_reason: string | null }>();
  let newSignals = 0;
  let candRegistered = 0;
  let candWould = 0;
  let newlyClassified = 0;
  let wouldClassify = 0;
  const projects = new Set<string>();

  for (const row of rows) {
    if (row.project_id) projects.add(row.project_id);
    if (row.existing) {
      outcomes.push({ email_id: row.id, project_id: row.project_id, action: "ALREADY_CLASSIFIED", status: row.existing.status, project_link_status: row.existing.project_link_status });
      continue;
    }
    try {
      // ---------- sem projeto: UNLINKED, nunca oficial ----------
      if (!row.project_id) {
        const result = unlinkedResult(row);
        if (apply) {
          await persistClassification(store, result);
          classifiedNow.set(row.id, { status: result.status, cannot_reason: result.cannot_reason });
          newlyClassified += 1;
        } else {
          pendingReason.set(row.id, "SEM_PROJETO");
          wouldClassify += 1;
        }
        outcomes.push({ email_id: row.id, project_id: null, action: apply ? "CLASSIFIED" : "UNLINKED_NO_PROJECT", status: result.status, project_link_status: "UNLINKED", officiality: result.officiality, pillars: [] });
        continue;
      }

      // ---------- participantes (remetente, destinatários, cópia, remetente original de encaminhamento) ----------
      const subject = row.subject ?? "";
      const bodyText = row.body_text ?? row.snippet ?? "";
      const sender = extractAddresses(row.from_address)[0] ?? row.from_address.trim().toLowerCase();
      const to = extractAddresses(row.to_address);
      const cc = (row.cc_addresses ?? []).map((a) => a.toLowerCase());
      const participants = new Set<string>([sender, ...to, ...cc]);
      if (isForwarded(subject, bodyText)) {
        const orig = forwardedOriginalSender(bodyText);
        if (orig) participants.add(orig);
      }
      const external = [...participants].filter((a) => a.includes("@") && !isInternal(a));

      const partyByEmail: Record<string, PartyResolution> = {};
      for (const addr of external) partyByEmail[addr] = await resolveCached(row.project_id, addr);

      const pctx = await contextFor(row.project_id);
      const result = classifyEmail(
        {
          id: row.id,
          candidateProjectId: row.project_id,
          subject,
          bodyText,
          from: sender,
          to,
          cc,
          direction: row.direction ?? undefined,
          sentAt: row.sent_at ?? undefined,
          attachments: (row.attachments_meta ?? []).map((a) => ({ filename: String(a.filename ?? "anexo"), available: a.status !== "UNAVAILABLE" })),
        },
        { facts: pctx.facts, internalDomains: [...internal], partyByEmail, otherProjectRefs: pctx.otherProjectRefs },
      );

      // Candidatos: participante externo desconhecido; nunca em mensagem com instrução embutida (evita poluir a fila com remetente suspeito).
      const candidates = result.injection_flag ? [] : external.filter((a) => !(partyByEmail[a] ?? UNKNOWN_PARTY).known);
      const base: PipelineMessageOutcome = {
        email_id: row.id,
        project_id: row.project_id,
        action: apply ? "CLASSIFIED" : "WOULD_CLASSIFY",
        status: result.status,
        project_link_status: result.project_link_status,
        officiality: result.officiality,
        pillars: result.pillars,
      };
      if (!apply) {
        pendingReason.set(row.id, "PENDENTE_DRY_RUN");
        wouldClassify += 1;
        candWould += candidates.length;
        outcomes.push({ ...base, signals_new: result.signals.length, candidates_would_register: candidates });
        continue;
      }
      const persisted = await persistClassification(store, result);
      classifiedNow.set(row.id, { status: result.status, cannot_reason: result.cannot_reason });
      newSignals += persisted.newSignals;
      const registered: string[] = [];
      if (persisted.created) {
        newlyClassified += 1;
        for (const addr of candidates) {
          await store.registerCandidate(row.project_id, addr, row.id);
          registered.push(addr);
        }
        candRegistered += registered.length;
      }
      outcomes.push({ ...base, action: persisted.created ? "CLASSIFIED" : "ALREADY_CLASSIFIED", signals_new: persisted.newSignals, candidates_registered: registered });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 300);
      failedIds.set(row.id, msg);
      outcomes.push({ email_id: row.id, project_id: row.project_id, action: "FAILED", error: msg });
    }
  }

  // ---------- reconciliação: ingeridas × classificadas × sem classificação (com motivo) ----------
  const rec: PipelineReconciliation = {
    ingested: rows.length,
    classified: 0,
    unclassified: 0,
    identity_ok: false,
    classified_by_status: {},
    cannot_analyze_by_reason: {},
    unclassified_by_reason: {},
    not_ingested_by_reason: Object.fromEntries(notIngested.map((x) => [x.reason, x.count])),
  };
  for (const row of rows) {
    const cls = row.existing ?? classifiedNow.get(row.id) ?? null;
    if (cls) {
      rec.classified += 1;
      inc(rec.classified_by_status, cls.status);
      if (cls.status === "CANNOT_ANALYZE") inc(rec.cannot_analyze_by_reason, cls.cannot_reason ?? "SEM_MOTIVO_REGISTRADO");
    } else {
      rec.unclassified += 1;
      inc(rec.unclassified_by_reason, failedIds.has(row.id) ? "ERRO_NA_CLASSIFICACAO" : (pendingReason.get(row.id) ?? "PENDENTE_DRY_RUN"));
    }
  }
  rec.identity_ok = rec.ingested === rec.classified + rec.unclassified;

  return {
    mode: apply ? "APPLY" : "DRY_RUN",
    rule_version: ruleVersion,
    projects: [...projects].sort(),
    outcomes,
    reconciliation: rec,
    totals: {
      newly_classified: newlyClassified,
      would_classify: wouldClassify,
      signals_new: newSignals,
      candidates_registered: candRegistered,
      candidates_would_register: candWould,
      resolutions_requested: stats.requested,
      resolutions_cached: stats.cached,
      failed: failedIds.size,
    },
  };
}
