"use client";

import { useState } from "react";
import type { ImplicationCategory, SourceType } from "@axion/types";
import { categoryLabels, sourceTypeShortLabels } from "@/lib/labels";
import { computeNextSelection, type MultiSelectionAction } from "@/lib/timeline-export/multi-select";
import type {
  TimelineFilterCriteria,
  TimelineParticipant,
} from "@/lib/timeline-export/types";

const sourceTypes =
  Object.keys(sourceTypeShortLabels) as SourceType[];

const categories =
  Object.keys(categoryLabels) as ImplicationCategory[];

// Semântica do filtro (a mesma de apply-filters.ts e da exportação): lista VAZIA = sem restrição ("Todos").
// A tela distingue três estados por grupo, para nunca remarcar sozinha uma opção que o usuário desmarcou:
//  - TODAS marcadas  → lista [] e cleared=false ("Todos" marcado, todas as caixas marcadas);
//  - PARCIAL         → lista com as opções marcadas;
//  - NENHUMA marcada → lista [] e cleared=true: nenhuma caixa marcada; por ser seleção vazia, o filtro não
//    restringe nada (continua exibindo tudo) e a tela avisa isso.
export interface MultiCheckOption<T> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

function MultiCheckGroup<T extends string>({
  legend,
  options,
  selected,
  cleared,
  onSelect,
  emptyMessage,
  scroll = false,
}: {
  legend: string;
  options: MultiCheckOption<T>[];
  selected: T[];
  cleared: boolean;
  onSelect: (selected: T[], cleared: boolean) => void;
  emptyMessage?: string;
  scroll?: boolean;
}) {
  const allValues = options.map((option) => option.value);
  const noneChecked = selected.length === 0 && cleared;
  const allChecked = selected.length === 0 && !cleared;
  const apply = (action: MultiSelectionAction<T>) => {
    const next = computeNextSelection(selected, cleared, allValues, action);
    onSelect(next.selected, next.cleared);
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-medium text-muted-foreground">{legend}</legend>

      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
        <input type="checkbox" checked={allChecked} onChange={() => apply({ type: "all" })} />
        Todos
      </label>

      {noneChecked ? (
        <span data-vazio className="text-xs text-muted-foreground">
          Nenhuma opção marcada — exibindo todas (sem filtro).
        </span>
      ) : null}

      <div className={scroll ? "flex max-h-32 flex-col gap-1 overflow-y-auto" : "flex flex-col gap-1.5"}>
        {options.length === 0 && emptyMessage ? (
          <span className="text-xs text-muted-foreground">{emptyMessage}</span>
        ) : (
          options.map((option) => (
            <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm" title={option.title}>
              <input
                type="checkbox"
                checked={allChecked || selected.includes(option.value)}
                onChange={() => apply({ type: "toggle", value: option.value })}
              />
              {option.label}
            </label>
          ))
        )}
      </div>
    </fieldset>
  );
}

export function TimelineFilters({
  criteria,
  participants,
  projectStartDate,
  projectEndDate,
  onChange,
  isSearching,
  resultCount,
  searchProgress,
  searchScannedCount,
  searchError,
}: {
  criteria: TimelineFilterCriteria;
  participants: TimelineParticipant[];
  projectStartDate: string | null;
  projectEndDate: string | null;
  onChange: (next: TimelineFilterCriteria) => void;
  isSearching: boolean;
  resultCount: number;
  searchProgress: number;
  searchScannedCount: number;
  searchError: string | null;
}) {
  const [cleared, setCleared] = useState({ sources: false, categories: false, participants: false });
  // "Todo período da obra" desmarcado de propósito (mesmo quando a obra não tem datas e null/null seria igual ao período todo).
  const [customPeriod, setCustomPeriod] = useState(false);

  const wholeProjectPeriod =
    !customPeriod &&
    criteria.dateFrom === projectStartDate &&
    criteria.dateTo === projectEndDate;

  const hasSearch = criteria.searchText.trim().length > 0;

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border p-4">
      <div className="flex flex-col gap-2">
        <label
          htmlFor="timeline-search"
          className="text-sm font-semibold"
        >
          Buscar palavra / assunto
        </label>

        <input
          id="timeline-search"
          type="search"
          value={criteria.searchText}
          onChange={(event) =>
            onChange({
              ...criteria,
              searchText: event.target.value,
            })
          }
          placeholder="Ex.: compactação do solo"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        />

        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-muted-foreground">
            Pesquisa todo o acervo: e-mails, anexos, documentos,
            conteúdo extraído, Diário de Obra, Construmanager,
            relatórios, eventos e anotações.
          </span>

          {hasSearch ? (
            <span className="shrink-0 text-sm font-semibold">
              {searchError
                ? "Erro na busca"
                : isSearching
                  ? `Buscando... ${searchProgress}%`
                  : `${resultCount} resultado${
                      resultCount === 1 ? "" : "s"
                    } encontrado${
                      resultCount === 1 ? "" : "s"
                    }`}
            </span>
          ) : null}
        </div>

        {hasSearch ? (
          <div className="space-y-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-[width] duration-150"
                style={{
                  width: `${Math.max(
                    2,
                    Math.min(100, searchProgress)
                  )}%`,
                }}
              />
            </div>

            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {isSearching
                  ? "Pesquisando o acervo completo..."
                  : searchError
                    ? searchError
                    : "Busca concluída"}
              </span>

              {!isSearching &&
              !searchError &&
              searchScannedCount > 0 ? (
                <span>
                  {searchScannedCount} itens examinados
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MultiCheckGroup
          legend="Fontes"
          options={sourceTypes.map((source) => ({ value: source, label: sourceTypeShortLabels[source] }))}
          selected={criteria.sources}
          cleared={cleared.sources}
          onSelect={(sources, isCleared) => {
            setCleared((state) => ({ ...state, sources: isCleared }));
            onChange({ ...criteria, sources });
          }}
        />

        <MultiCheckGroup
          legend="Categorias/Impactos"
          options={categories.map((category) => ({ value: category, label: categoryLabels[category] }))}
          selected={criteria.categories}
          cleared={cleared.categories}
          onSelect={(next, isCleared) => {
            setCleared((state) => ({ ...state, categories: isCleared }));
            onChange({ ...criteria, categories: next });
          }}
        />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Período
          </span>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={wholeProjectPeriod}
              onChange={(event) => {
                if (event.target.checked) {
                  setCustomPeriod(false);
                  onChange({
                    ...criteria,
                    dateFrom: projectStartDate,
                    dateTo: projectEndDate,
                  });
                } else {
                  setCustomPeriod(true);
                  onChange({
                    ...criteria,
                    dateFrom: null,
                    dateTo: null,
                  });
                }
              }}
            />
            Todo período da obra
          </label>

          <label className="flex flex-col gap-1 text-sm">
            De
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={criteria.dateFrom ?? ""}
              disabled={wholeProjectPeriod}
              onChange={(event) =>
                onChange({
                  ...criteria,
                  dateFrom: event.target.value || null,
                })
              }
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Até
            <input
              type="date"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              value={criteria.dateTo ?? ""}
              disabled={wholeProjectPeriod}
              onChange={(event) =>
                onChange({
                  ...criteria,
                  dateTo: event.target.value || null,
                })
              }
            />
          </label>
        </div>

        <MultiCheckGroup
          legend="Participantes (e-mail)"
          scroll
          emptyMessage="Nenhum participante identificado nos e-mails do projeto."
          options={participants.map((participant) => ({
            value: participant.address,
            title: participant.address,
            label: (
              <>
                <span className="truncate">{participant.address}</span>
                <span className="text-xs text-muted-foreground">({participant.eventCount})</span>
              </>
            ),
          }))}
          selected={criteria.participants}
          cleared={cleared.participants}
          onSelect={(next, isCleared) => {
            setCleared((state) => ({ ...state, participants: isCleared }));
            onChange({ ...criteria, participants: next });
          }}
        />
      </div>
    </div>
  );
}
