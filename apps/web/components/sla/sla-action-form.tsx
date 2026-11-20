"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { slaAreaLabels } from "@/lib/labels";
import type { SlaArea } from "@/lib/sla/types";
import { createSlaActionAction } from "@/app/[projectId]/acoes/actions";
import { initialCreateSlaActionState } from "@/app/[projectId]/acoes/actions-state";

const AREA_OPTIONS = Object.keys(slaAreaLabels) as SlaArea[];

export function SlaActionForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useActionState(createSlaActionAction, initialCreateSlaActionState);

  return (
    <form action={formAction} className="flex flex-col gap-3 rounded-md border border-dashed p-4">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="origin" value="MANUAL" />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor="nova-acao-titulo">Título da ação</label>
            <FeatureInfo helpId="planejamento.acoes.nova-titulo" />
          </span>
          <Input id="nova-acao-titulo" name="title" required placeholder="Ex.: Responder notificação do cliente" />
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor="nova-acao-area">Área responsável</label>
            <FeatureInfo helpId="planejamento.acoes.nova-area" />
          </span>
          <Select id="nova-acao-area" name="area" defaultValue="ENGENHARIA" required>
            {AREA_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {slaAreaLabels[a]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor="nova-acao-risco">Nível de risco</label>
            <FeatureInfo helpId="planejamento.acoes.nova-risco" />
          </span>
          <Select id="nova-acao-risco" name="riskLevel" defaultValue="MEDIUM" required>
            <option value="LOW">Baixo</option>
            <option value="MEDIUM">Médio</option>
            <option value="HIGH">Alto</option>
            <option value="CRITICAL">Crítico</option>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="inline-flex items-center gap-1">
            <label htmlFor="nova-acao-prazo">Prazo contratual (opcional)</label>
            <FeatureInfo helpId="planejamento.acoes.nova-prazo-contratual" />
          </span>
          <Input id="nova-acao-prazo" type="datetime-local" name="contractualDeadline" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5 text-sm font-medium">
        <span className="inline-flex items-center gap-1">
          <label htmlFor="nova-acao-descricao">Descrição</label>
          <FeatureInfo helpId="planejamento.acoes.nova-descricao" />
        </span>
        <Textarea id="nova-acao-descricao" name="description" rows={2} />
      </div>

      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-600">Ação criada e sujeita à matriz de SLA.</p> : null}

      <span className="inline-flex items-center gap-1 self-start">
        <Button type="submit" disabled={pending}>
          {pending ? "Criando…" : "Criar ação"}
        </Button>
        <FeatureInfo helpId="planejamento.acoes.criar-acao" />
      </span>
    </form>
  );
}
