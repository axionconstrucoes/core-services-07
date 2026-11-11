import Link from "next/link";
import type { UserSourceRow } from "@/lib/integrations/user-integration-matrix";

// Resumo compacto: um farol por etapa, sempre com texto. Detalhes e motivos completos ficam na aba Integrações.
export function MemberSourceBeacons({ row, projectId }: { row: UserSourceRow | undefined; projectId: string }) {
  if (!row) return <span className="text-xs text-muted-foreground">Sem dados</span>;
  const stages: [string, boolean, string][] = [
    ["Aceite", row.authorization.ok, row.authorization.reason],
    ["Conexão", row.technical.ok, row.technical.reason],
    ["Coleta", row.collection.ok, row.collection.reason],
    ["Material", row.material.ok, row.material.reason],
  ];
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <ul className="flex flex-wrap gap-1" aria-label={`Etapas das fontes de ${row.name}`}>
        {stages.map(([label, ok, reason]) => (
          <li
            key={label}
            title={reason}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-semibold ${ok ? "border-emerald-300 bg-emerald-800 text-white" : "border-red-300 bg-red-800 text-white"}`}
          >
            <span aria-hidden="true" className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-white" : "bg-white"}`} />
            <span className="sr-only">{ok ? "Comprovado: " : "Pendente: "}</span>
            {ok ? "✓" : "✕"} {label}
          </li>
        ))}
      </ul>
      <p className="max-w-56 text-xs text-muted-foreground">{row.overall.reason}</p>
      <Link href={`/${projectId}/integracoes`} className="text-xs font-semibold text-brand-sidebar underline underline-offset-2">Ver detalhes</Link>
    </div>
  );
}
