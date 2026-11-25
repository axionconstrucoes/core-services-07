import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, Download, FileText, Info } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProject } from "@/lib/data";
import { TUTORIAL_FILES } from "@/lib/help/tutorial-files";

export const metadata: Metadata = { title: "Ajuda e tutorial" };

export default async function AjudaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const base = `/${projectId}/ajuda/tutorial`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Ajuda e tutorial" description="Apresentação da suíte e guia de uso do ACC, com imagens das telas e dos e-mails de alerta." actions={<FeatureInfo helpId="admin.ajuda.pagina" />} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <BookOpen className="size-4" /> Apresentação e tutorial do ACC
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p>
            Cobre acesso e seleção de obra, documentos e cláusulas, alertas e respostas parciais, CONSULTAR IA, providências e CNO,
            SSMA no celular (instalação e uso sem internet) e permissões. As imagens usam dados fictícios e informam o que foi
            verificado e o que ainda depende de teste real.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href={`${base}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-2 rounded-md bg-red-900 px-4 text-sm font-bold text-white hover:bg-red-800"
            >
              <FileText className="size-4" /> {TUTORIAL_FILES.pdf.label}
            </a>
            <FeatureInfo helpId="admin.ajuda.pdf" className="self-center" />
            <a
              href={`${base}/pptx`}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border-2 border-red-900 px-4 text-sm font-bold text-red-900 hover:bg-red-50"
            >
              <Download className="size-4" /> {TUTORIAL_FILES.pptx.label}
            </a>
            <FeatureInfo helpId="admin.ajuda.pptx" className="self-center" />
          </div>
          <p className="text-xs text-muted-foreground">
            Acesso restrito a usuários autenticados com acesso a esta obra. O PowerPoint é editável; o PDF é para consulta.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-bold">
            <Info className="size-4" /> Como ler a ajuda do ACC
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p>
            O ícone (i) abre o texto explicativo de cada tela, aba, botão, campo, indicador e selo. Funciona com o mouse, pelo
            teclado e por toque, inclusive no menu lateral recolhido. Os textos abaixo valem para todas as telas.
          </p>
          <ul className="flex flex-col gap-2">
            <li className="flex items-center gap-2">
              <span>Ícone de ajuda (i): como usar</span>
              <FeatureInfo helpId="shared.global.icone-ajuda" />
            </li>
            <li className="flex items-center gap-2">
              <span>Menu lateral: itens, recolher e itens restritos</span>
              <FeatureInfo helpId="shared.global.menu-lateral" />
            </li>
            <li className="flex items-center gap-2">
              <span>Selos de status: cores e significados</span>
              <FeatureInfo helpId="shared.global.status-global" />
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
