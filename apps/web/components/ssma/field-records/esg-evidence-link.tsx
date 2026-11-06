"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@axion/db/browser";
import { ESG_REFERENCE_NOTICE, eligibleSubmissions, esgReferenceErrorMessage } from "@/lib/ssma/esg-reference";

interface Reference {
  id: string;
  submission_id: string;
  created_at: string;
}
interface Submission {
  id: string;
  reference_date: string;
  status: string;
  filled_by_user_id: string;
  esg_obligations: { title: string } | { title: string }[] | null;
}
const titleOf = (s: Submission) => (Array.isArray(s.esg_obligations) ? s.esg_obligations[0]?.title : s.esg_obligations?.title) ?? "Obrigação ESG";

/** "Usar como evidência ESG": referência (não cumprimento) entre o registro e uma comprovação ESG da mesma obra. */
export function EsgEvidenceLink({
  projectId,
  recordId,
  userId,
  isAdmin,
  online,
}: {
  projectId: string;
  recordId: string;
  userId: string;
  isAdmin: boolean;
  online: boolean;
}) {
  const [refs, setRefs] = useState<Reference[]>([]);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [available, setAvailable] = useState(true);
  const [choice, setChoice] = useState("");
  const [reason, setReason] = useState("");
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!online) return;
    const supabase = createSupabaseBrowserClient();
    const { data, error: refError } = await supabase
      .from("esg_ssma_record_references")
      .select("id, submission_id, created_at")
      .eq("field_record_id", recordId)
      .is("revoked_at", null);
    if (refError) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    setRefs((data ?? []) as Reference[]);
    const { data: list } = await supabase
      .from("esg_obligation_submissions")
      .select("id, reference_date, status, filled_by_user_id, esg_obligations(title)")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    setSubs((list ?? []) as unknown as Submission[]);
  }, [online, recordId, projectId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!available) return null;
  const linkedIds = new Set(refs.map((r) => r.submission_id));
  const options = eligibleSubmissions(subs, userId, isAdmin).filter((s) => !linkedIds.has(s.id));

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, ok: string) {
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: rpcError } = await fn();
    setBusy(false);
    if (rpcError) {
      setError(esgReferenceErrorMessage(rpcError.message));
      return;
    }
    setMessage(ok);
    setChoice("");
    setReason("");
    setUnlinking(null);
    await load();
  }

  return (
    <section className="space-y-3 rounded-xl bg-white p-4 shadow-sm" aria-label="Evidência ESG" data-testid="esg-evidence-link">
      <h2 className="font-bold uppercase text-slate-900">Evidência ESG</h2>
      <p className="text-xs font-medium text-slate-600">{ESG_REFERENCE_NOTICE}</p>
      {refs.length > 0 ? (
        <ul className="space-y-2">
          {refs.map((ref) => {
            const sub = subs.find((s) => s.id === ref.submission_id);
            return (
              <li key={ref.id} className="rounded border border-slate-200 p-2 text-sm">
                <p className="font-bold text-slate-900">{sub ? `${titleOf(sub)} · ${sub.reference_date}` : "Comprovação ESG"}</p>
                <p className="text-xs text-slate-600">
                  Vinculado em {new Date(ref.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} · situação da obrigação: {sub?.status ?? "—"} (inalterada)
                </p>
                {unlinking === ref.id ? (
                  <div className="mt-2 space-y-2">
                    <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (mín. 3 caracteres)" aria-label="Motivo" className="block min-h-11 w-full rounded border-2 border-slate-300 px-2 text-sm" />
                    <button
                      type="button"
                      disabled={busy || !online}
                      onClick={() => void run(() => createSupabaseBrowserClient().rpc("esg_unlink_ssma_record", { p_reference_id: ref.id, p_reason: reason }), "Vínculo desfeito (histórico preservado).")}
                      className="min-h-11 rounded bg-slate-800 px-3 text-xs font-bold uppercase text-white disabled:opacity-50"
                    >
                      Confirmar desvínculo
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setUnlinking(ref.id)} className="mt-1 min-h-11 text-xs font-bold text-[#7f1d1d] underline">Desfazer vínculo</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">Nenhuma comprovação ESG vinculada a este registro.</p>
      )}
      {options.length > 0 ? (
        <div className="space-y-2">
          <select aria-label="Comprovação ESG" value={choice} onChange={(e) => setChoice(e.target.value)} className="block min-h-12 w-full rounded-lg border-2 border-slate-300 bg-white px-3 text-sm">
            <option value="">Selecione a comprovação ESG</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>{titleOf(s)} · {s.reference_date} · {s.status}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!choice || busy || !online}
            onClick={() => void run(() => createSupabaseBrowserClient().rpc("esg_link_ssma_record", { p_submission_id: choice, p_field_record_id: recordId }), "Registro vinculado como evidência. A obrigação não foi alterada.")}
            className="min-h-12 w-full rounded-lg border-2 border-[#7f1d1d] px-3 text-sm font-bold uppercase text-[#7f1d1d] disabled:opacity-50"
          >
            Usar como evidência ESG
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Nenhuma comprovação ESG sua disponível para vincular{isAdmin ? "" : " (só as que você registrou)"}.</p>
      )}
      {message ? <p role="status" className="text-sm font-bold text-green-700">{message}</p> : null}
      {error ? <p role="alert" className="text-sm font-bold text-red-700">{error}</p> : null}
    </section>
  );
}
