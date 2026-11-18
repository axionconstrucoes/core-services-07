import type { Metadata } from "next";
import Link from "next/link";
import { getManagedDocuments } from "@/lib/document-management";
import { isTechnicalProjectDocument, projectDocumentDate, projectFileName, projectSubject } from "@/lib/documents/technical-project-list";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDate } from "@/lib/labels";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Projetos técnicos" };

export default async function ProjetosDocumentosPage({params}:{params:Promise<{projectId:string}>}) {
  const {projectId} = await params;
  const projects = (await getManagedDocuments(projectId))
    .filter(isTechnicalProjectDocument)
    .sort((a,b)=>projectDocumentDate(b).localeCompare(projectDocumentDate(a)));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Projetos"
        description="Listagem sintética de projetos técnicos e desenhos, classificados como DESENHO."
        actions={<Link href={`/${projectId}/documentos`} className={buttonVariants({variant:"outline",size:"sm"})}>Voltar a Documentos</Link>}
      />
      {projects.length === 0
        ? <EmptyState message="Nenhum projeto técnico ou desenho cadastrado."/>
        : <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="w-36 border-b p-3 font-semibold">Data</th>
                  <th scope="col" className="border-b p-3 font-semibold">Nome do arquivo</th>
                  <th scope="col" className="border-b p-3 font-semibold">Assunto</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(document => (
                  <tr key={document.id} className="border-b last:border-b-0 hover:bg-muted/30">
                    <td className="whitespace-nowrap p-3 align-top">{formatDate(projectDocumentDate(document))}</td>
                    <td className="break-all p-3 align-top">{projectFileName(document)}</td>
                    <td className="p-3 align-top">{projectSubject(document)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </div>
  );
}
