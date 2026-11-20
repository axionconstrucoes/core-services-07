import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ExpertQueryPanel } from "@/components/ai/expert-query-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureInfo } from "@/components/shared/feature-info";
import { initialAskCommercialDirectorState } from "@/lib/ai/expert-query-state";
import { askPlanningDirectorAction } from "@/lib/ai/planning-query-action";

export const metadata: Metadata = { title: "Diretor de Planejamento IA" };

// Painel do Diretor de Planejamento IA (planning-director). Engenharia (solução técnica,
// construtibilidade, compatibilização) tem painel próprio em experts-ia/diretor-engenharia.
export default async function DiretorPlanejamentoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Diretor de Planejamento IA"
        description="Especialista em planejamento de obras logísticas, industriais e de saúde: cronograma, linha de base, caminho crítico, folgas, curva S, atrasos e recuperação de prazo, com base no MPP estruturado e sempre com revisão humana."
        actions={
          <div className="flex items-center gap-1">
            <FeatureInfo helpId="experts.planejamento.pagina" />
            <FeatureInfo helpId="experts.planejamento.perfil" />
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Consultas recomendadas
            <FeatureInfo helpId="experts.painel.consultas-recomendadas" />
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
          <p>• Qual é a data final prevista da obra e quais atividades estão no caminho crítico?</p>
          <p>• Quais atividades têm menor folga e maior risco de atraso?</p>
          <p>• Quais relações entre atividades podem comprometer o prazo final?</p>
          <p>• Que alternativas de recuperação de prazo o cronograma permite?</p>
        </CardContent>
      </Card>

      <ExpertQueryPanel
        projectId={projectId}
        scope="PROJECT"
        title="Pergunte ao Diretor de Planejamento IA"
        action={askPlanningDirectorAction}
        initialState={initialAskCommercialDirectorState}
        questionPlaceholder="Ex.: Qual é a data final prevista da obra, quantas atividades existem e quais estão no caminho crítico?"
      />
    </div>
  );
}
