import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { FeatureInfo } from "@/components/shared/feature-info";
import { EmptyState } from "@/components/shared/empty-state";
import { getUsers } from "@/lib/data";
import { formatDate } from "@/lib/labels";
import {
  ACTION_KIND_LABEL,
  ACTION_STATUS_LABEL,
  COMPLAINT_CHANNEL_LABEL,
  COMPLAINT_STATUS_LABEL,
  COST_CATEGORY_LABEL,
  CLASSIFICATION_LABEL,
  CRITICALITY_LABEL,
  INSPECTION_RESULT_LABEL,
  NCR_STATE_LABEL,
  ORIGIN_LABEL,
  TEST_RESULT_LABEL,
  VERIFICATION_RESULT_LABEL,
  NCR_CREATE_ORIGINS,
  buildTimeline,
  computeQualityKpis,
  formatMoney,
  label,
  sumCosts,
  type AuditRow,
  type NcrKpiRow,
  type StateEventRow,
} from "@/lib/quality/ui-model";
import {
  LIST_LIMIT,
  loadActions,
  loadAuditLog,
  loadComplaints,
  loadCosts,
  loadEvidenceList,
  loadInspections,
  loadNcrCodes,
  loadNcrList,
  loadOverview,
  loadRecurrences,
  loadRequirements,
  loadStateEvents,
  loadTests,
  loadVerifications,
  type QualityDb,
} from "@/lib/quality/ui-queries";
import { roleSatisfies } from "@/lib/quality/state-machine";
import type { QualityRole } from "@/lib/quality/types";
import { NcrCreateForm } from "./ncr-create-form";
import { ComplaintForm, InspectionForm, RequirementForm, TestForm } from "./record-forms";
import {
  ClassificationBadge,
  CriticalityBadge,
  EpistemicBadge,
  FilterField,
  KpiCard,
  NcrStateBadge,
  RncLink,
  SectionTitle,
  SourceLink,
  Th,
  when,
} from "./quality-ui";
import { TOUCH } from "./form-kit";

export interface SectionProps {
  projectId: string;
  role: QualityRole | null;
  db: QualityDb;
  sp: Record<string, string | undefined>;
}

const canRegisterRole = (role: QualityRole | null) => roleSatisfies(role, "REGISTER");
const ReadOnlyNote = () => (
  <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
    Seu perfil é somente consulta (LEITURA): os formulários de registro ficam ocultos. O banco também recusa escritas sem autorização.
  </p>
);
const Truncated = ({ count }: { count: number }) =>
  count >= LIST_LIMIT ? <p className="text-xs text-muted-foreground">Exibindo os {LIST_LIMIT} registros mais recentes; refine pelos filtros.</p> : null;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const nstr = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

// ------------------------------------------------------------ dashboard ----

export async function DashboardSection({ projectId, db }: SectionProps) {
  const { ncrs, actions, verifications } = await loadOverview(db, projectId);
  const kpis = computeQualityKpis({
    ncrs: ncrs as unknown as NcrKpiRow[],
    actions: actions as unknown as Array<{ status: string; due_date: string | null; ncr_id: string | null }>,
    verifications: verifications as unknown as Array<{ result: string; ncr_id: string | null; created_at: string }>,
    today: new Date().toISOString().slice(0, 10),
  });
  return (
    <section className="flex flex-col gap-4" aria-label="Indicadores da Qualidade">
      <SectionTitle title="Indicadores da Qualidade" helpId="qualidade.dashboard.indicadores" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard title="RNC abertas" helpId="qualidade.dashboard.kpi-abertas" kpi={kpis.abertas} />
        <KpiCard title="RNC críticas abertas" helpId="qualidade.dashboard.kpi-criticas" kpi={kpis.criticasAbertas} />
        <KpiCard title="RNC abertas sem criticidade" helpId="qualidade.dashboard.kpi-sem-criticidade" kpi={kpis.semCriticidadeAbertas} />
        <KpiCard title="Reaberturas" helpId="qualidade.dashboard.kpi-reaberturas" kpi={kpis.reaberturas} />
        <KpiCard title="Tempo médio até o encerramento" helpId="qualidade.dashboard.kpi-tempo-encerramento" kpi={kpis.tempoMedioEncerramentoDias} />
        <KpiCard title="Ações vencidas" helpId="qualidade.dashboard.kpi-acoes-vencidas" kpi={kpis.acoesVencidas} />
        <KpiCard title="Eficácia das correções" helpId="qualidade.dashboard.kpi-eficacia" kpi={kpis.eficacia} />
      </div>
      <SectionTitle title="RNC por estado" helpId="qualidade.dashboard.por-estado" />
      {kpis.porEstado.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma RNC registrada neste projeto." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.dashboard.col-estado">Estado</Th>
              <Th helpId="qualidade.dashboard.col-quantidade">Quantidade</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kpis.porEstado.map((r) => (
              <TableRow key={r.state}>
                <TableCell>
                  <Link href={`/${projectId}/qualidade?aba=rnc&estado=${r.state}`} className={`underline underline-offset-2 ${TOUCH} inline-flex items-center`}>
                    <NcrStateBadge state={r.state} />
                  </Link>
                </TableCell>
                <TableCell>{r.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ RNC ----

export async function RncSection({ projectId, role, db, sp }: SectionProps) {
  const [list, requirements] = await Promise.all([
    loadNcrList(db, projectId, { state: sp.estado, criticality: sp.criticidade, origin: sp.origem, q: sp.q }),
    loadRequirements(db, projectId),
  ]);
  const filtered = Boolean(sp.estado || sp.criticidade || sp.origem || sp.q);
  return (
    <section className="flex flex-col gap-4" aria-label="RNC">
      {canRegisterRole(role) ? (
        <NcrCreateForm projectId={projectId} requirements={requirements.map((r) => ({ id: str(r.id), code: str(r.code), title: str(r.title) }))} />
      ) : (
        <ReadOnlyNote />
      )}
      <SectionTitle title="Relatórios de não conformidade" helpId="qualidade.rnc.lista" />
      <form method="get" action={`/${projectId}/qualidade`} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
        <input type="hidden" name="aba" value="rnc" />
        <FilterField name="q" label="Busca" helpId="qualidade.rnc.filtro-busca">
          <Input id="f-q" name="q" defaultValue={sp.q ?? ""} maxLength={80} className={TOUCH} />
        </FilterField>
        <FilterField name="estado" label="Estado" helpId="qualidade.rnc.filtro-estado">
          <Select id="f-estado" name="estado" defaultValue={sp.estado ?? ""} className={`w-full ${TOUCH}`}>
            <option value="">Todos</option>
            {Object.entries(NCR_STATE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField name="criticidade" label="Criticidade" helpId="qualidade.rnc.filtro-criticidade">
          <Select id="f-criticidade" name="criticidade" defaultValue={sp.criticidade ?? ""} className={`w-full ${TOUCH}`}>
            <option value="">Todas</option>
            {Object.entries(CRITICALITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField name="origem" label="Origem" helpId="qualidade.rnc.filtro-origem">
          <Select id="f-origem" name="origem" defaultValue={sp.origem ?? ""} className={`w-full ${TOUCH}`}>
            <option value="">Todas</option>
            {NCR_CREATE_ORIGINS.map((o) => (
              <option key={o} value={o}>
                {ORIGIN_LABEL[o]}
              </option>
            ))}
            <option value="GARANTIA">{ORIGIN_LABEL.GARANTIA}</option>
          </Select>
        </FilterField>
        <div className="flex items-center gap-1">
          <Button type="submit" className={TOUCH}>
            Filtrar
          </Button>
          <FeatureInfo helpId="qualidade.rnc.filtro-aplicar" />
          {filtered ? (
            <Link href={`/${projectId}/qualidade?aba=rnc`} className={`ml-2 inline-flex items-center text-sm underline underline-offset-2 ${TOUCH}`}>
              Limpar filtros
            </Link>
          ) : null}
        </div>
      </form>
      {list.length === 0 ? (
        <EmptyState message={filtered ? "Nenhuma RNC com estes filtros." : "SEM DADOS: nenhuma RNC registrada neste projeto."} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.rnc.col-codigo">Código</Th>
              <Th helpId="qualidade.rnc.col-titulo">Título</Th>
              <Th helpId="qualidade.rnc.col-estado">Estado</Th>
              <Th helpId="qualidade.rnc.col-criticidade">Criticidade</Th>
              <Th helpId="qualidade.rnc.col-origem">Origem</Th>
              <Th helpId="qualidade.rnc.col-reaberturas">Reaberturas</Th>
              <Th helpId="qualidade.rnc.col-prazo">Prazo</Th>
              <Th helpId="qualidade.rnc.col-criada">Criada em</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((n) => (
              <TableRow key={str(n.id)}>
                <TableCell>
                  <RncLink projectId={projectId} id={str(n.id)} code={str(n.code)} />
                </TableCell>
                <TableCell className="min-w-48">{str(n.title)}</TableCell>
                <TableCell>
                  <NcrStateBadge state={str(n.state)} />
                </TableCell>
                <TableCell>
                  <CriticalityBadge criticality={str(n.criticality)} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span>{label(ORIGIN_LABEL, str(n.origin_type))}</span>
                    <SourceLink reference={str(n.origin_ref)} url={nstr(n.origin_url)} />
                  </div>
                </TableCell>
                <TableCell>{Number(n.reopen_count ?? 0)}</TableCell>
                <TableCell>{n.due_date ? formatDate(str(n.due_date)) : "SEM DADOS"}</TableCell>
                <TableCell>{when(nstr(n.created_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ----------------------------------------------------------- evidências ----

export async function EvidenceSection({ projectId, db, sp }: SectionProps) {
  const [list, codes] = await Promise.all([
    loadEvidenceList(db, projectId, { classification: sp.classificacao, source: sp.fonte }),
    loadNcrCodes(db, projectId),
  ]);
  return (
    <section className="flex flex-col gap-4" aria-label="Evidências">
      <SectionTitle title="Evidências" helpId="qualidade.evidencias.lista" />
      <p className="text-sm text-muted-foreground">
        Cada evidência aponta para a fonte original, que nunca é alterada. Para cadastrar ou reclassificar, abra a RNC. Classificação: SUSPEITA, INDÍCIO, NC COMPROVADA ou RISCO POTENCIAL; o tipo epistêmico diferencia fato, inferência e recomendação.
      </p>
      <form method="get" action={`/${projectId}/qualidade`} className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 text-card-foreground">
        <input type="hidden" name="aba" value="evidencias" />
        <FilterField name="classificacao" label="Classificação" helpId="qualidade.evidencias.filtro-classificacao">
          <Select id="f-classificacao" name="classificacao" defaultValue={sp.classificacao ?? ""} className={`w-full ${TOUCH}`}>
            <option value="">Todas</option>
            {Object.entries(CLASSIFICATION_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField name="fonte" label="Tipo de fonte" helpId="qualidade.evidencias.filtro-fonte">
          <Select id="f-fonte" name="fonte" defaultValue={sp.fonte ?? ""} className={`w-full ${TOUCH}`}>
            <option value="">Todas</option>
            {Object.entries(ORIGIN_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FilterField>
        <div className="flex items-center gap-1">
          <Button type="submit" className={TOUCH}>
            Filtrar
          </Button>
          <FeatureInfo helpId="qualidade.evidencias.filtro-aplicar" />
        </div>
      </form>
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma evidência encontrada." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.evidencias.col-vinculo">Vinculada a</Th>
              <Th helpId="qualidade.evidencias.col-fonte">Fonte original</Th>
              <Th helpId="qualidade.evidencias.col-classificacao">Classificação</Th>
              <Th helpId="qualidade.evidencias.col-epistemico">Tipo epistêmico</Th>
              <Th helpId="qualidade.evidencias.col-descricao">Descrição</Th>
              <Th helpId="qualidade.evidencias.col-capturada">Capturada em</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((e) => (
              <TableRow key={str(e.id)}>
                <TableCell>
                  {e.ncr_id ? (
                    <RncLink projectId={projectId} id={str(e.ncr_id)} code={codes[str(e.ncr_id)]} />
                  ) : (
                    <span>{e.complaint_id ? "Reclamação" : e.inspection_id ? "Inspeção" : e.test_id ? "Ensaio" : e.warranty_case_id ? "Garantia" : "SEM DADOS"}</span>
                  )}
                </TableCell>
                <TableCell className="min-w-48">
                  <div className="flex flex-col gap-0.5">
                    <span>{label(ORIGIN_LABEL, str(e.source_type))}</span>
                    <SourceLink reference={str(e.source_ref)} url={nstr(e.source_url)} />
                  </div>
                </TableCell>
                <TableCell>
                  <ClassificationBadge classification={str(e.classification)} />
                </TableCell>
                <TableCell>
                  <EpistemicBadge epistemic={str(e.epistemic)} />
                </TableCell>
                <TableCell className="min-w-48">{nstr(e.description) ?? "SEM DADOS"}</TableCell>
                <TableCell>{when(nstr(e.captured_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ---------------------------------------------------- inspeções / ensaios ----

async function ncrAndRequirementOptions(db: QualityDb, projectId: string) {
  const [codes, requirements, ncrs] = await Promise.all([loadNcrCodes(db, projectId), loadRequirements(db, projectId), loadNcrList(db, projectId, {})]);
  return {
    codes,
    requirements: requirements.map((r) => ({ id: str(r.id), code: str(r.code), title: str(r.title) })),
    ncrs: ncrs.map((n) => ({ id: str(n.id), code: str(n.code), title: str(n.title) })),
  };
}

export async function InspectionSection({ projectId, role, db }: SectionProps) {
  const [list, opts] = await Promise.all([loadInspections(db, projectId), ncrAndRequirementOptions(db, projectId)]);
  return (
    <section className="flex flex-col gap-4" aria-label="Inspeções">
      {canRegisterRole(role) ? <InspectionForm projectId={projectId} ncrs={opts.ncrs} requirements={opts.requirements} /> : <ReadOnlyNote />}
      <SectionTitle title="Inspeções" helpId="qualidade.inspecoes.lista" />
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma inspeção registrada." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.inspecoes.col-codigo">Código</Th>
              <Th helpId="qualidade.inspecoes.col-titulo">Título</Th>
              <Th helpId="qualidade.inspecoes.col-resultado">Resultado</Th>
              <Th helpId="qualidade.inspecoes.col-datas">Planejada / realizada</Th>
              <Th helpId="qualidade.inspecoes.col-rnc">RNC</Th>
              <Th helpId="qualidade.inspecoes.col-fonte">Fonte</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((i) => (
              <TableRow key={str(i.id)}>
                <TableCell>{str(i.code)}</TableCell>
                <TableCell className="min-w-48">
                  {str(i.title)}
                  {i.location ? <span className="block text-xs text-muted-foreground">{str(i.location)}</span> : null}
                </TableCell>
                <TableCell>{label(INSPECTION_RESULT_LABEL, str(i.result))}</TableCell>
                <TableCell>
                  {when(nstr(i.planned_at))} / {when(nstr(i.performed_at))}
                </TableCell>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(i.ncr_id)} code={opts.codes[str(i.ncr_id)]} />
                </TableCell>
                <TableCell>
                  <SourceLink reference={nstr(i.source_ref)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

export async function TestSection({ projectId, role, db }: SectionProps) {
  const [list, opts] = await Promise.all([loadTests(db, projectId), ncrAndRequirementOptions(db, projectId)]);
  return (
    <section className="flex flex-col gap-4" aria-label="Ensaios e laudos">
      {canRegisterRole(role) ? <TestForm projectId={projectId} ncrs={opts.ncrs} requirements={opts.requirements} /> : <ReadOnlyNote />}
      <SectionTitle title="Ensaios e laudos" helpId="qualidade.ensaios.lista" />
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhum ensaio registrado." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.ensaios.col-codigo">Código</Th>
              <Th helpId="qualidade.ensaios.col-tipo">Ensaio</Th>
              <Th helpId="qualidade.ensaios.col-resultado">Resultado</Th>
              <Th helpId="qualidade.ensaios.col-laudo">Laudo (fonte)</Th>
              <Th helpId="qualidade.ensaios.col-laboratorio">Laboratório / amostra</Th>
              <Th helpId="qualidade.ensaios.col-rnc">RNC</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((t) => (
              <TableRow key={str(t.id)}>
                <TableCell>{str(t.code)}</TableCell>
                <TableCell className="min-w-40">
                  {str(t.test_type)}
                  <span className="block text-xs text-muted-foreground">{when(nstr(t.performed_at))}</span>
                </TableCell>
                <TableCell>{label(TEST_RESULT_LABEL, str(t.result))}</TableCell>
                <TableCell>
                  <SourceLink reference={nstr(t.report_ref)} url={nstr(t.report_url)} />
                </TableCell>
                <TableCell>
                  {nstr(t.laboratory) ?? "SEM DADOS"}
                  {t.sample_ref ? <span className="block text-xs text-muted-foreground">{str(t.sample_ref)}</span> : null}
                </TableCell>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(t.ncr_id)} code={opts.codes[str(t.ncr_id)]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ---------------------------------------------------------- reclamações ----

export async function ComplaintSection({ projectId, role, db }: SectionProps) {
  const [list, opts] = await Promise.all([loadComplaints(db, projectId), ncrAndRequirementOptions(db, projectId)]);
  return (
    <section className="flex flex-col gap-4" aria-label="Reclamações de clientes">
      {canRegisterRole(role) ? <ComplaintForm projectId={projectId} ncrs={opts.ncrs} /> : <ReadOnlyNote />}
      <SectionTitle title="Reclamações de clientes" helpId="qualidade.reclamacoes.lista" />
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma reclamação registrada." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.reclamacoes.col-codigo">Código</Th>
              <Th helpId="qualidade.reclamacoes.col-canal">Canal</Th>
              <Th helpId="qualidade.reclamacoes.col-assunto">Assunto</Th>
              <Th helpId="qualidade.reclamacoes.col-recebida">Recebida em</Th>
              <Th helpId="qualidade.reclamacoes.col-status">Status</Th>
              <Th helpId="qualidade.reclamacoes.col-fonte">Fonte original</Th>
              <Th helpId="qualidade.reclamacoes.col-rnc">RNC</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((c) => (
              <TableRow key={str(c.id)}>
                <TableCell>{str(c.code)}</TableCell>
                <TableCell>{label(COMPLAINT_CHANNEL_LABEL, str(c.channel))}</TableCell>
                <TableCell className="min-w-48">
                  {str(c.subject)}
                  {c.complainant ? <span className="block text-xs text-muted-foreground">{str(c.complainant)}</span> : null}
                </TableCell>
                <TableCell>{when(nstr(c.received_at))}</TableCell>
                <TableCell>{label(COMPLAINT_STATUS_LABEL, str(c.status))}</TableCell>
                <TableCell>
                  <SourceLink reference={nstr(c.source_ref)} url={nstr(c.source_url)} />
                </TableCell>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(c.ncr_id)} code={opts.codes[str(c.ncr_id)]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ----------------------------------------------------------- requisitos ----

export async function RequirementSection({ projectId, role, db }: SectionProps) {
  const list = await loadRequirements(db, projectId);
  return (
    <section className="flex flex-col gap-4" aria-label="Requisitos técnicos">
      {canRegisterRole(role) ? <RequirementForm projectId={projectId} /> : <ReadOnlyNote />}
      <SectionTitle title="Requisitos técnicos" helpId="qualidade.requisitos.lista" />
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhum requisito técnico registrado." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.requisitos.col-codigo">Código</Th>
              <Th helpId="qualidade.requisitos.col-titulo">Requisito</Th>
              <Th helpId="qualidade.requisitos.col-fonte">Fonte</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={str(r.id)}>
                <TableCell>{str(r.code)}</TableCell>
                <TableCell className="min-w-48">
                  {str(r.title)}
                  {r.description ? <span className="block text-xs text-muted-foreground">{str(r.description)}</span> : null}
                </TableCell>
                <TableCell>
                  <SourceLink reference={str(r.source_ref)} url={nstr(r.source_url)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ----------------------------------------------------------------- CAPA ----

export async function ActionsSection({ projectId, db }: SectionProps) {
  const [list, codes] = await Promise.all([loadActions(db, projectId), loadNcrCodes(db, projectId)]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <section className="flex flex-col gap-4" aria-label="Ações corretivas e preventivas">
      <SectionTitle title="Ações corretivas e preventivas (CAPA)" helpId="qualidade.capa.lista" />
      <p className="text-sm text-muted-foreground">Ações são cadastradas e atualizadas dentro da RNC. Ação executada não equivale a RNC conforme: o encerramento exige a verificação de eficácia.</p>
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma ação registrada." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.capa.col-rnc">RNC</Th>
              <Th helpId="qualidade.capa.col-tipo">Tipo</Th>
              <Th helpId="qualidade.capa.col-descricao">Ação</Th>
              <Th helpId="qualidade.capa.col-prazo">Prazo</Th>
              <Th helpId="qualidade.capa.col-status">Status</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((a) => {
              const overdue = a.due_date && str(a.due_date) < today && (a.status === "PLANEJADA" || a.status === "EM_ANDAMENTO");
              return (
                <TableRow key={str(a.id)}>
                  <TableCell>
                    <RncLink projectId={projectId} id={nstr(a.ncr_id)} code={codes[str(a.ncr_id)]} />
                  </TableCell>
                  <TableCell>{label(ACTION_KIND_LABEL, str(a.kind))}</TableCell>
                  <TableCell className="min-w-48">{str(a.description)}</TableCell>
                  <TableCell>
                    {a.due_date ? formatDate(str(a.due_date)) : "SEM DADOS"}
                    {overdue ? <span className="block text-xs font-semibold text-destructive">VENCIDA</span> : null}
                  </TableCell>
                  <TableCell>{label(ACTION_STATUS_LABEL, str(a.status))}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// -------------------------------------------------------------- eficácia ----

export async function EffectivenessSection({ projectId, db }: SectionProps) {
  const [list, codes] = await Promise.all([loadVerifications(db, projectId), loadNcrCodes(db, projectId)]);
  return (
    <section className="flex flex-col gap-4" aria-label="Verificação de eficácia">
      <SectionTitle title="Verificações de eficácia" helpId="qualidade.eficacia.lista" />
      <p className="text-sm text-muted-foreground">As verificações são append-only e feitas dentro da RNC por perfil de gestão. A mais recente de cada RNC vale; nova correção ou reabertura invalida as anteriores.</p>
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma verificação de eficácia registrada." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.eficacia.col-rnc">RNC</Th>
              <Th helpId="qualidade.eficacia.col-resultado">Resultado</Th>
              <Th helpId="qualidade.eficacia.col-criterio">Critério</Th>
              <Th helpId="qualidade.eficacia.col-data">Verificada em</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((v) => (
              <TableRow key={str(v.id)}>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(v.ncr_id)} code={codes[str(v.ncr_id)]} />
                </TableCell>
                <TableCell>{label(VERIFICATION_RESULT_LABEL, str(v.result))}</TableCell>
                <TableCell className="min-w-48">{str(v.criteria)}</TableCell>
                <TableCell>{when(nstr(v.verified_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ---------------------------------------------------------- recorrências ----

export async function RecurrenceSection({ projectId, db }: SectionProps) {
  const [list, codes] = await Promise.all([loadRecurrences(db, projectId), loadNcrCodes(db, projectId)]);
  return (
    <section className="flex flex-col gap-4" aria-label="Recorrências">
      <SectionTitle title="Recorrências" helpId="qualidade.recorrencias.lista" />
      <p className="text-sm text-muted-foreground">Recorrências são registradas dentro da RNC, com fundamento. Aqui aparecem as relações do projeto.</p>
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhuma recorrência registrada." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.recorrencias.col-rnc">RNC</Th>
              <Th helpId="qualidade.recorrencias.col-relacionada">Relacionada a</Th>
              <Th helpId="qualidade.recorrencias.col-fundamento">Fundamento</Th>
              <Th helpId="qualidade.recorrencias.col-detectada">Detectada em</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((r) => (
              <TableRow key={str(r.id)}>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(r.ncr_id)} code={codes[str(r.ncr_id)]} />
                </TableCell>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(r.related_ncr_id)} code={codes[str(r.related_ncr_id)]} />
                </TableCell>
                <TableCell className="min-w-48">{str(r.basis)}</TableCell>
                <TableCell>{when(nstr(r.detected_at))}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// ---------------------------------------------------------------- custos ----

export async function CostSection({ projectId, db }: SectionProps) {
  const [list, codes] = await Promise.all([loadCosts(db, projectId), loadNcrCodes(db, projectId)]);
  const totals = sumCosts(list as unknown as Array<{ category: string; estimated_amount: number | null; actual_amount: number | null; currency: string; source_ref: string | null }>);
  return (
    <section className="flex flex-col gap-4" aria-label="Custos de não qualidade">
      <SectionTitle title="Custos de não qualidade" helpId="qualidade.custos.lista" />
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          title="Total realizado (com fonte)"
          helpId="qualidade.custos.kpi-realizado"
          kpi={totals.actual === null ? { value: null, display: "SEM DADOS", detail: totals.mixedCurrency ? "Moedas diferentes: sem soma." : "Nenhum valor realizado com fonte." } : { value: totals.actual, display: formatMoney(totals.actual, totals.currency ?? "BRL"), detail: `${totals.rowsWithValue} registro(s) com valor e fonte` }}
        />
        <KpiCard
          title="Total estimado (com fonte)"
          helpId="qualidade.custos.kpi-estimado"
          kpi={totals.estimated === null ? { value: null, display: "SEM DADOS", detail: totals.mixedCurrency ? "Moedas diferentes: sem soma." : "Nenhum valor estimado com fonte." } : { value: totals.estimated, display: formatMoney(totals.estimated, totals.currency ?? "BRL"), detail: "Estimado e realizado nunca são somados entre si" }}
        />
      </div>
      {list.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhum custo de não qualidade registrado." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.custos.col-rnc">RNC</Th>
              <Th helpId="qualidade.custos.col-categoria">Categoria</Th>
              <Th helpId="qualidade.custos.col-estimado">Estimado</Th>
              <Th helpId="qualidade.custos.col-real">Realizado</Th>
              <Th helpId="qualidade.custos.col-fonte">Fonte do valor</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.map((c) => (
              <TableRow key={str(c.id)}>
                <TableCell>
                  <RncLink projectId={projectId} id={nstr(c.ncr_id)} code={codes[str(c.ncr_id)]} />
                </TableCell>
                <TableCell>{label(COST_CATEGORY_LABEL, str(c.category))}</TableCell>
                <TableCell>{formatMoney(c.estimated_amount as number | null, str(c.currency) || "BRL")}</TableCell>
                <TableCell>{formatMoney(c.actual_amount as number | null, str(c.currency) || "BRL")}</TableCell>
                <TableCell>
                  <SourceLink reference={nstr(c.source_ref)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Truncated count={list.length} />
    </section>
  );
}

// -------------------------------------------------------------- auditoria ----

export async function AuditSection({ projectId, db }: SectionProps) {
  const [events, audits, users, codes] = await Promise.all([loadStateEvents(db, projectId), loadAuditLog(db, projectId), getUsers().catch(() => []), loadNcrCodes(db, projectId)]);
  const names = new Map(users.map((u) => [u.id, u.name] as const));
  // Garantias/assistência técnica pertencem a outro módulo: aqui só a Qualidade (RNC e registros).
  const ncrEvents = events.filter((e) => e.entity_type === "NCR");
  const audit = audits.filter((a) => !/WARRANTY/i.test(`${a.entity_type} ${a.action}`));
  const timeline = buildTimeline(
    ncrEvents.map((e) => ({ ...(e as unknown as StateEventRow), seq: Number(e.seq) })),
    audit as unknown as AuditRow[],
  );
  const byEntity = new Map(ncrEvents.map((e) => [Number(e.seq), str(e.entity_id)] as const));
  return (
    <section className="flex flex-col gap-4" aria-label="Auditoria da Qualidade">
      <SectionTitle title="Linha do tempo de auditoria" helpId="qualidade.auditoria.linha-do-tempo" />
      <p className="text-sm text-muted-foreground">Eventos de estado das RNC e registros de auditoria do módulo. São somente leitura (append-only): nada aqui pode ser editado ou apagado.</p>
      {timeline.length === 0 ? (
        <EmptyState message="SEM DADOS: nenhum evento registrado." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <Th helpId="qualidade.auditoria.col-quando">Quando</Th>
              <Th helpId="qualidade.auditoria.col-tipo">Tipo</Th>
              <Th helpId="qualidade.auditoria.col-evento">Evento</Th>
              <Th helpId="qualidade.auditoria.col-ator">Quem</Th>
              <Th helpId="qualidade.auditoria.col-justificativa">Justificativa</Th>
            </TableRow>
          </TableHeader>
          <TableBody>
            {timeline.slice(0, 300).map((t, i) => {
              const entityId = t.seq !== undefined ? byEntity.get(t.seq) : undefined;
              return (
                <TableRow key={`${t.kind}-${t.at}-${i}`}>
                  <TableCell className="whitespace-nowrap">{when(t.at)}</TableCell>
                  <TableCell>{t.kind === "STATE" ? "Estado" : "Auditoria"}</TableCell>
                  <TableCell className="min-w-48">
                    {entityId ? <RncLink projectId={projectId} id={entityId} code={codes[entityId]} /> : null} {t.title}
                  </TableCell>
                  <TableCell>{t.actor ? (names.get(t.actor) ?? (t.actor === "Sistema" ? "Sistema" : "Usuário não disponível")) : "SEM DADOS"}</TableCell>
                  <TableCell className="min-w-48">{t.detail ?? "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
