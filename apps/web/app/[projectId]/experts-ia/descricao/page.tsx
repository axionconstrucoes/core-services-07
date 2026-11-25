import type { Metadata } from "next";
import Link from "next/link";
import { ALL_OFFICIAL_EXPERT_DEFINITIONS } from "@/lib/ai/expert-definitions";
import { requestedSkillsForExpert, SKILL_STATE_LABEL } from "@/lib/ai/expert-definitions/requested-skills";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { HelpContent } from "@/components/shared/help-content";
import { getFeatureHelp } from "@/lib/ui/help/registry";
import { EXPERT_PROFILE_HELP_ID } from "@/lib/ui/help/modules/experts";

export const metadata: Metadata = { title: "Descrição dos Especialistas" };

// Todo texto explicativo (perfil simulado, roteamento do botão ESPECIALISTA, diferença para a AXIA) vem do catálogo de
// ajuda (lib/ui/help/modules/experts.ts e engenharia.ts) — nunca digitado aqui.
export default async function DescricaoEspecialistasPage({params}:{params:Promise<{projectId:string}>}) {
  const {projectId} = await params;
  const routing = getFeatureHelp("experts.alertas.botao-especialista");
  const axia = getFeatureHelp("experts.hub.axia-diferenca");
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Descrição dos Especialistas"
        description="Competências, atribuições, limitações, fontes autorizadas e skills selecionadas para os especialistas IA do ACC."
        actions={
          <div className="flex items-center gap-1">
            <FeatureInfo helpId="experts.descricao.pagina" />
            <Link href={`/${projectId}/experts-ia`} className={buttonVariants({variant:"outline",size:"sm"})}>
              Voltar aos especialistas
            </Link>
          </div>
        }
      />
      {ALL_OFFICIAL_EXPERT_DEFINITIONS.map((expert) => {
        const profile = getFeatureHelp(EXPERT_PROFILE_HELP_ID[expert.expertId]);
        return (
        <Card key={expert.expertId}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-1.5">
                {expert.expertName}
                <FeatureInfo helpId={EXPERT_PROFILE_HELP_ID[expert.expertId]} />
              </CardTitle>
              <div className="flex items-center gap-1">
                <Badge variant="outline">{expert.status === "IMPLEMENTED" ? "Expert implementado" : "Em implantação"}</Badge>
                <FeatureInfo helpId="experts.hub.status-expert" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{expert.mission}</p>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <section>
              <h2 className="flex items-center gap-1.5 font-semibold">
                Principais competências
                <FeatureInfo helpId="experts.descricao.competencias" />
              </h2>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                {expert.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
              </ul>
            </section>
            <section>
              <h2 className="flex items-center gap-1.5 font-semibold">
                Skills selecionadas
                <FeatureInfo helpId="experts.hub.skills" />
              </h2>
              {requestedSkillsForExpert(expert.expertId).map((skill) => (
                <div key={skill.id} className="mt-2 rounded-md border p-3">
                  <p className="font-semibold">{skill.label}</p>
                  <p className="text-muted-foreground">{skill.purpose}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{SKILL_STATE_LABEL[skill.state]}</p>
                </div>
              ))}
            </section>
            <section>
              <h2 className="flex items-center gap-1.5 font-semibold">
                Fontes autorizadas
                <FeatureInfo helpId="experts.descricao.fontes" />
              </h2>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                {expert.authorizedSources.map((source) => (
                  <li key={source.sourceId}>{source.label} — {source.status === "AVAILABLE" ? "Disponível" : "Fonte futura"}</li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="flex items-center gap-1.5 font-semibold">
                Limitações e revisão humana
                <FeatureInfo helpId="experts.descricao.limitacoes" />
              </h2>
              <ul className="ml-5 mt-1 list-disc space-y-1">
                {expert.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
              <p className="mt-2 font-medium">Decisões e recomendações exigem revisão humana.</p>
            </section>
            {profile ? (
              <details className="rounded-md border p-3">
                <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
                  Perfil de apoio simulado — ver perfil completo
                </summary>
                <div className="mt-3 flex items-center gap-1.5">
                  <FeatureInfo helpId="experts.descricao.perfil-simulado" />
                  <span className="text-xs text-muted-foreground">Explicação deste bloco</span>
                </div>
                <HelpContent help={profile} className="mt-3" />
              </details>
            ) : null}
          </CardContent>
        </Card>
        );
      })}
      {routing || axia ? (
        <Card>
          <CardHeader>
            <CardTitle>Como os especialistas são acionados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {routing ? (
              <section>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  {routing.title}
                  <FeatureInfo helpId="experts.alertas.botao-especialista" />
                </h2>
                <HelpContent help={routing} className="mt-2" />
              </section>
            ) : null}
            {axia ? (
              <section>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  {axia.title}
                  <FeatureInfo helpId="experts.hub.axia-diferenca" />
                </h2>
                <HelpContent help={axia} className="mt-2" />
              </section>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
