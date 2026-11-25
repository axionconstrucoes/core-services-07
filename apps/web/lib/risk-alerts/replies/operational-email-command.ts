// Comandos operacionais explícitos recebidos por e-mail (RESOLVIDO, EM ANDAMENTO e ENVIAR PARA).
// Análise PURA e conservadora: só reconhece o comando quando ele abre o texto NOVO (já isolado por parseReplyBody, sem citação nem
// assinatura) e é o ÚNICO comando da mensagem. Qualquer dúvida devolve `command: null` e a mensagem segue para revisão humana.
// O texto recebido é dado não confiável: nunca é executado, só interpretado por estas expressões regulares.
// Os textos-guia do corpo pré-preenchido pelos atalhos mailto são removidos antes (nunca contam como nota/justificativa).
//
// Formatos:
//   RESOLVIDO | CONCLUÍDO | FINALIZADO [nota]
//   EM ANDAMENTO [providência]  +  linha "Previsão: dd/mm/aaaa [hh:mm]"   (sem a linha "Previsão:" => não é o comando explícito;
//                                                                         a resposta segue a classificação livre de antes)
//   ENVIAR PARA <e-mail exato | nome completo> [, justificativa]  (ou justificativa nas linhas seguintes / "Justificativa: ...")
import { stripReplyPlaceholders } from "@/lib/email-replies/reply-mailto";

import { assessOperationalEmailIntent } from "./operational-email-intent";

export type EmailCommand =
  | { kind: "RESOLVE"; note: string }
  | { kind: "FORWARD"; targetEmail: string | null; targetName: string | null; instruction: string }
  | { kind: "IN_PROGRESS"; note: string; forecastText: string };

export type EmailCommandParse = { command: EmailCommand; reason: null } | { command: null; reason: string | null };

const RESOLVE_LINE = /^\s*(?:resolvid[oa]|conclu[íi]d[oa]|finalizad[oa])\b[\s:.\-–—]*(.*)$/i;
const FORWARD_EMAIL_LINE = /^\s*enviar\s+para\b[\s:\-–—]*<?([a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)+)>?(?:[\s,;:.\-–—]+(.*))?$/i;
const FORWARD_ANY_LINE = /^\s*enviar\s+para\b[\s:\-–—]*(.*)$/i;
const IN_PROGRESS_LINE = /^\s*em\s+andamento\b[\s:.\-–—]*(.*)$/i;
const FORECAST_LABEL_LINE = /^\s*previs[ãa]o(?:\s+de\s+(?:conclus[ãa]o|t[ée]rmino))?\s*:\s*(.*)$/i;
const NEGATED_NOTE = /^(?:n[ãa]o\b|ainda\s+n[ãa]o\b|parcialmente\b|em\s+parte\b|\?)/i;
const REASON_LABEL = /^\s*(?:justificativa|motivo|instru[çc][ãa]o)\s*:\s*/i;
const PERSON_NAME = /^[\p{L}][\p{L}' .-]{1,79}$/u;

function splitNameAndRest(rest: string): { name: string; tail: string } {
  const separator = /\s*(?:[,;]|\s[-–—]\s|\bjustificativa\s*:|\bmotivo\s*:)\s*/i.exec(rest);
  if (!separator) return { name: rest.trim(), tail: "" };
  return { name: rest.slice(0, separator.index).trim(), tail: rest.slice(separator.index + separator[0].length).trim() };
}

export function parseOperationalEmailCommand(cleanText: string): EmailCommandParse {
  const text = stripReplyPlaceholders(cleanText.normalize("NFC")).trim();
  if (!text) return { command: null, reason: null };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const commandLines = lines.filter((line) => RESOLVE_LINE.test(line) || FORWARD_ANY_LINE.test(line));
  const inProgressExplicit = IN_PROGRESS_LINE.test(lines[0] ?? "") && lines.some((line) => FORECAST_LABEL_LINE.test(line));
  if (commandLines.length === 0 && !inProgressExplicit) return { command: null, reason: null };
  if (commandLines.length + (inProgressExplicit ? 1 : 0) > 1) return { command: null, reason: "Mais de um comando na mesma resposta" };

  if (inProgressExplicit) {
    const first = IN_PROGRESS_LINE.exec(lines[0]);
    const forecastLine = lines.find((line) => FORECAST_LABEL_LINE.test(line)) ?? "";
    const forecastText = (FORECAST_LABEL_LINE.exec(forecastLine)?.[1] ?? "").trim();
    const note = [first?.[1] ?? "", ...lines.slice(1).filter((line) => line !== forecastLine)].join("\n").trim();
    return { command: { kind: "IN_PROGRESS", note, forecastText }, reason: null };
  }

  // O comando precisa abrir o texto novo: "Não resolvi... Resolvido?" ou comando no meio de um parágrafo não conta.
  if (lines[0] !== commandLines[0]) return { command: null, reason: "O comando não abre a resposta" };

  const first = lines[0];
  const instructionOf = (head: string) => [head, ...lines.slice(1)].map((line) => line.replace(REASON_LABEL, "").trim()).filter(Boolean).join("\n").trim();
  const forwardEmail = FORWARD_EMAIL_LINE.exec(first);
  if (forwardEmail) {
    return { command: { kind: "FORWARD", targetEmail: forwardEmail[1].toLowerCase(), targetName: null, instruction: instructionOf(forwardEmail[2] ?? "") }, reason: null };
  }
  const forwardAny = FORWARD_ANY_LINE.exec(first);
  if (forwardAny) {
    const { name, tail } = splitNameAndRest(forwardAny[1] ?? "");
    // Destino ausente ou que não parece nome de pessoa: comando reconhecido com destino vazio => resposta pedindo correção.
    const targetName = name && PERSON_NAME.test(name) ? name.replace(/\s+/g, " ") : null;
    return { command: { kind: "FORWARD", targetEmail: null, targetName, instruction: instructionOf(tail) }, reason: null };
  }
  const resolveMatch = RESOLVE_LINE.exec(first);
  if (resolveMatch) {
    const note = [resolveMatch[1] ?? "", ...lines.slice(1)].join("\n").trim();
    if (NEGATED_NOTE.test(note)) return { command: null, reason: "Resolução negada ou parcial" };
    // "Resolvido, mas há impedimento" / "resolvido e encaminho ao gerente" não é um comando inequívoco.
    const mixed = assessOperationalEmailIntent(note);
    if (mixed.intent === "TRANSFER" || mixed.intent === "BLOCKED" || (mixed.intent === "UNDETERMINED" && mixed.requiresReview && note)) {
      return { command: null, reason: "Resolução combinada com outra intenção" };
    }
    return { command: { kind: "RESOLVE", note }, reason: null };
  }
  return { command: null, reason: null };
}
