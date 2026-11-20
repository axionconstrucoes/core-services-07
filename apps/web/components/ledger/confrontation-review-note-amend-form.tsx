"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Textarea } from "@/components/ui/textarea";
import { amendConfrontationReviewNoteAction } from "@/app/[projectId]/ledger/[eventId]/actions";
import { initialReviewEventClauseConfrontationCandidateState } from "@/app/[projectId]/ledger/[eventId]/actions-state";
import { validateConfrontationJustification } from "@/lib/ledger/confrontation-justification-validation";

// Complementa/corrige review_note de um candidato JÁ revisado — nunca
// reabre a revisão, nunca troca status/aprovador original/data original
// (amend_event_clause_confrontation_review_note preserva os dois; ver
// migration 20260828150000, NÃO aplicada). Só renderizado para quem tem
// permissão de revisão (canReview) — quem não tem só vê o texto atual.
export function ConfrontationReviewNoteAmendForm({
  projectId,
  eventId,
  candidateId,
  currentReviewNote,
}: {
  projectId: string;
  eventId: string;
  candidateId: string;
  currentReviewNote: string;
}) {
  const [state, formAction, pending] = useActionState(
    amendConfrontationReviewNoteAction,
    initialReviewEventClauseConfrontationCandidateState
  );
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState(currentReviewNote);
  const [clientError, setClientError] = useState<string | null>(null);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          Complementar justificativa
        </Button>
        <FeatureInfo helpId="planejamento.ledger-evento.complementar-justificativa" />
      </span>
    );
  }

  function guardSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateConfrontationJustification(note);
    if (!result.valid) {
      event.preventDefault();
      setClientError(result.error);
      return;
    }
    setClientError(null);
  }

  return (
    <form action={formAction} onSubmit={guardSubmit} className="mt-2 flex flex-col gap-2 rounded-md border p-3">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />
      <input type="hidden" name="candidateId" value={candidateId} />

      <div className="flex flex-col gap-1.5">
        <span className="inline-flex items-center gap-1 text-sm font-medium">
          <label htmlFor={`amend-note-${candidateId}`}>Justificativa complementada</label>
          <FeatureInfo helpId="planejamento.ledger-evento.campo-justificativa-complemento" />
        </span>
        <Textarea id={`amend-note-${candidateId}`} name="reviewNote" required minLength={20} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>

      {clientError ? <p className="text-sm text-destructive">{clientError}</p> : null}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex gap-2">
        <span className="inline-flex items-center gap-1">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Salvando…" : "Salvar complemento"}
          </Button>
          <FeatureInfo helpId="planejamento.ledger-evento.complementar-justificativa" />
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
