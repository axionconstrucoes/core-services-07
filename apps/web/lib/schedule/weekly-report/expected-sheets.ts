// Obrigatoriedade de abas DERIVADA DE EVIDÊNCIA (consultivo; não altera status, não aprova conteúdo).
// O modelo do relatório semanal evoluiu ao longo das semanas. Uma aba ausente é "esperada pelo modelo da época"
// quando NENHUM arquivo das semanas vizinhas a possui (o modelo vigente não tinha a aba) e "obrigatória ausente"
// quando as semanas vizinhas a possuem e este arquivo não. Sem vizinhança suficiente => indeterminada (decisão humana).
import type { WeeklyReportSheetCategory } from "./types";

export interface WorkbookPresence {
  /** Identificador do arquivo (ex.: SHA-256); arquivos repetidos devem ser desduplicados antes. */
  id: string;
  workWeek: number;
  /** Categorias cuja aba foi localizada no arquivo (qualquer status de extração). */
  found: ReadonlySet<WeeklyReportSheetCategory>;
}

export type MissingSheetVerdict = "ESPERADA_PELO_MODELO" | "OBRIGATORIA_AUSENTE" | "INDETERMINADA";

export interface MissingSheetAssessment {
  id: string;
  category: WeeklyReportSheetCategory;
  verdict: MissingSheetVerdict;
  /** Quantos arquivos vizinhos (excluindo o próprio) foram usados e quantos tinham a aba. */
  neighbors: number;
  neighborsWithSheet: number;
}

export const NEIGHBOR_WEEK_RADIUS = 3;
export const MIN_NEIGHBORS = 3;

export function assessMissingSheets(files: readonly WorkbookPresence[], categories: readonly WeeklyReportSheetCategory[]): MissingSheetAssessment[] {
  const out: MissingSheetAssessment[] = [];
  for (const file of files) {
    for (const category of categories) {
      if (file.found.has(category)) continue;
      const neighbors = files.filter((other) => other.id !== file.id && Math.abs(other.workWeek - file.workWeek) <= NEIGHBOR_WEEK_RADIUS);
      const withSheet = neighbors.filter((other) => other.found.has(category)).length;
      let verdict: MissingSheetVerdict;
      if (neighbors.length < MIN_NEIGHBORS) verdict = "INDETERMINADA";
      else if (withSheet === 0) verdict = "ESPERADA_PELO_MODELO";
      else if (withSheet === neighbors.length) verdict = "OBRIGATORIA_AUSENTE";
      else verdict = "INDETERMINADA"; // vizinhança mista (transição de modelo)
      out.push({ id: file.id, category, verdict, neighbors: neighbors.length, neighborsWithSheet: withSheet });
    }
  }
  return out;
}
