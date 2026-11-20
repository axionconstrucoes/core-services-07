"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { HelpContent } from "@/components/shared/help-content";
import { ACC_FEATURE_HELP } from "@/lib/ui/feature-help";
import { cn } from "@/lib/utils";

// HelpHint — ÚNICO componente de ajuda contextual (Hover Text) do ACC. Todo texto vem do catálogo (lib/ui/help/registry.ts),
// nunca hardcoded em página. Interação:
//  - DESKTOP: o mouse sobre o ícone abre o painel; ele permanece aberto enquanto o ponteiro estiver sobre o ícone OU sobre o painel
//    (dá para ler e rolar); fecha ao sair (com pequena tolerância). Clique/Enter/Espaço "fixa" o painel.
//  - TECLADO: botão nativo (Enter/Espaço). Abrir por teclado leva o foco ao painel (rolável por setas); ESC fecha e devolve o foco ao
//    ícone; Tab para fora fecha. Foco visível.
//  - MOBILE/TOQUE: nunca depende de hover; o toque abre uma folha inferior rolável com botão Fechar (e toque fora fecha).
//  - POSIÇÃO: painel em portal com position:fixed, recalculado em scroll/resize; vira para cima se faltar espaço abaixo e é limitado
//    às bordas da tela; altura máxima com rolagem interna (overscroll contido); NUNCA rola a página automaticamente.
//  - Um painel por vez (evento global). Não usa o atributo title. Cliques/teclas nunca "vazam" para o elemento pai (linha, sidebar).

const OPEN_EVENT = "acc-help-open";
const HOVER_OPEN_DELAY_MS = 120;
const HOVER_CLOSE_DELAY_MS = 250;
const EDGE = 8;
const PANEL_MAX_WIDTH = 448;

type Placement = { mode: "floating"; top?: number; bottom?: number; left: number; width: number; maxHeight: number } | { mode: "sheet" };

const SHEET_QUERY = "(max-width: 639px), (pointer: coarse)";

function subscribeSheet(onChange: () => void) {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// Folha inferior em telas estreitas ou de toque; leitura via useSyncExternalStore (sem setState em efeito).
function useIsSheet(): boolean {
  return useSyncExternalStore(
    subscribeSheet,
    () => window.matchMedia(SHEET_QUERY).matches,
    () => false
  );
}

export function HelpHint({
  helpId,
  className,
  iconClassName,
}: {
  helpId: string;
  className?: string;
  iconClassName?: string;
}) {
  const help = ACC_FEATURE_HELP[helpId];
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();
  const titleId = useId();
  const sheet = useIsSheet();

  const clearTimers = useCallback(() => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    openTimer.current = null;
    closeTimer.current = null;
  }, []);

  // Posicionamento (desktop): dentro da tela, abaixo ou acima do ícone, sem rolar a página.
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    if (sheet) {
      setPlacement({ mode: "sheet" });
      return;
    }
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(PANEL_MAX_WIDTH, vw - EDGE * 2);
    const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, EDGE), vw - width - EDGE);
    const below = vh - rect.bottom - EDGE * 2;
    const above = rect.top - EDGE * 2;
    const natural = panelRef.current?.scrollHeight ?? 320;
    const placeBelow = below >= Math.min(natural, 280) || below >= above;
    const space = Math.max(120, placeBelow ? below : above);
    const maxHeight = Math.min(space, vh * 0.7);
    setPlacement(
      placeBelow
        ? { mode: "floating", top: rect.bottom + EDGE, left, width, maxHeight }
        : { mode: "floating", bottom: vh - rect.top + EDGE, left, width, maxHeight }
    );
  }, [sheet]);

  const close = useCallback(
    (returnFocus: boolean) => {
      clearTimers();
      setOpen(false);
      setPinned(false);
      setPlacement(null);
      if (returnFocus) triggerRef.current?.focus();
    },
    [clearTimers]
  );

  const openPanel = useCallback(
    (pin: boolean) => {
      clearTimers();
      window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: panelId }));
      reposition();
      setOpen(true);
      if (pin) setPinned(true);
    },
    [clearTimers, panelId, reposition]
  );

  // Um painel por vez.
  useEffect(() => {
    function onOtherOpen(event: Event) {
      if ((event as CustomEvent<string>).detail !== panelId) {
        setOpen(false);
        setPinned(false);
        setPlacement(null);
      }
    }
    window.addEventListener(OPEN_EVENT, onOtherOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOtherOpen);
  }, [panelId]);

  useEffect(() => clearTimers, [clearTimers]);

  // Fechamento: ESC, clique/toque fora.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close(false);
    }
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open, close]);

  // Abrir por clique/teclado leva o foco ao painel (rolagem por teclado); por hover, não rouba o foco.
  useEffect(() => {
    if (open && pinned && placement) panelRef.current?.focus({ preventScroll: true });
  }, [open, pinned, placement]);

  if (!help) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`HelpHint: helpId "${helpId}" não encontrado no catálogo de ajuda (lib/ui/help/registry.ts).`);
    }
    return null;
  }

  const scheduleClose = () => {
    if (pinned) return;
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => close(false), HOVER_CLOSE_DELAY_MS);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  const panel =
    open && placement && typeof document !== "undefined"
      ? createPortal(
          <>
            {placement.mode === "sheet" ? (
              <div className="fixed inset-0 z-[60] bg-black/50" aria-hidden="true" onPointerDown={() => close(false)} />
            ) : null}
            <div
              ref={panelRef}
              id={panelId}
              role="dialog"
              aria-modal="false"
              aria-labelledby={titleId}
              tabIndex={-1}
              data-help-id={help.id}
              data-help-version={help.version ?? undefined}
              className={cn(
                "z-[70] overflow-y-auto overscroll-contain rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none focus-visible:ring-2 focus-visible:ring-ring",
                placement.mode === "sheet" ? "fixed inset-x-2 bottom-2 max-h-[80vh]" : "fixed"
              )}
              style={
                placement.mode === "floating"
                  ? { top: placement.top, bottom: placement.bottom, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }
                  : undefined
              }
              onPointerEnter={cancelClose}
              onPointerLeave={scheduleClose}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Tab" && !event.shiftKey && placement.mode === "floating" && document.activeElement === panelRef.current) {
                  // Tab a partir do painel devolve ao fluxo normal sem prender o foco.
                  close(true);
                }
              }}
              onBlur={(event) => {
                const next = event.relatedTarget as Node | null;
                if (next && (panelRef.current?.contains(next) || triggerRef.current?.contains(next))) return;
                if (pinned && next) close(false);
              }}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p id={titleId} className="text-sm font-semibold text-foreground">
                  {help.title}
                </p>
                <button
                  type="button"
                  aria-label="Fechar ajuda"
                  className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => close(true)}
                >
                  <X className="size-4" aria-hidden="true" />
                </button>
              </div>
              <HelpContent help={help} />
              {help.version ? <p className="mt-3 text-[10px] text-muted-foreground">Versão do texto: {help.version}</p> : null}
            </div>
          </>,
          document.body
        )
      : null;

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Informações sobre ${help.title}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={cn(
          "-m-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
          iconClassName
        )}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (open && pinned) close(false);
          else openPanel(true);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "mouse" || open) {
            cancelClose();
            return;
          }
          cancelClose();
          openTimer.current = setTimeout(() => openPanel(false), HOVER_OPEN_DELAY_MS);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "mouse") return;
          if (openTimer.current) clearTimeout(openTimer.current);
          openTimer.current = null;
          scheduleClose();
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
      {panel}
    </span>
  );
}
