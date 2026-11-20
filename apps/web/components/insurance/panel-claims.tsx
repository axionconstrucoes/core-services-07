"use client";

import { useState } from "react";
import { HelpHint } from "@/components/shared/help-hint";
import { SELECT_CLASS } from "@/components/ui/select";
import { ActionButton, Callout, DataTable, NoData, RunnerFeedback, Section, SourceLink, SpecForm, StatusBadge, buildOptionSets, useInsuranceRunner, useWorkspace, type Column } from "@/components/insurance/kit";
import { FORMS, deriveClaimInstrument, validateClaimOpen, validateDossierItem } from "@/lib/insurance-ui/forms";
import { formatDate, formatDateTime, formatMoney, textOrNoData } from "@/lib/insurance-ui/format";
import { CLAIM_KIND_LABEL, CLAIM_STAGE_LABEL, COVERAGE_CONCLUSION_LABEL, DOSSIER_STATUS_LABEL, EPISTEMIC_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { claimCoverageView, claimInstrument, claimNextStages, claimNotice, dossierForPolicy } from "@/lib/insurance-ui/model";
import { buildDossierChecklist } from "@/lib/insurance/index";
import type { ClaimRow, DossierItemRow, PolicyRow } from "@/lib/insurance-ui/types";

/* ------------------------------------------------------------------ sinistros ------------------------------------------------------------------ */

export function ClaimsPanel() {
  const { data, nowIso, target, goTo } = useWorkspace();
  const now = new Date(nowIso);
  const options = buildOptionSets(data);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(target.claimId ?? null);
  const [showNew, setShowNew] = useState(false);
  const rows = data.claims.filter((c) => !filter || c.stage === filter);
  const selected = data.claims.find((c) => c.id === selectedId) ?? null;

  const cols: Column<ClaimRow>[] = [
    { key: "title", label: "Evento", render: (c) => c.title },
    { key: "kind", label: "Tipo", render: (c) => labelOf(CLAIM_KIND_LABEL, c.claim_kind) },
    { key: "stage", label: "Estágio", helpId: "seguros.status.estagio-sinistro", render: (c) => <StatusBadge text={labelOf(CLAIM_STAGE_LABEL, c.stage)} variant={c.stage === "NEGATIVA" || c.stage === "CONTESTACAO" ? "destructive" : c.stage === "ENCERRADO" ? "secondary" : "info"} /> },
    { key: "ins", label: "Instrumento", render: (c) => { const i = claimInstrument(c, data); return i.kind === "SEM_INSTRUMENTO" ? <StatusBadge text="SEM INSTRUMENTO" variant="warning" /> : i.label; } },
    { key: "prot", label: "Protocolo", render: (c) => textOrNoData(c.protocol) },
    { key: "occ", label: "Ocorrência", render: (c) => formatDate(c.occurrence_date) },
    { key: "amt", label: "Valor reclamado", render: (c) => formatMoney(c.claimed_amount) },
    { key: "notice", label: "Prazo de aviso", render: (c) => { const n = claimNotice(c, now); return n.status === "SEM_DADOS" ? <NoData text="SEM DADOS (prazo não cadastrado)" /> : n.status === "VENCIDO" ? <StatusBadge text="VENCIDO" variant="destructive" /> : `no prazo (${n.daysRemaining} dia(s))`; } },
    { key: "src", label: "Fonte", render: (c) => <SourceLink documentId={c.source_document_id} sourceRef={c.source_ref} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info">Sinistros e eventos seguem a máquina de estados do banco; nenhum prazo legal ou contratual é presumido — só o prazo de aviso cadastrado com sua base.</Callout>
      <Section title="Sinistros e eventos" helpId="seguros.sinistros.tabela" actions={<ActionButton label={showNew ? "Fechar formulário" : "Abrir sinistro ou evento"} helpId="seguros.acoes.sinistro-novo" level="REGISTER" variant="outline" onClick={() => setShowNew((v) => !v)} />}>
        <div className="mb-3 flex flex-col gap-1 sm:w-72">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-c-f">Estágio</label><HelpHint helpId="seguros.sinistros.filtro-estagio" /></span>
          {/* help-exempt: filtro cujo ícone de ajuda (seguros.sinistros.filtro-estagio) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-c-f" className={`${SELECT_CLASS} min-h-11`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(CLAIM_STAGE_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
        </div>
        <DataTable columns={cols} rows={rows} selectedId={selectedId} onSelect={(c) => setSelectedId(c.id)} empty="SEM DADOS: nenhum sinistro ou evento registrado." caption="Sinistros e eventos" />
        {showNew ? (
          <div className="mt-3">
            <SpecForm spec={FORMS.claimOpen} options={options} level="REGISTER" extraValidate={validateClaimOpen} okMessage="Evento aberto." onCancel={() => setShowNew(false)} onDone={() => setShowNew(false)}
              toInput={(b) => ({ op: "claim_open", data: { ...b.data, ...deriveClaimInstrument(String(b.args.instrument ?? "")) } })} />
          </div>
        ) : null}
      </Section>
      {selected ? <ClaimDetail claim={selected} goTo={goTo} /> : null}
    </div>
  );
}

function ClaimDetail({ claim, goTo }: { claim: ClaimRow; goTo: (tab: string, t?: { claimId?: string }) => void }) {
  const { data, nowIso } = useWorkspace();
  const now = new Date(nowIso);
  const [toStage, setToStage] = useState<string | null>(null);
  const instrument = claimInstrument(claim, data);
  const cov = claimCoverageView(claim, data, now);
  const steps = data.claimSteps.filter((s) => s.claim_id === claim.id);
  const next = claimNextStages(claim);
  const basisClause = claim.contractual_basis_clause_id ? data.clauses.find((c) => c.id === claim.contractual_basis_clause_id) : undefined;
  return (
    <Section title={`Evento: ${claim.title}`} helpId="seguros.sinistros.detalhe">
      <dl className="mb-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-muted-foreground">Instrumento: </dt><dd className="inline">{instrument.label}</dd></div>
        {claim.decision_outcome ? <div><dt className="inline text-muted-foreground">Decisão: </dt><dd className="inline">{claim.decision_outcome}</dd></div> : null}
        {instrument.kind === "SEM_INSTRUMENTO" ? <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Motivo da ausência do instrumento: </dt><dd className="inline">{textOrNoData(claim.no_instrument_reason)}</dd></div> : null}
        {claim.stage === "EXPECTATIVA" || claim.contractual_basis_note || basisClause ? <div className="sm:col-span-2"><dt className="inline text-muted-foreground">Base contratual da expectativa: </dt><dd className="inline">{basisClause ? `cláusula “${basisClause.title}”` : textOrNoData(claim.contractual_basis_note)}</dd></div> : null}
        <div><dt className="inline text-muted-foreground">Base do prazo de aviso: </dt><dd className="inline">{textOrNoData(claim.notice_deadline_basis)}</dd></div>
      </dl>

      <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">Linha do tempo (trilha imutável)<HelpHint helpId="seguros.sinistros.tabela-etapas" /></h3>
      <DataTable
        columns={[
          { key: "at", label: "Quando", render: (s: (typeof steps)[number]) => formatDateTime(s.occurred_at) },
          { key: "from", label: "De", render: (s) => (s.from_stage ? labelOf(CLAIM_STAGE_LABEL, s.from_stage) : "abertura") },
          { key: "to", label: "Para", render: (s) => labelOf(CLAIM_STAGE_LABEL, s.stage) },
          { key: "prot", label: "Protocolo", render: (s) => textOrNoData(s.protocol) },
          { key: "note", label: "Nota", render: (s) => textOrNoData(s.note) },
          { key: "doc", label: "Documento", render: (s) => <SourceLink documentId={s.document_id} /> },
          { key: "by", label: "Por", render: (s) => (s.created_by ? data.actors[s.created_by] ?? s.created_by.slice(0, 8) : "SEM DADOS") },
        ]}
        rows={steps}
        empty="SEM DADOS: sem etapas registradas."
        caption="Etapas do evento"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {next.map((st) => (
          <ActionButton key={st} label={`Avançar para: ${CLAIM_STAGE_LABEL[st]}`} helpId="seguros.acoes.sinistro-avancar-abrir" level="REGISTER" variant="outline" onClick={() => setToStage(st)} />
        ))}
        {next.length === 0 ? <span className="text-sm text-muted-foreground">Evento encerrado: sem novas etapas.</span> : null}
        <ActionButton label="Preparar acionamento" helpId="seguros.acoes.acionamento-preparar" level="REGISTER" onClick={() => goTo("minutas", { claimId: claim.id })} />
      </div>
      {toStage ? (
        <div className="mt-3">
          <SpecForm spec={{ ...FORMS.claimAdvance, title: `Avançar para: ${CLAIM_STAGE_LABEL[toStage]}` }} options={buildOptionSets(data)} level="REGISTER" okMessage="Etapa registrada." onCancel={() => setToStage(null)} onDone={() => setToStage(null)}
            hideFields={toStage === "DECISAO" ? [] : ["decision_outcome"]}
            toInput={(b) => ({ op: "claim_advance", id: claim.id, expectedRowVersion: claim.row_version, data: b.data, args: { toStage } })} />
        </div>
      ) : null}

      <h3 className="mb-2 mt-5 flex items-center gap-1 text-sm font-semibold">Avaliação de cobertura (INFERÊNCIA — nunca automática)<HelpHint helpId="seguros.sinistros.cobertura" /></h3>
      {cov.assessment ? (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge text={labelOf(COVERAGE_CONCLUSION_LABEL, cov.assessment.conclusion)} variant={cov.assessment.conclusion === "POTENCIALMENTE_COBERTO" ? "success" : cov.assessment.conclusion === "NAO_COBERTO" ? "destructive" : "warning"} helpId="seguros.status.conclusao-cobertura" />
            <span>Conclusão derivada de regras determinísticas sobre as cláusulas cadastradas com fonte. Exige revisão humana (jurídico/seguros) antes de qualquer posição ou comunicação.</span>
          </p>
          <ul className="flex flex-col gap-1">
            {cov.assessment.reasons.map((r, i) => (
              <li key={`${r.code}-${i}`} className="flex flex-wrap items-baseline gap-2"><StatusBadge text={labelOf(EPISTEMIC_LABEL, r.epistemic)} variant="outline" helpId="seguros.status.epistemico" /><span>{r.text}</span></li>
            ))}
          </ul>
          {cov.assessment.missing.length ? <p className="mt-2"><strong>Dados faltantes:</strong> {cov.assessment.missing.join(", ")}</p> : null}
          <ul className="mt-2 flex flex-col gap-1">
            {cov.assessment.recommendations.map((r, i) => (<li key={i} className="flex flex-wrap items-baseline gap-2"><StatusBadge text={EPISTEMIC_LABEL.RECOMENDACAO} variant="outline" /><span>{r}</span></li>))}
          </ul>
        </div>
      ) : (
        <Callout tone="warn">{cov.notApplicableReason}</Callout>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------- dossiês -------------------------------------------------------------------- */

export function DossierPanel() {
  const { data, target } = useWorkspace();
  const options = buildOptionSets(data);
  const [policyId, setPolicyId] = useState<string>(target.policyId ?? data.policies[0]?.id ?? "");
  const policy = data.policies.find((p) => p.id === policyId) ?? null;
  const [edit, setEdit] = useState<DossierItemRow | null>(null);
  const view = policy ? dossierForPolicy(policy, data.dossierItems) : null;
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info">O checklist é um ROTEIRO OPERACIONAL de documentos a reunir por modalidade; não afirma exigência legal nem contratual — a exigência real vem do texto da apólice.</Callout>
      <Section title="Dossiê por apólice" helpId="seguros.dossies.painel">
        <div className="mb-3 flex flex-col gap-1 sm:w-96">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-d-pol">Apólice</label><HelpHint helpId="seguros.dossies.seletor-apolice" /></span>
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.dossies.seletor-apolice) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-d-pol" className={`${SELECT_CLASS} min-h-11`} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
            {data.policies.length === 0 ? <option value="">SEM DADOS: nenhuma apólice</option> : null}
            {options.policies?.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </div>
        {policy && view ? (
          <>
            <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge text={view.progress.complete ? "Dossiê completo" : view.items.length ? `${view.progress.requiredPending.length} obrigatório(s) pendente(s)` : "Checklist ainda não gerado"} variant={view.progress.complete ? "success" : "warning"} helpId="seguros.status.dossie-progresso" />
              <span className="text-muted-foreground">{view.items.length} item(ns) no checklist desta apólice</span>
            </p>
            {view.missingFromTemplate.length ? <GenerateChecklist policyId={policy.id} modality={policy.modality} count={view.missingFromTemplate.length} hasItems={view.items.length > 0} /> : null}
            <DataTable
              columns={[
                { key: "label", label: "Item", render: (i: DossierItemRow) => i.label },
                { key: "req", label: "Obrigatório", render: (i) => (i.required ? "Sim" : "Não") },
                { key: "st", label: "Situação", helpId: "seguros.status.dossie-item", render: (i) => <StatusBadge text={labelOf(DOSSIER_STATUS_LABEL, i.status)} variant={i.status === "ANEXADO" ? "success" : i.status === "PENDENTE" ? "warning" : "secondary"} /> },
                { key: "doc", label: "Documento", render: (i) => <SourceLink documentId={i.document_id} /> },
                { key: "note", label: "Nota", render: (i) => textOrNoData(i.note) },
                { key: "do", label: "Ação", render: (i) => <ActionButton label="Atualizar" helpId="seguros.acoes.dossie-item-abrir" level="REGISTER" variant="outline" onClick={() => setEdit(i)} /> },
              ]}
              rows={view.items}
              empty="SEM DADOS: gere o checklist desta apólice."
              caption="Itens do dossiê"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">SEM DADOS: cadastre uma apólice para montar o dossiê.</p>
        )}
        {edit ? (
          <div className="mt-3">
            <SpecForm spec={FORMS.dossierItem} options={options} initial={{ status: edit.status, document_id: edit.document_id ?? "", note: edit.note ?? "" }} level="REGISTER" extraValidate={validateDossierItem} okMessage="Item do dossiê atualizado." onCancel={() => setEdit(null)} onDone={() => setEdit(null)}
              toInput={(b) => ({ op: "dossier_item_set", id: edit.id, expectedRowVersion: edit.row_version, args: { status: b.args.status, documentId: b.args.document_id, note: b.args.note } })} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}

function GenerateChecklist({ policyId, modality, count, hasItems }: { policyId: string; modality: PolicyRow["modality"]; count: number; hasItems: boolean }) {
  const runner = useInsuranceRunner();
  const items = buildDossierChecklist(modality).map((i) => ({ key: i.key, label: i.label, required: i.required }));
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton label={`Gerar ${hasItems ? "itens faltantes" : "checklist"} (${count})`} helpId="seguros.acoes.dossie-gerar" level="MANAGE" pending={runner.pending} onClick={() => void runner.run({ op: "dossier_sync", id: policyId, args: { items } }, "Checklist gerado a partir do roteiro da modalidade.")} />
      </div>
      <RunnerFeedback runner={runner} />
    </div>
  );
}
