"use client";

import { useRouter } from "next/navigation";
import { useTransition, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FeatureInfo } from "@/components/shared/feature-info";

export type AuditFilterState = {
  tipo: string;
  de: string;
  ate: string;
  responsavel: string;
  q: string;
};

type Props = {
  projectId: string;
  state: AuditFilterState;
  filters: ReadonlyArray<{ value: string; label: string; count: number }>;
  actorOptions: ReadonlyArray<{ value: string; label: string }>;
  page: number;
  pageCount: number;
  totalMatching: number;
};

/** Monta a URL da Auditoria; os filtros ficam na URL (persistem ao atualizar e no histórico do navegador). */
export function auditHref(projectId: string, state: AuditFilterState, page = 1): string {
  const params = new URLSearchParams();
  if (state.tipo && state.tipo !== "TODOS") params.set("tipo", state.tipo);
  if (state.de) params.set("de", state.de);
  if (state.ate) params.set("ate", state.ate);
  if (state.responsavel) params.set("responsavel", state.responsavel);
  if (state.q) params.set("q", state.q);
  if (page > 1) params.set("pagina", String(page));
  const query = params.toString();
  return `/${projectId}/auditoria${query ? `?${query}` : ""}`;
}

export function AuditFilterBar({ projectId, state, filters, actorOptions, page, pageCount, totalMatching }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const go = (next: AuditFilterState, nextPage = 1) => {
    startTransition(() => router.push(auditHref(projectId, next, nextPage), { scroll: false }));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    go({
      tipo: state.tipo,
      de: String(form.get("de") ?? ""),
      ate: String(form.get("ate") ?? ""),
      responsavel: String(form.get("responsavel") ?? ""),
      q: String(form.get("q") ?? "").trim(),
    });
  };

  const hasFilters = state.tipo !== "TODOS" || Boolean(state.de || state.ate || state.responsavel || state.q);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" aria-busy={isPending} data-testid="audit-filter-bar">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1 text-sm font-semibold uppercase tracking-wide">
          FILTRAR REGISTROS DE AUDITORIA
          <FeatureInfo helpId="admin.auditoria.filtros" />
        </span>
        {filters.map((filter) => {
          const active = state.tipo === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => go({ ...state, tipo: filter.value })}
              aria-pressed={active}
              data-audit-filter={filter.value}
              disabled={isPending}
              className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait"
            >
              <Badge variant={active ? "default" : "outline"} className="cursor-pointer text-sm">
                {filter.label}
                <span className="ml-1 rounded bg-black/20 px-1.5 font-mono text-xs tabular-nums" data-audit-count={filter.value}>
                  {filter.count.toLocaleString("pt-BR")}
                </span>
              </Badge>
            </button>
          );
        })}
      </div>

      <form key={`${state.de}|${state.ate}|${state.responsavel}|${state.q}`} onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        {/* help-exempt: campo do formulário de filtros descrito em admin.auditoria.filtros (datas, responsável, palavra-chave, aplicar e limpar) */}
        <label className="flex flex-col gap-1 text-xs font-medium">
          Data inicial
          <Input type="date" name="de" defaultValue={state.de} className="w-40" aria-label="Data inicial (Brasília)" />
        </label>
        {/* help-exempt: campo do formulário de filtros descrito em admin.auditoria.filtros (datas, responsável, palavra-chave, aplicar e limpar) */}
        <label className="flex flex-col gap-1 text-xs font-medium">
          Data final
          <Input type="date" name="ate" defaultValue={state.ate} className="w-40" aria-label="Data final (Brasília)" />
        </label>
        {/* help-exempt: campo do formulário de filtros descrito em admin.auditoria.filtros (datas, responsável, palavra-chave, aplicar e limpar) */}
        <label className="flex flex-col gap-1 text-xs font-medium">
          Responsável
          <Select name="responsavel" defaultValue={state.responsavel} aria-label="Responsável" className="w-56">
            <option value="">Todos os responsáveis</option>
            {actorOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
        {/* help-exempt: campo do formulário de filtros descrito em admin.auditoria.filtros (datas, responsável, palavra-chave, aplicar e limpar) */}
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs font-medium">
          Palavra-chave
          <Input type="search" name="q" defaultValue={state.q} placeholder="Ação, entidade ou detalhe" aria-label="Palavra-chave" maxLength={80} />
        </label>
        {/* help-exempt: campo do formulário de filtros descrito em admin.auditoria.filtros (datas, responsável, palavra-chave, aplicar e limpar) */}
        <Button type="submit" disabled={isPending}>
          Aplicar filtros
        </Button>
        {/* help-exempt: botão Limpar filtros descrito em admin.auditoria.filtros (volta a Todos e apaga datas, responsável e palavra-chave) */}
        <Button
          type="button"
          variant="outline"
          disabled={isPending || !hasFilters}
          onClick={() => go({ tipo: "TODOS", de: "", ate: "", responsavel: "", q: "" })}
        >
          Limpar filtros
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm" role="status" aria-live="polite">
        <span data-testid="audit-total">
          {isPending ? (
            <span className="inline-flex items-center gap-2 font-medium">
              <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
              Carregando registros…
            </span>
          ) : (
            <>
              {totalMatching.toLocaleString("pt-BR")} registro(s) · página {page} de {pageCount}
            </>
          )}
        </span>
        <AuditPager page={page} pageCount={pageCount} disabled={isPending} onGo={(nextPage) => go(state, nextPage)} />
      </div>
    </div>
  );
}

export function AuditPager({
  page,
  pageCount,
  disabled,
  onGo,
}: {
  page: number;
  pageCount: number;
  disabled?: boolean;
  onGo: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="flex items-center gap-1" aria-label="Paginação da auditoria">
      {/* help-exempt: navegação de páginas descrita em admin.auditoria.filtros (parâmetro pagina=, 50 registros por página) */}
      <Button type="button" size="sm" variant="outline" disabled={disabled || page <= 1} onClick={() => onGo(1)}>
        « Primeira
      </Button>
      {/* help-exempt: navegação de páginas descrita em admin.auditoria.filtros (parâmetro pagina=, 50 registros por página) */}
      <Button type="button" size="sm" variant="outline" disabled={disabled || page <= 1} onClick={() => onGo(page - 1)}>
        ‹ Anterior
      </Button>
      <span className="px-2 tabular-nums">
        {page} / {pageCount}
      </span>
      {/* help-exempt: navegação de páginas descrita em admin.auditoria.filtros (parâmetro pagina=, 50 registros por página) */}
      <Button type="button" size="sm" variant="outline" disabled={disabled || page >= pageCount} onClick={() => onGo(page + 1)}>
        Próxima ›
      </Button>
      {/* help-exempt: navegação de páginas descrita em admin.auditoria.filtros (parâmetro pagina=, 50 registros por página) */}
      <Button type="button" size="sm" variant="outline" disabled={disabled || page >= pageCount} onClick={() => onGo(pageCount)}>
        Última »
      </Button>
    </nav>
  );
}

/** Paginação repetida abaixo da tabela, com o mesmo estado de carregamento. */
export function AuditBottomPager({ projectId, state, page, pageCount }: { projectId: string; state: AuditFilterState; page: number; pageCount: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center justify-end gap-3 text-sm">
      {isPending ? <span className="font-medium">Carregando registros…</span> : null}
      <AuditPager
        page={page}
        pageCount={pageCount}
        disabled={isPending}
        onGo={(nextPage) => startTransition(() => router.push(auditHref(projectId, state, nextPage)))}
      />
    </div>
  );
}
