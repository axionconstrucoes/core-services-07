"use client";

import { useActionState } from "react";
import { linkClientResponseAction } from "@/app/[projectId]/documentos/link-client-response-actions";
import { initialLinkClientResponseState } from "@/app/[projectId]/documentos/link-client-response-actions-state";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateBR } from "@/lib/labels";

// Vínculo manual auditável entre uma versão documental e um e-mail já
// ingerido no projeto. O usuário escolhe pelo contexto humano (data,
// remetente e assunto); o UUID interno continua sendo enviado ao servidor
// como valor técnico do select, sem ser exposto na interface.
export type ProjectEmailOption = {
  id: string;
  fromAddress: string;
  subject: string;
  sentAt: string;
};

function formatEmailOption(option: ProjectEmailOption): string {
  const date = formatDateBR(option.sentAt);
  return `${date} · ${option.fromAddress} · ${option.subject}`;
}

export function LinkClientResponseControl({
  projectId,
  documentVersionId,
  emailOptions,
}: {
  projectId: string;
  documentVersionId: string;
  emailOptions: ProjectEmailOption[];
}) {
  const [state, formAction, pending] = useActionState(linkClientResponseAction, initialLinkClientResponseState);

  return (
    <details className="mt-1.5 rounded-md border p-2">
      <summary className="cursor-pointer text-xs font-medium">Vincular resposta do cliente</summary>
      <form action={formAction} className="mt-2 flex flex-col gap-1.5">
        <input type="hidden" name="projectId" value={projectId} />
        <input type="hidden" name="documentVersionId" value={documentVersionId} />

        <label className="flex flex-col gap-1 text-xs">
          <span className="flex items-center gap-1">
            E-mail relacionado
            <FeatureInfo helpId="juridico.documentos.resposta-cliente-campos" />
          </span>
          <Select name="emailId" required defaultValue="">
            <option value="" disabled>
              Selecione o e-mail
            </option>
            {emailOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {formatEmailOption(option)}
              </option>
            ))}
          </Select>
          {emailOptions.length === 0 ? (
            <span className="text-muted-foreground">Nenhum e-mail registrado neste projeto.</span>
          ) : null}
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="flex items-center gap-1">
            Relação
            <FeatureInfo helpId="juridico.documentos.resposta-cliente-campos" />
          </span>
          <Select name="relationType" required defaultValue="RESPONDE">
            <option value="RESPONDE">Responde</option>
            <option value="DISCORDA">Discorda</option>
            <option value="CORRIGE">Corrige</option>
            <option value="RESSALVA">Ressalva</option>
            <option value="COMPLEMENTA">Complementa</option>
          </Select>
        </label>

        <label className="flex flex-col gap-1 text-xs">
          <span className="flex items-center gap-1">
            Trecho relevante (opcional)
            <FeatureInfo helpId="juridico.documentos.resposta-cliente-campos" />
          </span>
          <Textarea name="excerpt" rows={2} />
        </label>

        {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
        {state.success ? <p className="text-xs text-emerald-600">Vínculo registrado.</p> : null}

        <span className="inline-flex items-center gap-1 self-start">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Vinculando…" : "Vincular"}
          </Button>
          <FeatureInfo helpId="juridico.documentos.respostas-cliente" />
        </span>
      </form>
    </details>
  );
}
