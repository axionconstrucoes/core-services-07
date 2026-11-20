"use client";

import { useActionState, useId, type ReactNode } from "react";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { changeDeliveryStatusAction, updateDeliveryItemAction } from "@/app/[projectId]/providencias/actions";
import { initialDeliveryActionState } from "@/app/[projectId]/providencias/actions-state";
import {
  DELIVERY_STATUS_LABELS,
  DEPENDENCY_LABELS,
  type DeliveryItem,
  type DeliveryStatus,
} from "@/lib/delivery/delivery-items";

export function DeliveryItemEditor({
  projectId,
  item,
  members,
  riskPanel,
}: {
  projectId: string;
  item: DeliveryItem;
  members: Array<{ userId: string; name: string }>;
  /** Painel de classificação de risco (critérios, sugestão, revisão com justificativa e histórico). */
  riskPanel?: ReactNode;
}) {
  const [fieldsState, fieldsAction, fieldsPending] = useActionState(
    updateDeliveryItemAction.bind(null, projectId, item.id),
    initialDeliveryActionState
  );
  const [statusState, statusAction, statusPending] = useActionState(
    changeDeliveryStatusAction.bind(null, projectId, item.id),
    initialDeliveryActionState
  );
  const uid = useId();

  return (
    <details className="group rounded-md border bg-card text-sm">
      <summary className="cursor-pointer select-none px-3 py-1.5 text-xs font-medium text-primary">Editar</summary>
      <div className="grid gap-4 border-t p-3 lg:grid-cols-2">
        <form action={fieldsAction} className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">Dados da providência</p>

          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-deadline`}>Data limite de finalização</label>
              <FeatureInfo helpId="planejamento.providencias.campo-data-limite" />
            </span>
            <Input id={`${uid}-deadline`} type="date" name="deadline" defaultValue={item.deadline ?? ""} />
          </div>
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-internal`}>Prazo interno antecipado (opcional)</label>
              <FeatureInfo helpId="planejamento.providencias.campo-prazo-interno" />
            </span>
            <Input id={`${uid}-internal`} type="date" name="internal_deadline" defaultValue={item.internalDeadline ?? ""} />
          </div>
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-resp`}>Responsável interno (colaborador ativo da obra)</label>
              <FeatureInfo helpId="planejamento.providencias.campo-responsavel" />
            </span>
            <Select id={`${uid}-resp`} name="responsible_user_id" defaultValue={item.responsibleUserId ?? ""}>
              <option value="">A definir</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-dep-kind`}>Depende de</label>
              <FeatureInfo helpId="planejamento.providencias.campo-dependencia" />
            </span>
              <Select id={`${uid}-dep-kind`} name="dependency_kind" defaultValue={item.dependencyKind ?? ""}>
                <option value="">Ninguém externo</option>
                {Object.entries(DEPENDENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-dep-name`}>Quem (nome da parte externa)</label>
              <FeatureInfo helpId="planejamento.providencias.campo-dependencia-nome" />
            </span>
              <Input id={`${uid}-dep-name`} name="dependency_name" defaultValue={item.dependencyName ?? ""} />
            </div>
          </div>
          {item.checklistKey === "CNO" ? (
            <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-cno`}>Número do CNO</label>
              <FeatureInfo helpId="planejamento.providencias.campo-cno" />
            </span>
              <Input id={`${uid}-cno`} name="cno_number" defaultValue={item.cnoNumber ?? ""} />
            </div>
          ) : (
            <input type="hidden" name="cno_number" value={item.cnoNumber ?? ""} />
          )}
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-evidence`}>Evidência / documento / protocolo</label>
              <FeatureInfo helpId="planejamento.providencias.campo-evidencia" />
            </span>
            <Input id={`${uid}-evidence`} name="evidence" defaultValue={item.evidence ?? ""} />
            <span className="text-[11px] text-muted-foreground">Registrar a evidência não conclui a providência.</span>
          </div>
          <span className="flex items-center gap-1 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="blocks_delivery" defaultChecked={item.blocksDelivery} /> Bloqueia a entrega
            </label>
            <FeatureInfo helpId="planejamento.providencias.campo-bloqueia-entrega" />
          </span>
          <span className="flex items-center gap-1 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="applicability_confirmed" defaultChecked={item.applicabilityConfirmed} /> Aplicabilidade e
              responsabilidade contratual confirmadas
            </label>
            <FeatureInfo helpId="planejamento.providencias.campo-aplicabilidade" />
          </span>

          {fieldsState.error ? <p className="text-xs text-destructive">{fieldsState.error}</p> : null}
          {fieldsState.success ? <p className="text-xs text-emerald-700">{fieldsState.success}</p> : null}
          <div className="flex items-center gap-1 self-start">
            <Button type="submit" size="sm" disabled={fieldsPending}>
              {fieldsPending ? "Salvando…" : "Salvar dados"}
            </Button>
            <FeatureInfo helpId="planejamento.providencias.salvar-dados" />
          </div>
        </form>

        <form action={statusAction} className="flex flex-col gap-2">
          <p className="text-xs font-semibold text-foreground">Situação</p>
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-status`}>Nova situação</label>
              <FeatureInfo helpId="planejamento.providencias.campo-nova-situacao" />
            </span>
            <Select id={`${uid}-status`} name="status" defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {(Object.keys(DELIVERY_STATUS_LABELS) as DeliveryStatus[])
                .filter((s) => s !== item.status)
                .map((s) => (
                  <option key={s} value={s}>
                    {DELIVERY_STATUS_LABELS[s]}
                  </option>
                ))}
            </Select>
          </div>
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-justification`}>Justificativa (obrigatória para Não aplicável; vale como comprovação ao concluir)</label>
              <FeatureInfo helpId="planejamento.providencias.campo-justificativa" />
            </span>
            <Textarea id={`${uid}-justification`} name="justification" rows={2} />
          </div>
          <div className="grid gap-1 text-xs">
            <span className="inline-flex items-center gap-1">
              <label htmlFor={`${uid}-status-evidence`}>Evidência / documento / protocolo (para concluir)</label>
              <FeatureInfo helpId="planejamento.providencias.campo-evidencia-conclusao" />
            </span>
            <Input id={`${uid}-status-evidence`} name="evidence" defaultValue={item.evidence ?? ""} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Concluir exige gestor, gerente ou administrador e evidência ou justificativa. Tudo fica no histórico.
          </p>
          {statusState.error ? <p className="text-xs text-destructive">{statusState.error}</p> : null}
          {statusState.success ? <p className="text-xs text-emerald-700">{statusState.success}</p> : null}
          <div className="flex items-center gap-1 self-start">
            <Button type="submit" size="sm" variant="outline" disabled={statusPending}>
              {statusPending ? "Confirmando…" : "Confirmar situação"}
            </Button>
            <FeatureInfo helpId="planejamento.providencias.confirmar-situacao" />
          </div>
        </form>

        {riskPanel ? (
          <div className="border-t pt-3 lg:col-span-2">
            <p className="mb-2 text-xs font-semibold text-foreground">Grau de risco</p>
            {riskPanel}
          </div>
        ) : null}
      </div>
    </details>
  );
}
