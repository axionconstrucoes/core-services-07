"use client";

// Formulários das ações formais do alerta: [RESOLVIDO] [TOMANDO
// PROVIDÊNCIAS] [ENVIAR P/] [ESPECIALISTA] [OUTRO]. Cada ação é um POST
// (server action) com confirmação; nada muda por GET. Para HIGH/CRITICAL,
// as quatro últimas provocam escalonamento imediato ao próximo nível
// (regra única em alert-state-machine.ts) — informado aqui, decidido lá.

import { useEffect, useMemo, useRef, useState } from "react";
import { useActionState } from "react";

import { applyAlertActionAction } from "@/app/[projectId]/alertas/[caseId]/actions";
import { initialEmailRegistryActionState } from "@/app/[projectId]/documentos/emails/actions-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ForwardCandidate } from "@/lib/risk-alerts/alert-detail-data";
import { type AlertActionType } from "@/lib/risk-alerts/types";

export interface AlertActionFormsProps {
  projectId: string;
  caseId: string;
  riskLevel: string;
  availableActions: AlertActionType[];
  forwardCandidates: ForwardCandidate[];
  expertOptions: Array<{ id: string; label: string; domains: string }>;
  suggestedExpert: string | null;
  requiresJustification: boolean;
  nextLevelLabel: string | null;
  initialAction: AlertActionType | null;
  token: string | null;
}

// Rótulos e cores dos QUATRO botões (template universal): os três de tratamento em cinza médio com texto branco;
// ESPECIALISTA (consulta) em laranja com texto branco. Cores com contraste WCAG AA sobre branco.
const UI_LABEL: Record<AlertActionType, string> = {
  RESOLVED: "RESOLVIDO",
  TAKING_ACTION: "EM ANDAMENTO",
  FORWARD: "ENVIAR PARA",
  EXPERT_CONSULTATION: "ESPECIALISTA",
  OTHER: "OUTRO",
  RESOLUTION_CONFIRMED: "CONFIRMAR RESOLUÇÃO",
};
const MAIN_ACTIONS: AlertActionType[] = ["RESOLVED", "TAKING_ACTION", "FORWARD", "EXPERT_CONSULTATION"];
const GRAY_BUTTON = "bg-[#6B7280] text-white hover:bg-[#4B5563]";
const ORANGE_BUTTON = "bg-[#C2410C] text-white hover:bg-[#9A3412]";
const buttonClass = (action: AlertActionType): string => (action === "EXPERT_CONSULTATION" ? ORANGE_BUTTON : GRAY_BUTTON);

const submitLabel = (action: AlertActionType): string =>
  action === "FORWARD" ? "CONFIRMAR ENVIO" : action === "TAKING_ACTION" ? "CONFIRMAR" : action === "RESOLVED" ? "CONFIRMAR RESOLUÇÃO" : action === "EXPERT_CONSULTATION" ? "CONSULTAR" : `Confirmar ${UI_LABEL[action]}`;

const ESCALATING: AlertActionType[] = ["TAKING_ACTION", "FORWARD", "EXPERT_CONSULTATION", "OTHER"];

export function AlertActionForms(props: AlertActionFormsProps) {
  const [selected, setSelected] = useState<AlertActionType | null>(props.initialAction && props.availableActions.includes(props.initialAction) ? props.initialAction : null);
  const [state, formAction, pending] = useActionState(applyAlertActionAction, initialEmailRegistryActionState);
  const [search, setSearch] = useState("");
  const immediate = props.riskLevel === "HIGH" || props.riskLevel === "CRITICAL";
  const formRef = useRef<HTMLFormElement>(null);

  // Abre direto o controle da ação escolhida (calendário / lista de colaboradores), sem o usuário procurar.
  // showPicker() exige gesto do usuário; quando o clique veio do e-mail (sem gesto) ele recusa e só damos o foco.
  useEffect(() => {
    const name = selected === "TAKING_ACTION" ? "forecastAt" : selected === "FORWARD" ? "targetUserId" : null;
    const target = name ? (formRef.current?.elements.namedItem(name) as (HTMLInputElement | HTMLSelectElement) | null) : null;
    if (!target) return;
    target.focus();
    try {
      (target as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* sem gesto do usuário: o foco já destaca o campo */
    }
  }, [selected]);
  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? props.forwardCandidates.filter((c) => `${c.name} ${c.email} ${c.area ?? ""} ${c.matrixPosition ?? ""}`.toLowerCase().includes(q)) : props.forwardCandidates;
  }, [props.forwardCandidates, search]);

  if (props.availableActions.length === 0) {
    return <p className="text-sm text-muted-foreground" data-testid="alert-actions-none">Alerta resolvido — nenhuma ação adicional.</p>;
  }

  return (
    <div className="flex flex-col gap-3" data-testid="alert-actions">
      <div className="flex flex-wrap gap-2" data-testid="alert-four-buttons">
        {MAIN_ACTIONS.filter((action) => props.availableActions.includes(action)).map((action) => (
          <Button key={action} type="button" size="sm" className={`${buttonClass(action)} ${selected === action ? "ring-2 ring-offset-2 ring-[#1B2A4A]" : ""}`} onClick={() => setSelected(action)} data-testid={`alert-action-${action}`} aria-pressed={selected === action}>
            {UI_LABEL[action]}
          </Button>
        ))}
        {props.availableActions.filter((action) => !MAIN_ACTIONS.includes(action)).map((action) => (
          <Button key={action} type="button" size="sm" variant={selected === action ? "default" : "outline"} onClick={() => setSelected(action)} data-testid={`alert-action-${action}`}>
            {UI_LABEL[action]}
          </Button>
        ))}
      </div>
      {selected ? (
        <form ref={formRef} action={formAction} className="flex flex-col gap-2 rounded-md border p-3 text-sm" aria-label={`Ação ${UI_LABEL[selected]}`}>
          <input type="hidden" name="projectId" value={props.projectId} />
          <input type="hidden" name="caseId" value={props.caseId} />
          <input type="hidden" name="action" value={selected} />
          {props.token && props.initialAction === selected ? <input type="hidden" name="token" value={props.token} /> : null}
          <p className="font-medium">{UI_LABEL[selected]}</p>
          {immediate && ESCALATING.includes(selected) ? (
            <p className="rounded bg-amber-50 p-2 text-xs text-amber-900" data-testid="alert-action-escalation-notice">
              Risco {props.riskLevel}: esta ação provoca escalonamento imediato ao próximo nível hierárquico ({props.nextLevelLabel}). A ação e o escalonamento são eventos distintos, ambos auditados; o alerta permanece aberto.
            </p>
          ) : null}

          {(selected === "RESOLVED" || selected === "RESOLUTION_CONFIRMED") ? (
            <>
              <label className="flex flex-col gap-1">Solução adotada<Textarea name="text" required rows={3} /></label>
              {immediate ? <label className="flex flex-col gap-1">Evidência (obrigatória para ALTO/CRÍTICO)<Input name="evidence" required /></label> : null}
              <label className="flex flex-col gap-1">Justificativa{props.requiresJustification ? " (obrigatória pela Matriz)" : ""}<Textarea name="justification" rows={2} required={props.requiresJustification} /></label>
              <label className="flex items-center gap-2"><input type="checkbox" name="confirmed" required /> Confirmo a resolução (responsável e data ficam registrados).</label>
            </>
          ) : null}
          {selected === "TAKING_ACTION" ? (
            <>
              <label className="flex flex-col gap-1">Providências em andamento<Textarea name="text" required rows={3} /></label>
              <label className="flex flex-col gap-1">
                {immediate ? "Previsão de conclusão (data e horário — obrigatórios para ALTO/CRÍTICO)" : "Data prevista de conclusão"}
                <Input type={immediate ? "datetime-local" : "date"} name="forecastAt" required data-testid="alert-forecast-input" onClick={(e) => { try { (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.(); } catch { /* sem suporte */ } }} />
                <span className="text-xs text-muted-foreground">
                  A previsão não reinicia o prazo original nem suspende os escalonamentos.
                </span>
              </label>
            </>
          ) : null}
          {selected === "FORWARD" ? (
            <>
              <label className="flex flex-col gap-1">
                Pesquisar colaborador (nome, e-mail, área, posição na Matriz)
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite para filtrar…" />
              </label>
              <label className="flex flex-col gap-1">
                Novo responsável (colaboradores ativos desta obra)
                <Select name="targetUserId" required defaultValue="" className="h-10 border-slate-600 bg-slate-900 text-white" data-testid="alert-forward-select">
                  <option value="" disabled className="bg-slate-900 text-white">Selecione…</option>
                  {candidates.map((c) => (
                    <option key={c.userId} value={c.userId} className="bg-slate-900 text-white">
                      {c.name} — {c.email} — {c.area ?? "sem área"} — {c.permission}{c.matrixPosition ? ` — ${c.matrixPosition}` : ""}{c.inPilotAllowlist ? "" : " — fora da allowlist do piloto (recebe só este alerta)"}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">Justificativa do encaminhamento (opcional)<Textarea name="text" rows={2} /></label>
              <p className="text-xs text-muted-foreground">O prazo original não é alterado. Ficam registrados quem encaminhou, quem recebeu e a data/hora.</p>
            </>
          ) : null}
          {selected === "EXPERT_CONSULTATION" ? (
            <>
              <label className="flex flex-col gap-1">
                Expert
                <Select name="expertId" required defaultValue={props.suggestedExpert ?? ""}>
                  <option value="" disabled>Selecione o Expert…</option>
                  {props.expertOptions.map((e) => (
                    <option key={e.id} value={e.id}>{e.label} — {e.domains}</option>
                  ))}
                </Select>
              </label>
              <label className="flex flex-col gap-1">Pergunta (obrigatória)<Textarea name="question" required rows={3} /></label>
              <p className="text-xs text-muted-foreground">O Expert apenas recomenda: não executa ações nem resolve o alerta; a resposta exige revisão humana e chega na mesma thread.</p>
            </>
          ) : null}
          {selected === "OTHER" ? <label className="flex flex-col gap-1">Descrição (obrigatória)<Textarea name="text" required rows={3} /></label> : null}

          <div className="flex items-center gap-3">
            <Button type="submit" size="sm" disabled={pending}>{pending ? "Registrando…" : submitLabel(selected)}</Button>
            {state.error ? <span className="text-xs text-red-700" role="alert">{state.error}</span> : null}
            {state.success && state.message ? <span className="text-xs text-green-800" role="status">{selected === "RESOLVED" ? <span aria-hidden="true" data-testid="alert-resolved-tick" className="mr-1 font-bold text-green-700">&#10003;</span> : null}{state.message}</span> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
