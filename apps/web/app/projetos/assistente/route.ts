import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@axion/db/server";

import { ASSISTANT_QUESTION_MAX_LENGTH, AssistantConfigError, answerQuestion } from "@/lib/assistant/answer";
import { allowRequest } from "@/lib/assistant/rate-limit";

// AXIA — Assistente ACC na tela "Selecione um projeto" (ainda sem obra escolhida). Mesma base de conhecimento e mesma regra
// do endpoint por obra: só orienta, nunca grava e nunca consulta dados de obra. Exige login; não recebe nem devolve links de
// obra (projectId nulo). A pergunta que depende de uma obra específica recebe a orientação para escolher a obra antes.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  if (!allowRequest(`ask:${authData.user.id}`, 20)) {
    return NextResponse.json({ error: "Muitas perguntas em pouco tempo. Aguarde um minuto." }, { status: 429 });
  }

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim() : "";
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (question.length === 0 || question.length > ASSISTANT_QUESTION_MAX_LENGTH) {
    return NextResponse.json({ error: `Escreva uma pergunta de até ${ASSISTANT_QUESTION_MAX_LENGTH} caracteres.` }, { status: 400 });
  }

  try {
    return NextResponse.json({ answer: answerQuestion(question, null) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AssistantConfigError) {
      console.warn("[assistente-acc] configuração do modo da assistente inválida");
      return NextResponse.json({ error: "A assistente não está disponível neste ambiente." }, { status: 503 });
    }
    throw error;
  }
}
