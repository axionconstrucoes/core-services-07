"use client";

import Link from "next/link";
import { useState } from "react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { updateWarrantyCaseAction } from "@/app/[projectId]/garantias/actions";
import { prefillCoverageForm, type CoverageFormState } from "@/lib/garantias/coverage-form";
import { CAUSE_CATEGORY_LABELS, MAINTENANCE_STATUS_LABELS, ORIGIN_LABELS } from "@/lib/garantias/labels";
import type { WarrantyDetail } from "@/lib/garantias/data";
import { ActionForm } from "./action-form";
import { CaseFields, type MemberOption } from "./case-fields";
import { CoveragePanel } from "./coverage-panel";
import { CostsPanel, EvidencePanel, MaintenancePanel, RepairsPanel, SurveysPanel, VerificationPanel } from "./records-panels";
import { TransitionPanel } from "./transition-panel";
import { CriticalityBadge, Notice, SemDados, SourceLink, StateBadge, formatDay, formatMoney } from "./ui-bits";

// Detalhe do caso de garantia. Cada aba é uma visão sobre as tabelas quality_warranty_* (leitura sob RLS); toda escrita passa
// pelas Server Actions (RPC ou INSERT/UPDATE sob RLS). Nenhuma aba envia comunicação a terceiros.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function TabItem({ value, label, children }: { value: string; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center">
      <TabsTrigger value={value} className="min-h-11">
        {label}
      </TabsTrigger>
      {children}
    </span>
  );
}

export function CaseDetail({
  projectId,
  detail,
  members,
  canRegister,
  canManage,
  today,
}: {
  projectId: string;
  detail: WarrantyDetail;
  members: MemberOption[];
  canRegister: boolean;
  canManage: boolean;
  today: string;
}) {
  const { warranty } = detail;
  const memberNames = Object.fromEntries(members.map((m) => [m.userId, m.name]));
  const [coverage, setCoverage] = useState<CoverageFormState>(() => prefillCoverageForm(warranty, detail.maintenanceStatus));

  const hints: string[] = [];
  const untilHint = (label: string, until: string | null) => {
    if (until) hints.push(`${label}: até ${until.split("-").reverse().join("/")} (${until >= today ? "ainda não passou" : "já passou"} em relação a hoje; só um fato — o enquadramento é do responsável humano).`);
  };
  untilHint("Garantia da construtora registrada no caso", warranty.builderWarrantyUntil);
  untilHint("Garantia do fornecedor registrada no caso", warranty.supplierWarrantyUntil);
  if (warranty.solidityAndSafety) hints.push("O caso está marcado como envolvendo solidez e segurança.");
  if (warranty.hiddenDefect) hints.push("O caso está marcado com indício de vício oculto.");

  const maintenanceFact = detail.maintenanceStatus ? `Comprovantes de manutenção: ${MAINTENANCE_STATUS_LABELS[detail.maintenanceStatus.status]}.` : null;

  return (
    <div className="space-y-4">
      <Tabs defaultValue="resumo">
        <TabsList className="flex h-auto w-full flex-wrap items-center gap-1 bg-transparent p-0" aria-label="Seções do caso">
          <TabItem value="resumo" label="Resumo">
            <FeatureInfo helpId="garantias.detalhe.aba-resumo" />
          </TabItem>
          <TabItem value="estados" label="Ciclo de estados">
            <FeatureInfo helpId="garantias.detalhe.aba-estados" />
          </TabItem>
          <TabItem value="manutencao" label="Manutenção">
            <FeatureInfo helpId="garantias.detalhe.aba-manutencao" />
          </TabItem>
          <TabItem value="vistorias" label="Vistorias">
            <FeatureInfo helpId="garantias.detalhe.aba-vistorias" />
          </TabItem>
          <TabItem value="reparos" label="Reparos e reincidências">
            <FeatureInfo helpId="garantias.detalhe.aba-reparos" />
          </TabItem>
          <TabItem value="evidencias" label="Evidências e fotos">
            <FeatureInfo helpId="garantias.detalhe.aba-evidencias" />
          </TabItem>
          <TabItem value="verificacao" label="Verificação e aceite">
            <FeatureInfo helpId="garantias.detalhe.aba-verificacao" />
          </TabItem>
          <TabItem value="custos" label="Custos e consequências">
            <FeatureInfo helpId="garantias.detalhe.aba-custos" />
          </TabItem>
          <TabItem value="cobertura" label="Cobertura">
            <FeatureInfo helpId="garantias.detalhe.aba-cobertura" />
          </TabItem>
        </TabsList>

        <TabsContent value="resumo" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Dados do caso {warranty.code}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 md:grid-cols-3">
                <Field label="Estado">
                  <span className="inline-flex items-center gap-1">
                    <StateBadge state={warranty.state} />
                    <FeatureInfo helpId="garantias.detalhe.estado-atual" />
                  </span>
                </Field>
                <Field label="Criticidade (pior pilar domina)">
                  <span className="inline-flex items-center gap-1">
                    <CriticalityBadge criticality={warranty.criticality} />
                    <FeatureInfo helpId="garantias.detalhe.criticidade" />
                  </span>
                </Field>
                <Field label="Reaberturas">
                  <span className="inline-flex items-center gap-1">
                    {warranty.reopenCount}
                    <FeatureInfo helpId="garantias.detalhe.reaberturas" />
                  </span>
                </Field>
                <Field label="Serviço / sistema">{warranty.serviceSystem}</Field>
                <Field label="Obra / contrato">{warranty.contractRef ?? <SemDados />}</Field>
                <Field label="Responsável">{warranty.responsibleUserId ? (memberNames[warranty.responsibleUserId] ?? "usuário do projeto") : <SemDados />}</Field>
                <Field label="Data de entrega">{formatDay(warranty.deliveredAt)}</Field>
                <Field label="Data de descoberta">{formatDay(warranty.discoveredAt)}</Field>
                <Field label="Data da comunicação">{formatDay(warranty.communicatedAt)}</Field>
                <Field label="Prazo">{formatDay(warranty.dueDate)}</Field>
                <Field label="Fornecedor">{warranty.supplierName ?? <SemDados />}</Field>
                <Field label="Garantia do fornecedor até">{formatDay(warranty.supplierWarrantyUntil)}</Field>
                <Field label="Garantia da construtora até">{formatDay(warranty.builderWarrantyUntil)}</Field>
                <Field label="Custo estimado">{formatMoney(warranty.estimatedCost)}</Field>
                <Field label="Custo realizado">{formatMoney(warranty.actualCost)}</Field>
                <Field label="Causa">{CAUSE_CATEGORY_LABELS[warranty.causeCategory] ?? warranty.causeCategory}</Field>
                <div className="md:col-span-3">
                  <Field label="Defeito">{warranty.defectDescription}</Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Reclamação do cliente">{warranty.customerComplaint ?? <SemDados />}</Field>
                </div>
                <div className="md:col-span-3">
                  <Field label="Termos de garantia">
                    {warranty.warrantyTerms ?? <SemDados />}
                    {warranty.warrantyTermsRef ? (
                      <span className="block text-muted-foreground">
                        Documento: <SourceLink reference={warranty.warrantyTermsRef} />
                      </span>
                    ) : null}
                  </Field>
                </div>
              </dl>
              <div className="mt-3 flex items-start gap-1 text-sm text-foreground" data-testid="origem-rastreabilidade">
                <p className="flex-1">
                  Origem rastreável: <span className="font-medium">{ORIGIN_LABELS[warranty.originType] ?? warranty.originType}</span> —{" "}
                  {warranty.originRef ? <SourceLink reference={warranty.originRef} /> : <SemDados />}
                  {detail.linkedNcr ? <span> · RNC vinculada: {detail.linkedNcr.code} ({detail.linkedNcr.state})</span> : null}
                </p>
                <FeatureInfo helpId="garantias.detalhe.origem-rastreabilidade" />
              </div>
              {warranty.solidityAndSafety ? <Notice tone="warning" className="mt-3">Caso marcado como solidez e segurança: regime próprio; encaminhe ao responsável humano (veja a aba Cobertura).</Notice> : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Editar dados do caso</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Estado, versão e criticidade NÃO são editáveis aqui: mudam só pelo ciclo de estados e pelas consequências. Se outra pessoa alterar o caso antes de você, nada é gravado e você será avisado.
              </p>
              <ActionForm
                key={warranty.rowVersion}
                action={(raw) => updateWarrantyCaseAction(projectId, warranty.id, warranty.rowVersion, raw)}
                submitLabel="Salvar alterações"
                submitHelp={<FeatureInfo helpId="garantias.detalhe.salvar-edicao" />}
                conflictHelp={<FeatureInfo helpId="garantias.detalhe.conflito-versao" />}
                disabledReason={canRegister ? null : "Seu perfil neste projeto é somente consulta (LEITURA): não é possível editar."}
                resetOnSuccess={false}
                successMessage="Alterações gravadas."
              >
                <CaseFields idPrefix="edit" mode="edit" defaults={warranty} members={members} />
              </ActionForm>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estados">
          <TransitionPanel
            projectId={projectId}
            caseId={warranty.id}
            state={warranty.state}
            rowVersion={warranty.rowVersion}
            transitions={detail.transitions}
            blockersByTarget={detail.blockersByTarget}
            readiness={detail.readiness}
            evidence={detail.evidence}
            events={detail.events}
            memberNames={memberNames}
            canRegister={canRegister}
            canManage={canManage}
          />
        </TabsContent>

        <TabsContent value="manutencao">
          <MaintenancePanel projectId={projectId} caseId={warranty.id} items={detail.maintenance} status={detail.maintenanceStatus} canRegister={canRegister} />
        </TabsContent>

        <TabsContent value="vistorias">
          <SurveysPanel projectId={projectId} caseId={warranty.id} items={detail.surveys} canRegister={canRegister} memberNames={memberNames} />
        </TabsContent>

        <TabsContent value="reparos">
          <RepairsPanel projectId={projectId} caseId={warranty.id} items={detail.repairs} canRegister={canRegister} />
        </TabsContent>

        <TabsContent value="evidencias">
          <EvidencePanel projectId={projectId} caseId={warranty.id} items={detail.evidence} complaints={detail.complaints} canRegister={canRegister} />
        </TabsContent>

        <TabsContent value="verificacao">
          <VerificationPanel projectId={projectId} warranty={warranty} verifications={detail.verifications} evidence={detail.evidence} canRegister={canRegister} canManage={canManage} />
        </TabsContent>

        <TabsContent value="custos">
          <CostsPanel warranty={warranty} repairs={detail.repairs} costs={detail.costs} consequences={detail.consequences} />
        </TabsContent>

        <TabsContent value="cobertura">
          <CoveragePanel
            form={coverage}
            onChange={setCoverage}
            caseCode={warranty.code}
            solidityAndSafety={warranty.solidityAndSafety}
            prefillAvailable
            onPrefill={() => setCoverage(prefillCoverageForm(warranty, detail.maintenanceStatus))}
            maintenanceFact={maintenanceFact}
            hints={hints}
          />
          <p className="mt-3 text-xs text-muted-foreground">Esta consulta não é gravada: serve de apoio à decisão do responsável humano. Para limpar tudo use &quot;Limpar formulário&quot;.</p>
        </TabsContent>
      </Tabs>
      <Link href={`/${projectId}/garantias`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Voltar à lista de garantias
      </Link>
    </div>
  );
}
