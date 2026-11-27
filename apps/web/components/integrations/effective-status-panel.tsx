// Painel "Estado efetivo dos serviços" (Integrações): cruza o estado
// declarado de cada fonte com o estado real do agendador (pg_cron +
// heartbeats). Somente leitura — nenhuma ação altera o agendador.

import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDateTimeBrt, type EffectiveStatusResult, type EffectiveStatusTone } from "@/lib/integrations/effective-status";

const TONE_CLASS: Record<EffectiveStatusTone, string> = {
  ok: "border-emerald-700 bg-emerald-700 text-white",
  warning: "border-amber-500 bg-amber-100 text-amber-950",
  error: "border-red-700 bg-red-700 text-white",
  neutral: "border-slate-400 bg-slate-100 text-slate-900",
};

export interface EffectiveStatusRow extends EffectiveStatusResult {
  key: string;
  serviceLabel: string;
}

function volumeText(row: EffectiveStatusResult): string {
  if (row.processed === null && row.pending === null) return "—";
  const parts: string[] = [];
  if (row.processed !== null) parts.push(`${row.processed} processado(s)`);
  if (row.pending !== null) parts.push(`${row.pending} pendente(s)`);
  return parts.join(" · ");
}

function RowsTable({ rows, caption }: { rows: EffectiveStatusRow[]; caption: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-xs">
        <caption className="pb-1 text-left text-xs font-semibold text-foreground">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-1 pr-2 font-medium">Serviço</th>
            <th className="py-1 pr-2 font-medium">Estado efetivo</th>
            <th className="py-1 pr-2 font-medium">Frequência</th>
            <th className="py-1 pr-2 font-medium">Última execução</th>
            <th className="py-1 pr-2 font-medium">Último sucesso</th>
            <th className="py-1 pr-2 font-medium">Última falha</th>
            <th className="py-1 pr-2 font-medium">Próxima execução</th>
            <th className="py-1 pr-2 font-medium">Volume</th>
            <th className="py-1 pr-2 font-medium">Motivo</th>
            <th className="py-1 font-medium">Ação recomendada</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b align-top last:border-b-0" data-testid={`estado-efetivo-${row.key}`}>
              <td className="py-1 pr-2 font-medium text-foreground">
                {row.serviceLabel}
                {row.jobname ? <span className="block font-mono text-[10px] text-muted-foreground">{row.jobname}</span> : null}
              </td>
              <td className="py-1 pr-2">
                <span className={`inline-block whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${TONE_CLASS[row.tone]}`}>{row.label}</span>
              </td>
              <td className="py-1 pr-2">{row.frequency}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{fmtDateTimeBrt(row.lastRunAt)}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{fmtDateTimeBrt(row.lastSuccessAt)}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{fmtDateTimeBrt(row.lastFailureAt)}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{row.nextRunAt ? fmtDateTimeBrt(row.nextRunAt) : row.jobname ? "— (job inativo ou indisponível)" : "—"}</td>
              <td className="py-1 pr-2">{volumeText(row)}</td>
              <td className="py-1 pr-2">{row.reason}</td>
              <td className="py-1">{row.action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EffectiveStatusPanel({
  sources,
  services,
  schedulerAvailable,
  measuredAt,
}: {
  sources: EffectiveStatusRow[];
  services: EffectiveStatusRow[];
  schedulerAvailable: boolean;
  measuredAt: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Estado efetivo dos serviços
          <FeatureInfo helpId="integracoes.integracoes.estado-efetivo" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Estado comprovado pelo agendador (job ligado, última execução, último sucesso), não apenas a configuração declarada. Medido em {fmtDateTimeBrt(measuredAt)} (horário de Brasília).
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!schedulerAvailable ? (
          <p className="rounded-md border border-amber-500 bg-amber-50 p-2 text-xs text-amber-950" data-testid="estado-agendador-indisponivel">
            Estado do agendador indisponível: nenhuma fonte automática é exibida como OPERACIONAL até que o estado do agendador possa ser lido.
          </p>
        ) : null}
        <RowsTable rows={sources} caption="Fontes deste projeto" />
        {services.length > 0 ? <RowsTable rows={services} caption="Serviços do agendador (globais, compartilhados por todas as obras)" /> : null}
      </CardContent>
    </Card>
  );
}
