// Pares semânticos de cor (texto/fundo) do ACC verificados automaticamente por scripts/test-contrast-system.mjs.
// Fonte da verdade do que "precisa ser legível": para um novo token/componente, ADICIONE o par aqui — o teste passa a protegê-lo.
// Nomes de tokens = variáveis CSS de apps/web/app/globals.css (sem o prefixo "--").

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

/**
 * Lacunas CONHECIDAS (par `tema:nome` -> motivo e providência). O teste exige que a lista seja exata: quando o par for corrigido,
 * a entrada deve ser REMOVIDA (o teste falha se um par listado já passar). Vazio = nenhuma lacuna.
 */
export const KNOWN_GAPS: Record<string, string> = {};
