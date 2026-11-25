import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";
import { PageHeader } from "@/components/layout/page-header";
import { SegurosWorkspace } from "@/components/insurance/seguros-workspace";
import { FeatureInfo } from "@/components/shared/feature-info";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getProject } from "@/lib/data";
import { loadInsuranceWorkspace } from "@/lib/insurance-ui/data";
import { loadPersistedSupport } from "@/lib/insurance-ui/persistence-data";
import { insuranceCapabilities } from "@/lib/insurance-ui/permissions";

export const metadata: Metadata = { title: "Seguros" };

export default async function SegurosPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [project, permission] = await Promise.all([getProject(projectId), getCurrentProjectPermission(projectId)]);
  if (!project) notFound();
  // Sem membership ativa: fail-closed (a RLS também devolveria zero linhas).
  if (!permission) notFound();
  const now = new Date();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const supabase = await createSupabaseServerClient();
  const [load, persisted] = await Promise.all([loadInsuranceWorkspace(supabase, projectId, today), loadPersistedSupport(supabase, projectId)]);
  const { data: authData } = await supabase.auth.getUser();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Seguros, fianças e sinistros"
        description="Apólices, fianças e garantias, endossos, adiantamentos, sinistros, dossiês e minutas. Tudo com fonte rastreável; nada é enviado por este sistema."
        actions={<FeatureInfo helpId="seguros.pagina.visao-geral" />}
      />
      <SegurosWorkspace projectId={projectId} load={load} caps={insuranceCapabilities(permission)} today={today} nowIso={now.toISOString()} persisted={persisted} currentUserId={authData.user?.id ?? null} />
    </div>
  );
}
