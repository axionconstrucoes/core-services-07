"use client";

import { FeatureInfo } from "@/components/shared/feature-info";
import { CAUSE_CATEGORY_LABELS, ORIGIN_LABELS } from "@/lib/garantias/labels";
import type { WarrantyCaseView } from "@/lib/garantias/types";
import { FieldLabel, FIELD_CLASS } from "./ui-bits";
import { SELECT_CLASS } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface MemberOption {
  userId: string;
  name: string;
}

const money = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

/** Campos do caso de garantia, compartilhados entre a criação (mode="create") e a edição (mode="edit"). */
export function CaseFields({ idPrefix, mode, defaults, members }: { idPrefix: string; mode: "create" | "edit"; defaults?: WarrantyCaseView; members: MemberOption[] }) {
  const id = (n: string) => `${idPrefix}-${n}`;
  const d = defaults;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1">
        <FieldLabel htmlFor={id("servico")} label="Serviço / sistema" helpId="garantias.caso.servico" required />
        <input id={id("servico")} name="serviceSystem" required minLength={2} maxLength={200} defaultValue={d?.serviceSystem ?? ""} disabled={mode === "edit"} className={FIELD_CLASS} placeholder="Ex.: pintura externa, impermeabilização da laje, máquina X" />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("contrato")} label="Obra / contrato (referência)" helpId="garantias.caso.contrato" />
        <input id={id("contrato")} name="contractRef" defaultValue={d?.contractRef ?? ""} className={FIELD_CLASS} placeholder="Número ou referência do contrato" />
      </div>
      <div className="space-y-1 md:col-span-2">
        <FieldLabel htmlFor={id("defeito")} label="Defeito" helpId="garantias.caso.defeito" required />
        <textarea id={id("defeito")} name="defectDescription" required minLength={3} maxLength={4000} defaultValue={d?.defectDescription ?? ""} className={cn(FIELD_CLASS, "min-h-24")} placeholder="Descreva o defeito como foi constatado" />
      </div>
      <div className="space-y-1 md:col-span-2">
        <FieldLabel htmlFor={id("reclamacao")} label="Reclamação do cliente" helpId="garantias.caso.reclamacao" />
        <textarea id={id("reclamacao")} name="customerComplaint" defaultValue={d?.customerComplaint ?? ""} className={cn(FIELD_CLASS, "min-h-20")} placeholder="Texto da reclamação, se houver (a fonte vai em Origem)" />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("entrega")} label="Data de entrega" helpId="garantias.caso.data-entrega" />
        <input id={id("entrega")} name="deliveredAt" type="date" defaultValue={d?.deliveredAt ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("descoberta")} label="Data de descoberta" helpId="garantias.caso.data-descoberta" />
        <input id={id("descoberta")} name="discoveredAt" type="date" defaultValue={d?.discoveredAt ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("comunicacao")} label="Data da comunicação" helpId="garantias.caso.data-comunicacao" />
        <input id={id("comunicacao")} name="communicatedAt" type="date" defaultValue={d?.communicatedAt ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("prazo")} label="Prazo para resolver" helpId="garantias.caso.prazo" />
        <input id={id("prazo")} name="dueDate" type="date" defaultValue={d?.dueDate ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1 md:col-span-2">
        <FieldLabel htmlFor={id("termos")} label="Termos de garantia" helpId="garantias.caso.termos-garantia" />
        <textarea id={id("termos")} name="warrantyTerms" defaultValue={d?.warrantyTerms ?? ""} className={cn(FIELD_CLASS, "min-h-20")} placeholder="Texto/resumo do termo (o documento é a fonte)" />
      </div>
      <div className="space-y-1 md:col-span-2">
        <FieldLabel htmlFor={id("termos-ref")} label="Documento dos termos (referência)" helpId="garantias.caso.termos-ref" />
        <input id={id("termos-ref")} name="warrantyTermsRef" defaultValue={d?.warrantyTermsRef ?? ""} className={FIELD_CLASS} placeholder="Documento, cláusula ou link do termo de garantia" />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("fornecedor")} label="Fornecedor" helpId="garantias.caso.fornecedor" />
        <input id={id("fornecedor")} name="supplierName" defaultValue={d?.supplierName ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("garantia-fornecedor")} label="Garantia do fornecedor até" helpId="garantias.caso.garantia-fornecedor" />
        <input id={id("garantia-fornecedor")} name="supplierWarrantyUntil" type="date" defaultValue={d?.supplierWarrantyUntil ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("garantia-construtora")} label="Garantia da construtora até" helpId="garantias.caso.garantia-construtora" />
        <input id={id("garantia-construtora")} name="builderWarrantyUntil" type="date" defaultValue={d?.builderWarrantyUntil ?? ""} className={FIELD_CLASS} />
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={id("custo-estimado")} label="Custo estimado (R$)" helpId="garantias.caso.custo-estimado" />
        <input id={id("custo-estimado")} name="estimatedCost" inputMode="decimal" defaultValue={money(d?.estimatedCost)} className={FIELD_CLASS} placeholder="Vazio = SEM DADOS" />
      </div>
      {mode === "edit" ? (
        <div className="space-y-1">
          <FieldLabel htmlFor={id("custo-realizado")} label="Custo realizado (R$)" helpId="garantias.caso.custo-realizado" />
          <input id={id("custo-realizado")} name="actualCost" inputMode="decimal" defaultValue={money(d?.actualCost)} className={FIELD_CLASS} placeholder="Vazio = SEM DADOS" />
        </div>
      ) : null}
      <div className="space-y-1">
        <FieldLabel htmlFor={id("causa")} label="Causa (em investigação)" helpId="garantias.caso.causa" />
        <select id={id("causa")} name="causeCategory" defaultValue={d?.causeCategory ?? "A_DEFINIR"} className={cn(SELECT_CLASS, "min-h-11 w-full")}>
          {Object.entries(CAUSE_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {mode === "edit" ? (
        <div className="space-y-1">
          <FieldLabel htmlFor={id("causa-notas")} label="Notas da causa" helpId="garantias.caso.causa-notas" />
          <input id={id("causa-notas")} name="causeNotes" defaultValue={d?.causeNotes ?? ""} className={FIELD_CLASS} />
        </div>
      ) : null}
      <div className="space-y-1">
        <FieldLabel htmlFor={id("responsavel")} label="Responsável" helpId="garantias.caso.responsavel" />
        <select id={id("responsavel")} name="responsibleUserId" defaultValue={d?.responsibleUserId ?? ""} className={cn(SELECT_CLASS, "min-h-11 w-full")}>
          <option value="">Sem responsável (SEM DADOS)</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {mode === "create" ? (
        <>
          <div className="space-y-1">
            <FieldLabel htmlFor={id("origem")} label="Origem" helpId="garantias.caso.origem" />
            <select id={id("origem")} name="originType" defaultValue="MANUAL" className={cn(SELECT_CLASS, "min-h-11 w-full")}>
              {Object.entries(ORIGIN_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <FieldLabel htmlFor={id("origem-ref")} label="Referência da origem" helpId="garantias.caso.origem-ref" />
            <input id={id("origem-ref")} name="originRef" className={FIELD_CLASS} placeholder="Message-ID do e-mail, documento, página do diário..." />
          </div>
        </>
      ) : null}
      <div className="flex min-h-11 items-center gap-2 md:col-span-1">
        <input id={id("vicio-oculto")} name="hiddenDefect" type="checkbox" defaultChecked={d?.hiddenDefect ?? false} className="size-5 accent-[var(--primary)]" />
        <label htmlFor={id("vicio-oculto")} className="text-sm text-foreground">Há indício de vício oculto</label>
        <FeatureInfo helpId="garantias.caso.vicio-oculto" />
      </div>
      <div className="flex min-h-11 items-center gap-2 md:col-span-1">
        <input id={id("solidez")} name="solidityAndSafety" type="checkbox" defaultChecked={d?.solidityAndSafety ?? false} className="size-5 accent-[var(--primary)]" />
        <label htmlFor={id("solidez")} className="text-sm text-foreground">Envolve solidez e segurança</label>
        <FeatureInfo helpId="garantias.caso.solidez-seguranca" />
      </div>
    </div>
  );
}
