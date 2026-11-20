"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runInsurancePersistence } from "@/app/[projectId]/seguros/actions-persistencia";
import { HelpHint } from "@/components/shared/help-hint";
import { SELECT_CLASS } from "@/components/ui/select";
import { ActionButton, Callout, NoData, Section, SourceLink, StatusBadge, buildOptionSets, useWorkspace } from "@/components/insurance/kit";
import { RCC_QUESTIONS, evaluateRccChecklist, type RccAnswer, type RccKey } from "@/lib/insurance/rcc-checklist";
import { auditPolicySubjects } from "@/lib/insurance/subjects-audit";
import type { PartyRole } from "@/lib/insurance/types";
import { formatDateTime } from "@/lib/insurance-ui/format";
import { EPISTEMIC_LABEL, labelOf } from "@/lib/insurance-ui/labels";
import { toPolicyParties } from "@/lib/insurance-ui/model";
import {
  SUBJECT_ROLES,
  SUBJECT_SOURCE_KINDS,
  toAuditExpected,
  validateExpectedSubjectForm,
  validateRccAnswers,
  type ExpectedSubjectForm,
  type ExpectedSubjectView,
  type PersistenceInput,
  type SubjectSourceKind,
} from "@/lib/insurance-ui/persistence";
import { currentExpectedFor, latestRccFor, type PersistedSupport } from "@/lib/insurance-ui/persistence-data";

// Aba "Sujeitos e RCC" com PERSISTÊNCIA (Fase 3 / E): sujeitos ESPERADOS por apólice (com fonte e versão) e checklist RCC versionado
// (toda resposta com fonte). Escrita só pelas RPCs insurance_expected_subject_save / insurance_rcc_checklist_save (server action
// runInsurancePersistence). Nada é enviado a terceiros; revisão humana continua necessária. A autoridade de permissão é o banco.

const SEVERITY_VARIANT = { ALTA: "destructive", MEDIA: "warning", INFO: "secondary" } as const;
const inputClass = "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring";

function usePersistenceRunner() {
  const { projectId } = useWorkspace();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = (input: Omit<PersistenceInput, "projectId">, okMessage: string) => {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const res = await runInsurancePersistence({ ...input, projectId });
      if (res.ok) {
        setNotice(okMessage);
        router.refresh();
      } else setError({ message: res.error.message, conflict: res.error.conflict });
    });
  };
  return { run, pending, error, notice, reload: () => { setError(null); router.refresh(); } };
}

function Feedback({ runner }: { runner: ReturnType<typeof usePersistenceRunner> }) {
  return (
    <>
      {runner.error ? (
        <Callout tone="danger" role="alert">
          <p>{runner.error.message}</p>
          {runner.error.conflict ? <p className="mt-2"><ActionButton label="Recarregar dados" helpId="seguros.acoes.recarregar" variant="outline" onClick={runner.reload} /></p> : null}
        </Callout>
      ) : null}
      {runner.notice ? <Callout tone="ok" role="status">{runner.notice}</Callout> : null}
    </>
  );
}

function Labeled({ id, label, helpId, children }: { id: string; label: string; helpId: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor={id}>{label}</label><HelpHint helpId={helpId} /></span>
      {children}
    </div>
  );
}

export function PersistedSubjectsPanel({ persisted }: { persisted: PersistedSupport }) {
  const { data, target } = useWorkspace();
  const [policyId, setPolicyId] = useState(target.policyId ?? data.policies[0]?.id ?? "");
  const options = buildOptionSets(data);
  return (
    <div className="flex flex-col gap-4">
      {persisted.unavailable ? (
        <Callout tone="warn" role="alert">A persistência de sujeitos esperados e do checklist RCC ainda não está habilitada neste ambiente (migrations pendentes). Nada foi carregado; isto NÃO significa que não há registros.</Callout>
      ) : Object.keys(persisted.errors).length ? (
        <Callout tone="danger" role="alert">Não foi possível carregar: {Object.keys(persisted.errors).map((k) => (k === "expectedSubjects" ? "sujeitos esperados" : "checklists RCC")).join(", ")}. A ausência de linhas abaixo NÃO significa ausência de dados.</Callout>
      ) : null}
      <Section title="Apólice analisada" helpId="seguros.sujeitos.seletor-apolice">
        <div className="flex flex-col gap-1 sm:w-96">
          <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="seg-sp-pol">Apólice</label></span>
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.seletor-apolice) é renderizado no título da seção logo acima */}
          <select id="seg-sp-pol" className={`${SELECT_CLASS} min-h-11 w-full`} value={policyId} onChange={(e) => setPolicyId(e.target.value)}>
            {data.policies.length === 0 ? <option value="">SEM DADOS: nenhuma apólice</option> : null}
            {options.policies?.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </div>
      </Section>
      {policyId ? <PolicyBody key={policyId} policyId={policyId} persisted={persisted} /> : <p className="text-sm text-muted-foreground">SEM DADOS: cadastre uma apólice para registrar sujeitos esperados e o checklist RCC.</p>}
    </div>
  );
}

function PolicyBody({ policyId, persisted }: { policyId: string; persisted: PersistedSupport }) {
  const { data, caps } = useWorkspace();
  const policy = data.policies.find((p) => p.id === policyId) ?? null;
  const current = currentExpectedFor(persisted.expectedSubjects, policyId);
  const history = persisted.expectedSubjects.filter((v) => v.policyId === policyId).sort((a, b) => a.partyRole.localeCompare(b.partyRole) || b.versionNo - a.versionNo);
  const audit = policy ? auditPolicySubjects(toPolicyParties(data.parties.filter((p) => p.policy_id === policyId)), toAuditExpected(current)) : null;
  return (
    <>
      <ExpectedSubjectsSection policyId={policyId} current={current} history={history} canManage={caps.manage} actors={data.actors} />
      <Section title="Auditoria dos sujeitos (cadastrado x esperado gravado)" helpId="seguros.sujeitos.persist-auditoria">
        {audit ? (
          <>
            <Callout tone="info">Compara as partes ATIVAS da apólice com as expectativas GRAVADAS (cada uma com a sua fonte). Sem expectativa gravada, o sujeito não é conferido (nada é presumido). Divergência é inferência: exige revisão humana.</Callout>
            {audit.findings.length === 0 ? <div className="mt-2"><Callout tone="ok">Nenhum achado: os sujeitos cadastrados estão coerentes com as expectativas gravadas. Revisão humana continua necessária.</Callout></div> : (
              <ul className="mt-2 flex flex-col gap-2">
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
        ) : <p className="text-sm text-muted-foreground">SEM DADOS: apólice não encontrada.</p>}
      </Section>
      <RccSection policyId={policyId} persisted={persisted} />
    </>
  );
}

/* ------------------------------------------------------------- sujeitos esperados ------------------------------------------------------------- */

const EXPECTATION_LABEL = { ESPERADO: "Esperado", NAO_ESPERADO: "Não esperado (a fonte indica que não há)" } as const;

function ExpectedSubjectsSection({ policyId, current, history, canManage, actors }: { policyId: string; current: ExpectedSubjectView[]; history: ExpectedSubjectView[]; canManage: boolean; actors: Record<string, string> }) {
  const { data } = useWorkspace();
  const runner = usePersistenceRunner();
  const [role, setRole] = useState<PartyRole>("SEGURADO");
  const cur = current.find((c) => c.partyRole === role) ?? null;
  const [form, setForm] = useState<ExpectedSubjectForm>({ partyRole: "SEGURADO", expectation: "ESPERADO", expectedName: "", expectedTaxId: "", sourceKind: "CONTRATO", sourceDocumentId: null, sourceRef: "", note: "" });
  const errors = validateExpectedSubjectForm({ ...form, partyRole: role });
  const set = (patch: Partial<ExpectedSubjectForm>) => setForm((f) => ({ ...f, ...patch }));
  const who = (id: string | null) => (id ? (actors[id] ?? `${id.slice(0, 8)}…`) : "SEM DADOS");
  return (
    <Section title="Sujeitos esperados (gravados, com fonte e versão)" helpId="seguros.sujeitos.persist-esperados">
      <Callout tone="info">O sujeito esperado é o que a FONTE (contrato, edital, instrução do cliente) indica. Cada alteração grava uma NOVA versão, sem apagar a anterior. Não se presume que o beneficiário final deva figurar como segurado.</Callout>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <caption className="sr-only">Sujeitos esperados vigentes da apólice</caption>
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="p-2">Papel</th><th className="p-2">Expectativa</th><th className="p-2">Nome / documento</th><th className="p-2">Fonte</th><th className="p-2">Versão</th><th className="p-2">Registrado por</th></tr></thead>
          <tbody>
            {SUBJECT_ROLES.map((r) => {
              const c = current.find((x) => x.partyRole === r.role);
              return (
                <tr key={r.role} className="border-t border-border align-top">
                  <td className="p-2 font-medium">{r.label}</td>
                  {c ? (
                    <>
                      <td className="p-2">{c.expectation === "ESPERADO" ? "Esperado" : "Não esperado"}</td>
                      <td className="p-2">{[c.expectedName, c.expectedTaxId].filter(Boolean).join(" · ") || <NoData text="—" />}</td>
                      <td className="p-2">{SUBJECT_SOURCE_KINDS.find((k) => k.value === c.sourceKind)?.label} · <SourceLink documentId={c.sourceDocumentId} sourceRef={c.sourceRef} /></td>
                      <td className="p-2">v{c.versionNo}</td>
                      <td className="p-2">{who(c.createdBy)} <span className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</span></td>
                    </>
                  ) : (<td className="p-2" colSpan={5}><NoData text="SEM DADOS: expectativa não registrada (o sujeito não é conferido)" /></td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Labeled id="seg-es-role" label="Papel do sujeito" helpId="seguros.sujeitos.persist-papel">
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.persist-papel) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-es-role" className={`${SELECT_CLASS} min-h-11 w-full`} value={role} onChange={(e) => setRole(e.target.value as PartyRole)}>
            {SUBJECT_ROLES.map((r) => (<option key={r.role} value={r.role}>{r.label}</option>))}
          </select>
        </Labeled>
        <Labeled id="seg-es-exp" label="Expectativa" helpId="seguros.sujeitos.persist-expectativa">
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.persist-expectativa) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-es-exp" className={`${SELECT_CLASS} min-h-11 w-full`} value={form.expectation} onChange={(e) => set({ expectation: e.target.value as ExpectedSubjectForm["expectation"] })}>
            {(Object.keys(EXPECTATION_LABEL) as Array<keyof typeof EXPECTATION_LABEL>).map((k) => (<option key={k} value={k}>{EXPECTATION_LABEL[k]}</option>))}
          </select>
        </Labeled>
        <Labeled id="seg-es-name" label="Nome esperado" helpId="seguros.sujeitos.persist-nome">
          {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.persist-nome) é renderizado ao lado do rótulo logo acima */}
          <input id="seg-es-name" className={inputClass} disabled={form.expectation === "NAO_ESPERADO"} value={form.expectedName ?? ""} onChange={(e) => set({ expectedName: e.target.value })} />
        </Labeled>
        <Labeled id="seg-es-tax" label="CNPJ/CPF esperado" helpId="seguros.sujeitos.persist-documento">
          {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.persist-documento) é renderizado ao lado do rótulo logo acima */}
          <input id="seg-es-tax" className={inputClass} disabled={form.expectation === "NAO_ESPERADO"} value={form.expectedTaxId ?? ""} onChange={(e) => set({ expectedTaxId: e.target.value })} />
        </Labeled>
        <Labeled id="seg-es-kind" label="Tipo da fonte da expectativa" helpId="seguros.sujeitos.persist-fonte-tipo">
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.persist-fonte-tipo) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-es-kind" className={`${SELECT_CLASS} min-h-11 w-full`} value={form.sourceKind} onChange={(e) => set({ sourceKind: e.target.value as SubjectSourceKind })}>
            {SUBJECT_SOURCE_KINDS.map((k) => (<option key={k.value} value={k.value}>{k.label}</option>))}
          </select>
        </Labeled>
        <Labeled id="seg-es-doc" label="Documento-fonte" helpId="seguros.sujeitos.persist-fonte-documento">
          {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.persist-fonte-documento) é renderizado ao lado do rótulo logo acima */}
          <select id="seg-es-doc" className={`${SELECT_CLASS} min-h-11 w-full`} value={form.sourceDocumentId ?? ""} onChange={(e) => set({ sourceDocumentId: e.target.value || null })}>
            <option value="">Nenhum (usar a referência)</option>
            {data.documents.map((d) => (<option key={d.id} value={d.id}>{d.title}</option>))}
          </select>
        </Labeled>
        <Labeled id="seg-es-ref" label="Referência da fonte (cláusula, página)" helpId="seguros.sujeitos.persist-fonte-referencia">
          {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.persist-fonte-referencia) é renderizado ao lado do rótulo logo acima */}
          <input id="seg-es-ref" className={inputClass} value={form.sourceRef ?? ""} onChange={(e) => set({ sourceRef: e.target.value })} />
        </Labeled>
        <Labeled id="seg-es-note" label="Nota (opcional)" helpId="seguros.sujeitos.persist-nota">
          {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.persist-nota) é renderizado ao lado do rótulo logo acima */}
          <input id="seg-es-note" className={inputClass} value={form.note ?? ""} onChange={(e) => set({ note: e.target.value })} />
        </Labeled>
      </div>
      {errors.length ? <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{errors.map((e) => (<li key={e}>{e}</li>))}</ul> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton
          label={cur ? `Gravar nova versão (v${cur.versionNo + 1})` : "Gravar expectativa (v1)"}
          helpId="seguros.sujeitos.persist-esperado-salvar"
          level="MANAGE"
          pending={runner.pending}
          extraDisabled={errors.length > 0 || !canManage}
          extraReason={errors.length > 0 ? "Complete os campos obrigatórios (inclusive a fonte)." : undefined}
          onClick={() => runner.run({ op: "subject_save", policyId, expectedVersion: cur?.versionNo ?? 0, subject: { ...form, partyRole: role } }, "Expectativa gravada (nova versão; a anterior foi preservada).")}
        />
      </div>
      <div className="mt-2"><Feedback runner={runner} /></div>
      {history.length > 0 ? (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium">Histórico de versões ({history.length})<HelpHint helpId="seguros.sujeitos.persist-esperado-historico" /></summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {history.map((h) => (
              <li key={h.id} className="rounded-md border border-border p-2">
                <strong>{SUBJECT_ROLES.find((r) => r.role === h.partyRole)?.label} v{h.versionNo}</strong> — {h.expectation === "ESPERADO" ? [h.expectedName, h.expectedTaxId].filter(Boolean).join(" · ") : "não esperado"} · {SUBJECT_SOURCE_KINDS.find((k) => k.value === h.sourceKind)?.label} · {who(h.createdBy)} · {formatDateTime(h.createdAt)}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}

/* ------------------------------------------------------------- checklist RCC ------------------------------------------------------------- */

function RccSection({ policyId, persisted }: { policyId: string; persisted: PersistedSupport }) {
  const { data, caps } = useWorkspace();
  const runner = usePersistenceRunner();
  const { latest, versions } = latestRccFor(persisted.rccChecklists, policyId);
  const [answers, setAnswers] = useState<Partial<Record<RccKey, RccAnswer>>>(() => latest?.answers ?? {});
  const [note, setNote] = useState("");
  const rcc = evaluateRccChecklist(answers);
  const problems = validateRccAnswers(answers);
  const setAnswer = (k: RccKey, patch: Partial<RccAnswer>) => setAnswers((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
  const setSource = (k: RccKey, patch: Partial<NonNullable<RccAnswer["source"]>>) => setAnswers((s) => ({ ...s, [k]: { ...s[k], source: { ...s[k]?.source, ...patch } } }));
  const who = (id: string | null) => (id ? (data.actors[id] ?? `${id.slice(0, 8)}…`) : "SEM DADOS");
  return (
    <Section title="Checklist de Responsabilidade Civil Cruzada (10 perguntas) — gravado" helpId="seguros.sujeitos.rcc">
      <Callout tone="info">Cada resposta exige FONTE (documento ou cláusula); sem resposta = SEM DADOS. Cada gravação cria uma nova versão sem apagar a anterior. O checklist nunca presume que a RCC cubra defeito de execução, retrabalho ou danos à própria obra.</Callout>
      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {latest ? <>Versão vigente: <strong>v{latest.versionNo}</strong> — {who(latest.createdBy)} · {formatDateTime(latest.createdAt)}</> : <NoData text="SEM DADOS: nenhum checklist gravado para esta apólice" />}
        <HelpHint helpId="seguros.sujeitos.persist-rcc-versao" />
      </p>
      <ol className="mt-3 flex flex-col gap-3">
        {RCC_QUESTIONS.map((q) => (
          <li key={q.key} className="rounded-md border border-border p-3">
            <p className="mb-1 flex items-center gap-1 text-sm font-medium">{q.label}<HelpHint helpId="seguros.sujeitos.rcc-resposta" /></p>
            <div className="grid gap-2 sm:grid-cols-2">
              {/* help-exempt: resposta do checklist; o helpId seguros.sujeitos.rcc-resposta está no enunciado logo acima */}
              <textarea aria-label={`Resposta: ${q.label}`} className={`${inputClass} min-h-20`} value={answers[q.key]?.answer ?? ""} onChange={(e) => setAnswer(q.key, { answer: e.target.value })} />
              <div className="flex flex-col gap-1">
                <span className="flex items-center gap-1 text-xs"><label htmlFor={`rccp-src-${q.key}`}>Fonte (cláusula, página)</label><HelpHint helpId="seguros.sujeitos.rcc-fonte" /></span>
                {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.rcc-fonte) é renderizado ao lado do rótulo logo acima */}
                <input id={`rccp-src-${q.key}`} className={inputClass} value={answers[q.key]?.source?.ref ?? ""} onChange={(e) => setSource(q.key, { ref: e.target.value })} />
                <span className="flex items-center gap-1 text-xs"><label htmlFor={`rccp-doc-${q.key}`}>Documento-fonte</label><HelpHint helpId="seguros.sujeitos.persist-rcc-documento" /></span>
                {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.persist-rcc-documento) é renderizado ao lado do rótulo logo acima */}
                <select id={`rccp-doc-${q.key}`} className={`${SELECT_CLASS} min-h-11 w-full`} value={answers[q.key]?.source?.documentId ?? ""} onChange={(e) => setSource(q.key, { documentId: e.target.value || null })}>
                  <option value="">Nenhum (usar a referência)</option>
                  {data.documents.map((d) => (<option key={d.id} value={d.id}>{d.title}</option>))}
                </select>
                {q.key === "BENS_TERCEIROS_X_PROPRIA_OBRA" ? (
                  <>
                    <span className="flex items-center gap-1 text-xs"><label htmlFor="rccp-scope">Natureza do bem atingido</label><HelpHint helpId="seguros.sujeitos.rcc-escopo-bem" /></span>
                    {/* help-exempt: seletor cujo ícone de ajuda (seguros.sujeitos.rcc-escopo-bem) é renderizado ao lado do rótulo logo acima */}
                    <select id="rccp-scope" className={`${SELECT_CLASS} min-h-11 w-full`} value={answers.BENS_TERCEIROS_X_PROPRIA_OBRA?.propertyScope ?? ""} onChange={(e) => setAnswer("BENS_TERCEIROS_X_PROPRIA_OBRA", { propertyScope: (e.target.value || null) as RccAnswer["propertyScope"] })}>
                      <option value="">Não informado</option>
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
      <div className="mt-3 flex flex-col gap-1 sm:w-96">
        <span className="flex items-center gap-1 text-sm font-medium"><label htmlFor="rccp-note">Nota da versão (opcional)</label><HelpHint helpId="seguros.sujeitos.persist-rcc-nota" /></span>
        {/* help-exempt: campo cujo ícone de ajuda (seguros.sujeitos.persist-rcc-nota) é renderizado ao lado do rótulo logo acima */}
        <input id="rccp-note" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="mt-3 rounded-md border border-border p-3 text-sm" aria-live="polite">
        <p className="flex flex-wrap items-center gap-2"><strong>{rcc.answeredWithSource} de {rcc.total} respondidas com fonte.</strong> {rcc.readyForCoverageAssessment ? <StatusBadge text="Pronto para avaliação de cobertura (com revisão humana)" variant="success" /> : <StatusBadge text="Ainda NÃO apto para avaliação de cobertura" variant="warning" />}</p>
        {rcc.warnings.length ? <ul className="mt-2 list-disc pl-5">{rcc.warnings.map((w) => (<li key={w}>{w}</li>))}</ul> : null}
        <p className="mt-2 text-xs font-semibold">Nunca presumido:</p>
        <ul className="list-disc pl-5 text-xs">{rcc.neverPresumed.map((w) => (<li key={w}>{w}</li>))}</ul>
      </div>
      {problems.length ? <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{problems.map((p) => (<li key={p}>{p}</li>))}</ul> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton
          label={latest ? `Gravar nova versão (v${latest.versionNo + 1})` : "Gravar checklist (v1)"}
          helpId="seguros.sujeitos.persist-rcc-salvar"
          level="REGISTER"
          pending={runner.pending}
          extraDisabled={problems.length > 0 || !caps.register}
          extraReason={problems.length > 0 ? "Corrija as pendências: toda resposta exige fonte." : undefined}
          onClick={() => runner.run({ op: "rcc_save", policyId, claimId: null, expectedVersion: latest?.versionNo ?? 0, rccAnswers: answers, note }, "Checklist gravado (nova versão; a anterior foi preservada).")}
        />
      </div>
      <div className="mt-2"><Feedback runner={runner} /></div>
      {versions.length > 0 ? (
        <details className="mt-3">
          <summary className="flex min-h-11 cursor-pointer items-center gap-1 text-sm font-medium">Versões gravadas ({versions.length})<HelpHint helpId="seguros.sujeitos.persist-rcc-historico" /></summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {versions.map((v) => (
              <li key={v.id} className="rounded-md border border-border p-2"><strong>v{v.versionNo}</strong> — {Object.keys(v.answers).length} de 10 respondidas · {who(v.createdBy)} · {formatDateTime(v.createdAt)}{v.note ? ` · ${v.note}` : ""}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}
