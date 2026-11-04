import Link from "next/link";
import { Lock } from "lucide-react";
import { DeleteLegalConsultationButton } from "@/components/legal/delete-legal-consultation-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/labels";
import { LEGAL_CONSULTATION_DELETE_SCOPE_NOTICE, listOwnLegalConsultations } from "@/lib/legal/consultations";

// "Minhas consultas": lista SOMENTE as consultas do usuário logado (autoria da sessão + RLS). Ninguém mais as vê.
export async function LegalConsultationHistory({ projectId, flash }: { projectId: string; flash?: string }) {
  const { items, available } = await listOwnLegalConsultations(projectId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Lock className="size-4" aria-hidden="true" />
          Minhas consultas jurídicas
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Privadas: só você as vê, abre e exclui. Nenhum outro membro do projeto, inclusive administradores, tem acesso.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {flash === "excluida" ? <p role="status" className="rounded-md border border-border px-3 py-2 text-sm">Consulta excluída do seu histórico.</p> : null}
        {flash === "nao-excluida" ? <p role="alert" className="rounded-md border border-border px-3 py-2 text-sm">Não foi possível excluir a consulta.</p> : null}

        {!available ? (
          <p className="text-sm text-muted-foreground">O histórico de consultas ainda não está disponível neste ambiente.</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não tem consultas salvas neste projeto.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{item.question}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/${projectId}/juridico/consulta/${item.id}`} className="inline-flex min-h-9 items-center rounded-md bg-brand-sidebar px-2.5 py-1 text-xs font-semibold text-white hover:opacity-90">
                  Abrir
                </Link>
                <DeleteLegalConsultationButton projectId={projectId} consultationId={item.id} />
              </div>
            </div>
          ))
        )}
        <p className="pt-1 text-xs text-muted-foreground">{LEGAL_CONSULTATION_DELETE_SCOPE_NOTICE}</p>
      </CardContent>
    </Card>
  );
}
