"use client";

import { useActionState, useState } from "react";
import { FlaskConical, Info, Loader2, Sparkles } from "lucide-react";

import { AiPendingIndicator } from "@/components/ai/ai-pending-indicator";
import { ExpertResponseDetails } from "@/components/ai/expert-query-panel";
import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Textarea } from "@/components/ui/textarea";
import { initialAlertConsultState, type AlertConsultState } from "@/lib/ai/alert-consult/alert-consult-state";
import type { AlertConsultCurationResult, AlertConsultSource } from "@/lib/ai/alert-consult/run-alert-consult";
import {
  ALERT_CONSULT_SPECIALTIES,
  DEFAULT_ALERT_CONSULT_QUESTION,
  MAX_ALERT_CONSULT_QUESTION_LENGTH,
  type AlertConsultSpecialtyId,
} from "@/lib/ai/alert-consult/specialties";

type ConsultAction = (state: AlertConsultState, formData: FormData) => Promise<AlertConsultState>;

const SOURCE_KIND_LABELS: Record<AlertConsultSource["kind"], string> = {
  EVENTO: "Evento",
  CLAUSULA: "Cláusula",
  EVIDENCIA: "Evidência",
  PROVIDENCIA: "Providência",
  ALERTA: "Alerta",
};

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  return items.length ? (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={index} className="break-words">
          {item}
        </li>
      ))}
    </ul>
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );
}

/** Curadoria multi-Expert: um parecer por Expert (autoria preservada) + consolidação do CEO IA. */
function CurationResult({ curation }: { curation: AlertConsultCurationResult }) {
  const { consolidacao } = curation;
  return (
    <div className="flex flex-col gap-3" data-testid="alert-consult-curation">
      <p className="text-xs text-muted-foreground">
        Análise multidisciplinar ({curation.topic}): {curation.pareceres.length} parecer(es) de especialistas e consolidação do CEO IA.
      </p>
      {curation.pareceres.map((parecer) => (
        <section key={parecer.expertId} className="rounded-md border p-3" aria-label={`Parecer de ${parecer.expertName}`}>
          <h3 className="mb-2 text-sm font-semibold">Parecer de {parecer.expertName}</h3>
          <ExpertResponseDetails response={parecer.response} showClauseComparison={false} />
        </section>
      ))}
      {curation.indisponiveis.map((item) => (
        <p key={item.expertId} className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
          Sem parecer de {item.expertId} nesta consulta: {item.reason}
        </p>
      ))}
      <section className="flex flex-col gap-2 rounded-md border border-primary/30 p-3" aria-label="Consolidação do CEO IA">
        <h3 className="text-sm font-semibold">Consolidação do CEO IA</h3>
        <p className="text-sm">{consolidacao.situacao}</p>
        <h4 className="text-xs font-semibold">Divergências entre especialistas</h4>
        {consolidacao.divergencias.length ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {consolidacao.divergencias.map((conflict, index) => (
              <li key={index} className="break-words">
                {conflict.topic}: {conflict.positions.map((p) => `${p.expertName} — ${p.position}`).join(" × ")} ({conflict.probableReason})
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma divergência registrada.</p>
        )}
        <h4 className="text-xs font-semibold">Riscos</h4>
        <BulletList items={consolidacao.riscos} empty="Nenhum risco consolidado." />
        <h4 className="text-xs font-semibold">Recomendação (sujeita a revisão humana)</h4>
        <p className="text-sm">{consolidacao.recomendacao}</p>
        <h4 className="text-xs font-semibold">Incertezas e decisões humanas necessárias</h4>
        <BulletList items={consolidacao.decisoesHumanasNecessarias} empty="Nenhuma registrada." />
      </section>
    </div>
  );
}

export function AlertConsultPanel({
  action,
  projectId,
  subject,
  id,
  defaultSpecialtyId,
  areaNote,
  initialState = initialAlertConsultState,
}: {
  action: ConsultAction;
  projectId: string;
  subject: "evento" | "providencia" | "risco";
  id: string;
  defaultSpecialtyId: AlertConsultSpecialtyId;
  /** Por que esta especialidade veio selecionada (área cadastrada ou geral). */
  areaNote: string;
  initialState?: AlertConsultState;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const [specialtyId, setSpecialtyId] = useState<AlertConsultSpecialtyId>(state.specialtyId ?? defaultSpecialtyId);
  const result = state.result;

  return (
    <div className="flex flex-col gap-3">
      <form action={formAction} className="flex flex-col gap-3 rounded-md border p-3">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="subject" value={subject} />
        <input type="hidden" name="id" value={id} />

        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <label htmlFor="alert-consult-specialty">Especialista</label>
            <FeatureInfo helpId="planejamento.consulta-ia.especialidade" />
          </span>
          <select
            id="alert-consult-specialty"
            name="specialty"
            value={specialtyId}
            onChange={(event) => setSpecialtyId(event.target.value as AlertConsultSpecialtyId)}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            {ALERT_CONSULT_SPECIALTIES.map((specialty) => (
              <option key={specialty.id} value={specialty.id}>
                {specialty.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">{areaNote} Você pode trocar a seleção.</p>
        </div>

        <div className="flex flex-col gap-1">
          <span className="inline-flex items-center gap-1 text-xs font-medium">
            <label htmlFor="alert-consult-question">Pergunta</label>
            <FeatureInfo helpId="planejamento.consulta-ia.pergunta" />
          </span>
          <Textarea
            id="alert-consult-question"
            name="question"
            rows={3}
            maxLength={MAX_ALERT_CONSULT_QUESTION_LENGTH}
            defaultValue={state.question ?? DEFAULT_ALERT_CONSULT_QUESTION}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
              Consultar
            </Button>
            <FeatureInfo helpId="planejamento.consulta-ia.consultar" />
          </span>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden="true" />A consulta não altera o alerta e não registra nenhuma providência.
          </p>
        </div>
      </form>

      {pending ? <AiPendingIndicator /> : null}
      {state.error ? (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-3" data-testid="alert-consult-result">
          <p className="text-xs text-muted-foreground">
            Resposta de <strong>{result.specialtyLabel}</strong> · pergunta: “{result.question}”
          </p>
          {!result.meta.isRealProvider ? (
            <p className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800">
              <FlaskConical className="size-3.5 shrink-0" aria-hidden="true" />
              Resposta de TESTE ({result.meta.providerLabel}) — nenhuma análise real de IA foi realizada.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Provedor: {result.meta.providerLabel}
              {result.meta.model ? ` · ${result.meta.model}` : ""}
            </p>
          )}
          <p className="text-[11px] text-muted-foreground">Roteamento: {result.routingReason}</p>
          {result.response ? <ExpertResponseDetails response={result.response} showClauseComparison={false} /> : null}
          {result.curation ? <CurationResult curation={result.curation} /> : null}

          <section className="rounded-md border p-3" aria-label="Fontes utilizadas">
            <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold">Fontes utilizadas (consultáveis no ACC)<FeatureInfo helpId="planejamento.consulta-ia.fontes" /></h3>
            <ul className="flex flex-col gap-1 text-sm">
              {result.sources.map((source, index) => (
                <li key={`${source.kind}-${index}`} className="break-words">
                  <span className="mr-1 rounded border px-1 text-xs">{SOURCE_KIND_LABELS[source.kind]}</span>
                  {source.href ? (
                    <a href={source.href} className="font-medium text-primary underline underline-offset-2">
                      {source.label}
                    </a>
                  ) : (
                    <span>{source.label}</span>
                  )}
                  {source.note ? <span className="text-xs text-muted-foreground"> — {source.note}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </div>
  );
}
