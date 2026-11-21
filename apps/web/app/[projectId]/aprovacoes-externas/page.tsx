import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { BTN, BTN_ALT, BTN_DANGER, Flash, INPUT, Pill, first, fmtDate } from "@/components/governance/governance-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACTION_LABEL, CONTEXT_LABEL, STATUS_LABEL, canCancel, canDecide, canPrepare, isSendContext, requiredTierLabel, verifyStoredHash,
} from "@/lib/governance/external-approval-ui";
import { SEND_ACTIONS, SEND_CONTEXTS } from "@/lib/governance/external-send-binding";
import { loadApprovalsOverview, displayName } from "@/lib/governance/overview-data";
import { getProjectTier } from "@/lib/permissions/project-tier-server";
import { approveSendAction, cancelSendAction, prepareSendAction, rejectSendAction } from "./actions";

export const metadata: Metadata = { title: "Aprovações externas" };

const OK: Record<string, string> = {
  preparada: "Preparação registrada. NADA foi enviado: ela aguarda a decisão de quem tem alçada.",
  aprovada: "Aprovada para uso único (24 horas), vinculada aos destinatários, à ação e ao conteúdo (hash). NADA foi enviado por esta tela.",
  recusada: "Preparação recusada, com o motivo registrado.",
  cancelada: "Preparação cancelada, com o motivo registrado.",
};
const STATUS_TONE: Record<string, "warn" | "ok" | "bad" | "off" | "info"> = { PREPARED: "warn", APPROVED: "ok", REJECTED: "bad", CANCELLED: "off", CONSUMED: "info" };

export default async function AprovacoesExternasPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }>;
}) {
  const { projectId } = await params;
  const tier = await getProjectTier(projectId);
  if (!canPrepare(tier)) notFound(); // COLABORADOR+; LEITURA e não-membros nem veem a rota
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id ?? "";
  const ov = await loadApprovalsOverview(supabase, projectId);
  const nameOf = (id: string | null | undefined) => displayName(ov.names, id);
  const open = ov.preparations.filter((p) => p.status === "PREPARED");
  const history = ov.preparations.filter((p) => p.status !== "PREPARED");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Aprovações externas"
        description="Preparação e decisão de comunicações a destinatários externos: destinatários, ação, conteúdo e versão ficam presos à aprovação, de uso único."
        actions={<FeatureInfo helpId="governanca.aprovacoes.pagina" />}
      />
      <Flash ok={first(query.ok)} erro={first(query.erro)} okMessages={OK} />
      {ov.unavailable ? (
        <p role="alert" className="rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          As tabelas de preparação de envio não estão disponíveis neste ambiente (migrations das Fases 5/E e 6/H2a ainda não aplicadas) ou o acesso foi negado. SEM DADOS.
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-1 pt-4 text-sm">
          <p><strong>Esta tela nunca envia e-mail.</strong> Colaborador (ou acima) prepara; gestor, gerente ou administrador decide (minuta de Seguros: só administrador). Aprovar grava uma confirmação de <strong>uso único</strong> (24 h) ligada à ação, aos destinatários e ao conteúdo; se qualquer um mudar, é preciso nova aprovação.</p>
          <p className="text-xs text-gray-700">A análise de e-mails externos recebidos ou enviados é automática e NÃO depende desta aprovação: ela só controla o USO de um destinatário externo em envio novo. O envio real continua bloqueado pelas travas do ACC.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Aguardando decisão ({open.length})<FeatureInfo helpId="governanca.aprovacoes.pendentes" /></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {open.length === 0 ? <p className="text-sm">Nenhuma preparação aguardando decisão.</p> : null}
          {open.map((p) => {
            const ctx = isSendContext(p.context) ? p.context : "OUTRO";
            const content = ov.contents[p.id];
            const hashOk = content ? verifyStoredHash(content, p.content_hash) : null;
            const decide = canDecide(tier, ctx);
            return (
              <article key={p.id} className="space-y-2 rounded-md border border-gray-300 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{CONTEXT_LABEL[ctx]}</strong> · {ACTION_LABEL[p.action_kind as keyof typeof ACTION_LABEL] ?? p.action_kind}
                  <Pill tone={STATUS_TONE[p.status] ?? "off"}>{STATUS_LABEL[p.status] ?? p.status}</Pill>
                </div>
                <p className="text-xs text-gray-800">Preparada por {nameOf(p.prepared_by)} em {fmtDate(p.prepared_at)} · versão {p.content_version} · aprovação exige {requiredTierLabel(ctx)}</p>
                <div>
                  <p className="text-xs font-semibold">Destinatários<FeatureInfo helpId="governanca.aprovacoes.destinatarios" /></p>
                  <ul className="flex flex-wrap gap-1.5 text-xs">
                    {p.recipients.map((r) => (
                      <li key={r}>{p.external_recipients.includes(r) ? <Pill tone="bad">EXTERNO · {r}</Pill> : <Pill tone="off">interno/permitido · {r}</Pill>}</li>
                    ))}
                  </ul>
                </div>
                {content ? (
                  <div className="space-y-1 rounded border border-gray-300 bg-gray-50 p-2 text-xs">
                    <p><strong>Assunto:</strong> {content.subject || "(sem assunto)"}</p>
                    <pre className="whitespace-pre-wrap break-words font-sans text-gray-900">{content.body}</pre>
                    <p><strong>Anexos:</strong> {content.attachments.length ? content.attachments.join("; ") : "nenhum"}</p>
                  </div>
                ) : <p className="text-xs text-red-900">Conteúdo não registrado nesta preparação (SEM DADOS): só o hash foi guardado. Recuse e peça nova preparação com o conteúdo.</p>}
                <p className="text-xs">
                  Hash SHA-256: <code className="break-all">{p.content_hash}</code>{" "}
                  {hashOk === null ? <Pill tone="warn">SEM CONTEÚDO PARA CONFERIR</Pill> : hashOk ? <Pill tone="ok">confere com o conteúdo</Pill> : <Pill tone="bad">DIVERGE do conteúdo — recuse</Pill>}
                  <FeatureInfo helpId="governanca.aprovacoes.hash" />
                </p>
                {decide ? (
                  <form className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={p.id} /><input type="hidden" name="externalCount" value={p.external_recipients.length} />
                    <label className="text-xs font-semibold md:col-span-3">Motivo da decisão (mín. 10 caracteres; obrigatório para aprovar envio externo e para recusar)<FeatureInfo helpId="governanca.aprovacoes.campo-motivo" />
                      <textarea name="reason" minLength={10} maxLength={1000} rows={2} className={INPUT} />
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-3">
                      <button type="submit" formAction={approveSendAction} className={BTN} disabled={hashOk === false}>Aprovar (uso único)</button><FeatureInfo helpId="governanca.aprovacoes.acao-aprovar" />
                      <button type="submit" formAction={rejectSendAction} className={BTN_DANGER}>Recusar</button><FeatureInfo helpId="governanca.aprovacoes.acao-recusar" />
                      {canCancel({ userId: me, tier }, p) ? <><button type="submit" formAction={cancelSendAction} className={BTN_ALT}>Cancelar preparação</button><FeatureInfo helpId="governanca.aprovacoes.acao-cancelar" /></> : null}
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-800">Você não decide esta preparação: ela exige {requiredTierLabel(ctx)}.</p>
                    {canCancel({ userId: me, tier }, p) ? (
                      <form className="grid gap-2 md:grid-cols-3">
                        <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={p.id} />
                        <label className="text-xs font-semibold md:col-span-2">Motivo do cancelamento (mín. 10 caracteres)<FeatureInfo helpId="governanca.aprovacoes.campo-motivo" /><input name="reason" minLength={10} maxLength={1000} className={INPUT} /></label>
                        <div className="flex items-end"><button type="submit" formAction={cancelSendAction} className={BTN_ALT}>Cancelar preparação</button><FeatureInfo helpId="governanca.aprovacoes.acao-cancelar" /></div>
                      </form>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Preparar envio externo (colaborador ou acima)<FeatureInfo helpId="governanca.aprovacoes.nova" /></CardTitle></CardHeader>
        <CardContent>
          <form action={prepareSendAction} className="grid gap-2 md:grid-cols-3">
            <input type="hidden" name="projectId" value={projectId} />
            <label className="text-xs font-semibold">Contexto<FeatureInfo helpId="governanca.aprovacoes.campo-contexto" />
              <select name="context" required defaultValue="" className={INPUT}>
                <option value="" disabled>Escolher…</option>
                {SEND_CONTEXTS.map((c) => <option key={c} value={c}>{CONTEXT_LABEL[c]}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Ação<FeatureInfo helpId="governanca.aprovacoes.campo-acao" />
              <select name="action" required defaultValue="" className={INPUT}>
                <option value="" disabled>Escolher…</option>
                {SEND_ACTIONS.map((a) => <option key={a} value={a}>{ACTION_LABEL[a]}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Versão do conteúdo<FeatureInfo helpId="governanca.aprovacoes.campo-versao" /><input name="version" required defaultValue="v1" maxLength={60} className={INPUT} /></label>
            <label className="text-xs font-semibold md:col-span-3">Destinatários (um por linha, até 20)<FeatureInfo helpId="governanca.aprovacoes.campo-destinatarios" />
              <textarea name="recipients" required rows={3} className={INPUT} placeholder="pessoa@empresa.com.br" />
            </label>
            <label className="text-xs font-semibold md:col-span-3">Assunto<FeatureInfo helpId="governanca.aprovacoes.campo-assunto" /><input name="subject" maxLength={300} className={INPUT} /></label>
            <label className="text-xs font-semibold md:col-span-3">Texto do envio<FeatureInfo helpId="governanca.aprovacoes.campo-texto" />
              <textarea name="body" required rows={6} maxLength={20000} className={INPUT} />
            </label>
            <label className="text-xs font-semibold md:col-span-3">Anexos (nomes, um por linha)<FeatureInfo helpId="governanca.aprovacoes.campo-anexos" /><textarea name="attachments" rows={2} className={INPUT} /></label>
            <p className="text-xs text-gray-800 md:col-span-3">Ao preparar, o ACC calcula o hash SHA-256 do conteúdo e o banco o confere. Nada é enviado.</p>
            <div className="md:col-span-3"><button type="submit" className={BTN}>Preparar (não envia)</button><FeatureInfo helpId="governanca.aprovacoes.acao-preparar" /></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Histórico ({history.length})<FeatureInfo helpId="governanca.aprovacoes.historico" /></CardTitle></CardHeader>
        <CardContent>
          {history.length === 0 ? <p className="text-sm">Nenhuma decisão registrada.</p> : (
            <ul className="space-y-2 text-xs">
              {history.map((p) => (
                <li key={p.id} className="rounded-md border border-gray-300 p-2">
                  <Pill tone={STATUS_TONE[p.status] ?? "off"}>{STATUS_LABEL[p.status] ?? p.status}</Pill>{" "}
                  {CONTEXT_LABEL[isSendContext(p.context) ? p.context : "OUTRO"]} · {ACTION_LABEL[p.action_kind as keyof typeof ACTION_LABEL] ?? p.action_kind} · versão {p.content_version} ·
                  destinatários: {p.recipients.join(", ")} · preparada por {nameOf(p.prepared_by)} em {fmtDate(p.prepared_at)}
                  {p.decided_by ? ` · decidida por ${nameOf(p.decided_by)} em ${fmtDate(p.decided_at)}` : ""}{p.decision_note ? ` · motivo: ${p.decision_note}` : ""}
                  {p.consumed_at ? ` · autorização usada em ${fmtDate(p.consumed_at)}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
