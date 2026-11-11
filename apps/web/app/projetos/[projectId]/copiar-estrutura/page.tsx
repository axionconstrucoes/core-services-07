import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";
import { InstitutionalBackground } from "@/components/brand/institutional-background";
import { CopyStructureWizard } from "@/components/projects/copy-structure-wizard";
import { getProject } from "@/lib/data";
import { createSupabaseCopyStructureStore } from "@/lib/projects/copy-structure/supabase-store";
import { availableStructureCategories } from "@/lib/projects/copy-structure/categories";

export const metadata: Metadata = { title: "Copiar estrutura · ACC" };

export default async function CopiarEstruturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ origem?: string }>;
}) {
  const [{ projectId }, { origem }] = await Promise.all([params, searchParams]);
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/");

  const project = await getProject(projectId);
  if (!project || project.workspaceType !== "OBRA") notFound();

  const store = createSupabaseCopyStructureStore(supabase);
  const membership = await store.getActiveMembership(projectId, authData.user.id);
  // Só Administrador ativo do DESTINO. As ações repetem a checagem (e a RPC, no banco, também).
  if (membership?.status !== "ACTIVE" || membership.permission !== "ADMINISTRADOR") redirect("/projetos");

  // Origens possíveis: outros projetos em que o usuário também é Administrador ativo.
  const sources = (await store.listAdminProjects(authData.user.id)).filter((candidate) => candidate.id !== projectId);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      <InstitutionalBackground />
      <div className="relative w-full max-w-5xl">
        <CopyStructureWizard
          destination={{ id: project.id, name: project.name, code: project.code, client: project.client, location: project.location }}
          sources={sources}
          categories={availableStructureCategories()}
          backHref={origem === "cadastro" ? `/${project.id}/startup` : "/projetos"}
          fromRegistration={origem === "cadastro"}
        />
      </div>
    </main>
  );
}
