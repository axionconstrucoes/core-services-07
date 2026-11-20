"use client";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { blockerMessage, warrantyStateLabel } from "@/lib/garantias/labels";
import type { ClosureReadinessView, EvidenceView, StateEventView, TransitionRuleView } from "@/lib/garantias/types";
import { transitionWarrantyAction } from "@/app/[projectId]/garantias/actions";
import { ActionForm } from "./action-form";
import { FIELD_CLASS, FieldLabel, Notice, StateBadge, formatDateTime } from "./ui-bits";
import { cn } from "@/lib/utils";

// Ciclo de estados da garantia (RPC quality_warranty_transition). A UI mostra só o que o catálogo quality_state_transitions
// permite a partir do estado atual e as guardas de quality_transition_blockers; QUEM decide é o banco (RLS + RPC).

export function TransitionPanel({
  projectId,
  caseId,
  state,
  rowVersion,
  transitions,
  blockersByTarget,
  readiness,
  evidence,
  events,
  memberNames,
  canRegister,
  canManage,
}: {
  projectId: string;
  caseId: string;
  state: string;
  rowVersion: number;
  transitions: TransitionRuleView[];
  blockersByTarget: Record<string, string[]>;
  readiness: ClosureReadinessView | null;
  evidence: EvidenceView[];
  events: StateEventView[];
  memberNames: Record<string, string>;
  canRegister: boolean;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            Estado atual: <StateBadge state={state} />
            <FeatureInfo helpId="garantias.detalhe.estado-atual" />
            <span className="text-xs font-normal text-muted-foreground">
              versão {rowVersion}
            </span>
            <FeatureInfo helpId="garantias.detalhe.versao" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start gap-1">
            {readiness ? (
              <Notice tone={readiness.ready ? "success" : "info"} className="flex-1">
                <p className="font-semibold">{readiness.ready ? "Pronto para encerrar" : "Ainda não pode ser encerrado"}</p>
                {readiness.blockers.length > 0 ? (
                  <ul className="list-disc pl-4">
                    {readiness.blockers.map((b) => (
                      <li key={b}>{blockerMessage(b)}</li>
                    ))}
                  </ul>
                ) : null}
                <p className="mt-1">Correção executada NÃO equivale a conformidade: encerrar exige verificação de eficácia EFICAZ, com evidência, e aceite do cliente.</p>
              </Notice>
            ) : (
              <p className="flex-1 text-muted-foreground">Prontidão para encerramento: SEM DADOS.</p>
            )}
            <FeatureInfo helpId="garantias.detalhe.prontidao-encerramento" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Transições permitidas
            <FeatureInfo helpId="garantias.detalhe.transicoes" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {transitions.length === 0 ? <p className="text-sm text-muted-foreground">Estado terminal: nenhuma transição prevista (SEM DADOS).</p> : null}
          {transitions.map((t) => {
            const blockers = blockersByTarget[t.toState] ?? [];
            const needsManage = t.minRole === "MANAGE";
            let disabledReason: string | null = null;
            if (!canRegister) disabledReason = "Seu perfil neste projeto é somente consulta (LEITURA): não é possível mudar o estado.";
            else if (needsManage && !canManage) disabledReason = "Esta transição exige perfil de gestão (Administrador, Gerente ou Gestor).";
            else if (blockers.length > 0) disabledReason = `Bloqueada: ${blockers.map(blockerMessage).join(" ")}`;
            const idBase = `trans-${t.toState}`;
            return (
              <section key={t.toState} aria-label={`Transição para ${warrantyStateLabel(t.toState)}`} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    {warrantyStateLabel(state)} → {warrantyStateLabel(t.toState)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {needsManage ? "exige gestão" : "registro"}
                    {t.requiresJustification ? " · justificativa" : ""}
                    {t.requiresEvidence ? " · evidência" : ""}
                  </span>
                </div>
                <ActionForm
                  className="mt-2 space-y-3"
                  submitLabel={`Mover para ${warrantyStateLabel(t.toState)}`}
                  submitHelp={<FeatureInfo helpId="garantias.detalhe.transicao-executar" />}
                  disabledReason={disabledReason}
                  conflictHelp={<FeatureInfo helpId="garantias.detalhe.conflito-versao" />}
                  successMessage="Transição registrada com auditoria."
                  action={(raw) =>
                    transitionWarrantyAction(projectId, {
                      caseId,
                      fromState: state,
                      toState: t.toState,
                      expectedVersion: rowVersion,
                      justification: raw.justification ?? null,
                      evidenceIds: Object.keys(raw)
                        .filter((k) => k.startsWith("ev:"))
                        .map((k) => k.slice(3)),
                    })
                  }
                >
                  {t.requiresJustification ? (
                    <div className="space-y-1">
                      <FieldLabel htmlFor={`${idBase}-just`} label="Justificativa (mín. 10 caracteres)" helpId="garantias.detalhe.transicao-justificativa" required />
                      <textarea id={`${idBase}-just`} name="justification" required minLength={10} className={cn(FIELD_CLASS, "min-h-20")} />
                    </div>
                  ) : null}
                  {t.requiresEvidence ? (
                    <fieldset className="space-y-1">
                      <legend className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                        Evidências do caso <FeatureInfo helpId="garantias.detalhe.transicao-evidencias" />
                      </legend>
                      {evidence.length === 0 ? (
                        <p className="text-sm text-muted-foreground">SEM DADOS — registre uma evidência na aba Evidências antes.</p>
                      ) : (
                        evidence.map((ev) => (
                          <label key={ev.id} className="flex min-h-11 items-center gap-2 text-sm text-foreground">
                            <input type="checkbox" name={`ev:${ev.id}`} className="size-5 accent-[var(--primary)]" />
                            <span>
                              {ev.sourceRef} <span className="text-muted-foreground">({ev.classification})</span>
                            </span>
                          </label>
                        ))
                      )}
                    </fieldset>
                  ) : null}
                </ActionForm>
                {blockers.length > 0 ? (
                  <div className="mt-2 flex items-start gap-1">
                    <ul className="flex-1 list-disc pl-5 text-sm text-foreground">
                      {blockers.map((b) => (
                        <li key={b}>{blockerMessage(b)}</li>
                      ))}
                    </ul>
                    <FeatureInfo helpId="garantias.detalhe.bloqueios" />
                  </div>
                ) : null}
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Linha do tempo (auditoria do ciclo)
            <FeatureInfo helpId="garantias.detalhe.linha-do-tempo" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">SEM DADOS — nenhum evento de estado registrado.</p>
          ) : (
            <ol className="space-y-2">
              {[...events].reverse().map((ev) => (
                <li key={ev.seq} className="rounded-md border border-border p-2 text-sm">
                  <p className="font-medium text-foreground">
                    {ev.fromState ? `${warrantyStateLabel(ev.fromState)} → ` : "Abertura → "}
                    {warrantyStateLabel(ev.toState)}
                  </p>
                  <p className="text-muted-foreground">
                    {formatDateTime(ev.occurredAt)} · {ev.actorUserId ? (memberNames[ev.actorUserId] ?? "usuário do projeto") : "sistema"}
                    {ev.evidenceIds.length > 0 ? ` · ${ev.evidenceIds.length} evidência(s)` : ""}
                  </p>
                  {ev.justification ? <p className="text-foreground">Justificativa: {ev.justification}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
