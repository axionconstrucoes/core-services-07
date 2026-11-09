// Apresentação das respostas da AXIA: Markdown MÍNIMO e SEGURO, sem alterar o conteúdo.
//
// - NUNCA devolve HTML: o resultado é uma árvore de blocos/trechos que o React renderiza como TEXTO (escapado).
//   Tags, scripts, atributos e entidades digitados na resposta aparecem como texto literal, nunca como código.
// - Suporta só: títulos (#), listas numeradas (1.), marcadores (-, *, •), **negrito** e [rótulo](link seguro).
// - Link seguro = https:// (sem credenciais) ou caminho interno iniciado por uma única "/". Qualquer outro esquema
//   (javascript:, data:, http:, mailto:, //host...) vira texto simples.
// - structureClassifications: quando um parágrafo corrido traz 3 ou mais graus (Crítico, Alto, Médio, Baixo), cada
//   grau passa a ocupar uma linha numerada. Só muda a FORMA: as palavras da resposta são as mesmas (ver os testes).
//
// Puro, sem I/O, sem React: testável por script Node.

export type RichInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "link"; label: string; href: string; external: boolean };

export type RichBlock =
  | { kind: "paragraph"; inline: RichInline[] }
  | { kind: "heading"; inline: RichInline[] }
  | { kind: "ordered"; items: RichInline[][] }
  | { kind: "bullets"; items: RichInline[][] };

export const RICH_TEXT_MAX_CHARS = 6000;
export const RICH_TEXT_MAX_BLOCKS = 60;
export const RICH_TEXT_MAX_ITEMS = 40;

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Devolve o link normalizado se for seguro; senão null (o chamador mostra só o rótulo, como texto). */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  const href = raw.trim();
  if (!href || href.length > 500 || /[\u0000-\u001f\u007f\s\\<>"'`]/.test(href)) return null;
  if (href.startsWith("/")) return href.startsWith("//") ? null : { href, external: false };
  try {
    const url = new URL(href);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return { href: url.toString(), external: true };
  } catch {
    return null;
  }
}

const INLINE_RE = /\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\n]+)\)/g;

function parseInline(line: string): RichInline[] {
  const out: RichInline[] = [];
  let last = 0;
  for (const match of line.matchAll(INLINE_RE)) {
    const index = match.index ?? 0;
    if (index > last) out.push({ kind: "text", text: line.slice(last, index) });
    if (match[1] !== undefined) {
      out.push({ kind: "strong", text: match[1] });
    } else {
      const safe = safeHref(match[3] ?? "");
      out.push(safe ? { kind: "link", label: match[2] ?? "", href: safe.href, external: safe.external } : { kind: "text", text: match[2] ?? "" });
    }
    last = index + match[0].length;
  }
  if (last < line.length) out.push({ kind: "text", text: line.slice(last) });
  return out.length > 0 ? out : [{ kind: "text", text: line }];
}

const HEADING_RE = /^#{1,4}\s+(.+)$/;
const ORDERED_RE = /^\s*\d{1,2}[.)]\s+(.+)$/;
const BULLET_RE = /^\s*[-*•]\s+(.+)$/;

/** Markdown mínimo → blocos. Cada linha comum vira um parágrafo próprio (respostas não têm quebra "dura" no meio). */
export function parseRichText(input: string): RichBlock[] {
  const text = String(input ?? "").replace(CONTROL_CHARS, "").replace(/\r\n?/g, "\n").slice(0, RICH_TEXT_MAX_CHARS);
  const blocks: RichBlock[] = [];
  let list: { kind: "ordered" | "bullets"; items: RichInline[][] } | null = null;
  const flush = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const rawLine of text.split("\n")) {
    if (blocks.length >= RICH_TEXT_MAX_BLOCKS) break;
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", inline: parseInline(heading[1].trim()) });
      continue;
    }
    const ordered = ORDERED_RE.exec(line);
    const bullet = ordered ? null : BULLET_RE.exec(line);
    const itemKind = ordered ? "ordered" : bullet ? "bullets" : null;
    if (itemKind) {
      if (list && list.kind !== itemKind) flush();
      if (!list) list = { kind: itemKind, items: [] };
      if (list.items.length < RICH_TEXT_MAX_ITEMS) list.items.push(parseInline(((ordered ?? bullet) as RegExpExecArray)[1].trim()));
      continue;
    }
    flush();
    blocks.push({ kind: "paragraph", inline: parseInline(line.trim()) });
  }
  flush();
  return blocks;
}

const GRADE = "(?:Crítico|CRÍTICO|Alto|ALTO|Médio|MÉDIO|Baixo|BAIXO)";
const GRADE_SPLIT = new RegExp(`(?<=^|[.;]\\s+)(?=${GRADE}(?!\\p{L}))`, "u");
const GRADE_HEAD = new RegExp(`^(${GRADE})(?!\\p{L})\\s*[:,]?\\s*([\\s\\S]*)$`, "u");
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/u;
const GRADE_LABEL: Record<string, string> = { crítico: "CRÍTICO", alto: "ALTO", médio: "MÉDIO", baixo: "BAIXO" };

function structureParagraph(paragraph: string): string {
  if (/\n\s*(?:\d{1,2}[.)]|[-*•]|#{1,4})\s/.test(`\n${paragraph}`) || paragraph.includes("**")) return paragraph;
  const parts = paragraph.split(GRADE_SPLIT).map((part) => part.trim()).filter(Boolean);
  const heads = parts.map((part) => GRADE_HEAD.exec(part));
  const first = heads.findIndex((head) => head !== null);
  if (first < 0) return paragraph;
  const labeled = heads.slice(first);
  if (labeled.some((head) => head === null)) return paragraph;
  const grades = new Set(labeled.map((head) => (head as RegExpExecArray)[1].toLowerCase()));
  if (labeled.length < 3 || grades.size < 3) return paragraph;

  const prefix = parts.slice(0, first).join(" ");
  let trailing = "";
  const lines: string[] = [];
  for (let i = 0; i < labeled.length; i += 1) {
    const head = labeled[i] as RegExpExecArray;
    let rest = head[2].trim();
    if (i === labeled.length - 1) {
      const sentences = rest.split(SENTENCE_SPLIT);
      rest = (sentences.shift() ?? "").trim();
      trailing = sentences.join(" ").trim();
    }
    rest = rest.replace(/[;,]\s*$/, ".");
    if (!rest || rest === ".") return paragraph;
    if (!/[.!?]$/.test(rest)) rest = `${rest}.`;
    lines.push(`${i + 1}. **${GRADE_LABEL[head[1].toLowerCase()]}** — ${rest}`);
  }
  return [prefix, lines.join("\n"), trailing].filter(Boolean).join("\n\n");
}

/** Reorganiza parágrafos corridos com 3+ graus em lista numerada. O conteúdo (palavras) não muda. */
export function structureClassifications(text: string): string {
  return String(text ?? "")
    .split(/\n{2,}/)
    .map(structureParagraph)
    .join("\n\n");
}

/** Texto da resposta → blocos prontos para renderizar (estrutura + Markdown seguro). */
export function toRichBlocks(text: string): RichBlock[] {
  return parseRichText(structureClassifications(String(text ?? "").slice(0, RICH_TEXT_MAX_CHARS)));
}

/** Texto puro dos blocos (sem marcações), para conferir que a apresentação não mudou o conteúdo. */
export function richBlocksToPlainText(blocks: RichBlock[]): string {
  const flat = (inline: RichInline[]) => inline.map((part) => (part.kind === "link" ? part.label : part.text)).join("");
  return blocks
    .map((block) => (block.kind === "ordered" || block.kind === "bullets" ? block.items.map(flat).join(" ") : flat(block.inline)))
    .join(" ");
}
