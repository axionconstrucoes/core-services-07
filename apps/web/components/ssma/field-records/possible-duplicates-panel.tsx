import { decideIncidentLinkAction } from "@/app/[projectId]/ssma-registros/incident-link-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PossibleDuplicate } from "@/lib/ssma/dashboard-metrics";

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

// Revisão humana de possíveis duplicidades (acidente de formulário × ocorrência de campo até 24 h um do outro).
// Enquanto ninguém decide, NADA é descontado do total do Dashboard.
export function PossibleDuplicatesPanel({
  projectId,
  pairs,
  labels,
}: {
  projectId: string;
  pairs: PossibleDuplicate[];
  labels: Record<string, { form: string; record: string }>;
}) {
  if (pairs.length === 0) return null;
  return (
    <Card data-testid="possible-duplicates">
      <CardHeader>
        <CardTitle className="text-base">Possíveis duplicidades de acidente ({pairs.length})</CardTitle>
        <p className="text-xs text-muted-foreground">
          Um acidente do formulário e uma ocorrência de campo foram registrados com até 24 h de diferença. Só você, Administrador, decide:
          “Mesmo fato” conta os dois relatos uma vez no Dashboard; “Fatos distintos” mantém os dois e para de sugerir. Nada é apagado e a decisão fica na auditoria.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {pairs.map((pair) => (
          <div key={`${pair.formSubmissionId}-${pair.fieldRecordId}`} className="rounded-md border p-3 text-sm">
            <p><strong>Formulário de acidente:</strong> {labels[pair.formSubmissionId]?.form ?? pair.formSubmissionId} — {when(pair.formOccurredAt)}</p>
            <p><strong>Ocorrência de campo:</strong> {labels[pair.fieldRecordId]?.record ?? pair.fieldRecordId} — {when(pair.recordOccurredAt)}</p>
            <p className="text-xs text-muted-foreground">Diferença: {pair.gapMinutes} min</p>
            <form action={decideIncidentLinkAction} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="formSubmissionId" value={pair.formSubmissionId} />
              <input type="hidden" name="fieldRecordId" value={pair.fieldRecordId} />
              <input name="note" maxLength={500} placeholder="Observação (opcional)" className="min-w-48 flex-1 rounded-md border px-2 py-1 text-sm" />
              <button type="submit" name="decision" value="SAME_FACT" className="rounded-md border border-[#7f1d1d] px-3 py-1.5 text-sm font-semibold text-[#7f1d1d]">Mesmo fato</button>
              <button type="submit" name="decision" value="DISTINCT_FACTS" className="rounded-md border px-3 py-1.5 text-sm font-semibold">Fatos distintos</button>
            </form>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
