"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { ArrowLeft, CloudUpload, History, Home, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { FeatureInfo } from "@/components/shared/feature-info";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { VeraTrigger } from "@/components/assistant/vera-trigger";

export type SsmaTab = "home" | "registros" | "sync" | "perfil";

export function SsmaHeader({ title, onBack, helpId }: { title: string; onBack?: () => void; helpId?: string }) {
  // A AXIA só aparece dentro de uma obra (/ssma/{obra}): a ajuda respeita login e participação na obra.
  const pathname = usePathname();
  const veraProjectId = pathname?.match(/^\/ssma\/([0-9a-fA-F-]{36})(?:\/|$)/)?.[1] ?? null;
  return (
    <>
    <header className="flex min-h-24 items-center gap-2 bg-[#740820] px-2 text-white shadow-sm sm:px-4">
      {onBack ? (
        // help-exempt: botão Voltar da barra superior, de rótulo autoexplicativo (aria-label Voltar)
        <button
          type="button"
          onClick={onBack}
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-black/15"
          aria-label="Voltar"
        >
          <ArrowLeft className="size-6" />
        </button>
      ) : null}
      <Image
        src="/branding/acc-logo.png"
        alt="ACC"
        width={1254}
        height={1254}
        priority
        className={cn("size-16 shrink-0 object-cover", !onBack && "ml-2")}
      />
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
        <h1 className="min-w-0 break-words text-center text-lg font-bold uppercase leading-tight sm:text-xl">{title}</h1>
        {helpId ? <FeatureInfo helpId={helpId} iconClassName="text-white hover:text-white/80 focus-visible:text-white" /> : null}
      </div>
      {veraProjectId ? <VeraTrigger tone="dark" alwaysShowText /> : null}
    </header>
    {/* Fora do cabeçalho: dentro dele a caixa herdaria o texto branco. */}
    {veraProjectId ? <AssistantWidget projectId={veraProjectId} /> : null}
    </>
  );
}

const TABS: Array<{ tab: SsmaTab; label: string; Icon: typeof Home; helpId: string }> = [
  { tab: "home", label: "Início", Icon: Home, helpId: "ssma.app.aba-inicio" },
  { tab: "registros", label: "Registros", Icon: History, helpId: "ssma.app.aba-registros" },
  { tab: "sync", label: "Sincronização", Icon: CloudUpload, helpId: "ssma.app.aba-sincronizacao" },
  { tab: "perfil", label: "Perfil", Icon: UserRound, helpId: "ssma.app.aba-perfil" },
];

export function SsmaBottomNav({ active, onChange, pendingCount = 0 }: { active: SsmaTab; onChange: (tab: SsmaTab) => void; pendingCount?: number }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-slate-300 bg-white px-2 py-2 text-[11px] font-semibold text-slate-600" aria-label="Navegação do app de campo">
      {TABS.map(({ tab, label, Icon, helpId }) => (
        // O ícone de ajuda fica ao lado do botão da aba (nunca dentro dele): o botão continua sendo só a navegação.
        <div key={tab} className="relative flex flex-col">
          {/* help-exempt: botão de navegação da aba; o ícone de ajuda de cada aba fica ao lado do botão */}
          <button
            type="button"
            onClick={() => onChange(tab)}
            aria-current={active === tab ? "page" : undefined}
            className={cn("relative flex min-h-12 flex-col items-center gap-1", active === tab && "text-red-700")}
          >
            <Icon className="size-5" />
            {label}
            {tab === "sync" && pendingCount > 0 ? (
              <span className="absolute right-[22%] top-0 flex min-w-4 items-center justify-center rounded-full bg-[#7f1d1d] px-1 text-[10px] font-bold text-white">{pendingCount}</span>
            ) : null}
          </button>
          <span className="absolute left-[12%] top-0">
            <FeatureInfo helpId={helpId} />
          </span>
        </div>
      ))}
    </nav>
  );
}
