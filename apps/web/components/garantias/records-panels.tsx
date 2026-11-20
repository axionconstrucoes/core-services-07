"use client";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SELECT_CLASS } from "@/components/ui/select";
import {
  addEvidenceAction,
  addMaintenanceAction,
  addRepairAction,
  addSurveyAction,
  registerAcceptanceAction,
  registerVerificationAction,
} from "@/app/[projectId]/garantias/actions";
import {
  CLASSIFICATION_LABELS,
  EPISTEMIC_LABELS,
  EVIDENCE_SOURCE_LABELS,
  MAINTENANCE_STATUS_LABELS,
  VERIFICATION_RESULT_LABELS,
  CRITICALITY_LABELS,
} from "@/lib/garantias/labels";
import { MAINTENANCE_FACT_NOTICE } from "@/lib/garantias/coverage-form";
import type {
  ComplaintView,
  ConsequenceView,
  EvidenceView,
  MaintenanceStatusView,
  MaintenanceView,
  NonQualityCostView,
  RepairView,
  SurveyView,
  VerificationView,
  WarrantyCaseView,
} from "@/lib/garantias/types";
import { cn } from "@/lib/utils";
import { ActionForm } from "./action-form";
import { FIELD_CLASS, FieldLabel, Notice, SemDados, SourceLink, formatDateTime, formatDay, formatMoney } from "./ui-bits";

const READ_ONLY_REASON = "Seu perfil neste projeto é somente consulta (LEITURA): não é possível registrar.";

function List({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  return children.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : <ul className="space-y-2">{children}</ul>;
}

function Row({ children }: { children: React.ReactNode }) {
  return <li className="rounded-md border border-border p-3 text-sm text-foreground">{children}</li>;
}

// ------------------------------------------------------------------ manutenção
export function MaintenancePanel({ projectId, caseId, items, status, canRegister }: { projectId: string; caseId: string; items: MaintenanceView[]; status: MaintenanceStatusView | null; canRegister: boolean }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Situação dos comprovantes de manutenção
            <FeatureInfo helpId="garantias.detalhe.manutencao-situacao" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="font-semibold text-foreground" data-testid="manutencao-status">
            {status ? MAINTENANCE_STATUS_LABELS[status.status] : "SEM DADOS"}
          </p>
          {status ? <p className="text-muted-foreground">{status.records} registro(s); {status.withoutProof} sem comprovante.</p> : null}
          <Notice tone="info">{MAINTENANCE_FACT_NOTICE}</Notice>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Histórico de manutenção
            <FeatureInfo helpId="garantias.detalhe.manutencao-lista" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List empty="SEM DADOS — nenhum registro de manutenção.">
            {items.map((m) => (
              <Row key={m.id}>
                <p className="font-medium">{m.description}</p>
                <p className="text-muted-foreground">
                  {formatDay(m.performedAt)} · executor: {m.performedBy ?? <SemDados />}
                </p>
                <p>
                  Comprovante: {m.proofRef ? <SourceLink reference={m.proofRef} url={m.proofUrl} /> : <span className="font-semibold">SEM COMPROVANTE</span>}
                </p>
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registrar manutenção</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={(raw) => addMaintenanceAction(projectId, caseId, raw)}
            submitLabel="Registrar manutenção"
            submitHelp={<FeatureInfo helpId="garantias.detalhe.manutencao-adicionar" />}
            disabledReason={canRegister ? null : READ_ONLY_REASON}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <FieldLabel htmlFor="man-desc" label="Descrição" helpId="garantias.detalhe.manutencao-descricao" required />
                <textarea id="man-desc" name="description" required minLength={3} maxLength={2000} className={cn(FIELD_CLASS, "min-h-20")} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="man-data" label="Data da manutenção" helpId="garantias.detalhe.manutencao-data" />
                <input id="man-data" name="performedAt" type="date" className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="man-exec" label="Executor" helpId="garantias.detalhe.manutencao-executor" />
                <input id="man-exec" name="performedBy" className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="man-comp" label="Comprovante (nota, OS, documento)" helpId="garantias.detalhe.manutencao-comprovante" />
                <input id="man-comp" name="proofRef" className={FIELD_CLASS} placeholder="Vazio = SEM COMPROVANTE" />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="man-url" label="Link do comprovante" helpId="garantias.detalhe.manutencao-comprovante-url" />
                <input id="man-url" name="proofUrl" type="url" className={FIELD_CLASS} placeholder="https://..." />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ vistorias
export function SurveysPanel({ projectId, caseId, items, canRegister, memberNames }: { projectId: string; caseId: string; items: SurveyView[]; canRegister: boolean; memberNames: Record<string, string> }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Vistorias
            <FeatureInfo helpId="garantias.detalhe.vistoria-lista" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List empty="SEM DADOS — nenhuma vistoria registrada.">
            {items.map((s) => (
              <Row key={s.id}>
                <p className="font-medium">{formatDay(s.surveyedAt)} · {s.surveyorUserId ? (memberNames[s.surveyorUserId] ?? "usuário do projeto") : "vistoriador: SEM DADOS"}</p>
                <p>{s.findings}</p>
                <p className="text-muted-foreground">Laudo/relatório: {s.reportRef ?? <SemDados />}</p>
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registrar vistoria</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={(raw) => addSurveyAction(projectId, caseId, raw)}
            submitLabel="Registrar vistoria"
            submitHelp={<FeatureInfo helpId="garantias.detalhe.vistoria-adicionar" />}
            disabledReason={canRegister ? null : READ_ONLY_REASON}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="vis-data" label="Data da vistoria" helpId="garantias.detalhe.vistoria-data" required />
                <input id="vis-data" name="surveyedAt" type="date" required className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="vis-laudo" label="Laudo / relatório (referência)" helpId="garantias.detalhe.vistoria-laudo" />
                <input id="vis-laudo" name="reportRef" className={FIELD_CLASS} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <FieldLabel htmlFor="vis-const" label="Constatações" helpId="garantias.detalhe.vistoria-constatacoes" required />
                <textarea id="vis-const" name="findings" required minLength={3} maxLength={4000} className={cn(FIELD_CLASS, "min-h-24")} />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ reparos e reincidências
export function RepairsPanel({ projectId, caseId, items, canRegister }: { projectId: string; caseId: string; items: RepairView[]; canRegister: boolean }) {
  const recurrences = items.filter((r) => r.isRecurrence).length;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Reparos e reincidências
            <FeatureInfo helpId="garantias.detalhe.reparo-lista" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.length > 0 ? <p className="text-sm text-muted-foreground">{items.length} reparo(s); {recurrences} marcado(s) como reincidência.</p> : null}
          <List empty="SEM DADOS — nenhum reparo registrado.">
            {items.map((r) => (
              <Row key={r.id}>
                <p className="font-medium">
                  {formatDay(r.executedAt)} {r.isRecurrence ? "· REINCIDÊNCIA" : ""}
                </p>
                <p>{r.description}</p>
                <p className="text-muted-foreground">
                  executor: {r.performedBy ?? <SemDados />} · estimado: {formatMoney(r.estimatedCost)} · realizado: {formatMoney(r.actualCost)}
                </p>
                {r.previousRepairId ? <p className="text-muted-foreground">Reparo anterior: {items.find((x) => x.id === r.previousRepairId)?.description ?? r.previousRepairId}</p> : null}
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registrar reparo</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={(raw) => addRepairAction(projectId, caseId, raw)}
            submitLabel="Registrar reparo"
            submitHelp={<FeatureInfo helpId="garantias.detalhe.reparo-adicionar" />}
            disabledReason={canRegister ? null : READ_ONLY_REASON}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1 md:col-span-2">
                <FieldLabel htmlFor="rep-desc" label="Descrição do reparo" helpId="garantias.detalhe.reparo-descricao" required />
                <textarea id="rep-desc" name="description" required minLength={3} maxLength={4000} className={cn(FIELD_CLASS, "min-h-20")} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="rep-data" label="Data de execução" helpId="garantias.detalhe.reparo-data" />
                <input id="rep-data" name="executedAt" type="date" className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="rep-exec" label="Executor" helpId="garantias.detalhe.reparo-executor" />
                <input id="rep-exec" name="performedBy" className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="rep-est" label="Custo estimado (R$)" helpId="garantias.detalhe.reparo-custo-estimado" />
                <input id="rep-est" name="estimatedCost" inputMode="decimal" className={FIELD_CLASS} placeholder="Vazio = SEM DADOS" />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="rep-real" label="Custo realizado (R$)" helpId="garantias.detalhe.reparo-custo-realizado" />
                <input id="rep-real" name="actualCost" inputMode="decimal" className={FIELD_CLASS} placeholder="Vazio = SEM DADOS" />
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <input id="rep-reinc" name="isRecurrence" type="checkbox" className="size-5 accent-[var(--primary)]" />
                <label htmlFor="rep-reinc" className="text-sm text-foreground">É reincidência</label>
                <FeatureInfo helpId="garantias.detalhe.reparo-reincidencia" />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="rep-ant" label="Reparo anterior (se reincidência)" helpId="garantias.detalhe.reparo-anterior" />
                <select id="rep-ant" name="previousRepairId" defaultValue="" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
                  <option value="">Nenhum</option>
                  {items.map((r) => (
                    <option key={r.id} value={r.id}>
                      {(r.executedAt ?? "sem data").slice(0, 10)} — {r.description.slice(0, 50)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ evidências / fotografias
export function EvidencePanel({ projectId, caseId, items, complaints, canRegister }: { projectId: string; caseId: string; items: EvidenceView[]; complaints: ComplaintView[]; canRegister: boolean }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Evidências e fotografias
            <FeatureInfo helpId="garantias.detalhe.evidencia-lista" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">A fonte original (foto, e-mail, diário, relatório) NÃO é alterada: aqui ficam a referência, o link e a classificação.</p>
          <List empty="SEM DADOS — nenhuma evidência registrada.">
            {items.map((ev) => (
              <Row key={ev.id}>
                <p className="font-medium">
                  {EVIDENCE_SOURCE_LABELS[ev.sourceType] ?? ev.sourceType}: <SourceLink reference={ev.sourceRef} url={ev.sourceUrl} />
                </p>
                <p className="text-muted-foreground">
                  {CLASSIFICATION_LABELS[ev.classification] ?? ev.classification} · {EPISTEMIC_LABELS[ev.epistemic] ?? ev.epistemic} · registrada em {formatDateTime(ev.createdAt)}
                </p>
                {ev.description ? <p>{ev.description}</p> : null}
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
      {complaints.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-1">
              Reclamações vinculadas
              <FeatureInfo helpId="garantias.detalhe.reclamacoes-vinculadas" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <List empty="">
              {complaints.map((c) => (
                <Row key={c.id}>
                  <p className="font-medium">{c.code} — {c.subject}</p>
                  <p className="text-muted-foreground">
                    {c.channel} · recebida em {formatDateTime(c.receivedAt)} · fonte: <SourceLink reference={c.sourceRef} url={c.sourceUrl} />
                  </p>
                </Row>
              ))}
            </List>
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Registrar evidência</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={(raw) => addEvidenceAction(projectId, caseId, raw)}
            submitLabel="Registrar evidência"
            submitHelp={<FeatureInfo helpId="garantias.detalhe.evidencia-adicionar" />}
            disabledReason={canRegister ? null : READ_ONLY_REASON}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="evi-tipo" label="Tipo de fonte" helpId="garantias.detalhe.evidencia-tipo-fonte" required />
                <select id="evi-tipo" name="sourceType" defaultValue="DOCUMENTO" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
                  {Object.entries(EVIDENCE_SOURCE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="evi-ref" label="Referência da fonte" helpId="garantias.detalhe.evidencia-referencia" required />
                <input id="evi-ref" name="sourceRef" required maxLength={1000} className={FIELD_CLASS} placeholder="Nome do arquivo, Message-ID, página do diário..." />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="evi-url" label="Link da fonte" helpId="garantias.detalhe.evidencia-link" />
                <input id="evi-url" name="sourceUrl" type="url" className={FIELD_CLASS} placeholder="https://..." />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="evi-desc" label="Descrição" helpId="garantias.detalhe.evidencia-descricao" />
                <input id="evi-desc" name="description" className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="evi-class" label="Classificação" helpId="garantias.detalhe.evidencia-classificacao" required />
                <select id="evi-class" name="classification" defaultValue="INDICIO" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
                  {Object.entries(CLASSIFICATION_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="evi-epi" label="Fato, inferência ou recomendação" helpId="garantias.detalhe.evidencia-epistemico" required />
                <select id="evi-epi" name="epistemic" defaultValue="FATO" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
                  {Object.entries(EPISTEMIC_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ verificação de eficácia e aceite
export function VerificationPanel({
  projectId,
  warranty,
  verifications,
  evidence,
  canRegister,
  canManage,
}: {
  projectId: string;
  warranty: WarrantyCaseView;
  verifications: VerificationView[];
  evidence: EvidenceView[];
  canRegister: boolean;
  canManage: boolean;
}) {
  const verifyDisabled = !canManage ? "A verificação de eficácia exige perfil de gestão (Administrador, Gerente ou Gestor)." : warranty.state !== "REPARADA" ? "A verificação só pode ser registrada com o caso no estado Reparada." : null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Verificações de eficácia (somente inclusão)
            <FeatureInfo helpId="garantias.detalhe.verificacao-lista" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List empty="SEM DADOS — nenhuma verificação registrada.">
            {[...verifications].reverse().map((v) => (
              <Row key={v.id}>
                <p className="font-medium">{VERIFICATION_RESULT_LABELS[v.result] ?? v.result} · {formatDateTime(v.verifiedAt)}</p>
                <p>Critério: {v.criteria}</p>
                {v.notes ? <p className="text-muted-foreground">{v.notes}</p> : null}
                <p className="text-muted-foreground">Evidência: {evidence.find((e) => e.id === v.evidenceId)?.sourceRef ?? v.evidenceId}</p>
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Registrar verificação de eficácia</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={(raw) => registerVerificationAction(projectId, warranty.id, raw)}
            submitLabel="Registrar verificação"
            submitHelp={<FeatureInfo helpId="garantias.detalhe.verificacao-registrar" />}
            disabledReason={verifyDisabled}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="ver-res" label="Resultado" helpId="garantias.detalhe.verificacao-resultado" required />
                <select id="ver-res" name="result" defaultValue="EFICAZ" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
                  {Object.entries(VERIFICATION_RESULT_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ver-evi" label="Evidência da verificação" helpId="garantias.detalhe.verificacao-evidencia" required />
                <select id="ver-evi" name="evidenceId" required defaultValue="" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
                  <option value="" disabled>
                    Selecione uma evidência do caso
                  </option>
                  {evidence.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.sourceRef}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <FieldLabel htmlFor="ver-crit" label="Critério da verificação" helpId="garantias.detalhe.verificacao-criterio" required />
                <textarea id="ver-crit" name="criteria" required minLength={5} maxLength={2000} className={cn(FIELD_CLASS, "min-h-20")} />
              </div>
              <div className="space-y-1 md:col-span-2">
                <FieldLabel htmlFor="ver-obs" label="Observações" helpId="garantias.detalhe.verificacao-observacoes" />
                <input id="ver-obs" name="notes" className={FIELD_CLASS} />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Aceite do cliente
            <FeatureInfo helpId="garantias.detalhe.aceite-situacao" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-foreground" data-testid="aceite-status">
            {warranty.acceptedAt ? (
              <>Aceito em {formatDay(warranty.acceptedAt)} por {warranty.acceptedByName ?? <SemDados />}.</>
            ) : (
              <>Aceite: <span className="font-semibold">SEM DADOS</span> — necessário para encerrar o caso.</>
            )}
          </p>
          <ActionForm
            action={(raw) => registerAcceptanceAction(projectId, warranty.id, warranty.rowVersion, raw)}
            submitLabel="Registrar aceite"
            submitHelp={<FeatureInfo helpId="garantias.detalhe.aceite-registrar" />}
            conflictHelp={<FeatureInfo helpId="garantias.detalhe.conflito-versao" />}
            disabledReason={canRegister ? null : READ_ONLY_REASON}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <FieldLabel htmlFor="ace-data" label="Data do aceite" helpId="garantias.detalhe.aceite-data" required />
                <input id="ace-data" name="acceptedAt" type="date" required defaultValue={warranty.acceptedAt?.slice(0, 10) ?? ""} className={FIELD_CLASS} />
              </div>
              <div className="space-y-1">
                <FieldLabel htmlFor="ace-nome" label="Quem aceitou (nome)" helpId="garantias.detalhe.aceite-nome" required />
                <input id="ace-nome" name="acceptedByName" required minLength={2} maxLength={200} defaultValue={warranty.acceptedByName ?? ""} className={FIELD_CLASS} />
              </div>
            </div>
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ custos e consequências
export function CostsPanel({
  warranty,
  repairs,
  costs,
  consequences,
}: {
  warranty: WarrantyCaseView;
  repairs: RepairView[];
  costs: NonQualityCostView[];
  consequences: ConsequenceView[];
}) {
  const repairsActual = repairs.filter((r) => r.actualCost !== null);
  const repairsSum = repairsActual.length > 0 ? repairsActual.reduce((s, r) => s + (r.actualCost ?? 0), 0) : null;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Custo estimado do caso <FeatureInfo helpId="garantias.detalhe.kpi-custo-estimado" />
            </p>
            <p className="text-xl font-bold text-foreground" data-testid="kpi-custo-estimado">{formatMoney(warranty.estimatedCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Custo realizado do caso <FeatureInfo helpId="garantias.detalhe.kpi-custo-realizado" />
            </p>
            <p className="text-xl font-bold text-foreground" data-testid="kpi-custo-realizado">{formatMoney(warranty.actualCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 p-4">
            <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              Custo informado nos reparos <FeatureInfo helpId="garantias.detalhe.kpi-custo-reparos" />
            </p>
            <p className="text-xl font-bold text-foreground" data-testid="kpi-custo-reparos">{formatMoney(repairsSum)}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Consequências por pilar (criticidade: {CRITICALITY_LABELS[warranty.criticality]})
            <FeatureInfo helpId="garantias.detalhe.consequencias-lista" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List empty="SEM DADOS — nenhuma consequência registrada (criticidade SEM DADOS, nunca baixa por omissão).">
            {consequences.map((c) => (
              <Row key={c.id}>
                <p className="font-medium">{c.pillar} · severidade {c.severity} · {c.status}</p>
                {c.description ? <p>{c.description}</p> : null}
                <p className="text-muted-foreground">
                  Probabilidade: {c.probability ? `${c.probability} (fundamento: ${c.probabilityBasis})` : "SEM DADOS"} · fonte: {c.sourceRef}
                </p>
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Custos de não qualidade vinculados
            <FeatureInfo helpId="garantias.detalhe.custos-nao-qualidade" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <List empty="SEM DADOS — nenhum custo de não qualidade vinculado.">
            {costs.map((c) => (
              <Row key={c.id}>
                <p className="font-medium">{c.category}{c.description ? ` — ${c.description}` : ""}</p>
                <p className="text-muted-foreground">
                  estimado: {formatMoney(c.estimatedAmount)} · realizado: {formatMoney(c.actualAmount)} · fonte: {c.sourceRef ?? "SEM FONTE"}
                </p>
              </Row>
            ))}
          </List>
        </CardContent>
      </Card>
    </div>
  );
}
