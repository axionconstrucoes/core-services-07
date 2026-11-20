"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent } from "@/components/ui/card";
import { SELECT_CLASS } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createWarrantyCaseAction } from "@/app/[projectId]/garantias/actions";
import { emptyCoverageForm, type CoverageFormState } from "@/lib/garantias/coverage-form";
import { CRITICALITY_LABELS, WARRANTY_OPEN_STATES, WARRANTY_STATE_LABELS, warrantyStateLabel } from "@/lib/garantias/labels";
import { summarizeCases } from "@/lib/garantias/summary";
import type { WarrantyCaseView } from "@/lib/garantias/types";
import { cn } from "@/lib/utils";
import { ActionForm } from "./action-form";
import { CaseFields, type MemberOption } from "./case-fields";
import { CoveragePanel } from "./coverage-panel";
import { ReferencesPanel } from "./references-panel";
import { BUTTON_OUTLINE_CLASS, CriticalityBadge, FIELD_CLASS, Notice, SemDados, StateBadge, formatDay } from "./ui-bits";

function Kpi({ label, helpId, value, testId }: { label: string; helpId: string; value: string; testId: string }) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {label}
          <FeatureInfo helpId={helpId} />
        </p>
        <p className="text-2xl font-bold text-foreground" data-testid={testId}>
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function TabItem({ value, label, children }: { value: string; label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center">
      {/* help-exempt: gatilho de aba genérico; cada aba tem o (i) próprio ao lado, em garantias.casos.aba-* renderizados no componente pai */}
      <TabsTrigger value={value} className="min-h-11">
        {label}
      </TabsTrigger>
      {children}
    </span>
  );
}

export function GarantiasHome({
  projectId,
  cases,
  available,
  error,
  members,
  canRegister,
  today,
}: {
  projectId: string;
  cases: WarrantyCaseView[];
  available: boolean;
  error: string | null;
  members: MemberOption[];
  canRegister: boolean;
  today: string;
}) {
  const [stateFilter, setStateFilter] = useState("");
  const [critFilter, setCritFilter] = useState("");
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [coverage, setCoverage] = useState<CoverageFormState>(() => emptyCoverageForm());
  const summary = useMemo(() => summarizeCases(cases, today), [cases, today]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cases.filter(
      (c) =>
        (!stateFilter || c.state === stateFilter) &&
        (!critFilter || c.criticality === critFilter) &&
        (!q || `${c.code} ${c.serviceSystem} ${c.defectDescription}`.toLowerCase().includes(q)),
    );
  }, [cases, stateFilter, critFilter, query]);

  return (
    <Tabs defaultValue="casos">
      <TabsList className="flex h-auto w-full flex-wrap items-center gap-1 bg-transparent p-0" aria-label="Seções de garantias">
        <TabItem value="casos" label="Casos">
          <FeatureInfo helpId="garantias.casos.aba-casos" />
        </TabItem>
        <TabItem value="cobertura" label="Consulta de cobertura">
          <FeatureInfo helpId="garantias.casos.aba-cobertura" />
        </TabItem>
        <TabItem value="referencias" label="Referências">
          <FeatureInfo helpId="garantias.casos.aba-referencias" />
        </TabItem>
      </TabsList>

      <TabsContent value="casos" className="space-y-4">
        {!available ? <Notice tone="warning">O módulo de garantias ainda não está disponível neste ambiente (migrations de Qualidade/Garantias pendentes). SEM DADOS.</Notice> : null}
        {error ? <Notice tone="error" role="alert">{error}</Notice> : null}

        <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Casos" helpId="garantias.casos.kpi-total" value={summary.total === null ? "SEM DADOS" : String(summary.total)} testId="kpi-total" />
          <Kpi label="Em aberto" helpId="garantias.casos.kpi-abertos" value={summary.open === null ? "SEM DADOS" : String(summary.open)} testId="kpi-abertos" />
          <Kpi label="Com reabertura" helpId="garantias.casos.kpi-reabertos" value={summary.reopened === null ? "SEM DADOS" : String(summary.reopened)} testId="kpi-reabertos" />
          <Kpi label="Prazo vencido" helpId="garantias.casos.kpi-vencidos" value={summary.overdue === null ? "SEM DADOS" : String(summary.overdue)} testId="kpi-vencidos" />
          <Kpi label="Criticidade alta/crítica" helpId="garantias.casos.kpi-criticos" value={summary.highCritical === null ? "SEM DADOS" : String(summary.highCritical)} testId="kpi-criticos" />
        </section>

        <div className="flex flex-wrap items-center gap-2">
          {canRegister ? (
            <>
              <button type="button" className={BUTTON_OUTLINE_CLASS} aria-expanded={showForm} onClick={() => setShowForm((v) => !v)}>
                {showForm ? "Fechar formulário" : "Novo caso de garantia"}
              </button>
              <FeatureInfo helpId="garantias.casos.novo-caso" />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Perfil somente consulta (LEITURA): não é possível abrir casos.</p>
          )}
        </div>

        {showForm && canRegister ? (
          <Card>
            <CardContent className="p-4">
              <ActionForm
                action={(raw) => createWarrantyCaseAction(projectId, raw)}
                submitLabel="Abrir caso"
                submitHelp={<FeatureInfo helpId="garantias.caso.salvar" />}
                successMessage="Caso aberto (ou já existente para esta origem: duplicidade evitada)."
              >
                <CaseFields idPrefix="novo" mode="create" members={members} />
              </ActionForm>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <label htmlFor="f-estado">Estado</label>
              <FeatureInfo helpId="garantias.casos.filtro-estado" />
            </span>
            <select id="f-estado" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className={cn(SELECT_CLASS, "min-h-11 w-full")}>
              <option value="">Todos</option>
              {Object.entries(WARRANTY_STATE_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <label htmlFor="f-crit">Criticidade</label>
              <FeatureInfo helpId="garantias.casos.filtro-criticidade" />
            </span>
            <select id="f-crit" value={critFilter} onChange={(e) => setCritFilter(e.target.value)} className={cn(SELECT_CLASS, "min-h-11 w-full")}>
              <option value="">Todas</option>
              {Object.entries(CRITICALITY_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <label htmlFor="f-busca">Busca</label>
              <FeatureInfo helpId="garantias.casos.filtro-busca" />
            </span>
            <input id="f-busca" value={query} onChange={(e) => setQuery(e.target.value)} className={FIELD_CLASS} placeholder="Código, serviço ou defeito" />
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-left text-sm text-foreground">
            <caption className="sr-only">Casos de garantia e assistência técnica</caption>
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">Caso <FeatureInfo helpId="garantias.casos.tabela" /></span>
                </th>
                {/* help-exempt: coluna Serviço / sistema descrita pela tabela de casos em garantias.casos.tabela (cabeçalho Caso) e pelo campo garantias.caso.servico */}
                <th scope="col" className="px-3 py-2">Serviço / sistema</th>
                <th scope="col" className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">Estado <FeatureInfo helpId="garantias.casos.coluna-estado" /></span>
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">Criticidade <FeatureInfo helpId="garantias.casos.coluna-criticidade" /></span>
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">Prazo <FeatureInfo helpId="garantias.casos.coluna-prazo" /></span>
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="inline-flex items-center gap-1">Reaberturas <FeatureInfo helpId="garantias.casos.coluna-reaberturas" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-muted-foreground">
                    SEM DADOS — {cases.length === 0 ? "nenhum caso de garantia registrado neste projeto." : "nenhum caso corresponde aos filtros."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <Link href={`/${projectId}/garantias/${c.id}`} className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {c.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{c.serviceSystem}</td>
                    <td className="px-3 py-2">
                      <StateBadge state={c.state} />
                    </td>
                    <td className="px-3 py-2">
                      <CriticalityBadge criticality={c.criticality} />
                    </td>
                    <td className="px-3 py-2">{c.dueDate ? formatDay(c.dueDate) : <SemDados />}</td>
                    <td className="px-3 py-2">{c.reopenCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Estados em aberto: {WARRANTY_OPEN_STATES.map(warrantyStateLabel).join(", ")}.
        </p>
      </TabsContent>

      <TabsContent value="cobertura">
        <CoveragePanel form={coverage} onChange={setCoverage} />
      </TabsContent>

      <TabsContent value="referencias">
        <ReferencesPanel />
      </TabsContent>
    </Tabs>
  );
}
