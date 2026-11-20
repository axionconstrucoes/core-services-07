"use client";

import { useActionState, useId } from "react";

import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Input } from "@/components/ui/input";
import { configureSlaProjectSettingsAction } from "@/app/[projectId]/acoes/actions";
import { initialConfigureSlaProjectSettingsState } from "@/app/[projectId]/acoes/actions-state";
import { holidayCalendarForProject, VALIDATED_YEARS } from "@/lib/sla/holidays/calendars";

// Correção de timezone: o cálculo de horário útil nunca usa UTC como
// horário comercial — ver apps/web/lib/sla/time-units.ts. Default
// institucional da AXION é America/Sao_Paulo, 08:00–18:00.
export function SlaProjectSettingsForm({
  projectId,
  timezone,
  businessDayStartHour,
  businessDayEndHour,
  isDefault,
}: {
  projectId: string;
  timezone: string;
  businessDayStartHour: number;
  businessDayEndHour: number;
  isDefault: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    configureSlaProjectSettingsAction,
    initialConfigureSlaProjectSettingsState
  );
  const uid = useId();

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border p-3">
      <input type="hidden" name="projectId" value={projectId} />

      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-timezone`}>Timezone do projeto</label>
            <FeatureInfo helpId="planejamento.acoes-config.campo-timezone" />
          </span>
          <Input id={`${uid}-timezone`} name="timezone" defaultValue={timezone} required placeholder="America/Sao_Paulo" />
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-inicio`}>Início do expediente</label>
            <FeatureInfo helpId="planejamento.acoes-config.campo-inicio-expediente" />
          </span>
          <Input id={`${uid}-inicio`} type="number" min="0" max="23" name="businessDayStartHour" defaultValue={businessDayStartHour} required />
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor={`${uid}-fim`}>Fim do expediente</label>
            <FeatureInfo helpId="planejamento.acoes-config.campo-fim-expediente" />
          </span>
          <Input id={`${uid}-fim`} type="number" min="0" max="23" name="businessDayEndHour" defaultValue={businessDayEndHour} required />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Horário útil: {String(businessDayStartHour).padStart(2, "0")}:00–{String(businessDayEndHour).padStart(2, "0")}:00,
        segunda a sexta ({timezone}). {isDefault ? "Usando o default institucional — ainda não configurado por este projeto." : ""}
      </p>
      {holidayCalendarForProject(projectId) ? (
        <p className="text-xs text-muted-foreground">
          Feriados descontados: calendário {holidayCalendarForProject(projectId)} (nacionais por lei federal, Sexta-Feira da
          Paixão e feriado estadual; pontos facultativos não são descontados). Validado para {VALIDATED_YEARS.join(" e ")}.
        </p>
      ) : (
        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
          Feriados não são considerados neste projeto (sem calendário configurado).
        </p>
      )}

      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-xs text-emerald-600">Salvo.</p> : null}

      <div className="flex items-center gap-1 self-start">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
        <FeatureInfo helpId="planejamento.acoes-config.salvar-fuso-expediente" />
      </div>
    </form>
  );
}
