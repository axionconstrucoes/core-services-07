"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteLegalConsultationAction } from "@/app/[projectId]/juridico/consultas-actions";

/** Evento que limpa, na tela, a resposta aberta (ExpertQueryPanel) quando ela é a da consulta excluída. */
export const LEGAL_CONSULTATION_DELETED_EVENT = "acc:legal-consultation-deleted";

// Exclusão em duas etapas: o primeiro clique só pede a confirmação; o servidor exige confirmed=true e confere a autoria.
// Depois de excluir: atualiza a lista (router.refresh) ou volta à lista (tela da consulta) e limpa a resposta aberta correspondente.
export function DeleteLegalConsultationButton({
  projectId,
  consultationId,
  afterDelete = "refresh",
}: {
  projectId: string;
  consultationId: string;
  /** "refresh": atualiza a lista na própria tela; "list": vai para a lista (tela de uma consulta). */
  afterDelete?: "refresh" | "list";
}) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function confirmDelete() {
    setError(null);
    const formData = new FormData();
    formData.set("projectId", projectId);
    formData.set("consultationId", consultationId);
    formData.set("confirmed", "true");
    startTransition(async () => {
      const result = await deleteLegalConsultationAction(formData);
      if (!result.ok) {
        setError(result.message);
        setAsking(false);
        return;
      }
      window.dispatchEvent(new CustomEvent(LEGAL_CONSULTATION_DELETED_EVENT, { detail: { id: consultationId } }));
      if (afterDelete === "list") router.push(`/${projectId}/juridico?consulta=excluida`);
      else router.replace(`/${projectId}/juridico?consulta=excluida`);
    });
  }

  if (!asking) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-legal-delete="abrir"
          onClick={() => setAsking(true)}
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/10"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Excluir consulta
        </button>
        {error ? <span role="alert" className="text-xs text-white">{error}</span> : null}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar exclusão da consulta">
      <span className="text-xs text-white">Excluir esta consulta do seu histórico? Esta ação não pode ser desfeita.</span>
      <button
        type="button"
        data-legal-delete="confirmar"
        disabled={pending}
        onClick={confirmDelete}
        className="min-h-9 rounded-md bg-[#ff6b57] px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-60"
      >
        {pending ? "Excluindo…" : "Confirmar exclusão"}
      </button>
      <button type="button" disabled={pending} onClick={() => setAsking(false)} className="min-h-9 rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-white">
        Cancelar
      </button>
    </span>
  );
}
