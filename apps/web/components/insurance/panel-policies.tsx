"use client";

import { useState } from "react";
import { HelpHint } from "@/components/shared/help-hint";
import { SELECT_CLASS } from "@/components/ui/select";
import { ActionButton, Callout, DataTable, NoData, Section, SourceLink, SpecForm, StatusBadge, buildOptionSets, useWorkspace, type Column } from "@/components/insurance/kit";
import { FORMS } from "@/lib/insurance-ui/forms";
import { formatDate, formatDateTime, formatMoney, textOrNoData } from "@/lib/insurance-ui/format";
import { CLAUSE_KIND_LABEL, MODALITY_LABEL, PARTY_ROLE_LABEL, POLICY_STATUS_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { policyStatusAlert, policyTitle, policyValidity, snapshotSummary } from "@/lib/insurance-ui/model";
import type { ClauseRow, PartyRow, PolicyRow, PolicyVersionRow } from "@/lib/insurance-ui/types";

const VALIDITY_TEXT = { SEM_DADOS: "SEM DADOS", A_INICIAR: "A iniciar", EM_VIGENCIA: "Em vigência", ENCERRADA: "Encerrada" } as const;

export function PoliciesPanel() {
  const { data, caps, today, target } = useWorkspace();
  const options = buildOptionSets(data);
  const [status, setStatus] = useState("");
  const [modality, setModality] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(target.policyId ?? null);
  const [showNew, setShowNew] = useState(false);

  const rows = data.policies.filter((p) => (!status || p.status === status) && (!modality || p.modality === modality));
  const selected = data.policies.find((p) => p.id === selectedId) ?? null;

  const columns: Column<PolicyRow>[] = [
    { key: "num", label: "Apólice", render: (p) => textOrNoData(p.policy_number) },
    { key: "mod", label: "Modalidade", render: (p) => labelOf(MODALITY_LABEL, p.modality) },
    { key: "ins", label: "Seguradora", render: (p) => p.insurer_name },
    { key: "vig", label: "Vigência", render: (p) => `${formatDate(p.coverage_start)} a ${formatDate(p.coverage_end)} — ${VALIDITY_TEXT[policyValidity(p, today)]}` },
    { key: "max", label: "Limite máximo", render: (p) => formatMoney(p.max_amount, p.currency) },
    { key: "st", label: "Situação", helpId: "seguros.status.apolice", render: (p) => <StatusBadge text={labelOf(POLICY_STATUS_LABEL, p.status)} variant={p.status === "VIGENTE" ? "success" : p.status === "RASCUNHO" ? "secondary" : "warning"} /> },
    { key: "ver", label: "Versão", render: (p) => `v${p.version_no}` },
    { key: "src", label: "Fonte", render: (p) => <SourceLink documentId={p.source_document_id} sourceRef={p.source_ref} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info">
        Seguro (apólice) é um instrumento DIFERENTE de fiança bancária, caução e carta de fiança: estas ficam na aba “Fianças e garantias”, com fluxo próprio.
      </Callout>
      <Section
        title="Apólices"
        helpId="seguros.apolices.tabela"
        actions={<ActionButton label={showNew ? "Fechar formulário" : "Nova apólice"} helpId="seguros.acoes.apolice-nova" level="MANAGE" variant="outline" onClick={() => setShowNew((v) => !v)} />}
      >
        <div className="mb-3 flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="seg-f-status">Situação</label>
              <HelpHint helpId="seguros.apolices.filtro-status" />
            </span>
            {/* help-exempt: filtro cujo ícone de ajuda (seguros.apolices.filtro-status) é renderizado ao lado do rótulo logo acima */}
            <select id="seg-f-status" className={`${SELECT_CLASS} min-h-11`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(POLICY_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="seg-f-mod">Modalidade</label>
              <HelpHint helpId="seguros.apolices.filtro-modalidade" />
            </span>
            {/* help-exempt: filtro cujo ícone de ajuda (seguros.apolices.filtro-modalidade) é renderizado ao lado do rótulo logo acima */}
            <select id="seg-f-mod" className={`${SELECT_CLASS} min-h-11`} value={modality} onChange={(e) => setModality(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(MODALITY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </div>
        </div>
        <DataTable columns={columns} rows={rows} selectedId={selectedId} onSelect={(p) => setSelectedId(p.id)} empty="SEM DADOS: nenhuma apólice cadastrada (ou nenhuma corresponde ao filtro)." caption="Apólices do projeto" />
        {showNew ? (
          <div className="mt-3">
            <SpecForm spec={FORMS.policyCreate} options={options} level="MANAGE" okMessage="Apólice registrada (versão 1)." onCancel={() => setShowNew(false)} onDone={() => setShowNew(false)} toInput={(b) => ({ op: "policy_create", data: b.data })} />
          </div>
        ) : null}
      </Section>
      {selected ? <PolicyDetail policy={selected} /> : <p className="text-sm text-muted-foreground">Selecione uma apólice na tabela para ver partes, cláusulas e versões.</p>}
      {!caps.manage ? <Callout tone="warn">Seu perfil só consulta apólices. Cadastrar e alterar exige Administrador, Gestor ou Gerente.</Callout> : null}
    </div>
  );
}

function PolicyDetail({ policy }: { policy: PolicyRow }) {
  const { data, today } = useWorkspace();
  const options = buildOptionSets(data);
  const [showVersion, setShowVersion] = useState(false);
  const [showParty, setShowParty] = useState(false);
  const [showClause, setShowClause] = useState(false);
  const [toggle, setToggle] = useState<PartyRow | null>(null);
  const alert = policyStatusAlert(policy, today);
  const parties = data.parties.filter((p) => p.policy_id === policy.id);
  const clauses = data.clauses.filter((c) => c.policy_id === policy.id);
  const versions = data.versions.filter((v) => v.policy_id === policy.id).sort((a, b) => b.version_no - a.version_no);

  const initial: Record<string, string> = {
    insurer_name: policy.insurer_name,
    policy_number: policy.policy_number ?? "",
    broker_name: policy.broker_name ?? "",
    status: policy.status,
    coverage_start: policy.coverage_start ?? "",
    coverage_end: policy.coverage_end ?? "",
    max_amount: policy.max_amount === null ? "" : String(policy.max_amount),
    contract_number: policy.contract_number ?? "",
    contract_document_id: policy.contract_document_id ?? "",
    source_document_id: policy.source_document_id ?? "",
    source_ref: policy.source_ref ?? "",
    notes: policy.notes ?? "",
  };

  const partyCols: Column<PartyRow>[] = [
    { key: "role", label: "Papel", render: (p) => labelOf(PARTY_ROLE_LABEL, p.party_role) },
    { key: "name", label: "Nome", render: (p) => (p.identification_status === "NAO_IDENTIFICADO" ? <StatusBadge text="NÃO IDENTIFICADA" variant="warning" /> : textOrNoData(p.party_name)) },
    { key: "tax", label: "CNPJ / CPF", render: (p) => textOrNoData(p.tax_id) },
    { key: "act", label: "Ativa", render: (p) => (p.active ? "Sim" : "Não (desativada)") },
    { key: "ver", label: "Desde", render: (p) => `v${p.added_in_version}` },
    { key: "src", label: "Fonte", render: (p) => <SourceLink documentId={p.source_document_id} sourceRef={p.source_ref} /> },
    { key: "do", label: "Ação", render: (p) => <ActionButton label={p.active ? "Desativar" : "Reativar"} helpId="seguros.acoes.parte-ativar" level="MANAGE" variant="outline" onClick={() => setToggle(p)} /> },
  ];
  const clauseCols: Column<ClauseRow>[] = [
    { key: "kind", label: "Tipo", render: (c) => labelOf(CLAUSE_KIND_LABEL, c.kind) },
    { key: "title", label: "Título", render: (c) => c.title },
    { key: "applies", label: "Aplica-se a", render: (c) => (c.applies_to?.length ? c.applies_to.join(", ") : "não declarado") },
    { key: "amount", label: "Valor", render: (c) => formatMoney(c.amount) },
    { key: "days", label: "Prazo (dias)", render: (c) => (c.deadline_days === null ? "SEM DADOS" : String(c.deadline_days)) },
    { key: "ver", label: "Conferida", render: (c) => (c.verified ? <StatusBadge text="Conferida" variant="success" /> : <StatusBadge text="Não conferida" variant="warning" />) },
    { key: "src", label: "Fonte", render: (c) => <SourceLink documentId={c.source_document_id} sourceRef={[c.source_ref, c.source_page ? `p. ${c.source_page}` : null].filter(Boolean).join(" ")} /> },
  ];
  const versionCols: Column<PolicyVersionRow>[] = [
    { key: "n", label: "Versão", render: (v) => `v${v.version_no}` },
    { key: "at", label: "Em", render: (v) => formatDateTime(v.created_at) },
    { key: "by", label: "Por", render: (v) => (v.created_by ? data.actors[v.created_by] ?? v.created_by.slice(0, 8) : "SEM DADOS") },
    { key: "why", label: "Motivo", render: (v) => textOrNoData(v.change_reason) },
    {
      key: "snap",
      label: "Fotografia da versão",
      render: (v) => {
        const s = snapshotSummary(v.snapshot);
        return `${s.status ?? "?"}; vigência ${s.coverage ?? "SEM DADOS"}; ${s.parties ?? "?"} parte(s); ${s.clauses ?? "?"} cláusula(s)`;
      },
    },
  ];

  return (
    <Section title={`Apólice: ${policyTitle(policy)}`} helpId="seguros.apolices.detalhe" actions={<ActionButton label={showVersion ? "Fechar" : "Nova versão"} helpId="seguros.acoes.apolice-nova-versao-abrir" level="MANAGE" variant="outline" onClick={() => setShowVersion((v) => !v)} />}>
      {alert ? <div className="mb-3"><Callout tone="warn">{alert}</Callout></div> : null}
      <dl className="mb-4 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <Item k="Contrato-base" v={policy.contract_number ? <span>{policy.contract_number} · <SourceLink documentId={policy.contract_document_id} /></span> : <NoData />} />
        <Item k="Corretora" v={textOrNoData(policy.broker_name)} />
        <Item k="Atualizada em" v={formatDateTime(policy.updated_at)} />
        <Item k="Observações" v={textOrNoData(policy.notes)} />
      </dl>
      {showVersion ? (
        <div className="mb-4">
          <SpecForm spec={FORMS.policyNewVersion} options={options} initial={initial} level="MANAGE" okMessage="Nova versão gravada; a versão anterior permanece no histórico." onCancel={() => setShowVersion(false)} onDone={() => setShowVersion(false)} hideFields={[]} toInput={(b) => ({ op: "policy_new_version", id: policy.id, expectedRowVersion: policy.row_version, data: b.data, args: b.args })} />
        </div>
      ) : null}

      <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">Partes (segurado, tomador, beneficiário...)<HelpHint helpId="seguros.apolices.tabela-partes" /></h3>
      <DataTable columns={partyCols} rows={parties} empty="SEM DADOS: nenhuma parte cadastrada nesta apólice." caption="Partes da apólice" />
      <div className="my-2"><ActionButton label={showParty ? "Fechar" : "Adicionar parte"} helpId="seguros.acoes.parte-abrir" level="MANAGE" variant="outline" onClick={() => setShowParty((v) => !v)} /></div>
      {showParty ? <SpecForm spec={FORMS.partyAdd} options={options} level="MANAGE" okMessage="Parte adicionada (gera nova versão da apólice)." onCancel={() => setShowParty(false)} onDone={() => setShowParty(false)} toInput={(b) => ({ op: "party_add", id: policy.id, expectedRowVersion: policy.row_version, data: b.data })} /> : null}
      {toggle ? (
        <div className="my-2">
          <SpecForm spec={FORMS.partyToggle} level="MANAGE" okMessage="Parte atualizada (gera nova versão da apólice)." onCancel={() => setToggle(null)} onDone={() => setToggle(null)} toInput={(b) => ({ op: "party_set_active", id: toggle.id, expectedRowVersion: policy.row_version, args: { active: !toggle.active, reason: b.args.reason } })} />
        </div>
      ) : null}

      <h3 className="mb-2 mt-5 flex items-center gap-1 text-sm font-semibold">Cláusulas, condições, exclusões e prazos<HelpHint helpId="seguros.apolices.tabela-clausulas" /></h3>
      <DataTable columns={clauseCols} rows={clauses} empty="SEM DADOS: nenhuma cláusula cadastrada. Sem cláusula com fonte, a cobertura não pode ser avaliada." caption="Cláusulas da apólice" />
      <div className="my-2"><ActionButton label={showClause ? "Fechar" : "Adicionar cláusula"} helpId="seguros.acoes.clausula-abrir" level="MANAGE" variant="outline" onClick={() => setShowClause((v) => !v)} /></div>
      {showClause ? <SpecForm spec={FORMS.clauseAdd} options={options} level="MANAGE" okMessage="Cláusula adicionada (gera nova versão da apólice)." onCancel={() => setShowClause(false)} onDone={() => setShowClause(false)} toInput={(b) => ({ op: "clause_add", id: policy.id, expectedRowVersion: policy.row_version, data: b.data })} /> : null}

      <h3 className="mb-2 mt-5 flex items-center gap-1 text-sm font-semibold">Histórico de versões<HelpHint helpId="seguros.apolices.tabela-versoes" /></h3>
      <DataTable columns={versionCols} rows={versions} empty="SEM DADOS: sem versões registradas." caption="Versões da apólice" />
    </Section>
  );
}

function Item({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{k}:</dt>
      <dd>{v}</dd>
    </div>
  );
}
