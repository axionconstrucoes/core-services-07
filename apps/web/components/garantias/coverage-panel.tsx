"use client";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SELECT_CLASS } from "@/components/ui/select";
import { WARRANTY_COVERAGE_ITEMS, type WarrantyItemStatus, type WarrantySignals } from "@/lib/ai/legal/warranty-coverage";
import {
  SIGNAL_OPTIONS,
  coverageNotices,
  emptyCoverageForm,
  evaluateCoverageForm,
  MAINTENANCE_FACT_NOTICE,
  type CoverageFormState,
} from "@/lib/garantias/coverage-form";
import { cn } from "@/lib/utils";
import { BUTTON_OUTLINE_CLASS, FIELD_CLASS, FieldLabel, Notice } from "./ui-bits";

// CONSULTA DE COBERTURA DE GARANTIA (Bloco 5.3): 16 itens + sinais, preenchidos por HUMANO com a fonte de cada item.
// A conclusão é DERIVADA deterministicamente (deriveWarrantyCoverage) — nenhum campo permite digitar a conclusão.
// Sem IA, sem gravação e sem envio: é uma consulta de apoio; a decisão é do responsável humano.

// ids literais (renderizados): um por item do Bloco 5.3, na ordem 1–16
const ITEM_HELP_IDS: Record<string, string> = {
  "natureza-produto-servico": "garantias.cobertura.item-natureza-produto-servico",
  "tipo-defeito": "garantias.cobertura.item-tipo-defeito",
  "data-entrega": "garantias.cobertura.item-data-entrega",
  "data-descoberta": "garantias.cobertura.item-data-descoberta",
  "data-comunicacao": "garantias.cobertura.item-data-comunicacao",
  "documentos-analisados": "garantias.cobertura.item-documentos-analisados",
  "garantia-contratual": "garantias.cobertura.item-garantia-contratual",
  "garantia-legal-potencial": "garantias.cobertura.item-garantia-legal-potencial",
  "vicio-oculto": "garantias.cobertura.item-vicio-oculto",
  "prazo-reclamacao": "garantias.cobertura.item-prazo-reclamacao",
  "prazo-decadencial": "garantias.cobertura.item-prazo-decadencial",
  "prazo-prescricional": "garantias.cobertura.item-prazo-prescricional",
  "responsabilidade-potencial": "garantias.cobertura.item-responsabilidade-potencial",
  "exigencias-manutencao": "garantias.cobertura.item-exigencias-manutencao",
  fundamentacao: "garantias.cobertura.item-fundamentacao",
  "providencia-recomendada": "garantias.cobertura.item-providencia-recomendada",
};

const SIGNAL_FIELDS: Array<{ key: keyof Omit<WarrantySignals, "legalControversy">; label: string; helpId: string }> = [
  { key: "contractualWarranty", label: "Garantia contratual", helpId: "garantias.cobertura.sinal-garantia-contratual" },
  { key: "legalWarrantyPotential", label: "Garantia legal potencial", helpId: "garantias.cobertura.sinal-garantia-legal" },
  { key: "hiddenDefect", label: "Vício oculto", helpId: "garantias.cobertura.sinal-vicio-oculto" },
  { key: "claimDeadline", label: "Prazo de reclamação", helpId: "garantias.cobertura.sinal-prazo-reclamacao" },
  { key: "maintenance", label: "Manutenção exigida", helpId: "garantias.cobertura.sinal-manutencao" },
];

const CONCLUSION_CLASS: Record<string, string> = {
  "POTENCIALMENTE COBERTO": "border-emerald-800 bg-emerald-100 text-emerald-800",
  "POTENCIALMENTE NÃO COBERTO": "border-red-800 bg-red-100 text-red-800",
  "COBERTURA CONDICIONADA": "border-amber-800 bg-amber-100 text-amber-800",
  "INFORMAÇÕES INSUFICIENTES": "border-border bg-card text-card-foreground",
};

const STATUS_OPTIONS: Array<[WarrantyItemStatus, string]> = [
  ["SEM_DADOS", "SEM DADOS"],
  ["PREENCHIDO", "Preenchido"],
  ["NAO_APLICAVEL", "Não aplicável"],
];

export function CoveragePanel({
  form,
  onChange,
  caseCode,
  solidityAndSafety,
  prefillAvailable,
  onPrefill,
  maintenanceFact,
  hints,
}: {
  form: CoverageFormState;
  onChange: (next: CoverageFormState) => void;
  caseCode?: string;
  solidityAndSafety?: boolean;
  prefillAvailable?: boolean;
  onPrefill?: () => void;
  /** Texto factual (constatação de comprovantes) vindo de quality_warranty_maintenance_status. */
  maintenanceFact?: string | null;
  /** Dicas factuais de datas do caso (nunca decidem sinais). */
  hints?: string[];
}) {
  const evaluation = evaluateCoverageForm(form);
  const { derivation } = evaluation;
  const notices = coverageNotices({ solidityAndSafety, legalControversy: form.signals.legalControversy });
  const setItem = (key: string, patch: Partial<CoverageFormState["items"][string]>) =>
    onChange({ ...form, items: { ...form.items, [key]: { ...form.items[key], ...patch } } });
  const setSignal = <K extends keyof WarrantySignals>(key: K, value: WarrantySignals[K]) => onChange({ ...form, signals: { ...form.signals, [key]: value } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-foreground">Consulta de cobertura de garantia{caseCode ? ` — ${caseCode}` : ""}</h2>
        <FeatureInfo helpId="garantias.cobertura.painel" />
      </div>

      <section aria-label="Avisos permanentes" className="space-y-2">
        <div className="flex items-start gap-1">
          <Notice tone="warning" className="flex-1">
            <ul className="list-disc space-y-1 pl-4">
              {notices.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Notice>
          <FeatureInfo helpId="garantias.cobertura.avisos" />
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {prefillAvailable && onPrefill ? (
          <>
            <button type="button" className={BUTTON_OUTLINE_CLASS} onClick={onPrefill}>
              Preencher a partir do caso
            </button>
            <FeatureInfo helpId="garantias.cobertura.preencher-do-caso" />
          </>
        ) : null}
        <button type="button" className={BUTTON_OUTLINE_CLASS} onClick={() => onChange(emptyCoverageForm())}>
          Limpar formulário
        </button>
        <FeatureInfo helpId="garantias.cobertura.limpar" />
      </div>

      {hints && hints.length > 0 ? (
        <Notice tone="info">
          <p className="font-semibold">Fatos registrados no caso (apoio, não decidem os sinais)</p>
          <ul className="list-disc pl-4">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Os 16 itens (cada um com a sua fonte)
            <FeatureInfo helpId="garantias.cobertura.itens" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {WARRANTY_COVERAGE_ITEMS.map((def) => {
              const input = form.items[def.key];
              const idBase = `cob-${def.key}`;
              const filled = input.status === "PREENCHIDO";
              return (
                <li key={def.key} className="rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {def.order}. {def.label}
                    </span>
                    <FeatureInfo helpId={ITEM_HELP_IDS[def.key]} />
                    <span className="text-xs text-muted-foreground">
                      {def.owner === "QUALIDADE" ? "monta: Qualidade (fato/data)" : "conclui: Jurídico"}
                      {def.optional ? " · quando cabível" : ""}
                      {def.core ? " · fundamental" : ""}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-[11rem_1fr_1fr]">
                    <select
                      id={`${idBase}-status`}
                      aria-label={`Situação do item ${def.order}`}
                      value={input.status}
                      onChange={(e) => setItem(def.key, { status: e.target.value as WarrantyItemStatus })}
                      className={cn(SELECT_CLASS, "min-h-11 w-full")}
                    >
                      {STATUS_OPTIONS.filter(([v]) => v !== "NAO_APLICAVEL" || def.optional).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <input
                      id={`${idBase}-valor`}
                      aria-label={`Conteúdo do item ${def.order}`}
                      value={input.value}
                      disabled={!filled}
                      onChange={(e) => setItem(def.key, { value: e.target.value })}
                      className={FIELD_CLASS}
                      placeholder={filled ? "Conteúdo (data, descrição, conclusão parcial)" : input.status === "SEM_DADOS" ? "SEM DADOS" : "—"}
                    />
                    <input
                      id={`${idBase}-fonte`}
                      aria-label={input.status === "NAO_APLICAVEL" ? `Justificativa do item ${def.order}` : `Fonte do item ${def.order}`}
                      value={input.source}
                      disabled={input.status === "SEM_DADOS"}
                      onChange={(e) => setItem(def.key, { source: e.target.value })}
                      className={FIELD_CLASS}
                      placeholder={input.status === "NAO_APLICAVEL" ? "Justificativa obrigatória" : "Fonte: documento, cláusula, e-mail, laudo"}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Sinais (decididos por pessoa)
            <FeatureInfo helpId="garantias.cobertura.sinais" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            {SIGNAL_FIELDS.map((f) => (
              <div key={f.key} className="space-y-1">
                <FieldLabel htmlFor={`sinal-${f.key}`} label={f.label} helpId={f.helpId} />
                <select
                  id={`sinal-${f.key}`}
                  value={form.signals[f.key]}
                  onChange={(e) => setSignal(f.key, e.target.value as never)}
                  className={cn(SELECT_CLASS, "min-h-11 w-full")}
                >
                  {SIGNAL_OPTIONS[f.key].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="flex min-h-11 items-center gap-2">
              <input
                id="sinal-controversia"
                type="checkbox"
                checked={form.signals.legalControversy}
                onChange={(e) => setSignal("legalControversy", e.target.checked)}
                className="size-5 accent-[var(--primary)]"
              />
              <label htmlFor="sinal-controversia" className="text-sm text-foreground">
                Há controvérsia jurídica relevante
              </label>
              <FeatureInfo helpId="garantias.cobertura.sinal-controversia" />
            </div>
          </div>
          {maintenanceFact ? <Notice tone="info">{maintenanceFact} {MAINTENANCE_FACT_NOTICE}</Notice> : null}
        </CardContent>
      </Card>

      <Card aria-live="polite">
        <CardHeader>
          <CardTitle className="flex items-center gap-1">
            Conclusão derivada
            <FeatureInfo helpId="garantias.cobertura.conclusao" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p data-testid="conclusao-cobertura" className={cn("inline-block rounded-md border px-3 py-2 text-base font-bold", CONCLUSION_CLASS[derivation.conclusion])}>
            {derivation.conclusion}
          </p>
          <div>
            <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
              Razões
              <FeatureInfo helpId="garantias.cobertura.razoes" />
            </p>
            {derivation.reasons.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-foreground">
                {derivation.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma razão adicional registrada.</p>
            )}
          </div>
          <div>
            <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
              Dados faltantes
              <FeatureInfo helpId="garantias.cobertura.dados-faltantes" />
            </p>
            {evaluation.missingLabels.length > 0 ? (
              <ul className="list-disc pl-5 text-sm text-foreground">
                {evaluation.missingLabels.map((l) => (
                  <li key={l}>
                    {l}: <span className="font-semibold">SEM DADOS</span>
                    {derivation.missingCoreItems.includes(WARRANTY_COVERAGE_ITEMS.find((d) => d.label === l)?.key ?? "") ? " (item fundamental)" : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todos os itens têm situação informada.</p>
            )}
          </div>
          {evaluation.itemProblems.length > 0 || evaluation.outputProblems.length > 0 ? (
            <Notice tone="error" role="alert">
              <p className="font-semibold">Pendências no preenchimento</p>
              <ul className="list-disc pl-4">
                {[...evaluation.itemProblems, ...evaluation.outputProblems].map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {derivation.routeToHumanResponsible ? (
            <div className="flex items-start gap-1">
              <Notice tone="warning" role="alert" className="flex-1">
                Encaminhar a responsável humano: há controvérsia jurídica relevante. Esta consulta não a resolve.
              </Notice>
              <FeatureInfo helpId="garantias.cobertura.encaminhamento" />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
