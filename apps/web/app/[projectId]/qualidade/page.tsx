import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@axion/db/server";
import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { QUALITY_TABS, parseTab } from "@/lib/quality/ui-model";
import type { QualityDb } from "@/lib/quality/ui-queries";
import {
  ActionsSection,
  AuditSection,
  ComplaintSection,
  CostSection,
  DashboardSection,
  EffectivenessSection,
  EvidenceSection,
  InspectionSection,
  RecurrenceSection,
  RequirementSection,
  RncSection,
  TestSection,
  type SectionProps,
} from "@/components/quality/sections";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Qualidade" };

const SECTIONS = {
  dashboard: DashboardSection,
  rnc: RncSection,
  evidencias: EvidenceSection,
  inspecoes: InspectionSection,
  reclamacoes: ComplaintSection,
  ensaios: TestSection,
  requisitos: RequirementSection,
  capa: ActionsSection,
  eficacia: EffectivenessSection,
  recorrencias: RecurrenceSection,
  custos: CostSection,
  auditoria: AuditSection,
} as const;

export default async function QualidadePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { projectId } = await params;
  const raw = await searchParams;
  const sp: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(raw)) sp[k] = Array.isArray(v) ? v[0] : v;
  const tab = parseTab(sp.aba);
  const supabase = await createSupabaseServerClient();
  const role = await getCurrentProjectPermission(projectId);
  const Section = SECTIONS[tab];
  const props: SectionProps = { projectId, role, db: supabase as unknown as QualityDb, sp };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Qualidade"
        description="Não conformidades, evidências, inspeções, reclamações, ensaios, ações corretivas e custos de não qualidade."
        actions={<FeatureInfo helpId="qualidade.pagina.visao-geral" />}
      />
      <nav aria-label="Áreas da Qualidade" className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
        {QUALITY_TABS.map((t) => (
          <span key={t.key} className="inline-flex items-center">
            <Link
              href={`/${projectId}/qualidade?aba=${t.key}`}
              aria-current={t.key === tab ? "page" : undefined}
              className={cn(
                "inline-flex items-center rounded-sm px-3 py-1 text-sm font-medium max-md:min-h-11 pointer-coarse:min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                t.key === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {t.label}
            </Link>
            <FeatureInfo helpId={t.helpId} />
          </span>
        ))}
      </nav>
      <Section {...props} />
    </div>
  );
}
