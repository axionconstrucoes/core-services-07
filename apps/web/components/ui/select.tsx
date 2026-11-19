import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Select nativo com identidade AXION: azul-marinho com letras brancas (gatilho E lista de opcoes).
 * Antes o gatilho era transparente e a lista nativa abria branca herdando texto claro (ilegivel).
 * Paleta fixa (nao depende do tema do contexto): o gatilho fica legivel tanto sobre o fundo/cartao
 * azul-marinho quanto sobre formularios claros. Contrastes WCAG AA validados por scripts/test-select-contrast.mjs.
 *   normal  #13233b / #ffffff     hover  #1d3557 / #ffffff
 *   opcao selecionada #2c5aa0 / #ffffff     desabilitado #1a2a42 / #c3cfdf (opacity-100, sem apagar o texto)
 *   placeholder (opcao value="" marcada) #d3deee     borda #8fa8cc     foco #f7f3ea
 */
export const SELECT_CLASS = [
  "flex h-9 rounded-md border border-[#8fa8cc] bg-[#13233b] px-3 py-1 text-sm text-white shadow-sm outline-none [color-scheme:dark]",
  "hover:bg-[#1d3557]",
  "focus-visible:ring-2 focus-visible:ring-[#f7f3ea]",
  "has-[option[value='']:checked]:text-[#d3deee]",
  "disabled:cursor-not-allowed disabled:bg-[#1a2a42] disabled:text-[#c3cfdf] disabled:opacity-100",
  "[&>option]:bg-[#13233b] [&>option]:text-white",
  "[&>option:checked]:bg-[#2c5aa0] [&>option:checked]:text-white",
  "[&>option:disabled]:bg-[#1a2a42] [&>option:disabled]:text-[#c3cfdf]",
  "[&>optgroup]:bg-[#13233b] [&>optgroup]:text-white",
].join(" ");

function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const title = props.title ?? props["aria-label"];
  return <select className={cn(SELECT_CLASS, className)} {...props} title={title} />;
}

export { Select };
