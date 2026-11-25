"use client";

import { ActionButton } from "@/components/insurance/kit";
import { useCompetenceFor } from "@/components/insurance/use-competence";
import { claimStageLevel } from "@/lib/insurance-ui/permissions";
import { claimStageCompetenceAct } from "@/lib/permissions/competences";

/** Botão "Avançar para" de uma etapa do sinistro: além do nível (MANAGE), decisão/negativa/contestação/indenização exigem competência Jurídico (Fase 4/A). */
export function ClaimStageButton({ stage, label, onClick }: { stage: string; label: string; onClick: () => void }) {
  const comp = useCompetenceFor(claimStageCompetenceAct(stage));
  return (
    <ActionButton
      label={label}
      helpId="seguros.acoes.sinistro-avancar-abrir"
      level={claimStageLevel(stage)}
      variant="outline"
      extraDisabled={comp.required && !comp.ok}
      extraReason={comp.blockText ?? undefined}
      onClick={onClick}
    />
  );
}
