import { Square, Volume2 } from "lucide-react";

// Controles de voz da AXIA (seletor, "Ouvir resposta", "Parar"). Componente de apresentação, sem estado,
// para que o teste de renderização (scripts/test-assistant-render.mjs) verifique o HTML de verdade.
// Fase 1: a AXIA responde só por texto. Com a voz indisponível (ELEVENLABS_ENABLED != "true", sem chave
// ou sem vozes) nada deste bloco é renderizado — a integração de voz fica preservada para a Fase 3.

export interface AssistantVoiceOption {
  id: string;
  label: string;
  note: string;
}

export interface AssistantVoiceControlsProps {
  /** Só `true` mostra os controles; `false` (voz desligada) e `null` (ainda não consultado) os ocultam. */
  available: boolean | null;
  /** Só há o que ouvir depois da primeira resposta. */
  hasAnswer: boolean;
  voices: AssistantVoiceOption[];
  voiceId: string;
  loading: boolean;
  speaking: boolean;
  notice: string | null;
  onVoiceChange: (id: string) => void;
  onListen: () => void;
  onStop: () => void;
}

export function AssistantVoiceControls(props: AssistantVoiceControlsProps) {
  const { available, hasAnswer, voices, voiceId, loading, speaking, notice, onVoiceChange, onListen, onStop } = props;
  if (available !== true || !hasAnswer) return null;

  return (
    <div className="space-y-2" data-testid="assistente-voz-controles">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="assistente-voz" className="text-xs font-semibold text-gray-700">
          Voz
        </label>
        <select
          id="assistente-voz"
          value={voiceId}
          disabled={voices.length === 0 || speaking}
          onChange={(event) => onVoiceChange(event.target.value)}
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
          onClick={onListen}
          disabled={loading || speaking}
          className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand-sidebar px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Volume2 className="size-4" />
          {loading ? "Preparando…" : "Ouvir resposta"}
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!speaking}
          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-800 disabled:opacity-50"
        >
          <Square className="size-4" />
          Parar
        </button>
      </div>
      {notice ? (
        <p role="alert" className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
