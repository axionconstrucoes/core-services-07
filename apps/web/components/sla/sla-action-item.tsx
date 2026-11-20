"use client";

import { useActionState } from "react";

import { SeverityBadge } from "@/components/shared/badges";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  confrontationSeverityToAlertSeverity,
  formatDateTime,
  slaActionOriginLabels,
  slaActionStatusLabels,
  slaAreaLabels,
  slaEscalationLevelLabels,
  slaEscalationReasonLabels,
} from "@/lib/labels";
import type { SlaAction, SlaActionEscalation } from "@/lib/sla/types";
import {
  assumeSlaActionAction,
  completeSlaActionAction,
  reassignSlaActionAction,
  startSlaActionAction,
} from "@/app/[projectId]/acoes/actions";
import {
  initialAssumeSlaActionState,
  initialCompleteSlaActionState,
  initialReassignSlaActionState,
  initialStartSlaActionState,
} from "@/app/[projectId]/acoes/actions-state";

export function SlaActionItem({
  projectId,
  action,
  escalations,
  isResponsible,
  canReassign,
  requiresForwardReason = true,
  riskCaseId = null,
  members,
}: {
  projectId: string;
  action: SlaAction;
  escalations: SlaActionEscalation[];
  isResponsible: boolean;
  canReassign: boolean;
  /** Responsável (não administrador) informa o motivo do encaminhamento (exigido pelo banco). */
  requiresForwardReason?: boolean;
  /** Ação de um alerta de risco: o tratamento é feito na página do alerta (o banco recusa aqui). */
  riskCaseId?: string | null;
  members: Array<{ userId: string; name: string }>;
}) {
  // Ação de alerta de risco: nada é oferecido aqui; o caso e a ação SLA só mudam juntos, pela página do alerta.
  const operable = !riskCaseId;
  const [assumeState, assumeAction, assumePending] = useActionState(
    assumeSlaActionAction,
    initialAssumeSlaActionState
  );
  const [startState, startAction, startPending] = useActionState(startSlaActionAction, initialStartSlaActionState);
  const [completeState, completeFormAction, completePending] = useActionState(
    completeSlaActionAction,
    initialCompleteSlaActionState
  );
  const [reassignState, reassignFormAction, reassignPending] = useActionState(
    reassignSlaActionAction,
    initialReassignSlaActionState
  );

  return (
    <Card id={`acao-${action.id}`}>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{action.title}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {slaAreaLabels[action.area]} · {slaActionOriginLabels[action.origin]}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <SeverityBadge severity={confrontationSeverityToAlertSeverity[action.riskLevel]} />
            <FeatureInfo helpId="planejamento.acoes.risco-badge" />
            <Badge variant="outline">{slaActionStatusLabels[action.status]}</Badge>
            <FeatureInfo helpId="planejamento.acoes.status-badge" />
            <Badge variant="outline">{slaEscalationLevelLabels[action.currentEscalationLevel]}</Badge>
            <FeatureInfo helpId="planejamento.acoes.nivel-badge" />
          </div>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span>Responsável: {action.responsibleName ?? "não atribuído"}</span>
          <span>Prazo para assumir: {formatDateTime(action.assumeDueAt)}</span>
          {action.completeDueAt ? <span>Prazo para concluir: {formatDateTime(action.completeDueAt)}</span> : null}
          {action.contractualDeadline ? (
            <span>Prazo contratual: {formatDateTime(action.contractualDeadline)}</span>
          ) : null}
          <FeatureInfo helpId="planejamento.acoes.prazos" />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        {action.description ? <p className="text-sm">{action.description}</p> : null}

        {action.acknowledgedAt ? (
          <p className="text-xs text-muted-foreground">Assumida em {formatDateTime(action.acknowledgedAt)}</p>
        ) : null}

        {action.completedAt ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            <p className="text-xs text-muted-foreground">Concluída em {formatDateTime(action.completedAt)}</p>
            {action.completionNote ? <p className="mt-1">{action.completionNote}</p> : null}
          </div>
        ) : null}

        {escalations.length > 0 ? (
          <div className="flex items-start gap-1">
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {escalations.map((esc) => (
                <li key={esc.id}>
                  {formatDateTime(esc.escalatedAt)}: pendência não resolvida por {slaEscalationLevelLabels[esc.fromLevel]};
                  escalonada para {slaEscalationLevelLabels[esc.toLevel]}
                  {esc.notifiedUserName ? ` (${esc.notifiedUserName})` : ""}. Motivo: {slaEscalationReasonLabels[esc.reason]}.
                </li>
              ))}
            </ul>
            <FeatureInfo helpId="planejamento.acoes.escalonamentos-historico" />
          </div>
        ) : null}

        {riskCaseId && action.status !== "COMPLETED" && action.status !== "CANCELLED" ? (
          <p className="text-xs text-muted-foreground">
            Esta ação pertence a um alerta de risco.{" "}
            <a className="font-medium underline" href={`/${projectId}/alertas/${riskCaseId}`}>
              Registre o tratamento pela página do alerta
            </a>
            , que exige as evidências e mantém o caso e a ação sincronizados.
            <FeatureInfo helpId="planejamento.acoes.aviso-alerta-risco" className="ml-1 align-middle" />
          </p>
        ) : null}

        {operable && action.status !== "COMPLETED" && action.status !== "CANCELLED" ? (
          <div className="flex flex-wrap gap-2">
            {isResponsible && !action.acknowledgedAt ? (
              <form action={assumeAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="actionId" value={action.id} />
                <span className="inline-flex items-center gap-1">
                  <Button type="submit" size="sm" disabled={assumePending}>
                    {assumePending ? "Assumindo…" : "Assumir Ação"}
                  </Button>
                  <FeatureInfo helpId="planejamento.acoes.assumir" />
                </span>
              </form>
            ) : null}

            {isResponsible && action.status === "ACKNOWLEDGED" ? (
              <form action={startAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="actionId" value={action.id} />
                <span className="inline-flex items-center gap-1">
                  <Button type="submit" size="sm" variant="outline" disabled={startPending}>
                    {startPending ? "Registrando…" : "Estudando solução"}
                  </Button>
                  <FeatureInfo helpId="planejamento.acoes.estudando-solucao" />
                </span>
              </form>
            ) : null}
          </div>
        ) : null}

        {assumeState.error ? <p className="text-xs text-destructive">{assumeState.error}</p> : null}
        {startState.error ? <p className="text-xs text-destructive">{startState.error}</p> : null}

        {operable && isResponsible && action.status !== "COMPLETED" && action.status !== "CANCELLED" ? (
          <form action={completeFormAction} className="flex flex-col gap-2 rounded-md border border-dashed p-3">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="actionId" value={action.id} />
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <label htmlFor={`conclusao-${action.id}`}>
                  Observação de conclusão {action.riskLevel === "HIGH" || action.riskLevel === "CRITICAL" ? "(recomendado detalhar evidência para risco alto/crítico)" : ""}
                </label>
                <FeatureInfo helpId="planejamento.acoes.observacao-conclusao" />
              </span>
              <Textarea id={`conclusao-${action.id}`} name="completionNote" rows={2} required placeholder="O que foi feito para concluir esta ação?" />
            </div>
            <span className="inline-flex items-center gap-1 self-start">
              <Button type="submit" size="sm" disabled={completePending}>
                {completePending ? "Concluindo…" : "Concluir Ação"}
              </Button>
              <FeatureInfo helpId="planejamento.acoes.concluir" />
            </span>
            {completeState.error ? <p className="text-xs text-destructive">{completeState.error}</p> : null}
          </form>
        ) : null}

        {operable && canReassign && action.status !== "COMPLETED" && action.status !== "CANCELLED" ? (
          <form action={reassignFormAction} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="actionId" value={action.id} />
            <div className="flex flex-col gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <label htmlFor={`encaminhar-${action.id}`}>Encaminhar para</label>
                <FeatureInfo helpId="planejamento.acoes.encaminhar-para" />
              </span>
              <Select id={`encaminhar-${action.id}`} name="newResponsibleUserId" defaultValue="" required className="max-w-[220px]">
                <option value="" disabled>
                  Selecione um responsável
                </option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <label htmlFor={`motivo-${action.id}`}>Motivo{requiresForwardReason ? "" : " (opcional para administrador)"}</label>
                <FeatureInfo helpId="planejamento.acoes.encaminhar-motivo" />
              </span>
              <Textarea id={`motivo-${action.id}`} name="reason" rows={1} required={requiresForwardReason} minLength={requiresForwardReason ? 5 : undefined} placeholder="Por que esta pessoa deve tratar a ação?" />
            </div>
            <span className="inline-flex items-center gap-1">
              <Button type="submit" size="sm" variant="outline" disabled={reassignPending}>
                {reassignPending ? "Encaminhando…" : "Encaminhar"}
              </Button>
              <FeatureInfo helpId="planejamento.acoes.encaminhar" />
            </span>
            <p className="basis-full text-xs text-muted-foreground">
              O direcionamento mantém os prazos e o escalonamento originais.
            </p>
            {reassignState.error ? <p className="text-xs text-destructive">{reassignState.error}</p> : null}
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
