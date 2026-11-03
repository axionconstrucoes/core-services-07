"use client";

import { useActionState } from "react";

import { setMemberWhatsappContactAction } from "@/app/[projectId]/usuarios/actions";
import { initialSetMemberWhatsappContactState } from "@/app/[projectId]/usuarios/actions-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Telefone internacional + autorização do canal WhatsApp (simulado; só alertas CRÍTICOS que chegam à Diretoria).
// O contato é da PESSOA (vale para todos os projetos em que ela tem vínculo); o vínculo só decide a elegibilidade no envio.
// Alterar o número exige reafirmar a autorização: o banco não a herda.
export function MemberWhatsappForm({
  projectId,
  userId,
  currentPhone,
  currentAuthorized,
}: {
  projectId: string;
  userId: string;
  currentPhone: string | null;
  currentAuthorized: boolean;
}) {
  const [state, action, pending] = useActionState(setMemberWhatsappContactAction, initialSetMemberWhatsappContactState);
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="userId" value={userId} />
      <Input
        name="phone"
        defaultValue={currentPhone ?? ""}
        placeholder="+5527999990000"
        inputMode="tel"
        aria-label="Telefone internacional da pessoa (WhatsApp)" title="Cadastro da pessoa: vale em todos os projetos em que ela tem vínculo"
        className="h-7 w-40 text-xs"
      />
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        <input type="checkbox" name="channelAuthorized" defaultChecked={currentAuthorized} />
        Canal autorizado pelo participante
      </label>
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending}>
          {pending ? "…" : "Salvar"}
        </Button>
        {state.success ? <span className="text-xs text-muted-foreground">Salvo</span> : null}
      </div>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
    </form>
  );
}
