// Modelos de visão (view models) da interface de seguros: PUROS, determinísticos, sem rede e sem IA. Reaproveitam o domínio da fase 1
// (apps/web/lib/insurance) — nunca recalculam regra de cobertura, endosso, adiantamento ou envio por conta própria.
// Convenções: dado ausente = "SEM DADOS" (nunca zero); toda conclusão derivada é INFERÊNCIA com revisão humana; nada é enviado.
import {
  assessCoverage,
  auditPolicySubjects,
  buildDossierChecklist,
  buildDraft,
  claimFlowFor,
  compareEndorsementTexts,
  computeAdvanceBalance,
  dossierProgress,
  endorsementExtendsCoverage,
  endorsementStatusLabel,
  reviewBlock,
  reviewProgress,
  reviewProgressLabel,
  type EndorsementReviewState,
  type ReviewBlockCode,
  type ReviewProgress,
  evaluateNoticeDeadline,
  evaluateSendAttempt,
  isRealSendFlagOn,
  nextClaimStages,
  type BuiltDraft,
  type ClaimFlow,
  type ClaimKind,
  type ClauseEvidence,
  type CoverageAssessment,
  type DraftKind,
  type EndorsementSummary,
  type InstrumentKind,
  type PolicyParty,
  type SendAttemptResult,
} from "@/lib/insurance/index";
import { formatMoney, NO_DATA, toNumber } from "./format";
import { CLAIM_KIND_LABEL, MODALITY_LABEL, labelOf } from "./labels";
import type {
  AdvanceRow, AmortizationRow, ChannelRow, ClauseRow, ClaimRow, DashboardItemRow, DocumentRef, DossierItemRow, DraftRow,
  EndorsementReviewRow, EndorsementRow, InsuranceWorkspaceData, PartyRow, PolicyRow,
} from "./types";

/* ------------------------------------------------------------------ apólice ------------------------------------------------------------------ */

export type ValidityState = "SEM_DADOS" | "A_INICIAR" | "EM_VIGENCIA" | "ENCERRADA";

/** Situação TEMPORAL da vigência cadastrada (derivada das datas e de "hoje"); NÃO substitui o status cadastrado da apólice. */
export function policyValidity(p: Pick<PolicyRow, "coverage_start" | "coverage_end">, today: string): ValidityState {
  if (!p.coverage_start || !p.coverage_end) return "SEM_DADOS";
  if (today < p.coverage_start) return "A_INICIAR";
  if (today > p.coverage_end) return "ENCERRADA";
  return "EM_VIGENCIA";
}

/** Divergência entre o status cadastrado e a vigência por data (ex.: VIGENTE com fim já passado) — mostrada como FATO, nunca corrigida em silêncio. */
export function policyStatusAlert(p: Pick<PolicyRow, "status" | "coverage_start" | "coverage_end">, today: string): string | null {
  const v = policyValidity(p, today);
  if (p.status === "VIGENTE" && v === "ENCERRADA") return "Cadastrada como VIGENTE, mas a data de fim da vigência já passou: confira a renovação ou atualize a situação.";
  if (p.status === "VIGENTE" && v === "A_INICIAR") return "Cadastrada como VIGENTE, mas a vigência ainda não começou.";
  if (p.status === "VIGENTE" && v === "SEM_DADOS") return "Cadastrada como VIGENTE sem datas de vigência completas: SEM DADOS para confirmar a vigência.";
  return null;
}

export function policyTitle(p: Pick<PolicyRow, "modality" | "policy_number" | "insurer_name">): string {
  return `${labelOf(MODALITY_LABEL, p.modality)} — ${p.policy_number ?? "nº SEM DADOS"} — ${p.insurer_name}`;
}

export function snapshotSummary(snapshot: Record<string, unknown> | null): { parties: number | null; clauses: number | null; status: string | null; coverage: string | null } {
  if (!snapshot || typeof snapshot !== "object") return { parties: null, clauses: null, status: null, coverage: null };
  const pol = (snapshot as { policy?: Record<string, unknown> }).policy;
  const parties = (snapshot as { parties?: unknown[] }).parties;
  const clauses = (snapshot as { clauses?: unknown[] }).clauses;
  const s = pol && typeof pol.coverage_start === "string" ? pol.coverage_start : null;
  const e = pol && typeof pol.coverage_end === "string" ? pol.coverage_end : null;
  return {
    parties: Array.isArray(parties) ? parties.length : null,
    clauses: Array.isArray(clauses) ? clauses.length : null,
    status: pol && typeof pol.status === "string" ? pol.status : null,
    coverage: s && e ? `${s} a ${e}` : null,
  };
}

/* --------------------------------------------------------------- cláusulas / partes -------------------------------------------------------------- */

export function toClauseEvidence(c: ClauseRow): ClauseEvidence {
  return {
    id: c.id,
    kind: c.kind,
    title: c.title,
    identifier: c.clause_identifier ?? null,
    appliesTo: c.applies_to ?? [],
    amount: toNumber(c.amount),
    deadlineDays: c.deadline_days,
    source: { documentId: c.source_document_id, ref: c.source_ref, page: c.source_page },
    verified: c.verified,
  };
}

export function toPolicyParties(parties: PartyRow[]): PolicyParty[] {
  return parties.filter((p) => p.active).map((p) => ({ role: p.party_role, name: p.party_name, taxId: p.tax_id, identificationStatus: p.identification_status }));
}

/* ------------------------------------------------------------------ endossos ------------------------------------------------------------------ */

export function toEndorsementSummary(e: EndorsementRow): EndorsementSummary {
  return { id: e.id, state: e.state, coverageEffective: e.coverage_effective, issuedDocumentId: e.issued_document_id };
}

export interface EndorsementView {
  statusText: string;
  extendsCoverage: boolean;
  /** Próximas ações possíveis (espelham a máquina de estados do banco). */
  nextActions: Array<"EM_ANALISE" | "EMITIDO" | "CONFERIDO" | "RECUSADO">;
  comparison: ReturnType<typeof compareEndorsementTexts> | null;
  /** Fase 3/C: andamento da conferência (simples ou dupla) e por que o usuário atual não pode conferir (null = pode). */
  reviewState: EndorsementReviewState;
  progress: ReviewProgress;
  progressText: string;
  reviewBlock: ReviewBlockCode | null;
  /** Conferências da rodada atual, da mais antiga para a mais recente. */
  currentReviews: EndorsementReviewRow[];
}

export function endorsementReviewState(e: EndorsementRow): EndorsementReviewState {
  return {
    // fail-closed: linha sem o campo (banco antigo) é tratada como dupla conferência
    requiresDualReview: e.requires_dual_review !== false,
    legacySingleReview: e.legacy_single_review === true,
    state: e.state,
    reviewRound: e.review_round ?? 1,
    requestedBy: e.requested_by ?? null,
    issuedBy: e.issued_by ?? null,
  };
}

export function endorsementView(e: EndorsementRow, reviews: EndorsementReviewRow[] = [], userId: string | null = null, canManage = false, hasReviewCompetence = false): EndorsementView {
  const summary = toEndorsementSummary(e);
  const nextActions: EndorsementView["nextActions"] =
    e.state === "SOLICITADO" ? ["EM_ANALISE", "EMITIDO", "RECUSADO"] : e.state === "EM_ANALISE" || e.state === "EM_REVISAO" ? ["EMITIDO", "RECUSADO"] : e.state === "EMITIDO" ? ["CONFERIDO"] : [];
  const reviewState = endorsementReviewState(e);
  const mine = reviews.filter((r) => r.endorsement_id === e.id);
  const lite = mine.map((r) => ({ reviewRound: r.review_round, reviewNo: r.review_no, reviewerId: r.reviewer_id, outcome: r.outcome }));
  const progress = reviewProgress(reviewState, lite);
  return {
    reviewState,
    progress,
    progressText: reviewProgressLabel(reviewState, progress),
    reviewBlock: reviewBlock(userId, canManage, reviewState, lite, hasReviewCompetence),
    currentReviews: mine.filter((r) => r.review_round === reviewState.reviewRound).sort((a, b) => a.review_no - b.review_no),
    statusText: endorsementStatusLabel(summary),
    extendsCoverage: endorsementExtendsCoverage(summary),
    nextActions,
    comparison: e.issued_text ? compareEndorsementTexts(e.requested_text, e.issued_text) : null,
  };
}

/* ---------------------------------------------------------------- adiantamentos ---------------------------------------------------------------- */

export interface AdvanceView {
  balance: ReturnType<typeof computeAdvanceBalance>;
  policyMaxAmount: number | null;
  amortizations: AmortizationRow[];
}

export function advanceView(a: AdvanceRow, amortizations: AmortizationRow[], policies: PolicyRow[]): AdvanceView {
  const own = amortizations.filter((m) => m.advance_id === a.id);
  const policy = a.policy_id ? policies.find((p) => p.id === a.policy_id) : undefined;
  const policyMax = toNumber(policy?.max_amount);
  const balance = computeAdvanceBalance({
    advancedAmount: toNumber(a.advanced_amount) ?? 0,
    amortizations: own.map((m) => toNumber(m.amount) ?? 0),
    guaranteedLimit: toNumber(a.guaranteed_limit),
    policyMaxAmount: policyMax,
    balanceDueInformed: toNumber(a.balance_due_informed),
    indemnifiableInformed: toNumber(a.indemnifiable_informed),
  });
  return { balance, policyMaxAmount: policyMax, amortizations: own };
}

/* ------------------------------------------------------------------ sinistros ------------------------------------------------------------------ */

export type ClaimInstrument =
  | { kind: "SEGURO"; label: string; id: string }
  | { kind: "FIANCA_BANCARIA"; label: string; id: string }
  | { kind: "CAUCAO" | "CARTA_FIANCA_NAO_BANCARIA" | "OUTRA_GARANTIA"; label: string; id: string }
  | { kind: "SEM_INSTRUMENTO"; label: string; id: null; reason: string | null };

export function claimInstrument(c: ClaimRow, data: Pick<InsuranceWorkspaceData, "policies" | "bankGuarantees" | "otherGuarantees">): ClaimInstrument {
  if (c.policy_id) {
    const p = data.policies.find((x) => x.id === c.policy_id);
    return { kind: "SEGURO", id: c.policy_id, label: p ? policyTitle(p) : "Apólice (não carregada)" };
  }
  if (c.bank_guarantee_id) {
    const g = data.bankGuarantees.find((x) => x.id === c.bank_guarantee_id);
    return { kind: "FIANCA_BANCARIA", id: c.bank_guarantee_id, label: g ? `Fiança bancária — ${g.bank_name} ${g.guarantee_number ?? ""}`.trim() : "Fiança (não carregada)" };
  }
  if (c.other_guarantee_id) {
    const g = data.otherGuarantees.find((x) => x.id === c.other_guarantee_id);
    const kind = g?.guarantee_type === "CAUCAO" ? "CAUCAO" : g?.guarantee_type === "CARTA_FIANCA_NAO_BANCARIA" ? "CARTA_FIANCA_NAO_BANCARIA" : "OUTRA_GARANTIA";
    return { kind, id: c.other_guarantee_id, label: g ? `${g.guarantee_type} — ${g.issuer_name ?? "emissor SEM DADOS"}` : "Garantia (não carregada)" };
  }
  return { kind: "SEM_INSTRUMENTO", id: null, label: "SEM INSTRUMENTO (apólice/garantia ausente)", reason: c.no_instrument_reason };
}

export interface ClaimCoverageView {
  /** null quando o instrumento não é seguro (fiança/caução) — avaliação de cobertura de apólice não se aplica. */
  assessment: CoverageAssessment | null;
  notApplicableReason: string | null;
}

export function claimCoverageView(c: ClaimRow, data: InsuranceWorkspaceData, now: Date): ClaimCoverageView {
  const instrument = claimInstrument(c, data);
  if (instrument.kind === "FIANCA_BANCARIA" || instrument.kind === "CAUCAO" || instrument.kind === "CARTA_FIANCA_NAO_BANCARIA" || instrument.kind === "OUTRA_GARANTIA") {
    return { assessment: null, notApplicableReason: "O instrumento NÃO é seguro: a avaliação de cobertura de apólice não se aplica. Siga somente o texto do instrumento (fluxo de banco/emissor)." };
  }
  const policy = c.policy_id ? data.policies.find((p) => p.id === c.policy_id) ?? null : null;
  const assessment = assessCoverage({
    modality: policy?.modality ?? null,
    claimKind: c.claim_kind as ClaimKind,
    eventDate: c.occurrence_date,
    policy: policy ? { coverageStart: policy.coverage_start, coverageEnd: policy.coverage_end } : null,
    clauses: policy ? data.clauses.filter((x) => x.policy_id === policy.id).map(toClauseEvidence) : [],
    endorsements: policy ? data.endorsements.filter((e) => e.policy_id === policy.id).map(toEndorsementSummary) : [],
    noticeDeadline: evaluateNoticeDeadline(c.notice_deadline_at, c.notice_deadline_basis, now),
    rccReady: data.rccReady?.[c.id] ?? null,
  });
  return { assessment, notApplicableReason: null };
}

export function claimNotice(c: ClaimRow, now: Date) {
  return evaluateNoticeDeadline(c.notice_deadline_at, c.notice_deadline_basis, now);
}

export function claimNextStages(c: ClaimRow) {
  return nextClaimStages(c.stage);
}

/* ------------------------------------------------------------------- minutas ------------------------------------------------------------------- */

export type ChannelAvailability = "SEM_CANAL" | "INATIVO" | "NAO_VERIFICADO" | "DISPONIVEL";

/** CASO 30 (seguradora indisponível): sem canal oficial ativo e verificado a minuta permanece DRAFT e nada sai. */
export function channelAvailability(ch: Pick<ChannelRow, "active" | "verified_at"> | null | undefined): ChannelAvailability {
  if (!ch) return "SEM_CANAL";
  if (!ch.active) return "INATIVO";
  if (!ch.verified_at) return "NAO_VERIFICADO";
  return "DISPONIVEL";
}

export const CHANNEL_AVAILABILITY_TEXT: Record<ChannelAvailability, string> = {
  SEM_CANAL: "Nenhum canal oficial cadastrado para este instrumento: a comunicação não tem destino válido. Cadastre o canal com fonte; nenhum endereço é inventado.",
  INATIVO: "O canal oficial cadastrado está INATIVO (seguradora/banco indisponível por este canal). A minuta permanece DRAFT; nada é enviado.",
  NAO_VERIFICADO: "O canal oficial existe, mas ainda não foi verificado por um gestor. A minuta permanece DRAFT; nada é enviado.",
  DISPONIVEL: "Canal oficial cadastrado, ativo e verificado. Mesmo assim, o envio real continua bloqueado nesta fase.",
};

export function channelsFor(data: Pick<InsuranceWorkspaceData, "channels">, ref: { policyId?: string | null; bankGuaranteeId?: string | null }): ChannelRow[] {
  return data.channels.filter((c) => (ref.policyId && c.policy_id === ref.policyId) || (ref.bankGuaranteeId && c.bank_guarantee_id === ref.bankGuaranteeId));
}

/** Escolhe o melhor canal vinculado (verificado e ativo primeiro). */
export function bestChannel(channels: ChannelRow[]): ChannelRow | null {
  const rank = (c: ChannelRow) => (c.active && c.verified_at ? 0 : c.active ? 1 : 2);
  return [...channels].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

export function draftKindForClaim(c: ClaimRow, instrument: ClaimInstrument): DraftKind {
  if (instrument.kind !== "SEGURO") return "COBRANCA_FIANCA";
  if (c.stage === "EXPECTATIVA") return "EXPECTATIVA_SINISTRO";
  if (c.stage === "AVISO") return "AVISO_SINISTRO";
  return "RECLAMACAO";
}

export interface AcionamentoPlan {
  claimId: string;
  instrument: ClaimInstrument;
  /** null quando não há instrumento (nenhum procedimento é presumido). */
  flow: ClaimFlow | null;
  counterpartLabel: string;
  draftKind: DraftKind | null;
  channel: ChannelRow | null;
  channelState: ChannelAvailability;
  coverage: ClaimCoverageView;
  draft: BuiltDraft | null;
  /** Impedimentos objetivos para PREPARAR a minuta (não para enviar: o envio está sempre bloqueado). */
  blockers: string[];
}

function docSourceText(id: string | null, ref: string | null, docs: DocumentRef[]): string | null {
  if (id) {
    const d = docs.find((x) => x.id === id);
    return d ? `${d.title} (documento ${id})` : `documento ${id}`;
  }
  return ref?.trim() || null;
}

/** PREPARAR ACIONAMENTO: fluxo seguradora x banco/emissor, minuta DRAFT, avaliação de cobertura (INFERÊNCIA) e canal oficial. Nada é enviado. */
export function prepareAcionamento(c: ClaimRow, data: InsuranceWorkspaceData, now: Date): AcionamentoPlan {
  const instrument = claimInstrument(c, data);
  const blockers: string[] = [];
  const coverage = claimCoverageView(c, data, now);
  if (instrument.kind === "SEM_INSTRUMENTO") {
    blockers.push("Apólice/garantia ausente: sem instrumento não há procedimento de acionamento nem destinatário. Localize o instrumento e vincule-o antes de preparar a comunicação (SEM DADOS).");
    return { claimId: c.id, instrument, flow: null, counterpartLabel: "SEM DADOS", draftKind: null, channel: null, channelState: "SEM_CANAL", coverage, draft: null, blockers };
  }
  const instrumentKind: InstrumentKind = instrument.kind === "OUTRA_GARANTIA" ? "OUTRA_GARANTIA" : instrument.kind;
  const flow = claimFlowFor(instrumentKind);
  const counterpartLabel = flow.counterpart === "SEGURADORA" ? "Seguradora" : flow.counterpart === "BANCO" ? "Banco" : "Emissor";
  const policy = c.policy_id ? data.policies.find((p) => p.id === c.policy_id) : undefined;
  const bank = c.bank_guarantee_id ? data.bankGuarantees.find((g) => g.id === c.bank_guarantee_id) : undefined;
  const other = c.other_guarantee_id ? data.otherGuarantees.find((g) => g.id === c.other_guarantee_id) : undefined;
  const channels = channelsFor(data, { policyId: c.policy_id, bankGuaranteeId: c.bank_guarantee_id });
  const channel = bestChannel(channels);
  const channelState = channelAvailability(channel);
  if (channelState !== "DISPONIVEL") blockers.push(CHANNEL_AVAILABILITY_TEXT[channelState]);
  if (c.stage === "ENCERRADO") blockers.push("O evento está ENCERRADO: não se prepara nova comunicação.");

  const draftKind = draftKindForClaim(c, instrument);
  const sources = [docSourceText(c.source_document_id, c.source_ref, data.documents)].filter((s): s is string => Boolean(s));
  const draft = buildDraft(draftKind, {
    insurerOrBankName: policy?.insurer_name ?? bank?.bank_name ?? other?.issuer_name ?? null,
    policyOrGuaranteeNumber: policy?.policy_number ?? bank?.guarantee_number ?? null,
    contractRef: policy?.contract_number ?? bank?.contract_number ?? other?.contract_number ?? null,
    eventDescription: `${labelOf(CLAIM_KIND_LABEL, c.claim_kind)}: ${c.title}`,
    eventDate: c.occurrence_date,
    protocol: c.protocol,
    amount: toNumber(c.claimed_amount),
    sources,
  });
  // Acrescenta à base da minuta a conclusão de cobertura como INFERÊNCIA (nunca como fato) e as limitações do fluxo.
  if (coverage.assessment) {
    draft.basis.inferences.push(
      `Avaliação de cobertura (INFERÊNCIA, revisão humana obrigatória): ${labelOf({ POTENCIALMENTE_COBERTO: "potencialmente coberto", NAO_COBERTO: "não coberto por exclusão aplicável", CONDICIONADO: "cobertura condicionada", INFORMACOES_INSUFICIENTES: "informações insuficientes" }, coverage.assessment.conclusion)}`,
    );
  }
  for (const n of flow.notes) draft.basis.recommendations.push(n);
  return { claimId: c.id, instrument, flow, counterpartLabel, draftKind, channel, channelState, coverage, draft, blockers };
}

/** Minuta para solicitar endosso a partir de um pedido registrado (texto solicitado vem do cadastro; lacunas viram [PREENCHER ...]). */
export function prepareEndorsementDraft(e: EndorsementRow, data: InsuranceWorkspaceData): { draft: BuiltDraft; channel: ChannelRow | null; channelState: ChannelAvailability } {
  const policy = data.policies.find((p) => p.id === e.policy_id);
  const channel = bestChannel(channelsFor(data, { policyId: e.policy_id }));
  const draft = buildDraft("ENDOSSO", {
    insurerOrBankName: policy?.insurer_name ?? null,
    policyOrGuaranteeNumber: policy?.policy_number ?? null,
    contractRef: policy?.contract_number ?? null,
    endorsementRequestedText: e.requested_text,
    sources: [docSourceText(e.request_document_id, e.request_ref, data.documents)].filter((s): s is string => Boolean(s)),
  });
  draft.basis.recommendations.push("Pedido de endosso NÃO é endosso emitido: sem efeito de cobertura até a emissão formal conferida.");
  return { draft, channel, channelState: channelAvailability(channel) };
}

export interface DraftSendView {
  result: SendAttemptResult;
  /** O botão "Enviar" nunca é habilitado nesta fase (CASO 32). */
  sendButtonEnabled: false;
}

export function draftSendView(d: DraftRow, channel: ChannelRow | null, settings: { real_send_enabled: boolean } | null, env: Record<string, string | undefined> = {}): DraftSendView {
  void env; // o painel reflete o estado do BANCO (insurance_settings); a flag de ambiente só vale no servidor
  const result = evaluateSendAttempt({
    flagEnabled: settings?.real_send_enabled === true || isRealSendFlagOn(env),
    draftState: d.state,
    approvedBodyHash: d.approved_body_hash,
    // o hash do corpo atual é md5 no banco; aqui só comparamos se o texto foi alterado após aprovação via estado: o banco recalcula na tentativa
    bodyHash: d.approved_body_hash ?? "",
    channel: channel ? { registered: true, active: channel.active, verified: Boolean(channel.verified_at) } : null,
  });
  return { result, sendButtonEnabled: false };
}

/* ------------------------------------------------------------------- dossiê ------------------------------------------------------------------- */

export function dossierForPolicy(policy: PolicyRow, items: DossierItemRow[]) {
  const own = items.filter((i) => i.policy_id === policy.id);
  const template = buildDossierChecklist(policy.modality);
  const have = new Set(own.map((i) => i.item_key));
  const missingFromTemplate = template.filter((t) => !have.has(t.key));
  return {
    items: own,
    progress: dossierProgress(own.map((i) => ({ key: i.item_key, required: i.required, status: i.status }))),
    missingFromTemplate,
    template,
  };
}

/* ---------------------------------------------------------------- sujeitos / RCC ---------------------------------------------------------------- */

export function subjectsAuditFor(policy: PolicyRow, parties: PartyRow[], expected: { insuredName?: string; insuredTaxId?: string; mentionsFinal?: boolean | null }) {
  return auditPolicySubjects(toPolicyParties(parties.filter((p) => p.policy_id === policy.id)), {
    insured: expected.insuredName || expected.insuredTaxId ? { name: expected.insuredName ?? null, taxId: expected.insuredTaxId ?? null } : null,
    contractMentionsFinalBeneficiary: expected.mentionsFinal ?? null,
  });
}

/* -------------------------------------------------------------------- painel -------------------------------------------------------------------- */

export interface Kpi {
  id: string;
  /** null = SEM DADOS (nada cadastrado para calcular). */
  value: number | null;
  detail: string;
}

/** KPIs do painel: contagens sobre as linhas CARREGADAS (RLS). Tabela vazia => SEM DADOS (nunca zero). */
export function overviewKpis(data: InsuranceWorkspaceData, today: string): Kpi[] {
  const policies = data.policies;
  const inForce = policies.filter((p) => p.status === "VIGENTE" && policyValidity(p, today) === "EM_VIGENCIA").length;
  const expiring = data.dashboardItems.filter((i) => i.kind === "VENCIMENTO");
  const pendingEnd = data.endorsements.filter((e) => ["SOLICITADO", "EM_ANALISE", "EMITIDO", "EM_REVISAO"].includes(e.state)).length;
  const openClaims = data.claims.filter((c) => c.stage !== "ENCERRADO").length;
  const insufficient = data.dashboardItems.filter((i) => i.kind === "GARANTIA_INSUFICIENTE").length;
  const hasInstruments = policies.length + data.bankGuarantees.length + data.otherGuarantees.length > 0;
  return [
    { id: "apolices-vigentes", value: policies.length ? inForce : null, detail: policies.length ? `${policies.length} apólice(s) cadastrada(s)` : "Nenhuma apólice cadastrada" },
    { id: "vencimentos", value: hasInstruments ? expiring.length : null, detail: hasInstruments ? `${expiring.filter((i) => i.severity === "VENCIDO").length} já vencido(s)` : "Nenhum instrumento cadastrado" },
    { id: "endossos-pendentes", value: data.endorsements.length ? pendingEnd : null, detail: data.endorsements.length ? `${data.endorsements.length} endosso(s) registrado(s)` : "Nenhum endosso registrado" },
    { id: "sinistros-andamento", value: data.claims.length ? openClaims : null, detail: data.claims.length ? `${data.claims.length} evento(s) registrado(s)` : "Nenhum evento registrado" },
    { id: "garantias-insuficientes", value: data.advances.length ? insufficient : null, detail: data.advances.length ? `${data.advances.length} adiantamento(s) registrado(s)` : "Nenhum adiantamento registrado" },
  ];
}

export function kpiDisplay(k: Kpi): string {
  return k.value === null ? NO_DATA : String(k.value);
}

export function groupDashboardItems(items: DashboardItemRow[]): Record<string, DashboardItemRow[]> {
  const out: Record<string, DashboardItemRow[]> = {};
  for (const i of items) (out[i.kind] ??= []).push(i);
  return out;
}

export function moneyOrNoData(v: number | string | null | undefined, currency = "BRL"): string {
  return formatMoney(v, currency);
}
