import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ALL_OFFICIAL_EXPERT_DEFINITIONS, type OfficialExpertId } from "@/lib/ai/expert-definitions";
import { requestedSkillsForExpert, SKILL_DISCOVERY_TOOL, ENGINEERING_SKILL_REQUEST } from "@/lib/ai/expert-definitions/requested-skills";
import { buildAiProviderUiMetadata } from "@/lib/ai/provider-ui-metadata";
import { resolveAiProviderNameForExpert } from "@/lib/ai/providers/resolve-provider-for-expert";
import { expertAccentBorderClassName, expertIconClassName, resolveExpertIcon } from "@/components/ai/expert-visual-identity";
import { FeatureInfo } from "@/components/shared/feature-info";
import { cn } from "@/lib/utils";

// Hub central dos 5 Experts oficiais do ACC — nunca substitui os
// acessos contextuais já existentes (Diretor Comercial IA no
// Dashboard/Event Ledger, Diretor de ESG IA em ESG/SSMA), só reúne
// todos num único lugar. Nome/missão/status vêm sempre de
// apps/web/lib/ai/expert-definitions/ (fonte de verdade única — ver
// docs/ai/expert-capabilities.md) — nunca duplicados aqui.
const EXPERT_ACCESS_HREF: Partial<Record<OfficialExpertId, (projectId: string) => string>> = {
  "commercial-director": (projectId) => `/${projectId}/dashboard`,
  "esg-director": (projectId) => `/${projectId}/esg`,
  "planning-director": (projectId) => `/${projectId}/experts-ia/diretor-engenharia`,
  "legal-consultant": (projectId) => `/${projectId}/juridico`,
};

export const metadata: Metadata = { title: "Experts IA" };

export default async function ExpertsIaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Experts IA"
        description="Hub central dos Experts oficiais do ACC para este projeto — toda sugestão exige revisão humana. Os acessos já existentes (Diretor Comercial IA no Dashboard, Diretor de ESG IA em ESG/SSMA) continuam disponíveis normalmente; este hub não os substitui."
      />

      <div>
        <Link
          href={`/${projectId}/experts-ia/descricao`}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-yellow-500 bg-yellow-400 px-5 py-2 text-sm font-bold text-black hover:bg-yellow-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-500"
        >
          Descrição dos Especialistas
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_OFFICIAL_EXPERT_DEFINITIONS.map((expert) => {
          const isActive = expert.status === "IMPLEMENTED";
          const href = EXPERT_ACCESS_HREF[expert.expertId]?.(projectId);
          const providerMeta = buildAiProviderUiMetadata(resolveAiProviderNameForExpert(expert.expertId), null);
          const Icon = resolveExpertIcon(expert.visualIdentity);
          const requestedSkills = requestedSkillsForExpert(expert.expertId);

          return (
            <Card key={expert.expertId} className={cn("flex flex-col", expertAccentBorderClassName(expert.visualIdentity))}>
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="flex items-center gap-1.5 text-base">
                    <Icon className={cn("size-4 shrink-0", expertIconClassName(expert.visualIdentity))} aria-hidden="true" />
                    {expert.expertName}
                    <FeatureInfo helpId={`expert-${expert.expertId}`} />
                  </CardTitle>
                  <Badge
                    variant={isActive ? "default" : "secondary"}
                    className={cn(
                      "shrink-0",
                      isActive && "border-green-600 bg-green-600 text-white hover:bg-green-600 hover:text-white"
                    )}
                  >
                    {isActive ? <CheckCircle2 className="size-3" /> : <Clock className="size-3" />}
                    {isActive ? "Ativo" : "Em implantação"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{expert.mission}</p>
                <Badge variant="outline" className="w-fit text-[10px] font-normal text-muted-foreground">
                  Provider: {providerMeta.providerLabel}
                </Badge>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div className="space-y-2 border-t pt-3">
                  <p className="text-xs font-semibold">Skills selecionadas para este especialista</p>
                  {requestedSkills.map((skill) => (
                    <div key={skill.id} className="space-y-1 rounded-md border p-2">
                      <p className="break-words text-xs font-semibold">{skill.label}</p>
                      <p className="text-xs text-muted-foreground">{skill.purpose}</p>
                      <Badge variant="outline" className="text-[10px]">Pendente de integração ao ACC</Badge>
                    </div>
                  ))}
                </div>
                {isActive && href ? (
                  <Link href={href} className={cn(buttonVariants({ size: "sm" }))}>
                    Abrir Expert
                  </Link>
                ) : isActive ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    Operacional — consulta disponível via API; interface dedicada ainda não construída nesta fase.
                  </span>
                ) : (
                  <span className="text-xs font-medium text-muted-foreground">
                    Em implantação — ainda não operacional nesta fase.
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Engenharia industrial e logística — especialidade proposta</CardTitle>
          <p className="text-xs text-muted-foreground">Ainda não existe um Expert oficial próprio de Engenharia neste catálogo. A skill está associada à especialidade futura, sem simular execução pelo Diretor de Planejamento.</p>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-xs font-semibold">{ENGINEERING_SKILL_REQUEST.label}</p>
          <p className="text-xs text-muted-foreground">{ENGINEERING_SKILL_REQUEST.purpose}</p>
          <Badge variant="outline" className="text-[10px]">Pendente de integração ao ACC</Badge>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Ferramenta administrativa selecionada: {SKILL_DISCOVERY_TOOL.label} — busca de skills, não é especialista.
        As skills foram informadas como instaladas no Claude Code; essa instalação não ativa automaticamente seu uso
        pelas consultas do ACC. Antes de marcar uma skill como ativa, integrar e verificar seu conteúdo e execução.
      </p>
    </div>
  );
}
