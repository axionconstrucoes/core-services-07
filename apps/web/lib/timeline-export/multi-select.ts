// Regra de seleção dos grupos de checkbox dos filtros da Timeline (Fontes, Categorias, Participantes).
// Semântica do filtro (a mesma de apply-filters.ts e da exportação): lista VAZIA = sem restrição ("Todos").
// Três estados por grupo, para nunca remarcar sozinha uma opção que o usuário desmarcou:
//  - TODAS marcadas  → selected=[] e cleared=false;
//  - PARCIAL         → selected com as opções marcadas;
//  - NENHUMA marcada → selected=[] e cleared=true (seleção vazia: o filtro não restringe nada).

export interface MultiSelection<T> {
  selected: T[];
  cleared: boolean;
}

export type MultiSelectionAction<T> = { type: "toggle"; value: T } | { type: "all" };

export function computeNextSelection<T>(
  selected: T[],
  cleared: boolean,
  allValues: T[],
  action: MultiSelectionAction<T>
): MultiSelection<T> {
  const allChecked = selected.length === 0 && !cleared;
  if (action.type === "all") {
    // "Todos": se já estão todas marcadas, desmarca todas; senão marca todas.
    return allChecked ? { selected: [], cleared: true } : { selected: [], cleared: false };
  }
  const { value } = action;
  if (allChecked) {
    const rest = allValues.filter((item) => item !== value);
    return rest.length === 0 ? { selected: [], cleared: true } : { selected: rest, cleared: false };
  }
  if (selected.length === 0) return { selected: [value], cleared: false }; // vinha de "nenhuma marcada"
  const next = selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
  if (next.length === 0) return { selected: [], cleared: true };
  if (next.length === allValues.length) return { selected: [], cleared: false };
  return { selected: next, cleared: false };
}
