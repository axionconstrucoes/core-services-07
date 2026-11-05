import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpertResponseDetails } from "@/components/ai/expert-query-panel";
import { DeleteLegalConsultationButton } from "@/components/legal/delete-legal-consultation-button";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/labels";
import { LEGAL_CONSULTATION_DELETE_SCOPE_NOTICE, getOwnLegalConsultation } from "@/lib/legal/consultations";

export const metadata: Metadata = { title: "Consulta jurídica" };

// Abertura por ID: só o AUTOR vê. Quem não é o autor (outro membro, administrador) recebe 404, igual a "não existe".
export default async function LegalConsultationPage({ params }: { params: Promise<{ projectId: string; consultationId: string }> }) {
  const { projectId, consultationId } = await params;
  const consultation = await getOwnLegalConsultation(projectId, consultationId);
  if (!consultation) notFound();

  return (
    <div className="space-y-4">
      <PageHeader title="Consulta jurídica" description={`Privada — só você vê esta consulta. Registrada em ${formatDateTime(consultation.createdAt)}.`} />
      <Link href={`/${projectId}/juridico`} className="inline-flex items-center gap-2 text-sm text-primary">
        Voltar às minhas consultas
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pergunta</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap text-sm">{consultation.question}</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resposta</CardTitle>
        </CardHeader>
        <CardContent>
          <ExpertResponseDetails response={consultation.response} showClauseComparison />
        </CardContent>
      </Card>
      <div className="space-y-2">
        <DeleteLegalConsultationButton projectId={projectId} consultationId={consultation.id} afterDelete="list" />
        <p className="text-xs text-muted-foreground">{LEGAL_CONSULTATION_DELETE_SCOPE_NOTICE}</p>
      </div>
    </div>
  );
}
