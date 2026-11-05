import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@axion/db/server";

import { getProject } from "@/lib/data";
import { ASSISTANT_QUESTION_MAX_LENGTH, AssistantConfigError, resolveAssistantMode } from "@/lib/assistant/answer";
import { converse } from "@/lib/assistant/chat-orchestrator";
import { allowRequest } from "@/lib/assistant/rate-limit";

// AXIA — Assistente ACC (piloto) — só orienta: lê uma pergunta e devolve texto da base de conhecimento. Nunca grava nada,
// nunca consulta dados da obra. Exige login e participação na obra (getProject usa a sessão e a RLS).
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!/^[0-9a-fA-F-]{36}$/.test(projectId)) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await getProject(projectId);
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (!allowRequest(`ask:${authData.user.id}`, 20)) {
    return NextResponse.json({ error: "Muitas perguntas em pouco tempo. Aguarde um minuto." }, { status: 429 });
  }

  let question = "";
  let history: unknown = [];
  try {
    const body = (await request.json()) as { question?: unknown; history?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
    history = body.history;
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (question.length === 0 || question.length > ASSISTANT_QUESTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Escreva uma pergunta de até ${ASSISTANT_QUESTION_MAX_LENGTH} caracteres.` }, { status: 400 });
  }

  try {
    resolveAssistantMode();
    // Limite de frequência da IA por usuário (mais baixo que o do endpoint): acima dele a AXIA segue só com a base aprovada.
    const aiAllowed = allowRequest(`ai:${authData.user.id}`, 8);
    const answer = await converse({ question, history, projectId: projectId, aiAllowed, userKey: authData.user.id });
    return NextResponse.json({ answer }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AssistantConfigError) {
      console.warn("[assistente-acc] configuração do modo da assistente inválida");
      return NextResponse.json({ error: "A assistente não está disponível neste ambiente." }, { status: 503 });
    }
    throw error;
  }
}
