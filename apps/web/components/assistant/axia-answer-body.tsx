import Link from "next/link";

import type { AssistantAnswer } from "@/lib/assistant/answer";
import { NOT_ANSWERED_LABEL } from "@/lib/assistant/qa-handoff";
import { AxiaRichText } from "./axia-rich-text";

// Corpo de UMA resposta da AXIA (dentro do balão): título em negrito, texto estruturado por assunto (listas
// numeradas, negrito, espaçamento), passos, botões de link, citação do manual e avisos de cobertura.
// Só apresentação: o conteúdo vem pronto de AssistantAnswer e nada aqui altera regra, prazo, SLA ou classificação.

export function AxiaAnswerBody({
  answer,
  notAnswered,
  onNotAnswered,
}: {
  answer: AssistantAnswer;
  notAnswered?: boolean;
  onNotAnswered: () => void;
}) {
  return (
    <>
      {answer.intro ? <AxiaRichText text={answer.intro} /> : null}
      {answer.caseNotice ? (
        <p data-axia-caso className="rounded-md bg-[#fff3cd] px-2 py-1 text-xs text-[#000000]">
          {answer.caseNotice}
        </p>
      ) : null}
      {answer.readOnlyNotice ? <p className="rounded-md bg-[#fff3cd] px-2 py-1 text-xs text-[#000000]">{answer.readOnlyNotice}</p> : null}
      {answer.kind === "social" || answer.kind === "scope" ? (
        <>
          {answer.kind === "scope" ? <p className="font-bold text-[#000000]">{answer.title}</p> : null}
          <div data-axia-escopo={answer.kind === "scope" ? "" : undefined}>
            <AxiaRichText text={answer.summary} />
          </div>
        </>
      ) : (
        <>
          <p className="font-bold text-[#000000]">{answer.title}</p>
          <AxiaRichText text={answer.summary} />
          {answer.sections?.map((section) => (
            <div key={section.title} className="space-y-2 border-t border-gray-200 pt-3">
              <p className="font-bold text-[#000000]">{section.title}</p>
              <AxiaRichText text={section.summary} />
              {section.steps.length > 0 ? (
                <ol className="list-decimal space-y-1.5 pl-6">
                  {section.steps.map((step) => (
                    <li key={step} className="pl-1">
                      <AxiaRichText text={step} />
                    </li>
                  ))}
                </ol>
              ) : null}
              {section.manualSection ? <p data-axia-citacao className="text-xs text-[#000000]">Fonte no manual: seção {section.manualSection}</p> : null}
            </div>
          ))}
          {answer.steps.length > 0 ? (
            <ol className="list-decimal space-y-1.5 pl-6">
              {answer.steps.map((step) => (
                <li key={step} className="pl-1">
                  <AxiaRichText text={step} />
                </li>
              ))}
            </ol>
          ) : null}
          {answer.links.length > 0 || answer.tutorialSlide ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {answer.links.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-md bg-brand-sidebar px-2 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  {link.label}
                </Link>
              ))}
              {answer.tutorialSlide ? <span className="px-1 py-1 text-xs text-[#000000]">Tutorial: slide {answer.tutorialSlide}</span> : null}
            </div>
          ) : null}
          {answer.manualSection && !answer.sections ? (
            <p data-axia-citacao className="text-xs text-[#000000]">
              Fonte no manual: seção {answer.manualSection}
            </p>
          ) : null}
          {answer.coverage === "parcial" ? (
            <p data-axia-cobertura="parcial" className="rounded-md bg-[#fff3cd] px-2 py-1 text-xs text-[#000000]">
              Resposta parcial: pode não cobrir o seu caso.
            </p>
          ) : null}
          {answer.coverage === "ausente" ? (
            <p data-axia-cobertura="ausente" className="rounded-md bg-[#fff3cd] px-2 py-1 text-xs text-[#000000]">
              Ainda não tenho uma resposta aprovada para isso.
            </p>
          ) : null}
          {answer.coverage === "completa" && !notAnswered && answer.kind !== "clarify" ? (
            <button
              type="button"
              data-axia-nao-respondeu
              onClick={onNotAnswered}
              className="min-h-8 rounded-md border border-gray-400 px-2 py-1 text-xs text-[#000000] hover:bg-gray-100"
            >
              {NOT_ANSWERED_LABEL}
            </button>
          ) : null}
        </>
      )}
    </>
  );
}
