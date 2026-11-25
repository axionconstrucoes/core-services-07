import type { ReactNode } from "react";
import type { FeatureHelpDefinition } from "@/lib/ui/help/types";
import { cn } from "@/lib/utils";

// Corpo estruturado de uma entrada do catálogo de ajuda (Hover Text). Componente de SERVIDOR/CLIENTE (sem estado):
// usado pelo popover (HelpHint) e por páginas que precisem exibir a mesma descrição por extenso (ex.: EXPERTS IA).
// Só renderiza os campos PRESENTES na entrada — nunca preenche lacunas com texto genérico.

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-3 first:mt-0">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</h3>
      <div className="mt-0.5 text-foreground">{children}</div>
    </section>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function HelpContent({ help, className }: { help: FeatureHelpDefinition; className?: string }) {
  return (
    <div className={cn("space-y-0 text-xs leading-relaxed", className)}>
      <Section label="O que é">
        <p>{help.description}</p>
      </Section>
      {help.purpose ? (
        <Section label="Para que serve">
          <p>{help.purpose}</p>
        </Section>
      ) : null}
      {help.howToUse && help.howToUse.length > 0 ? (
        <Section label="Como usar">
          <ol className="list-decimal space-y-0.5 pl-4">
            {help.howToUse.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Section>
      ) : null}
      {help.howItWorks ? (
        <Section label="Como funciona">
          <p>{help.howItWorks}</p>
        </Section>
      ) : null}
      {help.formula ? (
        <Section label="Fórmula">
          <code className="block whitespace-pre-wrap break-words rounded border border-border bg-muted px-2 py-1 font-mono text-[11px] text-foreground">
            {help.formula}
          </code>
        </Section>
      ) : null}
      {help.data && help.data.length > 0 ? (
        <Section label="Dados utilizados">
          <List items={help.data} />
        </Section>
      ) : null}
      {help.uses && help.uses.length > 0 ? (
        <Section label="Utilizações">
          <List items={help.uses} />
        </Section>
      ) : null}
      {help.criteria && help.criteria.length > 0 ? (
        <Section label="Critérios">
          <List items={help.criteria} />
        </Section>
      ) : null}
      {help.source ? (
        <Section label="Fonte de dados">
          <p>{help.source}</p>
        </Section>
      ) : null}
      {help.unit ? (
        <Section label="Unidade e período">
          <p>{help.unit}</p>
        </Section>
      ) : null}
      {help.refresh ? (
        <Section label="Atualização">
          <p>{help.refresh}</p>
        </Section>
      ) : null}
      {help.missingData ? (
        <Section label="Dado ausente">
          <p>{help.missingData}</p>
        </Section>
      ) : null}
      {help.result ? (
        <Section label="Resultado">
          <p>{help.result}</p>
        </Section>
      ) : null}
      {help.consequences && help.consequences.length > 0 ? (
        <Section label="Consequências">
          <List items={help.consequences} />
        </Section>
      ) : null}
      {help.permissions ? (
        <Section label="Permissões">
          <p>{help.permissions}</p>
        </Section>
      ) : null}
      {help.limitations && help.limitations.length > 0 ? (
        <Section label="Limitações">
          <List items={help.limitations} />
        </Section>
      ) : null}
      {help.validity ? (
        <Section label="Vigência">
          <p className="rounded border border-border bg-muted px-2 py-1">{help.validity}</p>
        </Section>
      ) : null}
      {help.humanReview ? (
        <Section label="Revisão humana">
          <p>{help.humanReview}</p>
        </Section>
      ) : null}
    </div>
  );
}
