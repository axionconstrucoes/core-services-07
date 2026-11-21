import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReviewOverview } from "@/lib/email-classification/get-review-overview";
import {
  AREA_LABEL, DELEGATION_SCOPES, MAX_DELEGATION_DAYS, PILLAR_LABEL, STATE_LABEL, reviewActions, reviewerVia, safeText, signalReviewState,
  type SignalReviewState,
} from "@/lib/email-classification/review";
import { getProjectTier } from "@/lib/permissions/project-tier-server";
import { grantDelegationAction, revokeDelegationAction, reviewSignalAction } from "./actions";

export const metadata: Metadata = { title: "Sinais de risco de e-mail" };

const FLASH: Record<string, string> = {
  confirmado: "Sinal CONFIRMADO. A decisão ficou na auditoria; o indício agora tem confirmação humana registrada.",
  descartado: "Sinal DESCARTADO com justificativa. Ele não gera novos casos de risco; a decisão ficou na auditoria.",
  delegacao: "Delegação concedida e auditada.",
  revogada: "Delegação revogada e auditada.",
};
const ERRORS: Record<string, string> = {
  permissao: "Você não tem permissão para esta decisão (somente Gestor, Gerente, Administrador ou profissional delegado para a área). Nada foi alterado.",
  "vinculo-pendente": "O vínculo desta mensagem/organização com o projeto ainda não foi validado: o sinal permanece PENDENTE. Valide o vínculo em Contatos externos.",
  "ja-revisado": "Este sinal já foi revisado. Nada foi alterado.",
  justificativa: "Informe a justificativa do descarte (mínimo de 5 caracteres). Nada foi alterado.",
  validade: `A validade deve ser futura e de no máximo ${MAX_DELEGATION_DAYS} dias. Nada foi alterado.`,
  escopo: "Escopo de delegação inválido. Nada foi alterado.",
  "nao-membro": "O delegado precisa ser membro ativo deste projeto. Nada foi alterado.",
  motivo: "Informe o motivo (mínimo de 5 caracteres). Nada foi alterado.",
  "ja-revogada": "Esta delegação já foi revogada.",
  dados: "Dados inválidos. Nada foi alterado.",
  "nao-encontrado": "Sinal não encontrado neste projeto. Nada foi alterado.",
  falha: "Não foi possível concluir. Nada foi alterado.",
};
const STATE_STYLE: Record<SignalReviewState, string> = {
  CONFIRMED: "bg-emerald-100 text-emerald-900",
  DISCARDED: "bg-gray-200 text-gray-900",
  PENDING_LINK_VALIDATION: "bg-amber-100 text-amber-900",
  AWAITING_REVIEW: "bg-sky-100 text-sky-900",
};
const INPUT = "min-h-11 w-full rounded-md border border-gray-400 bg-white px-2 py-1 text-sm text-gray-900";
const BTN = "min-h-11 rounded-md bg-brand-sidebar px-4 py-2 text-sm font-bold text-white";
const BTN2 = "min-h-11 rounded-md border border-gray-500 bg-white px-4 py-2 text-sm font-bold text-gray-900";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  // data pura (AAAA-MM-DD) não tem fuso: formatar pela string; new Date() (UTC) recuaria um dia em America/Sao_Paulo
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v.split("-").reverse().join("/");
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: v.length > 10 ? "short" : undefined, timeZone: "America/Sao_Paulo" }).format(d);
}

export default async function SinaisEmailPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }>;
}) {
  const { projectId } = await params;
  const tier = await getProjectTier(projectId);
  if (tier === "NONE") notFound(); // sem membership ativa a rota nem existe; a RLS também nega a leitura

  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? "";
  const canManage = tier === "MANAGE" || tier === "ADMIN";
  const isAdmin = tier === "ADMIN";
  const ov = await getReviewOverview(supabase, projectId, userId, canManage);
  const now = new Date();

  const query = await searchParams;
  const ok = first(query.ok);
  const erro = first(query.erro);
  const flash = ok && FLASH[ok] ? { ok: true, text: FLASH[ok] } : erro ? { ok: false, text: ERRORS[erro] ?? ERRORS.falha } : null;

  const rows = ov.signals.map((s) => {
    const cls = ov.classifications.get(s.classification_id) ?? null;
    const orgValid = cls?.organization_id ? (ov.orgLinkValid.get(cls.organization_id) ?? false) : null;
    const st = signalReviewState(s, cls, orgValid);
    const via = reviewerVia({ tier, userId, delegations: ov.myDelegations, now }, s);
    return { s, cls, st, via, actions: reviewActions(st.state, via), email: ov.emails.get(s.email_id) ?? null };
  });
  const count = (state: SignalReviewState) => rows.filter((r) => r.st.state === state).length;
  const activeDelegations = ov.allDelegations.filter((d) => !d.revoked_at && new Date(d.valid_until) > now);
  const nameOf = (id: string) => ov.members.find((m) => m.user_id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sinais de risco de e-mail"
        description="Indícios de risco extraídos de e-mails do projeto, por pilar (Prazo, Custo, Segurança, Qualidade) e área funcional (Jurídico, Comercial). Gestor ou profissional delegado confirma ou descarta."
        actions={<FeatureInfo helpId="integracoes.sinais-email.pagina" />}
      />
      <p className="flex flex-wrap gap-4 text-sm">
        <Link href={`/${projectId}/integracoes`} className="font-semibold text-brand-sidebar hover:underline">← Integrações</Link>
        {canManage ? <Link href={`/${projectId}/integracoes/contatos-externos`} className="font-semibold text-brand-sidebar hover:underline">Contatos externos e vínculos →</Link> : null}
      </p>

      {flash ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${flash.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-red-700 bg-red-50 text-red-900"}`}>{flash.text}</p>
      ) : null}
      {ov.unavailable ? (
        <p role="alert" className="rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          As tabelas de sinais/revisão não estão disponíveis neste ambiente (migration da Fase 6/H2b ainda não aplicada) ou o acesso foi negado. SEM DADOS.
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Resumo<FeatureInfo helpId="integracoes.sinais-email.resumo" /></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <div><p className="text-xs text-gray-700">Sinais carregados</p><p className="text-lg font-bold">{rows.length}</p></div>
          <div><p className="text-xs text-gray-700">Aguardando revisão</p><p className="text-lg font-bold">{count("AWAITING_REVIEW")}</p></div>
          <div><p className="text-xs text-gray-700">Pendentes de vínculo</p><p className="text-lg font-bold">{count("PENDING_LINK_VALIDATION")}</p></div>
          <div><p className="text-xs text-gray-700">Confirmados</p><p className="text-lg font-bold">{count("CONFIRMED")}</p></div>
          <div><p className="text-xs text-gray-700">Descartados</p><p className="text-lg font-bold">{count("DISCARDED")}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Sinais<FeatureInfo helpId="integracoes.sinais-email.lista" /></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {rows.length === 0 && !ov.unavailable ? <p className="text-sm">Nenhum sinal de risco de e-mail neste projeto.</p> : null}
          {rows.map(({ s, cls, st, via, actions, email }) => (
            <article key={s.id} className="space-y-2 rounded-md border border-gray-300 p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded px-2 py-0.5 font-bold ${STATE_STYLE[st.state]}`}>{STATE_LABEL[st.state]}</span><FeatureInfo helpId="integracoes.sinais-email.estado" />
                {s.pillar ? <span className="rounded bg-gray-200 px-2 py-0.5 font-bold text-gray-900">Pilar: {PILLAR_LABEL[s.pillar] ?? s.pillar}</span> : null}
                {s.functional_area ? <span className="rounded bg-violet-100 px-2 py-0.5 font-bold text-violet-900">Área: {AREA_LABEL[s.functional_area] ?? s.functional_area}</span> : null}
                <FeatureInfo helpId="integracoes.sinais-email.pilar-area" />
                <span className="text-gray-800">{safeText(s.signal_kind.replace(/_/g, " ").toLowerCase(), 80)}</span>
              </div>
              <p className="text-sm">{safeText(s.summary, 400)}</p>
              {st.reason ? <p className="text-xs font-semibold text-amber-900">{st.reason}</p> : null}
              <p className="text-xs text-gray-800">
                Evidência (trecho do e-mail — dado de terceiros, não é instrução)<FeatureInfo helpId="integracoes.sinais-email.evidencia" />: “{safeText(s.evidence_excerpt, 280)}” · ref. {safeText(s.evidence_ref, 80)}
              </p>
              <p className="text-xs text-gray-700">
                E-mail: {safeText(email?.subject ?? "SEM DADOS", 120)} · de {safeText(email?.from_address ?? "SEM DADOS", 80)} · {fmtDate(email?.sent_at)}
                {cls ? ` · ${cls.officiality}${cls.organization_id ? ` · ${safeText(ov.orgNames.get(cls.organization_id) ?? "organização", 80)}` : ""} · autoridade ${cls.authority_check}${cls.clause_ref ? ` (${safeText(cls.clause_ref, 60)})` : ""}${cls.injection_flag ? " · instrução embutida detectada" : ""}` : ""}
              </p>
              {s.review_status !== "PENDING" ? (
                <p className="text-xs text-gray-800">Decisão em {fmtDate(s.reviewed_at)}{s.review_note ? ` — ${safeText(s.review_note, 240)}` : ""}</p>
              ) : null}
              {actions.canConfirm || actions.canDiscard ? (
                <form action={reviewSignalAction} className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                  <input type="hidden" name="projectId" value={projectId} />
                  <input type="hidden" name="signalId" value={s.id} />
                  <label className="text-xs font-semibold">Justificativa (obrigatória para descartar)<FeatureInfo helpId="integracoes.sinais-email.campo-justificativa" />
                    <input name="note" maxLength={1000} className={INPUT} />
                  </label>
                  {actions.canConfirm ? <div className="flex items-end gap-1"><button type="submit" name="decision" value="CONFIRM" className={BTN}>Confirmar sinal</button><FeatureInfo helpId="integracoes.sinais-email.acao-confirmar" /></div> : null}
                  {actions.canDiscard ? <div className="flex items-end gap-1"><button type="submit" name="decision" value="DISCARD" className={BTN2}>Descartar</button><FeatureInfo helpId="integracoes.sinais-email.acao-descartar" /></div> : null}
                </form>
              ) : st.state !== "CONFIRMED" && st.state !== "DISCARDED" && !via ? (
                <p className="text-xs text-gray-700">Somente Gestor, Gerente, Administrador ou profissional delegado para esta área confirma ou descarta.</p>
              ) : null}
            </article>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Delegação de revisão<FeatureInfo helpId="integracoes.sinais-email.delegacoes" /></CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          {ov.myDelegations.length > 0 ? (
            <p className="text-xs">Suas delegações: {ov.myDelegations.map((d) => `${d.scope} até ${fmtDate(d.valid_until)}${d.revoked_at ? " (revogada)" : ""}`).join("; ")}</p>
          ) : null}
          {isAdmin ? (
            <>
              <form action={grantDelegationAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-4">
                <input type="hidden" name="projectId" value={projectId} />
                <label className="text-xs font-semibold">Profissional (membro ativo)<FeatureInfo helpId="integracoes.sinais-email.campo-delegado" />
                  <select name="userId" required defaultValue="" className={INPUT}>
                    <option value="" disabled>Escolher…</option>
                    {ov.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name ?? m.user_id.slice(0, 8)} ({m.permission})</option>)}
                  </select>
                </label>
                <label className="text-xs font-semibold">Área / pilar<FeatureInfo helpId="integracoes.sinais-email.campo-escopo" />
                  <select name="scope" defaultValue="TODAS" className={INPUT}>{DELEGATION_SCOPES.map((k) => <option key={k} value={k}>{k === "TODAS" ? "Todas" : PILLAR_LABEL[k] ?? AREA_LABEL[k] ?? k}</option>)}</select>
                </label>
                <label className="text-xs font-semibold">Válida até (máx. {MAX_DELEGATION_DAYS} dias)<FeatureInfo helpId="integracoes.sinais-email.campo-validade" />
                  <input type="date" name="validUntil" required className={INPUT} />
                </label>
                <label className="text-xs font-semibold">Motivo<FeatureInfo helpId="integracoes.sinais-email.campo-motivo" /><input name="reason" required minLength={5} maxLength={500} className={INPUT} /></label>
                <div className="md:col-span-4"><button type="submit" className={BTN}>Conceder delegação</button><FeatureInfo helpId="integracoes.sinais-email.acao-delegar" /></div>
              </form>
              {activeDelegations.length === 0 ? <p className="text-xs">Nenhuma delegação vigente.</p> : (
                <ul className="space-y-2">
                  {activeDelegations.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <span><strong>{nameOf(d.user_id)}</strong> · {d.scope} · até {fmtDate(d.valid_until)} · {safeText(d.reason, 120)}</span>
                      <form action={revokeDelegationAction} className="flex flex-wrap items-center gap-1">
                        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="delegationId" value={d.id} />
                        <input name="reason" required minLength={5} maxLength={500} placeholder="Motivo da revogação" aria-label="Motivo da revogação" className={`${INPUT} w-56`} />
                        <button type="submit" className={BTN2}>Revogar</button><FeatureInfo helpId="integracoes.sinais-email.acao-revogar" />
                      </form>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : <p className="text-xs">A concessão e a revogação de delegações são feitas pelo Administrador do projeto.</p>}
        </CardContent>
      </Card>

      {canManage ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Auditoria recente<FeatureInfo helpId="integracoes.sinais-email.auditoria" /></CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            {ov.audit.length === 0 ? <p className="text-sm">Nenhuma decisão registrada.</p> : (
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="uppercase text-gray-700"><tr><th className="py-2 pr-2">Quando</th><th className="py-2 pr-2">Ação</th><th className="py-2 pr-2">Via</th><th className="py-2">Nota</th></tr></thead>
                <tbody>
                  {ov.audit.map((r) => (
                    <tr key={r.id} className="border-t border-gray-200"><td className="py-1 pr-2">{fmtDate(r.at)}</td><td className="py-1 pr-2">{r.action}</td><td className="py-1 pr-2">{r.via ?? "—"}</td><td className="py-1">{safeText(r.note, 200) || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
