// FASE 6 / H2a — peças visuais compartilhadas pelas telas de Competências e de Aprovações externas (componentes de SERVIDOR, sem estado).
// Contraste AA (texto escuro sobre fundo claro; botão primário branco sobre o bordô da marca) e alvos >= 44 px (min-h-11).
import { messageForErrorParam } from "@/lib/governance/governance-errors";

export const INPUT = "min-h-11 w-full rounded-md border border-gray-400 bg-white px-2 py-1 text-sm text-gray-900";
export const BTN = "min-h-11 rounded-md bg-brand-sidebar px-4 py-2 text-sm font-bold text-white";
export const BTN_ALT = "min-h-11 rounded-md border-2 border-gray-600 bg-white px-4 py-2 text-sm font-bold text-gray-900";
export const BTN_DANGER = "min-h-11 rounded-md border-2 border-red-800 bg-white px-4 py-2 text-sm font-bold text-red-900";

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: v.length > 10 ? "short" : undefined, timeZone: "America/Sao_Paulo" }).format(d);
}

/** Aviso de resultado vindo da URL: só exibe texto do catálogo (`ok` mapeado pela página; `erro` pelo catálogo de erros). */
export function Flash({ ok, erro, okMessages }: { ok?: string; erro?: string; okMessages: Record<string, string> }) {
  if (ok && Object.prototype.hasOwnProperty.call(okMessages, ok)) {
    return <p role="status" className="rounded-md border border-emerald-700 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{okMessages[ok]}</p>;
  }
  if (erro) {
    return <p role="alert" className="rounded-md border border-red-700 bg-red-50 px-3 py-2 text-sm text-red-900">{messageForErrorParam(erro)}</p>;
  }
  return null;
}

const TONES: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-900",
  warn: "bg-amber-100 text-amber-900",
  bad: "bg-red-100 text-red-900",
  info: "bg-sky-100 text-sky-900",
  off: "bg-gray-200 text-gray-900",
};

export function Pill({ tone, children }: { tone: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-bold ${TONES[tone]}`}>{children}</span>;
}
