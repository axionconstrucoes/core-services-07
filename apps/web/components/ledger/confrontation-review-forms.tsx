"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Textarea } from "@/components/ui/textarea";
import { reviewEventClauseConfrontationCandidateAction } from "@/app/[projectId]/ledger/[eventId]/actions";
import { initialReviewEventClauseConfrontationCandidateState } from "@/app/[projectId]/ledger/[eventId]/actions-state";
import {
  CONFRONTATION_JUSTIFICATION_HELP_TEXT,
  MIN_JUSTIFICATION_LENGTH,
  validateConfrontationJustification,
} from "@/lib/ledger/confrontation-justification-validation";

// Justificativa obrigatória e específica em APROVAÇÃO e REJEIÇÃO — mesma
// função de validação (validateConfrontationJustification) usada aqui
// (feedback imediato) e no Server Action (fonte de verdade real: o
// servidor nunca confia neste gate do cliente, que pode ser contornado).
// "Aprovado"/"de acordo"/"possível relação"/"confronto humano aprovado"
// (o texto genérico visto no e-mail real do piloto) e equivalentes de
// rejeição são rejeitados nos dois lados.
export function ConfrontationReviewForms({
  projectId,
  eventId,
  candidateId,
}: {
  projectId: string;
  eventId: string;
  candidateId: string;
}) {
  const [approveState, approveAction, approvePending] = useActionState(
    reviewEventClauseConfrontationCandidateAction,
    initialReviewEventClauseConfrontationCandidateState
  );

  const [rejectState, rejectAction, rejectPending] = useActionState(
    reviewEventClauseConfrontationCandidateAction,
    initialReviewEventClauseConfrontationCandidateState
  );

  const [approveNote, setApproveNote] = useState("");
  const [approveClientError, setApproveClientError] = useState<string | null>(null);

  const [rejectNote, setRejectNote] = useState("");
  const [rejectClientError, setRejectClientError] = useState<string | null>(null);

  function guardSubmit(note: string, setClientError: (error: string | null) => void) {
    return (event: FormEvent<HTMLFormElement>) => {
      const result = validateConfrontationJustification(note);
      if (!result.valid) {
        event.preventDefault();
        setClientError(result.error);
        return;
      }
      setClientError(null);
    };
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* help-exempt: formulário de aprovação; o campo (campo-justificativa-aprovacao) e o botão (aprovar-relacao) têm ícone próprio */}
      <form
        action={approveAction}
        onSubmit={guardSubmit(approveNote, setApproveClientError)}
        className="flex flex-col gap-3 rounded-md border p-4"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="candidateId" value={candidateId} />
        <input type="hidden" name="reviewAction" value="APPROVE" />

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <label htmlFor={`approve-note-${candidateId}`}>Justificativa da aprovação</label>
            <FeatureInfo helpId="planejamento.ledger-evento.campo-justificativa-aprovacao" />
          </span>
          <span className="text-xs font-normal text-muted-foreground">{CONFRONTATION_JUSTIFICATION_HELP_TEXT}</span>
          <Textarea
            id={`approve-note-${candidateId}`}
            name="reviewNote"
            required
            minLength={MIN_JUSTIFICATION_LENGTH}
            rows={3}
            placeholder="Ex.: o prazo de pagamento proposto no evento (30 dias) diverge do prazo contratual, que é até o 25º dia, condicionado à nota fiscal e documentos."
            value={approveNote}
            onChange={(e) => setApproveNote(e.target.value)}
          />
        </div>

        {approveClientError ? <p className="text-sm text-destructive">{approveClientError}</p> : null}
        {approveState.error ? <p className="text-sm text-destructive">{approveState.error}</p> : null}

        <span className="inline-flex items-center gap-1">
          <Button type="submit" disabled={approvePending}>
            {approvePending ? "Aprovando…" : "Aprovar relação"}
          </Button>
          <FeatureInfo helpId="planejamento.ledger-evento.aprovar-relacao" />
        </span>
      </form>

      {/* help-exempt: formulário de rejeição; o campo (campo-justificativa-rejeicao) e o botão (rejeitar-relacao) têm ícone próprio */}
      <form
        action={rejectAction}
        onSubmit={guardSubmit(rejectNote, setRejectClientError)}
        className="flex flex-col gap-3 rounded-md border border-destructive/30 p-4"
      >
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="candidateId" value={candidateId} />
        <input type="hidden" name="reviewAction" value="REJECT" />

        <div className="flex flex-col gap-1.5">
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <label htmlFor={`reject-note-${candidateId}`}>Justificativa da rejeição</label>
            <FeatureInfo helpId="planejamento.ledger-evento.campo-justificativa-rejeicao" />
          </span>
          <span className="text-xs font-normal text-muted-foreground">
            Explique por que este evento não se relaciona com esta cláusula.
          </span>
          <Textarea
            id={`reject-note-${candidateId}`}
            name="reviewNote"
            required
            minLength={MIN_JUSTIFICATION_LENGTH}
            rows={3}
            placeholder="Ex.: a cláusula trata de garantia de execução; o evento trata de atraso de entrega de material — não há relação de fato entre os dois."
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
        </div>

        {rejectClientError ? <p className="text-sm text-destructive">{rejectClientError}</p> : null}
        {rejectState.error ? <p className="text-sm text-destructive">{rejectState.error}</p> : null}

        <span className="inline-flex items-center gap-1">
          <Button type="submit" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={rejectPending}>
            {rejectPending ? "Rejeitando…" : "Rejeitar"}
          </Button>
          <FeatureInfo helpId="planejamento.ledger-evento.rejeitar-relacao" />
        </span>
      </form>
    </div>
  );
}
