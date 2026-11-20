"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveCoverageOpinionAction } from "@/app/[projectId]/garantias/actions-parecer";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CoverageFormState } from "@/lib/garantias/coverage-form";
import { OPINION_NOT_LEGAL_NOTICE, WARRANTY_COVERAGE_ENGINE_VERSION, buildOpinionPayload, formFromOpinion, isOpinionStale, type OpinionVersionView } from "@/lib/garantias/opinion";
import { BUTTON_CLASS, BUTTON_OUTLINE_CLASS, FIELD_CLASS, FieldLabel, Notice, SemDados, formatDateTime } from "./ui-bits";

// PARECER GRAVADO (Fase 3 / E): grava a consulta de cobertura como NOVA versão (append-only) e lista o histórico. A conclusão é derivada no servidor
// e reverificada pelo banco (nunca digitada). Não envia nada a terceiros. A autoridade de permissão é o banco (RPC quality_warranty_opinion_save).

const CONCLUSION_VARIANT: Record<string, "success" | "destructive" | "warning" | "outline"> = {
  "POTENCIALMENTE COBERTO": "success",
  "POTENCIALMENTE NÃO COBERTO": "destructive",
  "COBERTURA CONDICIONADA": "warning",
  "INFORMAÇÕES INSUFICIENTES": "outline",
};

export function CoverageHistory({
  projectId,
  caseId,
  form,
  onLoad,
  versions,
  available,
  loadError,
  canRegister,
  memberNames,
}: {
  projectId: string;
  caseId: string;
  form: CoverageFormState;
  onLoad: (next: CoverageFormState) => void;
  versions: OpinionVersionView[];
  available: boolean;
  loadError: string | null;
  canRegister: boolean;
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = versions[0] ?? null;
  const built = buildOpinionPayload(form);
  const blockers = built.ok ? [] : built.errors;

  function save() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await saveCoverageOpinionAction(projectId, caseId, form, latest?.versionNo ?? 0, note);
      if (res.ok) {
        setNotice(`Parecer gravado como versão ${res.versionNo} (${res.conclusion}). A versão anterior foi preservada.`);
        setNote("");
        router.refresh();
      } else setError(res.message);
    });
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-1">
          Parecer gravado (versões)
          <FeatureInfo helpId="garantias.detalhe.parecer-secao" />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Notice tone="warning">{OPINION_NOT_LEGAL_NOTICE}</Notice>
        {!available ? (
          <Notice tone="warning" role="alert">
            A gravação do parecer ainda não está habilitada neste ambiente (migrations pendentes). A consulta continua funcionando, sem gravação.
          </Notice>
        ) : null}
        {loadError ? (
          <Notice tone="error" role="alert">
            {loadError} A ausência de versões abaixo NÃO significa que nunca houve parecer.
          </Notice>
        ) : null}

        <div className="space-y-1">
          <FieldLabel htmlFor="parecer-nota" label="Nota da versão (opcional)" helpId="garantias.detalhe.parecer-nota" />
          <input id="parecer-nota" className={FIELD_CLASS} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} placeholder="Motivo desta reavaliação" />
        </div>
        {blockers.length > 0 ? (
          <Notice tone="warning">
            <p className="font-semibold">Para gravar, corrija as pendências do formulário:</p>
            <ul className="list-disc pl-4">
              {blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={BUTTON_CLASS} disabled={!canRegister || !available || pending || blockers.length > 0} onClick={save}>
            {pending ? "Gravando…" : `Gravar parecer (versão ${(latest?.versionNo ?? 0) + 1})`}
          </button>
          <FeatureInfo helpId="garantias.detalhe.parecer-salvar" />
          {!canRegister ? <span className="text-xs text-muted-foreground">Requer perfil: Administrador, Gerente, Gestor ou Colaborador.</span> : null}
        </div>
        {error ? (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        ) : null}
        {notice ? (
          <Notice tone="success" role="status">
            {notice}
          </Notice>
        ) : null}

        <div>
          <p className="flex items-center gap-1 text-sm font-semibold text-foreground">
            Versões gravadas
            <FeatureInfo helpId="garantias.detalhe.parecer-versoes" />
          </p>
          {versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              <SemDados>SEM DADOS: a consulta ainda não foi gravada.</SemDados>
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {versions.map((v) => {
                const filled = v.items.filter((i) => i.status === "PREENCHIDO").length;
                const without = v.items.filter((i) => i.status === "SEM_DADOS").length;
                return (
                  <li key={v.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">Versão {v.versionNo}</span>
                      <Badge variant={CONCLUSION_VARIANT[v.conclusion] ?? "outline"}>{v.conclusion}</Badge>
                      {v.routeToHuman ? <Badge variant="warning">Encaminhar ao responsável humano</Badge> : null}
                      {isOpinionStale(v) ? (
                        <span className="inline-flex items-center gap-1">
                          <Badge variant="outline">Motor/referências diferentes das atuais</Badge>
                          <FeatureInfo helpId="garantias.detalhe.parecer-desatualizada" />
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-muted-foreground">
                      {formatDateTime(v.createdAt)} · {v.createdBy ? (memberNames[v.createdBy] ?? `${v.createdBy.slice(0, 8)}…`) : "autor SEM DADOS"} · {filled} itens com fonte · {without} SEM DADOS
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Motor/referências: {v.engineVersion}
                      {v.engineVersion === WARRANTY_COVERAGE_ENGINE_VERSION ? " (atual)" : ""}
                    </p>
                    {v.note ? <p className="mt-1 text-foreground">Nota: {v.note}</p> : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button type="button" className={BUTTON_OUTLINE_CLASS} onClick={() => onLoad(formFromOpinion(v))}>
                        Carregar no formulário
                      </button>
                      <FeatureInfo helpId="garantias.detalhe.parecer-carregar" />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
