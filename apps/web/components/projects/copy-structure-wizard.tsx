"use client";

// Assistente "Copiar estrutura de outro projeto" (Administrador). Cinco etapas:
// 1 Origem → 2 Pessoas (seleção em lote) → 3 Perfis no destino → 4 Prévia → 5 Confirmar e executar.
// A categoria vem do registro categories.ts (hoje só "Equipe e perfis de acesso"). Nenhum convite/e-mail é enviado.
// Toda decisão é revalidada no servidor (autorização na origem e no destino, prévia recalculada, assinatura da seleção).

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import {
  executeTeamCopyAction,
  loadTeamCandidatesAction,
  previewTeamCopyAction,
} from "@/app/projetos/[projectId]/copiar-estrutura/actions";
import type { CopyItemStatus, CopyRpcResult, PreviewData, ProjectOption } from "@/lib/projects/copy-structure/service";
import type { StructureCategory } from "@/lib/projects/copy-structure/categories";
import {
  BLOCK_LABELS,
  EXCLUSION_LABELS,
  TEAM_AREAS,
  TEAM_PERMISSIONS,
  type CandidateRow,
  type PreviewItem,
  type TeamPermission,
  type TeamSelection,
} from "@/lib/projects/copy-structure/team-plan";
import { membershipAreaLabels, permissionLabels } from "@/lib/labels";
import type { MembershipArea, ProjectPermission } from "@axion/types";

interface RowState {
  selected: boolean;
  permission: TeamPermission;
  area: string;
  explicitAdmin: boolean;
  includeExcluded: boolean;
}

const PRIMARY = "bg-[#7f1d1d] text-white hover:bg-[#681717] disabled:opacity-50";

const STEPS = ["Origem", "Pessoas", "Perfis", "Prévia", "Executar"] as const;

const STATUS_LABELS: Record<CopyItemStatus, string> = {
  ADDED: "Vinculada",
  ALREADY_MEMBER: "Já era membro (nada alterado)",
  SKIPPED_SELF: "Você (ignorada)",
  NOT_ACTIVE_IN_SOURCE: "Não é ativa na origem",
  PROFILE_NOT_FOUND: "Perfil não encontrado",
  ADMIN_NOT_CONFIRMED: "Administrador não confirmado",
  INVALID: "Dados inválidos",
  ERROR: "Erro",
};

const permissionLabel = (permission: string) => permissionLabels[permission as ProjectPermission] ?? permission;
const areaLabel = (area: string | null | undefined) => (area ? (membershipAreaLabels[area as MembershipArea] ?? area) : "—");

function projectLabel(project: Pick<ProjectOption, "name" | "code">) {
  return `${project.name} · ${project.code}`;
}

export function CopyStructureWizard({
  destination,
  sources,
  categories,
  backHref,
  fromRegistration = false,
}: {
  destination: ProjectOption;
  sources: ProjectOption[];
  categories: StructureCategory[];
  backHref: string;
  /** Veio do cadastro de uma obra nova: concluir ou pular a cópia continua para o Start-up. */
  fromRegistration?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState(1);
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "team");
  const [sourceId, setSourceId] = useState("");
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [emailIngestion, setEmailIngestion] = useState(false);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<CopyRpcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((item) => item.id === categoryId) ?? categories[0];
  const source = sources.find((item) => item.id === sourceId) ?? null;
  const selectedRows = useMemo(() => candidates.filter((candidate) => rows[candidate.userId]?.selected), [candidates, rows]);

  function selection(): TeamSelection[] {
    return selectedRows.map((candidate) => {
      const row = rows[candidate.userId];
      return {
        userId: candidate.userId,
        permission: row.permission,
        area: row.area || null,
        explicitAdmin: row.permission === "ADMINISTRADOR" ? row.explicitAdmin : undefined,
        includeExcluded: row.includeExcluded || undefined,
      };
    });
  }

  function updateRow(userId: string, patch: Partial<RowState>) {
    setRows((current) => ({ ...current, [userId]: { ...current[userId], ...patch } }));
    setPreview(null);
    setConfirmed(false);
  }

  function loadSource() {
    setError(null);
    startTransition(async () => {
      const outcome = await loadTeamCandidatesAction({ sourceId, destinationId: destination.id });
      if (!outcome.ok) return setError(outcome.error);
      setCandidates(outcome.data.candidates);
      setEmailIngestion(outcome.data.destinationEmailIngestionEnabled);
      setRows(
        Object.fromEntries(
          outcome.data.candidates.map((candidate) => [
            candidate.userId,
            {
              selected: candidate.defaultSelected,
              permission: candidate.proposedPermission,
              area: candidate.proposedArea ?? "",
              explicitAdmin: false,
              includeExcluded: false,
            } satisfies RowState,
          ])
        )
      );
      setPreview(null);
      setResult(null);
      setConfirmed(false);
      setStep(2);
    });
  }

  function runPreview() {
    setError(null);
    startTransition(async () => {
      const outcome = await previewTeamCopyAction({ sourceId, destinationId: destination.id, selection: selection() });
      if (!outcome.ok) return setError(outcome.error);
      setPreview(outcome.data);
      setConfirmed(false);
      setStep(4);
    });
  }

  function runExecute() {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const outcome = await executeTeamCopyAction({
        sourceId,
        destinationId: destination.id,
        selection: selection(),
        confirmed,
        signature: preview.signature,
      });
      if (!outcome.ok) return setError(outcome.error);
      setResult(outcome.data.result);
      setStep(5);
    });
  }

  const missingProfile = selectedRows.some((candidate) => {
    const row = rows[candidate.userId];
    return !row.area || (row.permission === "ADMINISTRADOR" && !row.explicitAdmin);
  });

  return (
    <Card className="border-black/10 bg-white/95 text-[#0f172a] shadow-xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[#0f172a]">
          <Users aria-hidden="true" className="size-5 text-[#7f1d1d]" />
          Copiar estrutura de outro projeto
        </CardTitle>
        <CardDescription className="text-[#475569]">
          Destino: <strong>{projectLabel(destination)}</strong>. Nada é enviado: nenhum convite nem e-mail. Pessoas já vinculadas ao destino nunca têm o acesso alterado.
        </CardDescription>
        <ol className="mt-2 flex flex-wrap gap-2 text-xs" aria-label="Etapas">
          {STEPS.map((label, index) => (
            <li key={label} aria-current={step === index + 1 ? "step" : undefined}>
              <Badge variant={step === index + 1 ? "default" : "outline"} className={step === index + 1 ? PRIMARY : "border-[#94a3b8] text-[#0f172a]"}>
                {index + 1}. {label}
              </Badge>
            </li>
          ))}
        </ol>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        {error ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {step === 1 ? (
          <section className="flex flex-col gap-4" aria-labelledby="copy-step-1">
            <h2 id="copy-step-1" className="text-base font-semibold">1. Origem</h2>
            {categories.length > 1 ? (
              <label className="flex flex-col gap-1.5 text-sm font-medium">
                O que copiar
                <Select className="border-[#94a3b8] text-[#0f172a]" value={categoryId} onChange={(event) => setCategoryId(event.target.value as typeof categoryId)}>
                  {categories.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </Select>
              </label>
            ) : (
              <p className="text-sm"><strong>O que copiar:</strong> {category?.label}</p>
            )}
            <p className="text-sm text-[#475569]">{category?.description}</p>
            {sources.length === 0 ? (
              <p className="text-sm">Você não é Administrador ativo de nenhum outro projeto, então não há origem disponível.</p>
            ) : (
              <label className="flex max-w-xl flex-col gap-1.5 text-sm font-medium">
                Projeto de origem (somente projetos em que você é Administrador)
                <Select className="border-[#94a3b8] text-[#0f172a]" value={sourceId} onChange={(event) => setSourceId(event.target.value)}>
                  <option value="">Selecione…</option>
                  {sources.map((item) => (
                    <option key={item.id} value={item.id}>{projectLabel(item)}</option>
                  ))}
                </Select>
              </label>
            )}
            <div>
              <Button type="button" className={PRIMARY} disabled={!sourceId || pending} onClick={loadSource}>
                {pending ? "Carregando equipe…" : "Carregar equipe da origem"}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="flex flex-col gap-3" aria-labelledby="copy-step-2">
            <h2 id="copy-step-2" className="text-base font-semibold">2. Pessoas de {source ? projectLabel(source) : "origem"}</h2>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" className="border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" onClick={() => setRows((current) => Object.fromEntries(candidates.map((c) => [c.userId, { ...current[c.userId], selected: c.defaultSelected }])))}>
                Selecionar sugeridos
              </Button>
              <Button type="button" size="sm" variant="outline" className="border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" onClick={() => setRows((current) => Object.fromEntries(candidates.map((c) => [c.userId, { ...current[c.userId], selected: false }])))}>
                Limpar seleção
              </Button>
              <span className="self-center text-sm text-[#475569]">{selectedRows.length} selecionada(s)</span>
            </div>
            <div className="overflow-x-auto rounded-md border border-[#cbd5e1]">
              <table className="w-full text-sm">
                <thead className="bg-[#f1f5f9] text-[#0f172a] text-left">
                  <tr>
                    <th className="p-2"><span className="sr-only">Selecionar</span></th>
                    <th className="p-2">Pessoa</th>
                    <th className="p-2">Perfil na origem</th>
                    <th className="p-2">Área</th>
                    <th className="p-2">Situação no destino</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((candidate) => {
                    const row = rows[candidate.userId];
                    const blockedSelf = candidate.state === "SELF" || candidate.exclusion === "INACTIVE_IN_SOURCE";
                    const needsOverride = candidate.exclusion !== null && candidate.exclusion !== "INACTIVE_IN_SOURCE" && candidate.state === "NEW";
                    return (
                      <tr key={candidate.userId} className="border-t border-[#cbd5e1] align-top">
                        <td className="p-2">
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${candidate.name}`}
                            checked={row?.selected ?? false}
                            disabled={blockedSelf || (needsOverride && !row?.includeExcluded)}
                            onChange={(event) => updateRow(candidate.userId, { selected: event.target.checked })}
                          />
                        </td>
                        <td className="p-2">
                          <p className="font-medium">{candidate.name}</p>
                          <p className="text-xs text-[#475569]">{candidate.email ?? "sem e-mail"}{candidate.title ? ` · ${candidate.title}` : ""}</p>
                          {needsOverride ? (
                            <label className="mt-1 flex items-center gap-1.5 text-xs">
                              <input
                                type="checkbox"
                                checked={row?.includeExcluded ?? false}
                                onChange={(event) => updateRow(candidate.userId, { includeExcluded: event.target.checked, selected: event.target.checked })}
                              />
                              Incluir mesmo assim
                            </label>
                          ) : null}
                        </td>
                        <td className="p-2">{permissionLabel(candidate.sourcePermission)}</td>
                        <td className="p-2">{areaLabel(candidate.sourceArea)}</td>
                        <td className="p-2">
                          {candidate.state === "SELF" ? <Badge variant="outline" className="border-[#94a3b8] text-[#0f172a]">Você</Badge> : null}
                          {candidate.state === "ALREADY_MEMBER" ? (
                            <Badge variant="secondary" className="bg-[#e2e8f0] text-[#0f172a]">
                              Já no destino ({permissionLabel(candidate.destination?.permission ?? "")}, {candidate.destination?.status === "ACTIVE" ? "ativo" : "inativo"})
                            </Badge>
                          ) : null}
                          {candidate.state === "NEW" && !candidate.exclusion ? <Badge className={PRIMARY}>Novo</Badge> : null}
                          {candidate.exclusion ? <Badge variant="destructive">{EXCLUSION_LABELS[candidate.exclusion]}</Badge> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" onClick={() => setStep(1)}>Voltar</Button>
              <Button type="button" className={PRIMARY} disabled={selectedRows.length === 0} onClick={() => setStep(3)}>Revisar perfis</Button>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="flex flex-col gap-3" aria-labelledby="copy-step-3">
            <h2 id="copy-step-3" className="text-base font-semibold">3. Perfis propostos no destino</h2>
            <p className="text-sm text-[#475569]">
              O perfil proposto copia o da origem, exceto Administrador: ele vira Gerente e só se torna Administrador com a sua confirmação explícita, pessoa a pessoa.
            </p>
            <div className="flex flex-col gap-3">
              {selectedRows.map((candidate) => {
                const row = rows[candidate.userId];
                return (
                  <div key={candidate.userId} className="grid gap-3 rounded-md border border-[#cbd5e1] p-3 md:grid-cols-[1.2fr_1fr_1fr]">
                    <div>
                      <p className="text-sm font-medium">{candidate.name}</p>
                      <p className="text-xs text-[#475569]">
                        Origem: {permissionLabel(candidate.sourcePermission)} · {areaLabel(candidate.sourceArea)}
                      </p>
                      {candidate.adminNeedsExplicitDecision ? (
                        <p className="mt-1 text-xs text-amber-800">Administrador na origem; no destino a proposta é Gerente.</p>
                      ) : null}
                    </div>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Perfil no destino
                      <Select className="border-[#94a3b8] text-[#0f172a]" value={row.permission} onChange={(event) => updateRow(candidate.userId, { permission: event.target.value as TeamPermission, explicitAdmin: false })}>
                        {TEAM_PERMISSIONS.map((permission) => (
                          <option key={permission} value={permission}>{permissionLabel(permission)}</option>
                        ))}
                      </Select>
                      {row.permission === "ADMINISTRADOR" ? (
                        <span className="flex items-center gap-1.5 text-xs font-normal">
                          <input type="checkbox" checked={row.explicitAdmin} onChange={(event) => updateRow(candidate.userId, { explicitAdmin: event.target.checked })} />
                          Confirmo conceder Administrador a esta pessoa
                        </span>
                      ) : null}
                    </label>
                    <label className="flex flex-col gap-1 text-sm font-medium">
                      Área no destino
                      <Select className="border-[#94a3b8] text-[#0f172a]" value={row.area} onChange={(event) => updateRow(candidate.userId, { area: event.target.value })}>
                        <option value="">Selecione…</option>
                        {TEAM_AREAS.map((area) => (
                          <option key={area} value={area}>{areaLabel(area)}</option>
                        ))}
                      </Select>
                    </label>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" onClick={() => setStep(2)}>Voltar</Button>
              <Button type="button" className={PRIMARY} disabled={missingProfile || pending} onClick={runPreview}>
                {pending ? "Gerando prévia…" : "Gerar prévia"}
              </Button>
            </div>
            {missingProfile ? <p className="text-xs text-[#475569]">Defina a área de todas as pessoas (e confirme cada Administrador) para continuar.</p> : null}
          </section>
        ) : null}

        {step === 4 && preview ? (
          <section className="flex flex-col gap-4" aria-labelledby="copy-step-4">
            <h2 id="copy-step-4" className="text-base font-semibold">4. Prévia (nada foi gravado)</h2>
            <PreviewGroup title="Novos vínculos" empty="Nenhum novo vínculo." items={preview.preview.newLinks} tone="default" />
            <PreviewGroup title="Já vinculadas (sem alteração)" empty="Ninguém já vinculado com o mesmo perfil/área." items={preview.preview.alreadyLinked} tone="secondary" />
            <PreviewGroup title="Conflitos (o acesso existente NÃO será alterado)" empty="Sem conflitos." items={preview.preview.conflicts} tone="destructive" showExisting />
            <PreviewGroup title="Bloqueadas" empty="Nenhuma." items={preview.preview.blocked} tone="destructive" showReason />
            {emailIngestion ? (
              <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                O destino tem coleta de e-mail habilitada. Como no cadastro manual, vincular uma pessoa aciona a leitura retroativa dos e-mails dela naquele projeto. A coleta em si não é alterada.
              </p>
            ) : null}
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" onClick={() => setStep(3)}>Voltar</Button>
              <Button type="button" className={PRIMARY} disabled={preview.preview.executable.length === 0} onClick={() => setStep(5)}>Continuar para confirmação</Button>
            </div>
          </section>
        ) : null}

        {step === 5 && !result && preview ? (
          <section className="flex flex-col gap-3" aria-labelledby="copy-step-5">
            <h2 id="copy-step-5" className="text-base font-semibold">5. Confirmar e executar</h2>
            <p className="text-sm">
              Serão vinculadas <strong>{preview.preview.executable.length}</strong> pessoa(s) a <strong>{projectLabel(destination)}</strong>, a partir de{" "}
              <strong>{source ? projectLabel(source) : ""}</strong>. Nenhum convite ou e-mail será enviado. Repetir a operação não cria duplicidades.
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
              Revisei a prévia e confirmo a criação destes vínculos.
            </label>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="outline" className="border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" onClick={() => setStep(4)}>Voltar à prévia</Button>
              <Button type="button" className={PRIMARY} disabled={!confirmed || pending} onClick={runExecute}>
                {pending ? "Copiando…" : `Copiar ${preview.preview.executable.length} pessoa(s)`}
              </Button>
            </div>
          </section>
        ) : null}

        {step === 5 && result ? (
          <section className="flex flex-col gap-3" aria-live="polite" aria-labelledby="copy-result">
            <h2 id="copy-result" className="text-base font-semibold">Resultado</h2>
            <p className="text-sm">
              {result.added} vinculada(s) · {result.alreadyMember} já era(m) membro(s) · {result.skipped} ignorada(s) · {result.errors} com erro.
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {result.items.map((item) => {
                const person = candidates.find((candidate) => candidate.userId === item.userId);
                return (
                  <li key={item.userId} className="flex flex-wrap items-center gap-2">
                    <Badge variant={item.status === "ADDED" ? "default" : item.status === "ERROR" ? "destructive" : "secondary"} className={item.status === "ADDED" ? PRIMARY : item.status === "ERROR" ? undefined : "bg-[#e2e8f0] text-[#0f172a]"}>{STATUS_LABELS[item.status]}</Badge>
                    <span>{person?.name ?? item.userId}</span>
                    {item.message && item.status !== "ADDED" ? <span className="text-xs text-[#475569]">{item.message}</span> : null}
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Link href={`/${destination.id}/usuarios`} className={buttonVariants({ className: PRIMARY })}>Ver Usuários do destino</Link>
              <Link href={backHref} className={buttonVariants({ variant: "outline", className: "border-[#94a3b8] text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" })}>{fromRegistration ? "Continuar para o Start-up" : "Concluir"}</Link>
            </div>
          </section>
        ) : null}

        {!(step === 5 && result) ? (
          <div>
            <Link href={backHref} className={buttonVariants({ variant: "ghost", size: "sm", className: "text-[#0f172a] hover:bg-[#e2e8f0] hover:text-[#0f172a]" })}>
              <ArrowLeft aria-hidden="true" />
              {fromRegistration ? "Pular a cópia e continuar para o Start-up" : "Sair sem copiar"}
            </Link>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function PreviewGroup({
  title,
  items,
  empty,
  tone,
  showExisting,
  showReason,
}: {
  title: string;
  items: PreviewItem[];
  empty: string;
  tone: "default" | "secondary" | "destructive";
  showExisting?: boolean;
  showReason?: boolean;
}) {
  return (
    <div>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        {title} <Badge variant={tone} className={tone === "secondary" ? "bg-[#e2e8f0] text-[#0f172a]" : tone === "default" ? PRIMARY : undefined}>{items.length}</Badge>
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-[#475569]">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {items.map((item) => (
            <li key={item.userId}>
              <strong>{item.name}</strong> — {permissionLabel(item.permission)} · {areaLabel(item.area)}
              {showExisting ? (
                <span className="text-[#475569]">
                  {" "}
                  (hoje no destino: {permissionLabel(item.existingPermission ?? "")} · {areaLabel(item.existingArea)} · {item.existingStatus === "ACTIVE" ? "ativo" : "inativo"})
                </span>
              ) : null}
              {showReason && item.reason ? <span className="text-destructive"> — {BLOCK_LABELS[item.reason]}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
