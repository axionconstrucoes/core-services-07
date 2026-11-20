"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { ArrowLeft, FolderPlus } from "lucide-react";
import { createProjectAction } from "@/app/projetos/actions";
import { initialCreateProjectState } from "@/app/projetos/actions-state";
import { FieldLabel } from "@/components/admin/field-label";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

// Cartão claro (bg-white/95): o texto herdado do cartão (card-foreground, branco no tema escuro) ficaria branco sobre branco,
// por isso o formulário fixa texto escuro (#0f172a, ~17:1), descrição #475569 (~7,6:1), placeholder #475569 e ícone de ajuda escuro.
const ICON_ON_LIGHT = "text-[#475569] hover:text-[#0f172a] focus-visible:text-[#0f172a]";
const FIELD_CLASS = "placeholder:text-[#475569]";

export function CreateProjectForm() {
  const [state, formAction, pending] = useActionState(createProjectAction, initialCreateProjectState);
  const uid = useId();
  const id = (name: string) => `${uid}-${name}`;

  return (
    <Card className="border-black/10 bg-white/95 text-[#0f172a] shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#0f172a]">
          <FolderPlus aria-hidden="true" className="size-5 text-[#7f1d1d]" />
          Novo projeto
          <FeatureInfo helpId="admin.novo.pagina" iconClassName={ICON_ON_LIGHT} />
        </CardTitle>
        <CardDescription className="text-[#475569]">
          Cadastre a identificação usada no ACC e as datas de referência da obra. Ao concluir, o ACC abrirá a tela Start-up.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor={id("name")} helpId="admin.novo.nome" iconClassName={ICON_ON_LIGHT}>Nome do projeto no ACC</FieldLabel>
              <Input id={id("name")} className={FIELD_CLASS} name="name" maxLength={160} placeholder="Ex.: NEWPORT — Galpão G100 Goiânia" required />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <FieldLabel htmlFor={id("code")} helpId="admin.novo.codigo-uno" iconClassName={ICON_ON_LIGHT}>No. sistema UNO (nosso ERP)</FieldLabel>
              <Input id={id("code")} className={FIELD_CLASS} name="code" maxLength={40} placeholder="Ex.: 0079" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={id("client")} helpId="admin.novo.cliente" iconClassName={ICON_ON_LIGHT}>Cliente</FieldLabel>
              <Input id={id("client")} className={FIELD_CLASS} name="client" maxLength={120} placeholder="Nome do cliente" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={id("location")} helpId="admin.novo.localizacao" iconClassName={ICON_ON_LIGHT}>Localização</FieldLabel>
              <Input id={id("location")} className={FIELD_CLASS} name="location" maxLength={160} placeholder="Cidade / UF" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={id("start")} helpId="admin.novo.data-inicio" iconClassName={ICON_ON_LIGHT}>Data de início da obra</FieldLabel>
              <Input id={id("start")} className="[color-scheme:light]" name="startDate" type="date" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel htmlFor={id("end")} helpId="admin.novo.data-termino" iconClassName={ICON_ON_LIGHT}>Data de término da baseline</FieldLabel>
              <Input id={id("end")} className="[color-scheme:light]" name="baselineEndDate" type="date" required />
            </div>
          </div>

          <div className="flex items-start gap-2 text-sm">
            <input id={id("copy")} type="checkbox" name="copyStructure" className="mt-1" />
            <label htmlFor={id("copy")}>
              Copiar equipe e perfis de acesso de outro projeto logo após criar (você revisa pessoas e perfis antes de confirmar; nenhum convite é enviado).
            </label>
            <FeatureInfo helpId="admin.novo.copiar-equipe" iconClassName={ICON_ON_LIGHT} />
          </div>

          {state.error ? <p role="alert" className="text-sm font-medium text-[#b42318]">{state.error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/projetos" className={buttonVariants({ variant: "outline" })}>
              <ArrowLeft aria-hidden="true" />
              Voltar
            </Link>
            <div className="flex items-center gap-1.5">
              <Button type="submit" disabled={pending} className="bg-[#7f1d1d] text-white hover:bg-[#681717]">
                {pending ? "Criando projeto…" : "Criar projeto"}
              </Button>
              <FeatureInfo helpId="admin.novo.criar" iconClassName={ICON_ON_LIGHT} />
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
