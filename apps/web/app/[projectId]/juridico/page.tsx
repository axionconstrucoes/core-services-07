import type { Metadata } from "next";
import Link from "next/link";
import { Building2, FileText, Scale } from "lucide-react";
import { PrecontractCurationPanel } from "@/components/ai/precontract-curation-panel";
import { PrecontractWorkspaceClient } from "@/components/legal/precontract-workspace-client";
import { LegalConsultationHistory } from "@/components/legal/legal-consultation-history";
import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { notFound } from "next/navigation";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getProject } from "@/lib/data";
import { getManagedDocuments } from "@/lib/document-management";
import {
  toClassificationSnapshots,
  toPrecontractExistingDocuments,
} from "@/lib/legal/precontract-existing-documents";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Jurídico" };

// Server Actions desta pagina podem aguardar a analise estruturada de um
// contrato completo. Deve permanecer acima do timeout rigido do provider
// Anthropic (180 s) para que o app encerre e sanitize o erro primeiro.
export const maxDuration = 300;

const CONTRACTUAL_KINDS = new Set(["CONTRATO_BASE", "ADITIVO"]);

export default async function ProjectLegalPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ consulta?: string }> }) {
  const { projectId } = await params;
  const { consulta: consultaFlash } = await searchParams;
  const [project, documents, permission] = await Promise.all([
    getProject(projectId),
    getManagedDocuments(projectId),
    getCurrentProjectPermission(projectId),
  ]);
  if (!project) return null;
  const contractualDocuments = documents.filter((document) =>
    CONTRACTUAL_KINDS.has(document.kind) || Boolean(document.parentDocumentId)
  );
  const isPrecontract = project.workspaceType === "PRE_CONTRATUAL";
  // Análise jurídica pré-contratual ("Jurídico IA"): SOMENTE administrador ativo deste espaço (rota direta = 404 para os demais).
  if (isPrecontract && permission !== "ADMINISTRADOR") notFound();
  const canUpload = permission === "ADMINISTRADOR" || permission === "GESTOR" || permission === "GERENTE";

  // Documentos ja existentes, carregados NO SERVIDOR e entregues ao card:
  // e isto que faz a tela reconhecer, apos um F5, o arquivo que ja esta
  // la — o usuario nunca precisa reenviar o mesmo documento. Nenhuma
  // query nova: reaproveita o `documents` que a pagina ja buscou.
  const existingLegalDocuments = toPrecontractExistingDocuments(documents);
  const classificationSnapshots = toClassificationSnapshots(documents);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isPrecontract ? "Análise jurídica pré-contratual" : "Jurídico"}
        description={isPrecontract
          ? "Ambiente de negociação da minuta antes da contratação, separado das obras assinadas."
          : "Consulta ao contrato assinado, anexos, aditivos e especialista jurídico."}
        actions={<FeatureInfo helpId="juridico.projeto.pagina" />}
      />

      {/* Identificação da análise: oportunidade e cliente sempre visíveis
          no topo — é o que diferencia uma análise pré-contratual de
          outra, e o que o usuário precisa conferir antes de perguntar. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-10 gap-y-3 p-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {isPrecontract ? "Oportunidade" : "Obra"}
            </p>
            <p className="truncate text-lg font-semibold">{project.name}</p>
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
              <Building2 className="size-3.5" />
              Cliente
            </p>
            <p className="truncate text-lg font-semibold">{project.client}</p>
          </div>
        </CardContent>
      </Card>

      {isPrecontract ? (
        // Análise pré-contratual: card único de documento + consulta, com
        // o botão liberado somente quando há conteúdo extraído.
        <>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            Consulta ao especialista jurídico
            <FeatureInfo helpId="juridico.projeto.consulta-especialista" />
          </div>
          <PrecontractWorkspaceClient
            projectId={projectId}
            canUpload={canUpload}
            existingDocuments={existingLegalDocuments}
            classificationSnapshots={classificationSnapshots}
          />
        </>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-4">
              <div><CardTitle className="flex items-center gap-2"><FileText className="size-5" />Base documental<FeatureInfo helpId="juridico.projeto.base-documental" /></CardTitle><p className="mt-1 text-sm text-muted-foreground">Contrato ou minuta, anexos, aditivos e respectivos anexos.</p></div>
              <Link href={`/${projectId}/documentos`} className={cn(buttonVariants({ variant: "outline" }))}>Gerenciar documentos</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {contractualDocuments.length ? contractualDocuments.map((document) => (
                <div key={document.id} className="flex items-center justify-between rounded-md border p-3" title={document.versions[0]?.summary || `Documento contratual: ${document.title}`}>
                  <span className="text-sm font-medium">{document.title}</span>
                  <Badge variant="outline">{document.kind.replaceAll("_", " ")}</Badge>
                </div>
              )) : <p className="text-sm text-muted-foreground">Nenhum contrato, minuta, aditivo ou anexo cadastrado.</p>}
            </CardContent>
          </Card>

          <div className="flex items-center gap-1.5 text-sm font-medium">
            Consulta ao especialista jurídico
            <FeatureInfo helpId="juridico.projeto.consulta-especialista" />
          </div>
          {/* Regra efetiva (lib/ai/legal-query-action.ts): a consulta ao Consultor Jurídico só é aceita em espaço PRE_CONTRATUAL e por
              administrador ativo; em obra contratada o servidor sempre recusa. Por isso não exibimos um formulário que nunca funciona. */}
          <Card>
            <CardContent className="py-4 text-sm text-muted-foreground" data-legal-consult-unavailable="obra-contratada">
              A consulta ao especialista jurídico está disponível somente nas análises jurídicas pré-contratuais (espaço pré-contratual) e a
              administradores ativos. Em uma obra contratada, use a base documental acima e as análises dos Experts de IA do Evento.
            </CardContent>
          </Card>
        </>
      )}

      <LegalConsultationHistory projectId={projectId} flash={consultaFlash} />

      {isPrecontract ? <PrecontractCurationPanel projectId={projectId} /> : null}

      {isPrecontract ? <Link href="/juridico" className="inline-flex items-center gap-2 text-sm text-primary"><Scale className="size-4" />Voltar às análises pré-contratuais</Link> : null}
    </div>
  );
}
