import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { CaseDetail } from "@/components/garantias/case-detail";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getProject, getProjectMembers } from "@/lib/data";
import { isUuid } from "@/lib/garantias/action-logic";
import { getWarrantyDetail } from "@/lib/garantias/data";
import { roleSatisfies } from "@/lib/quality/state-machine";

export const metadata: Metadata = { title: "Caso de garantia" };

export default async function GarantiaCasePage({ params }: { params: Promise<{ projectId: string; caseId: string }> }) {
  const { projectId, caseId } = await params;
  if (!isUuid(caseId)) notFound();
  const project = await getProject(projectId);
  if (!project) notFound();
  // Caso de OUTRO projeto (ou inexistente) => 404: a consulta filtra por project_id e a RLS não devolve a linha.
  const detail = await getWarrantyDetail(projectId, caseId);
  if (!detail) notFound();
  const [role, members] = await Promise.all([getCurrentProjectPermission(projectId), getProjectMembers(projectId)]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <PageHeader title={`Garantia ${detail.warranty.code}`} description={`${detail.warranty.serviceSystem} — ciclo de estados, registros e consulta de cobertura do caso.`} />
        </div>
        <FeatureInfo helpId="garantias.detalhe.pagina" className="mt-1.5" />
      </div>
      <CaseDetail
        projectId={projectId}
        detail={detail}
        members={members.map((m) => ({ userId: m.userId, name: m.user.name }))}
        canRegister={roleSatisfies(role, "REGISTER")}
        canManage={roleSatisfies(role, "MANAGE")}
        today={today}
      />
    </div>
  );
}
