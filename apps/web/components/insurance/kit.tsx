"use client";

import { createContext, useContext, useId, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HelpHint } from "@/components/shared/help-hint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SELECT_CLASS } from "@/components/ui/select";
import { runInsuranceAction } from "@/app/[projectId]/seguros/actions";
import type { InsuranceActionResult } from "@/lib/insurance-ui/action-types";
import { buildForm, validateForm, type FieldSpec, type FormErrors, type FormSpec, type FormValues, type OptionsKey } from "@/lib/insurance-ui/forms";
import { NO_DATA } from "@/lib/insurance-ui/format";
import { levelRequirementText, type InsuranceCapabilities, type InsuranceLevel } from "@/lib/insurance-ui/permissions";
import type { InsuranceActionInput } from "@/lib/insurance-ui/rpc-ops";
import type { InsuranceWorkspaceData } from "@/lib/insurance-ui/types";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------- contexto ----------------------------------------------------------------- */

export interface WorkspaceCtx {
  projectId: string;
  data: InsuranceWorkspaceData;
  caps: InsuranceCapabilities;
  /** Usuário autenticado (só para a interface bloquear ações que o banco recusaria; a autoridade é o banco). */
  currentUserId: string | null;
  /** "hoje" (yyyy-mm-dd) e instante calculados no servidor: evita divergência de hidratação. */
  today: string;
  nowIso: string;
  /** Navega para outra aba (com um alvo opcional). */
  goTo: (tab: string, target?: { policyId?: string; claimId?: string; endorsementId?: string }) => void;
  target: { policyId?: string; claimId?: string; endorsementId?: string };
}

const Ctx = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = Ctx.Provider;
export function useWorkspace(): WorkspaceCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorkspace fora do WorkspaceProvider");
  return v;
}

/* ----------------------------------------------------------------- ações ----------------------------------------------------------------- */

export function useInsuranceRunner() {
  const { projectId } = useWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = (input: Omit<InsuranceActionInput, "projectId">, okMessage: string): Promise<InsuranceActionResult> =>
    new Promise((resolve) => {
      setError(null);
      setNotice(null);
      startTransition(async () => {
        const res = await runInsuranceAction({ ...input, projectId });
        if (res.ok) {
          setNotice(okMessage);
          router.refresh();
        } else {
          setError({ message: res.error.message, conflict: res.error.conflict });
        }
        resolve(res);
      });
    });
  const reload = () => {
    setError(null);
    router.refresh();
  };
  return { run, pending, error, notice, reload, clear: () => { setError(null); setNotice(null); } };
}

export type Runner = ReturnType<typeof useInsuranceRunner>;

/* ------------------------------------------------------------- blocos visuais ------------------------------------------------------------- */

export function Section({ title, helpId, actions, children, id }: { title: string; helpId?: string; actions?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="rounded-lg border border-border bg-card p-4 text-card-foreground">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1 text-base font-semibold">
          {title}
          {helpId ? <HelpHint helpId={helpId} /> : null}
        </h2>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

const TONE: Record<string, string> = {
  info: "border-l-ring",
  warn: "border-l-amber-500",
  danger: "border-l-destructive",
  ok: "border-l-emerald-500",
};

export function Callout({ tone = "info", children, role }: { tone?: "info" | "warn" | "danger" | "ok"; children: ReactNode; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cn("rounded-md border border-border border-l-4 bg-muted p-3 text-sm text-foreground", TONE[tone])}>
      {children}
    </div>
  );
}

export function StatusBadge({ text, variant = "outline", helpId }: { text: string; variant?: "outline" | "success" | "warning" | "info" | "destructive" | "secondary"; helpId?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Badge variant={variant}>{text}</Badge>
      {helpId ? <HelpHint helpId={helpId} /> : null}
    </span>
  );
}

export function NoData({ text = NO_DATA }: { text?: string }) {
  return <span className="font-medium text-muted-foreground">{text}</span>;
}

export function SourceLink({ documentId, sourceRef }: { documentId?: string | null; sourceRef?: string | null }) {
  const { data, projectId } = useWorkspace();
  const doc = documentId ? data.documents.find((d) => d.id === documentId) : undefined;
  if (!documentId && !sourceRef) return <NoData text="SEM FONTE" />;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 text-sm">
      {documentId ? (
        doc?.latestVersionId ? (
          <Link className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground" href={`/${projectId}/documentos/versoes/${doc.latestVersionId}`}>
            {doc.title}
          </Link>
        ) : (
          <span>{doc ? doc.title : `documento ${documentId.slice(0, 8)}`}</span>
        )
      ) : null}
      {sourceRef ? <span className="text-muted-foreground">{documentId ? "· " : ""}{sourceRef}</span> : null}
    </span>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  /** helpId literal quando a coluna tem explicação própria (ícone ao lado do rótulo). */
  helpId?: string;
  render: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({ columns, rows, empty, selectedId, onSelect, caption }: { columns: Column<T>[]; rows: T[]; empty: string; selectedId?: string | null; onSelect?: (row: T) => void; caption: string }) {
  if (!rows.length) return <p className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="w-full overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-border bg-muted">
          <tr>
            {columns.map((c) => (
              // help-exempt: coluna gerada da lista `columns`; o inventário do manifesto descreve cada coluna via helpId da tabela (dados) ou helpId próprio da coluna
              <th key={c.key} scope="col" className="px-3 py-2 text-left font-medium text-foreground">
                <span className="inline-flex items-center gap-0.5">
                  {c.label}
                  {c.helpId ? <HelpHint helpId={c.helpId} /> : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} aria-selected={selectedId === r.id} className={cn("border-b border-border last:border-0 align-top", selectedId === r.id && "bg-accent")}>
              {columns.map((c, i) => (
                <td key={c.key} className="px-3 py-2">
                  {onSelect && i === 0 ? (
                    // help-exempt: seletor de linha cujo texto é o dado da primeira coluna; a seleção é descrita no helpId da tabela renderizado acima
                    <button type="button" onClick={() => onSelect(r)} className="min-h-11 text-left underline underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      {c.render(r)}
                    </button>
                  ) : (
                    c.render(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------- botão ------------------------------------------------------------------- */

/** Botão de ação com o ícone de ajuda AO LADO (nunca dentro). `level`: nível exigido; sem permissão fica desabilitado com explicação. */
export function ActionButton({ label, helpId, level, onClick, pending, variant = "default", extraDisabled, extraReason }: { label: string; helpId: string; level?: InsuranceLevel; onClick: () => void; pending?: boolean; variant?: "default" | "outline" | "secondary"; extraDisabled?: boolean; extraReason?: string }) {
  const { caps } = useWorkspace();
  const allowed = !level || (level === "READ" ? caps.read : level === "REGISTER" ? caps.register : level === "MANAGE" ? caps.manage : caps.admin);
  const disabled = !allowed || Boolean(pending) || Boolean(extraDisabled);
  const reasonId = useId();
  const reason = !allowed && level ? `Requer perfil: ${levelRequirementText(level)}.` : extraDisabled ? extraReason : undefined;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {/* help-exempt: botão genérico; o chamador passa o helpId literal e o ícone de ajuda é renderizado logo ao lado */}
      <Button type="button" variant={variant} size="sm" className="min-h-11 px-4 disabled:border disabled:border-dashed disabled:border-input disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" disabled={disabled} aria-describedby={reason ? reasonId : undefined} onClick={onClick}>
        {pending ? "Aguarde…" : label}
      </Button>
      <HelpHint helpId={helpId} />
      {reason ? (
        <span id={reasonId} className="text-xs text-muted-foreground">
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/* ---------------------------------------------------------------- formulários ---------------------------------------------------------------- */

type OptionSets = Partial<Record<OptionsKey, Array<{ value: string; label: string }>>>;

const INPUT_CLASS =
  "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-destructive disabled:cursor-not-allowed disabled:border-dashed disabled:bg-muted disabled:text-muted-foreground";

function FieldControl({ f, value, onChange, options, id, invalid, describedBy, disabled }: { f: FieldSpec; value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string }>; id: string; invalid: boolean; describedBy?: string; disabled: boolean }) {
  const common = { id, disabled, "aria-invalid": invalid || undefined, "aria-describedby": describedBy } as const;
  switch (f.type) {
    case "textarea":
    case "lines":
      // help-exempt: campo gerado da especificação do formulário (FORMS); o helpId literal do campo está na especificação e o ícone é renderizado ao lado do rótulo
      return <textarea {...common} className={cn(INPUT_CLASS, "min-h-24 py-2")} value={value} onChange={(e) => onChange(e.target.value)} />;
    case "select":
    case "document":
    case "tristate": {
      const opts =
        f.type === "tristate"
          ? [{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]
          : f.type === "document" || f.optionsKey
            ? options
            : (f.options ?? []);
      const empty = f.type === "tristate" ? "SEM DADOS (não informado)" : f.required ? "Selecione…" : "Nenhum";
      return (
        // help-exempt: seletor gerado da especificação do formulário (FORMS); helpId literal do campo na especificação, ícone ao lado do rótulo
        <select {...common} className={cn(SELECT_CLASS, "min-h-11 w-full")} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{empty}</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case "checkbox":
      // help-exempt: caixa gerada da especificação do formulário (FORMS); helpId literal na especificação, ícone ao lado do rótulo
      return <input {...common} type="checkbox" className="size-6 accent-current" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "")} />;
    case "multi": {
      const selected = new Set(value.split(",").map((s) => s.trim()).filter(Boolean));
      return (
        <div role="group" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {(f.options ?? []).map((o) => (
            <label key={o.value} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-border px-2 text-sm">
              {/* help-exempt: opção do grupo gerada da especificação; o grupo tem o helpId do campo ao lado do rótulo */}
              <input
                type="checkbox"
                className="size-5 accent-current"
                checked={selected.has(o.value)}
                disabled={disabled}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(o.value);
                  else next.delete(o.value);
                  onChange([...next].join(","));
                }}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    default:
      // help-exempt: campo gerado da especificação do formulário (FORMS); o helpId literal do campo está na especificação e o ícone é renderizado ao lado do rótulo
      return <input {...common} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "money" ? "decimal" : f.type === "int" ? "numeric" : undefined} className={INPUT_CLASS} value={value} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} />;
  }
}

export interface SpecFormProps {
  spec: FormSpec;
  options?: OptionSets;
  /** Valores iniciais (atualizações e pré-preenchimentos). */
  initial?: FormValues;
  level: InsuranceLevel;
  /** Validação extra dependente de mais de um campo. */
  extraValidate?: (values: FormValues) => FormErrors;
  /** Monta a chamada: recebe data/args já convertidos. */
  toInput: (built: { data: Record<string, unknown>; args: Record<string, unknown> }, values: FormValues) => Omit<InsuranceActionInput, "projectId">;
  okMessage: string;
  onDone?: () => void;
  onCancel?: () => void;
  /** Campos a ocultar (ex.: sem rascunho) */
  hideFields?: string[];
  children?: ReactNode;
}

export function SpecForm({ spec, options = {}, initial = {}, level, extraValidate, toInput, okMessage, onDone, onCancel, hideFields = [], children }: SpecFormProps) {
  const base = useId();
  const { caps } = useWorkspace();
  const runner = useInsuranceRunner();
  const defaults = Object.fromEntries(spec.fields.map((f) => [f.name, initial[f.name] ?? f.defaultValue ?? ""]));
  const [values, setValues] = useState<FormValues>(defaults);
  const [errors, setErrors] = useState<FormErrors>({});
  const allowed = level === "READ" ? caps.read : level === "REGISTER" ? caps.register : level === "MANAGE" ? caps.manage : caps.admin;

  const submit = async () => {
    const local = { ...validateForm(spec, values, initial), ...(extraValidate ? extraValidate(values) : {}) };
    setErrors(local);
    if (Object.keys(local).length) return;
    const res = await runner.run(toInput(buildForm(spec, values, initial), values), okMessage);
    if (res.ok) {
      setValues(defaults);
      onDone?.();
    }
  };

  return (
    // help-exempt: formulário gerado da especificação FORMS; o título renderiza o helpId do formulário e cada campo/ação tem helpId literal na especificação
    <form
      className="flex flex-col gap-3 rounded-md border border-border bg-muted p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <h3 className="flex items-center gap-1 text-sm font-semibold">
        {spec.title}
        <HelpHint helpId={spec.helpId} />
      </h3>
      {!allowed ? <Callout tone="warn">Seu perfil não permite esta ação. Requer: {levelRequirementText(level)}. O banco de dados também recusaria o pedido.</Callout> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {spec.fields
          .filter((f) => !hideFields.includes(f.name))
          .map((f) => {
            const id = `${base}-${f.name}`;
            const err = errors[f.name];
            const wide = f.type === "textarea" || f.type === "lines" || f.type === "multi";
            return (
              <div key={f.name} className={cn("flex flex-col gap-1", wide && "sm:col-span-2")}>
                <div className="flex items-center gap-1">
                  <label id={`${id}-label`} htmlFor={id} className="text-sm font-medium">
                    {f.label}
                    {f.required ? <span aria-hidden="true"> *</span> : null}
                  </label>
                  <HelpHint helpId={f.helpId} />
                </div>
                <FieldControl f={f} value={values[f.name] ?? ""} onChange={(v) => setValues((s) => ({ ...s, [f.name]: v }))} options={optionsFor(f, options)} id={id} invalid={Boolean(err)} describedBy={err ? `${id}-err` : undefined} disabled={!allowed || runner.pending} />
                {err ? (
                  <p id={`${id}-err`} role="alert" className="text-sm text-destructive">
                    {err}
                  </p>
                ) : null}
              </div>
            );
          })}
      </div>
      {children}
      {errors._form ? <p role="alert" className="text-sm text-destructive">{errors._form}</p> : null}
      {errors.source_ref && !spec.fields.some((f) => f.name === "source_ref" && !hideFields.includes(f.name)) ? <p role="alert" className="text-sm text-destructive">{errors.source_ref}</p> : null}
      <RunnerFeedback runner={runner} />
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton label={spec.submitLabel} helpId={spec.submitHelpId} level={level} pending={runner.pending} onClick={() => void submit()} />
        {onCancel ? (
          <Button type="button" variant="outline" size="sm" className="min-h-11 px-4" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function optionsFor(f: FieldSpec, sets: OptionSets) {
  return f.optionsKey ? sets[f.optionsKey] ?? [] : f.options ?? [];
}

export function RunnerFeedback({ runner }: { runner: Runner }) {
  return (
    <>
      {runner.error ? (
        <Callout tone="danger" role="alert">
          <p>{runner.error.message}</p>
          {runner.error.conflict ? (
            <p className="mt-2 flex flex-wrap items-center gap-1">
              <ActionButton label="Recarregar dados" helpId="seguros.acoes.recarregar" variant="outline" onClick={runner.reload} />
            </p>
          ) : null}
        </Callout>
      ) : null}
      {runner.notice ? (
        <Callout tone="ok" role="status">
          {runner.notice}
        </Callout>
      ) : null}
    </>
  );
}

/** Opções comuns a partir dos dados carregados (documentos, apólices...). */
export function buildOptionSets(data: InsuranceWorkspaceData): OptionSets {
  return {
    documents: data.documents.map((d) => ({ value: d.id, label: `${d.title} (${d.kind})` })),
    policies: data.policies.map((p) => ({ value: p.id, label: `${p.policy_number ?? "nº SEM DADOS"} — ${p.insurer_name} — ${p.modality}` })),
    bankGuarantees: data.bankGuarantees.map((g) => ({ value: g.id, label: `${g.bank_name} ${g.guarantee_number ?? ""}`.trim() })),
    advances: data.advances.map((a) => ({ value: a.id, label: a.purpose })),
    policyClauses: data.clauses.map((c) => ({ value: c.id, label: `${c.kind}: ${c.title}` })),
    instruments: [
      ...data.policies.map((p) => ({ value: `policy:${p.id}`, label: `Apólice — ${p.policy_number ?? "nº SEM DADOS"} (${p.insurer_name})` })),
      ...data.bankGuarantees.map((g) => ({ value: `bank:${g.id}`, label: `Fiança bancária — ${g.bank_name} ${g.guarantee_number ?? ""}`.trim() })),
      ...data.otherGuarantees.map((g) => ({ value: `other:${g.id}`, label: `${g.guarantee_type} — ${g.issuer_name ?? "emissor SEM DADOS"}` })),
      { value: "none", label: "SEM INSTRUMENTO (apólice/garantia ausente — justifique)" },
    ],
    officialChannels: data.channels.map((c) => ({ value: c.id, label: `${c.entity_name} — ${c.channel_type}` })),
  };
}
