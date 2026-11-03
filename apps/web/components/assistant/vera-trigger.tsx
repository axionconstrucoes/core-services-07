"use client";

import Image from "next/image";

import { VERA_AUTHORIZATION_QUESTION, openVera, type VeraContext } from "./vera-events";

// Gatilho "Fale com a VERA": foto circular + texto. Abre a caixa de conversa (não conversa aqui).
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
  /** "dark": para cabeçalhos vinho (PWA do SSMA) — texto e foco claros. */
  tone?: "light" | "dark";
  /** Texto "Fale com a VERA" visível também em telas estreitas (PWA do SSMA). No ACC web em celular, só a foto cabe. */
  alwaysShowText?: boolean;
}) {
  const question = ask ?? (context === "autorizacao" ? VERA_AUTHORIZATION_QUESTION : undefined);

  return (
    <button
      type="button"
      data-vera-trigger={context}
      onClick={() => openVera({ context, ask: question })}
      aria-label="Fale com a VERA — Assistente ACC"
      title="Fale com a VERA"
      className={`group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full p-0.5 pr-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 sm:pr-3 ${tone === "dark" ? "hover:bg-white/15 focus-visible:outline-white" : "hover:bg-gray-100 focus-visible:outline-brand-sidebar"}`}
    >
      <Image
        src="/assistente/ajuda-acc.png"
        alt=""
        width={44}
        height={44}
        className={`size-11 shrink-0 rounded-full border-2 object-cover ${tone === "dark" ? "border-white" : "border-brand-sidebar"}`}
      />
      {variant === "topbar" ? (
        <span className={`${alwaysShowText ? "max-w-[4.5rem]" : "hidden max-w-[4.5rem]"} sm:inline text-[11px] font-bold leading-tight sm:max-w-none sm:text-xs ${tone === "dark" ? "text-white" : "text-brand-sidebar"}`}>Fale com a VERA</span>
      ) : (
        <span className="sr-only">Fale com a VERA</span>
      )}
    </button>
  );
}
