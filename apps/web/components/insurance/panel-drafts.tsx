"use client";

import { useState } from "react";
import { HelpHint } from "@/components/shared/help-hint";
import { SELECT_CLASS } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useCompetenceFor } from "@/components/insurance/use-competence";
import { ActionButton, Callout, DataTable, NoData, RunnerFeedback, Section, SpecForm, StatusBadge, useInsuranceRunner, useWorkspace, type Column } from "@/components/insurance/kit";
import { claimStageLabelFor } from "@/lib/insurance-ui/claim-labels";
import { FORMS } from "@/lib/insurance-ui/forms";
import { formatDateTime, textOrNoData } from "@/lib/insurance-ui/format";
import { AUDIT_ENTITY_LABEL, DRAFT_KIND_LABEL, DRAFT_STATE_LABEL, SEND_BLOCK_REASON_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { CHANNEL_AVAILABILITY_TEXT, claimInstrument, draftSendView, prepareAcionamento, prepareEndorsementDraft, type AcionamentoPlan } from "@/lib/insurance-ui/model";
import type { BuiltDraft } from "@/lib/insurance/index";
import type { DraftRow } from "@/lib/insurance-ui/types";

export function DraftsPanel() {
  const { data, target } = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cols: Column<DraftRow>[] = [
    { key: "subject", label: "Assunto", render: (d) => d.subject },
    { key: "kind", label: "Tipo", render: (d) => labelOf(DRAFT_KIND_LABEL, d.draft_kind) },
    { key: "state", label: "Estado", helpId: "seguros.status.minuta", render: (d) => <StatusBadge text={labelOf(DRAFT_STATE_LABEL, d.state)} variant={d.state === "CANCELADA" ? "secondary" : d.state === "APROVADA_PARA_ENVIO" ? "info" : "warning"} /> },
    { key: "ai", label: "Origem", render: (d) => (d.generated_by_ai ? "Gerada por IA" : "Montada por regra determinística + edição humana") },
    { key: "at", label: "Criada em", render: (d) => formatDateTime(d.created_at) },
  ];
  const selected = data.drafts.find((d) => d.id === selectedId) ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="danger">
        <strong>Nada é enviado por este sistema.</strong> Toda comunicação aqui é MINUTA (DRAFT): texto para revisão humana. O envio real não existe nesta fase — o botão “Enviar” fica desabilitado e a aprovação de um ADMINISTRADOR não equivale a envio.
        <HelpHint helpId="seguros.minutas.aviso-sem-envio" />
      </Callout>
      <AcionamentoSection initialClaimId={target.claimId} initialEndorsementId={target.endorsementId} />
      <Section title="Minutas" helpId="seguros.minutas.tabela">
        <DataTable columns={cols} rows={data.drafts} selectedId={selectedId} onSelect={(d) => setSelectedId(d.id)} empty="SEM DADOS: nenhuma minuta preparada." caption="Minutas de comunicação" />
      </Section>
      {selected ? <DraftDetail draft={selected} /> : null}
    </div>
  );
}

function AcionamentoSection({ initialClaimId, initialEndorsementId }: { initialClaimId?: string; initialEndorsementId?: string }) {
  const { data, nowIso } = useWorkspace();
  const now = new Date(nowIso);
  const [claimId, setClaimId] = useState(initialClaimId ?? "");
  const [endorsementId, setEndorsementId] = useState(initialEndorsementId ?? "");
  const claim = data.claims.find((c) => c.id === claimId) ?? null;
  const endorsement = data.endorsements.find((e) => e.id === endorsementId) ?? null;
  const plan: AcionamentoPlan | null = claim ? prepareAcionamento(claim, data, now) : null;
  const endPlan = endorsement ? prepareEndorsementDraft(endorsement, data) : null;
  return (
    <Section title="Preparar acionamento" helpId="seguros.minutas.preparar-acionamento">
      <p className="mb-3 text-sm text-muted-foreground">
        O fluxo da SEGURADORA é separado do fluxo de BANCO/EMISSOR (fiança, caução). O sistema monta o roteiro e uma minuta DRAFT a partir do que está cadastrado; lacunas viram [PREENCHER ...] e impedem a aprovação. Nenhum destinatário ou endereço é inventado.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-a-claim">Sinistro ou evento</label><HelpHint helpId="seguros.minutas.seletor-evento" /></span>
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.minutas.seletor-evento) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-a-claim" className={`${SELECT_CLASS} min-h-11 w-full`} value={claimId} onChange={(e) => { setClaimId(e.target.value); setEndorsementId(""); }}>
            <option value="">Nenhum</option>
            {data.claims.map((c) => (<option key={c.id} value={c.id}>{c.title} — {claimStageLabelFor(c.stage, claimInstrument(c, data).kind)}</option>))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-a-end">Ou: pedido de endosso</label><HelpHint helpId="seguros.minutas.seletor-endosso" /></span>
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.minutas.seletor-endosso) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-a-end" className={`${SELECT_CLASS} min-h-11 w-full`} value={endorsementId} onChange={(e) => { setEndorsementId(e.target.value); setClaimId(""); }}>
            <option value="">Nenhum</option>
            {data.endorsements.filter((e) => e.state === "SOLICITADO" || e.state === "EM_ANALISE").map((e) => (<option key={e.id} value={e.id}>Endosso #{e.endorsement_seq} — {e.state}</option>))}
          </select>
        </div>
      </div>
      {plan ? <PlanView plan={plan} /> : null}
      {endPlan && endorsement ? (
        <div className="mt-3 flex flex-col gap-3">
          <Callout tone="info">{CHANNEL_AVAILABILITY_TEXT[endPlan.channelState]}</Callout>
          <DraftPreview draft={endPlan.draft} />
          <CreateDraftButton draft={endPlan.draft} link={{ policy_id: endorsement.policy_id, endorsement_id: endorsement.id, official_channel_id: endPlan.channel?.id }} disabledReason={null} />
        </div>
      ) : null}
    </Section>
  );
}

function PlanView({ plan }: { plan: AcionamentoPlan }) {
  const claimLink: Record<string, string | undefined> = {
    claim_id: plan.claimId,
    policy_id: plan.instrument.kind === "SEGURO" ? plan.instrument.id : undefined,
    bank_guarantee_id: plan.instrument.kind === "FIANCA_BANCARIA" ? plan.instrument.id : undefined,
    official_channel_id: plan.channel?.id,
  };
  const noInstrument = plan.instrument.kind === "SEM_INSTRUMENTO";
  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="rounded-md border border-border p-3 text-sm">
        <h3 className="mb-1 flex items-center gap-1 font-semibold">Fluxo: {plan.counterpartLabel}<HelpHint helpId="seguros.minutas.fluxo" /></h3>
        <p className="mb-2">Instrumento: {plan.instrument.label}</p>
        {plan.flow ? (
          <>
            <ol className="list-decimal pl-5">{plan.flow.steps.map((s) => (<li key={s}>{s}</li>))}</ol>
            <ul className="mt-2 list-disc pl-5 text-muted-foreground">{plan.flow.notes.map((n) => (<li key={n}>{n}</li>))}</ul>
            <p className="mt-2 text-xs text-muted-foreground">Presunções proibidas neste fluxo: procedimento SUSEP, pagamento à primeira demanda e prazo legal NÃO são presumidos; leia o instrumento antes de qualquer ato.</p>
          </>
        ) : (
          <NoData text="SEM DADOS: sem instrumento vinculado não há fluxo de acionamento." />
        )}
      </div>
      {plan.blockers.length ? (
        <Callout tone="warn">
          <ul className="list-disc pl-5">{plan.blockers.map((b) => (<li key={b}>{b}</li>))}</ul>
        </Callout>
      ) : (
        <Callout tone="ok">{CHANNEL_AVAILABILITY_TEXT.DISPONIVEL}</Callout>
      )}
      {plan.draft ? <DraftPreview draft={plan.draft} /> : null}
      {plan.draft ? <CreateDraftButton draft={plan.draft} link={claimLink} disabledReason={noInstrument ? "Sem instrumento" : plan.blockers.some((b) => b.includes("ENCERRADO")) ? "Evento encerrado" : null} /> : null}
    </div>
  );
}

function DraftPreview({ draft }: { draft: BuiltDraft }) {
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <h3 className="mb-1 flex items-center gap-1 font-semibold">Prévia da minuta (DRAFT — não enviada)<HelpHint helpId="seguros.minutas.previa" /></h3>
      <p className="font-medium">{draft.subject}</p>
      <pre className="my-2 whitespace-pre-wrap font-sans">{draft.body}</pre>
      {draft.placeholders.length ? <p className="text-destructive">Campos a preencher antes de aprovar: {draft.placeholders.join("; ")}.</p> : null}
      <BasisView basis={draft.basis} />
    </div>
  );
}

function BasisView({ basis }: { basis: { facts?: string[]; inferences?: string[]; recommendations?: string[] } | null }) {
  const groups: Array<[string, string[] | undefined]> = [["Fatos", basis?.facts], ["Inferências", basis?.inferences], ["Recomendações", basis?.recommendations]];
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {groups.map(([t, items]) => (
        <div key={t}>
          <p className="flex items-center gap-1 text-xs font-semibold uppercase">{t}{t === "Fatos" ? <HelpHint helpId="seguros.status.epistemico" /> : null}</p>
          {items?.length ? <ul className="list-disc pl-4">{items.map((i) => (<li key={i}>{i}</li>))}</ul> : <NoData text="nenhum" />}
        </div>
      ))}
    </div>
  );
}

function CreateDraftButton({ draft, link, disabledReason }: { draft: BuiltDraft; link: Record<string, string | undefined>; disabledReason: string | null }) {
  const runner = useInsuranceRunner();
  const data: Record<string, unknown> = { draft_kind: draft.draftKind, subject: draft.subject, body: draft.body, basis: draft.basis };
  for (const [k, v] of Object.entries(link)) if (v) data[k] = v;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ActionButton label="Criar minuta (DRAFT)" helpId="seguros.acoes.minuta-criar" level="REGISTER" pending={runner.pending} extraDisabled={Boolean(disabledReason)} extraReason={disabledReason ?? undefined} onClick={() => void runner.run({ op: "draft_create", data }, "Minuta criada em DRAFT. Revise o texto na lista de minutas; nada foi enviado.")} />
      </div>
      <RunnerFeedback runner={runner} />
    </div>
  );
}

function DraftDetail({ draft }: { draft: DraftRow }) {
  const approveComp = useCompetenceFor("DRAFT_APPROVE"); // Fase 4/A: aprovar minuta exige competência Seguros ou Jurídico (além de Administrador)
  const { data, caps } = useWorkspace();
  const channel = draft.official_channel_id ? data.channels.find((c) => c.id === draft.official_channel_id) ?? null : null;
  const send = draftSendView(draft, channel, data.settings);
  const [mode, setMode] = useState<null | "edit" | "approve" | "cancel">(null);
  const runner = useInsuranceRunner();
  const [blockedReasons, setBlockedReasons] = useState<string[] | null>(null);
  const trail = data.audit.filter((a) => a.entity_id === draft.id);
  const editable = draft.state === "DRAFT";
  const editableText = draft.state !== "CANCELADA";

  const attempt = async () => {
    const res = await runner.run({ op: "draft_attempt_send", id: draft.id }, "Tentativa registrada na auditoria: o envio foi BLOQUEADO. Nada foi enviado.");
    if (res.ok) {
      const r = (res.result as { reasons?: string[] } | null)?.reasons;
      setBlockedReasons(Array.isArray(r) ? r : []);
    }
  };

  return (
    <Section title={`Minuta: ${draft.subject}`} helpId="seguros.minutas.detalhe">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge text={labelOf(DRAFT_STATE_LABEL, draft.state)} variant={draft.state === "CANCELADA" ? "secondary" : "warning"} helpId="seguros.status.minuta" />
        {draft.approved_at ? <span>Aprovada por humano em {formatDateTime(draft.approved_at)} (por {draft.approved_by ? data.actors[draft.approved_by] ?? draft.approved_by.slice(0, 8) : "SEM DADOS"}) — a aprovação NÃO enviou nada.</span> : null}
      </p>
      <pre className="mb-3 whitespace-pre-wrap rounded-md border border-border p-3 font-sans text-sm">{draft.body}</pre>
      <BasisView basis={draft.basis} />
      <p className="mt-2 text-sm">Canal oficial vinculado: {channel ? `${channel.entity_name} — ${channel.channel_type}: ${channel.channel_value} (${channel.active ? "ativo" : "INATIVO"}, ${channel.verified_at ? "verificado" : "NÃO verificado"})` : <NoData text="SEM CANAL" />}</p>

      <h3 className="mb-1 mt-4 flex items-center gap-1 text-sm font-semibold">Envio real<HelpHint helpId="seguros.minutas.envio-bloqueado" /></h3>
      <Callout tone="danger">
        <p className="mb-2">O envio real não existe nesta fase. Motivos de bloqueio avaliados agora:</p>
        <ul className="list-disc pl-5">
          {send.result.reasons.map((r) => (<li key={r}>{SEND_BLOCK_REASON_LABEL[r] ?? r}</li>))}
        </ul>
      </Callout>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {/* help-exempt: botão permanentemente desabilitado; o ícone de ajuda seguros.minutas.envio-bloqueado ao lado explica o motivo */}
        <Button type="button" variant="outline" size="sm" className="min-h-11 px-4 disabled:border disabled:border-dashed disabled:border-input disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100" disabled aria-disabled="true" data-testid="seguros-send-disabled">
          Enviar (indisponível nesta fase)
        </Button>
        <HelpHint helpId="seguros.minutas.envio-bloqueado" />
        <ActionButton label="Registrar tentativa de envio (será bloqueada)" helpId="seguros.acoes.minuta-tentar-envio" level="REGISTER" variant="outline" pending={runner.pending} onClick={() => void attempt()} />
      </div>
      {blockedReasons ? <p className="mt-1 text-sm">Resposta do banco: enviado = não; motivos: {blockedReasons.map((r) => SEND_BLOCK_REASON_LABEL[r] ?? r).join(" | ")}</p> : null}
      <RunnerFeedback runner={runner} />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {editableText ? <ActionButton label="Editar minuta" helpId="seguros.acoes.minuta-editar" level="REGISTER" variant="outline" onClick={() => setMode("edit")} /> : null}
        {editable ? <ActionButton label="Aprovar (Administrador)" helpId="seguros.acoes.minuta-aprovar-abrir" level="ADMIN" variant="outline" extraDisabled={!approveComp.ok} extraReason={approveComp.blockText ?? undefined} onClick={() => setMode("approve")} /> : null}
        {draft.state !== "CANCELADA" ? <ActionButton label="Cancelar minuta" helpId="seguros.acoes.minuta-cancelar-abrir" level="REGISTER" variant="outline" onClick={() => setMode("cancel")} /> : null}
      </div>
      {mode === "edit" ? <div className="mt-3"><SpecForm spec={FORMS.draftEdit} initial={{ subject: draft.subject, body: draft.body }} level="REGISTER" okMessage="Minuta salva." onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={(b) => ({ op: "draft_update", id: draft.id, expectedRowVersion: draft.row_version, args: b.args })} /></div> : null}
      {mode === "approve" ? <div className="mt-3"><SpecForm spec={FORMS.draftApprove} level="ADMIN" okMessage="Aprovação registrada. Nenhuma comunicação foi enviada." onCancel={() => setMode(null)} onDone={() => setMode(null)} extraValidate={(v): Record<string, string> => ((v.confirmation ?? "").trim() === "APROVO O CONTEUDO PARA ENVIO" ? {} : { confirmation: "Digite exatamente: APROVO O CONTEUDO PARA ENVIO" })} toInput={(b) => ({ op: "draft_approve", id: draft.id, expectedRowVersion: draft.row_version, args: b.args })} /></div> : null}
      {mode === "cancel" ? <div className="mt-3"><SpecForm spec={FORMS.draftCancel} level="REGISTER" okMessage="Minuta cancelada." onCancel={() => setMode(null)} onDone={() => setMode(null)} toInput={(b) => ({ op: "draft_cancel", id: draft.id, expectedRowVersion: draft.row_version, args: b.args })} /></div> : null}
      {!caps.admin && editable ? <p className="mt-2 text-xs text-muted-foreground">Somente o Administrador aprova uma minuta.</p> : null}

      <h3 className="mb-1 mt-4 flex items-center gap-1 text-sm font-semibold">Trilha de auditoria da minuta<HelpHint helpId="seguros.minutas.trilha" /></h3>
      {trail.length ? <ul className="text-sm">{trail.map((a) => (<li key={a.id}>{formatDateTime(a.occurred_at)} — {labelOf(AUDIT_ENTITY_LABEL, a.entity_type)} · {a.action} · {a.actor_user_id ? data.actors[a.actor_user_id] ?? a.actor_user_id.slice(0, 8) : "SEM DADOS"}</li>))}</ul> : <p className="text-sm text-muted-foreground">{textOrNoData(null)}: sem eventos na janela carregada (últimos 300 do projeto).</p>}
    </Section>
  );
}
