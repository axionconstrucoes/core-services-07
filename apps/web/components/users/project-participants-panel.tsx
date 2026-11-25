"use client";

// Participantes do projeto — seleção por checkbox (somente administradores; a página só
// renderiza para ADMINISTRADOR e a Server Action revalida no servidor). A tela mostra o
// estado ATUAL (marcado = participante ativo / pendente); nada muda até o administrador
// alterar marcações, revisar o resumo e confirmar explicitamente.

import { useActionState, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { saveProjectParticipantsAction } from "@/app/[projectId]/usuarios/actions";
import { initialSaveParticipantsState } from "@/app/[projectId]/usuarios/actions-state";
import { membershipAreaLabels, permissionLabels } from "@/lib/labels";
import {
  NEW_PARTICIPANT_PERMISSIONS,
  filterParticipantRows,
  initialSelection,
  planParticipantChanges,
  summarizePlan,
  type MemberInput,
  type ParticipantRow,
  type ParticipantStatus,
} from "@/lib/users/participant-selection";
import type { MembershipArea, ProjectPermission } from "@axion/types";

const STATUS_LABEL: Record<ParticipantStatus, string> = {
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  PENDING: "Pendente (aguardando 1º login)",
  NOT_MEMBER: "Fora do projeto",
};

export function ProjectParticipantsPanel({
  projectId,
  rows,
  members,
  currentUserId,
  candidatesAvailable,
}: {
  projectId: string;
  rows: ParticipantRow[];
  members: MemberInput[];
  currentUserId: string | null;
  candidatesAvailable: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProjectParticipantsAction, initialSaveParticipantsState);
  const initial = useMemo(() => initialSelection(rows), [rows]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [additions, setAdditions] = useState<Record<string, { permission?: string; area?: string }>>({});
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ParticipantStatus>("ALL");
  const [reviewing, setReviewing] = useState(false);

  const candidateIds = useMemo(() => rows.filter((r) => r.kind === "candidate").map((r) => r.id), [rows]);
  const plan = useMemo(
    () => planParticipantChanges({ projectId, members, selectedIds: selected, additions, candidateIds, currentUserId }),
    [projectId, members, selected, additions, candidateIds, currentUserId]
  );
  const summary = summarizePlan(plan);
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? id;
  const visible = filterParticipantRows(rows, query, statusFilter);
  const dirty = plan.operations.length > 0 || plan.blocked.length > 0;

  function toggle(id: string, checked: boolean) {
    setReviewing(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function setAddition(id: string, patch: { permission?: string; area?: string }) {
    setReviewing(false);
    setAdditions((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          Participantes do projeto
          <FeatureInfo helpId="admin.usuarios.participantes" />
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Marque quem participa desta obra. Desmarcar apenas desativa a participação (reversível; o histórico é preservado). A Matriz de
          Responsabilidades lista somente participantes ativos e convidados pendentes deste projeto. Nada é alterado até você revisar e confirmar.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          {/* help-exempt: busca da lista de participantes, descrita pelo ícone admin.usuarios.participantes-filtros logo após os controles */}
          <Input
            type="search"
            aria-label="Buscar participante por nome, e-mail ou área"
            placeholder="Buscar por nome, e-mail ou área"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {/* help-exempt: filtro de situação, descrito pelo ícone admin.usuarios.participantes-filtros logo após os controles */}
          <Select
            aria-label="Filtrar por situação"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ALL" | ParticipantStatus)}
            className="sm:w-56"
          >
            <option value="ALL">Todas as situações</option>
            <option value="ACTIVE">Ativos</option>
            <option value="PENDING">Pendentes</option>
            <option value="INACTIVE">Inativos</option>
            {candidatesAvailable ? <option value="NOT_MEMBER">Fora do projeto</option> : null}
          </Select>
          <FeatureInfo helpId="admin.usuarios.participantes-filtros" className="self-center" />
        </div>

        {!candidatesAvailable ? (
          <p className="text-xs text-muted-foreground" role="status">
            A lista de usuários ainda fora do projeto não está disponível neste ambiente. É possível ativar/desativar quem já
            participa; para incluir novos usuários use &ldquo;Adicionar usuário&rdquo;.
          </p>
        ) : null}

        <ul className="flex max-h-[28rem] flex-col divide-y overflow-y-auto rounded-md border" aria-label="Lista de participantes">
          {visible.length === 0 ? <li className="p-3 text-sm text-muted-foreground">Nenhum usuário encontrado.</li> : null}
          {visible.map((row) => {
            const inputId = `participant-${row.id}`;
            const isSelf = row.id === currentUserId;
            const locked = row.kind === "invitation" || isSelf;
            const checked = selected.has(row.id);
            const needsDetails = row.kind === "candidate" && checked;
            return (
              <li key={row.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                <div className="flex flex-1 items-start gap-3">
                  {/* help-exempt: caixa de participação por pessoa, descrita em admin.usuarios.participantes (marcar adiciona ou reativa, desmarcar desativa) */}
                  <input
                    id={inputId}
                    type="checkbox"
                    className="mt-1 size-4 accent-[hsl(var(--primary))]"
                    checked={checked}
                    disabled={locked || pending}
                    onChange={(e) => toggle(row.id, e.target.checked)}
                  />
                  <label htmlFor={inputId} className="flex-1 cursor-pointer">
                    <span className="block text-sm font-medium">{row.name}</span>
                    <span className="block break-all text-xs text-muted-foreground">{row.email}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.permission ? permissionLabels[row.permission as ProjectPermission] : "—"} ·{" "}
                      {row.area ? (membershipAreaLabels[row.area as MembershipArea] ?? row.area) : "Sem área"}
                      {isSelf ? " · você" : ""}
                    </span>
                  </label>
                </div>
                <Badge variant={row.status === "ACTIVE" ? "default" : "outline"}>{STATUS_LABEL[row.status]}</Badge>
                {needsDetails ? (
                  <div className="flex gap-2">
                    {/* help-exempt: papel da pessoa a adicionar, descrito em admin.usuarios.participantes (Papel e Área) e em admin.usuarios.permissao-novo */}
                    <Select
                      aria-label={`Papel de ${row.name}`}
                      value={additions[row.id]?.permission ?? ""}
                      onChange={(e) => setAddition(row.id, { permission: e.target.value })}
                      className="h-8 text-xs"
                    >
                      <option value="">Papel…</option>
                      {NEW_PARTICIPANT_PERMISSIONS.map((p) => (
                        <option key={p} value={p}>
                          {permissionLabels[p]}
                        </option>
                      ))}
                    </Select>
                    {/* help-exempt: área da pessoa a adicionar, descrita em admin.usuarios.participantes e em admin.usuarios.area-novo */}
                    <Select
                      aria-label={`Área de ${row.name}`}
                      value={additions[row.id]?.area ?? ""}
                      onChange={(e) => setAddition(row.id, { area: e.target.value })}
                      className="h-8 text-xs"
                    >
                      <option value="">Área…</option>
                      {Object.entries(membershipAreaLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="additions" value={JSON.stringify(additions)} />
          {[...selected].map((id) => (
            <input key={id} type="hidden" name="selected" value={id} />
          ))}

          {dirty ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
              <p className="flex items-center gap-1.5 font-medium">
                Resumo das alterações
                <FeatureInfo helpId="admin.usuarios.participantes-resumo" />
              </p>
              <ul className="list-disc pl-5 text-xs">
                {summary.adds > 0 ? <li>{summary.adds} usuário(s) a adicionar</li> : null}
                {summary.reactivations > 0 ? <li>{summary.reactivations} participação(ões) a reativar</li> : null}
                {summary.deactivations > 0 ? <li>{summary.deactivations} participação(ões) a desativar (reversível)</li> : null}
                {plan.operations.map((op) => (
                  <li key={`${op.type}-${op.userId}`} className="text-muted-foreground">
                    {op.type === "ADD" ? "Adicionar" : op.type === "REACTIVATE" ? "Reativar" : "Desativar"}: {nameOf(op.userId)}
                  </li>
                ))}
                {plan.blocked.map((b) => (
                  <li key={`blocked-${b.userId}`} className="text-destructive">
                    {nameOf(b.userId)}: {b.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Nenhuma alteração pendente.</p>
          )}

          {reviewing && plan.operations.length > 0 && plan.blocked.length === 0 ? (
            <label className="flex items-start gap-2 text-sm">
              {/* help-exempt: confirmação explícita do resumo, descrita em admin.usuarios.participantes (marque a confirmação e clique em Confirmar e salvar) */}
              <input type="checkbox" name="confirmed" className="mt-1 size-4 accent-[hsl(var(--primary))]" required />
              <span>Confirmo as alterações acima neste projeto.</span>
            </label>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {reviewing ? (
              // help-exempt: Confirmar e salvar, descrito em admin.usuarios.participantes (howToUse)
              <Button type="submit" disabled={pending || plan.operations.length === 0 || plan.blocked.length > 0}>
                {pending ? "Salvando…" : "Confirmar e salvar"}
              </Button>
            ) : (
              // help-exempt: Salvar alterações abre a revisão, descrito em admin.usuarios.participantes (howToUse)
              <Button
                type="button"
                disabled={plan.operations.length === 0 || plan.blocked.length > 0}
                onClick={() => setReviewing(true)}
              >
                Salvar alterações
              </Button>
            )}
            {dirty ? (
              // help-exempt: Descartar desfaz as marcações pendentes, descrito em admin.usuarios.participantes (howToUse)
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setSelected(new Set(initial));
                  setAdditions({});
                  setReviewing(false);
                }}
              >
                Descartar
              </Button>
            ) : null}
          </div>
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="text-sm text-emerald-600" role="status">
              {state.applied} alteração(ões) aplicada(s) e auditada(s).
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
