"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { formToRecord, type ActionResult } from "@/lib/garantias/action-logic";
import { BUTTON_CLASS, BUTTON_OUTLINE_CLASS, Notice } from "./ui-bits";

// Formulário genérico que chama uma Server Action (RPC/INSERT sob RLS no servidor). Nunca grava nada por conta própria.
// VERSION_CONFLICT: nada foi gravado; mostra a mensagem e oferece "Recarregar" (router.refresh) para ler a versão atual.

export function ActionForm({
  action,
  submitLabel,
  submitHelp,
  children,
  disabledReason,
  conflictHelp,
  resetOnSuccess = true,
  successMessage = "Registrado.",
  className,
}: {
  action: (raw: Record<string, string>) => Promise<ActionResult<object>>;
  submitLabel: string;
  /** (i) AO LADO do botão de envio (nunca dentro dele). */
  submitHelp?: ReactNode;
  children: ReactNode;
  /** Quando preenchido, o envio fica desabilitado e o motivo é exibido (ex.: perfil LEITURA). */
  disabledReason?: string | null;
  /** (i) AO LADO da mensagem de conflito de versão (VERSION_CONFLICT). */
  conflictHelp?: ReactNode;
  resetOnSuccess?: boolean;
  successMessage?: string;
  className?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult<object> | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabledReason) return;
    const raw = formToRecord(new FormData(event.currentTarget));
    startTransition(async () => {
      const res = await action(raw);
      setResult(res);
      if (res.ok) {
        if (resetOnSuccess) formRef.current?.reset();
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className={className ?? "space-y-3"} aria-busy={pending}>
      <fieldset disabled={!!disabledReason || pending} className="space-y-3 border-0 p-0">
        {children}
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={BUTTON_CLASS} disabled={!!disabledReason || pending}>
          {pending ? "Gravando..." : submitLabel}
        </button>
        {submitHelp}
      </div>
      {disabledReason ? <Notice tone="warning">{disabledReason}</Notice> : null}
      {result && !result.ok ? (
        <Notice tone="error" role="alert">
          <p>{result.message}</p>
          {result.code === "VERSION_CONFLICT" ? (
            <span className="mt-2 flex items-center gap-1">
              <button type="button" className={BUTTON_OUTLINE_CLASS} onClick={() => router.refresh()}>
                Recarregar versão atual
              </button>
              {conflictHelp}
            </span>
          ) : null}
        </Notice>
      ) : null}
      {result && result.ok ? <Notice tone="success" role="status">{successMessage}</Notice> : null}
    </form>
  );
}
