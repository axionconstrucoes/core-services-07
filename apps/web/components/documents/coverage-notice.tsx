import Link from "next/link";
import { FeatureInfo } from "@/components/shared/feature-info";
import { formatPageList } from "@/lib/documents/extraction/extraction-coverage";
import type { VersionCoverageSummary } from "@/lib/documents/extraction/version-coverage-summary";

// Aviso de cobertura parcial / revisão visual para listas (cards de
// documentos, revisão de cláusulas). Nunca some enquanto houver página
// pendente: a lista de páginas fica sempre visível (sem colapsar).

export function CoverageNotice({
  summary,
  projectId,
  context,
}: {
  summary: VersionCoverageSummary;
  projectId: string;
  context: "documento" | "clausulas";
}) {
  if (!summary.partial && summary.visualReviewPages.length === 0) return null;

  const href = `/${projectId}/documentos/versoes/${summary.documentVersionId}`;
  return (
    <div
      role={summary.partial ? "alert" : "status"}
      className={
        summary.partial
          ? "rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800"
          : "rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800"
      }
    >
      {summary.partial ? (
        <p className="font-semibold">
          Leitura parcial: {summary.readPages ?? "?"}/{summary.totalPages ?? "?"} páginas lidas ·{" "}
          {summary.pendingPages.length} página(s) pendente(s)
          {context === "clausulas"
            ? " — cláusulas nessas páginas podem não ter sido detectadas; esta lista não é a análise integral do contrato."
            : " — documento não integralmente lido nem analisado."}
        </p>
      ) : null}
      {summary.pendingPages.length > 0 ? (
        <p className="mt-0.5">Páginas pendentes: {formatPageList(summary.pendingPages)}</p>
      ) : null}
      {summary.visualReviewPages.length > 0 ? (
        <p className="mt-0.5">
          Revisão visual necessária (desenhos, tabelas, figuras): {summary.visualReviewPages.length} página(s) —{" "}
          {formatPageList(summary.visualReviewPages)}
        </p>
      ) : null}
      <span className="mt-1 inline-flex items-center gap-1">
        <Link href={href} className="font-medium underline underline-offset-2">
          Ver cobertura e abrir páginas originais
        </Link>
        <FeatureInfo helpId="juridico.documentos.cobertura-leitura" />
      </span>
    </div>
  );
}
