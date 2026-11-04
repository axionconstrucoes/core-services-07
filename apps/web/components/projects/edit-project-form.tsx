"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Pencil } from "lucide-react";
import type { Project } from "@axion/types";
import { updateProjectAction } from "@/app/projetos/actions";
import {
  editProjectReturnPath,
  initialUpdateProjectState,
  type EditProjectOrigin,
} from "@/app/projetos/actions-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Caixa "Editar projeto": fundo cinza médio OPACO #A8ADB5; título, descrição, rótulos, valores, datas e Cancelar em #000000;
// campos brancos com borda visível; ícones escuros (inclusive o calendário, via color-scheme claro); Salvar em vinho com texto branco.
const FIELD_CLASS =
  "border-[#374151] bg-[#ffffff] text-[#000000] shadow-none placeholder:text-[#4b5563] [color-scheme:light] focus-visible:border-[#7f1d1d] focus-visible:ring-2 focus-visible:ring-[#7f1d1d]";

export function EditProjectForm({ project, origin }: { project: Project; origin: EditProjectOrigin }) {
  const [state, formAction, pending] = useActionState(updateProjectAction, initialUpdateProjectState);

  return (
    <Card className="border-[#6b7280] bg-[#A8ADB5] text-[#000000] shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#000000]">
          <Pencil aria-hidden="true" className="size-5 text-[#000000]" />
          Editar projeto
        </CardTitle>
        <CardDescription className="text-[#000000]">
          Altera somente os dados cadastrais. Documentos, eventos, integrações, usuários e o Start-up do projeto são preservados.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="origin" value={origin} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000] sm:col-span-2">
              Nome do projeto no ACC
              <Input className={FIELD_CLASS} name="name" maxLength={160} defaultValue={project.name} required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000]">
              No. sistema UNO (nosso ERP)
              <Input className={FIELD_CLASS} name="code" maxLength={40} defaultValue={project.code} required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000]">
              Número do contrato (opcional)
              <Input className={FIELD_CLASS} name="contractNumber" maxLength={80} defaultValue={project.contractNumber ?? ""} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000]">
              Cliente
              <Input className={FIELD_CLASS} name="client" maxLength={120} defaultValue={project.client} required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000]">
              Localização
              <Input className={FIELD_CLASS} name="location" maxLength={160} defaultValue={project.location} placeholder="Cidade / UF" required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000]">
              Data de início da obra
              <Input className={FIELD_CLASS} name="startDate" type="date" defaultValue={project.startDate} required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#000000]">
              Data de término da baseline
              <Input className={FIELD_CLASS} name="baselineEndDate" type="date" defaultValue={project.baselineEndDate} required />
            </label>
          </div>

          {state.error ? <p role="alert" className="text-sm font-medium text-[#7f1d1d]">{state.error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={editProjectReturnPath(project.id, origin)} className={buttonVariants({ variant: "outline", className: "!border-[#000000] bg-transparent text-[#000000] hover:bg-black/10 hover:text-[#000000] focus-visible:ring-2 focus-visible:ring-[#000000]" })}>
              Cancelar
            </Link>
            <Button type="submit" disabled={pending} className="bg-[#7f1d1d] text-[#ffffff] hover:bg-[#681717] hover:text-[#ffffff] focus-visible:ring-2 focus-visible:ring-[#000000]">
              {pending ? "Salvando…" : "Salvar alterações"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
