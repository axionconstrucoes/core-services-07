import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isProjectAdmin } from "@/lib/email-authorization/guard";
import { getMailboxDiagnosticsEvidence, getProcessedMessages } from "@/lib/email/ingestion/get-mailbox-diagnostics-evidence";
import {
  CONTROLS_MISSING_TEXT,
  buildMailboxDiagnostics,
  type MailboxActionState,
  type MailboxDiagnosticsRow,
  type MailboxStageStatus,
} from "@/lib/email/ingestion/mailbox-diagnostics";
import { disableCollectionAction, enableCollectionAction, registerCorporateAuthorizationAction, revokeCollectionAction } from "./actions";

export const metadata: Metadata = { title: "Caixas de e-mail" };

const STATUS_STYLE: Record<MailboxStageStatus, string> = {
  COMPROVADO: "bg-emerald-100 text-emerald-900",
  INDICIO: "bg-sky-100 text-sky-900",
  PARCIAL: "bg-amber-100 text-amber-900",
  PENDENTE: "bg-gray-200 text-gray-900",
  BLOQUEADO: "bg-red-100 text-red-900",
  INDISPONIVEL: "bg-gray-100 text-gray-600",
};
const STATUS_LABEL: Record<MailboxStageStatus, string> = {
  COMPROVADO: "Comprovado", INDICIO: "Indício", PARCIAL: "Parcial", PENDENTE: "Pendente", BLOQUEADO: "Bloqueado", INDISPONIVEL: "Indisponível",
};
const FLASH: Record<string, string> = {
  autorizada: "Autorização corporativa registrada e confirmada no banco. A coleta continua desligada até o teste técnico e a habilitação.",
  habilitada: "Coleta habilitada com período, confirmada no banco.",
  desabilitada: "Coleta desligada, confirmado no banco.",
  revogada: "Autorização e coleta revogadas, confirmado no banco. O histórico foi preservado.",
};
const ERRORS: Record<string, string> = {
  confirmacao: "Marque a caixa de confirmação. Nada foi alterado.",
  caixa: "Caixa inválida. Nada foi alterado.",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

function ActionHint({ state }: { state: MailboxActionState | undefined }) {
  if (!state || state.enabled) return null;
  return <p className="text-xs text-gray-600">Desligado: {state.reason}</p>;
}

function Actions({ projectId, row }: { projectId: string; row: MailboxDiagnosticsRow }) {
  const by = Object.fromEntries(row.actions.map((item) => [item.action, item])) as Record<string, MailboxActionState>;
  const hidden = (
    <>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="mailbox" value={row.mailbox} />
    </>
  );
  const confirm = (
    <label className="flex items-start gap-2 text-xs">
      <input type="checkbox" name="confirm" value="sim" required className="mt-0.5 size-4" />
      <span className="inline-flex items-center gap-1.5">Confirmo<FeatureInfo helpId="integracoes.caixas.campo-confirmo" /></span>
    </label>
  );
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <form action={registerCorporateAuthorizationAction} className="space-y-2 rounded-md border border-gray-300 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">Registrar autorização corporativa<FeatureInfo helpId="integracoes.caixas.registrar-autorizacao" /></p>
        {hidden}
        <div className="flex items-center gap-1.5">
          <input name="reference" minLength={3} maxLength={300} required disabled={!by.REGISTRAR_AUTORIZACAO?.enabled} placeholder="Referência da decisão (ata, e-mail, chamado)" aria-label="Referência da decisão" className="min-h-9 w-full rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <FeatureInfo helpId="integracoes.caixas.campo-referencia" />
        </div>
        {by.REGISTRAR_AUTORIZACAO?.enabled ? confirm : null}
        <button type="submit" disabled={!by.REGISTRAR_AUTORIZACAO?.enabled} className="min-h-9 rounded-md bg-brand-sidebar px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">Registrar</button>
        <ActionHint state={by.REGISTRAR_AUTORIZACAO} />
      </form>
      <form action={enableCollectionAction} className="space-y-2 rounded-md border border-gray-300 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">Habilitar coleta (período obrigatório)<FeatureInfo helpId="integracoes.caixas.habilitar-coleta" /></p>
        {hidden}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs"><span className="inline-flex items-center gap-1.5">Início<FeatureInfo helpId="integracoes.caixas.campo-periodo" /></span><input type="date" name="periodStart" required disabled={!by.HABILITAR_COLETA?.enabled} className="min-h-9 w-full rounded-md border border-gray-300 px-2" /></label>
          <label className="text-xs">Fim<input type="date" name="periodEnd" required disabled={!by.HABILITAR_COLETA?.enabled} className="min-h-9 w-full rounded-md border border-gray-300 px-2" /></label>
        </div>
        {by.HABILITAR_COLETA?.enabled ? confirm : null}
        <button type="submit" disabled={!by.HABILITAR_COLETA?.enabled} className="min-h-9 rounded-md bg-brand-sidebar px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">Habilitar</button>
        <ActionHint state={by.HABILITAR_COLETA} />
      </form>
      <form action={disableCollectionAction} className="space-y-2 rounded-md border border-gray-300 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold">Desligar coleta<FeatureInfo helpId="integracoes.caixas.desligar-coleta" /></p>
        {hidden}
        <button type="submit" disabled={!by.DESABILITAR_COLETA?.enabled} className="min-h-9 rounded-md bg-gray-800 px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">Desligar</button>
        <ActionHint state={by.DESABILITAR_COLETA} />
      </form>
      <form action={revokeCollectionAction} className="space-y-2 rounded-md border border-red-300 p-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-red-900">Revogar coleta (efeito imediato)<FeatureInfo helpId="integracoes.caixas.revogar" /></p>
        {hidden}
        <div className="flex items-center gap-1.5">
          <input name="reason" minLength={3} maxLength={500} required disabled={!by.REVOGAR?.enabled} placeholder="Motivo" aria-label="Motivo da revogação" className="min-h-9 w-full rounded-md border border-gray-300 px-2 py-1 text-xs" />
          <FeatureInfo helpId="integracoes.caixas.campo-motivo" />
        </div>
        {by.REVOGAR?.enabled ? confirm : null}
        <button type="submit" disabled={!by.REVOGAR?.enabled} className="min-h-9 rounded-md bg-red-800 px-3 py-1 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">Revogar</button>
        <ActionHint state={by.REVOGAR} />
      </form>
    </div>
  );
}

export default async function MailboxAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ caixa?: string | string[]; resultado?: string | string[]; erro?: string | string[] }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  // Controle no servidor: só administrador ATIVO da obra (o banco repete a regra por RLS e nas RPCs).
  if (!(await isProjectAdmin(projectId)).isAdmin) notFound();

  const supabase = await createSupabaseServerClient();
  const evidence = await getMailboxDiagnosticsEvidence(supabase, projectId);
  const rows = buildMailboxDiagnostics(evidence);
  const pick = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const selected = (pick(query.caixa) ?? "").toLowerCase();
  const selectedRow = rows.find((row) => row.mailbox === selected) ?? null;
  const processed = selectedRow ? await getProcessedMessages(supabase, projectId, selectedRow.mailbox) : null;
  const resultado = pick(query.resultado);
  const erro = pick(query.erro);
  const flash = resultado && FLASH[resultado] ? { ok: true, text: FLASH[resultado] } : erro ? { ok: false, text: ERRORS[erro] ?? erro.slice(0, 300) } : null;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PageHeader
            title="Caixas de e-mail da obra"
            description="Diagnóstico por caixa em 7 etapas independentes. Nenhuma etapa é deduzida da anterior: cada uma mostra a sua própria evidência."
          />
        </div>
        <FeatureInfo helpId="integracoes.caixas.pagina" className="mt-1.5" />
      </div>
      <p className="text-sm">
        <Link href={`/${projectId}/integracoes`} className="font-semibold text-brand-sidebar hover:underline">← Integrações</Link>
        {" · "}
        <Link href={`/${projectId}/autorizacoes`} className="font-semibold text-brand-sidebar hover:underline">Aceites individuais (Autorizações)</Link>
      </p>

      {flash ? (
        <p role="status" className={`flex items-start gap-1.5 rounded-md px-3 py-2 text-sm ${flash.ok ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          <span>{flash.text}</span>
          <FeatureInfo helpId="integracoes.caixas.mensagem-resultado" />
        </p>
      ) : null}
      {evidence.controlsAvailability !== "OK" ? (
        <p role="alert" className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <span>{evidence.controlsAvailability === "MISSING" ? CONTROLS_MISSING_TEXT : "Não foi possível ler os controles por caixa. Todas as ações ficam desligadas (falha fechada)."}</span>
          <FeatureInfo helpId="integracoes.caixas.aviso-controles" />
        </p>
      ) : null}
      {evidence.unassignedEmails ? (
        <p className="flex items-start gap-1.5 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
          <span>{evidence.unassignedEmails} mensagens do Gmail nesta obra estão sem caixa de origem registrada e não são atribuídas a nenhuma caixa.</span>
          <FeatureInfo helpId="integracoes.caixas.aviso-controles" />
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Caixas e etapas<FeatureInfo helpId="integracoes.caixas.tabela" /></CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left text-xs">
            <thead className="uppercase text-gray-500">
              <tr>
                <th className="py-2 pr-2">Caixa / responsável</th>
                {rows[0]?.stages.map((stage) => (
                  <th key={stage.key} className="py-2 pr-2">
                    {stage.key === "habilitada" ? (
                      <span className="inline-flex items-center gap-1.5">
                        {stage.title}
                        <FeatureInfo helpId="integracoes.caixas.suspensao-erros" />
                      </span>
                    ) : (
                      stage.title
                    )}
                  </th>
                ))}
                <th className="py-2 pr-2">Período</th>
                <th className="py-2">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.mailbox} className={`border-t border-gray-200 align-top ${row.mailbox === selected ? "bg-sky-50" : ""}`}>
                  <td className="py-2 pr-2">
                    <Link href={`/${projectId}/integracoes/caixas?caixa=${encodeURIComponent(row.mailbox)}`} className="break-all font-semibold text-brand-sidebar hover:underline">{row.mailbox}</Link>
                    <p className="text-gray-600">{row.responsible.name}</p>
                  </td>
                  {row.stages.map((stage) => (
                    <td key={stage.key} className="py-2 pr-2">
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_STYLE[stage.status]}`}>{STATUS_LABEL[stage.status]}</span>
                      <p className="mt-1 text-gray-700">{stage.label}</p>
                    </td>
                  ))}
                  <td className="py-2 pr-2">{row.period.start ? `${formatDateTime(row.period.start)} a ${formatDateTime(row.period.end)}` : "—"}</td>
                  <td className="py-2">{[...row.pendencies, ...row.errors].map((text) => <p key={text}>{text}</p>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500"><FeatureInfo helpId="integracoes.caixas.estado-etapa" /><FeatureInfo helpId="integracoes.caixas.evidencia-etapa" />Indício = evidência indireta (por exemplo, o coletor OAuth histórico da obra); nunca vale como comprovação. Medido em {formatDateTime(evidence.measuredAt)}.</p>
        </CardContent>
      </Card>

      {selectedRow ? (
        <Card>
          <CardHeader><CardTitle className="text-base">{selectedRow.mailbox} — {selectedRow.responsible.name}</CardTitle></CardHeader>
          <CardContent className="space-y-4 text-sm">
            <ul className="space-y-2">
              {selectedRow.stages.map((stage) => (
                <li key={stage.key}>
                  <span className={`mr-2 rounded px-1.5 py-0.5 text-xs font-semibold ${STATUS_STYLE[stage.status]}`}>{STATUS_LABEL[stage.status]}</span>
                  <strong>{stage.title}:</strong> {stage.label}
                  <p className="text-xs text-gray-700">Evidência: {stage.evidence}{stage.at ? ` (${formatDateTime(stage.at)})` : ""}</p>
                </li>
              ))}
            </ul>
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              <p>Mensagens: <strong>{selectedRow.counts?.emails ?? "—"}</strong></p>
              <p>Com corpo: <strong>{selectedRow.counts?.bodies ?? "—"}</strong></p>
              <p>Anexos: <strong>{selectedRow.counts?.attachments ?? "—"}</strong> (processados {selectedRow.counts?.attachmentsProcessed ?? "—"})</p>
              <p>Última sincronização desta caixa: <strong>{selectedRow.control?.last_sync_status ?? "nenhuma"}</strong> {formatDateTime(selectedRow.control?.last_sync_at)}</p>
            </div>
            <Actions projectId={projectId} row={selectedRow} />
            <p className="text-xs text-gray-600">
              O teste técnico (prova da delegação) só roda no executor remoto: GitHub Actions → “Gmail Delegated Sync (manual)”, modo technical_check. Ele não lê mensagens.
            </p>
            <div>
              <p className="mb-1 flex items-center gap-1.5 font-semibold">Mensagens e anexos efetivamente importados (20 mais recentes)<FeatureInfo helpId="integracoes.caixas.mensagens-importadas" /></p>
              {processed === null ? <p className="text-xs text-gray-600">Consulta indisponível.</p> : processed.length === 0 ? <p className="text-xs text-gray-600">Nenhuma mensagem importada desta caixa.</p> : (
                <table className="w-full text-left text-xs">
                  <thead className="uppercase text-gray-500"><tr><th className="py-1 pr-2">Data</th><th className="py-1 pr-2">Assunto</th><th className="py-1 pr-2">Corpo</th><th className="py-1">Anexos</th></tr></thead>
                  <tbody>
                    {processed.map((message) => (
                      <tr key={message.id} className="border-t border-gray-200 align-top">
                        <td className="py-1 pr-2">{formatDateTime(message.sentAt)}</td>
                        <td className="py-1 pr-2">{message.subject}</td>
                        <td className="py-1 pr-2">{message.hasBody ? "disponível" : "ausente"}</td>
                        <td className="py-1">{message.attachments.length === 0 ? "—" : message.attachments.map((att) => <p key={att.name + att.status}>{att.name} · {att.status}{att.stored ? "" : " · não armazenado"}</p>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-gray-600">Escolha uma caixa para ver evidências, ações e mensagens importadas.</p>
      )}
    </div>
  );
}
