// Filtros da consulta de registros de campo (puro): categoria, tipo, risco e período (data do fato, AAAA-MM-DD).
export interface RecordFilters {
  category?: string;
  kind?: string;
  risk?: string;
  from?: string;
  to?: string;
}

export function filterRecords<T extends { category: string; kind: string; risk: string; occurredAt: string }>(records: readonly T[], f: RecordFilters): T[] {
  return records.filter(
    (r) =>
      (!f.category || r.category === f.category) &&
      (!f.kind || r.kind === f.kind) &&
      (!f.risk || r.risk === f.risk) &&
      (!f.from || r.occurredAt.slice(0, 10) >= f.from) &&
      (!f.to || r.occurredAt.slice(0, 10) <= f.to)
  );
}
