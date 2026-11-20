import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { GarantiasHome } from "@/components/garantias/garantias-home";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getProject, getProjectMembers } from "@/lib/data";
import { listWarrantyCases } from "@/lib/garantias/data";
import { roleSatisfies } from "@/lib/quality/state-machine";

export const metadata: Metadata = { title: "Garantias e Assistência Técnica" };

export default async function GarantiasPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();
  const [role, list, members] = await Promise.all([getCurrentProjectPermission(projectId), listWarrantyCases(projectId), getProjectMembers(projectId)]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PageHeader
            title="Garantias e Assistência Técnica"
            description="Casos pós-entrega, ciclo de estados, comprovantes de manutenção e consulta de cobertura (apoio à decisão humana; não é parecer jurídico)."
          />
        </div>
        <FeatureInfo helpId="garantias.casos.pagina" className="mt-1.5" />
      </div>
      <GarantiasHome
        projectId={projectId}
        cases={list.cases}
        available={list.available}
        error={list.error}
        members={members.map((m) => ({ userId: m.userId, name: m.user.name }))}
        canRegister={roleSatisfies(role, "REGISTER")}
        today={today}
      />
    </div>
  );
}
