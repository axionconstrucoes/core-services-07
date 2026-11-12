"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChecklistPhotoView, ChecklistSubmissionView } from "@/lib/ssma/checklist-photos/checklist-submissions-view";
import { checklistPhotoErrorMessage } from "@/lib/ssma/checklist-photos/resolve-checklist-photo";

async function diagnose(url: string): Promise<string> {
  try {
    const response = await fetch(`${url}?verificar=1`, { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
    if (response.ok && body?.ok) return "Não foi possível carregar a imagem";
    return checklistPhotoErrorMessage(response.status, body?.reason ?? null);
  } catch {
    return "Não foi possível abrir a foto";
  }
}

function Thumbnail({ photo, onOpen }: { photo: ChecklistPhotoView; onOpen: (photo: ChecklistPhotoView, trigger: HTMLButtonElement) => void }) {
  const [error, setError] = useState<string | null>(null);
  const handleError = useCallback(() => {
    void diagnose(photo.url).then(setError);
  }, [photo.url]);

  if (error) {
    return (
      <div role="status" className="flex h-24 w-24 items-center justify-center rounded border border-dashed p-1 text-center text-[11px] leading-tight text-muted-foreground">
        {error}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(event) => onOpen(photo, event.currentTarget)}
      className="h-24 w-24 overflow-hidden rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
      aria-label={`Ampliar: ${photo.alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage; next/image não se aplica */}
      <img src={photo.url} alt={photo.alt} loading="lazy" decoding="async" onError={handleError} className="h-full w-full object-cover" />
    </button>
  );
}

export function ChecklistSubmissionsGallery({ submissions }: { submissions: ChecklistSubmissionView[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [current, setCurrent] = useState<ChecklistPhotoView | null>(null);
  const [largeError, setLargeError] = useState<string | null>(null);

  const open = useCallback((photo: ChecklistPhotoView, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setLargeError(null);
    setCurrent(photo);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (current && !dialog.open) {
      dialog.showModal();
      closeRef.current?.focus();
    }
  }, [current]);

  const close = useCallback(() => {
    dialogRef.current?.close();
  }, []);

  const handleDialogClose = useCallback(() => {
    setCurrent(null);
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <ul className="divide-y">
        {submissions.map((submission) => (
          <li key={submission.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold">
                {submission.number ? `${submission.number}. ` : ""}
                {submission.title}
              </span>
              <span className="text-muted-foreground">
                {new Date(submission.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}
              </span>
              <span className="text-muted-foreground">· {submission.technicianName ?? "técnico não identificado"}</span>
              <span className="text-muted-foreground">
                · {submission.photos.length} {submission.photos.length === 1 ? "foto" : "fotos"}
              </span>
            </div>
            {submission.photos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem foto neste envio.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {submission.photos.map((photo) => (
                  <figure key={photo.id} className="w-24 space-y-1">
                    <Thumbnail photo={photo} onOpen={open} />
                    <figcaption className="truncate text-[11px] text-muted-foreground" title={photo.label}>
                      {photo.label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={handleDialogClose}
        onClick={(event) => {
          if (event.target === dialogRef.current) close();
        }}
        aria-label={current ? current.alt : "Foto do checklist"}
        className="w-[min(96vw,64rem)] max-w-none rounded-lg bg-background p-0 text-foreground backdrop:bg-black/70"
      >
        {current ? (
          <div className="flex max-h-[90vh] flex-col">
            <div className="flex items-center justify-between gap-2 border-b p-2">
              <p className="min-w-0 truncate text-sm font-semibold">{current.alt}</p>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                className="min-h-10 shrink-0 rounded border px-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700"
              >
                Fechar
              </button>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-2">
              {largeError ? (
                <p role="status" className="p-6 text-sm text-muted-foreground">{largeError}</p>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage
                <img
                  src={current.url}
                  alt={current.alt}
                  className="max-h-[80vh] max-w-full object-contain"
                  onError={() => void diagnose(current.url).then(setLargeError)}
                />
              )}
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
