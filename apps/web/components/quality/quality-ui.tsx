import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TableHead } from "@/components/ui/table";
import { FeatureInfo } from "@/components/shared/feature-info";
import { SeverityBadge } from "@/components/shared/badges";
import {
  CLASSIFICATION_LABEL,
  CRITICALITY_LABEL,
  EPISTEMIC_LABEL,
  NCR_STATE_LABEL,
  criticalityToSeverity,
  label,
  type Kpi,
} from "@/lib/quality/ui-model";
import { formatDateTime } from "@/lib/labels";
import { cn } from "@/lib/utils";

// Peças de apresentação da Qualidade (somente tokens semânticos / variantes de Badge já validadas em contraste).

/** Cabeçalho de coluna com ajuda ao lado do rótulo (o helpId é escrito no ponto de uso). */
export function Th({ helpId, children, className }: { helpId: string; children: ReactNode; className?: string }) {
  return (
    // help-exempt: primitivo de cabeçalho de coluna; o helpId é informado em cada uso (<Th helpId="...">)
    <TableHead className={cn("whitespace-nowrap", className)}>
      <span className="inline-flex items-center gap-1">
        {children}
        <FeatureInfo helpId={helpId} />
      </span>
    </TableHead>
  );
}

const STATE_VARIANT: Record<string, "success" | "warning" | "info" | "secondary" | "outline" | "destructive"> = {
  ENCERRADA: "success",
  REABERTA: "warning",
  CANCELADA: "secondary",
  DUPLICADA: "secondary",
  NAO_CONFIRMADA: "secondary",
  CONFIRMADA: "info",
  DETECTADA: "outline",
};

export function NcrStateBadge({ state }: { state: string }) {
  return <Badge variant={STATE_VARIANT[state] ?? "outline"}>{label(NCR_STATE_LABEL, state)}</Badge>;
}

/** Criticidade: selo de risco do ACC; SEM_DADOS é texto explícito (nunca "baixo" por omissão). */
export function CriticalityBadge({ criticality }: { criticality: string | null | undefined }) {
  const sev = criticalityToSeverity(criticality);
  if (!sev) return <Badge variant="outline">{CRITICALITY_LABEL.SEM_DADOS}</Badge>;
  return <SeverityBadge severity={sev} />;
}

const CLASSIFICATION_VARIANT: Record<string, "warning" | "info" | "destructive" | "secondary"> = {
  SUSPEITA: "secondary",
  INDICIO: "info",
  NC_COMPROVADA: "destructive",
  RISCO_POTENCIAL: "warning",
};
export function ClassificationBadge({ classification }: { classification: string }) {
  return <Badge variant={CLASSIFICATION_VARIANT[classification] ?? "outline"}>{label(CLASSIFICATION_LABEL, classification)}</Badge>;
}
export function EpistemicBadge({ epistemic }: { epistemic: string }) {
  return <Badge variant="outline">{label(EPISTEMIC_LABEL, epistemic)}</Badge>;
}

/** Fonte rastreável: referência textual + link (somente http/https) para o documento, e-mail, foto, diário ou relatório. */
export function SourceLink({ reference, url }: { reference: string | null | undefined; url?: string | null }) {
  const safe = url && /^https?:\/\//i.test(url) ? url : null;
  if (!reference && !safe) return <span className="text-muted-foreground">SEM DADOS</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="break-words">{reference ?? "Fonte"}</span>
      {safe ? (
        <a href={safe} target="_blank" rel="noopener noreferrer" className={cn("underline underline-offset-2 hover:opacity-80", "max-md:inline-flex max-md:min-h-11 max-md:items-center pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center")}>
          abrir fonte
        </a>
      ) : null}
    </span>
  );
}

export function KpiCard({ title, helpId, kpi }: { title: string; helpId: string; kpi: Kpi }) {
  const noData = kpi.value === null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1 text-sm">
          {title}
          <FeatureInfo helpId={helpId} />
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={cn("text-2xl font-bold", noData && "text-lg text-muted-foreground")}>{kpi.display}</p>
        <p className="mt-1 text-xs text-muted-foreground">{kpi.detail}</p>
      </CardContent>
    </Card>
  );
}

export function SectionTitle({ title, helpId, children }: { title: string; helpId: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-1 text-base font-semibold text-foreground">
        {title}
        <FeatureInfo helpId={helpId} />
      </h2>
      {children}
    </div>
  );
}

/** Campo de filtro (formulário GET, renderizado no servidor): rótulo + ajuda ao lado; o controle recebe id="f-<name>". */
export function FilterField({ name, label: text, helpId, children }: { name: string; label: string; helpId: string; children: ReactNode }) {
  return (
    <div className="flex min-w-40 flex-col gap-1.5">
      <div className="flex items-center gap-1 text-sm font-medium text-foreground">
        <label htmlFor={`f-${name}`}>{text}</label>
        <FeatureInfo helpId={helpId} />
      </div>
      {children}
    </div>
  );
}

export const when =(iso: string | null | undefined): string => (iso ? formatDateTime(iso) : "SEM DADOS");

export function RncLink({ projectId, id, code }: { projectId: string; id: string | null | undefined; code: string | undefined }) {
  if (!id) return <span className="text-muted-foreground">—</span>;
  return (
    <Link href={`/${projectId}/qualidade/rnc/${id}`} className="font-medium underline underline-offset-2 hover:opacity-80 max-md:inline-flex max-md:min-h-11 max-md:items-center pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">
      {code ?? "RNC"}
    </Link>
  );
}
