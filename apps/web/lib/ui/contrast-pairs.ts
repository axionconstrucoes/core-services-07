// Pares semânticos de cor (texto/fundo) do ACC verificados automaticamente por scripts/test-contrast-system.mjs.
// Fonte da verdade do que "precisa ser legível": para um novo token/componente, ADICIONE o par aqui — o teste passa a protegê-lo.
// Nomes de tokens = variáveis CSS de apps/web/app/globals.css (sem o prefixo "--").
// REGRA: fundo claro -> fonte escura; fundo escuro -> fonte clara; texto normal >= 4,5:1; texto grande, controles e gráficos >= 3:1.

import type { ContrastKind } from "./contrast";

export interface ContrastPair {
  name: string;
  /** token do texto (ou do elemento gráfico). */
  fg: string;
  /** token do fundo. */
  bg: string;
  kind: ContrastKind;
  /** limitar a temas (omitido = todos). */
  themes?: string[];
  /**
   * Token da superfície que fica POR BAIXO do elemento. Com `bgAlpha`: o fundo (`bg`) é translúcido e composto sobre esta superfície
   * (ex.: `bg-destructive/10` sobre o cartão). Com `opacity`: o elemento inteiro (texto e fundo) desbota sobre esta superfície
   * (ex.: `disabled:opacity-50`, `hover:opacity-90`).
   */
  bgOver?: string;
  /** opacidade do fundo (0..1), composto sobre `bgOver`. */
  bgAlpha?: number;
  /** opacidade do elemento inteiro (0..1) sobre `bgOver`. */
  opacity?: number;
}

/** Estados do contrato de contraste (docs/design-system/hover-text-e-contraste.md §3). */
export type ComponentState = "normal" | "hover" | "foco" | "ativo" | "selecionado" | "desabilitado" | "carregando" | "sucesso" | "aviso" | "erro" | "placeholder" | "selecao-de-texto" | "link";

/** Par de ESTADO de um componente base (agrupado por componente/estado para o relatório). */
export interface StatePair extends ContrastPair {
  component: string;
  state: ComponentState;
}

export const PAIRS: ContrastPair[] = [
  { name: "texto/fundo da página", fg: "foreground", bg: "background", kind: "textNormal" },
  { name: "texto/cartão", fg: "card-foreground", bg: "card", kind: "textNormal" },
  { name: "texto/popover (Hover Text)", fg: "popover-foreground", bg: "popover", kind: "textNormal" },
  { name: "texto/botão primário", fg: "primary-foreground", bg: "primary", kind: "textNormal" },
  { name: "texto/secundário", fg: "secondary-foreground", bg: "secondary", kind: "textNormal" },
  { name: "texto/realce (accent: hover e selecionado)", fg: "accent-foreground", bg: "accent", kind: "textNormal" },
  { name: "texto discreto/fundo da página", fg: "muted-foreground", bg: "background", kind: "textNormal" },
  { name: "texto discreto/cartão", fg: "muted-foreground", bg: "card", kind: "textNormal" },
  { name: "texto discreto/popover", fg: "muted-foreground", bg: "popover", kind: "textNormal" },
  { name: "texto discreto/área rebaixada (muted)", fg: "muted-foreground", bg: "muted", kind: "textNormal" },
  { name: "texto/destrutivo (erro)", fg: "destructive-foreground", bg: "destructive", kind: "textNormal" },
  { name: "texto/barra lateral institucional", fg: "brand-sidebar-foreground", bg: "brand-sidebar", kind: "textNormal" },
  { name: "texto/cabeçalho institucional", fg: "brand-header-foreground", bg: "brand-header", kind: "textNormal" },
  { name: "anel de foco/fundo", fg: "ring", bg: "background", kind: "graphic" },
  { name: "anel de foco/cartão", fg: "ring", bg: "card", kind: "graphic" },
  { name: "borda de campo/fundo", fg: "input", bg: "background", kind: "graphic" },
  { name: "borda de campo/cartão", fg: "input", bg: "card", kind: "graphic" },
  { name: "borda de campo/popover", fg: "input", bg: "popover", kind: "graphic" },
];

// ---------------------------------------------------------------------------------------------------------------------------------
// Estados dos componentes base (components/ui/*): button, badge, input, select*, tabs, table, textarea, card, progress.
// (*) select usa paleta própria (SELECT_CLASS) validada por scripts/test-select-contrast.mjs.
// textarea compartilha as classes de estado do input (mesmos pares).
// ---------------------------------------------------------------------------------------------------------------------------------
function sp(component: string, state: ComponentState, name: string, p: Omit<ContrastPair, "name">): StatePair {
  return { component, state, name: `${component} · ${state} · ${name}`, ...p };
}

const PALETTES = ["red", "orange", "amber", "yellow", "emerald", "green", "blue", "sky", "violet", "purple", "indigo", "cyan", "teal"] as const;
const STATE_OF_PALETTE: Record<string, ComponentState> = { red: "erro", orange: "aviso", amber: "aviso", yellow: "aviso", emerald: "sucesso", green: "sucesso" };

export const STATE_PAIRS: StatePair[] = [
  // ---- button (default/secondary/outline/ghost) ----
  sp("button", "normal", "primário: texto/fundo", { fg: "primary-foreground", bg: "primary", kind: "textNormal" }),
  sp("button", "hover", "primário (hover:opacity-90) sobre cartão", { fg: "primary-foreground", bg: "primary", kind: "textNormal", bgOver: "card", opacity: 0.9 }),
  sp("button", "ativo", "primário (active:opacity-80) sobre cartão", { fg: "primary-foreground", bg: "primary", kind: "textNormal", bgOver: "card", opacity: 0.8 }),
  sp("button", "desabilitado", "primário (opacity-50) sobre cartão — legível >= 3:1", { fg: "primary-foreground", bg: "primary", kind: "textLarge", bgOver: "card", opacity: 0.5 }),
  sp("button", "desabilitado", "primário (opacity-50) sobre fundo — legível >= 3:1", { fg: "primary-foreground", bg: "primary", kind: "textLarge", bgOver: "background", opacity: 0.5 }),
  sp("button", "hover", "secundário (hover:opacity-80) sobre cartão", { fg: "secondary-foreground", bg: "secondary", kind: "textNormal", bgOver: "card", opacity: 0.8 }),
  sp("button", "ativo", "secundário (active:opacity-70) sobre cartão", { fg: "secondary-foreground", bg: "secondary", kind: "textNormal", bgOver: "card", opacity: 0.7 }),
  sp("button", "desabilitado", "secundário (opacity-50) sobre cartão — legível >= 3:1", { fg: "secondary-foreground", bg: "secondary", kind: "textLarge", bgOver: "card", opacity: 0.5 }),
  sp("button", "hover", "outline/ghost: texto/realce", { fg: "accent-foreground", bg: "accent", kind: "textNormal" }),
  sp("button", "ativo", "outline/ghost (active:bg-accent/80) sobre cartão", { fg: "accent-foreground", bg: "accent", kind: "textNormal", bgOver: "card", bgAlpha: 0.8 }),
  sp("button", "selecionado", "outline/ghost (aria-pressed): texto/realce", { fg: "accent-foreground", bg: "accent", kind: "textNormal" }),
  sp("button", "desabilitado", "outline/ghost (opacity-50): texto sobre cartão — legível >= 3:1", { fg: "foreground", bg: "card", kind: "textLarge", bgOver: "card", opacity: 0.5 }),
  sp("button", "foco", "anel de foco global (:focus-visible)/cartão", { fg: "focus-ring", bg: "card", kind: "graphic" }),
  sp("button", "normal", "borda do outline/cartão", { fg: "input", bg: "card", kind: "graphic" }),
  sp("button", "hover", "borda do outline/realce", { fg: "input", bg: "accent", kind: "graphic" }),

  // ---- badge ----
  sp("badge", "normal", "padrão (primário)", { fg: "primary-foreground", bg: "primary", kind: "textNormal" }),
  sp("badge", "normal", "secundário", { fg: "secondary-foreground", bg: "secondary", kind: "textNormal" }),
  sp("badge", "normal", "outline: texto/cartão", { fg: "foreground", bg: "card", kind: "textNormal" }),
  sp("badge", "erro", "destrutivo", { fg: "destructive-foreground", bg: "destructive", kind: "textNormal" }),
  sp("badge", "sucesso", "success (emerald-800 sobre emerald-100)", { fg: "color-emerald-800", bg: "color-emerald-100", kind: "textNormal" }),
  sp("badge", "aviso", "warning (amber-800 sobre amber-100)", { fg: "color-amber-800", bg: "color-amber-100", kind: "textNormal" }),
  sp("badge", "normal", "info (blue-800 sobre blue-100)", { fg: "color-blue-800", bg: "color-blue-100", kind: "textNormal" }),

  // ---- input / textarea ----
  sp("input", "normal", "texto digitado/fundo da página", { fg: "foreground", bg: "background", kind: "textNormal" }),
  sp("input", "normal", "texto digitado/cartão", { fg: "foreground", bg: "card", kind: "textNormal" }),
  sp("input", "placeholder", "placeholder (muted-foreground)/fundo da página", { fg: "muted-foreground", bg: "background", kind: "textNormal" }),
  sp("input", "placeholder", "placeholder/cartão", { fg: "muted-foreground", bg: "card", kind: "textNormal" }),
  sp("input", "placeholder", "placeholder/popover", { fg: "muted-foreground", bg: "popover", kind: "textNormal" }),
  sp("input", "placeholder", "placeholder/realce", { fg: "muted-foreground", bg: "accent", kind: "textNormal" }),
  sp("input", "normal", "borda/realce", { fg: "input", bg: "accent", kind: "graphic" }),
  sp("input", "foco", "anel (ring)/realce", { fg: "ring", bg: "accent", kind: "graphic" }),
  sp("input", "foco", "anel (ring)/popover", { fg: "ring", bg: "popover", kind: "graphic" }),
  sp("input", "foco", "anel de foco global/fundo", { fg: "focus-ring", bg: "background", kind: "graphic" }),
  sp("input", "foco", "anel de foco global/realce", { fg: "focus-ring", bg: "accent", kind: "graphic" }),
  sp("input", "foco", "anel de foco global/barra lateral institucional", { fg: "focus-ring", bg: "brand-sidebar", kind: "graphic" }),
  sp("input", "desabilitado", "texto (muted-foreground)/muted — legível", { fg: "muted-foreground", bg: "muted", kind: "textNormal" }),
  sp("input", "desabilitado", "borda tracejada/muted — >= 3:1", { fg: "input", bg: "muted", kind: "graphic" }),
  sp("input", "erro", "borda de erro (destructive)/cartão", { fg: "destructive", bg: "card", kind: "graphic" }),
  sp("input", "erro", "borda de erro/fundo", { fg: "destructive", bg: "background", kind: "graphic" }),
  sp("input", "erro", "texto de erro (text-destructive)/cartão", { fg: "destructive", bg: "card", kind: "textNormal" }),
  sp("input", "erro", "texto de erro/fundo", { fg: "destructive", bg: "background", kind: "textNormal" }),
  sp("input", "erro", "texto de erro/popover", { fg: "destructive", bg: "popover", kind: "textNormal" }),
  sp("input", "erro", "texto de erro (hover:bg-destructive/10) sobre cartão", { fg: "destructive", bg: "destructive", kind: "textNormal", bgOver: "card", bgAlpha: 0.1 }),
  sp("input", "erro", "texto de erro (hover:bg-destructive/10) sobre realce", { fg: "destructive", bg: "destructive", kind: "textNormal", bgOver: "accent", bgAlpha: 0.1 }),
  sp("input", "erro", "painel de erro (bg-destructive/5) sobre realce", { fg: "destructive", bg: "destructive", kind: "textNormal", bgOver: "accent", bgAlpha: 0.05 }),

  // ---- tabs ----
  sp("tabs", "normal", "aba inativa: texto discreto/lista (muted)", { fg: "muted-foreground", bg: "muted", kind: "textNormal" }),
  sp("tabs", "hover", "aba inativa (hover:bg-accent): texto/realce", { fg: "foreground", bg: "accent", kind: "textNormal" }),
  sp("tabs", "selecionado", "aba ativa: texto/fundo da página", { fg: "foreground", bg: "background", kind: "textNormal" }),
  sp("tabs", "foco", "anel de foco (ring)/lista (muted)", { fg: "ring", bg: "muted", kind: "graphic" }),
  sp("tabs", "desabilitado", "aba (opacity-70): texto discreto/lista — legível >= 3:1", { fg: "muted-foreground", bg: "muted", kind: "textLarge", bgOver: "muted", opacity: 0.7 }),

  // ---- table ----
  sp("table", "normal", "cabeçalho (muted-foreground)/cartão", { fg: "muted-foreground", bg: "card", kind: "textNormal" }),
  sp("table", "normal", "célula/cartão", { fg: "card-foreground", bg: "card", kind: "textNormal" }),
  sp("table", "hover", "linha (hover:bg-muted/50): célula sobre cartão", { fg: "foreground", bg: "muted", kind: "textNormal", bgOver: "card", bgAlpha: 0.5 }),
  sp("table", "hover", "linha (hover:bg-muted/50): cabeçalho sobre cartão", { fg: "muted-foreground", bg: "muted", kind: "textNormal", bgOver: "card", bgAlpha: 0.5 }),
  sp("table", "selecionado", "linha selecionada: texto/realce", { fg: "accent-foreground", bg: "accent", kind: "textNormal" }),

  // ---- card ----
  sp("card", "normal", "título e corpo", { fg: "card-foreground", bg: "card", kind: "textNormal" }),
  sp("card", "normal", "descrição (muted-foreground)", { fg: "muted-foreground", bg: "card", kind: "textNormal" }),
  sp("card", "hover", "texto do cartão sobre realce (accent)", { fg: "card-foreground", bg: "accent", kind: "textNormal" }),

  // ---- progress ----
  sp("progress", "normal", "preenchimento/trilho (muted)", { fg: "primary", bg: "muted", kind: "graphic" }),
  sp("progress", "normal", "preenchimento/cartão", { fg: "primary", bg: "card", kind: "graphic" }),
  sp("progress", "carregando", "indeterminado (animate-pulse): preenchimento/cartão", { fg: "primary", bg: "card", kind: "graphic" }),
  sp("progress", "carregando", "texto de estado 'Preparando...' (muted-foreground)/cartão", { fg: "muted-foreground", bg: "card", kind: "textNormal" }),

  // ---- seleção de texto e links ----
  sp("página", "selecao-de-texto", "::selection (selection-fg/selection-bg)", { fg: "selection-fg", bg: "selection-bg", kind: "textNormal" }),
  sp("link", "link", "normal/fundo", { fg: "link", bg: "background", kind: "textNormal" }),
  sp("link", "link", "normal/cartão", { fg: "link", bg: "card", kind: "textNormal" }),
  sp("link", "link", "normal/popover", { fg: "link", bg: "popover", kind: "textNormal" }),
  sp("link", "link", "normal/realce", { fg: "link", bg: "accent", kind: "textNormal" }),
  sp("link", "hover", "hover/fundo", { fg: "link-hover", bg: "background", kind: "textNormal" }),
  sp("link", "hover", "hover/cartão", { fg: "link-hover", bg: "card", kind: "textNormal" }),
  sp("link", "hover", "hover/realce", { fg: "link-hover", bg: "accent", kind: "textNormal" }),
  sp("texto", "normal", "institucional coral (text-brand-sidebar)/cartão", { fg: "text-brand-on-dark", bg: "card", kind: "textNormal" }),
  sp("texto", "normal", "discreto (text-slate-300)/cartão", { fg: "text-quiet-on-dark", bg: "card", kind: "textNormal" }),
  sp("texto", "normal", "discreto (text-slate-300)/fundo", { fg: "text-quiet-on-dark", bg: "background", kind: "textNormal" }),

  // ---- severidade/status: texto sobre selos translúcidos (bg-severity-*/15 sobre cartão e sobre realce) ----
  ...(["baixa", "media", "alta", "critica"] as const).flatMap((sev) =>
    (["card", "accent"] as const).map((over) =>
      sp("badge", "normal", `severidade ${sev} (text-severity-${sev} sobre bg-severity-${sev}/15) sobre ${over}`, {
        fg: `severity-${sev}-text`, bg: `severity-${sev}`, kind: "textNormal", bgOver: over, bgAlpha: 0.15,
      }),
    ),
  ),
  // ---- estados semânticos de painel (erro/aviso/sucesso/info): texto claro sobre tinta escura (paleta remapeada) ----
  ...PALETTES.map((c) => sp("painel", STATE_OF_PALETTE[c] ?? "normal", `${c}: texto (tom 700-900) sobre tinta (tom 50-100)`, { fg: `color-${c}-800`, bg: `color-${c}-100`, kind: "textNormal" })),
  ...PALETTES.map((c) => sp("painel", STATE_OF_PALETTE[c] ?? "normal", `${c}: texto (tom 700-900) sobre cartão`, { fg: `color-${c}-800`, bg: "card", kind: "textNormal" })),
  // ---- fundos sólidos 600-900 com texto branco (botões/selos de ação; tokens só existem no tema principal) ----
  ...(["red", "orange", "amber", "yellow", "green", "emerald", "blue", "sky", "violet"] as const).map((c) =>
    sp("botão sólido", "normal", `${c}: texto branco sobre solid-${c}`, { fg: "foreground", bg: `solid-${c}`, kind: "textNormal", themes: ["principal"] }),
  ),
];

/**
 * Lacunas CONHECIDAS (par `tema:nome` -> motivo e providência). O teste exige que a lista seja exata: quando o par for corrigido,
 * a entrada deve ser REMOVIDA (o teste falha se um par listado já passar). Vazio = nenhuma lacuna.
 */
export const KNOWN_GAPS: Record<string, string> = {};
