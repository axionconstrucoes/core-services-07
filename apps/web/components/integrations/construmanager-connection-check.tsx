"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import {
  initialValidateConstrumanagerConnectionState,
} from "@/app/[projectId]/integracoes/actions-state";
import {
  validateConstrumanagerConnectionAction,
} from "@/app/[projectId]/integracoes/actions";
import { formatDateTime } from "@/lib/labels";

export function ConstrumanagerConnectionCheck({
  projectId,
  lastConnectionCheckAt,
  lastConnectionError,
}: {
  projectId: string;
  lastConnectionCheckAt?: string | null;
  lastConnectionError?: string | null;
}) {
  const router = useRouter();

  const [state, formAction, pending] = useActionState(
    validateConstrumanagerConnectionAction,
    initialValidateConstrumanagerConnectionState
  );

  useEffect(() => {
    if (state.checkedAt) {
      router.refresh();
    }
  }, [router, state.checkedAt]);

  const displayedCheckAt =
    state.checkedAt ?? lastConnectionCheckAt ?? null;

  const displayedError =
    state.success ? null : state.error ?? lastConnectionError ?? null;

  return (
    <div className="flex flex-col gap-1.5 rounded-md border bg-background/60 p-2">
      <form action={formAction}>
        <input type="hidden" name="projectId" value={projectId} />

        {/* help-exempt: botão que dispara a verificação; descrito em integracoes.integracoes.construmanager-validar (ícone logo abaixo) */}
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          {pending ? "Validando…" : "Validar conexão"}
        </Button>
      </form>

      <p className="flex items-center gap-1.5 text-xs">
        <FeatureInfo helpId="integracoes.integracoes.construmanager-validar" />
        {displayedCheckAt
          ? `Última validação: ${formatDateTime(displayedCheckAt)}`
          : "Conexão ainda não validada."}
      </p>

      {state.success ? (
        <p className="text-xs text-foreground">
          Conexão validada com sucesso.
        </p>
      ) : null}

      {displayedError ? (
        <p className="text-xs text-destructive">
          {displayedError}
        </p>
      ) : null}
    </div>
  );
}
