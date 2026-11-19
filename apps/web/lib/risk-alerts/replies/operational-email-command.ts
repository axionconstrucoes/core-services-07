// Comandos operacionais explícitos recebidos por e-mail (RESOLVIDO e ENVIAR PARA).
// Análise PURA e conservadora: só reconhece o comando quando ele abre o texto NOVO (já isolado por parseReplyBody, sem citação nem
// assinatura) e é o ÚNICO comando da mensagem. Qualquer dúvida devolve `command: null` e a mensagem segue para revisão humana.
// O texto recebido é dado não confiável: nunca é executado, só interpretado por estas expressões regulares.
import { assessOperationalEmailIntent } from "./operational-email-intent";

export type EmailCommand =
  | { kind: "RESOLVE"; note: string }
  | { kind: "FORWARD"; targetEmail: string; instruction: string };

export type EmailCommandParse = { command: EmailCommand; reason: null } | { command: null; reason: string | null };

const RESOLVE_LINE = /^\s*(?:resolvid[oa]|conclu[íi]d[oa]|finalizad[oa])\b[\s:.\-–—]*(.*)$/i;
const FORWARD_LINE = /^\s*enviar\s+para\b[\s:\-–—]*<?([a-z0-9._%+\-]+@[a-z0-9\-]+(?:\.[a-z0-9\-]+)+)>?(?:[\s,;:.\-–—]+(.*))?$/i;
const NEGATED_NOTE = /^(?:n[ãa]o\b|ainda\s+n[ãa]o\b|parcialmente\b|em\s+parte\b|\?)/i;

export function parseOperationalEmailCommand(cleanText: string): EmailCommandParse {
  const text = cleanText.normalize("NFC").trim();
  if (!text) return { command: null, reason: null };
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const commandLines = lines.filter((line) => RESOLVE_LINE.test(line) || FORWARD_LINE.test(line));
  if (commandLines.length === 0) return { command: null, reason: null };
  if (commandLines.length > 1) return { command: null, reason: "Mais de um comando na mesma resposta" };
  // O comando precisa abrir o texto novo: "Não resolvi... Resolvido?" ou comando no meio de um parágrafo não conta.
  if (lines[0] !== commandLines[0]) return { command: null, reason: "O comando não abre a resposta" };

  const first = lines[0];
  const forwardMatch = FORWARD_LINE.exec(first);
  if (forwardMatch) {
    const rest = [forwardMatch[2] ?? "", ...lines.slice(1)].join("\n").trim();
    return { command: { kind: "FORWARD", targetEmail: forwardMatch[1].toLowerCase(), instruction: rest }, reason: null };
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
