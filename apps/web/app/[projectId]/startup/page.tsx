import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";
import { NewProjectStartupChecklist } from "@/components/startup/new-project-startup-checklist";
import { PageHeader } from "@/components/layout/page-header";
import { buttonVariants } from "@/components/ui/button";
import { getProjectMembers } from "@/lib/data";

export const metadata: Metadata = { title: "Start-up ACC" };

export default async function StartupPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createSupabaseServerClient();
  const [{ data: authData }, members] = await Promise.all([
    supabase.auth.getUser(),
    getProjectMembers(projectId),
  ]);
  const currentMembership = members.find(
    (member) => member.userId === authData.user?.id && member.status === "ACTIVE"
  );
  if (!currentMembership || currentMembership.permission !== "ADMINISTRADOR") notFound();

  // Esta tela é exclusivamente o roteiro de implantação. A retirada dos
  // controles históricos é visual: nenhum dado ou decisão gravada é removido.
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Start-up ACC"
        description="Checklist de implantação de novos projetos. Abra cada etapa, preencha os dados e retorne para marcar a conclusão."
        actions={
          <Link href={`/${projectId}/dashboard`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Dashboard
          </Link>
        }
      />
      <NewProjectStartupChecklist projectId={projectId} />
    </div>
  );
}
