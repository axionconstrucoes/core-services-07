"use client";

import type { ReactNode } from "react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { CRITICALITY_LABELS, warrantyStateLabel } from "@/lib/garantias/labels";
import { cn } from "@/lib/utils";

// Peças visuais do módulo GARANTIAS. Cores só por tokens semânticos / pares já usados no repo (fundo escuro + texto claro).
// Nenhum texto de ajuda é escrito aqui: tudo vem do catálogo (lib/ui/help/modules/garantias.ts) via FeatureInfo.

export const FIELD_CLASS =
  "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:text-muted-foreground";

export const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60";

export const BUTTON_OUTLINE_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-input bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60";

/** Rótulo de campo com o (i) AO LADO (nunca dentro do rótulo clicável). */
export function FieldLabel({ htmlFor, label, helpId, required }: { htmlFor: string; label: string; helpId: string; required?: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
      <label htmlFor={htmlFor}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <FeatureInfo helpId={helpId} />
    </span>
  );
}

export function SemDados({ children = "SEM DADOS" }: { children?: ReactNode }) {
  return <span className="font-semibold text-muted-foreground">{children}</span>;
}

type NoticeTone = "info" | "warning" | "error" | "success";
const NOTICE_TONE: Record<NoticeTone, string> = {
  info: "border-blue-800 bg-blue-100 text-blue-800",
  warning: "border-amber-800 bg-amber-100 text-amber-800",
  error: "border-red-800 bg-red-100 text-red-800",
  success: "border-emerald-800 bg-emerald-100 text-emerald-800",
};

export function Notice({ tone = "info", children, role, className }: { tone?: NoticeTone; children: ReactNode; role?: "alert" | "status"; className?: string }) {
  return (
    <div role={role} className={cn("rounded-md border px-3 py-2 text-sm", NOTICE_TONE[tone], className)}>
      {children}
    </div>
  );
}

const CRITICALITY_CLASS: Record<string, string> = {
  CRITICAL: "border-transparent bg-[#DC2626] text-[#FFFFFF] font-bold",
  HIGH: "border-transparent bg-[#FFD600] text-[#000000] font-bold",
  MEDIUM: "border-transparent bg-[#2563EB] text-[#FFFFFF] font-bold",
  LOW: "border-transparent bg-[#166534] text-[#FFFFFF] font-bold",
  SEM_DADOS: "border-border bg-card text-card-foreground",
};

export function CriticalityBadge({ criticality }: { criticality: string }) {
  return <Badge className={CRITICALITY_CLASS[criticality] ?? CRITICALITY_CLASS.SEM_DADOS}>{CRITICALITY_LABELS[criticality as keyof typeof CRITICALITY_LABELS] ?? criticality}</Badge>;
}

const STATE_VARIANT: Record<string, "default" | "secondary" | "outline" | "success" | "warning" | "info" | "destructive"> = {
  ABERTA: "info",
  EM_VISTORIA: "info",
  EM_ANALISE: "info",
  COBERTA: "success",
  NAO_COBERTA: "destructive",
  EM_REPARO: "warning",
  REPARADA: "warning",
  VERIFICADA: "success",
  ENCERRADA: "secondary",
  REABERTA: "warning",
  CANCELADA: "outline",
};

export function StateBadge({ state }: { state: string }) {
  return <Badge variant={STATE_VARIANT[state] ?? "outline"}>{warrantyStateLabel(state)}</Badge>;
}

/** AAAA-MM-DD ou ISO -> DD/MM/AAAA; ausente -> SEM DADOS (nunca "—" ou zero). */
export function formatDay(value: string | null | undefined): ReactNode {
  if (!value) return <SemDados />;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}

export function formatDateTime(value: string | null | undefined): ReactNode {
  if (!value) return <SemDados />;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatMoney(value: number | null | undefined): ReactNode {
  if (value === null || value === undefined) return <SemDados />;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Link seguro para a FONTE original (apenas http/https). Sem URL, mostra a referência como texto. */
export function SourceLink({ reference, url }: { reference: string; url?: string | null }) {
  if (url && /^https?:\/\//i.test(url)) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="break-words text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {reference}
      </a>
    );
  }
  return <span className="break-words">{reference}</span>;
}
