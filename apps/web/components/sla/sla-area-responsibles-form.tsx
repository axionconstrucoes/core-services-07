"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Select } from "@/components/ui/select";
import { slaAreaLabels } from "@/lib/labels";
import { formatInvitationSelection, formatMemberSelection } from "@/lib/sla/responsible-selection";
import type { SlaArea } from "@/lib/sla/types";
import { configureSlaAreaResponsiblesAction } from "@/app/[projectId]/acoes/actions";
import { initialConfigureSlaResponsiblesState } from "@/app/[projectId]/acoes/actions-state";

// Matriz operacional de três níveis. O campo legado de 2º escalão não
// é exposto: Nível 1 = responsável direto, Nível 2 = gerência e
// Nível 3 = diretoria.
export function SlaAreaResponsiblesForm({
  projectId,
  area,
  responsibleDirectUserId,
  responsibleDirectInvitationId,
  secondaryResponsibleUserId,
  secondaryResponsibleInvitationId,
  escalation1UserId,
  escalation1InvitationId,
  boardUserId,
  boardInvitationId,
  people,
}: {
  projectId: string;
  area: SlaArea;
  responsibleDirectUserId: string | null;
  responsibleDirectInvitationId: string | null;
  secondaryResponsibleUserId: string | null;
  secondaryResponsibleInvitationId: string | null;
  escalation1UserId: string | null;
  escalation1InvitationId: string | null;
  boardUserId: string | null;
  boardInvitationId: string | null;
  people: Array<{ value: string; label: string }>;
}) {
  const supportsSecondaryResponsible = area === "ENGENHARIA" || area === "PLANEJAMENTO";
  const fullRowClassName = supportsSecondaryResponsible ? "sm:col-span-6" : "sm:col-span-5";
  const selectionValue = (userId: string | null, invitationId: string | null) =>
    userId
      ? formatMemberSelection(userId)
      : invitationId
        ? formatInvitationSelection(invitationId)
        : "";
  const [state, formAction, pending] = useActionState(
    configureSlaAreaResponsiblesAction,
    initialConfigureSlaResponsiblesState
  );
  const uid = useId();

  return (
    <form
      action={formAction}
      className={`grid gap-2 rounded-md border p-3 sm:items-end ${
        supportsSecondaryResponsible ? "sm:grid-cols-6" : "sm:grid-cols-5"
      }`}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="area" value={area} />

      <p className="text-sm font-medium sm:col-span-1">{slaAreaLabels[area]}</p>

      <div className="flex flex-col gap-1 text-xs sm:col-span-1">
        <span className="inline-flex items-center gap-1">
          <label htmlFor={`${uid}-n1`}>Nível 1 · Responsável</label>
          <FeatureInfo helpId="planejamento.acoes-config.campo-nivel1-responsavel" />
        </span>
        <Select
          id={`${uid}-n1`}
          name="responsibleDirectUserId"
          defaultValue={selectionValue(responsibleDirectUserId, responsibleDirectInvitationId)}
        >
          <option value="">Não definido</option>
          {people.map((person) => (
            <option key={person.value} value={person.value}>
              {person.label}
            </option>
          ))}
        </Select>
      </div>

      {supportsSecondaryResponsible ? (
        <div className="flex flex-col gap-1 text-xs sm:col-span-1">
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-n1c`}>Nível 1 · Corresponsável</label>
            <FeatureInfo helpId="planejamento.acoes-config.campo-nivel1-corresponsavel" />
          </span>
          <Select
            id={`${uid}-n1c`}
            name="secondaryResponsibleUserId"
            defaultValue={selectionValue(secondaryResponsibleUserId, secondaryResponsibleInvitationId)}
          >
            <option value="">Não definido</option>
            {people.map((person) => (
              <option key={person.value} value={person.value}>
                {person.label}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-1 text-xs sm:col-span-1">
        <span className="inline-flex items-center gap-1">
          <label htmlFor={`${uid}-n2`}>Nível 2 · Gerência</label>
          <FeatureInfo helpId="planejamento.acoes-config.campo-nivel2-gerencia" />
        </span>
        <Select
          id={`${uid}-n2`}
          name="escalation1UserId"
          defaultValue={selectionValue(escalation1UserId, escalation1InvitationId)}
        >
          <option value="">Não definido</option>
          {people.map((person) => (
            <option key={person.value} value={person.value}>
              {person.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1 text-xs sm:col-span-1">
        <span className="inline-flex items-center gap-1">
          <label htmlFor={`${uid}-n3`}>Nível 3 · Diretoria</label>
          <FeatureInfo helpId="planejamento.acoes-config.campo-nivel3-diretoria" />
        </span>
        <Select id={`${uid}-n3`} name="boardUserId" defaultValue={selectionValue(boardUserId, boardInvitationId)}>
          <option value="">Não definido</option>
          {people.map((person) => (
            <option key={person.value} value={person.value}>
              {person.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="sm:col-span-1">
        <div className="flex items-center gap-1">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
          <FeatureInfo helpId="planejamento.acoes-config.salvar-area" />
        </div>
      </div>

      <p className={`text-xs text-muted-foreground ${fullRowClassName}`}>
        Se o Nível 2 não estiver definido, o alerta será escalonado diretamente para o Nível 3.
      </p>
      {state.error ? (
        <p className={`text-xs text-destructive ${fullRowClassName}`}>{state.error}</p>
      ) : null}
      {state.success ? (
        <p className={`text-xs text-emerald-600 ${fullRowClassName}`}>Salvo.</p>
      ) : null}
    </form>
  );
}
