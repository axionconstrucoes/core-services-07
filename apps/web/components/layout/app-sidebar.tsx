"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  Bot,
  BookOpen,
  BookText,
  ClipboardCheck,
  FileStack,
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
  type LucideIcon,
} from "lucide-react";
import { FeatureInfo } from "@/components/shared/feature-info";
import { NAV_ITEMS } from "@/lib/ui/nav-items";
import { cn } from "@/lib/utils";

// Resolve NavItem.icon (nome de string, ver lib/ui/nav-items.ts) para o
// componente Lucide real — mesmo padrão de components/ai/expert-visual-identity.ts.
const ICONS_BY_NAME: Record<string, LucideIcon> = {
  AlertTriangle,
  Bot,
  BookOpen,
  BookText,
  ClipboardCheck,
  FileStack,
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
};

// Ícone (i) sobre o fundo bordô da sidebar: claro sobre escuro (o padrão text-muted-foreground não tem contraste aqui).
// "m-0": o (i) ocupa o próprio espaço (24 px) ao lado do link, sem a margem negativa que o sobrepunha ao link em ~4 px no menu recolhido.
const SIDEBAR_HINT_CLASS = "m-0 text-white/85 hover:text-white focus-visible:text-white focus-visible:ring-white";

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
        // Recolhido: 64 px com mouse; 81 px em celular/toque (borda 1 + preenchimento 12 + link 44 + (i) 24), para os alvos de toque não se sobreporem.
        collapsed ? "w-16 max-md:w-[81px] pointer-coarse:w-[81px]" : "w-[264px] max-md:w-[81px]"
      )}
    >
      <div className="flex h-20 items-center justify-center border-b border-white/15">
        {/* eslint-disable-next-line @next/next/no-img-element -- PNG estático em public/, sem otimização de imagem necessária. Logo ACC aparece SOMENTE aqui na sidebar — nunca duplicado na área de conteúdo/cards. O nome por extenso da marca agora vive só no cabeçalho superior (ver top-bar.tsx) — aqui fica só o símbolo, centralizado, sempre visível (expandida ou recolhida). */}
        <img src="/branding/acc-logo.png" alt="ACC" className="h-[55px] w-auto shrink-0" />
      </div>

      <nav className={cn("flex min-h-0 flex-1 flex-col gap-0 overflow-y-auto overflow-x-hidden p-2", collapsed && "px-1.5", "max-md:px-1.5")}>
        {visibleItems.map((item) => {
          const href = `/${projectId}/${item.href}`;
          const active = pathname?.startsWith(href);
          const Icon = ICONS_BY_NAME[item.icon];

          return (
            // Ajuda universal (Hover Text): o ícone (i) fica AO LADO do link (nunca dentro do <a>), então funciona por mouse, teclado
            // (Tab + Enter/Espaço) e toque, também com o menu recolhido (só ícones) — nunca depende de hover nem do atributo title.
            <div key={item.href} className="flex items-center">
              <Link
                href={href}
                aria-label={item.label}
                // Sem prefetch automático: os ~16 itens deste menu, todos
                // visíveis ao mesmo tempo, disparavam uma rajada de
                // requisições RSC simultâneas a cada render (observado
                // causando 503 intermitente em segmentos aleatórios do
                // lote, por limite de concorrência da infraestrutura —
                // nunca erro de aplicação). A navegação em si (clique)
                // continua buscando os dados normalmente, só deixa de
                // adiantar rotas que o usuário ainda não pediu.
                prefetch={false}
                className={cn(
                  "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-[5px] px-3 py-1.5 text-[15px] font-medium transition-colors pointer-coarse:min-h-11 max-md:min-h-11",
                  collapsed && "justify-center px-0",
                  "max-md:justify-center max-md:px-0",
                  active ? "bg-[#f7f3ea] font-semibold text-[#5e1414]" : "text-white/85 hover:bg-white/10 hover:text-white"
                )}
              >
                {Icon ? <Icon className="size-4 shrink-0" /> : null}
                {!collapsed ? <span className="leading-tight break-words max-md:hidden">{item.label}</span> : null}
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
            className={cn(
              "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/10 hover:text-white pointer-coarse:min-h-11 max-md:min-h-11",
              "max-md:justify-center max-md:px-0",
              collapsed && "justify-center px-0"
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
            {!collapsed && <span className="max-md:hidden">Recolher</span>}
          </button>
          <FeatureInfo helpId="shared.global.menu-recolher" className={cn("shrink-0", collapsed ? "ml-0" : "ml-1 max-md:ml-0")} iconClassName={SIDEBAR_HINT_CLASS} hitArea="vertical" />
        </div>
      </div>
    </aside>
  );
}
