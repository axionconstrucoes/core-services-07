"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";

import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { ManagedDocument } from "@/lib/document-management";
import {
  ACCEPT_ATTRIBUTE,
} from "@/lib/documents/multi-upload/allowed-file-types";
import { MULTI_UPLOAD_DOCUMENT_KINDS } from "@/lib/documents/multi-upload/types";
import type { MultiUploadDocumentKind } from "@/lib/documents/multi-upload/types";
import { QueueItemRow } from "./queue-item-row";
import { UploadSummaryBar } from "./upload-summary-bar";
import { useDocumentUploadQueue } from "./use-document-upload-queue";

type Props = {
  projectId: string;
  documents: ManagedDocument[];
};

export function DocumentMultiUploadPanel({ projectId, documents }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const {
    items,
    summary,
    batchDefaultKind,
    isRunning,
    addFiles,
    removeItem,
    clearAllErrors,
    setItemKind,
    applyKindToAllPending,
    setBatchDefaultKind,
    startBatch,
    retryItem,
    confirmVersionDecision,
    rejectVersionDecision,
    confirmConflictAsNew,
    cancelConflictItem,
  } = useDocumentUploadQueue(projectId, documents);

  // Atualiza a lista de documentos da página assim que qualquer
  // arquivo do lote conclui — sem depender de o usuário sair e
  // voltar à aba.
  const lastCompletedCountRef = useRef(0);
  useEffect(() => {
    if (summary.completed > lastCompletedCountRef.current) {
      lastCompletedCountRef.current = summary.completed;
      router.refresh();
    }
  }, [summary.completed, router]);

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      addFiles(event.target.files);
    }
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }

  const hasPending = items.some((item) => item.status === "PENDENTE");
  const hasPendingWithoutKind = items.some(
    (item) => item.status === "PENDENTE" && !item.kind
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <p className="text-sm text-muted-foreground">
          Arraste e solte vários arquivos aqui, ou
        </p>

        <span className="inline-flex items-center gap-1">
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="border border-yellow-500 bg-yellow-400 text-black hover:bg-yellow-500 hover:text-black"
          >
            Selecionar arquivos
          </Button>
          <FeatureInfo helpId="juridico.documentos.upload-multiplo" />
        </span>

        {/* help-exempt: input de arquivo oculto acionado pelo botão Selecionar arquivos, que é o controle documentado */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          onChange={handleFileInputChange}
          className="hidden"
        />

        <p className="text-xs text-muted-foreground">
          Você pode selecionar arquivos em mais de uma vez — nada do que já
          foi adicionado se perde. Máximo 50 MB por arquivo.
        </p>
      </div>

      {items.length > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="flex items-center gap-1 font-medium">
                Tipo para aplicar ao lote
                <FeatureInfo helpId="juridico.documentos.tipo-lote" />
              </span>
              <Select
                value={batchDefaultKind}
                onChange={(event) =>
                  setBatchDefaultKind(
                    event.target.value as MultiUploadDocumentKind
                  )
                }
                className="h-9 border-gray-400 bg-gray-300 text-white hover:border-gray-500"
              >
                <option value="" disabled>
                  Selecione o tipo documental
                </option>
                {MULTI_UPLOAD_DOCUMENT_KINDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>

            <span className="inline-flex items-center gap-1">
              <Button type="button" variant="outline" size="sm" disabled={!hasPending || !batchDefaultKind} onClick={() => applyKindToAllPending(batchDefaultKind)}>
                Aplicar aos arquivos aguardando
              </Button>
              <FeatureInfo helpId="juridico.documentos.tipo-lote" />
            </span>

            <span className="ml-auto inline-flex items-center gap-1">
              <Button type="button" disabled={!hasPending || hasPendingWithoutKind || isRunning} onClick={startBatch}>
                {isRunning ? "Enviando lote..." : "Iniciar envio"}
              </Button>
              <FeatureInfo helpId="juridico.documentos.tipo-lote" />
            </span>
          </div>

          {hasPendingWithoutKind ? (
            <p className="rounded-md border border-amber-500/50 bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
              Antes de iniciar, confirme o tipo documental de cada arquivo. Você pode selecionar o tipo individualmente em cada item ou escolher um tipo acima e clicar em <strong>Aplicar aos arquivos aguardando</strong>. Nenhum tipo é atribuído automaticamente, exceto arquivos .mpp, identificados como cronograma baseline.
            </p>
          ) : null}

          <UploadSummaryBar summary={summary} onClearErrors={clearAllErrors} />

          <div className="flex flex-col gap-2">
            {items.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onKindChange={(kind) => setItemKind(item.id, kind)}
                onRemove={() => removeItem(item.id)}
                onRetry={() => retryItem(item.id)}
                onConfirmVersion={() => confirmVersionDecision(item.id)}
                onRejectVersion={() => rejectVersionDecision(item.id)}
                onConfirmConflict={() => confirmConflictAsNew(item.id)}
                onCancelConflict={() => cancelConflictItem(item.id)}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
