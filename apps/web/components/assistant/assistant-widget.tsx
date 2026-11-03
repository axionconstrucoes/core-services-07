"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Send, Square, Volume2, X } from "lucide-react";

import type { AssistantAnswer } from "@/lib/assistant/answer";
import { ASSISTANT_QUESTION_MAX_LENGTH } from "@/lib/assistant/limits";
import { VERA_CONTEXTS, VERA_OPEN_EVENT, type VeraContext, type VeraOpenDetail } from "./vera-events";

// AXIA — Assistente ACC (piloto): caixa de conversa aberta pelos gatilhos "Fale com a AXIA".
// Só orienta — não altera dados. A resposta é texto; a leitura em voz só começa quando a pessoa clica em
// "Ouvir resposta".

interface Voice {
  id: string;
  label: string;
  note: string;
}

interface Turn {
  question: string;
  answer: AssistantAnswer;
}

const SUGGESTIONS: Record<VeraContext, string[]> = {
  geral: ["Como envio documentos?", "O que significa risco crítico?", "Como instalo o SSMA no celular?"],
  alerta: ["O que significa risco crítico?", "De quantos em quantos dias o alerta repete?", "Como respondo a um lote de alertas?"],
  providencia: ["Como cadastro uma providência?", "Como funciona o prazo do CNO?", "O que significa D-60?"],
  ssma: ["Como instalo o SSMA no celular?", "Como registro uma ocorrência?", "O que funciona sem internet?"],
  autorizacao: [
    "Para que serve esta autorização?",
    "O que o ACC poderá ler na minha conta?",
    "Quais filtros são aplicados?",
    "O que acontece se eu não autorizar?",
    "Como revogo a autorização?",
    "Como revogo a permissão no Google?",
  ],
};

const VOICE_STORAGE_KEY = "acc-vera-voz";

function readStoredVoice(): string | null {
  try {
    return window.localStorage.getItem(VOICE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeVoice(id: string) {
  try {
    window.localStorage.setItem(VOICE_STORAGE_KEY, id);
  } catch {
    /* preferência é só conveniência */
  }
}

export function AssistantWidget({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<VeraContext>("geral");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);

  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState<string>("");
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const busyRef = useRef(false);
  const base = `/${projectId}/ajuda/assistente`;

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    audioRef.current = null;
    setSpeaking(false);
  }, []);

  useEffect(() => () => stopAudio(), [stopAudio]);

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed || busyRef.current) return;
      busyRef.current = true;
      stopAudio();
      setVoiceNotice(null);
      setAskError(null);
      setLoading(true);
      try {
        const response = await fetch(base, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: trimmed }),
        });
        const data = (await response.json().catch(() => ({}))) as { answer?: AssistantAnswer; error?: string };
        if (!response.ok || !data.answer) {
          setAskError(data.error ?? "Não foi possível obter a resposta agora. Tente novamente.");
          return;
        }
        setTurns((current) => [...current, { question: trimmed, answer: data.answer as AssistantAnswer }]);
        setInput("");
      } catch {
        setAskError("Sem conexão com o ACC. Verifique a internet e tente novamente.");
      } finally {
        busyRef.current = false;
        setLoading(false);
      }
    },
    [base, stopAudio]
  );

  // Abertura por gatilho (evento) ou por link de e-mail (?vera=abrir&contexto=...).
  useEffect(() => {
    function openFrom(detail: VeraOpenDetail) {
      openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setContext(detail.context && VERA_CONTEXTS.includes(detail.context) ? detail.context : "geral");
      setOpen(true);
      if (detail.ask) void ask(detail.ask);
    }
    const onOpen = (event: Event) => openFrom((event as CustomEvent<VeraOpenDetail>).detail ?? {});
    window.addEventListener(VERA_OPEN_EVENT, onOpen);

    const params = new URLSearchParams(window.location.search);
    if (params.get("vera") === "abrir") {
      const raw = params.get("contexto") as VeraContext | null;
      openFrom({ context: raw && VERA_CONTEXTS.includes(raw) ? raw : "geral" });
      params.delete("vera");
      params.delete("contexto");
      const query = params.toString();
      try {
        window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
      } catch {
        /* só limpa a URL */
      }
    }
    return () => window.removeEventListener(VERA_OPEN_EVENT, onOpen);
  }, [ask]);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeBox();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || voices.length > 0) return;
    let cancelled = false;
    fetch(`${base}/voz`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("voz"))))
      .then((data: { voices: Voice[]; defaultVoice: string; available: boolean }) => {
        if (cancelled) return;
        setVoices(data.voices);
        const stored = readStoredVoice();
        setVoiceId(data.voices.some((voice) => voice.id === stored) ? (stored as string) : data.defaultVoice);
        setVoiceAvailable(data.available);
      })
      .catch(() => {
        if (!cancelled) setVoiceAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, voices.length, base]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, loading]);

  function closeBox() {
    stopAudio();
    setOpen(false);
    openerRef.current?.focus();
  }

  async function listen(entryId: string) {
    if (voiceLoading || speaking) return;
    setVoiceNotice(null);
    setVoiceLoading(true);
    try {
      const response = await fetch(`${base}/voz`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entryId, voice: voiceId || undefined }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setVoiceNotice(data.message ?? "Não foi possível ler em voz alta agora. A resposta em texto continua disponível.");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      audioUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => stopAudio();
      audio.onerror = () => {
        stopAudio();
        setVoiceNotice("O navegador não conseguiu reproduzir o áudio. A resposta em texto continua disponível.");
      };
      setSpeaking(true);
      await audio.play();
    } catch {
      stopAudio();
      setVoiceNotice("Não foi possível reproduzir o áudio. A resposta em texto continua disponível.");
    } finally {
      setVoiceLoading(false);
    }
  }

  if (!open) return null;

  const last = turns[turns.length - 1];

  return (
    <section
      role="dialog"
      aria-labelledby="vera-titulo"
      aria-label="AXIA — Assistente ACC"
      className="fixed inset-x-2 top-[8.5rem] z-50 flex max-h-[calc(100dvh-9.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:top-[6.25rem] sm:max-h-[calc(100dvh-7.5rem)] sm:w-[400px]"
    >
      <header className="flex items-center gap-3 bg-brand-sidebar px-4 py-3 text-brand-sidebar-foreground">
        <Image src="/assistente/ajuda-acc.png" alt="" width={40} height={40} className="size-10 rounded-full border-2 border-white/70 object-cover" />
        <div className="min-w-0 flex-1">
          <p id="vera-titulo" className="text-sm font-bold leading-tight">
            AXIA — Assistente ACC
          </p>
          <p className="text-xs leading-tight text-white/80">Orienta sobre o uso do ACC. Não altera dados.</p>
        </div>
        <button type="button" onClick={closeBox} aria-label="Fechar a AXIA" className="flex size-11 items-center justify-center rounded-md hover:bg-white/15">
          <X className="size-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm text-gray-800">
        {turns.length === 0 && !loading ? (
          <div className="space-y-2">
            <p>Olá! Sou a AXIA, a assistente do ACC. Pergunte como usar o sistema — documentos, alertas, providências, SSMA ou a autorização de e-mails.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS[context].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void ask(suggestion)}
                  className="min-h-9 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {turns.map((turn, index) => (
          <div key={index} className="space-y-2">
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-gray-100 px-3 py-2 text-gray-900">{turn.question}</p>
            <div className="space-y-2 rounded-2xl rounded-bl-sm border border-gray-200 px-3 py-2">
              {turn.answer.readOnlyNotice ? <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">{turn.answer.readOnlyNotice}</p> : null}
              <p className="font-bold text-gray-900">{turn.answer.title}</p>
              <p>{turn.answer.summary}</p>
              {turn.answer.steps.length > 0 ? (
                <ol className="list-decimal space-y-1 pl-5">
                  {turn.answer.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              ) : null}
              {turn.answer.links.length > 0 || turn.answer.tutorialSlide ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {turn.answer.links.map((link) => (
                    <Link key={link.href} href={link.href} className="rounded-md bg-brand-sidebar px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                      {link.label}
                    </Link>
                  ))}
                  {turn.answer.tutorialSlide ? <span className="px-1 py-1 text-xs text-gray-500">Tutorial: slide {turn.answer.tutorialSlide}</span> : null}
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {loading ? <p className="text-xs text-gray-500">Procurando a orientação…</p> : null}
        {askError ? (
          <p role="alert" className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-800">
            {askError}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="space-y-2 border-t border-gray-200 bg-gray-50 px-4 py-3">
        {last ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="assistente-voz" className="text-xs font-semibold text-gray-700">
                Voz
              </label>
              <select
                id="assistente-voz"
                value={voiceId}
                disabled={voices.length === 0 || speaking}
                onChange={(event) => {
                  setVoiceId(event.target.value);
                  storeVoice(event.target.value);
                }}
                className="min-h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs"
              >
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label} — {voice.note}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void listen(last.answer.entryId)}
                disabled={voiceAvailable === false || voiceLoading || speaking}
                className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand-sidebar px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Volume2 className="size-4" />
                {voiceLoading ? "Preparando…" : "Ouvir resposta"}
              </button>
              <button
                type="button"
                onClick={stopAudio}
                disabled={!speaking}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-50"
              >
                <Square className="size-4" />
                Parar
              </button>
            </div>
            {voiceAvailable === false ? (
              <p className="text-xs text-gray-600">A leitura em voz ainda não está habilitada neste ambiente. A resposta em texto continua disponível.</p>
            ) : null}
            {voiceNotice ? (
              <p role="alert" className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
                {voiceNotice}
              </p>
            ) : null}
          </div>
        ) : null}

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void ask(input);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            maxLength={ASSISTANT_QUESTION_MAX_LENGTH}
            placeholder="Digite sua pergunta"
            aria-label="Pergunta para a AXIA"
            className="min-h-11 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={loading || input.trim() === ""}
            aria-label="Enviar pergunta"
            className="flex size-11 items-center justify-center rounded-md bg-brand-sidebar text-white disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </form>

        <Link href={`/${projectId}/ajuda`} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand-sidebar hover:underline">
          <BookOpen className="size-4" />
          Abrir o tutorial completo (PDF e PowerPoint)
        </Link>
      </div>
    </section>
  );
}
