"use client";

import { useActionState } from "react";

import type { AlertSeverity } from "@axion/types";

import { AlertActionNotice } from "@/components/alerts/alert-action-notice";
import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Select } from "@/components/ui/select";
import type { ContractAlertBatchItemAction } from "@/lib/email-actions/contract-alert-batch-types";

import { submitCompactContractAlertAction } from "./actions";
import {
  initialCompactContractAlertActionState,
} from "./actions-state";

export function CompactContractAlertActionForm({
  projectId,
  batchId,
  eventId,
  initialAction,
  severity,
  members,
}: {
  projectId: string;
  batchId: string;
  eventId: string;
  initialAction: ContractAlertBatchItemAction;
  severity: AlertSeverity;
  members: Array<{ userId: string; name: string }>;
}) {
  const boundAction = submitCompactContractAlertAction.bind(null, projectId, batchId, eventId);
  const [state, formAction, pending] = useActionState(
    boundAction,
    initialCompactContractAlertActionState
  );
  // IMPORTANTE: abrir este link (GET) NUNCA registra nada. Toda ação — inclusive RESOLVIDO e EM
  // ANDAMENTO — só é efetivada por um envio explícito do formulário (botão CONFIRMAR).

  if (state.success) {
    return (
      <div className="rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
        Ação registrada no ACC. Você pode voltar ao e-mail.
        {state.warning ? <p className="mt-2 font-normal text-amber-800">{state.warning}</p> : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5">
      <input type="hidden" name="action" value={initialAction} />

      <AlertActionNotice action={initialAction} severity={severity} />

      {initialAction === "ENVIADO_PARA" ? (
        <div className="grid gap-1.5 md:grid-cols-[110px_minmax(0,1fr)] md:items-center">
          <span className="inline-flex items-center gap-1 text-sm font-medium md:mb-0">
            <label htmlFor="assignedUserId">Enviado para</label>
            <FeatureInfo helpId="planejamento.alerta-email-acao.enviado-para" />
          </span>
          <Select id="assignedUserId" name="assignedUserId" required defaultValue="">
            <option value="" disabled>
              Selecione um colaborador
            </option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      {state.error ? (
        <p className="text-sm text-destructive">{state.error}</p>
      ) : null}

      <span className="inline-flex items-center gap-1 md:self-end">
        <Button type="submit" disabled={pending} className="md:px-10">
          {pending ? "Confirmando…" : "CONFIRMAR"}
        </Button>
        <FeatureInfo helpId="planejamento.alerta-email-acao.confirmar" />
      </span>
    </form>
  );
}
