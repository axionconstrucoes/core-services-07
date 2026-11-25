import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { BTN, BTN_ALT, BTN_DANGER, Flash, INPUT, Pill, first, fmtDate } from "@/components/governance/governance-ui";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COMPETENCE_STATE_LABEL, GOV_ACTION_LABEL, REQUEST_STATUS_LABEL, VALIDATOR_STATE_LABEL, VALIDATOR_MAX_DAYS,
  canCancelRequest, canDecideRequest, canManageCompetences, canRevalidate, deriveCompetenceState, deriveValidatorState, maxValidatorUntil, todayIso,
} from "@/lib/governance/competence-ui";
import { loadCompetencesOverview, displayName } from "@/lib/governance/overview-data";
import { COMPETENCES, COMPETENCE_LABEL, COMPETENCE_DESCRIPTION, REGISTRATION_KINDS, type Competence } from "@/lib/permissions/competences";
import { getProjectTier } from "@/lib/permissions/project-tier-server";
import {
  acceptValidatorAction, approveRequestAction, cancelRequestAction, designateValidatorAction, rejectRequestAction, requestCompetenceAction,
  revalidateCompetenceAction, revokeValidatorAction,
} from "./actions";

export const metadata: Metadata = { title: "Competências" };

const OK: Record<string, string> = {
  solicitada: "Solicitação registrada. Ela NÃO concede poder: só vale depois da validação independente da habilitação.",
  validada: "Habilitação validada e competência concedida, com a trilha e a auditoria gravadas.",
  recusada: "Solicitação recusada. Nenhum poder foi concedido.",
  cancelada: "Solicitação cancelada.",
  revalidada: "Competência revalidada: volta a valer para atos críticos. A revalidação ficou na trilha e na auditoria.",
  designado: "Validador designado. A designação só vale depois do ACEITE da própria pessoa designada.",
  aceito: "Designação aceita: você passa a poder validar habilitação neste projeto, até o fim do prazo.",
  revogado: "Designação revogada: a pessoa deixa de validar habilitação imediatamente.",
};
const REQ_TONE: Record<string, "ok" | "warn" | "bad" | "off"> = { PENDING: "warn", APPROVED: "ok", REJECTED: "bad", CANCELLED: "off", EXPIRED: "off" };
const STATE_TONE = { VALIDA: "ok", AGUARDA_REVALIDACAO: "warn", SEM_VALIDACAO: "bad", VENCIDA: "bad", FUTURA: "off", REVOGADA: "off" } as const;
const VAL_TONE = { PROPOSTA: "warn", ATIVO: "ok", VENCIDO: "bad", REVOGADO: "off" } as const;

export default async function CompetenciasPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }>;
}) {
  const { projectId } = await params;
  const tier = await getProjectTier(projectId);
  if (tier === "NONE") notFound();
  const query = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const me = authData.user?.id ?? "";
  const ov = await loadCompetencesOverview(supabase, projectId);
  const today = todayIso();
  const manage = canManageCompetences(tier);
  const viewer = { userId: me, tier, isActiveDesignatedValidator: ov.isDesignatedValidator };
  const docs = new Map(ov.documents.map((d) => [d.id, d.title ?? d.kind ?? "documento"]));
  const nameOf = (id: string | null | undefined) => displayName(ov.names, id);
  const activeMembers = ov.members.filter((m) => m.status === "ACTIVE");
  const stateOf = (c: (typeof ov.competences)[number]) => deriveCompetenceState(c, today);
  const pendingReval = ov.competences.filter((c) => stateOf(c) === "AGUARDA_REVALIDACAO");
  const requests = ov.requests;
  const myProposals = ov.validators.filter((v) => v.user_id === me && v.status === "PROPOSED");
  const maxUntil = maxValidatorUntil(today);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Competências"
        description="Habilitação profissional (Responsável técnico, Jurídico, Seguros) com validação independente, revalidação e validadores designados."
        actions={<FeatureInfo helpId="governanca.competencias.pagina" />}
      />
      <Flash ok={first(query.ok)} erro={first(query.erro)} okMessages={OK} />
      {ov.unavailable ? (
        <p role="alert" className="rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Este recurso ainda não está disponível neste ambiente (competências) ou o acesso foi negado. SEM DADOS.
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Como a competência passa a valer<FeatureInfo helpId="governanca.competencias.resumo" /></CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>Cargo de gestão NÃO é competência. Registro CREA/OAB/SUSEP informado NÃO comprova habilitação. A competência só vale com <strong>evidência documental conferida por pessoa independente</strong> (segundo administrador ou validador designado), e competências anteriores precisam ser <strong>revalidadas</strong> antes de qualquer ato crítico.</p>
          <p className="text-xs text-gray-700">A tela espelha as regras; a autoridade é o banco (RPC + RLS). Nada aqui envia e-mail.</p>
        </CardContent>
      </Card>

      {myProposals.length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">Designações aguardando o SEU aceite ({myProposals.length})</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {myProposals.map((v) => (
              <form key={v.id} action={acceptValidatorAction} className="flex flex-wrap items-center gap-3 rounded-md border border-gray-300 p-3 text-sm">
                <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={v.id} />
                <p className="flex-1">Você foi designado validador de habilitação até {fmtDate(v.valid_until)} por {nameOf(v.designated_by)}. Justificativa: {v.reason}</p>
                <button type="submit" className={BTN}>Aceitar designação</button><FeatureInfo helpId="governanca.competencias.acao-aceitar" />
              </form>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Competências da obra ({ov.competences.length})<FeatureInfo helpId="governanca.competencias.lista" /></CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {ov.competences.length === 0 ? <p className="text-sm">Nenhuma competência registrada que você possa ver. SEM DADOS não significa que ninguém tenha competência: administradores e gestores veem todas; os demais veem só as próprias.</p> : null}
          <ul className="space-y-2">
            {ov.competences.map((c) => {
              const st = stateOf(c);
              return (
                <li key={c.id} className="rounded-md border border-gray-300 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{nameOf(c.user_id)}</strong> · {COMPETENCE_LABEL[c.competence as Competence] ?? c.competence}
                    <Pill tone={STATE_TONE[st]}>{COMPETENCE_STATE_LABEL[st]}</Pill><FeatureInfo helpId="governanca.competencias.situacao" />
                  </div>
                  <p className="text-xs text-gray-800">
                    Vigência {fmtDate(c.valid_from)} a {c.valid_until ? fmtDate(c.valid_until) : "sem fim"} · evidência: {c.evidence_document_id ? docs.get(c.evidence_document_id) ?? "documento do projeto" : "SEM DADOS"} ·
                    registro declarado: {c.registration_kind ?? "não informado"} (não comprova habilitação) · concedida por {nameOf(c.granted_by)} em {fmtDate(c.granted_at)}
                    {c.revalidated_at ? ` · revalidada em ${fmtDate(c.revalidated_at)}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Revalidação pendente ({pendingReval.length})<FeatureInfo helpId="governanca.competencias.revalidacao" /></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pendingReval.length === 0 ? <p className="text-sm">Nenhuma competência aguardando revalidação.</p> : (
            <p className="text-sm">Estas competências foram concedidas antes da regra de revalidação e <strong>não valem para atos críticos</strong> (decisão de sinistro, aprovação de minuta, laudo técnico) até serem revalidadas por pessoa independente.</p>
          )}
          {pendingReval.map((c) => {
            const can = canRevalidate(viewer, { user_id: c.user_id, granted_by: c.granted_by });
            return (
              <form key={c.id} action={revalidateCompetenceAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-3">
                <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={c.id} /><input type="hidden" name="version" value={c.row_version} />
                <div className="text-sm md:col-span-3">
                  <p className="font-semibold">{nameOf(c.user_id)} · {COMPETENCE_LABEL[c.competence as Competence] ?? c.competence}</p>
                  <p className="text-xs text-gray-800">Concedida por {nameOf(c.granted_by)} em {fmtDate(c.granted_at)} · evidência: {c.evidence_document_id ? docs.get(c.evidence_document_id) ?? "documento do projeto" : "SEM evidência (revogue e solicite de novo com o documento)"}</p>
                </div>
                {can ? (
                  <>
                    <label className="text-xs font-semibold md:col-span-2">O que foi conferido (mín. 20 caracteres)<FeatureInfo helpId="governanca.competencias.campo-nota" />
                      <textarea name="note" required minLength={20} maxLength={2000} rows={2} className={INPUT} />
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-xs">
                      <input type="checkbox" name="evidenceChecked" value="sim" className="size-5" />
                      <span>Conferi a evidência documental</span><FeatureInfo helpId="governanca.competencias.campo-evidencia-conferida" />
                    </label>
                    <div className="md:col-span-3"><button type="submit" className={BTN}>Revalidar competência</button><FeatureInfo helpId="governanca.competencias.acao-revalidar" /></div>
                  </>
                ) : (
                  <p className="text-xs text-gray-800 md:col-span-3">Você não pode revalidar esta competência: a revalidação é de administrador ou validador designado ativo que NÃO seja a pessoa nem quem a concedeu.</p>
                )}
              </form>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Solicitações ({requests.length})<FeatureInfo helpId="governanca.competencias.solicitacoes" /></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {requests.length === 0 ? <p className="text-sm">Nenhuma solicitação visível para você.</p> : null}
          {requests.map((r) => {
            const decide = r.status === "PENDING" && canDecideRequest(viewer, r);
            const cancel = canCancelRequest(viewer, r);
            return (
              <div key={r.id} className="space-y-2 rounded-md border border-gray-300 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{nameOf(r.target_user_id)}</strong> · {COMPETENCE_LABEL[r.competence as Competence] ?? r.competence}
                  <Pill tone={REQ_TONE[r.status] ?? "off"}>{REQUEST_STATUS_LABEL[r.status] ?? r.status}</Pill>
                </div>
                <p className="text-xs text-gray-800">
                  Solicitada por {nameOf(r.requested_by)} em {fmtDate(r.requested_at)} · vence em {fmtDate(r.expires_at)} · evidência: {docs.get(r.evidence_document_id) ?? "documento do projeto"}
                  {r.registration_kind ? ` · registro declarado ${r.registration_kind} (não comprova)` : ""}
                  {r.validator_user_id ? ` · decidida por ${nameOf(r.validator_user_id)} (${r.validator_kind === "DESIGNATED" ? "validador designado" : "segundo administrador"}) em ${fmtDate(r.validated_at)}` : ""}
                </p>
                {r.validation_note ? <p className="text-xs">Nota: {r.validation_note}</p> : null}
                {decide ? (
                  <form className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.row_version} />
                    <label className="text-xs font-semibold md:col-span-2">Nota da validação (conferido: mín. 20; recusa: mín. 10)<FeatureInfo helpId="governanca.competencias.campo-nota" />
                      <textarea name="note" required minLength={10} maxLength={2000} rows={2} className={INPUT} />
                    </label>
                    <label className="flex min-h-11 items-center gap-2 text-xs">
                      <input type="checkbox" name="evidenceChecked" value="sim" className="size-5" />
                      <span>Conferi a evidência documental (necessário para validar)</span><FeatureInfo helpId="governanca.competencias.campo-evidencia-conferida" />
                    </label>
                    <div className="flex flex-wrap gap-2 md:col-span-3">
                      <button type="submit" formAction={approveRequestAction} className={BTN}>Validar habilitação</button><FeatureInfo helpId="governanca.competencias.acao-validar" />
                      <button type="submit" formAction={rejectRequestAction} className={BTN_DANGER}>Recusar</button><FeatureInfo helpId="governanca.competencias.acao-recusar" />
                    </div>
                  </form>
                ) : null}
                {r.status === "PENDING" && !decide && !cancel ? <p className="text-xs text-gray-800">Você não valida esta solicitação (precisa ser administrador ou validador designado ativo e não ser quem solicitou nem quem receberá a competência).</p> : null}
                {cancel ? (
                  <form action={cancelRequestAction} className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={r.id} /><input type="hidden" name="version" value={r.row_version} />
                    <label className="text-xs font-semibold md:col-span-2">Motivo do cancelamento (mín. 10 caracteres)<FeatureInfo helpId="governanca.competencias.campo-motivo" /><input name="reason" required minLength={10} maxLength={1000} className={INPUT} /></label>
                    <div className="flex items-end"><button type="submit" className={BTN_ALT}>Cancelar solicitação</button><FeatureInfo helpId="governanca.competencias.acao-cancelar" /></div>
                  </form>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {manage ? (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Solicitar competência (administrador)<FeatureInfo helpId="governanca.competencias.nova-solicitacao" /></CardTitle></CardHeader>
          <CardContent>
            <form action={requestCompetenceAction} className="grid gap-2 md:grid-cols-3">
              <input type="hidden" name="projectId" value={projectId} />
              <label className="text-xs font-semibold">Pessoa (membro ativo)<FeatureInfo helpId="governanca.competencias.campo-pessoa" />
                <select name="userId" required defaultValue="" className={INPUT}>
                  <option value="" disabled>Escolher…</option>
                  {activeMembers.map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Competência<FeatureInfo helpId="governanca.competencias.campo-competencia" />
                <select name="competence" required defaultValue="" className={INPUT}>
                  <option value="" disabled>Escolher…</option>
                  {COMPETENCES.map((k) => <option key={k} value={k}>{COMPETENCE_LABEL[k]} — {COMPETENCE_DESCRIPTION[k].slice(0, 60)}…</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Documento de evidência (obrigatório)<FeatureInfo helpId="governanca.competencias.campo-documento" />
                <select name="evidenceDocumentId" required defaultValue="" className={INPUT}>
                  <option value="" disabled>Escolher documento do projeto…</option>
                  {ov.documents.map((d) => <option key={d.id} value={d.id}>{d.title ?? d.kind ?? d.id}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Tipo de registro declarado (opcional)<FeatureInfo helpId="governanca.competencias.campo-registro-tipo" />
                <select name="registrationKind" defaultValue="" className={INPUT}>
                  <option value="">Não informar</option>
                  {REGISTRATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Número do registro<FeatureInfo helpId="governanca.competencias.campo-registro-numero" /><input name="registrationNumber" maxLength={60} className={INPUT} /></label>
              <label className="text-xs font-semibold">Vigência até (opcional)<FeatureInfo helpId="governanca.competencias.campo-vigencia" /><input type="date" name="validUntil" className={INPUT} /></label>
              <label className="text-xs font-semibold md:col-span-3">Observação (base da solicitação)<FeatureInfo helpId="governanca.competencias.campo-observacao" /><input name="basisNote" maxLength={1000} className={INPUT} /></label>
              <p className="text-xs text-gray-800 md:col-span-3">A solicitação NÃO concede poder. Ela espera a validação de pessoa independente (segundo administrador ou validador designado ativo).</p>
              <div className="md:col-span-3"><button type="submit" className={BTN}>Registrar solicitação</button><FeatureInfo helpId="governanca.competencias.acao-solicitar" /></div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Validadores designados ({ov.validators.length})<FeatureInfo helpId="governanca.competencias.validadores" /></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">Em obra com um único administrador, a regularização segura é a designação de um validador independente (pessoa da diretoria ou externa), com documento (ata/ofício), prazo de até {VALIDATOR_MAX_DAYS} dias e aceite da própria pessoa. A designação é revogável a qualquer momento.</p>
          {ov.validators.length === 0 ? <p className="text-sm">Nenhum validador designado.</p> : null}
          {ov.validators.map((v) => {
            const st = deriveValidatorState(v, today);
            const canRevoke = manage && v.status !== "REVOKED";
            return (
              <div key={v.id} className="space-y-2 rounded-md border border-gray-300 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><strong>{nameOf(v.user_id)}</strong><Pill tone={VAL_TONE[st]}>{VALIDATOR_STATE_LABEL[st]}</Pill></div>
                <p className="text-xs text-gray-800">Designado por {nameOf(v.designated_by)} em {fmtDate(v.designated_at)} · prazo até {fmtDate(v.valid_until)} · documento: {docs.get(v.designation_document_id) ?? "documento do projeto"} · {v.reason}{v.revoke_reason ? ` · revogação: ${v.revoke_reason}` : ""}</p>
                {canRevoke ? (
                  <form action={revokeValidatorAction} className="grid gap-2 md:grid-cols-3">
                    <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="id" value={v.id} />
                    <label className="text-xs font-semibold md:col-span-2">Motivo da revogação (mín. 10 caracteres)<FeatureInfo helpId="governanca.competencias.campo-motivo" /><input name="reason" required minLength={10} maxLength={1000} className={INPUT} /></label>
                    <div className="flex items-end"><button type="submit" className={BTN_DANGER}>Revogar designação</button><FeatureInfo helpId="governanca.competencias.acao-revogar" /></div>
                  </form>
                ) : null}
              </div>
            );
          })}
          {manage ? (
            <form action={designateValidatorAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-3">
              <input type="hidden" name="projectId" value={projectId} />
              <p className="text-sm font-semibold md:col-span-3">Designar validador</p>
              <label className="text-xs font-semibold">Membro do projeto<FeatureInfo helpId="governanca.competencias.campo-validador-pessoa" />
                <select name="userId" defaultValue="" className={INPUT}>
                  <option value="">Escolher… (ou informe o perfil abaixo)</option>
                  {activeMembers.filter((m) => m.user_id !== me).map((m) => <option key={m.user_id} value={m.user_id}>{nameOf(m.user_id)}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Ou ID do perfil de pessoa externa (UUID)<FeatureInfo helpId="governanca.competencias.campo-validador-externo" /><input name="externalUserId" maxLength={36} className={INPUT} autoComplete="off" /></label>
              <label className="text-xs font-semibold">Documento da designação (ata/ofício)<FeatureInfo helpId="governanca.competencias.campo-validador-documento" />
                <select name="designationDocumentId" required defaultValue="" className={INPUT}>
                  <option value="" disabled>Escolher documento do projeto…</option>
                  {ov.documents.map((d) => <option key={d.id} value={d.id}>{d.title ?? d.kind ?? d.id}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold md:col-span-2">Justificativa (mín. 20 caracteres)<FeatureInfo helpId="governanca.competencias.campo-validador-justificativa" /><input name="reason" required minLength={20} maxLength={1000} className={INPUT} /></label>
              <label className="text-xs font-semibold">Prazo até (máx. {maxUntil})<FeatureInfo helpId="governanca.competencias.campo-validador-prazo" /><input type="date" name="validUntil" required min={today} max={maxUntil} className={INPUT} /></label>
              <div className="md:col-span-3"><button type="submit" className={BTN}>Designar validador</button><FeatureInfo helpId="governanca.competencias.acao-designar" /></div>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Trilha de governança (recentes)<FeatureInfo helpId="governanca.competencias.trilha" /></CardTitle></CardHeader>
        <CardContent>
          {ov.events.length === 0 ? <p className="text-sm">Sem eventos visíveis para você (a trilha é de administradores e gestores).</p> : (
            <ul className="space-y-1 text-xs">
              {ov.events.map((e) => <li key={e.id}>{fmtDate(e.created_at)} · <strong>{GOV_ACTION_LABEL[e.action] ?? e.action}</strong> · por {nameOf(e.actor_user_id)} ({e.actor_role})</li>)}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
