"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Send, X } from "lucide-react";

import type { AssistantAnswer } from "@/lib/assistant/answer";
import { ASSISTANT_QUESTION_MAX_LENGTH } from "@/lib/assistant/limits";
import { AssistantVoiceControls } from "./assistant-voice-controls";
import { AxiaAnswerBody } from "./axia-answer-body";
import { VERA_CONTEXTS, VERA_OPEN_EVENT, type VeraContext, type VeraOpenDetail } from "./vera-events";

// AXIA — Assistente ACC (piloto): caixa de conversa aberta pelos gatilhos "Fale com a AXIA".
// Só orienta — não altera dados. A resposta é texto; a leitura em voz (Fase 3, hoje desligada) só começa quando a pessoa
// aciona o botão de voz (ver assistant-voice-controls.tsx).

interface Voice {
  id: string;
  label: string;
  note: string;
}

interface Turn {
  question: string;
  answer: AssistantAnswer;
  /** A pessoa clicou em "Isso não respondeu à minha pergunta". Estado só deste navegador: nada é enviado. */
  notAnswered?: boolean;
}

const SUGGESTIONS: Record<VeraContext, string[]> = {
  geral: ["Como envio documentos?", "O que significa risco crítico?", "Como instalo o SSMA no celular?"],
  alerta: ["O que significa risco crítico?", "De quantos em quantos dias o alerta repete?", "Como respondo a um lote de alertas?"],
  providencia: ["Como cadastro uma providência?", "Como funciona o prazo do CNO?", "O que significa D-60?"],
  ssma: ["Como instalo o SSMA no celular?", "Como registro uma ocorrência?", "O que funciona sem internet?"],
  selecao: ["Como escolho a obra?", "Por que não vejo a minha obra?", "O que é a AXIA?"],
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

/** projectId nulo = tela "Selecione um projeto" (antes da escolha da obra): sem links de obra e sem voz. */
export function AssistantWidget({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<VeraContext>("geral");
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  useEffect(() => {
    turnsRef.current = turns;
  }, [turns]);
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
  // Contexto recente enviado ao servidor: no máximo as 2 últimas perguntas desta conversa + o assunto respondido (id).
  // Fica só neste navegador (estado do componente, desta obra); nada é guardado no servidor.
  const turnsRef = useRef<Turn[]>([]);
  const base = projectId ? `/${projectId}/ajuda/assistente` : "/projetos/assistente";

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
          body: JSON.stringify({
            question: trimmed,
            history: turnsRef.current.slice(-2).map((turn) => ({ question: turn.question, entryId: turn.answer.entryId })),
          }),
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
    if (!open || voices.length > 0 || !projectId) return;
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
  }, [open, voices.length, base, projectId]);

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
  // "Falar com o ADMIN": resposta parcial, ausência de resposta aprovada ou clique em "Isso não respondeu à minha pergunta".
  const needsAdmin = Boolean(last && last.answer.kind !== "social" && last.answer.kind !== "scope" && (last.answer.coverage !== "completa" || last.notAnswered));

  return (
    <section
      role="dialog"
      aria-labelledby="vera-titulo"
      aria-label="AXIA — Assistente ACC"
      className="fixed inset-x-2 top-[8.5rem] z-50 flex max-h-[calc(100dvh-9.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl sm:inset-x-auto sm:right-4 sm:top-[6.25rem] sm:max-h-[calc(100dvh-7.5rem)] sm:w-[400px]"
    >
      <header className="flex items-center gap-3 bg-brand-sidebar px-4 py-3 text-brand-sidebar-foreground">
        <Image src="/assistente/axia-avatar.png" alt="" width={40} height={40} className="size-10 rounded-full border-2 border-white/70 object-cover" />
        <div className="min-w-0 flex-1">
          <p id="vera-titulo" className="text-sm font-bold leading-tight">
            AXIA — Assistente ACC
          </p>
          <p className="text-xs leading-tight text-white/80">Ajuda com o ACC</p>
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
            <div data-axia-resposta className="min-w-0 space-y-3 break-words [overflow-wrap:anywhere] rounded-2xl rounded-bl-sm border border-gray-300 bg-[#ffffff] px-3 py-2 text-[#000000]">
              <AxiaAnswerBody
                answer={turn.answer}
                notAnswered={turn.notAnswered}
                onNotAnswered={() => setTurns((current) => current.map((item, i) => (i === index ? { ...item, notAnswered: true } : item)))}
              />
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
        <AssistantVoiceControls
          available={voiceAvailable}
          hasAnswer={Boolean(last)}
          voices={voices}
          voiceId={voiceId}
          loading={voiceLoading}
          speaking={speaking}
          notice={voiceNotice}
          onVoiceChange={(id) => {
            setVoiceId(id);
            storeVoice(id);
          }}
          onListen={() => {
            if (last) void listen(last.answer.entryId);
          }}
          onStop={stopAudio}
        />

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

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {projectId ? (
            <Link href={`/${projectId}/ajuda`} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#ffd54f] hover:underline">
              <BookOpen className="size-4" />
              Abrir o tutorial completo (PDF e PowerPoint)
            </Link>
          ) : (
            <span className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-[#ffd54f]">
              <BookOpen className="size-4" />
              O tutorial completo abre depois que você escolher a obra.
            </span>
          )}
          {needsAdmin && last ? (
            last.answer.adminHandoff.mode === "link" && last.answer.adminHandoff.href ? (
              // Link FIXO montado no servidor: não leva a pergunta nem o histórico, e o clique não faz nenhuma requisição ao ACC.
              <a
                data-axia-admin
                href={last.answer.adminHandoff.href}
                className="inline-flex min-h-9 items-center text-xs font-bold text-[#ffd54f] underline"
              >
                {last.answer.adminHandoff.label}
                {last.answer.adminHandoff.test ? " (destino de teste)" : ""}
              </a>
            ) : (
              <span data-axia-admin className="inline-flex min-h-9 items-center text-xs font-bold text-[#ffd54f]">
                {last.answer.adminHandoff.label}: {last.answer.adminHandoff.note}
              </span>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
