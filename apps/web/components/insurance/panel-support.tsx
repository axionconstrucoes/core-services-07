"use client";

import { useState } from "react";
import { HelpHint } from "@/components/shared/help-hint";
import { SELECT_CLASS } from "@/components/ui/select";
import { ActionButton, Callout, DataTable, NoData, RunnerFeedback, Section, SourceLink, SpecForm, StatusBadge, buildOptionSets, useInsuranceRunner, useWorkspace, type Column } from "@/components/insurance/kit";
import { INSURANCE_REFERENCES, INSURANCE_REFERENCES_DISCLAIMER, RCC_QUESTIONS, evaluateRccChecklist, type LegalReference, type RccAnswer, type RccKey } from "@/lib/insurance/index";
import { FORMS } from "@/lib/insurance-ui/forms";
import { formatDateTime, textOrNoData } from "@/lib/insurance-ui/format";
import { AUDIT_ENTITY_LABEL, CHANNEL_TYPE_LABEL, EPISTEMIC_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { channelAvailability, CHANNEL_AVAILABILITY_TEXT, subjectsAuditFor } from "@/lib/insurance-ui/model";
import type { AuditEventRow, ChannelRow } from "@/lib/insurance-ui/types";

/* -------------------------------------------------------------------- canais -------------------------------------------------------------------- */

function VerifyButton({ channel }: { channel: ChannelRow }) {
  const runner = useInsuranceRunner();
  return (
    <div className="flex flex-col gap-1">
      <ActionButton label={channel.verified_at ? "Verificado" : "Marcar como verificado"} helpId="seguros.acoes.canal-verificar" level="MANAGE" variant="outline" pending={runner.pending} extraDisabled={Boolean(channel.verified_at)} extraReason="Já verificado." onClick={() => void runner.run({ op: "channel_verify", id: channel.id }, "Canal verificado.")} />
      <RunnerFeedback runner={runner} />
    </div>
  );
}

export function ChannelsPanel() {
  const { data } = useWorkspace();
  const options = buildOptionSets(data);
  const [showNew, setShowNew] = useState(false);
  const cols: Column<ChannelRow>[] = [
    { key: "ent", label: "Seguradora / banco", render: (c) => c.entity_name },
    { key: "type", label: "Tipo", render: (c) => labelOf(CHANNEL_TYPE_LABEL, c.channel_type) },
    { key: "val", label: "Canal", render: (c) => c.channel_value },
    { key: "link", label: "Vinculado a", render: (c) => (c.policy_id ? `Apólice ${data.policies.find((p) => p.id === c.policy_id)?.policy_number ?? "(nº SEM DADOS)"}` : c.bank_guarantee_id ? "Fiança bancária" : <NoData text="sem vínculo" />) },
    { key: "st", label: "Disponibilidade", helpId: "seguros.status.canal", render: (c) => { const s = channelAvailability(c); return <StatusBadge text={s === "DISPONIVEL" ? "Ativo e verificado" : s === "INATIVO" ? "Inativo" : "Não verificado"} variant={s === "DISPONIVEL" ? "success" : "warning"} />; } },
    { key: "src", label: "Fonte do cadastro", render: (c) => <SourceLink documentId={c.source_document_id} sourceRef={c.source_ref} /> },
    { key: "do", label: "Ação", render: (c) => <VerifyButton channel={c} /> },
  ];
  return (
    <div className="flex flex-col gap-4">
      <Callout tone="info">Canal oficial é DADO CADASTRADO com fonte (documento ou referência): o sistema nunca inventa e-mail, portal ou endereço de seguradora ou banco. {CHANNEL_AVAILABILITY_TEXT.SEM_CANAL}</Callout>
      <Section title="Canais oficiais cadastrados" helpId="seguros.canais.tabela" actions={<ActionButton label={showNew ? "Fechar formulário" : "Cadastrar canal"} helpId="seguros.acoes.canal-novo" level="MANAGE" variant="outline" onClick={() => setShowNew((v) => !v)} />}>
        <DataTable columns={cols} rows={data.channels} empty="SEM DADOS: nenhum canal oficial cadastrado." caption="Canais oficiais" />
        {showNew ? <div className="mt-3"><SpecForm spec={FORMS.channelRegister} options={options} level="MANAGE" okMessage="Canal cadastrado (ainda não verificado)." onCancel={() => setShowNew(false)} onDone={() => setShowNew(false)} toInput={(b) => ({ op: "channel_register", data: b.data })} /></div> : null}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------- sujeitos da apólice e RCC ---------------------------------------------------------- */

const SEVERITY_VARIANT = { ALTA: "destructive", MEDIA: "warning", INFO: "secondary" } as const;

export function SubjectsPanel() {
  const { data, target } = useWorkspace();
  const [policyId, setPolicyId] = useState(target.policyId ?? data.policies[0]?.id ?? "");
  const [insuredName, setInsuredName] = useState("");
  const [insuredTaxId, setInsuredTaxId] = useState("");
  const [mentions, setMentions] = useState("");
  const policy = data.policies.find((p) => p.id === policyId) ?? null;
  const audit = policy ? subjectsAuditFor(policy, data.parties, { insuredName, insuredTaxId, mentionsFinal: mentions === "" ? null : mentions === "true" }) : null;
  const [answers, setAnswers] = useState<Partial<Record<RccKey, RccAnswer>>>({});
  const rcc = evaluateRccChecklist(answers);
  const setAnswer = (k: RccKey, patch: Partial<RccAnswer>) => setAnswers((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
  const inputClass = "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex flex-col gap-4">
      <Section title="Auditoria dos sujeitos da apólice" helpId="seguros.sujeitos.auditoria">
        <div className="mb-3 flex flex-col gap-1 sm:w-96">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-s-pol">Apólice</label><HelpHint helpId="seguros.sujeitos.seletor-apolice" /></span>
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.seletor-apolice) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-s-pol" className={`${SELECT_CLASS} min-h-11 w-full`} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
            {data.policies.length === 0 ? <option value="">SEM DADOS: nenhuma apólice</option> : null}
            {buildOptionSets(data).policies?.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </div>
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-s-name">Segurado esperado pelo contrato (nome)</label><HelpHint helpId="seguros.sujeitos.campo-segurado-esperado" /></span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.campo-segurado-esperado) é renderizado ao lado do rótulo logo acima */}
            <input id="seg-s-name" className={inputClass} value={insuredName} onChange={(e) => setInsuredName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-s-tax">Segurado esperado (CNPJ/CPF)</label><HelpHint helpId="seguros.sujeitos.campo-segurado-esperado-doc" /></span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.campo-segurado-esperado-doc) é renderizado ao lado do rótulo logo acima */}
            <input id="seg-s-tax" className={inputClass} value={insuredTaxId} onChange={(e) => setInsuredTaxId(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-s-fin">O contrato cita beneficiário final?</label><HelpHint helpId="seguros.sujeitos.campo-contrato-cita-beneficiario" /></span>
            {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.campo-contrato-cita-beneficiario) é renderizado ao lado do rótulo logo acima */}
            <select id="seg-s-fin" className={`${SELECT_CLASS} min-h-11 w-full`} value={mentions} onChange={(e) => setMentions(e.target.value)}>
              <option value="">Não informado</option>
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">Os dados “esperados” são digitados aqui para conferência e não são gravados. Os sujeitos cadastrados vêm da apólice.</p>
        {audit ? (
          <>
            {audit.findings.length === 0 ? <Callout tone="ok">Nenhum achado: os sujeitos cadastrados estão coerentes com o informado. Revisão humana continua necessária.</Callout> : (
              <ul className="flex flex-col gap-2">
                {audit.findings.map((f) => (
                  <li key={f.code} className="flex flex-wrap items-baseline gap-2 rounded-md border border-border p-2 text-sm">
                    <StatusBadge text={f.code.replaceAll("_", " ")} variant={SEVERITY_VARIANT[f.severity]} />
                    <StatusBadge text={labelOf(EPISTEMIC_LABEL, f.epistemic)} variant="outline" helpId="seguros.status.epistemico" />
                    <span>{f.text}</span>
                  </li>
                ))}
              </ul>
            )}
            <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{audit.notes.map((n) => (<li key={n}>{n}</li>))}</ul>
          </>
        ) : <p className="text-sm text-muted-foreground">SEM DADOS: cadastre uma apólice para auditar seus sujeitos.</p>}
      </Section>

      <Section title="Checklist de Responsabilidade Civil Cruzada (10 perguntas)" helpId="seguros.sujeitos.rcc">
        <Callout tone="info">As respostas ficam apenas nesta tela (não são gravadas). Resposta sem fonte NÃO conta como evidência. O checklist nunca presume que a RCC cubra defeito de execução, retrabalho ou danos à própria obra.</Callout>
        <ol className="mt-3 flex flex-col gap-3">
          {RCC_QUESTIONS.map((q) => (
            <li key={q.key} className="rounded-md border border-border p-3">
              <p className="mb-1 flex items-center gap-1 text-sm font-medium">{q.label}<HelpHint helpId="seguros.sujeitos.rcc-resposta" /></p>
              <div className="grid gap-2 sm:grid-cols-2">
                {/* help-exempt: resposta do checklist; o helpId seguros.sujeitos.rcc-resposta está no enunciado logo acima */}
                <textarea aria-label={`Resposta: ${q.label}`} className={`${inputClass} min-h-20`} value={answers[q.key]?.answer ?? ""} onChange={(e) => setAnswer(q.key, { answer: e.target.value })} />
                <div className="flex flex-col gap-1">
                  <span className="flex items-center gap-1 text-xs"><label htmlFor={`rcc-src-${q.key}`}>Fonte (documento, página, cláusula)</label><HelpHint helpId="seguros.sujeitos.rcc-fonte" /></span>
                  {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.rcc-fonte) é renderizado ao lado do rótulo logo acima */}
                  <input id={`rcc-src-${q.key}`} className={inputClass} value={answers[q.key]?.source?.ref ?? ""} onChange={(e) => setAnswer(q.key, { source: { ref: e.target.value } })} />
                  {q.key === "BENS_TERCEIROS_X_PROPRIA_OBRA" ? (
                    <>
                      <span className="flex items-center gap-1 text-xs"><label htmlFor="rcc-scope">Natureza do bem atingido</label><HelpHint helpId="seguros.sujeitos.rcc-escopo-bem" /></span>
                      {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.rcc-escopo-bem) é renderizado ao lado do rótulo logo acima */}
                      <select id="rcc-scope" className={`${SELECT_CLASS} min-h-11 w-full`} value={answers.BENS_TERCEIROS_X_PROPRIA_OBRA?.propertyScope ?? ""} onChange={(e) => setAnswer("BENS_TERCEIROS_X_PROPRIA_OBRA", { propertyScope: (e.target.value || null) as RccAnswer["propertyScope"] })}>
                        <option value="">Indefinido</option>
                        <option value="BENS_TERCEIROS">Bens de terceiros</option>
                        <option value="PROPRIA_OBRA">Própria obra</option>
                        <option value="AMBOS">Ambos</option>
                        <option value="INDEFINIDO">Indefinido</option>
                      </select>
                    </>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-md border border-border p-3 text-sm" aria-live="polite">
          <p className="flex flex-wrap items-center gap-2"><strong>{rcc.answeredWithSource} de {rcc.total} respondidas com fonte.</strong> {rcc.readyForCoverageAssessment ? <StatusBadge text="Pronto para avaliação de cobertura (com revisão humana)" variant="success" /> : <StatusBadge text="Ainda NÃO apto para avaliação de cobertura" variant="warning" />}</p>
          {rcc.warnings.length ? <ul className="mt-2 list-disc pl-5">{rcc.warnings.map((w) => (<li key={w}>{w}</li>))}</ul> : null}
          <p className="mt-2 text-xs font-semibold">Nunca presumido:</p>
          <ul className="list-disc pl-5 text-xs">{rcc.neverPresumed.map((w) => (<li key={w}>{w}</li>))}</ul>
        </div>
      </Section>
    </div>
  );
}

/* --------------------------------------------------------------- referências / auditoria --------------------------------------------------------------- */

export function ReferencesPanel() {
  const refs: Array<LegalReference & { id: string }> = INSURANCE_REFERENCES;
  return (
    <Section title="Referências jurídicas e técnicas" helpId="seguros.referencias.lista">
      <Callout tone="warn">{INSURANCE_REFERENCES_DISCLAIMER}</Callout>
      <ul className="mt-3 flex flex-col gap-3">
        {refs.map((r) => (
          <li key={r.id} className="rounded-md border border-border p-3 text-sm">
            <p className="flex flex-wrap items-center gap-2 font-medium">
              {r.title}
              <StatusBadge text={r.status.replaceAll("_", " ")} variant={r.status === "CONFIRMADO_FONTE_OFICIAL" ? "success" : r.status === "NAO_VERIFICADO_NESTA_RODADA" ? "warning" : "info"} helpId="seguros.referencias.status" />
            </p>
            <p className="text-xs text-muted-foreground">Verificada em {r.checkedAt} · Fonte: {r.source}</p>
            <p className="mt-1">{r.whatWasRead}</p>
            <p className="mt-1 text-xs font-semibold">Limitações</p>
            <ul className="list-disc pl-5 text-xs">{r.limitations.map((l) => (<li key={l}>{l}</li>))}</ul>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function AuditPanel() {
  const { data } = useWorkspace();
  const [entity, setEntity] = useState("");
  const [text, setText] = useState("");
  const rows = data.audit.filter((a) => (!entity || a.entity_type === entity) && (!text || a.action.toLowerCase().includes(text.toLowerCase()) || JSON.stringify(a.detail ?? {}).toLowerCase().includes(text.toLowerCase())));
  const cols: Column<AuditEventRow>[] = [
    { key: "at", label: "Quando", render: (a) => formatDateTime(a.occurred_at) },
    { key: "ent", label: "Objeto", render: (a) => labelOf(AUDIT_ENTITY_LABEL, a.entity_type) },
    { key: "act", label: "Ação", render: (a) => a.action },
    { key: "by", label: "Quem", render: (a) => (a.actor_user_id ? data.actors[a.actor_user_id] ?? a.actor_user_id.slice(0, 8) : "SEM DADOS") },
    { key: "det", label: "Detalhe", render: (a) => <span className="break-words text-xs">{textOrNoData(a.detail && Object.keys(a.detail).length ? JSON.stringify(a.detail).slice(0, 240) : null)}</span> },
  ];
  return (
    <Section title="Trilha de auditoria (somente leitura)" helpId="seguros.auditoria.tabela">
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-au-ent">Objeto</label><HelpHint helpId="seguros.auditoria.filtro-entidade" /></span>
          {/* help-exempt: filtro cujo ícone de ajuda (seguros.auditoria.filtro-entidade) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-au-ent" className={`${SELECT_CLASS} min-h-11 w-full`} value={entity} onChange={(e) => setEntity(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(AUDIT_ENTITY_LABEL).map(([v, l]) => (<option key={v} value={v}>{l}</option>))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-au-txt">Buscar na ação ou no detalhe</label><HelpHint helpId="seguros.auditoria.filtro-texto" /></span>
          {/* help-exempt: campo cujo ícone de ajuda (seguros.auditoria.filtro-texto) é renderizado ao lado do rótulo logo acima */}
          <input id="seg-au-txt" className="flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
      </div>
      <DataTable columns={cols} rows={rows} empty="SEM DADOS: nenhum evento de auditoria (ou nenhum corresponde ao filtro)." caption="Eventos de auditoria" />
      <p className="mt-2 text-xs text-muted-foreground">Mostra os 300 eventos mais recentes do projeto. A trilha é append-only no banco: ninguém altera nem apaga.</p>
    </Section>
  );
}
