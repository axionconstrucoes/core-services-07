import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPillarsDashboard } from "@/lib/pilares/data";
import {
  NO_DATA_LABEL,
  PILLAR_LABELS,
  SEVERITY_LABELS,
  type PillarKpi,
  type PillarsPanel,
} from "@/lib/pilares/model";
import { PILLARS, type Severity } from "@/lib/quality/types";

export const metadata: Metadata = { title: "Quatro Pilares" };

const SEVERITY_VARIANT: Record<Severity, "destructive" | "warning" | "info" | "success"> = {
  CRITICAL: "destructive",
  HIGH: "warning",
  MEDIUM: "info",
  LOW: "success",
};

const TONE_CLASS: Record<PillarKpi["tone"], string> = {
  critical: "text-destructive",
  attention: "text-amber-800",
  neutral: "text-card-foreground",
  nodata: "text-muted-foreground",
};

function SeverityBadge({ severity }: { severity: Severity | null }) {
  if (!severity) return <Badge variant="outline">{NO_DATA_LABEL}</Badge>;
  return <Badge variant={SEVERITY_VARIANT[severity]}>{SEVERITY_LABELS[severity]}</Badge>;
}

function KpiCard({ projectId, kpi }: { projectId: string; kpi: PillarKpi }) {
  return (
    <div className="flex min-h-[112px] flex-col gap-1 rounded-md border border-border bg-secondary p-3 text-secondary-foreground" data-testid={`kpi-${kpi.id}`}>
      <div className="flex items-start gap-1 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">{kpi.label}</span>
        <FeatureInfo helpId={kpi.helpId} className="shrink-0" />
      </div>
      <div className={`text-2xl font-semibold leading-tight ${TONE_CLASS[kpi.tone]}`} data-testid={`kpi-value-${kpi.id}`}>
        {kpi.display}
      </div>
      {kpi.detail ? <p className="text-xs text-muted-foreground">{kpi.detail}</p> : null}
      <p className="mt-auto text-[11px] leading-tight text-muted-foreground">Fonte: {kpi.source}</p>
      {kpi.href ? (
        <Link href={`/${projectId}/${kpi.href}`} className="inline-flex min-h-11 items-center text-xs font-medium text-foreground underline underline-offset-2 hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring">
          Ver origem
        </Link>
      ) : null}
    </div>
  );
}

function Panel({ projectId, panel }: { projectId: string; panel: PillarsPanel }) {
  return (
    <Card data-testid={`painel-${panel.id}`}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{panel.title}</span>
          <FeatureInfo helpId={panel.helpId} />
          {panel.id !== "JURIDICO_SEGUROS" ? <SeverityBadge severity={panel.worstSeverity} /> : null}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {panel.kpis.map((kpi) => (
            <KpiCard key={kpi.id} projectId={projectId} kpi={kpi} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function PilaresPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { dashboard, today } = await getPillarsDashboard(projectId);
  const { criticality, panels, topConsequences, consequencesTotal } = dashboard;
  const overall = criticality.criticality;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Quatro Pilares"
        description="PRAZO, CUSTO, SEGURANÇA e QUALIDADE, mais Jurídico/Seguros. Dados reais do projeto; sem dado, SEM DADOS (nunca zero)."
        actions={<FeatureInfo helpId="pilares.pagina.pagina" />}
      />

      <Card data-testid="criticidade-geral">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>Criticidade (pior pilar domina)</span>
            <FeatureInfo helpId="pilares.pagina.criticidade-geral" />
            {overall === "SEM_DADOS" ? <Badge variant="outline">{NO_DATA_LABEL}</Badge> : <SeverityBadge severity={overall} />}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {PILLARS.map((pillar) => (
              <li key={pillar} className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary p-3 text-secondary-foreground" data-testid={`pilar-${pillar}`}>
                <span className="flex items-center gap-1 text-sm">
                  {PILLAR_LABELS[pillar]}
                  <FeatureInfo helpId="pilares.pagina.severidade-pilar" />
                </span>
                <SeverityBadge severity={criticality.byPillar[pillar]} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {overall === "SEM_DADOS"
              ? "Nenhuma consequência aberta registrada por pilar: a criticidade não é presumida baixa."
              : `Pilar(es) dominante(s): ${criticality.dominantPillars.map((p) => PILLAR_LABELS[p]).join(", ")}. A criticidade nunca é média entre pilares.`}
            {criticality.pillarsWithoutData.length > 0 && overall !== "SEM_DADOS" ? ` Sem consequência registrada em: ${criticality.pillarsWithoutData.map((p) => PILLAR_LABELS[p]).join(", ")} (${NO_DATA_LABEL}).` : ""}
            {` Posição em ${today.split("-").reverse().join("/")}.`}
          </p>
        </CardContent>
      </Card>

      {panels.map((panel) => (
        <Panel key={panel.id} projectId={projectId} panel={panel} />
      ))}

      <Card data-testid="consequencias-criticas">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span>Consequências abertas ALTO/CRÍTICO, com a fonte</span>
            <FeatureInfo helpId="pilares.consequencias.tabela" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {consequencesTotal === null || consequencesTotal === 0 ? (
            <p className="text-sm text-muted-foreground">{NO_DATA_LABEL}: nenhuma consequência por pilar registrada na Qualidade deste projeto.</p>
          ) : topConsequences.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma consequência aberta ALTO ou CRÍTICO ({consequencesTotal} registrada(s) no total).</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="p-2">Pilar</th>
                    <th scope="col" className="p-2">
                      <span className="inline-flex items-center gap-1">Severidade <FeatureInfo helpId="pilares.consequencias.col-severidade" /></span>
                    </th>
                    <th scope="col" className="p-2">Origem</th>
                    <th scope="col" className="p-2">Descrição</th>
                    <th scope="col" className="p-2">
                      <span className="inline-flex items-center gap-1">Fonte <FeatureInfo helpId="pilares.consequencias.col-fonte" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topConsequences.map((c) => (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="p-2">{PILLAR_LABELS[c.pillar]}</td>
                      <td className="p-2"><SeverityBadge severity={c.severity} /></td>
                      <td className="p-2">
                        <Link
                          href={`/${projectId}/${c.entity.type === "NCR" ? "qualidade" : "garantias"}`}
                          className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-muted-foreground"
                        >
                          {c.entity.type === "NCR" ? "RNC" : "Garantia"} {c.entity.code ?? ""}
                        </Link>
                      </td>
                      <td className="p-2">{c.description ?? NO_DATA_LABEL}</td>
                      <td className="p-2 break-words text-muted-foreground">{c.sourceRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
