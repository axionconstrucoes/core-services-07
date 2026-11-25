"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { Pencil } from "lucide-react";
import type { Project } from "@axion/types";
import { updateProjectAction } from "@/app/projetos/actions";
import {
  editProjectReturnPath,
  initialUpdateProjectState,
  type EditProjectOrigin,
} from "@/app/projetos/actions-state";
import { FieldLabel } from "@/components/admin/field-label";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Caixa "Editar projeto": fundo cinza médio OPACO #A8ADB5; título, descrição, rótulos, valores, datas e Cancelar em #000000;
// campos brancos com borda visível; ícones escuros (inclusive o calendário, via color-scheme claro); Salvar em vinho com texto branco.
// O ícone de ajuda (Hover Text) também é preto sobre o cinza (~9:1), pois o padrão dele é claro para o tema escuro.
const FIELD_CLASS =
  "border-[#374151] bg-[#ffffff] text-[#000000] shadow-none placeholder:text-[#4b5563] [color-scheme:light] focus-visible:border-[#7f1d1d] focus-visible:ring-2 focus-visible:ring-[#7f1d1d]";
const ICON_ON_GRAY = "text-[#000000] hover:text-[#000000] focus-visible:text-[#000000]";

export function EditProjectForm({ project, origin }: { project: Project; origin: EditProjectOrigin }) {
  const [state, formAction, pending] = useActionState(updateProjectAction, initialUpdateProjectState);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;
  const labelClass = "text-[#000000]";

  return (
    <Card className="border-[#6b7280] bg-[#A8ADB5] text-[#000000] shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#000000]">
          <Pencil aria-hidden="true" className="size-5 text-[#000000]" />
          Editar projeto
          <FeatureInfo helpId="admin.editar.pagina" iconClassName={ICON_ON_GRAY} />
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
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("name")} helpId="admin.novo.nome">Nome do projeto no ACC</FieldLabel>
              <Input id={id("name")} className={FIELD_CLASS} name="name" maxLength={160} defaultValue={project.name} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("code")} helpId="admin.novo.codigo-uno">No. sistema UNO (nosso ERP)</FieldLabel>
              <Input id={id("code")} className={FIELD_CLASS} name="code" maxLength={40} defaultValue={project.code} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("contract")} helpId="admin.editar.contrato">Número do contrato (opcional)</FieldLabel>
              <Input id={id("contract")} className={FIELD_CLASS} name="contractNumber" maxLength={80} defaultValue={project.contractNumber ?? ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("client")} helpId="admin.novo.cliente">Cliente</FieldLabel>
              <Input id={id("client")} className={FIELD_CLASS} name="client" maxLength={120} defaultValue={project.client} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("location")} helpId="admin.novo.localizacao">Localização</FieldLabel>
              <Input id={id("location")} className={FIELD_CLASS} name="location" maxLength={160} defaultValue={project.location} placeholder="Cidade / UF" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("start")} helpId="admin.novo.data-inicio">Data de início da obra</FieldLabel>
              <Input id={id("start")} className={FIELD_CLASS} name="startDate" type="date" defaultValue={project.startDate} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel className={labelClass} iconClassName={ICON_ON_GRAY} htmlFor={id("end")} helpId="admin.novo.data-termino">Data de término da baseline</FieldLabel>
              <Input id={id("end")} className={FIELD_CLASS} name="baselineEndDate" type="date" defaultValue={project.baselineEndDate} required />
            </div>
          </div>

          {state.error ? <p role="alert" className="text-sm font-medium text-[#7f1d1d]">{state.error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={editProjectReturnPath(project.id, origin)} className={buttonVariants({ variant: "outline", className: "!border-[#000000] bg-transparent text-[#000000] hover:bg-black/10 hover:text-[#000000] focus-visible:ring-2 focus-visible:ring-[#000000]" })}>
              Cancelar
            </Link>
            <div className="flex items-center gap-1.5">
              <Button type="submit" disabled={pending} className="bg-[#7f1d1d] text-[#ffffff] hover:bg-[#681717] hover:text-[#ffffff] focus-visible:ring-2 focus-visible:ring-[#000000]">
                {pending ? "Salvando…" : "Salvar alterações"}
              </Button>
              <FeatureInfo helpId="admin.editar.salvar" iconClassName={ICON_ON_GRAY} />
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
