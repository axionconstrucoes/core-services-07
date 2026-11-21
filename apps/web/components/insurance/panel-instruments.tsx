"use client";

import { useState } from "react";
import { HelpHint } from "@/components/shared/help-hint";
import { SELECT_CLASS } from "@/components/ui/select";
import { ActionButton, Callout, DataTable, NoData, Section, SourceLink, SpecForm, StatusBadge, buildOptionSets, useWorkspace, type Column } from "@/components/insurance/kit";
import { bankGuaranteeExecutionStatus, reviewBlockText } from "@/lib/insurance/index";
import { FORMS, validateEndorsementVerify, validateGuaranteeUpdate } from "@/lib/insurance-ui/forms";
import { formatDate, formatDateTime, formatMoney, textOrNoData, NO_DATA } from "@/lib/insurance-ui/format";
import { CHANGE_KIND_LABEL, DUAL_REVIEW_REASON_LABEL, ENDORSEMENT_STATE_LABEL, GUARANTEE_STATUS_LABEL, OTHER_GUARANTEE_TYPE_LABEL, CAUCAO_FORM_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { advanceView, endorsementView, prepareEndorsementDraft } from "@/lib/insurance-ui/model";
import type { AdvanceRow, BankGuaranteeRow, EndorsementReviewRow, EndorsementRow, OtherGuaranteeRow } from "@/lib/insurance-ui/types";

/* ------------------------------------------------------------- fianças e garantias ------------------------------------------------------------- */

export function GuaranteesPanel() {
  const { data } = useWorkspace();
  const options = buildOptionSets(data);
  const [showBank, setShowBank] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [editBank, setEditBank] = useState<BankGuaranteeRow | null>(null);
  const [editOther, setEditOther] = useState<OtherGuaranteeRow | null>(null);

  const bankCols: Column<BankGuaranteeRow>[] = [
    { key: "bank", label: "Banco", render: (g) => g.bank_name },
    { key: "num", label: "Nº", render: (g) => textOrNoData(g.guarantee_number) },
    { key: "ben", label: "Beneficiário / afiançado", render: (g) => `${textOrNoData(g.beneficiary_name)} / ${textOrNoData(g.principal_name)}` },
    { key: "amt", label: "Valor", render: (g) => formatMoney(g.amount, g.currency) },
    { key: "vig", label: "Vigência", render: (g) => `${formatDate(g.start_date)} a ${formatDate(g.end_date)}` },
    {
      key: "fd",
      label: "Primeira demanda",
      render: (g) => {
        const s = bankGuaranteeExecutionStatus({ callsOnFirstDemand: g.calls_on_first_demand, claimProcedureNote: g.claim_procedure_note });
        return s.firstDemand === "SEM_DADOS" ? <NoData text="SEM DADOS (não presumido)" /> : s.firstDemand === "SIM_CONFORME_INSTRUMENTO" ? "Sim, conforme o instrumento" : "Não, conforme o instrumento";
      },
    },
    { key: "proc", label: "Procedimento", render: (g) => (g.claim_procedure_note ? g.claim_procedure_note : <NoData text="SEM DADOS" />) },
    { key: "st", label: "Situação", helpId: "seguros.status.garantia", render: (g) => <StatusBadge text={labelOf(GUARANTEE_STATUS_LABEL, g.status)} variant={g.status === "VIGENTE" ? "success" : "secondary"} /> },
    { key: "src", label: "Fonte", render: (g) => <SourceLink documentId={g.source_document_id} sourceRef={g.source_ref} /> },
    { key: "do", label: "Ação", render: (g) => <ActionButton label="Atualizar" helpId="seguros.acoes.fianca-atualizar-abrir" level="MANAGE" variant="outline" onClick={() => setEditBank(g)} /> },
  ];
  const otherCols: Column<OtherGuaranteeRow>[] = [
    { key: "type", label: "Tipo", render: (g) => `${labelOf(OTHER_GUARANTEE_TYPE_LABEL, g.guarantee_type)}${g.caucao_form ? ` (${labelOf(CAUCAO_FORM_LABEL, g.caucao_form)})` : ""}` },
    { key: "iss", label: "Emissor", render: (g) => textOrNoData(g.issuer_name) },
    { key: "ben", label: "Beneficiário / afiançado", render: (g) => `${textOrNoData(g.beneficiary_name)} / ${textOrNoData(g.principal_name)}` },
    { key: "amt", label: "Valor", render: (g) => formatMoney(g.amount, g.currency) },
    { key: "vig", label: "Vigência", render: (g) => `${formatDate(g.start_date)} a ${formatDate(g.end_date)}` },
    { key: "rel", label: "Liberação", render: (g) => textOrNoData(g.release_conditions) },
    { key: "st", label: "Situação", helpId: "seguros.status.garantia", render: (g) => <StatusBadge text={labelOf(GUARANTEE_STATUS_LABEL, g.status)} variant={g.status === "VIGENTE" ? "success" : "secondary"} /> },
    { key: "src", label: "Fonte", render: (g) => <SourceLink documentId={g.source_document_id} sourceRef={g.source_ref} /> },
    { key: "do", label: "Ação", render: (g) => <ActionButton label="Atualizar" helpId="seguros.acoes.outra-atualizar-abrir" level="MANAGE" variant="outline" onClick={() => setEditOther(g)} /> },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="warn">
        Fiança bancária NÃO é seguro. Não se aplica procedimento de sinistro SUSEP por presunção nem se presume pagamento à primeira demanda: vale somente o texto do instrumento.
        <HelpHint helpId="seguros.garantias.aviso-nao-e-seguro" />
      </Callout>
      <Section title="Fianças bancárias" helpId="seguros.garantias.tabela-fiancas" actions={<ActionButton label={showBank ? "Fechar formulário" : "Nova fiança"} helpId="seguros.acoes.fianca-nova" level="MANAGE" variant="outline" onClick={() => setShowBank((v) => !v)} />}>
        <DataTable columns={bankCols} rows={data.bankGuarantees} empty="SEM DADOS: nenhuma fiança bancária cadastrada." caption="Fianças bancárias" />
        {showBank ? <div className="mt-3"><SpecForm spec={FORMS.bankRegister} options={options} level="MANAGE" okMessage="Fiança registrada." onCancel={() => setShowBank(false)} onDone={() => setShowBank(false)} toInput={(b) => ({ op: "bank_register", data: b.data })} /></div> : null}
        {editBank ? (
          <div className="mt-3">
            <SpecForm spec={FORMS.bankUpdate} level="MANAGE" okMessage="Fiança atualizada." onCancel={() => setEditBank(null)} onDone={() => setEditBank(null)}
              initial={{ amount: editBank.amount === null ? "" : String(editBank.amount), end_date: editBank.end_date ?? "", calls_on_first_demand: editBank.calls_on_first_demand === null ? "" : String(editBank.calls_on_first_demand), claim_procedure_note: editBank.claim_procedure_note ?? "", status: editBank.status, notes: editBank.notes ?? "" }}
              extraValidate={(v) => validateGuaranteeUpdate(v, bankInitial(editBank))}
              toInput={(b) => ({ op: "bank_update", id: editBank.id, expectedRowVersion: editBank.row_version, data: b.data, args: b.args })} />
          </div>
        ) : null}
      </Section>
      <Section title="Caução, carta de fiança não bancária e outras garantias" helpId="seguros.garantias.tabela-outras" actions={<ActionButton label={showOther ? "Fechar formulário" : "Nova garantia"} helpId="seguros.acoes.outra-nova" level="MANAGE" variant="outline" onClick={() => setShowOther((v) => !v)} />}>
        <DataTable columns={otherCols} rows={data.otherGuarantees} empty="SEM DADOS: nenhuma caução ou outra garantia cadastrada." caption="Cauções e outras garantias" />
        {showOther ? <div className="mt-3"><SpecForm spec={FORMS.otherRegister} options={options} level="MANAGE" okMessage="Garantia registrada." onCancel={() => setShowOther(false)} onDone={() => setShowOther(false)} toInput={(b) => ({ op: "other_register", data: b.data })} /></div> : null}
        {editOther ? (
          <div className="mt-3">
            <SpecForm spec={FORMS.otherUpdate} level="MANAGE" okMessage="Garantia atualizada." onCancel={() => setEditOther(null)} onDone={() => setEditOther(null)}
              initial={{ amount: editOther.amount === null ? "" : String(editOther.amount), end_date: editOther.end_date ?? "", release_conditions: editOther.release_conditions ?? "", status: editOther.status, notes: editOther.notes ?? "" }}
              extraValidate={(v) => validateGuaranteeUpdate(v, otherInitial(editOther))}
              toInput={(b) => ({ op: "other_update", id: editOther.id, expectedRowVersion: editOther.row_version, data: b.data, args: b.args })} />
          </div>
        ) : null}
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ endossos ------------------------------------------------------------------ */

export function EndorsementsPanel() {
  const { data, target, goTo } = useWorkspace();
  const options = buildOptionSets(data);
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(target.endorsementId ?? null);
  const [showNew, setShowNew] = useState(false);
  const rows = data.endorsements.filter((e) => !filter || e.state === filter);
  const selected = data.endorsements.find((e) => e.id === selectedId) ?? null;
  const policyName = (id: string) => data.policies.find((p) => p.id === id)?.policy_number ?? "nº SEM DADOS";

  const cols: Column<EndorsementRow>[] = [
    { key: "pol", label: "Apólice / nº do pedido", render: (e) => `${policyName(e.policy_id)} / #${e.endorsement_seq}` },
    { key: "st", label: "Estado", helpId: "seguros.status.endosso", render: (e) => <StatusBadge text={labelOf(ENDORSEMENT_STATE_LABEL, e.state)} variant={e.state === "CONFERIDO" ? "success" : e.state === "RECUSADO" ? "destructive" : "warning"} /> },
    { key: "rev", label: "Conferências", helpId: "seguros.endossos.coluna-conferencias", render: (e) => reviewsCell(e, data.endorsementReviews) },
    { key: "eff", label: "Efeito de cobertura", render: (e) => (endorsementView(e).extendsCoverage ? <StatusBadge text="Efetivo (conferido)" variant="success" /> : <StatusBadge text="SEM efeito" variant="secondary" />) },
    { key: "req", label: "Solicitado em", render: (e) => formatDateTime(e.requested_at) },
    { key: "iss", label: "Emitido", render: (e) => (e.issued_number ? `nº ${e.issued_number} em ${formatDateTime(e.issued_at)}` : <NoData text="SEM DADOS (não emitido)" />) },
    { key: "match", label: "Textos conferem?", render: (e) => (e.texts_match === null ? <NoData /> : e.texts_match ? "Sim" : <StatusBadge text="Divergem" variant="warning" />) },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Callout tone="danger">
        <strong>Pedido de endosso NÃO é endosso emitido.</strong> A cobertura só é ampliada depois da emissão formal pela seguradora e da conferência do TEXTO EMITIDO contra o solicitado. Até lá, nada muda na cobertura.
        <HelpHint helpId="seguros.endossos.aviso-pedido-nao-e-emitido" />
      </Callout>
      <Section title="Endossos" helpId="seguros.endossos.tabela" actions={<ActionButton label={showNew ? "Fechar formulário" : "Registrar pedido de endosso"} helpId="seguros.acoes.endosso-novo" level="REGISTER" variant="outline" onClick={() => setShowNew((v) => !v)} />}>
        <div className="mb-3 flex flex-col gap-1 sm:w-64">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-e-f">Estado</label><HelpHint helpId="seguros.endossos.filtro-estado" /></span>
          {/* help-exempt: filtro cujo ícone de ajuda (seguros.endossos.filtro-estado) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-e-f" className={`${SELECT_CLASS} min-h-11`} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ENDORSEMENT_STATE_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
        </div>
        <DataTable columns={cols} rows={rows} selectedId={selectedId} onSelect={(e) => setSelectedId(e.id)} empty="SEM DADOS: nenhum endosso registrado." caption="Endossos" />
        {showNew ? <div className="mt-3"><SpecForm spec={FORMS.endorsementRequest} options={options} level="REGISTER" okMessage="Pedido registrado (SOLICITADO): sem efeito de cobertura." onCancel={() => setShowNew(false)} onDone={() => setShowNew(false)} toInput={(b) => ({ op: "endorsement_request", id: String(b.args.policy_id ?? ""), data: b.data })} /></div> : null}
      </Section>
      {selected ? <EndorsementDetail e={selected} goTo={goTo} /> : null}
    </div>
  );
}

function reviewsCell(e: EndorsementRow, reviews: EndorsementReviewRow[]) {
  const v = endorsementView(e, reviews);
  if (v.reviewState.legacySingleReview) return "Única (histórico)";
  if (e.state === "SOLICITADO" || e.state === "EM_ANALISE" || e.state === "RECUSADO") return <NoData text="Não se aplica" />;
  return `${v.progress.approved} de ${v.progress.required} aprovada(s)${v.progress.refused ? " — 1 recusada" : ""}`;
}

function EndorsementDetail({ e, goTo }: { e: EndorsementRow; goTo: (tab: string, t?: { endorsementId?: string }) => void }) {
  const { data, caps, currentUserId } = useWorkspace();
  const options = buildOptionSets(data);
  const v = endorsementView(e, data.endorsementReviews, currentUserId, caps.manage);
  const nameOf = (id: string) => data.actors[id] ?? `usuário ${id.slice(0, 8)}`;
  const kinds = e.change_kinds && e.change_kinds.length ? e.change_kinds.map((k) => labelOf(CHANGE_KIND_LABEL, k)).join("; ") : null;
  const [mode, setMode] = useState<null | "EMITIDO" | "RECUSADO" | "CONFERIDO" | "EM_ANALISE" | "REVISAO_RECUSA">(null);
  const prep = prepareEndorsementDraft(e, data);
  return (
    <Section title={`Endosso #${e.endorsement_seq}`} helpId="seguros.endossos.detalhe">
      <p className="mb-3 text-sm">{v.statusText}</p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border border-border p-3">
          <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold">Texto SOLICITADO<HelpHint helpId="seguros.endossos.texto-solicitado" /></h3>
          <p className="whitespace-pre-wrap text-sm">{e.requested_text}</p>
          <p className="mt-2 text-xs text-muted-foreground">Fonte do pedido: <SourceLink documentId={e.request_document_id} sourceRef={e.request_ref} /></p>
        </div>
        <div className="rounded-md border border-border p-3">
          <h3 className="mb-1 flex items-center gap-1 text-sm font-semibold">Texto EMITIDO<HelpHint helpId="seguros.endossos.texto-emitido" /></h3>
          {e.issued_text ? <p className="whitespace-pre-wrap text-sm">{e.issued_text}</p> : <NoData text="SEM DADOS: a seguradora ainda não emitiu o endosso." />}
          <p className="mt-2 text-xs text-muted-foreground">Fonte do emitido: {e.issued_document_id ? <SourceLink documentId={e.issued_document_id} /> : "SEM FONTE"}</p>
        </div>
      </div>
      {v.comparison ? (
        <div className="mt-3 rounded-md border border-border p-3 text-sm">
          <h3 className="mb-1 flex items-center gap-1 font-semibold">Comparação solicitado × emitido (FATO textual, sem interpretação jurídica)<HelpHint helpId="seguros.endossos.comparacao" /></h3>
          {v.comparison.textsMatch ? <p>Os textos são idênticos após normalizar espaços e caixa.</p> : (
            <ul className="list-disc pl-5">
              <li>Termos só no SOLICITADO (pedido não atendido): {v.comparison.onlyRequested.length ? v.comparison.onlyRequested.join(", ") : "nenhum"}</li>
              <li>Termos só no EMITIDO (acréscimos ou restrições que ninguém pediu): {v.comparison.onlyIssued.length ? v.comparison.onlyIssued.join(", ") : "nenhum"}</li>
            </ul>
          )}
          <p className="mt-1 text-xs text-muted-foreground">Revisão humana obrigatória. {e.divergence_note ? `Nota de divergência registrada: ${e.divergence_note}` : ""}</p>
        </div>
      ) : null}
      <div className="mt-3 rounded-md border border-border p-3 text-sm">
        <h3 className="mb-1 flex items-center gap-1 font-semibold">Conferência humana independente<HelpHint helpId="seguros.endossos.conferencias" /></h3>
        <p>
          <strong>{v.reviewState.legacySingleReview ? "Conferência única (histórico)" : v.reviewState.requiresDualReview ? "Dupla conferência exigida" : "Conferência simples"}</strong>
          <HelpHint helpId="seguros.endossos.status-dupla" />
          {v.reviewState.requiresDualReview && !v.reviewState.legacySingleReview ? ` — ${labelOf(DUAL_REVIEW_REASON_LABEL, e.dual_review_reason ?? "SEM_CLASSIFICACAO")}` : ""}
        </p>
        <p className="mt-1 text-muted-foreground">Itens que o endosso altera (declarado): {kinds ?? "SEM CLASSIFICAÇÃO (tratado como crítico)"}.</p>
        <p className="mt-1">{v.progressText}</p>
        {v.currentReviews.length ? (
          <ul className="mt-2 list-disc pl-5">
            {v.currentReviews.map((r) => (
              <li key={r.id}>
                Conferência {r.review_no}: {r.outcome === "APROVADO" ? "APROVADA" : "RECUSADA"} por {nameOf(r.reviewer_id)} em {formatDateTime(r.reviewed_at)}{r.note ? ` — nota: ${r.note}` : ""}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted-foreground">Nenhuma conferência registrada nesta rodada (rodada {v.progress.round}).</p>
        )}
        {e.state === "EMITIDO" && v.reviewBlock ? <p className="mt-2 font-medium" role="status">Conferir está bloqueado para você: {reviewBlockText(v.reviewBlock)}</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">Quem solicitou e quem registrou a emissão não conferem; a mesma pessoa não confere duas vezes. O banco impõe essas regras; a tela apenas as antecipa.</p>
      </div>
      {e.refusal_note ? <p className="mt-3 text-sm">Motivo da recusa: {e.refusal_note}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {v.nextActions.includes("EM_ANALISE") ? <ActionButton label="Registrar em análise" helpId="seguros.acoes.endosso-analise" level="REGISTER" variant="outline" onClick={() => setMode("EM_ANALISE")} /> : null}
        {v.nextActions.includes("EMITIDO") ? <ActionButton label="Registrar emissão" helpId="seguros.acoes.endosso-emitir-abrir" level="MANAGE" variant="outline" onClick={() => setMode("EMITIDO")} /> : null}
        {v.nextActions.includes("CONFERIDO") ? <ActionButton label="Conferir texto emitido" helpId="seguros.acoes.endosso-conferir-abrir" level="MANAGE" variant="outline" extraDisabled={Boolean(v.reviewBlock)} extraReason={v.reviewBlock ? reviewBlockText(v.reviewBlock) : undefined} onClick={() => setMode("CONFERIDO")} /> : null}
        {v.nextActions.includes("CONFERIDO") ? <ActionButton label="Recusar conferência" helpId="seguros.acoes.endosso-conferencia-recusar-abrir" level="MANAGE" variant="outline" extraDisabled={Boolean(v.reviewBlock)} extraReason={v.reviewBlock ? reviewBlockText(v.reviewBlock) : undefined} onClick={() => setMode("REVISAO_RECUSA")} /> : null}
        {v.nextActions.includes("RECUSADO") ? <ActionButton label="Registrar recusa" helpId="seguros.acoes.endosso-recusar-abrir" level="MANAGE" variant="outline" onClick={() => setMode("RECUSADO")} /> : null}
        <ActionButton label="Preparar minuta de endosso" helpId="seguros.acoes.endosso-minuta" level="REGISTER" variant="outline" onClick={() => goTo("minutas", { endorsementId: e.id })} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">Canal oficial para a minuta: {prep.channel ? `${prep.channel.entity_name} (${prep.channelState})` : "SEM CANAL cadastrado"}.</p>
      {mode === "EM_ANALISE" ? (
        <div className="mt-3"><SpecForm spec={{ ...FORMS.endorsementVerify, id: "endorsementAnalysis", title: "Confirmar: pedido em análise pela seguradora", helpId: "seguros.endossos.form-analise", submitLabel: "Registrar em análise", submitHelpId: "seguros.acoes.endosso-analise", fields: [] }} level="REGISTER" okMessage="Endosso em análise (ainda sem efeito de cobertura)." onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={() => ({ op: "endorsement_advance", id: e.id, expectedRowVersion: e.row_version, args: { toState: "EM_ANALISE" } })} /></div>
      ) : null}
      {mode === "EMITIDO" ? <div className="mt-3"><SpecForm spec={FORMS.endorsementIssue} options={options} level="MANAGE" okMessage="Emissão registrada: confira o texto emitido para torná-lo efetivo." onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={(b) => ({ op: "endorsement_advance", id: e.id, expectedRowVersion: e.row_version, data: b.data, args: { toState: "EMITIDO" } })} /></div> : null}
      {mode === "RECUSADO" ? <div className="mt-3"><SpecForm spec={FORMS.endorsementRefuse} level="MANAGE" okMessage="Recusa registrada." onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={(b) => ({ op: "endorsement_advance", id: e.id, expectedRowVersion: e.row_version, data: b.data, args: { toState: "RECUSADO" } })} /></div> : null}
      {mode === "CONFERIDO" ? <div className="mt-3"><SpecForm spec={FORMS.endorsementVerify} level="MANAGE" extraValidate={(vals) => validateEndorsementVerify(vals, e.texts_match)} okMessage={v.progress.required - v.progress.approved > 1 ? "Conferência registrada: falta a conferência independente de outra pessoa; ainda SEM efeito de cobertura." : "Conferência registrada. O efeito de cobertura só vale quando o endosso aparecer como Conferido."} onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={(b) => ({ op: "endorsement_review", id: e.id, expectedRowVersion: e.row_version, data: b.data, args: { outcome: "APROVADO" } })} /></div> : null}
      {mode === "REVISAO_RECUSA" ? <div className="mt-3"><SpecForm spec={FORMS.endorsementReviewRefuse} level="MANAGE" okMessage="Conferência recusada: o endosso foi para revisão, sem efeito de cobertura." onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={(b) => ({ op: "endorsement_review", id: e.id, expectedRowVersion: e.row_version, data: b.data, args: { outcome: "RECUSADO" } })} /></div> : null}
    </Section>
  );
}

/* ---------------------------------------------------------------- adiantamentos ---------------------------------------------------------------- */

export function AdvancesPanel() {
  const { data } = useWorkspace();
  const options = buildOptionSets(data);
  const [showNew, setShowNew] = useState(false);
  const [amortize, setAmortize] = useState<AdvanceRow | null>(null);

  const cols: Column<AdvanceRow>[] = [
    { key: "purpose", label: "Finalidade", render: (a) => a.purpose },
    { key: "adv", label: "Valor adiantado", render: (a) => formatMoney(a.advanced_amount) },
    { key: "am", label: "Amortizado", render: (a) => formatMoney(advanceView(a, data.amortizations, data.policies).balance.amortized) },
    { key: "un", label: "Saldo não amortizado", helpId: "seguros.adiantamentos.coluna-saldo", render: (a) => formatMoney(advanceView(a, data.amortizations, data.policies).balance.unamortized) },
    { key: "lim", label: "Limite garantido", render: (a) => formatMoney(a.guaranteed_limit) },
    {
      key: "g",
      label: "Garantia",
      helpId: "seguros.status.garantia-adiantamento",
      render: (a) => {
        const b = advanceView(a, data.amortizations, data.policies).balance;
        return <StatusBadge text={b.guarantee === "SEM_DADOS" ? NO_DATA : b.guarantee} variant={b.guarantee === "INSUFICIENTE" ? "destructive" : b.guarantee === "SUFICIENTE" ? "success" : "secondary"} />;
      },
    },
    { key: "due", label: "Saldo devido (informado)", render: (a) => formatMoney(a.balance_due_informed) },
    { key: "ind", label: "Indenizável (informado)", render: (a) => formatMoney(a.indemnifiable_informed) },
    { key: "src", label: "Fonte", render: (a) => <SourceLink documentId={a.source_document_id} sourceRef={a.source_ref} /> },
    { key: "do", label: "Ação", render: (a) => <ActionButton label="Amortizar" helpId="seguros.acoes.adiantamento-amortizar-abrir" level="REGISTER" variant="outline" onClick={() => setAmortize(a)} /> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info">
        Valor adiantado ≠ saldo não amortizado ≠ saldo devido ≠ valor indenizável. A tela calcula apenas o saldo não amortizado (adiantado menos amortizações registradas). Saldo devido e valor indenizável só aparecem se informados por quem tem a fonte: o sistema NÃO calcula indenização.
        <HelpHint helpId="seguros.adiantamentos.aviso-sem-indenizacao" />
      </Callout>
      <ConsolidatedAdvancesCard />
      <Section title="Adiantamentos" helpId="seguros.adiantamentos.tabela" actions={<ActionButton label={showNew ? "Fechar formulário" : "Registrar adiantamento"} helpId="seguros.acoes.adiantamento-novo" level="REGISTER" variant="outline" onClick={() => setShowNew((v) => !v)} />}>
        <DataTable columns={cols} rows={data.advances} empty="SEM DADOS: nenhum adiantamento registrado." caption="Adiantamentos" />
        {showNew ? <div className="mt-3"><SpecForm spec={FORMS.advanceRegister} options={options} level="REGISTER" okMessage="Adiantamento registrado." onCancel={() => setShowNew(false)} onDone={() => setShowNew(false)} toInput={(b) => ({ op: "advance_register", data: b.data })} /></div> : null}
        {amortize ? <div className="mt-3"><SpecForm spec={FORMS.advanceAmortize} options={options} level="REGISTER" okMessage="Amortização registrada." onCancel={() => setAmortize(null)} onDone={() => setAmortize(null)} toInput={(b) => ({ op: "advance_amortize", id: amortize.id, expectedRowVersion: amortize.row_version, data: b.data })} /></div> : null}
      </Section>
      <Section title="Amortizações registradas" helpId="seguros.adiantamentos.tabela-amortizacoes">
        <DataTable
          columns={[
            { key: "adv", label: "Adiantamento", render: (m: (typeof data.amortizations)[number]) => data.advances.find((a) => a.id === m.advance_id)?.purpose ?? "SEM DADOS" },
            { key: "amt", label: "Valor", render: (m) => formatMoney(m.amount) },
            { key: "on", label: "Data", render: (m) => formatDate(m.amortized_on) },
            { key: "src", label: "Fonte", render: (m) => <SourceLink documentId={m.source_document_id} sourceRef={m.source_ref} /> },
            { key: "note", label: "Observação", render: (m) => textOrNoData(m.note) },
          ]}
          rows={data.amortizations}
          empty="SEM DADOS: nenhuma amortização registrada."
          caption="Amortizações"
        />
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- consolidação (sem dupla contagem) ---------------------------------------------------------------- */

function bankInitial(b: BankGuaranteeRow): Record<string, string> {
  return { amount: b.amount === null ? "" : String(b.amount), end_date: b.end_date ?? "", calls_on_first_demand: b.calls_on_first_demand === null ? "" : String(b.calls_on_first_demand), claim_procedure_note: b.claim_procedure_note ?? "", status: b.status, notes: b.notes ?? "" };
}
function otherInitial(o: OtherGuaranteeRow): Record<string, string> {
  return { amount: o.amount === null ? "" : String(o.amount), end_date: o.end_date ?? "", release_conditions: o.release_conditions ?? "", status: o.status, notes: o.notes ?? "" };
}

function ConsolidatedAdvancesCard() {
  const { data } = useWorkspace();
  const c = data.advancesConsolidated;
  return (
    <Section title="Consolidado de adiantamentos (sem dupla contagem)" helpId="seguros.adiantamentos.consolidado">
      {!c ? (
        <p className="text-sm text-muted-foreground" data-testid="seguros-consolidado-sem-dados">SEM DADOS: o consolidado não pôde ser carregado (nunca é exibido como zero).</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm" data-testid="seguros-consolidado">
          <dl className="grid gap-2 sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Soma dos adiantamentos</dt><dd className="font-semibold" data-testid="seguros-consolidado-adiantado">{formatMoney(c.totals.advanced)}</dd></div>
            <div><dt className="text-muted-foreground">Amortizado (efetivo)</dt><dd className="font-semibold" data-testid="seguros-consolidado-amortizado">{formatMoney(c.totals.amortized)}</dd></div>
            <div><dt className="text-muted-foreground">Saldo não amortizado</dt><dd className="font-semibold" data-testid="seguros-consolidado-saldo">{formatMoney(c.totals.unamortized)}</dd></div>
          </dl>
          {c.totals.duplicateAdvances + c.totals.duplicateAmortizations > 0 ? (
            <Callout tone="warn">
              Duplicidades excluídas da soma: {c.totals.duplicateAdvances} adiantamento(s) e {c.totals.duplicateAmortizations} amortização(ões) idênticos (mesma apólice, contrato, data, valor e fonte). Confira os registros: nada foi apagado.
            </Callout>
          ) : null}
          {c.totals.overAmortized > 0 ? <Callout tone="warn">{c.totals.overAmortized} adiantamento(s) com amortização acima do adiantado (legado): o excesso não vira saldo negativo.</Callout> : null}
          <ul className="flex flex-col gap-1" data-testid="seguros-consolidado-apolices">
            {c.byPolicy.map((p) => (
              <li key={p.policyId ?? "sem-apolice"} className="flex flex-wrap items-center gap-2">
                <span>{p.policyId ? (data.policies.find((x) => x.id === p.policyId)?.policy_number ?? "apólice") : "Sem apólice vinculada"}: saldo {formatMoney(p.unamortized)} · teto {p.ceiling === null ? NO_DATA : formatMoney(p.ceiling)}</span>
                <StatusBadge text={p.guarantee === "SEM_DADOS" ? NO_DATA : p.guarantee} variant={p.guarantee === "INSUFICIENTE" ? "destructive" : p.guarantee === "SUFICIENTE" ? "success" : "secondary"} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
