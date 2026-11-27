import type { Metadata } from "next";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { getProjectMembers } from "@/lib/data";
import { normalizeLegacyMojibake } from "@/lib/normalize-legacy-mojibake";
import { FeatureInfo } from "@/components/shared/feature-info";
import { AuditBottomPager, AuditFilterBar, auditHref, type AuditFilterState } from "@/components/audit/audit-filter-bar";
import {
  AUDIT_FILTERS,
  FAILURE_STATUS_LABELS,
  auditCategoryLabel,
  formatAuditDateTime,
  parseAuditFilter,
  translateAuditAction,
  type FailureStatus,
} from "@/lib/audit/audit-catalog";
import { parseAuditActor, parseAuditDay, queryAuditLog } from "@/lib/audit/audit-query";
import { createSupabaseServerClient } from "@axion/db/server";

export const metadata: Metadata = { title: "Auditoria" };

type SearchParams = { tipo?: string; de?: string; ate?: string; responsavel?: string; q?: string; pagina?: string };

async function loadActorNames(projectId: string, actorIds: string[]) {
  const names = new Map<string, string>();
  const members = await getProjectMembers(projectId).catch(() => []);
  for (const member of members) names.set(member.userId, member.user.name);
  const missing = actorIds.filter((id) => !names.has(id));
  if (missing.length > 0) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.from("profiles").select("id, name").in("id", missing);
    for (const row of (data ?? []) as Array<{ id: string; name: string | null }>) {
      if (row.name) names.set(row.id, row.name);
    }
  }
  return names;
}

export default async function AuditoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { projectId } = await params;
  const raw = await searchParams;
  const category = parseAuditFilter(raw.tipo);
  const from = parseAuditDay(raw.de);
  const to = parseAuditDay(raw.ate);
  const actor = parseAuditActor(raw.responsavel);
  const keyword = (raw.q ?? "").trim().slice(0, 80);
  const requestedPage = Number.parseInt(raw.pagina ?? "1", 10);

  const result = await queryAuditLog({
    projectId,
    category,
    from,
    to,
    actor,
    keyword: keyword || undefined,
    page: Number.isFinite(requestedPage) ? requestedPage : 1,
  });

  const selectedUser = actor && actor !== "SYSTEM" && actor !== "LEGACY" ? [actor] : [];
  const names = await loadActorNames(projectId, [...result.actorIds, ...selectedUser]);
  const actorOptions = [
    { value: "SYSTEM", label: "Sistema (rotinas automáticas)" },
    { value: "LEGACY", label: "Usuário legado" },
    ...[...names.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  ];

  const state: AuditFilterState = {
    tipo: category,
    de: from ?? "",
    ate: to ?? "",
    responsavel: actor ?? "",
    q: keyword,
  };

  // "Não catalogados" só aparece quando existir algum registro sem regra (nunca some em silêncio).
  const filters = AUDIT_FILTERS.filter(
    (f) => f.value !== "NAO_CATALOGADO" || result.counts.NAO_CATALOGADO > 0 || category === "NAO_CATALOGADO"
  ).map((f) => ({ value: f.value, label: f.label, count: result.counts[f.value] }));

  const failureCounts: Record<FailureStatus, number> = { ATIVA: 0, AGUARDANDO_INVESTIGACAO: 0, RECUPERADA: 0, HISTORICA: 0 };
  for (const failure of result.failures) failureCounts[failure.status] += 1;
  const failuresHref = auditHref(projectId, { tipo: "INTEGRACOES", de: "", ate: "", responsavel: "", q: "" });
  const hasActive = failureCounts.ATIVA > 0;

  const actorLabel = (row: (typeof result.rows)[number]) => {
    if (row.actorType === "SYSTEM") return "Sistema";
    if (row.actorType === "LEGACY") return row.actorLabel ?? "Usuário legado";
    return (row.actorUserId ? names.get(row.actorUserId) : undefined) ?? "Usuário não disponível";
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Auditoria" description="Trilha cronológica e supervisão operacional para a Diretoria." actions={<FeatureInfo helpId="admin.auditoria.pagina" />} />

      <AuditFilterBar
        projectId={projectId}
        state={state}
        filters={filters}
        actorOptions={actorOptions}
        page={result.page}
        pageCount={result.pageCount}
        totalMatching={result.totalMatching}
      />

      {result.failures.length > 0 ? (
        <div
          data-testid="audit-supervision"
          className={
            hasActive
              ? "rounded-md border border-red-600 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950/40 dark:text-red-100"
              : "rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground"
          }
        >
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <strong className="inline-flex items-center gap-1">
              Supervisão do ACC:
              <FeatureInfo helpId="admin.auditoria.supervisao" />
            </strong>
            {(Object.keys(FAILURE_STATUS_LABELS) as FailureStatus[]).map((status) => (
              <span key={status} data-failure-status={status}>
                {FAILURE_STATUS_LABELS[status]}: <strong className="tabular-nums">{failureCounts[status]}</strong>
              </span>
            ))}
            <Link href={failuresHref} className="font-semibold underline underline-offset-2" data-testid="audit-supervision-link">
              Ver em “Integrações e falhas”
            </Link>
          </div>
          <p className="mt-1 text-xs opacity-90">
            {hasActive
              ? "Há falha operacional atual sem registro de recuperação nas últimas 24 horas."
              : "Nenhuma falha operacional atual. Ocorrências anteriores aparecem como recuperadas, aguardando investigação ou históricas."}{" "}
            Tentativas repetidas da mesma falha contam uma vez.
          </p>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-medium">Evidências por ocorrência</summary>
            <ul className="mt-1 flex flex-col gap-1">
              {result.failures.map((failure) => (
                <li key={`${failure.action}|${failure.entityId}`}>
                  <span className="font-medium">{FAILURE_STATUS_LABELS[failure.status]}</span> · {formatAuditDateTime(failure.occurredAt)} ·{" "}
                  {translateAuditAction(failure.action).label} <code className="opacity-80">({failure.action})</code> · entidade{" "}
                  <code>{failure.entityId}</code>
                  {failure.occurrences > 1 ? ` · ${failure.occurrences} tentativas` : ""} · {failure.evidence}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      {result.scanTruncated ? (
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          A consulta atingiu o limite de leitura desta tela. Use data inicial e final para refinar.
        </p>
      ) : null}

      {result.rows.length === 0 ? (
        <EmptyState message="Nenhum registro encontrado para os filtros selecionados." />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Data/Hora — Brasília
                    <FeatureInfo helpId="admin.auditoria.col-data-hora" />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Ator
                    <FeatureInfo helpId="admin.auditoria.col-ator" />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Ação
                    <FeatureInfo helpId="admin.auditoria.col-acao" />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Entidade
                    <FeatureInfo helpId="admin.auditoria.col-entidade" />
                  </span>
                </TableHead>
                <TableHead>
                  <span className="inline-flex items-center gap-1">
                    Detalhe
                    <FeatureInfo helpId="admin.auditoria.col-detalhe" />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {result.rows.map((row) => {
                const translation = translateAuditAction(normalizeLegacyMojibake(row.action));
                return (
                  <TableRow key={row.id} data-audit-category={row.category} data-audit-action={row.action}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      <time dateTime={row.occurredAt} title={`Original (UTC): ${row.occurredAt}`}>
                        {formatAuditDateTime(row.occurredAt)}
                      </time>
                    </TableCell>

                    <TableCell>{actorLabel(row)}</TableCell>

                    <TableCell>
                      <span className="block font-medium">{translation.label}</span>
                      {translation.translated ? <code className="block text-xs text-muted-foreground">{row.action}</code> : null}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      <span title={`Categoria: ${auditCategoryLabel(row.category)} (regra: ${row.ruleId})`}>
                        {row.entityType} · {row.entityId}
                      </span>
                      <span className="block text-xs">{auditCategoryLabel(row.category)}</span>
                    </TableCell>

                    <TableCell className="text-muted-foreground">{normalizeLegacyMojibake(row.detail)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <AuditBottomPager projectId={projectId} state={state} page={result.page} pageCount={result.pageCount} />
        </>
      )}
    </div>
  );
}
