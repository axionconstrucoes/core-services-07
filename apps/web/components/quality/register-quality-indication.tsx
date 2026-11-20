"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { FeatureInfo } from "@/components/shared/feature-info";
import {
  INGESTION_CLASSIFICATIONS,
  INGESTION_CLASSIFICATION_LABELS,
  INGESTION_ORIGIN_LABELS,
  type IngestionClassification,
  type IngestionOriginType,
} from "@/lib/quality/ingestion";
import {
  lookupQualityOriginAction,
  registerQualityIndicationAction,
  triageQualityOriginAction,
} from "@/app/[projectId]/fontes-qualidade/actions";

// Botão "Registrar indício de Qualidade" (ingestão HUMANA, com deduplicação por origem).
// Toda decisão é de uma pessoa: o botão só consulta quality_find_by_origin e, se não houver RNC ativa da mesma origem,
// cria a RNC (estado DETECTADA) com a evidência classificada por quem registra. NC COMPROVADA não é oferecida.
// Cores: tokens semânticos (card/border/foreground/muted-foreground) — fundo claro->texto escuro, fundo escuro->texto claro.

interface Props {
  projectId: string;
  /** Origem(ns) permitidas; se houver mais de uma, a pessoa escolhe. A primeira é o padrão. */
  originTypes: readonly IngestionOriginType[];
  /** Referência estável da fonte (ver buildOriginRef em lib/quality/ingestion.ts). */
  originRef: string;
  sourceTable: string | null;
  /** Caminho interno do ACC que abre a fonte original. */
  originUrl: string | null;
  defaultTitle: string;
  /** Oferece a triagem assistida (apenas foto SSMA e e-mail). */
  triageEligible?: boolean;
  /** Se verdadeiro, mostra o botão compacto (para células de tabela). */
  compact?: boolean;
}

type Phase =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "exists"; ncrId: string; code: string; state: string }
  | { kind: "form" }
  | { kind: "done"; ncrId: string; code: string; note: string }
  | { kind: "error"; message: string };

const controlClass =
  "min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-card-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-70";
const buttonClass =
  "min-h-11 min-w-11 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-card-foreground hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-70";

export function RegisterQualityIndication(props: Props) {
  const { projectId, originTypes, originRef, sourceTable, originUrl, defaultTitle, triageEligible = false, compact = false } = props;
  const uid = useId();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [originType, setOriginType] = useState<IngestionOriginType>(originTypes[0]);
  const [title, setTitle] = useState(defaultTitle.slice(0, 300));
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<IngestionClassification>("SUSPEITA");
  const [triageMessage, setTriageMessage] = useState<string | null>(null);

  const qualityHref = `/${projectId}/qualidade`;

  function open() {
    setPhase({ kind: "loading" });
    setTriageMessage(null);
    startTransition(async () => {
      const result = await lookupQualityOriginAction({ projectId, originType, originRef });
      if (!result.ok) return setPhase({ kind: "error", message: result.error });
      if (result.existing) return setPhase({ kind: "exists", ...result.existing });
      setPhase({ kind: "form" });
    });
  }

  function submit() {
    startTransition(async () => {
      const result = await registerQualityIndicationAction({
        projectId,
        originType,
        originRef,
        sourceTable,
        originUrl,
        title,
        description,
        classification,
      });
      if (!result.ok) return setPhase({ kind: "error", message: result.error });
      const outcome = result.outcome;
      if (outcome.status === "EXISTS") return setPhase({ kind: "exists", ncrId: outcome.ncrId, code: outcome.code, state: outcome.state });
      if (outcome.status === "DEDUPLICATED") {
        return setPhase({ kind: "done", ncrId: outcome.ncrId, code: outcome.code, note: "Outra pessoa acabou de registrar esta origem: nenhuma RNC nova foi criada." });
      }
      setPhase({
        kind: "done",
        ncrId: outcome.ncrId,
        code: outcome.code,
        note: outcome.evidenceRecorded ? "RNC criada em DETECTADA, com a evidência vinculada à fonte original." : (outcome.evidenceNote ?? "RNC criada."),
      });
    });
  }

  function triage() {
    setTriageMessage(null);
    startTransition(async () => {
      const result = await triageQualityOriginAction({ projectId, originType, originRef, sourceTable, originUrl });
      if (!result.ok) {
        setTriageMessage(result.problems?.length ? `${result.error} Motivos: ${result.problems.join("; ")}` : result.error);
        return;
      }
      setTriageMessage(`Triagem registrada como INFERÊNCIA (provedor ${result.providerId}). Requer revisão humana na RNC.`);
    });
  }

  const canTriage = triageEligible && (phase.kind === "exists" || phase.kind === "done");

  return (
    <div className={compact ? "mt-2 text-sm" : "space-y-2 text-sm"}>
      <span className="inline-flex items-center gap-1.5">
        <button type="button" onClick={open} disabled={pending || phase.kind === "form"} className={buttonClass}>
          Registrar indício de Qualidade
        </button>
        <FeatureInfo helpId="fontes.indicio.botao" />
      </span>

      {phase.kind === "loading" ? <p role="status" className="text-muted-foreground">Verificando se esta origem já tem RNC…</p> : null}

      {phase.kind === "error" ? (
        <p role="alert" className="rounded-md border border-border bg-card p-2 text-card-foreground">
          {phase.message}
        </p>
      ) : null}

      {phase.kind === "exists" ? (
        <div role="status" className="space-y-2 rounded-md border border-border bg-card p-3 text-card-foreground">
          <p className="flex flex-wrap items-center gap-1.5">
            <span>
              Esta origem já tem a RNC <strong>{phase.code}</strong> ativa (estado {phase.state}). Nenhuma RNC nova foi criada.
            </span>
            <FeatureInfo helpId="fontes.indicio.duplicidade" />
          </p>
          <Link href={qualityHref} className="inline-flex min-h-11 items-center underline underline-offset-2">
            Abrir Qualidade
          </Link>
        </div>
      ) : null}

      {phase.kind === "form" ? (
        // help-exempt: formulário do registro de indício; cada campo e o botão de envio têm helpId próprio (fontes.indicio.*)
        <form
          className="space-y-3 rounded-md border border-border bg-card p-3 text-card-foreground"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          {originTypes.length > 1 ? (
            <div className="space-y-1">
              <label htmlFor={`${uid}-origem`} className="flex items-center gap-1.5 font-medium">
                Tipo da fonte
                <FeatureInfo helpId="fontes.indicio.tipo-fonte" />
              </label>
              <select id={`${uid}-origem`} className={controlClass} value={originType} onChange={(e) => setOriginType(e.target.value as IngestionOriginType)}>
                {originTypes.map((type) => (
                  <option key={type} value={type}>
                    {INGESTION_ORIGIN_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <label htmlFor={`${uid}-titulo`} className="flex items-center gap-1.5 font-medium">
              Título do indício
              <FeatureInfo helpId="fontes.indicio.titulo" />
            </label>
            <input id={`${uid}-titulo`} className={controlClass} value={title} maxLength={300} minLength={3} required onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${uid}-descricao`} className="flex items-center gap-1.5 font-medium">
              O que foi observado
              <FeatureInfo helpId="fontes.indicio.descricao" />
            </label>
            <textarea id={`${uid}-descricao`} className={controlClass} rows={3} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label htmlFor={`${uid}-classe`} className="flex items-center gap-1.5 font-medium">
              Classificação
              <FeatureInfo helpId="fontes.indicio.classificacao" />
            </label>
            <select id={`${uid}-classe`} className={controlClass} value={classification} onChange={(e) => setClassification(e.target.value as IngestionClassification)}>
              {INGESTION_CLASSIFICATIONS.map((value) => (
                <option key={value} value={value}>
                  {INGESTION_CLASSIFICATION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5">
              <button type="submit" disabled={pending} className={buttonClass}>
                Registrar RNC com esta evidência
              </button>
              <FeatureInfo helpId="fontes.indicio.confirmar" />
            </span>
            <button type="button" disabled={pending} className={buttonClass} onClick={() => setPhase({ kind: "idle" })}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {phase.kind === "done" ? (
        <div role="status" className="space-y-2 rounded-md border border-border bg-card p-3 text-card-foreground">
          <p>
            RNC <strong>{phase.code}</strong>. {phase.note}
          </p>
          <Link href={qualityHref} className="inline-flex min-h-11 items-center underline underline-offset-2">
            Abrir Qualidade
          </Link>
        </div>
      ) : null}

      {canTriage ? (
        <div className="space-y-1">
          <span className="inline-flex items-center gap-1.5">
            <button type="button" onClick={triage} disabled={pending} className={buttonClass}>
              Triagem assistida (inferência)
            </button>
            <FeatureInfo helpId="fontes.indicio.triagem" />
          </span>
          {triageMessage ? (
            <p role="status" className="rounded-md border border-border bg-card p-2 text-card-foreground">
              {triageMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
