"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FeatureInfo } from "@/components/shared/feature-info";
import { createNcrAction } from "@/app/[projectId]/qualidade/actions";
import { NCR_CREATE_ORIGINS, ORIGIN_LABEL } from "@/lib/quality/ui-model";
import { QField, QForm, TOUCH, useQualityAction } from "./form-kit";

export function NcrCreateForm({ projectId, requirements }: { projectId: string; requirements: Array<{ id: string; code: string; title: string }> }) {
  const [state, formAction, pending] = useQualityAction(createNcrAction);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h3 className="flex items-center gap-1 text-sm font-semibold">
        Nova RNC
        <FeatureInfo helpId="qualidade.rnc.form-criar" />
      </h3>
      <p className="text-xs text-muted-foreground">
        Toda RNC nasce em DETECTADA e aponta para a fonte original. A mesma origem não gera duas RNC ativas (Qualidade x SSMA): se já existir, a existente é indicada.
      </p>
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar RNC">
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.campo.titulo" label="Título">
            <Input name="title" required minLength={3} maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.origem-tipo" label="Origem">
            <Select name="originType" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {NCR_CREATE_ORIGINS.map((o) => (
                <option key={o} value={o}>
                  {ORIGIN_LABEL[o]}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.campo.origem-ref" label="Referência da origem" hint="Ex.: ID da mensagem, nome do arquivo da foto, data do diário, número do relatório.">
            <Input name="originRef" required maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.url-fonte" label="Link da fonte (opcional)">
            <Input name="originUrl" type="url" maxLength={2000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.requisito" label="Requisito violado (opcional)">
            <Select name="requirementId" defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="">SEM DADOS</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.title}
                </option>
              ))}
            </Select>
          </QField>
        </div>
        <QField helpId="qualidade.campo.descricao" label="Descrição (fatos observados)">
          <Textarea name="description" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
      {state.ok && state.entityId ? (
        <Link href={`/${projectId}/qualidade/rnc/${state.entityId}`} className={`w-fit text-sm font-medium underline underline-offset-2 ${TOUCH} inline-flex items-center`}>
          Abrir a RNC
        </Link>
      ) : null}
    </div>
  );
}
