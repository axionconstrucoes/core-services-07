"use client";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INSURANCE_WARRANTY_REFERENCES,
  INSURANCE_WARRANTY_REFERENCES_VERSION,
  MANUAL_PROPRIETARIO_CONCEPTS,
  type ReferenceVerification,
} from "@/lib/ai/legal/references-insurance-warranty";
import { COVERAGE_DISCLAIMER, UNCONFIRMED_REFERENCES_NOTICE } from "@/lib/garantias/coverage-form";
import { Notice, SourceLink } from "./ui-bits";

const VERIFICATION_LABEL: Record<ReferenceVerification, string> = {
  OFFICIAL_TEXT_PENDING: "Texto oficial a conferir",
  NOT_CONFIRMED_OFFICIAL: "NÃO confirmada em texto oficial",
  READ_LOCAL_FILE: "Arquivo local lido",
  SECONDARY_ONLY: "Somente fonte secundária",
};

export function ReferencesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">Referências da consulta de cobertura</h2>
        <FeatureInfo helpId="garantias.referencias.painel" />
        <span className="text-xs text-muted-foreground">versão do índice {INSURANCE_WARRANTY_REFERENCES_VERSION}</span>
      </div>
      <Notice tone="warning">
        <p>{COVERAGE_DISCLAIMER}</p>
        <p className="mt-1">{UNCONFIRMED_REFERENCES_NOTICE}</p>
      </Notice>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Índice de fontes a conferir
            <FeatureInfo helpId="garantias.referencias.lista" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {INSURANCE_WARRANTY_REFERENCES.map((ref) => (
              <li key={ref.id} className="rounded-md border border-border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">{ref.title}</span>
                  <Badge variant={ref.verification === "READ_LOCAL_FILE" ? "success" : ref.verification === "NOT_CONFIRMED_OFFICIAL" ? "destructive" : "warning"}>{VERIFICATION_LABEL[ref.verification]}</Badge>
                  {ref.isSecondary ? <Badge variant="outline">Fonte secundária: não fundamenta conclusão</Badge> : null}
                </div>
                {ref.identification ? <p className="text-muted-foreground">{ref.identification}</p> : <p className="text-muted-foreground">Identificação formal: SEM DADOS</p>}
                <p className="mt-1 text-foreground">{ref.relevance}</p>
                {ref.officialSourceToCheck ? (
                  <p className="mt-1">
                    Conferir em: <SourceLink reference={ref.officialSourceToCheck} url={ref.officialSourceToCheck} />
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">Origem oficial a conferir: SEM DADOS (nenhuma URL confirmada).</p>
                )}
                {ref.notes.length > 0 ? (
                  <details className="mt-1">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium text-foreground">Limitações e cautelas</summary>
                    <ul className="list-disc pl-5 text-muted-foreground">
                      {ref.notes.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Manual do Proprietário — referência histórica habitacional
            <FeatureInfo helpId="garantias.referencias.manual-proprietario" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Notice tone="info" className="mb-3">
            Conceitos do Manual do Proprietário (3ª ed.) valem como REFERÊNCIA HISTÓRICA de edificação habitacional. No ACC só se aplicam se o contrato ou o termo do projeto os previr; não são norma nem prazo universal.
          </Notice>
          <ul className="space-y-2">
            {MANUAL_PROPRIETARIO_CONCEPTS.map((c) => (
              <li key={c.id} className="rounded-md border border-border p-3 text-sm">
                <p className="font-semibold text-foreground">
                  {c.concept} <span className="font-normal text-muted-foreground">({c.page})</span>
                </p>
                <p className="text-foreground">{c.paraphrase}</p>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
