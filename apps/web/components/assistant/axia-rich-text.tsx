import Link from "next/link";
import type { ReactNode } from "react";

import { toRichBlocks, type RichInline } from "@/lib/assistant/rich-text";

// Renderiza o texto de uma resposta da AXIA com estrutura (títulos, listas, negrito) e SEM HTML arbitrário:
// todo conteúdo entra como nó de texto do React (escapado). Links só quando seguros (ver safeHref).

function Inline({ parts }: { parts: RichInline[] }): ReactNode {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "strong") return <strong key={index} className="font-bold">{part.text}</strong>;
        if (part.kind === "link") {
          return part.external ? (
            <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
              {part.label}
            </a>
          ) : (
            <Link key={index} href={part.href} className="font-semibold underline">
              {part.label}
            </Link>
          );
        }
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

export function AxiaRichText({ text, className }: { text: string; className?: string }) {
  const blocks = toRichBlocks(text);
  if (blocks.length === 0) return null;
  return (
    <div data-axia-texto className={`min-w-0 space-y-2 break-words [overflow-wrap:anywhere] ${className ?? ""}`.trim()}>
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return (
            <p key={index} className="pt-1 font-bold text-[#000000]">
              <Inline parts={block.inline} />
            </p>
          );
        }
        if (block.kind === "ordered" || block.kind === "bullets") {
          const List = block.kind === "ordered" ? "ol" : "ul";
          return (
            <List key={index} className={`${block.kind === "ordered" ? "list-decimal" : "list-disc"} space-y-1.5 pl-6`}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="pl-1">
                  <Inline parts={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={index}>
            <Inline parts={block.inline} />
          </p>
        );
      })}
    </div>
  );
}
