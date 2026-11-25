"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FeatureInfo } from "@/components/shared/feature-info";
import { transitionNcrAction } from "@/app/[projectId]/qualidade/actions";
import {
  TRANSITION_VERB,
  blockerLabel,
  validateTransitionDraft,
  type TransitionOption,
} from "@/lib/quality/ui-model";
import { ClassificationBadge } from "./quality-ui";
import { QField, QForm, TOUCH, useQualityAction } from "./form-kit";
import { cn } from "@/lib/utils";

export interface PanelEvidence {
  id: string;
  sourceRef: string;
  classification: string;
}

/**
 * Painel de transição da RNC. Os botões vêm do catálogo quality_state_transitions (via máquina de estados espelhada) e os BLOQUEIOS da RPC
 * quality_transition_blockers (autoridade do banco). Justificativa e evidência obrigatórias são exigidas aqui e revalidadas pela RPC.
 * VERSION_CONFLICT (outra pessoa transicionou antes) aparece com a ação de recarregar. O painel é remontado a cada nova row_version (key).
 */
export function NcrTransitionPanel({
  projectId,
  ncrId,
  rowVersion,
  options,
  evidence,
  otherNcrs,
  canRegister,
}: {
  projectId: string;
  ncrId: string;
  rowVersion: number;
  options: TransitionOption[];
  evidence: PanelEvidence[];
  otherNcrs: Array<{ id: string; code: string; title: string; state: string }>;
  canRegister: boolean;
}) {
  const [state, formAction, pending] = useQualityAction(transitionNcrAction);
  const [selected, setSelected] = useState<string | null>(null);
  const [justification, setJustification] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [duplicateOf, setDuplicateOf] = useState("");

  const opt = options.find((o) => o.to === selected) ?? null;
  const missing = opt ? validateTransitionDraft(opt, { justification, evidenceCount: picked.length, duplicateOf }) : [];
  const activeOtherNcrs = otherNcrs.filter((n) => n.state !== "DUPLICADA" && n.state !== "CANCELADA");

  if (!canRegister) {
    return (
      <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
        Seu perfil é somente consulta (LEITURA): as transições ficam indisponíveis. O banco também recusa a operação.
      </p>
    );
  }
  if (options.length === 0) {
    return <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">Nenhuma transição disponível a partir deste estado.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2" aria-label="Transições disponíveis">
        {options.map((o) => (
          <li key={o.to} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1">
              {/* help-exempt: botão de transição; o ícone (i) qualidade.rnc.botao-transicao vem logo após o botão */}
              <Button
                type="button"
                variant={selected === o.to ? "default" : "outline"}
                aria-pressed={selected === o.to}
                aria-disabled={!o.enabled}
                className={cn(TOUCH, !o.enabled && "cursor-not-allowed border-dashed text-muted-foreground")}
                onClick={() => {
                  if (!o.enabled) return;
                  setSelected(o.to);
                  setJustification("");
                  setPicked([]);
                  setDuplicateOf("");
                }}
              >
                {TRANSITION_VERB[o.to] ?? o.toLabel}
              </Button>
              <FeatureInfo helpId="qualidade.rnc.botao-transicao" />
              {o.requiresJustification ? <span className="text-xs text-muted-foreground">justificativa obrigatória</span> : null}
              {o.requiresEvidence ? <span className="text-xs text-muted-foreground">evidência obrigatória</span> : null}
              {o.minRole === "MANAGE" ? <span className="text-xs text-muted-foreground">exige perfil de gestão</span> : null}
            </div>
            {o.blockers.length > 0 ? (
              <ul className="ml-1 list-disc pl-4 text-xs text-muted-foreground" aria-label={`Bloqueios para ${o.toLabel}`}>
                {o.blockers.map((b) => (
                  <li key={b}>{blockerLabel(b)}</li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      {opt ? (
        <QForm
          state={state}
          formAction={formAction}
          pending={pending}
          projectId={projectId}
          submitLabel={`Confirmar: ${TRANSITION_VERB[opt.to] ?? opt.toLabel}`}
          disabled={missing.length > 0 || state.conflict}
          disabledReason={state.conflict ? "Recarregue a página antes de tentar de novo." : missing.length ? missing.map(blockerLabel).join(" ") : undefined}
          className="rounded-md border border-border bg-card p-3 text-card-foreground"
        >
          <input type="hidden" name="ncrId" value={ncrId} />
          <input type="hidden" name="expectedVersion" value={rowVersion} />
          <input type="hidden" name="toState" value={opt.to} />
          <QField helpId="qualidade.rnc.campo-justificativa" label={opt.requiresJustification ? "Justificativa (obrigatória)" : "Justificativa (opcional)"}>
            <Textarea name="justification" value={justification} onChange={(e) => setJustification(e.target.value)} maxLength={4000} className={TOUCH} />
          </QField>
          {opt.to === "DUPLICADA" ? (
            <QField helpId="qualidade.rnc.campo-duplicada-de" label="RNC original (obrigatória)">
              <Select name="duplicateOf" value={duplicateOf} onChange={(e) => setDuplicateOf(e.target.value)} className={`w-full ${TOUCH}`}>
                <option value="">Selecione…</option>
                {activeOtherNcrs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.code} — {n.title}
                  </option>
                ))}
              </Select>
            </QField>
          ) : null}
          <fieldset className="flex flex-col gap-1.5">
            <legend className="flex items-center gap-1 text-sm font-medium text-foreground">
              {opt.requiresEvidence ? "Evidências (selecione ao menos uma)" : "Evidências (opcional)"}
              <FeatureInfo helpId="qualidade.rnc.campo-evidencias-transicao" />
            </legend>
            {evidence.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma evidência cadastrada nesta RNC. Cadastre-a na seção Evidências.</p> : null}
            {evidence.map((ev) => (
              <label key={ev.id} className={cn("flex items-start gap-2 text-sm", TOUCH)}>
                {/* help-exempt: caixa de seleção de evidência; descrita pelo ícone (i) da legenda do grupo (qualidade.rnc.campo-evidencias-transicao) */}
                <input
                  type="checkbox"
                  name="evidenceIds"
                  value={ev.id}
                  checked={picked.includes(ev.id)}
                  onChange={(e) => setPicked((cur) => (e.target.checked ? [...cur, ev.id] : cur.filter((x) => x !== ev.id)))}
                  className="mt-1 size-4"
                />
                <span className="flex flex-wrap items-center gap-1">
                  <ClassificationBadge classification={ev.classification} />
                  <span className="break-words">{ev.sourceRef}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </QForm>
      ) : (
        <p className="text-xs text-muted-foreground">Selecione uma transição acima. Transições com bloqueio ficam indisponíveis até o bloqueio ser resolvido.</p>
      )}
    </div>
  );
}
