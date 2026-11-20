"use client";

import { useActionState, useMemo, useState } from "react";

import { SeverityBadge } from "@/components/shared/badges";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { confrontationSeverityToAlertSeverity, formatDateTime } from "@/lib/labels";
import type { WeeklyDigestResponse, WeeklyDigestViewItem } from "@/lib/email/get-weekly-alert-digest";

import { submitWeeklyDigestAction } from "./actions";
import { initialSubmitWeeklyDigestState } from "./actions-state";

const RESPONSE_OPTIONS: Array<{ value: WeeklyDigestResponse; label: string }> = [
  { value: "AWARE", label: "Ciente" },
  { value: "STUDYING", label: "Estudando solução" },
  { value: "RESOLVED", label: "Resolvido" },
  { value: "FORWARDED", label: "Direcionar para…" },
];

export function WeeklyDigestForm({
  digestId,
  projectId,
  items,
  members,
  initialAnswer = null,
}: {
  digestId: string;
  projectId: string;
  items: WeeklyDigestViewItem[];
  members: Array<{ userId: string; name: string }>;
  /** Resposta pré-selecionada pelo botão do e-mail (gravada só no envio do formulário). */
  initialAnswer?: { actionId: string; response: WeeklyDigestResponse } | null;
}) {
  const boundAction = submitWeeklyDigestAction.bind(null, digestId, projectId);
  const [state, formAction, pending] = useActionState(boundAction, initialSubmitWeeklyDigestState);
  const [answers, setAnswers] = useState<Record<string, WeeklyDigestResponse | "">>(() =>
    initialAnswer ? { [initialAnswer.actionId]: initialAnswer.response } : {}
  );
  const [directions, setDirections] = useState<Record<string, string>>({});

  const complete = useMemo(
    () => items.every((item) => {
      const answer = answers[item.actionId];
      return Boolean(answer) && (answer !== "FORWARDED" || Boolean(directions[item.actionId]));
    }),
    [answers, directions, items]
  );

  if (state.success) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-sm font-medium text-emerald-800">
        Todas as respostas foram registradas. As ações do ACC já foram atualizadas.
      </div>
    );
  }

  return (
    // help-exempt: formulário do resumo; cada campo (tratamento, direcionar, nota, evidência) e o envio têm ícone próprio
    <form action={formAction} className="flex flex-col gap-4">
      {initialAnswer ? (
        <p role="status" className="rounded-lg border bg-muted px-4 py-3 text-sm text-muted-foreground">
          Aberto pelo botão do e-mail: a resposta do item já vem selecionada, mas nada foi registrado. Confira e envie o formulário.
        </p>
      ) : null}
      {items.map((item) => (
        <section
          key={item.id}
          id={`item-${item.actionId}`}
          title={item.description || item.title}
          tabIndex={0}
          className="rounded-lg border bg-card p-4 outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring"
        >
          <input type="hidden" name="actionId" value={item.actionId} />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <SeverityBadge severity={confrontationSeverityToAlertSeverity[item.riskLevel]} />
                <h2 className="font-semibold text-foreground">{item.title}</h2>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{item.description || "Sem detalhe adicional."}</p>
              {item.dueAt ? <p className="mt-1 text-xs text-muted-foreground">Prazo: {formatDateTime(item.dueAt)}</p> : null}
            </div>

            <div className="grid w-full gap-2 sm:w-[260px]">
              <span className="inline-flex items-center gap-1 text-xs font-medium">
                <label htmlFor={`resolution-${item.actionId}`}>Tratamento obrigatório</label>
                <FeatureInfo helpId="planejamento.resumo-semanal.tratamento" />
              </span>
              <Select
                id={`resolution-${item.actionId}`}
                name={`resolution:${item.actionId}`}
                required
                value={answers[item.actionId] ?? ""}
                onChange={(event) => setAnswers((current) => ({
                  ...current,
                  [item.actionId]: event.target.value as WeeklyDigestResponse | "",
                }))}
              >
                <option value="" disabled>Selecione uma resposta</option>
                {RESPONSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </Select>

              {answers[item.actionId] === "FORWARDED" ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <label htmlFor={`direction-${item.actionId}`}>Direcionar para</label>
                    <FeatureInfo helpId="planejamento.resumo-semanal.direcionar" />
                  </span>
                  <Select
                    id={`direction-${item.actionId}`}
                    name={`directedToUserId:${item.actionId}`}
                    required
                    value={directions[item.actionId] ?? ""}
                    onChange={(event) => setDirections((current) => ({ ...current, [item.actionId]: event.target.value }))}
                  >
                    <option value="" disabled>Selecione uma pessoa</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>{member.name}</option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">Os prazos e o escalonamento não serão reiniciados.</p>
                </>
              ) : null}

              {answers[item.actionId] === "RESOLVED" || answers[item.actionId] === "FORWARDED" || answers[item.actionId] === "STUDYING" ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <label htmlFor={`note-${item.actionId}`}>
                      {answers[item.actionId] === "RESOLVED"
                        ? "O que foi feito (obrigatório)"
                        : answers[item.actionId] === "FORWARDED"
                          ? "Motivo do direcionamento (obrigatório)"
                          : "Providências em curso (opcional)"}
                    </label>
                    <FeatureInfo helpId="planejamento.resumo-semanal.nota" />
                  </span>
                  <Textarea
                    id={`note-${item.actionId}`}
                    name={`note:${item.actionId}`}
                    rows={2}
                    required={answers[item.actionId] !== "STUDYING"}
                    minLength={answers[item.actionId] === "RESOLVED" ? 10 : answers[item.actionId] === "FORWARDED" ? 5 : undefined}
                  />
                </>
              ) : null}
              {answers[item.actionId] === "RESOLVED" ? (
                <>
                  <span className="inline-flex items-center gap-1 text-xs font-medium">
                    <label htmlFor={`evidence-${item.actionId}`}>Evidência (opcional: documento, foto, protocolo ou link)</label>
                    <FeatureInfo helpId="planejamento.resumo-semanal.evidencia" />
                  </span>
                  <Textarea id={`evidence-${item.actionId}`} name={`evidence:${item.actionId}`} rows={1} />
                </>
              ) : null}
            </div>
          </div>
        </section>
      ))}

      <div className="sticky bottom-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
        <p className="text-sm text-muted-foreground">
          {complete ? "Todos os itens estão respondidos." : "Responda todos os itens para liberar o envio."}
        </p>
        <span className="inline-flex items-center gap-1">
          <Button type="submit" disabled={!complete || pending}>
            {pending ? "Enviando respostas…" : "Enviar todas as respostas"}
          </Button>
          <FeatureInfo helpId="planejamento.resumo-semanal.enviar" />
        </span>
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
