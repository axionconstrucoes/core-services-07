import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ExpertQueryPanel } from "@/components/ai/expert-query-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { askEngineeringDirectorAction } from "@/lib/ai/engineering-query-action";
import { initialAskCommercialDirectorState } from "@/lib/ai/expert-query-state";

export const metadata: Metadata = { title: "Diretor de Engenharia e Construção IA" };

// Painel do Diretor de Engenharia e Construção IA (engineering-director). Até a separação dos
// Experts esta página respondia pelo planning-director; o planejamento agora tem painel próprio em
// experts-ia/diretor-planejamento.
export default async function DiretorEngenhariaPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diretor de Engenharia e Construção IA"
        description="Especialista em engenharia de obras logísticas, industriais e de saúde: fundações, estruturas, pisos, coberturas, métodos construtivos, construtibilidade, engenharia de valor e compatibilização de projetos, sempre com revisão humana. Não substitui projetista nem responsável técnico."
      />

      <Card>
        <CardHeader>
          <CardTitle>Consultas recomendadas</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <p>• Quais alternativas de fundação ou estrutura são compatíveis com as sondagens registradas?</p>
          <p>• A revisão de projeto recebida tem interferências entre disciplinas?</p>
          <p>• Que soluções de engenharia de valor podem reduzir custo sem perder desempenho?</p>
          <p>• Quais riscos de execução existem no piso industrial ou na cobertura?</p>
        </CardContent>
      </Card>

      <ExpertQueryPanel
        projectId={projectId}
        scope="PROJECT"
        title="Pergunte ao Diretor de Engenharia e Construção IA"
        action={askEngineeringDirectorAction}
        initialState={initialAskCommercialDirectorState}
        questionPlaceholder="Ex.: Quais alternativas construtivas para a cobertura e quais os riscos de cada uma?"
      />
    </div>
  );
}
