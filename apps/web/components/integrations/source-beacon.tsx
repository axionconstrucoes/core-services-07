import type { Beacon } from "@/lib/integrations/user-integration-matrix";

// Farol com ícone e texto (nunca só cor). VERDE = comprovado; VERMELHO = bloqueio, falha, pendência ou falta de comprovação.
const styles = {
  ok: "border-emerald-300 bg-emerald-800 text-white",
  bad: "border-red-300 bg-red-800 text-white",
};

export function SourceBeacon({ beacon, showReason = true }: { beacon: Beacon; showReason?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded border px-2 py-1 text-xs font-semibold ${beacon.ok ? styles.ok : styles.bad}`}
        title={beacon.reason}
      >
        <span aria-hidden="true" className={`inline-block h-2.5 w-2.5 rounded-full ${beacon.ok ? "bg-white" : "bg-white"}`} />
        <span className="sr-only">{beacon.ok ? "Comprovado: " : "Pendente: "}</span>
        {beacon.ok ? "✓" : "✕"} {beacon.label}
      </span>
      {showReason ? <span className="max-w-64 text-xs text-muted-foreground">{beacon.reason}</span> : null}
    </div>
  );
}
