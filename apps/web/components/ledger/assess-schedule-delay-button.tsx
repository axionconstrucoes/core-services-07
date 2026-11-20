"use client";

import { useActionState } from "react";
import { assessScheduleDelayAction } from "@/app/[projectId]/ledger/[eventId]/assess-schedule-delay-actions";
import { initialAssessScheduleDelayState } from "@/app/[projectId]/ledger/[eventId]/assess-schedule-delay-actions-state";
import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";

// Gatilho REAL (não o gerador de prévia) da regra do risco CRÍTICO
// (Bloco 3/8) — só visível para quem já vê a tela do evento com
// permissão de escrita (GESTOR/GERENTE/ADMINISTRADOR, checado de novo
// no servidor pela Server Action). "IA prepara → humano dispara →
// resultado gravado e rastreável", nunca automático.
export function AssessScheduleDelayButton({ projectId, eventId }: { projectId: string; eventId: string }) {
  const [state, formAction, pending] = useActionState(assessScheduleDelayAction, initialAssessScheduleDelayState);

  return (
    <form action={formAction} className="flex flex-col gap-1.5">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      <span className="inline-flex items-center gap-1">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Avaliando…" : "Avaliar risco de atraso de cronograma"}
        </Button>
        <FeatureInfo helpId="planejamento.ledger-evento.avaliar-atraso" />
      </span>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {state.success ? (
        <p className="text-xs text-muted-foreground">
          Severidade: {state.success.previousSeverity ?? "(nenhuma anterior)"} → {state.success.newSeverity}
          {state.success.requiresHumanDecision ? " — DECISÃO HUMANA NECESSÁRIA" : ""}
        </p>
      ) : null}
    </form>
  );
}
