// Fase 6 / H2b — regras PURAS da revisão humana de sinais de risco de e-mail (confirmar/descartar). Espelham a RPC
// public.email_risk_signal_review (migration 20261209100000), que é a AUTORIDADE: esta camada só decide o que a tela mostra/habilita.
// Sem I/O, sem "server-only": testável em Node (scripts/test-f6-h2b-sinais-pilares.mjs).
//
// Quem decide: GESTOR/GERENTE/ADMINISTRADOR ativo do projeto (tier MANAGE/ADMIN) OU profissional expressamente delegado
// (delegação vigente, não revogada, cujo escopo cobre o pilar ou a área do sinal, e que ainda é membro ativo do projeto).
// Sinal de vínculo CANDIDATO/AMBÍGUO (ou de organização só com vínculo CANDIDATO/inválido) fica PENDENTE de validação: não pode ser
// confirmado até o vínculo ser validado (pode ser descartado). Indício continua sendo indício: confirmar é decisão humana registrada.
import type { ProjectTier } from "@/lib/permissions/project-tier";

export type ReviewStatus = "PENDING" | "CONFIRMED" | "DISCARDED";
export type DelegationScope = "TODAS" | "PRAZO" | "CUSTO" | "SEGURANCA" | "QUALIDADE" | "JURIDICO" | "COMERCIAL";
export const DELEGATION_SCOPES: readonly DelegationScope[] = ["TODAS", "PRAZO", "CUSTO", "SEGURANCA", "QUALIDADE", "JURIDICO", "COMERCIAL"];
export const MAX_DELEGATION_DAYS = 180;

export interface ReviewDelegation {
  id: string;
  user_id: string;
  scope: string;
  valid_from: string;
  valid_until: string;
  revoked_at: string | null;
}

export interface ReviewableSignal {
  pillar: string | null;
  functional_area: string | null;
  review_status: string;
}

export interface ReviewClassification {
  project_link_status: string;
  status: string;
  organization_id: string | null;
}

export interface ReviewActor {
  tier: ProjectTier;
  userId: string;
  delegations: ReviewDelegation[];
  now: Date;
}

/** A delegação cobre este sinal agora? (vigente, não revogada, escopo TODAS ou igual ao pilar/área do sinal). */
export function delegationCovers(d: ReviewDelegation, signal: Pick<ReviewableSignal, "pillar" | "functional_area">, userId: string, now: Date): boolean {
  if (d.user_id !== userId || d.revoked_at) return false;
  const t = now.getTime();
  if (!(t >= new Date(d.valid_from).getTime() && t < new Date(d.valid_until).getTime())) return false;
  return d.scope === "TODAS" || d.scope === signal.pillar || d.scope === signal.functional_area;
}

/** Quem pode revisar: nível de gestão ou delegação vigente (membro ativo = tier diferente de NONE). */
export function reviewerVia(actor: ReviewActor, signal: Pick<ReviewableSignal, "pillar" | "functional_area">): "TIER" | "DELEGATION" | null {
  if (actor.tier === "MANAGE" || actor.tier === "ADMIN") return "TIER";
  if (actor.tier === "NONE") return null;
  return actor.delegations.some((d) => delegationCovers(d, signal, actor.userId, actor.now)) ? "DELEGATION" : null;
}

export type SignalReviewState = "CONFIRMED" | "DISCARDED" | "PENDING_LINK_VALIDATION" | "AWAITING_REVIEW";

/** Estado exibido. `orgLinkValid` = a organização da classificação tem vínculo ATIVO vigente no projeto (null quando não há organização). */
export function signalReviewState(signal: ReviewableSignal, cls: ReviewClassification | null, orgLinkValid: boolean | null): { state: SignalReviewState; reason: string | null } {
  if (signal.review_status === "CONFIRMED") return { state: "CONFIRMED", reason: null };
  if (signal.review_status === "DISCARDED") return { state: "DISCARDED", reason: null };
  if (!cls || cls.project_link_status !== "LINKED" || cls.status !== "ANALYZED") {
    return { state: "PENDING_LINK_VALIDATION", reason: "O vínculo da mensagem com o projeto ainda não foi validado (candidato ou ambíguo)." };
  }
  if (cls.organization_id && orgLinkValid !== true) {
    return { state: "PENDING_LINK_VALIDATION", reason: "A organização remetente só tem vínculo candidato, vencido ou encerrado neste projeto." };
  }
  return { state: "AWAITING_REVIEW", reason: null };
}

/** Ações habilitadas: confirmar só com vínculo validado; descartar sempre (com justificativa) para quem pode revisar. */
export function reviewActions(state: SignalReviewState, via: "TIER" | "DELEGATION" | null): { canConfirm: boolean; canDiscard: boolean } {
  const pending = state === "AWAITING_REVIEW" || state === "PENDING_LINK_VALIDATION";
  return { canConfirm: via !== null && state === "AWAITING_REVIEW", canDiscard: via !== null && pending };
}

export const STATE_LABEL: Record<SignalReviewState, string> = {
  CONFIRMED: "Confirmado",
  DISCARDED: "Descartado",
  PENDING_LINK_VALIDATION: "Pendente de validação do vínculo",
  AWAITING_REVIEW: "Aguardando revisão",
};

export const PILLAR_LABEL: Record<string, string> = { PRAZO: "Prazo", CUSTO: "Custo", SEGURANCA: "Segurança", QUALIDADE: "Qualidade" };
export const AREA_LABEL: Record<string, string> = { JURIDICO: "Jurídico", COMERCIAL: "Comercial" };

/** Mensagem de erro (código da RPC) -> chave estável usada na URL e nas mensagens da tela. */
export function reviewErrorCode(message: string): string {
  if (/PENDING_LINK_VALIDATION/.test(message)) return "vinculo-pendente";
  if (/ALREADY_REVIEWED/.test(message)) return "ja-revisado";
  if (/NOTE_REQUIRED/.test(message)) return "justificativa";
  if (/FORBIDDEN|AUTH_REQUIRED/i.test(message)) return "permissao";
  if (/NOT_FOUND/.test(message)) return "nao-encontrado";
  if (/INVALID_VALIDITY/.test(message)) return "validade";
  if (/INVALID_SCOPE/.test(message)) return "escopo";
  if (/NOT_MEMBER/.test(message)) return "nao-membro";
  if (/REASON_REQUIRED/.test(message)) return "motivo";
  if (/ALREADY_REVOKED/.test(message)) return "ja-revogada";
  return "falha";
}

/** Texto de terceiros exibido na tela: uma linha, sem controles/bidi, com limite. Nunca interpretado como instrução. */
const CONTROL_CHARS = new RegExp("[\u0000-\u001f\u007f​-‏  ‪-‮⁦-⁩]", "g");
export function safeText(value: string | null | undefined, max = 280): string {
  const clean = (value ?? "").replace(CONTROL_CHARS, " ").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}
