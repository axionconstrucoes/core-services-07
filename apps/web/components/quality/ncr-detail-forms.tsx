"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FeatureInfo } from "@/components/shared/feature-info";
import {
  addActionAction,
  addConsequenceAction,
  addCostAction,
  addEvidenceAction,
  addRecurrenceAction,
  addVerificationAction,
  setActionStatusAction,
  setEvidenceClassificationAction,
  updateNcrAction,
} from "@/app/[projectId]/qualidade/actions";
import {
  ACTION_KIND_LABEL,
  ACTION_STATUS_LABEL,
  CLASSIFICATION_LABEL,
  COST_CATEGORY_LABEL,
  EPISTEMIC_LABEL,
  EVIDENCE_SOURCE_OPTIONS,
  ORIGIN_LABEL,
  PILLAR_LABEL,
  PROBABILITY_LABEL,
  SEVERITY_OPTIONS,
  CRITICALITY_LABEL,
  VERIFICATION_RESULT_LABEL,
  validateEvidenceDraft,
} from "@/lib/quality/ui-model";
import { ActionMessage, QField, QForm, TOUCH, useQualityAction } from "./form-kit";

function Box({ title, helpId, children }: { title: string; helpId: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-card p-3 text-card-foreground">
      <h4 className="flex items-center gap-1 text-sm font-semibold">
        {title}
        <FeatureInfo helpId={helpId} />
      </h4>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- dados ----

export function NcrEditForm({ projectId, ncrId, rowVersion, rootCause, dueDate }: { projectId: string; ncrId: string; rowVersion: number; rootCause: string; dueDate: string }) {
  const [state, formAction, pending] = useQualityAction(updateNcrAction);
  return (
    <Box title="Causa raiz e prazo" helpId="qualidade.rnc.form-dados">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Salvar dados da RNC" disabled={state.conflict} disabledReason={state.conflict ? "Recarregue a página antes de tentar de novo." : undefined}>
        <input type="hidden" name="ncrId" value={ncrId} />
        <input type="hidden" name="expectedVersion" value={rowVersion} />
        <QField helpId="qualidade.rnc.campo-causa-raiz" label="Causa raiz (opcional)">
          <Textarea name="rootCause" defaultValue={rootCause} maxLength={4000} className={TOUCH} />
        </QField>
        <QField helpId="qualidade.rnc.campo-prazo" label="Prazo (opcional)">
          <Input name="dueDate" type="date" defaultValue={dueDate} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}

// ------------------------------------------------------------ evidências ----

export function EvidenceForm({ projectId, ncrId }: { projectId: string; ncrId: string }) {
  const [state, formAction, pending] = useQualityAction(addEvidenceAction);
  const [classification, setClassification] = useState("INDICIO");
  const [epistemic, setEpistemic] = useState("FATO");
  const warn = validateEvidenceDraft({ sourceType: "DOCUMENTO", sourceRef: "x", classification, epistemic }).filter((m) => m.startsWith("NC comprovada"));
  return (
    <Box title="Registrar evidência" helpId="qualidade.evidencias.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar evidência" disabled={warn.length > 0} disabledReason={warn[0]}>
        <input type="hidden" name="ncrId" value={ncrId} />
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.evidencias.campo-tipo-fonte" label="Tipo de fonte">
            <Select name="sourceType" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {EVIDENCE_SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {ORIGIN_LABEL[s]}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.campo.fonte-ref" label="Fonte original" hint="Referência exata do original (ID do e-mail, arquivo da foto, página do diário, nº do relatório).">
            <Input name="sourceRef" required maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.url-fonte" label="Link da fonte (opcional)">
            <Input name="sourceUrl" type="url" maxLength={2000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.evidencias.campo-capturada" label="Capturada em (opcional)">
            <Input name="capturedAt" type="datetime-local" className={TOUCH} />
          </QField>
          <QField helpId="qualidade.evidencias.campo-classificacao" label="Classificação">
            <Select name="classification" value={classification} onChange={(e) => setClassification(e.target.value)} className={`w-full ${TOUCH}`}>
              {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.evidencias.campo-epistemico" label="Tipo epistêmico">
            <Select name="epistemic" value={epistemic} onChange={(e) => setEpistemic(e.target.value)} className={`w-full ${TOUCH}`}>
              {Object.entries(EPISTEMIC_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
        </div>
        <QField helpId="qualidade.campo.descricao" label="O que a evidência mostra">
          <Textarea name="description" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}

/** Reclassificação inline de uma evidência (só classificação/tipo epistêmico; a fonte original é imutável no banco). */
export function EvidenceClassifyForm({ projectId, evidenceId, rowVersion, classification, epistemic }: { projectId: string; evidenceId: string; rowVersion: number; classification: string; epistemic: string }) {
  const [state, formAction, pending] = useQualityAction(setEvidenceClassificationAction);
  return (
    <form key={state.nonce ?? "f"} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="evidenceId" value={evidenceId} />
      <input type="hidden" name="expectedVersion" value={rowVersion} />
      <div className="flex flex-wrap items-center gap-1">
        {/* help-exempt: seletor inline descrito pelo cabeçalho da coluna Classificação (qualidade.evidencias.col-classificacao) */}
        <Select name="classification" defaultValue={classification} aria-label="Classificação" className={TOUCH}>
          {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {/* help-exempt: seletor inline descrito pelo cabeçalho da coluna Tipo epistêmico (qualidade.evidencias.col-epistemico) */}
        <Select name="epistemic" defaultValue={epistemic} aria-label="Tipo epistêmico" className={TOUCH}>
          {Object.entries(EPISTEMIC_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {/* help-exempt: botão inline de salvar; a ação é descrita no ícone (i) da coluna Reclassificar (qualidade.evidencias.col-reclassificar) */}
        <Button type="submit" size="sm" variant="outline" disabled={pending} className={TOUCH}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

// ---------------------------------------------------------------- CAPA ----

export function ActionForm({ projectId, ncrId }: { projectId: string; ncrId: string }) {
  const [state, formAction, pending] = useQualityAction(addActionAction);
  return (
    <Box title="Registrar ação (CAPA)" helpId="qualidade.capa.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar ação">
        <input type="hidden" name="ncrId" value={ncrId} />
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.capa.campo-tipo" label="Tipo">
            <Select name="kind" defaultValue="CORRETIVA" className={`w-full ${TOUCH}`}>
              {Object.entries(ACTION_KIND_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.capa.campo-prazo" label="Prazo (opcional)">
            <Input name="dueDate" type="date" className={TOUCH} />
          </QField>
        </div>
        <QField helpId="qualidade.capa.campo-descricao" label="Ação">
          <Textarea name="description" required minLength={3} maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}

export function ActionStatusForm({ projectId, actionId, rowVersion, status }: { projectId: string; actionId: string; rowVersion: number; status: string }) {
  const [state, formAction, pending] = useQualityAction(setActionStatusAction);
  return (
    <form key={state.nonce ?? "f"} action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="actionId" value={actionId} />
      <input type="hidden" name="expectedVersion" value={rowVersion} />
      <div className="flex flex-wrap items-center gap-1">
        {/* help-exempt: seletor inline descrito pelo cabeçalho da coluna Status da ação (qualidade.capa.col-status) */}
        <Select name="status" defaultValue={status} aria-label="Status da ação" className={TOUCH}>
          {Object.entries(ACTION_STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        {/* help-exempt: botão inline de salvar; a ação é descrita no ícone (i) da coluna Atualizar status (qualidade.capa.col-atualizar) */}
        <Button type="submit" size="sm" variant="outline" disabled={pending} className={TOUCH}>
          {pending ? "Salvando…" : "Atualizar"}
        </Button>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}

// ------------------------------------------------- verificação de eficácia ----

export function VerificationForm({ projectId, ncrId, evidence }: { projectId: string; ncrId: string; evidence: Array<{ id: string; sourceRef: string }> }) {
  const [state, formAction, pending] = useQualityAction(addVerificationAction);
  return (
    <Box title="Registrar verificação de eficácia" helpId="qualidade.eficacia.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar verificação" disabled={evidence.length === 0} disabledReason={evidence.length === 0 ? "Cadastre antes a evidência que sustentará a verificação." : undefined}>
        <input type="hidden" name="ncrId" value={ncrId} />
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.eficacia.campo-resultado" label="Resultado">
            <Select name="result" defaultValue="EFICAZ" className={`w-full ${TOUCH}`}>
              {Object.entries(VERIFICATION_RESULT_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.eficacia.campo-evidencia" label="Evidência da verificação (obrigatória)">
            <Select name="evidenceId" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {evidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.sourceRef}
                </option>
              ))}
            </Select>
          </QField>
        </div>
        <QField helpId="qualidade.eficacia.campo-criterio" label="Critério de verificação">
          <Textarea name="criteria" required minLength={5} maxLength={2000} className={TOUCH} />
        </QField>
        <QField helpId="qualidade.campo.observacoes" label="Observações">
          <Textarea name="notes" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}

// -------------------------------------------------------- consequências ----

export function ConsequenceForm({ projectId, ncrId }: { projectId: string; ncrId: string }) {
  const [state, formAction, pending] = useQualityAction(addConsequenceAction);
  return (
    <Box title="Registrar consequência por pilar" helpId="qualidade.rnc.form-consequencia">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar consequência">
        <input type="hidden" name="ncrId" value={ncrId} />
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.rnc.campo-pilar" label="Pilar">
            <Select name="pillar" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {Object.entries(PILLAR_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.rnc.campo-severidade" label="Severidade">
            <Select name="severity" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {SEVERITY_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {CRITICALITY_LABEL[s]}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.rnc.campo-probabilidade" label="Probabilidade (opcional)" hint="Só informe se houver fundamento; sem fundamento fica SEM DADOS.">
            <Select name="probability" defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="">SEM DADOS</option>
              {Object.entries(PROBABILITY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.rnc.campo-fundamento" label="Fundamento da probabilidade">
            <Input name="probabilityBasis" maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.campo.fonte-ref" label="Fonte da consequência" hint="Documento, foto, laudo ou decisão que sustenta a consequência.">
            <Input name="sourceRef" required maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.rnc.campo-medidas" label="Medidas (opcional)">
            <Input name="measures" maxLength={2000} className={TOUCH} />
          </QField>
        </div>
        <QField helpId="qualidade.campo.descricao" label="Descrição da consequência">
          <Textarea name="description" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}

// --------------------------------------------------------------- custos ----

export function CostForm({ projectId, ncrId }: { projectId: string; ncrId: string }) {
  const [state, formAction, pending] = useQualityAction(addCostAction);
  return (
    <Box title="Registrar custo de não qualidade" helpId="qualidade.custos.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar custo">
        <input type="hidden" name="ncrId" value={ncrId} />
        <div className="grid gap-3 md:grid-cols-2">
          <QField helpId="qualidade.custos.campo-categoria" label="Categoria">
            <Select name="category" required defaultValue="" className={`w-full ${TOUCH}`}>
              <option value="" disabled>
                Selecione…
              </option>
              {Object.entries(COST_CATEGORY_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </QField>
          <QField helpId="qualidade.custos.campo-fonte" label="Fonte do valor" hint="Obrigatória quando houver valor (nota, orçamento, medição).">
            <Input name="sourceRef" maxLength={1000} className={TOUCH} />
          </QField>
          <QField helpId="qualidade.custos.campo-estimado" label="Valor estimado (R$)">
            <Input name="estimatedAmount" inputMode="decimal" className={TOUCH} />
          </QField>
          <QField helpId="qualidade.custos.campo-real" label="Valor realizado (R$)">
            <Input name="actualAmount" inputMode="decimal" className={TOUCH} />
          </QField>
        </div>
        <QField helpId="qualidade.campo.descricao" label="Descrição">
          <Textarea name="description" maxLength={4000} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}

// ---------------------------------------------------------- recorrências ----

export function RecurrenceForm({ projectId, ncrId, others }: { projectId: string; ncrId: string; others: Array<{ id: string; code: string; title: string }> }) {
  const [state, formAction, pending] = useQualityAction(addRecurrenceAction);
  return (
    <Box title="Registrar recorrência" helpId="qualidade.recorrencias.form-criar">
      <QForm state={state} formAction={formAction} pending={pending} projectId={projectId} submitLabel="Registrar recorrência" disabled={others.length === 0} disabledReason={others.length === 0 ? "Não há outra RNC neste projeto para relacionar." : undefined}>
        <input type="hidden" name="ncrId" value={ncrId} />
        <QField helpId="qualidade.recorrencias.campo-relacionada" label="RNC relacionada">
          <Select name="relatedNcrId" required defaultValue="" className={`w-full ${TOUCH}`}>
            <option value="" disabled>
              Selecione…
            </option>
            {others.map((n) => (
              <option key={n.id} value={n.id}>
                {n.code} — {n.title}
              </option>
            ))}
          </Select>
        </QField>
        <QField helpId="qualidade.recorrencias.campo-fundamento" label="Fundamento da recorrência">
          <Textarea name="basis" required minLength={5} maxLength={2000} className={TOUCH} />
        </QField>
      </QForm>
    </Box>
  );
}
