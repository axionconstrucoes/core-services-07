// Conteúdo da confirmação enviada ao autor de uma resposta por e-mail (ACTION_CONFIRMATION com
// payload replyConfirmation) — puro, sem I/O. Uma confirmação por mensagem processada; enviada na
// mesma thread do alerta (From/Cc crm@ pelo worker), só depois de a resposta estar persistida.
// Informa: caso/projeto (no cabeçalho do e-mail), status registrado, previsão interpretada com o fuso,
// pendências. Nunca inventa compromisso: sem data válida => "PENDENTE" e pedido de complementação.

export const REPLY_CONFIRMATION_TITLE = "Resposta registrada no alerta";

export interface ReplyConfirmationParts {
  title: string;
  rows: Array<[string, string | null]>;
  paragraphs: string[];
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

export function buildReplyConfirmationParts(payload: Record<string, unknown>, input: { timeZone: string; formatDate: (iso: string) => string; responsibleName: string | null }): ReplyConfirmationParts {
  const rows: Array<[string, string | null]> = [];
  const paragraphs: string[] = [];
  const status = str(payload.statusLabel) ?? "Resposta registrada";
  rows.push(["Status registrado", status]);
  if (payload.rejected === true) {
    // Rejeição/complementação: nunca afirma sucesso; o alerta permanece como estava.
    const reason = str(payload.rejectionReason);
    rows.push(["Resultado", "NÃO aplicado — o alerta permanece como estava"]);
    if (reason) rows.push(["Motivo", reason]);
    paragraphs.push("Responda a este e-mail com o comando corrigido ou complementado (ex.: \"RESOLVIDO: descrição e evidência\" ou \"ENVIAR PARA: nome@dominio\"). Nenhum prazo foi alterado.");
    rows.push(["Responsável atual", input.responsibleName]);
    return { title: REPLY_CONFIRMATION_TITLE, rows, paragraphs };
  }
  const forecastStatus = str(payload.forecastStatus);
  const forecastAt = str(payload.forecastAt);
  const tracked = payload.forecastTracking === "TRACKED";
  const problem = str(payload.forecastProblem);
  const matched = str(payload.forecastMatched);
  if (forecastStatus === "VALID" && forecastAt) {
    rows.push(["Previsão de conclusão interpretada", `${input.formatDate(forecastAt)} (horário de Brasília — ${input.timeZone})`]);
    if (matched) rows.push(["Trecho reconhecido", `"${matched}"`]);
    paragraphs.push("Confira a data e o horário interpretados. Se estiverem incorretos, responda a este e-mail com a previsão correta.");
  } else if (forecastStatus === "PENDING") {
    rows.push(["Previsão de conclusão", "PENDENTE"]);
    if (problem) rows.push(["Pendência", problem]);
    if (matched) rows.push(["Trecho analisado", `"${matched}"`]);
    paragraphs.push(
      tracked
        ? "Responda a este e-mail informando a data E o horário previstos de conclusão (ex.: \"Conclusão prevista para 20/11/2026 às 15h\")."
        : "Se possível, responda a este e-mail informando a data prevista de conclusão (ex.: \"Previsão: 20/11/2026\")."
    );
  }
  if (payload.outOfOrder) {
    paragraphs.push("Esta mensagem é anterior a uma atualização já registrada neste alerta: foi guardada no histórico, sem alterar o status nem a previsão vigente.");
  }
  if (str(payload.escalatedTo)) rows.push(["Escalonamento", `Nível seguinte informado (${String(payload.escalatedTo)}) conforme a Matriz.`]);
  rows.push(["Responsável atual", input.responsibleName]);
  paragraphs.push(
    tracked || forecastStatus === null
      ? "A resposta e a previsão não reiniciam prazos, não apagam atrasos e não suspendem cobranças nem escalonamentos da Matriz até a resolução."
      : "Risco MÉDIO/BAIXO: a resposta e a previsão ficam registradas e visíveis no ACC, sem novas exigências."
  );
  return { title: REPLY_CONFIRMATION_TITLE, rows, paragraphs };
}
