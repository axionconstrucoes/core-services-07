"use client";

import Image from "next/image";

import { VERA_AUTHORIZATION_QUESTION, openVera, type VeraContext } from "./vera-events";

// Visível em desktop e independente da voz (só abre a conversa). Contraste: borda creme e texto branco sobre a barra escura.
// Gatilho "Fale com a AXIA": foto circular + texto. Abre a caixa de conversa (não conversa aqui).
// Teclado: é um <button> (Tab/Enter/Espaço); área de toque de pelo menos 44 px; texto sempre visível.

export function VeraTrigger({
  context = "geral",
  ask,
  variant = "topbar",
  tone = "light",
  alwaysShowText = false,
}: {
  context?: VeraContext;
  ask?: string;
  /** "topbar": foto + texto lado a lado; "photo": só a foto (cabeçalhos de uma linha, texto no rótulo acessível). */
  variant?: "topbar" | "photo";
  /** "dark": para cabeçalhos vinho (PWA do SSMA) — texto e foco claros. "onLight": para fundos claros (seleção de projetos) — texto e borda pretos. */
  tone?: "light" | "dark" | "onLight";
  /** Texto "Fale com a AXIA" visível também em telas estreitas (PWA do SSMA). No ACC web em celular, só a foto cabe. */
  alwaysShowText?: boolean;
}) {
  const question = ask ?? (context === "autorizacao" ? VERA_AUTHORIZATION_QUESTION : undefined);

  return (
    <button
      type="button"
      data-vera-trigger={context}
      onClick={() => openVera({ context, ask: question })}
      aria-label="Fale com a AXIA — Assistente ACC"
      title="Fale com a AXIA"
      className={`group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full p-0.5 pr-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 sm:pr-3 ${tone === "dark" ? "hover:bg-white/15 focus-visible:outline-white" : tone === "onLight" ? "hover:bg-black/10 focus-visible:outline-black" : "hover:bg-white/10 focus-visible:outline-[#f7f3ea]"}`}
    >
      <Image
        src="/assistente/axia-avatar.png"
        alt=""
        width={44}
        height={44}
        className={`size-11 shrink-0 rounded-full border-2 object-cover ${tone === "dark" ? "border-white" : tone === "onLight" ? "border-black" : "border-[#f7f3ea]"}`}
      />
      {variant === "topbar" ? (
        <span className={`${alwaysShowText ? "max-w-[4.5rem]" : "hidden max-w-[4.5rem]"} sm:inline text-[11px] font-bold leading-tight ${tone === "onLight" ? "text-black group-hover:text-black group-focus-visible:text-black" : "text-white group-hover:text-white group-focus-visible:text-white"} sm:max-w-none sm:text-sm`}>Fale com a AXIA</span>
      ) : (
        <span className="sr-only">Fale com a AXIA</span>
      )}
    </button>
  );
}
