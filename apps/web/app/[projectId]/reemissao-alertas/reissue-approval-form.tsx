"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Textarea } from "@/components/ui/textarea";
import {
  REISSUE_APPROVAL_STATE_LABELS,
  REISSUE_JUSTIFICATION_MAX,
  REISSUE_JUSTIFICATION_MIN,
  REISSUE_ROLE_LABELS,
  reissueReasonLabel,
  type ReissuePendingRow,
} from "@/lib/risk-alerts/reissue-approval";

import { approveReissueAction } from "./actions";
import { initialApproveReissueState } from "./actions-state";

const RISK_LABEL: Record<string, string> = { CRITICAL: "Crítico", HIGH: "Alto" };

export function ReissueApprovalForm({ projectId, rows }: { projectId: string; rows: ReissuePendingRow[] }) {
  const [state, formAction, pending] = useActionState(approveReissueAction.bind(null, projectId), initialApproveReissueState);
  const byId = new Map(rows.map((r) => [r.caseId, r] as const));

  return (
    <form action={formAction} className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-xs uppercase text-gray-500">
            <tr>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Aprovar<FeatureInfo helpId="planejamento.reemissao.col-aprovar" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Código<FeatureInfo helpId="planejamento.reemissao.col-codigo" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Área<FeatureInfo helpId="planejamento.reemissao.col-area-risco" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Risco<FeatureInfo helpId="planejamento.reemissao.col-area-risco" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Idade<FeatureInfo helpId="planejamento.reemissao.col-idade" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Lacuna (quem não foi informado)<FeatureInfo helpId="planejamento.reemissao.col-lacuna" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Bloqueio manual<FeatureInfo helpId="planejamento.reemissao.col-bloqueio" /></span></th>
              <th className="py-2 pr-3"><span className="inline-flex items-center gap-1">Situação<FeatureInfo helpId="planejamento.reemissao.col-situacao" /></span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.caseId} className="border-t align-top">
                <td className="py-2 pr-3">
                  <input type="checkbox" name="caseId" value={row.caseId} disabled={!row.eligible} aria-label={`Aprovar reemissão do caso ${row.visibleCode ?? row.caseId}`} className="size-5" />
                </td>
                <td className="py-2 pr-3 font-semibold">
                  {row.visibleCode ?? "—"}
                  <span className="block text-xs font-normal text-gray-600">{row.title}</span>
                </td>
                <td className="py-2 pr-3">{row.area}</td>
                <td className="py-2 pr-3">{RISK_LABEL[row.riskLevel] ?? row.riskLevel}</td>
                <td className="py-2 pr-3">{row.ageDays} dias</td>
                <td className="py-2 pr-3">{row.gapRoles.length ? row.gapRoles.map((r) => REISSUE_ROLE_LABELS[r] ?? r).join(", ") : "—"}</td>
                <td className="py-2 pr-3">{row.manuallySuspended ? "Sim (suspenso)" : "Não"}</td>
                <td className="py-2 pr-3">
                  <span className="font-medium">{REISSUE_APPROVAL_STATE_LABELS[row.approvalState] ?? row.approvalState}</span>
                  <span className="block text-xs text-gray-600">{reissueReasonLabel(row.reason)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-1.5 text-sm font-medium">
        <span className="inline-flex items-center gap-1">
          <label htmlFor="reemissao-justificativa">Justificativa da decisão (obrigatória, {REISSUE_JUSTIFICATION_MIN} a {REISSUE_JUSTIFICATION_MAX} caracteres)</label>
          <FeatureInfo helpId="planejamento.reemissao.justificativa" />
        </span>
        <Textarea id="reemissao-justificativa" name="justification" required minLength={REISSUE_JUSTIFICATION_MIN} maxLength={REISSUE_JUSTIFICATION_MAX} rows={3} placeholder="Ex.: Diretoria confirmou que o risco segue vigente e deve ser reemitido aos destinatários da cadeia." />
        <span className="text-xs font-normal text-gray-600">O texto fica na trilha de auditoria: não inclua e-mails, documentos, telefones nem senhas.</span>
      </div>

      <div className="flex items-start gap-1">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" value="sim" required className="mt-0.5 size-5" />
        <span>
          Confirmo que esta ação <strong>apenas registra a decisão</strong>. Nenhum e-mail é enviado agora: a reemissão só ocorre no ciclo, com o interruptor de envio ligado e as travas do piloto válidas.
        </span>
      </label>
      <FeatureInfo helpId="planejamento.reemissao.confirmacao" />
      </div>

      <span className="inline-flex items-center gap-1">
        <Button type="submit" disabled={pending}>
          {pending ? "Registrando…" : "Aprovar reemissão"}
        </Button>
        <FeatureInfo helpId="planejamento.reemissao.aprovar" />
      </span>

      {state.error ? (
        <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {state.error}
        </p>
      ) : null}

      {state.outcome ? (
        <div role="status" className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">
            {state.outcome.approved.length} decisão(ões) registrada(s); {state.outcome.ignored.length} caso(s) ignorado(s). Nenhum e-mail foi enviado.
          </p>
          {state.outcome.approved.length ? (
            <ul className="list-disc pl-5">
              {state.outcome.approved.map((a) => (
                <li key={a.auditId}>Caso {a.visibleCode ?? byId.get(a.caseId)?.visibleCode ?? a.caseId}: aprovado (registro de auditoria {a.auditId.slice(0, 8)}).</li>
              ))}
            </ul>
          ) : null}
          {state.outcome.ignored.length ? (
            <ul className="list-disc pl-5 text-amber-900">
              {state.outcome.ignored.map((a) => (
                <li key={`${a.caseId}-${a.reason}`}>
                  Caso {a.visibleCode ?? byId.get(a.caseId)?.visibleCode ?? a.caseId}: não aprovado — {reissueReasonLabel(a.reason)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
