"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HelpHint } from "@/components/shared/help-hint";
import { Button } from "@/components/ui/button";
import { SELECT_CLASS } from "@/components/ui/select";
import { runCompetenceAction } from "@/app/[projectId]/seguros/actions-competencias";
import { Callout, DataTable, NoData, Section, StatusBadge, useWorkspace, type Column } from "@/components/insurance/kit";
import { formatDateTime } from "@/lib/insurance-ui/format";
import type { ProjectCompetenceRow } from "@/lib/insurance-ui/types";
import { COMPETENCES, COMPETENCE_DESCRIPTION, COMPETENCE_LABEL, REGISTRATION_KINDS, canGrantCompetence } from "@/lib/permissions/competences";

// FASE 4 / A — Competências profissionais por membro/projeto. O banco (project_competence_grant/revoke) é a autoridade: só ADMINISTRADOR
// concede/revoga, ninguém concede a si mesmo, tudo auditado. A identificação CREA/OAB é texto DECLARADO; o sistema não a valida nem a inventa.
const INPUT =
  "flex min-h-11 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm text-foreground shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

function statusOf(c: ProjectCompetenceRow, today: string): { text: string; variant: "success" | "warning" | "secondary" } {
  if (c.status === "REVOKED") return { text: "Revogada", variant: "secondary" };
  if (c.valid_from > today) return { text: "Ainda não vigente", variant: "warning" };
  if (c.valid_until && c.valid_until < today) return { text: "Vencida", variant: "warning" };
  return { text: "Ativa", variant: "success" };
}

const labelOfCompetence = (c: string): string => COMPETENCE_LABEL[c as keyof typeof COMPETENCE_LABEL] ?? c;

export function CompetencesPanel() {
  const { data, caps, currentUserId, today, projectId } = useWorkspace();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [userId, setUserId] = useState("");
  const [competence, setCompetence] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [kind, setKind] = useState("");
  const [number, setNumber] = useState("");
  const [basis, setBasis] = useState("");
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const nameOf = (id: string | null) => (id ? (data.actors[id] ?? `usuário ${id.slice(0, 8)}`) : "SEM DADOS");
  const mine = data.competences.filter((c) => c.user_id === currentUserId && statusOf(c, today).text === "Ativa");
  const candidates = data.competenceMembers.filter((m) => m.userId !== currentUserId);
  const gate = canGrantCompetence(caps.admin, currentUserId, userId || "pendente");

  const run = (input: Parameters<typeof runCompetenceAction>[0], ok: string, after?: () => void) => {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await runCompetenceAction(input);
      if (res.ok) {
        setNotice(ok);
        after?.();
        router.refresh();
      } else setError(res.error.message);
    });
  };

  const cols: Column<ProjectCompetenceRow>[] = [
    { key: "who", label: "Pessoa", render: (c) => nameOf(c.user_id) },
    { key: "comp", label: "Competência", render: (c) => labelOfCompetence(c.competence) },
    {
      key: "st",
      label: "Situação",
      helpId: "seguros.competencias.coluna-situacao",
      render: (c) => {
        const s = statusOf(c, today);
        return <StatusBadge text={s.text} variant={s.variant} />;
      },
    },
    { key: "val", label: "Validade", render: (c) => `${c.valid_from} a ${c.valid_until ?? "sem fim"}` },
    {
      key: "reg",
      label: "Registro profissional (declarado)",
      helpId: "seguros.competencias.coluna-registro",
      render: (c) => (c.registration_kind ? `${c.registration_kind}${c.registration_number ? ` ${c.registration_number}` : ""}` : <NoData text="Não informado" />),
    },
    { key: "by", label: "Concedida por", render: (c) => `${nameOf(c.granted_by)} em ${formatDateTime(c.granted_at)}` },
    {
      key: "act",
      label: "Ação",
      render: (c) =>
        c.status === "ACTIVE" && caps.admin ? (
          <span className="inline-flex items-center gap-1">
            {/* help-exempt: botão da linha; o ícone de ajuda seguros.competencias.revogar-abrir é renderizado logo ao lado */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 px-4"
              onClick={() => {
                setRevokeId(c.id);
                setReason("");
              }}
            >
              Revogar
            </Button>
            <HelpHint helpId="seguros.competencias.revogar-abrir" />
          </span>
        ) : c.status === "REVOKED" ? (
          <span className="text-xs text-muted-foreground">Revogada: {c.revoke_reason}</span>
        ) : (
          <NoData text="—" />
        ),
    },
  ];
  const revoking = revokeId ? data.competences.find((c) => c.id === revokeId) : null;

  return (
    <Section title="Competências profissionais" helpId="seguros.competencias.painel">
      <p className="mb-3 text-sm">
        Competência é a habilitação profissional registrada pelo Administrador (responsável técnico, jurídico, seguros). Ela é exigida além do nível de acesso para decisões técnicas e jurídicas
        relevantes: o nível de gestão (Gestor, Gerente, Administrador) não a substitui.
      </p>
      {data.competencesError ? (
        <div className="mb-3">
          <Callout tone="danger" role="alert">
            {data.competencesError}
          </Callout>
        </div>
      ) : null}
      <div className="mb-3 rounded-md border border-border p-3 text-sm">
        <h3 className="mb-1 flex items-center gap-1 font-semibold">
          Minhas competências vigentes
          <HelpHint helpId="seguros.competencias.minhas" />
        </h3>
        {mine.length ? <p>{mine.map((c) => labelOfCompetence(c.competence)).join(", ")}.</p> : <p>Nenhuma. Decisões que exigem competência ficarão bloqueadas para você.</p>}
      </div>
      <DataTable
        columns={cols}
        rows={data.competences}
        empty="Nenhuma competência registrada neste projeto (ou você não tem permissão para listar as dos demais)."
        caption="Competências profissionais do projeto"
      />
      {revoking ? (
        <div className="mt-3 rounded-md border border-border p-3">
          <h3 className="mb-2 flex items-center gap-1 text-sm font-semibold">
            Revogar a competência {labelOfCompetence(revoking.competence)} de {nameOf(revoking.user_id)}
            <HelpHint helpId="seguros.competencias.form-revogar" />
          </h3>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-rev-reason">Motivo da revogação (mínimo de 10 caracteres)</label>
              <HelpHint helpId="seguros.competencias.campo-motivo-revogacao" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-motivo-revogacao) é renderizado ao lado do rótulo logo acima */}
            <input id="comp-rev-reason" className={INPUT} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {/* help-exempt: botão com ícone de ajuda (seguros.competencias.revogar) ao lado */}
            <Button
              type="button"
              size="sm"
              className="min-h-11 px-4"
              disabled={pending || reason.trim().length < 10}
              onClick={() => run({ projectId, op: "competence_revoke", id: revoking.id, expectedRowVersion: revoking.row_version, reason }, "Competência revogada.", () => setRevokeId(null))}
            >
              {pending ? "Aguarde…" : "Confirmar revogação"}
            </Button>
            <HelpHint helpId="seguros.competencias.revogar" />
            {/* help-exempt: botão auxiliar de cancelar; sem efeito no banco */}
            <Button type="button" variant="outline" size="sm" className="min-h-11 px-4" onClick={() => setRevokeId(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
      {caps.admin ? (
        // help-exempt: formulário cujo título tem o ícone de ajuda seguros.competencias.form-conceder e cujos campos e botão têm ícones próprios
        <form
          className="mt-4 grid gap-3 rounded-md border border-border p-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              {
                projectId,
                op: "competence_grant",
                userId,
                competence,
                data: { valid_from: validFrom || undefined, valid_until: validUntil || undefined, registration_kind: kind || undefined, registration_number: number || undefined, basis_note: basis || undefined },
              },
              "Competência concedida e auditada.",
              () => {
                setUserId("");
                setCompetence("");
                setValidFrom("");
                setValidUntil("");
                setKind("");
                setNumber("");
                setBasis("");
              },
            );
          }}
        >
          <h3 className="flex items-center gap-1 text-sm font-semibold md:col-span-2">
            Conceder competência (somente Administrador)
            <HelpHint helpId="seguros.competencias.form-conceder" />
          </h3>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-user">Pessoa (membro ativo)</label>
              <HelpHint helpId="seguros.competencias.campo-pessoa" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-pessoa) é renderizado ao lado do rótulo logo acima */}
            <select id="comp-user" required className={`${SELECT_CLASS} min-h-11 w-full`} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Selecione…</option>
              {candidates.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {nameOf(m.userId)} ({m.permission})
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-kind-c">Competência</label>
              <HelpHint helpId="seguros.competencias.campo-competencia" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-competencia) é renderizado ao lado do rótulo logo acima */}
            <select id="comp-kind-c" required className={`${SELECT_CLASS} min-h-11 w-full`} value={competence} onChange={(e) => setCompetence(e.target.value)}>
              <option value="">Selecione…</option>
              {COMPETENCES.map((c) => (
                <option key={c} value={c}>
                  {COMPETENCE_LABEL[c]}
                </option>
              ))}
            </select>
            {competence ? <span className="text-xs text-muted-foreground">{COMPETENCE_DESCRIPTION[competence as keyof typeof COMPETENCE_DESCRIPTION]}</span> : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-from">Válida a partir de (opcional; padrão hoje)</label>
              <HelpHint helpId="seguros.competencias.campo-validade" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-validade) é renderizado ao lado do rótulo logo acima */}
            <input id="comp-from" type="date" className={INPUT} value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-until">Válida até (opcional; sem data = sem fim)</label>
              <HelpHint helpId="seguros.competencias.campo-validade" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-validade) é renderizado ao lado do rótulo logo acima */}
            <input id="comp-until" type="date" className={INPUT} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-regkind">Tipo do registro profissional (opcional)</label>
              <HelpHint helpId="seguros.competencias.campo-registro" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-registro) é renderizado ao lado do rótulo logo acima */}
            <select id="comp-regkind" className={`${SELECT_CLASS} min-h-11 w-full`} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">Não informado</option>
              {REGISTRATION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-regnum">Número do registro (opcional; texto declarado, não validado)</label>
              <HelpHint helpId="seguros.competencias.campo-registro" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-registro) é renderizado ao lado do rótulo logo acima */}
            <input id="comp-regnum" className={INPUT} maxLength={60} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <span className="flex items-center gap-1 text-sm font-medium">
              <label htmlFor="comp-basis">Observação / base da concessão (opcional)</label>
              <HelpHint helpId="seguros.competencias.campo-observacao" />
            </span>
            {/* help-exempt: campo cujo ícone de ajuda (seguros.competencias.campo-observacao) é renderizado ao lado do rótulo logo acima */}
            <input id="comp-basis" className={INPUT} maxLength={1000} value={basis} onChange={(e) => setBasis(e.target.value)} />
          </div>
          <div className="flex flex-wrap items-center gap-2 md:col-span-2">
            {/* help-exempt: botão com ícone de ajuda (seguros.competencias.conceder) ao lado */}
            <Button type="submit" size="sm" className="min-h-11 px-4" disabled={pending || !userId || !competence || !gate.ok}>
              {pending ? "Aguarde…" : "Conceder competência"}
            </Button>
            <HelpHint helpId="seguros.competencias.conceder" />
            {!gate.ok && userId ? <span className="text-xs text-muted-foreground">{gate.reason}</span> : null}
          </div>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Somente o Administrador do projeto concede ou revoga competências.</p>
      )}
      {error ? (
        <div className="mt-3">
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3">
          <Callout tone="ok" role="status">
            {notice}
          </Callout>
        </div>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        A identificação profissional (CREA, CAU, OAB, SUSEP) é um texto declarado pelo Administrador; o sistema não a valida junto ao conselho nem a inventa. Revisão humana: conferir a habilitação real
        antes de conceder.
      </p>
    </Section>
  );
}
