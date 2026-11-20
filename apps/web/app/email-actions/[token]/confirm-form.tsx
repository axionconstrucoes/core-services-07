"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EmailAlertActionType } from "@/lib/email-actions/types";
import { confirmEmailAlertActionAction } from "./actions";
import { initialConfirmEmailActionState } from "./confirm-action-state";

// Único formulário de confirmação — o mesmo componente serve as 4
// ações; o que muda é só quais campos aparecem (comentário para
// RESPOND, obrigatório; data/hora para SET_DEADLINE; nenhum campo
// extra para ACKNOWLEDGE/ASSUME_RESPONSIBILITY). O token nunca é um
// campo do formulário — vem preso à função via bind, sempre o mesmo
// valor da URL/rota, nunca editável pelo navegador.
export function ConfirmEmailActionForm({
  rawToken,
  action,
}: {
  rawToken: string;
  action: EmailAlertActionType;
}) {
  const boundAction = confirmEmailAlertActionAction.bind(null, rawToken);
  const [state, formAction, pending] = useActionState(boundAction, initialConfirmEmailActionState);

  if (state.success) {
    return (
      <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
        Confirmado com sucesso.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {action === "RESPOND" ? (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <label htmlFor="comment">Resposta</label>
            <FeatureInfo helpId="planejamento.email-action.resposta" />
          </span>
          <Textarea id="comment" name="comment" required minLength={3} maxLength={4000} rows={4} />
        </div>
      ) : null}

      {action === "SET_DEADLINE" ? (
        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <label htmlFor="newDueAt">Novo prazo</label>
            <FeatureInfo helpId="planejamento.email-action.novo-prazo" />
          </span>
          <Input id="newDueAt" name="newDueAt" type="datetime-local" required />

          <label className="pt-2 text-xs font-medium text-muted-foreground" htmlFor="comment">
            Comentário (obrigatório se estiver reduzindo um prazo já existente)
          </label>
          <Textarea id="comment" name="comment" maxLength={4000} rows={3} />
        </div>
      ) : null}

      <span className="inline-flex items-center gap-1 self-start">
        <Button type="submit" disabled={pending}>
          {pending ? "Confirmando…" : "Confirmar"}
        </Button>
        <FeatureInfo helpId="planejamento.email-action.confirmar" />
      </span>

      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
