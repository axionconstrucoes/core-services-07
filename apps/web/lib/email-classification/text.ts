// Utilidades de texto do motor de classificação (puras). Nunca alteram o e-mail original: trabalham sobre cópias.

/** Minúsculas, sem acento, espaços colapsados. */
export function norm(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1).trim().toLowerCase();
}

export function normAddress(address: string): string {
  const m = /<([^>]+)>/.exec(address);
  return (m ? m[1] : address).trim().toLowerCase();
}

/**
 * Separa a parte NOVA da mensagem do histórico citado (resposta/encaminhamento). Para que a fala de outro remetente
 * citada numa resposta não seja atribuída a quem respondeu. Encaminhamentos (Fwd/Enc) NÃO são cortados: o conteúdo
 * encaminhado é o assunto da mensagem, mas é tratado como encaminhado (oficialidade INTERNA).
 */
export function splitQuoted(body: string): { fresh: string; quoted: string } {
  const lines = body.split(/\r?\n/);
  const fresh: string[] = [];
  const quoted: string[] = [];
  let inQuote = false;
  for (const line of lines) {
    const startsQuote =
      /^\s*>/.test(line) ||
      /^\s*-{2,}\s*(mensagem original|original message|forwarded message|mensagem encaminhada)/i.test(line) ||
      /^\s*(em|on)\s.{5,120}(escreveu|wrote)\s*:?\s*$/i.test(line);
    if (startsQuote) inQuote = true;
    (inQuote ? quoted : fresh).push(line);
  }
  return { fresh: fresh.join("\n"), quoted: quoted.join("\n") };
}

export function isForwarded(subject: string, body: string): boolean {
  return /^\s*(fwd?|enc|encaminhado)\s*:/i.test(subject) || /-{2,}\s*(mensagem encaminhada|forwarded message)/i.test(body);
}

/** Remetente original citado num encaminhamento ("De: Fulano <x@y>"). */
export function forwardedOriginalSender(body: string): string | null {
  const m = /(?:^|\n)\s*(?:de|from)\s*:\s*[^\n<]*<([^>\s]+@[^>\s]+)>/i.exec(body) ?? /(?:^|\n)\s*(?:de|from)\s*:\s*([^\s<>]+@[^\s<>]+)/i.exec(body);
  return m ? m[1].trim().toLowerCase() : null;
}

export interface Sentence {
  text: string;
  offset: number;
}

/** Quebra em sentenças preservando o deslocamento no texto original (para a referência de evidência). */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const re = /[^.!?\n]+[.!?]?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[0].trim();
    if (t.length >= 4) out.push({ text: t, offset: m.index });
  }
  return out;
}

export function excerpt(text: string, max = 240): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}
