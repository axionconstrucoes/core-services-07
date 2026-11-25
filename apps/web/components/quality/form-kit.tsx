"use client";

import { Children, cloneElement, isValidElement, useActionState, useId, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FeatureInfo } from "@/components/shared/feature-info";
import { initialQualityActionState, type QualityActionState } from "@/lib/quality/ui-action-state";
import { cn } from "@/lib/utils";

// Kit de formulários da Qualidade: contraste por tokens semânticos, alvos de toque >= 44 px em toque/estreito, mensagens em região viva.
// O ícone (i) de cada campo fica AO LADO do rótulo (nunca dentro de botão, link ou rótulo); o helpId é passado a cada QField no ponto de uso.

/** Alvo de toque mínimo de 44 px em toque/telas estreitas (controles de formulário e botões). */
export const TOUCH = "max-md:min-h-11 pointer-coarse:min-h-11";

type QualityAction = (prev: QualityActionState, formData: FormData) => Promise<QualityActionState>;

export function useQualityAction(action: QualityAction) {
  return useActionState(action, initialQualityActionState);
}

export function QField({
  label,
  helpId,
  children,
  hint,
  className,
}: {
  label: string;
  helpId: string;
  children: ReactNode;
  hint?: string;
  className?: string;
}) {
  const id = useId();
  const only = Children.count(children) === 1 ? Children.toArray(children)[0] : null;
  const control = isValidElement(only) ? cloneElement(only as ReactElement<{ id?: string; "aria-describedby"?: string }>, { id, ...(hint ? { "aria-describedby": `${id}-hint` } : {}) }) : children;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center gap-1 text-sm font-medium text-foreground">
        <label htmlFor={id}>{label}</label>
        <FeatureInfo helpId={helpId} />
      </div>
      {control}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Mensagem de resultado da ação (sucesso/erro/conflito), em região viva para leitores de tela. */
export function ActionMessage({ state }: { state: QualityActionState }) {
  if (state.error) {
    return (
      <div role="alert" className="rounded-md border border-destructive p-2 text-sm text-destructive">
        <p>{state.error}</p>
        {state.conflict ? (
          // help-exempt: link de recarga da própria mensagem de conflito; o significado está documentado em qualidade.rnc.conflito-versao
          <a href="" className={cn("mt-1 inline-flex items-center font-medium underline", TOUCH)}>
            Recarregar a página
          </a>
        ) : null}
      </div>
    );
  }
  if (state.message) {
    return (
      <p role="status" className="rounded-md border border-border bg-muted p-2 text-sm text-foreground">
        {state.message}
      </p>
    );
  }
  return <p role="status" className="sr-only" />;
}

/** Formulário padrão: projectId oculto, remonta (limpa) após sucesso e desabilita o envio enquanto pende. */
export function QForm({
  state,
  formAction,
  pending,
  projectId,
  submitLabel,
  children,
  className,
  disabled,
  disabledReason,
}: {
  state: QualityActionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  projectId: string;
  submitLabel: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    // help-exempt: contêiner genérico de formulário; cada formulário que o usa traz o ícone (i) do formulário e de cada campo
    <form key={state.nonce ?? "novo"} action={formAction} className={cn("flex flex-col gap-3", className)}>
      <input type="hidden" name="projectId" value={projectId} />
      {children}
      <div className="flex flex-wrap items-center gap-2">
        {/* help-exempt: botão de envio genérico; a ação é descrita pelo ícone (i) do título do formulário que o usa */}
        <Button type="submit" disabled={pending || disabled} className={TOUCH}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
        {disabled && disabledReason ? <span className="text-xs text-muted-foreground">{disabledReason}</span> : null}
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
