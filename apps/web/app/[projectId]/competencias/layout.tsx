import { requireSegmentAccess } from "@/lib/permissions/project-tier-server";

// Guarda de rota por nível (tier) do usuário no projeto (Fase 6/H2a) — vale para a página e subrotas (acesso direto por URL incluído).
// Sem membership ATIVA/nível suficiente => 404. O banco (RLS + RPCs) continua sendo a autoridade; isto evita renderizar a tela.
export default async function SegmentLayout({ children, params }: { children: React.ReactNode; params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  await requireSegmentAccess(projectId, "competencias");
  return <>{children}</>;
}
