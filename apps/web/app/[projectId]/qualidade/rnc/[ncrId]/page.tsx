import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";
import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { getUsers } from "@/lib/data";
import { formatDate } from "@/lib/labels";
import { roleSatisfies } from "@/lib/quality/state-machine";
import { loadNcrDetail, type QualityDb } from "@/lib/quality/ui-queries";
import {
  ACTION_KIND_LABEL,
  ACTION_STATUS_LABEL,
  COST_CATEGORY_LABEL,
  CONSEQUENCE_STATUS_LABEL,
  ORIGIN_LABEL,
  PILLAR_LABEL,
  PROBABILITY_LABEL,
  VERIFICATION_RESULT_LABEL,
  blockerLabel,
  buildTimeline,
  formatMoney,
  label,
  type AuditRow,
  type StateEventRow,
} from "@/lib/quality/ui-model";
import { computeCriticality } from "@/lib/quality/criticality";
import type { Pillar, Severity } from "@/lib/quality/types";
import { ClassificationBadge, CriticalityBadge, EpistemicBadge, NcrStateBadge, RncLink, SectionTitle, SourceLink, Th, when } from "@/components/quality/quality-ui";
import { NcrTransitionPanel } from "@/components/quality/ncr-transition-panel";
import { ActionForm, ActionStatusForm, ConsequenceForm, CostForm, EvidenceClassifyForm, EvidenceForm, NcrEditForm, RecurrenceForm, VerificationForm } from "@/components/quality/ncr-detail-forms";
import { TOUCH } from "@/components/quality/form-kit";

export const metadata: Metadata = { title: "RNC" };

const s = (v: unknown): string => (typeof v === "string" ? v : "");
const n = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export default async function RncDetailPage({ params }: { params: Promise<{ projectId: string; ncrId: string }> }) {
  const { projectId, ncrId } = await params;
  const supabase = await createSupabaseServerClient();
  const role = await getCurrentProjectPermission(projectId);
  // RNC de outro projeto (ou inexistente) => 404: a consulta é sempre escopada por project_id (isolamento) e a RLS reforça.
  let d;
  try {
    d = await loadNcrDetail(supabase as unknown as QualityDb, projectId, ncrId, role);
  } catch {
    notFound();
  }
  if (!d) notFound();
  const users = await getUsers().catch(() => []);
  const names = new Map(users.map((u) => [u.id, u.name] as const));
  const ncr = d.ncr;
  const version = Number(ncr.row_version ?? 1);
  const canRegister = roleSatisfies(role, "REGISTER");
  const canManage = roleSatisfies(role, "MANAGE");
  const crit = computeCriticality(d.consequences.map((c) => ({ pillar: s(c.pillar) as Pillar, severity: s(c.severity) as Severity, sourceRef: n(c.source_ref) })));
  const evidenceOptions = d.evidence.map((e) => ({ id: s(e.id), sourceRef: s(e.source_ref), classification: s(e.classification) }));
  const timeline = buildTimeline(
    d.events.map((e) => ({ ...(e as unknown as StateEventRow) })),
    d.audits as unknown as AuditRow[],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${s(ncr.code)} — ${s(ncr.title)}`}
        description="Detalhe da RNC: estado, evidências, ações, verificação de eficácia, consequências por pilar, custos e linha do tempo."
        actions={<FeatureInfo helpId="qualidade.rnc.pagina-detalhe" />}
      />
      <Link href={`/${projectId}/qualidade?aba=rnc`} className={`inline-flex w-fit items-center text-sm underline underline-offset-2 ${TOUCH}`}>
        Voltar para a lista de RNC
      </Link>

      <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground" aria-label="Resumo da RNC">
        <SectionTitle title="Resumo" helpId="qualidade.rnc.resumo" />
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              Estado <FeatureInfo helpId="qualidade.rnc.estado-atual" />
            </dt>
            <dd>
              <NcrStateBadge state={s(ncr.state)} />
            </dd>
          </div>
          <div>
            <dt className="flex items-center gap-1 text-muted-foreground">
              Criticidade (pior pilar domina) <FeatureInfo helpId="qualidade.rnc.criticidade" />
            </dt>
            <dd className="flex flex-wrap items-center gap-2">
              <CriticalityBadge criticality={s(ncr.criticality)} />
              {crit.dominantPillars.length ? <span className="text-xs text-muted-foreground">sustentada por: {crit.dominantPillars.map((p) => PILLAR_LABEL[p]).join(", ")}</span> : null}
              {crit.pillarsWithoutData.length ? <span className="text-xs text-muted-foreground">pilares SEM DADOS: {crit.pillarsWithoutData.map((p) => PILLAR_LABEL[p]).join(", ")}</span> : null}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Origem</dt>
            <dd className="flex flex-col gap-0.5">
              <span>{label(ORIGIN_LABEL, s(ncr.origin_type))}</span>
              <SourceLink reference={s(ncr.origin_ref)} url={n(ncr.origin_url)} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Reaberturas / versão</dt>
            <dd>
              {Number(ncr.reopen_count ?? 0)} / v{version}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Responsável</dt>
            <dd>{n(ncr.responsible_user_id) ? (names.get(s(ncr.responsible_user_id)) ?? "Usuário não disponível") : "SEM DADOS"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Prazo</dt>
            <dd>{n(ncr.due_date) ? formatDate(s(ncr.due_date)) : "SEM DADOS"}</dd>
          </div>
        </dl>
        {n(ncr.description) ? <p className="text-sm">{s(ncr.description)}</p> : null}
        {n(ncr.state_justification) ? <p className="text-sm text-muted-foreground">Última justificativa: {s(ncr.state_justification)}</p> : null}
        {crit.warnings.length ? <p className="text-xs text-muted-foreground">Avisos de qualidade de dados: {crit.warnings.join(", ")}</p> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Transição de estado">
        <SectionTitle title="Transição de estado" helpId="qualidade.rnc.transicoes" />
        <p className="text-sm text-muted-foreground">
          Encerramento: {d.closureReady?.ready ? "pronto para encerrar." : d.closureReady ? `bloqueado — ${d.closureReady.blockers.map(blockerLabel).join(" ")}` : "indisponível (não foi possível consultar o banco)."}
        </p>
        <NcrTransitionPanel key={version} projectId={projectId} ncrId={ncrId} rowVersion={version} options={d.options} evidence={evidenceOptions} otherNcrs={d.otherNcrs.map((o) => ({ id: s(o.id), code: s(o.code), title: s(o.title), state: s(o.state) }))} canRegister={canRegister} />
        {canRegister ? <NcrEditForm key={`e${version}`} projectId={projectId} ncrId={ncrId} rowVersion={version} rootCause={s(ncr.root_cause)} dueDate={s(ncr.due_date)} /> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Evidências">
        <SectionTitle title="Evidências" helpId="qualidade.evidencias.secao-rnc" />
        {d.evidence.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhuma evidência cadastrada." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th helpId="qualidade.evidencias.col-fonte">Fonte original</Th>
                <Th helpId="qualidade.evidencias.col-classificacao">Classificação</Th>
                <Th helpId="qualidade.evidencias.col-epistemico">Tipo epistêmico</Th>
                <Th helpId="qualidade.evidencias.col-descricao">Descrição</Th>
                {canRegister ? <Th helpId="qualidade.evidencias.col-reclassificar">Reclassificar</Th> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.evidence.map((e) => (
                <TableRow key={s(e.id)}>
                  <TableCell className="min-w-48">
                    <span className="block">{label(ORIGIN_LABEL, s(e.source_type))}</span>
                    <SourceLink reference={s(e.source_ref)} url={n(e.source_url)} />
                  </TableCell>
                  <TableCell>
                    <ClassificationBadge classification={s(e.classification)} />
                  </TableCell>
                  <TableCell>
                    <EpistemicBadge epistemic={s(e.epistemic)} />
                  </TableCell>
                  <TableCell className="min-w-48">{n(e.description) ?? "SEM DADOS"}</TableCell>
                  {canRegister ? (
                    <TableCell>
                      <EvidenceClassifyForm key={`${s(e.id)}-${Number(e.row_version)}`} projectId={projectId} evidenceId={s(e.id)} rowVersion={Number(e.row_version ?? 1)} classification={s(e.classification)} epistemic={s(e.epistemic)} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRegister ? <EvidenceForm projectId={projectId} ncrId={ncrId} /> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Consequências por pilar">
        <SectionTitle title="Consequências por pilar" helpId="qualidade.rnc.consequencias" />
        {d.consequences.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhuma consequência registrada; a criticidade permanece SEM DADOS." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th helpId="qualidade.rnc.col-pilar">Pilar</Th>
                <Th helpId="qualidade.rnc.col-severidade">Severidade</Th>
                <Th helpId="qualidade.rnc.col-probabilidade">Probabilidade</Th>
                <Th helpId="qualidade.rnc.col-fonte-consequencia">Fonte</Th>
                <Th helpId="qualidade.rnc.col-status-consequencia">Status</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.consequences.map((c) => (
                <TableRow key={s(c.id)}>
                  <TableCell>{label(PILLAR_LABEL, s(c.pillar))}</TableCell>
                  <TableCell>
                    <CriticalityBadge criticality={s(c.severity)} />
                  </TableCell>
                  <TableCell>{n(c.probability) ? `${label(PROBABILITY_LABEL, s(c.probability))} (${s(c.probability_basis)})` : "SEM DADOS"}</TableCell>
                  <TableCell>
                    <SourceLink reference={s(c.source_ref)} />
                  </TableCell>
                  <TableCell>{label(CONSEQUENCE_STATUS_LABEL, s(c.status))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRegister ? <ConsequenceForm projectId={projectId} ncrId={ncrId} /> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Ações corretivas e preventivas">
        <SectionTitle title="Ações (CAPA)" helpId="qualidade.capa.secao-rnc" />
        {d.actions.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhuma ação registrada." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th helpId="qualidade.capa.col-tipo">Tipo</Th>
                <Th helpId="qualidade.capa.col-descricao">Ação</Th>
                <Th helpId="qualidade.capa.col-prazo">Prazo</Th>
                <Th helpId="qualidade.capa.col-status">Status</Th>
                {canRegister ? <Th helpId="qualidade.capa.col-atualizar">Atualizar status</Th> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.actions.map((a) => (
                <TableRow key={s(a.id)}>
                  <TableCell>{label(ACTION_KIND_LABEL, s(a.kind))}</TableCell>
                  <TableCell className="min-w-48">{s(a.description)}</TableCell>
                  <TableCell>{n(a.due_date) ? formatDate(s(a.due_date)) : "SEM DADOS"}</TableCell>
                  <TableCell>{label(ACTION_STATUS_LABEL, s(a.status))}</TableCell>
                  {canRegister ? (
                    <TableCell>
                      <ActionStatusForm key={`${s(a.id)}-${Number(a.row_version)}`} projectId={projectId} actionId={s(a.id)} rowVersion={Number(a.row_version ?? 1)} status={s(a.status)} />
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRegister ? <ActionForm projectId={projectId} ncrId={ncrId} /> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Verificação de eficácia">
        <SectionTitle title="Verificação de eficácia" helpId="qualidade.eficacia.secao-rnc" />
        {d.verifications.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhuma verificação de eficácia registrada." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th helpId="qualidade.eficacia.col-resultado">Resultado</Th>
                <Th helpId="qualidade.eficacia.col-criterio">Critério</Th>
                <Th helpId="qualidade.eficacia.col-data">Verificada em</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.verifications.map((v) => (
                <TableRow key={s(v.id)}>
                  <TableCell>{label(VERIFICATION_RESULT_LABEL, s(v.result))}</TableCell>
                  <TableCell className="min-w-48">{s(v.criteria)}</TableCell>
                  <TableCell>{when(n(v.verified_at))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canManage ? <VerificationForm projectId={projectId} ncrId={ncrId} evidence={evidenceOptions} /> : canRegister ? <p className="text-sm text-muted-foreground">Registrar a verificação de eficácia exige perfil de gestão.</p> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Custos e recorrências">
        <SectionTitle title="Custos de não qualidade" helpId="qualidade.custos.secao-rnc" />
        {d.costs.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhum custo registrado." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <Th helpId="qualidade.custos.col-categoria">Categoria</Th>
                <Th helpId="qualidade.custos.col-estimado">Estimado</Th>
                <Th helpId="qualidade.custos.col-real">Realizado</Th>
                <Th helpId="qualidade.custos.col-fonte">Fonte do valor</Th>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.costs.map((c) => (
                <TableRow key={s(c.id)}>
                  <TableCell>{label(COST_CATEGORY_LABEL, s(c.category))}</TableCell>
                  <TableCell>{formatMoney(c.estimated_amount as number | null, s(c.currency) || "BRL")}</TableCell>
                  <TableCell>{formatMoney(c.actual_amount as number | null, s(c.currency) || "BRL")}</TableCell>
                  <TableCell>
                    <SourceLink reference={n(c.source_ref)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {canRegister ? <CostForm projectId={projectId} ncrId={ncrId} /> : null}

        <SectionTitle title="Recorrências" helpId="qualidade.recorrencias.secao-rnc" />
        {d.recurrences.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhuma recorrência registrada." />
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {d.recurrences.map((r) => {
              const other = s(r.ncr_id) === ncrId ? s(r.related_ncr_id) : s(r.ncr_id);
              const code = d.otherNcrs.find((o) => s(o.id) === other)?.code;
              return (
                <li key={s(r.id)} className="flex flex-wrap items-center gap-2">
                  <RncLink projectId={projectId} id={other} code={s(code) || undefined} />
                  <span>{s(r.basis)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {canRegister ? <RecurrenceForm projectId={projectId} ncrId={ncrId} others={d.otherNcrs.map((o) => ({ id: s(o.id), code: s(o.code), title: s(o.title) }))} /> : null}
      </section>

      <section className="flex flex-col gap-3" aria-label="Linha do tempo">
        <SectionTitle title="Linha do tempo" helpId="qualidade.rnc.linha-do-tempo" />
        {timeline.length === 0 ? (
          <EmptyState message="SEM DADOS: nenhum evento registrado." />
        ) : (
          <ol className="flex flex-col gap-2 border-l border-border pl-4 text-sm">
            {timeline.map((t, i) => (
              <li key={`${t.kind}-${t.at}-${i}`}>
                <span className="font-medium">{t.title}</span>
                <span className="text-muted-foreground">
                  {" "}
                  — {when(t.at)} — {t.actor ? (names.get(t.actor) ?? (t.actor === "Sistema" ? "Sistema" : "Usuário não disponível")) : "SEM DADOS"}
                </span>
                {t.detail ? <span className="block text-muted-foreground">Justificativa: {t.detail}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
