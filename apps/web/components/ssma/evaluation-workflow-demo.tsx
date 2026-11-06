"use client";

import { useState } from "react";
import { nextEvaluationStatus, type EvaluationWorkflowStatus } from "@/lib/ssma/technician-evaluation";

const STATUS_LABEL: Record<EvaluationWorkflowStatus, string> = {
  RASCUNHO: "Rascunho (prévia)",
  AGUARDANDO_MANIFESTACAO: "Aguardando manifestação do técnico",
  MANIFESTADA: "Técnico se manifestou",
  VALIDADA_PELO_GERENTE: "Validada pelo gerente",
};

/**
 * Fluxo DEMONSTRATIVO: manifestação do técnico e validação do gerente. Nada é gravado (a persistência depende da
 * migration separada, ainda não aplicada); ao recarregar a página o estado volta a "Rascunho".
 */
export function EvaluationWorkflowDemo({ viewerIsTechnician, viewerIsManager }: { viewerIsTechnician: boolean; viewerIsManager: boolean }) {
  const [status, setStatus] = useState<EvaluationWorkflowStatus>("RASCUNHO");
  const [manifestation, setManifestation] = useState("");
  const [managerNote, setManagerNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function advance(action: "ENVIAR" | "MANIFESTAR" | "VALIDAR") {
    setError(null);
    try {
      setStatus((current) => nextEvaluationStatus(current, action, viewerIsTechnician, viewerIsManager));
    } catch {
      setError("Esta etapa não está disponível para o seu perfil ou para o estado atual.");
    }
  }

  return (
    <section className="space-y-3 rounded-lg border-2 border-amber-600 p-4" aria-label="Manifestação e validação (demonstrativo)" data-testid="evaluation-workflow">
      <h2 className="text-base font-bold">Manifestação do técnico e validação do gerente</h2>
      <p className="text-sm font-semibold text-amber-300">
        DEMONSTRATIVO: nada é gravado nesta prévia. Estado atual: <span data-testid="workflow-status">{STATUS_LABEL[status]}</span>
      </p>
      <label className="block text-sm font-semibold">
        Manifestação do técnico (concordância, contestação, contexto)
        <textarea value={manifestation} onChange={(e) => setManifestation(e.target.value)} disabled={status !== "AGUARDANDO_MANIFESTACAO"} rows={3} className="mt-1 block w-full rounded border-2 border-slate-400 bg-white p-2 text-sm text-black disabled:opacity-60" />
      </label>
      <label className="block text-sm font-semibold">
        Parecer do gerente
        <textarea value={managerNote} onChange={(e) => setManagerNote(e.target.value)} disabled={status !== "MANIFESTADA"} rows={2} className="mt-1 block w-full rounded border-2 border-slate-400 bg-white p-2 text-sm text-black disabled:opacity-60" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => advance("ENVIAR")} disabled={!viewerIsManager || status !== "RASCUNHO"} className="min-h-11 rounded bg-[#7f1d1d] px-3 text-sm font-bold text-white disabled:bg-[#475569]">Enviar ao técnico</button>
        <button type="button" onClick={() => advance("MANIFESTAR")} disabled={!viewerIsTechnician || status !== "AGUARDANDO_MANIFESTACAO" || manifestation.trim().length < 3} className="min-h-11 rounded bg-[#7f1d1d] px-3 text-sm font-bold text-white disabled:bg-[#475569]">Registrar manifestação</button>
        <button type="button" onClick={() => advance("VALIDAR")} disabled={!viewerIsManager || viewerIsTechnician || status !== "MANIFESTADA"} className="min-h-11 rounded bg-[#14532d] px-3 text-sm font-bold text-white disabled:bg-[#475569]">Validar (gerente)</button>
      </div>
      <p className="text-xs">O gerente não valida a própria ficha. Depois de validada, a ficha ficaria imutável (na versão com persistência).</p>
      {error ? <p role="alert" className="text-sm font-bold text-red-300">{error}</p> : null}
    </section>
  );
}
