"use server";

import { createSupabaseServerClient } from "@axion/db/server";

import { reserveAiConsult } from "@/lib/ai/alert-consult/consult-quota";
import { consultSsmaSpecialistForRecord } from "@/lib/ai/alert-consult/ssma-consult";
import { MAX_ALERT_CONSULT_QUESTION_LENGTH } from "@/lib/ai/alert-consult/specialties";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getFieldRecords } from "@/lib/ssma/field-records/data";
import { runSsmaRecordConsult, type SsmaConsultState } from "@/lib/ssma/field-records/run-record-consult";

// SOMENTE LEITURA: não grava nada e não altera o registro nem a ação corretiva. Login, vínculo ativo
// e isolamento por obra são conferidos no servidor (o registro é lido com a sessão do usuário, RLS).
export async function consultSsmaRecordAction(_previous: SsmaConsultState, formData: FormData): Promise<SsmaConsultState> {
  const projectId = String(formData.get("projectId") ?? "");
  const recordId = String(formData.get("recordId") ?? "");
  const question = String(formData.get("question") ?? "");
  // Validação determinística ANTES da reserva do limite: pergunta longa demais é recusada sem consumir unidade
  // (frente N6 — recusa antes do provedor nunca consome; ver docs/ai/governanca-consumo-ia.md).
  if (question.trim().length > MAX_ALERT_CONSULT_QUESTION_LENGTH) {
    return { result: null, error: `A pergunta deve ter no máximo ${MAX_ALERT_CONSULT_QUESTION_LENGTH} caracteres.` };
  }
  const supabase = await createSupabaseServerClient();
  const outcome = await runSsmaRecordConsult(
    {
      getPermission: getCurrentProjectPermission,
      loadRecord: async (pid, rid) => {
        const { records } = await getFieldRecords(pid, new Map());
        return records.find((record) => record.id === rid) ?? null;
      },
      reserve: (pid, rid) => reserveAiConsult(supabase, pid, "SSMA", rid),
      consult: ({ projectId: pid, recordContext, question: q }) =>
        consultSsmaSpecialistForRecord(supabase, { projectId: pid, recordContext, question: q }),
    },
    { projectId, recordId, question }
  );
  return outcome.ok ? { result: outcome, error: null } : { result: null, error: outcome.error };
}
