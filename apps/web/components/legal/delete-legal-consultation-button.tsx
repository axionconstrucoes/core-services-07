"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteLegalConsultationAction } from "@/app/[projectId]/juridico/consultas-actions";

// Exclusão em duas etapas: o primeiro clique só pede a confirmação; o servidor exige confirmed=true.
export function DeleteLegalConsultationButton({ projectId, consultationId }: { projectId: string; consultationId: string }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10"
      >
        <Trash2 className="size-4" aria-hidden="true" />
        Excluir
      </button>
    );
  }

  return (
    <form action={deleteLegalConsultationAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="consultationId" value={consultationId} />
      <input type="hidden" name="confirmed" value="true" />
      <span className="text-xs text-white">Excluir esta consulta do seu histórico?</span>
      <button type="submit" className="min-h-9 rounded-md bg-[#ff6b57] px-2.5 py-1 text-xs font-semibold text-black">
        Confirmar exclusão
      </button>
      <button type="button" onClick={() => setAsking(false)} className="min-h-9 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-white">
        Cancelar
      </button>
    </form>
  );
}
