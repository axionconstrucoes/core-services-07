import type { Metadata } from "next";
import Link from "next/link";
import { ALL_OFFICIAL_EXPERT_DEFINITIONS } from "@/lib/ai/expert-definitions";
import { requestedSkillsForExpert, SKILL_STATE_LABEL } from "@/lib/ai/expert-definitions/requested-skills";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Descrição dos Especialistas" };

export default async function DescricaoEspecialistasPage({params}:{params:Promise<{projectId:string}>}) {
  const {projectId} = await params;
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Descrição dos Especialistas"
        description="Competências, atribuições, limitações, fontes autorizadas e skills selecionadas para os especialistas IA do ACC."
        actions={
          <Link href={`/${projectId}/experts-ia`} className={buttonVariants({variant:"outline",size:"sm"})}>
            Voltar aos especialistas
          </Link>
        }
      />
      {ALL_OFFICIAL_EXPERT_DEFINITIONS.map((expert) => (
        <Card key={expert.expertId}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{expert.expertName}</CardTitle>
              <Badge variant="outline">{expert.status === "IMPLEMENTED" ? "Expert implementado" : "Em implantação"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{expert.mission}</p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <section>
              <h2 className="font-semibold">Principais competências</h2>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                {expert.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
              </ul>
            </section>
            <section>
              <h2 className="font-semibold">Skills selecionadas</h2>
              {requestedSkillsForExpert(expert.expertId).map((skill) => (
                <div key={skill.id} className="mt-2 rounded-md border p-3">
                  <p className="font-semibold">{skill.label}</p>
                  <p className="text-muted-foreground">{skill.purpose}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{SKILL_STATE_LABEL[skill.state]}</p>
                </div>
              ))}
            </section>
            <section>
              <h2 className="font-semibold">Fontes autorizadas</h2>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                {expert.authorizedSources.map((source) => (
                  <li key={source.sourceId}>{source.label} — {source.status === "AVAILABLE" ? "Disponível" : "Fonte futura"}</li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="font-semibold">Limitações e revisão humana</h2>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                {expert.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
              <p className="mt-2 font-medium">Decisões e recomendações exigem revisão humana.</p>
            </section>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
