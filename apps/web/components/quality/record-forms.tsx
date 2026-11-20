"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FeatureInfo } from "@/components/shared/feature-info";
import { addComplaintAction, addInspectionAction, addRequirementAction, addTestAction } from "@/app/[projectId]/qualidade/actions";
import { COMPLAINT_CHANNEL_LABEL, INSPECTION_RESULT_LABEL, TEST_RESULT_LABEL } from "@/lib/quality/ui-model";
import { QField, QForm, TOUCH, useQualityAction } from "./form-kit";
import type { ReactNode } from "react";

type NcrOption = { id: string; code: string; title: string };
type ReqOption = { id: string; code: string; title: string };

function Panel({ title, helpId, children }: { title: string; helpId: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h3 className="flex items-center gap-1 text-sm font-semibold">
        {title}
        <FeatureInfo helpId={helpId} />
      </h3>
      {children}
    </div>
  );
}

const NcrSelect = ({ ncrs, id }: { ncrs: NcrOption[]; id?: string }) => (
  // help-exempt: seletor de RNC reutilizado; o ícone (i) e o rótulo estão no QField de cada formulário (qualidade.campo.rnc-vinculada)
  <Select id={id} name="ncrId" defaultValue="" className={`w-full ${TOUCH}`}>
    <option value="">SEM VÍNCULO</option>
    {ncrs.map((n) => (
      <option key={n.id} value={n.id}>
        {n.code} — {n.title}
      </option>
    ))}
  </Select>
);

export function ComplaintForm({ projectId, ncrs }: { projectId: string; ncrs: NcrOption[] }) {
  const [state, formAction, pending] = useQualityAction(addComplaintAction);
  return (
    <Panel title="Nova reclamação de cliente" helpId="qualidade.reclamacoes.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar reclamação">
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.reclamacoes.campo-canal" label="Canal">
            <Select name="channel" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {Object.entries(COMPLAINT_CHANNEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.reclamacoes.campo-recebida-em" label="Recebida em">
            <Input name="receivedAt" type="datetime-local" required className={TOUCH} />
          </QField>
          <QField helpId="qualidade.reclamacoes.campo-reclamante" label="Reclamante (opcional)">
            <Input name="complainant" maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.reclamacoes.campo-assunto" label="Assunto">
            <Input name="subject" required minLength={3} maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.fonte-ref" label="Fonte original" hint="Ex.: assunto e data do e-mail, protocolo do portal.">
            <Input name="sourceRef" required maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.url-fonte" label="Link da fonte (opcional)">
            <Input name="sourceUrl" type="url" maxLength={2000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.rnc-vinculada" label="RNC vinculada (opcional)">
            <NcrSelect ncrs={ncrs} />
          </QField>
        </div>
        <QField helpId="qualidade.campo.descricao" label="Descrição">
          <Textarea name="description" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Panel>
  );
}

export function InspectionForm({ projectId, ncrs, requirements }: { projectId: string; ncrs: NcrOption[]; requirements: ReqOption[] }) {
  const [state, formAction, pending] = useQualityAction(addInspectionAction);
  return (
    <Panel title="Nova inspeção" helpId="qualidade.inspecoes.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar inspeção">
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.campo.titulo" label="Título">
            <Input name="title" required minLength={3} maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.inspecoes.campo-tipo" label="Tipo de inspeção (opcional)">
            <Input name="inspectionType" maxLength={200} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.inspecoes.campo-local" label="Local (opcional)">
            <Input name="location" maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.inspecoes.campo-resultado" label="Resultado">
            <Select name="result" defaultValue="PENDENTE" className={`w-full ${TOUCH}`}>
              {Object.entries(INSPECTION_RESULT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.inspecoes.campo-planejada" label="Planejada para (opcional)">
            <Input name="plannedAt" type="datetime-local" className={TOUCH} />
          </QField>
          <QField helpId="qualidade.inspecoes.campo-realizada" label="Realizada em (opcional)">
            <Input name="performedAt" type="datetime-local" className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.requisito" label="Requisito verificado (opcional)">
            <Select name="requirementId" defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="">SEM DADOS</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.title}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.campo.rnc-vinculada" label="RNC vinculada (opcional)">
            <NcrSelect ncrs={ncrs} />
          </QField>
          <QField helpId="qualidade.campo.fonte-ref" label="Fonte (relatório, checklist) (opcional)">
            <Input name="sourceRef" maxLength={1000} className={TOUCH} />
          </QField>
        </div>
        <QField helpId="qualidade.campo.observacoes" label="Observações">
          <Textarea name="notes" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Panel>
  );
}

export function TestForm({ projectId, ncrs, requirements }: { projectId: string; ncrs: NcrOption[]; requirements: ReqOption[] }) {
  const [state, formAction, pending] = useQualityAction(addTestAction);
  return (
    <Panel title="Novo ensaio ou laudo" helpId="qualidade.ensaios.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar ensaio">
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.ensaios.campo-tipo" label="Tipo de ensaio">
            <Input name="testType" required minLength={2} maxLength={200} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.ensaios.campo-laboratorio" label="Laboratório (opcional)">
            <Input name="laboratory" maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.ensaios.campo-amostra" label="Amostra (opcional)">
            <Input name="sampleRef" maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.ensaios.campo-realizado" label="Realizado em (opcional)">
            <Input name="performedAt" type="datetime-local" className={TOUCH} />
          </QField>
          <QField helpId="qualidade.ensaios.campo-resultado" label="Resultado" hint="Aprovado ou reprovado exigem o laudo de origem.">
            <Select name="result" defaultValue="PENDENTE" className={`w-full ${TOUCH}`}>
              {Object.entries(TEST_RESULT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.ensaios.campo-laudo" label="Laudo / relatório (referência)">
            <Input name="reportRef" maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.ensaios.campo-laudo-url" label="Link do laudo (opcional)">
            <Input name="reportUrl" type="url" maxLength={2000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.requisito" label="Requisito ensaiado (opcional)">
            <Select name="requirementId" defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="">SEM DADOS</option>
              {requirements.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} — {r.title}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.campo.rnc-vinculada" label="RNC vinculada (opcional)">
            <NcrSelect ncrs={ncrs} />
          </QField>
        </div>
        <QField helpId="qualidade.campo.observacoes" label="Observações">
          <Textarea name="notes" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Panel>
  );
}

export function RequirementForm({ projectId }: { projectId: string }) {
  const [state, formAction, pending] = useQualityAction(addRequirementAction);
  return (
    <Panel title="Novo requisito técnico" helpId="qualidade.requisitos.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar requisito">
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.campo.titulo" label="Título">
            <Input name="title" required minLength={3} maxLength={300} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.requisitos.campo-fonte" label="Fonte do requisito" hint="Norma, projeto, especificação ou cláusula contratual — sem fonte o requisito não é aceito.">
            <Input name="sourceRef" required maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.url-fonte" label="Link da fonte (opcional)">
            <Input name="sourceUrl" type="url" maxLength={2000} className={TOUCH} />
          </QField>
        </div>
        <QField helpId="qualidade.campo.descricao" label="Descrição">
          <Textarea name="description" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Panel>
  );
}
