import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@axion/db/server";

import { getProject } from "@/lib/data";
import { speechTextForEntry } from "@/lib/assistant/answer";
import {
  SpeechError,
  getSpeechAvailability,
  resolveRequestedVoice,
  listAuthorizedVoices,
  synthesizeSpeech,
} from "@/lib/assistant/elevenlabs-speech";
import { allowRequest } from "@/lib/assistant/rate-limit";

// Voz da VERA — Assistente ACC (piloto), ElevenLabs — chave só no servidor.
// GET: vozes AUTORIZADAS (lista fixa no servidor) e se o serviço está disponível (nunca devolve chave nem configuração).
// POST {entryId, voice}: o servidor monta o texto a partir da base de conhecimento pelo id — texto vindo do
// navegador nunca é enviado ao serviço de voz — e só aceita vozes da lista autorizada. A leitura só começa quando
// o usuário clica em "Ouvir resposta".

async function authorize(projectId: string) {
  if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) return { response: NextResponse.json({ error: "Não encontrado" }, { status: 404 }) } as const;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return { response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) } as const;
  const project = await getProject(projectId);
  if (!project) return { response: NextResponse.json({ error: "Não encontrado" }, { status: 404 }) } as const;
  return { userId: authData.user.id } as const;
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if ("response" in auth) return auth.response;

  const availability = getSpeechAvailability();
  if (!availability.available) {
    return NextResponse.json({ voices: [], defaultVoice: "", available: false, mode: availability.mode }, { headers: { "cache-control": "no-store" } });
  }

  try {
    const { voices, defaultVoice } = await listAuthorizedVoices();
    return NextResponse.json({ voices, defaultVoice, available: true, mode: availability.mode }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ voices: [], defaultVoice: "", available: false, mode: "desligado" }, { headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const auth = await authorize(projectId);
  if ("response" in auth) return auth.response;

  if (!allowRequest(`tts:${auth.userId}`, 8)) {
    return NextResponse.json({ code: "RATE_LIMIT", message: "Muitas leituras em pouco tempo. Aguarde um minuto. A resposta em texto continua disponível." }, { status: 429 });
  }

  let entryId = "";
  let voice: string | undefined;
  try {
    const body = (await request.json()) as { entryId?: unknown; voice?: unknown };
    entryId = typeof body.entryId === "string" ? body.entryId : "";
    if (body.voice !== undefined) {
      voice = typeof body.voice === "string" ? body.voice : "";
    }
  } catch {
    return NextResponse.json({ code: "BAD_REQUEST", message: "Pedido inválido." }, { status: 400 });
  }

  const text = speechTextForEntry(entryId);
  if (!text) return NextResponse.json({ code: "BAD_REQUEST", message: "Não há texto para ler." }, { status: 400 });

  try {
    const availability = getSpeechAvailability();
    if (availability.mode !== "simulado" && !availability.available) {
      throw new SpeechError(availability.reason ?? "NOT_CONFIGURED", "A leitura em voz ainda não está habilitada neste ambiente. A resposta em texto continua disponível.");
    }
    // A voz escolhida precisa estar na lista autorizada; sem escolha, usa a padrão. Sem rede.
    const chosen = resolveRequestedVoice(voice);
    if (!chosen) return NextResponse.json({ code: "BAD_REQUEST", message: "Voz inválida." }, { status: 400 });

    const result = await synthesizeSpeech(text, chosen);
    return new NextResponse(new Uint8Array(result.audio), {
      status: 200,
      headers: {
        "content-type": result.contentType,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "x-voz-modo": result.mode,
      },
    });
  } catch (error) {
    if (error instanceof SpeechError) {
      // Só o código do erro vai ao log — nunca chave, endpoint ou texto.
      console.warn(`[vera-voz] voz indisponível: ${error.code}`);
      const status = error.code === "QUOTA" || error.code === "RATE_LIMIT" ? 429 : error.code === "BAD_REQUEST" ? 400 : 503;
      return NextResponse.json({ code: error.code, message: error.userMessage }, { status });
    }
    console.warn("[vera-voz] erro inesperado");
    return NextResponse.json({ code: "UNAVAILABLE", message: "O serviço de voz está indisponível no momento. A resposta em texto continua disponível." }, { status: 503 });
  }
}
