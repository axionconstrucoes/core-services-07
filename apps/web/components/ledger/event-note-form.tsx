"use client";

import { useActionState, useId } from "react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { eventNoteCategoryLabels, type EventNoteCategory } from "@/lib/labels";
import { createEventNoteAction } from "@/app/[projectId]/ledger/[eventId]/event-notes-actions";
import { initialCreateEventNoteState } from "@/app/[projectId]/ledger/[eventId]/event-notes-actions-state";

const CATEGORY_OPTIONS = Object.keys(eventNoteCategoryLabels) as EventNoteCategory[];

export function EventNoteForm({ projectId, eventId }: { projectId: string; eventId: string }) {
  const [state, formAction, pending] = useActionState(createEventNoteAction, initialCreateEventNoteState);
  const uid = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-dashed p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="eventId" value={eventId} />

      <div className="grid gap-3 sm:grid-cols-[200px_1fr]">
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-category`}>Categoria</label>
            <FeatureInfo helpId="planejamento.ledger-evento.anotacao-categoria" />
          </span>
          <Select id={`${uid}-category`} name="category" defaultValue="CONTEXTO_OPERACIONAL" required>
            {CATEGORY_OPTIONS.map((category) => (
              <option key={category} value={category}>
                {eventNoteCategoryLabels[category]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-text`}>Nova anotação</label>
            <FeatureInfo helpId="planejamento.ledger-evento.anotacao-texto" />
          </span>
          <Textarea
            id={`${uid}-text`}
            name="text"
            required
            rows={3}
            placeholder="Ex.: Não temos um contrato assinado, mas o cliente já está medindo os serviços e pagando regularmente."
          />
        </div>
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <div className="flex items-center gap-1 self-start">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Adicionar anotação"}
        </Button>
        <FeatureInfo helpId="planejamento.ledger-evento.anotacao-adicionar" />
      </div>
    </form>
  );
}
