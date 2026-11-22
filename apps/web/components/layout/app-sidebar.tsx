"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  BookOpen,
  BookText,
  ClipboardCheck,
  FileStack,
  Gauge,
  History,
  LayoutDashboard,
  Leaf,
  ListChecks,
  PackagePlus,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Rocket,
  Scale,
  ShieldCheck,
  TimerReset,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { NAV_ITEMS } from "@/lib/ui/nav-items";
import { cn } from "@/lib/utils";

// Resolve NavItem.icon (nome de string, ver lib/ui/nav-items.ts) para o
// componente Lucide real — mesmo padrão de components/ai/expert-visual-identity.ts.
const ICONS_BY_NAME: Record<string, LucideIcon> = {
  AlertTriangle,
  BadgeCheck,
  Bot,
  BookOpen,
  BookText,
  ClipboardCheck,
  FileStack,
  Gauge,
  History,
  LayoutDashboard,
  Leaf,
  ListChecks,
  PackagePlus,
  Plug,
  Rocket,
  Scale,
  ShieldCheck,
  TimerReset,
  Users,
  Wallet,
  Wrench,
};

// Navegação lateral SEM texto flutuante NOS ITENS: nenhum tooltip, atributo title ou rótulo que só aparece no hover sobre o item.
// Todo item mostra SEMPRE ícone + texto, e o texto visível é o nome acessível do link (aria-label idêntico ao texto visível).
// Dois arranjos, ambos com o texto visível (trava em scripts/test-sidebar-sem-tooltip.mjs):
//  - expandido (desktop): ícone à esquerda e texto ao lado, em linha;
//  - compacto (menu recolhido no desktop e SEMPRE em telas < md/celular): ícone em cima e texto curto embaixo, centralizados,
//    numa coluna de 128 px — substitui o antigo modo "só ícones" (que dependia de dica flutuante para dizer o que era cada ícone).
// AJUDA (Hover Text universal): preservada por ÍCONE DEDICADO (i) ao lado do link (FeatureInfo, fora do <a>), que abre por clique/Enter/
// toque/foco — é um controle próprio, não um tooltip do item. Catálogo: NavItem.helpId (lib/ui/help); regras em test-feature-info.
// Foco por teclado: o contorno global (globals.css, a:focus-visible / button:focus-visible, 2 px com afastamento de 2 px) é mantido,
// só a cor passa a branco sobre o bordô (~10:1, inclusive em volta do item ativo creme); gap-1 entre itens evita que o contorno
// encoste no item vizinho.
// Ícone (i) sobre o fundo bordô: claro sobre escuro; "m-0": ocupa o próprio espaço (24 px) ao lado do link, sem sobrepô-lo.
const SIDEBAR_HINT_CLASS = "m-0 text-white/85 hover:text-white focus-visible:text-white focus-visible:ring-white";
// shrink-0: dentro da coluna rolável do <nav>, o item nunca encolhe abaixo do próprio conteúdo (texto em 2 linhas não invade o vizinho).
const ITEM_BASE = "flex w-full min-w-0 shrink-0 items-center rounded-[5px] font-medium transition-colors focus-visible:!outline-white";
const ITEM_EXPANDED = "min-h-9 flex-row gap-2.5 px-3 py-1.5 text-left text-[15px] leading-tight md:pointer-coarse:min-h-11";
const ITEM_COMPACT = "min-h-14 flex-col justify-center gap-1 px-1 py-1.5 text-center text-[11px] leading-[1.15]";
// Mesmo arranjo compacto, aplicado só abaixo de md quando o menu está "expandido" (celular nunca usa a largura de 264 px).
const ITEM_COMPACT_BELOW_MD =
  "max-md:min-h-14 max-md:flex-col max-md:justify-center max-md:gap-1 max-md:px-1 max-md:py-1.5 max-md:text-center max-md:text-[11px] max-md:leading-[1.15]";
const ITEM_IDLE = "text-white hover:bg-white/10 focus-visible:bg-white/10";
const ITEM_ACTIVE = "bg-[#f7f3ea] font-semibold text-[#5e1414]";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "acc.sidebar.collapsed";

// Store externo mínimo (useSyncExternalStore) em vez de useState+useEffect
// — é o jeito client-safe e sem hydration mismatch de sincronizar com
// localStorage: o servidor (sem localStorage) sempre "vê" o snapshot
// expandido (getServerSnapshot), e o React reconcilia com o valor real
// assim que hidrata, sem passar por um setState dentro de efeito.
let cachedCollapsed: boolean | null = null;
let listeners: Array<() => void> = [];

function getCollapsedSnapshot(): boolean {
  if (cachedCollapsed === null) {
    cachedCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  }
  return cachedCollapsed;
}

function getServerCollapsedSnapshot(): boolean {
  return false;
}

function subscribeCollapsed(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function setSidebarCollapsed(next: boolean): void {
  cachedCollapsed = next;
  window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
  for (const listener of listeners) listener();
}

export function AppSidebar({ projectId, hiddenHrefs = [] }: { projectId: string; hiddenHrefs?: string[] }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsedSnapshot, getServerCollapsedSnapshot);
  // Itens restritos (ex.: Financeiro) são resolvidos no layout server-side
  // e chegam aqui como lista de hrefs a esconder — a MESMA lista vale para
  // desktop, mobile e menu recolhido (uma única iteração abaixo).
  const visibleItems = NAV_ITEMS.filter((item) => !hiddenHrefs.includes(item.href));

  return (
    <aside
      className={cn(
        "acc-sidebar-grid flex shrink-0 flex-col border-r border-black/10 text-brand-sidebar-foreground transition-[width] duration-150",
        // Compacto (recolhido e celular): 128 px — texto do item em até 2-3 linhas de 11 px sob o ícone (+ 24 px do (i)), sem cortar palavra.
        collapsed ? "w-32" : "w-[264px] max-md:w-32"
      )}
    >
      <div className="flex h-20 items-center justify-center border-b border-white/15">
        {/* eslint-disable-next-line @next/next/no-img-element -- PNG estático em public/, sem otimização de imagem necessária. Logo ACC aparece SOMENTE aqui na sidebar — nunca duplicado na área de conteúdo/cards. O nome por extenso da marca agora vive só no cabeçalho superior (ver top-bar.tsx) — aqui fica só o símbolo, centralizado, sempre visível (expandida ou recolhida). */}
        <img src="/branding/acc-logo.png" alt="ACC" className="h-[55px] w-auto shrink-0" />
      </div>

      <nav id="acc-sidebar-nav" aria-label="Navegação principal" className={cn("flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden p-2", collapsed && "px-1.5", "max-md:px-1.5")}>
        {visibleItems.map((item) => {
          const href = `/${projectId}/${item.href}`;
          const active = pathname?.startsWith(href);
          const Icon = ICONS_BY_NAME[item.icon];

          return (
            <div key={item.href} className="flex shrink-0 items-center">
              <Link
                href={href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                // Sem prefetch automático: os ~16 itens deste menu, todos
                // visíveis ao mesmo tempo, disparavam uma rajada de
                // requisições RSC simultâneas a cada render (observado
                // causando 503 intermitente em segmentos aleatórios do
                // lote, por limite de concorrência da infraestrutura —
                // nunca erro de aplicação). A navegação em si (clique)
                // continua buscando os dados normalmente, só deixa de
                // adiantar rotas que o usuário ainda não pediu.
                prefetch={false}
                className={cn(ITEM_BASE, "flex-1", collapsed ? ITEM_COMPACT : cn(ITEM_EXPANDED, ITEM_COMPACT_BELOW_MD), active ? ITEM_ACTIVE : ITEM_IDLE)}
              >
                {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0" /> : null}
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.label}</span>
              </Link>
              <FeatureInfo helpId={item.helpId} className={cn("shrink-0", collapsed ? "ml-0" : "ml-1 max-md:ml-0")} iconClassName={SIDEBAR_HINT_CLASS} hitArea="vertical" />
            </div>
          );
        })}
      </nav>

      <div className={cn("border-t border-white/15 p-2", collapsed && "px-1.5", "max-md:px-1.5")}>
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!collapsed)}
            aria-label={collapsed ? "Expandir menu lateral" : "Recolher menu lateral"}
            aria-expanded={!collapsed}
            aria-controls="acc-sidebar-nav"
            className={cn(ITEM_BASE, "flex-1", collapsed ? ITEM_COMPACT : cn(ITEM_EXPANDED, ITEM_COMPACT_BELOW_MD), ITEM_IDLE)}
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4 shrink-0" /> : <PanelLeftClose aria-hidden="true" className="size-4 shrink-0" />}
            <span className={collapsed ? "text-[11px]" : "text-sm"}>{collapsed ? "Expandir menu" : "Recolher menu"}</span>
          </button>
          <FeatureInfo helpId="shared.global.menu-recolher" className={cn("shrink-0", collapsed ? "ml-0" : "ml-1 max-md:ml-0")} iconClassName={SIDEBAR_HINT_CLASS} hitArea="vertical" />
        </div>
      </div>
    </aside>
  );
}
