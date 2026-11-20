"use client";

import { useActionState } from "react";
import { restoreProjectDocumentAction } from "@/app/[projectId]/documentos/actions";
import { initialRestoreDocumentState } from "@/app/[projectId]/documentos/actions-state";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";

// "Restaurar" um documento da lixeira — só renderizado para o
// ADMINISTRADOR (ver TrashPanel). A RPC restore_project_document
// revalida a permissão no servidor de qualquer forma.
export function RestoreDocumentControl({
  projectId,
  documentId,
}: {
  projectId: string;
  documentId: string;
}) {
  const [state, formAction, pending] = useActionState(restoreProjectDocumentAction, initialRestoreDocumentState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="documentId" value={documentId} />
      <span className="inline-flex items-center gap-1">
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Restaurando…" : "Restaurar"}
        </Button>
        <FeatureInfo helpId="juridico.documentos.lixeira" />
      </span>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
