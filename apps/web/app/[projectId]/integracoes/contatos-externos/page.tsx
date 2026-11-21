import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@axion/db/server";

import { PageHeader } from "@/components/layout/page-header";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getExternalPartiesOverview } from "@/lib/external-parties/get-overview";
import { SEM_DADOS } from "@/lib/external-parties/overview";
import { ORG_KINDS, type ExternalOrgProjectLink } from "@/lib/external-parties/types";
import { getProjectTier } from "@/lib/permissions/project-tier-server";
import { addDomainAction, createOrganizationAction, decideCandidateAction, setContactAction, setLinkAction } from "./actions";

export const metadata: Metadata = { title: "Contatos externos monitorados" };

const FLASH: Record<string, string> = {
  "organizacao-ativa": "Organização cadastrada e vínculo ATIVO confirmado por você. A confirmação ficou na auditoria.",
  "organizacao-candidata": "Organização cadastrada com vínculo CANDIDATO. Candidato não confere autoridade até a confirmação.",
  vinculo: "Vínculo atualizado e auditado.",
  dominio: "Domínio registrado e auditado.",
  "dominio-compartilhado": "Domínio registrado. ATENÇÃO: ele é compartilhado por mais de uma organização; o ACC não vincula mensagens por coincidência de domínio.",
  contato: "Contato atualizado e auditado.",
  "candidato-confirmado": "Candidato confirmado como contato da organização e auditado.",
  "candidato-rejeitado": "Candidato rejeitado e auditado. O e-mail não será tratado como contato desta organização.",
};
const ERRORS: Record<string, string> = {
  permissao: "Somente GESTOR, GERENTE ou ADMINISTRADOR ativo do projeto gerencia contatos externos. Nada foi alterado.",
  dados: "Dados inválidos (tipo, nome, datas ou vigência). Nada foi alterado.",
  dominio: "Domínio inválido. Nada foi alterado.",
  email: "E-mail inválido. Nada foi alterado.",
  confirmacao: "Marque a confirmação para ativar o vínculo. Nada foi alterado.",
  organizacao: "Escolha a organização do contato. Nada foi alterado.",
  "sem-vinculo": "A organização escolhida não tem vínculo neste projeto. Crie o vínculo antes de confirmar o contato.",
  duplicado: "Registro duplicado. Nada foi alterado.",
  falha: "Não foi possível concluir. Nada foi alterado.",
};
const LINK_STYLE: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-900",
  CANDIDATE: "bg-amber-100 text-amber-900",
  ENDED: "bg-gray-200 text-gray-900",
};
const LINK_LABEL: Record<string, string> = { ACTIVE: "Ativo", CANDIDATE: "Candidato", ENDED: "Encerrado" };
const KIND_LABEL: Record<string, string> = {
  CLIENTE: "Cliente", GERENCIADORA: "Gerenciadora", FORNECEDOR: "Fornecedor", SUBCONTRATADA: "Subcontratada", PRESTADOR: "Prestador", PROJETISTA: "Projetista",
  CONSULTOR: "Consultor", FISCALIZACAO: "Fiscalização", SEGURADORA: "Seguradora", CORRETOR: "Corretor", BANCO: "Banco", OUTRO: "Outro",
};
const INPUT = "min-h-11 w-full rounded-md border border-gray-400 bg-white px-2 py-1 text-sm text-gray-900";
const BTN = "min-h-11 rounded-md bg-brand-sidebar px-4 py-2 text-sm font-bold text-white";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: v.length > 10 ? "short" : undefined, timeZone: "America/Sao_Paulo" }).format(d);
}
const num = (n: number | null): string => (n === null ? SEM_DADOS : String(n));

function LinkEditor({ projectId, link }: { projectId: string; link: ExternalOrgProjectLink }) {
  return (
    <form action={setLinkAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="linkId" value={link.id} />
      <label className="text-xs font-semibold">Situação<FeatureInfo helpId="integracoes.contatos-externos.campo-situacao" />
        <select name="status" defaultValue={link.status} className={INPUT}>
          <option value="ACTIVE">Ativo</option><option value="CANDIDATE">Candidato</option><option value="ENDED">Encerrado</option>
        </select>
      </label>
      <label className="text-xs font-semibold">Contrato / referência<FeatureInfo helpId="integracoes.contatos-externos.campo-contrato" /><input name="contractRef" defaultValue={link.contract_ref ?? ""} maxLength={200} className={INPUT} /></label>
      <label className="text-xs font-semibold">Cláusula de delegação<FeatureInfo helpId="integracoes.contatos-externos.campo-clausula" /><input name="clauseRef" defaultValue={link.delegation_clause_ref ?? ""} maxLength={200} className={INPUT} /></label>
      <label className="text-xs font-semibold">Limites de competência (separe por vírgula)<FeatureInfo helpId="integracoes.contatos-externos.campo-escopo" /><input name="scope" defaultValue={link.delegation_scope.join(", ")} maxLength={400} className={INPUT} /></label>
      <label className="text-xs font-semibold">Vigência até<FeatureInfo helpId="integracoes.contatos-externos.campo-vigencia" /><input type="date" name="validUntil" defaultValue={link.valid_until ?? ""} className={INPUT} /></label>
      <label className="text-xs font-semibold">Motivo da alteração<FeatureInfo helpId="integracoes.contatos-externos.campo-motivo" /><input name="reason" maxLength={500} className={INPUT} /></label>
      <label className="flex min-h-11 items-center gap-2 text-xs md:col-span-2">
        <input type="checkbox" name="confirm" value="sim" className="size-5" />
        <span>Confirmo que conferi o documento de delegação/contrato (necessário para ATIVO)</span><FeatureInfo helpId="integracoes.contatos-externos.campo-confirmacao" />
      </label>
      <div className="md:col-span-2"><button type="submit" className={BTN}>Salvar vínculo</button><FeatureInfo helpId="integracoes.contatos-externos.acao-salvar-vinculo" /></div>
    </form>
  );
}

export default async function ContatosExternosPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ ok?: string | string[]; erro?: string | string[] }>;
}) {
  const { projectId } = await params;
  const tier = await getProjectTier(projectId);
  if (tier !== "MANAGE" && tier !== "ADMIN") notFound(); // gestão (GESTOR/GERENTE/ADMINISTRADOR); demais perfis nem veem a rota

  const query = await searchParams;
  const ok = first(query.ok);
  const erro = first(query.erro);
  const flash = ok && FLASH[ok] ? { ok: true, text: FLASH[ok] } : erro ? { ok: false, text: ERRORS[erro] ?? ERRORS.falha } : null;

  const supabase = await createSupabaseServerClient();
  const ov = await getExternalPartiesOverview(supabase, projectId);
  const cov = ov.coverage;
  const pending = ov.candidates.filter((c) => c.status === "PENDING");
  const activeLinks = ov.links.filter((l) => l.status === "ACTIVE").length;
  const attributed = [...ov.activity.byOrg.values()].reduce((s, a) => s + a.messages, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Contatos externos monitorados"
        description="Organizações e pessoas de fora da Axion que trocam e-mails com este projeto: quem são, com qual vínculo e com que limite de competência."
        actions={<FeatureInfo helpId="integracoes.contatos-externos.pagina" />}
      />
      <p className="text-sm"><Link href={`/${projectId}/integracoes`} className="font-semibold text-brand-sidebar hover:underline">← Integrações</Link></p>

      {flash ? (
        <p role="status" className={`rounded-md border px-3 py-2 text-sm ${flash.ok ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-red-700 bg-red-50 text-red-900"}`}>{flash.text}</p>
      ) : null}
      {ov.contractMissing ? (
        <p role="alert" className="rounded-md border border-amber-700 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          As tabelas de contatos externos não estão disponíveis neste ambiente (migration da Fase 5/C ainda não aplicada) ou o acesso foi negado. {SEM_DADOS}.
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Resumo<FeatureInfo helpId="integracoes.contatos-externos.resumo" /></CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
          <div><p className="text-xs text-gray-700">Organizações</p><p className="text-lg font-bold">{ov.organizations.length}</p></div>
          <div><p className="text-xs text-gray-700">Vínculos ativos</p><p className="text-lg font-bold">{activeLinks}</p></div>
          <div><p className="text-xs text-gray-700">Candidatos pendentes</p><p className="text-lg font-bold">{pending.length}</p></div>
          <div><p className="text-xs text-gray-700">Mensagens atribuídas (amostra de {ov.emailsSampled})</p><p className="text-lg font-bold">{attributed}</p></div>
          <div><p className="text-xs text-gray-700">Ambíguas / sem vínculo</p><p className="text-lg font-bold">{ov.activity.ambiguousMessages} / {ov.activity.unattributedMessages}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Cobertura da sincronização<FeatureInfo helpId="integracoes.contatos-externos.cobertura" /></CardTitle></CardHeader>
        <CardContent className="text-sm">
          {cov.state === "SEM_DADOS" ? (
            <p><span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-900">{SEM_DADOS}</span> {cov.reason}</p>
          ) : (
            <div className="space-y-1">
              <p>Última reconciliação por caixa ({cov.runs} caixa(s)): universo {cov.universe}, elegíveis {cov.eligible}, processadas {cov.processed}
                {cov.processedPct === null ? "" : ` (${cov.processedPct}% das elegíveis)`}, excluídas {cov.excluded}, com falha {cov.failed}.</p>
              <p className="text-xs text-gray-700">Mais recente: {cov.last.provider} · {cov.last.mailbox} · {fmtDate(cov.last.created_at)} · situação {cov.last.status ?? SEM_DADOS}. Só caixas com reconciliação registrada entram; caixa não conectada não é considerada monitorada.</p>
            </div>
          )}
          <p className="mt-2 text-xs text-gray-700">
            Sinais de risco por e-mail: {ov.riskSignalsAvailable ? "lidos da classificação de e-mails (indício não é inadimplemento comprovado)." : `${SEM_DADOS} — a tabela de sinais ainda não existe neste ambiente.`}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Contatos descobertos pendentes ({pending.length})<FeatureInfo helpId="integracoes.contatos-externos.candidatos" /></CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? <p className="text-sm">Nenhum contato novo aguardando decisão.</p> : null}
          {pending.map((c) => (
            <form key={c.id} action={decideCandidateAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-4">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="candidateId" value={c.id} />
              <div className="text-sm md:col-span-2">
                <p className="font-semibold">{c.email}</p>
                <p className="text-xs text-gray-700">{c.message_count} mensagem(ns) · visto por último em {fmtDate(c.last_seen_at)} · domínio {c.domain}</p>
              </div>
              <label className="text-xs font-semibold">Organização<FeatureInfo helpId="integracoes.contatos-externos.campo-organizacao" />
                <select name="orgId" defaultValue={c.suggested_org_id ?? ""} className={INPUT}>
                  <option value="">Escolher…</option>
                  {ov.organizations.map((o) => <option key={o.id} value={o.id}>{o.legal_name}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold">Motivo<FeatureInfo helpId="integracoes.contatos-externos.campo-motivo" /><input name="reason" maxLength={500} className={INPUT} /></label>
              <div className="flex flex-wrap gap-2 md:col-span-4">
                <button type="submit" name="decision" value="CONFIRM" className={BTN}>Confirmar contato</button><FeatureInfo helpId="integracoes.contatos-externos.acao-confirmar-contato" />
                <button type="submit" name="decision" value="REJECT" className="min-h-11 rounded-md border border-gray-500 bg-white px-4 py-2 text-sm font-bold text-gray-900">Rejeitar</button><FeatureInfo helpId="integracoes.contatos-externos.acao-rejeitar" />
              </div>
            </form>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Organizações e vínculos<FeatureInfo helpId="integracoes.contatos-externos.organizacoes" /></CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {ov.organizations.length === 0 ? <p className="text-sm">Nenhuma organização externa vinculada a este projeto.</p> : null}
          {ov.organizations.map((o) => {
            const links = ov.links.filter((l) => l.organization_id === o.id);
            const doms = ov.domains.filter((d) => d.organization_id === o.id);
            const contacts = ov.contacts.filter((c) => c.organization_id === o.id);
            const a = ov.activity.byOrg.get(o.id);
            return (
              <section key={o.id} className="space-y-2 rounded-md border border-gray-300 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-bold">{o.legal_name} <span className="font-normal text-gray-700">· {KIND_LABEL[o.org_kind] ?? o.org_kind}{o.tax_id ? ` · ${o.tax_id}` : ""}</span></h3>
                  {ov.multiLink.has(o.id) ? <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-900">Múltiplos vínculos neste projeto</span> : null}
                </div>
                <p className="text-xs text-gray-800">
                  Mensagens: {a ? a.messages : 0} (último: {fmtDate(a?.last_message_at)}) · Sinais de risco: {num(a?.risk_signals ?? null)} · Alertas originados: {num(a?.alerts_originated ?? null)}
                  {a && Object.keys(a.by_pillar).length > 0 ? ` · Pilares: ${Object.entries(a.by_pillar).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""}
                </p>
                <ul className="space-y-1 text-xs">
                  {links.map((l) => (
                    <li key={l.id}>
                      <span className={`rounded px-1.5 py-0.5 font-bold ${LINK_STYLE[l.status]}`}>{LINK_LABEL[l.status]}</span>{" "}
                      {KIND_LABEL[l.role_in_project] ?? l.role_in_project} · contrato {l.contract_ref ?? SEM_DADOS} · vigência {fmtDate(l.valid_from)} a {l.valid_until ? fmtDate(l.valid_until) : "sem fim"} ·
                      cláusula {l.delegation_clause_ref ?? SEM_DADOS} · competência delegada: {l.delegation_scope.length ? l.delegation_scope.join(", ") : "NENHUMA"}
                      {l.status === "ACTIVE" && l.confirmed_at ? ` · confirmado em ${fmtDate(l.confirmed_at)}` : ""}
                    </li>
                  ))}
                </ul>
                <p className="text-xs">
                  Domínios: {doms.length === 0 ? SEM_DADOS : doms.map((d) => `${d.domain}${d.active ? "" : " (inativo)"}${ov.shared.has(d.domain) ? " [compartilhado]" : ""}`).join(", ")}
                </p>
                <p className="text-xs">
                  Contatos: {contacts.length === 0 ? SEM_DADOS : contacts.map((c) => `${c.email} (${c.status === "CONFIRMED" ? "confirmado" : c.status === "REJECTED" ? "rejeitado" : "candidato"}${c.discovered ? ", descoberto" : ""})`).join("; ")}
                </p>
                <details className="text-sm">
                  <summary className="min-h-11 cursor-pointer py-2 font-semibold">Corrigir vínculos, domínios e contatos</summary>
                  <div className="space-y-3 pt-2">
                    {links.map((l) => <LinkEditor key={l.id} projectId={projectId} link={l} />)}
                    <form action={addDomainAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-3">
                      <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="orgId" value={o.id} />
                      <label className="text-xs font-semibold">Domínio (ex.: empresa.com.br)<FeatureInfo helpId="integracoes.contatos-externos.campo-dominio" /><input name="domain" required maxLength={253} className={INPUT} /></label>
                      <label className="text-xs font-semibold">Situação<FeatureInfo helpId="integracoes.contatos-externos.campo-situacao" />
                        <select name="active" defaultValue="sim" className={INPUT}><option value="sim">Ativo</option><option value="nao">Inativo</option></select>
                      </label>
                      <label className="text-xs font-semibold">Motivo<FeatureInfo helpId="integracoes.contatos-externos.campo-motivo" /><input name="reason" maxLength={500} className={INPUT} /></label>
                      <div className="md:col-span-3"><button type="submit" className={BTN}>Salvar domínio</button><FeatureInfo helpId="integracoes.contatos-externos.acao-salvar-dominio" /></div>
                    </form>
                    <form action={setContactAction} className="grid gap-2 rounded-md border border-gray-300 p-3 md:grid-cols-4">
                      <input type="hidden" name="projectId" value={projectId} /><input type="hidden" name="orgId" value={o.id} />
                      <label className="text-xs font-semibold">E-mail<FeatureInfo helpId="integracoes.contatos-externos.campo-email" /><input type="email" name="email" required maxLength={254} className={INPUT} /></label>
                      <label className="text-xs font-semibold">Nome<FeatureInfo helpId="integracoes.contatos-externos.campo-nome" /><input name="displayName" maxLength={200} className={INPUT} /></label>
                      <label className="text-xs font-semibold">Situação<FeatureInfo helpId="integracoes.contatos-externos.campo-situacao" />
                        <select name="status" defaultValue="CONFIRMED" className={INPUT}><option value="CONFIRMED">Confirmado</option><option value="CANDIDATE">Candidato</option><option value="REJECTED">Rejeitado</option></select>
                      </label>
                      <label className="text-xs font-semibold">Motivo<FeatureInfo helpId="integracoes.contatos-externos.campo-motivo" /><input name="reason" maxLength={500} className={INPUT} /></label>
                      <div className="md:col-span-4"><button type="submit" className={BTN}>Salvar contato</button><FeatureInfo helpId="integracoes.contatos-externos.acao-salvar-contato" /></div>
                    </form>
                  </div>
                </details>
              </section>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Nova organização neste projeto<FeatureInfo helpId="integracoes.contatos-externos.nova-organizacao" /></CardTitle></CardHeader>
        <CardContent>
          <form action={createOrganizationAction} className="grid gap-2 md:grid-cols-3">
            <input type="hidden" name="projectId" value={projectId} />
            <label className="text-xs font-semibold">Razão social<FeatureInfo helpId="integracoes.contatos-externos.campo-razao" /><input name="legalName" required minLength={2} maxLength={300} className={INPUT} /></label>
            <label className="text-xs font-semibold">CNPJ / identificação fiscal<FeatureInfo helpId="integracoes.contatos-externos.campo-cnpj" /><input name="taxId" maxLength={32} className={INPUT} /></label>
            <label className="text-xs font-semibold">Papel no projeto<FeatureInfo helpId="integracoes.contatos-externos.campo-papel" />
              <select name="orgKind" required defaultValue="" className={INPUT}>
                <option value="" disabled>Escolher…</option>
                {ORG_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </label>
            <label className="text-xs font-semibold">Contrato / referência<FeatureInfo helpId="integracoes.contatos-externos.campo-contrato" /><input name="contractRef" maxLength={200} className={INPUT} /></label>
            <label className="text-xs font-semibold">Cláusula de delegação<FeatureInfo helpId="integracoes.contatos-externos.campo-clausula" /><input name="clauseRef" maxLength={200} className={INPUT} /></label>
            <label className="text-xs font-semibold">Limites de competência (vírgula)<FeatureInfo helpId="integracoes.contatos-externos.campo-escopo" /><input name="scope" maxLength={400} className={INPUT} /></label>
            <label className="text-xs font-semibold">Vigência de<FeatureInfo helpId="integracoes.contatos-externos.campo-vigencia" /><input type="date" name="validFrom" className={INPUT} /></label>
            <label className="text-xs font-semibold">Vigência até<FeatureInfo helpId="integracoes.contatos-externos.campo-vigencia" /><input type="date" name="validUntil" className={INPUT} /></label>
            <label className="text-xs font-semibold">Domínio principal<FeatureInfo helpId="integracoes.contatos-externos.campo-dominio" /><input name="domain" maxLength={253} className={INPUT} /></label>
            <label className="text-xs font-semibold md:col-span-3">Observações / motivo<FeatureInfo helpId="integracoes.contatos-externos.campo-observacoes" /><input name="notes" maxLength={500} className={INPUT} /></label>
            <input type="hidden" name="reason" value="Cadastro pela tela de contatos externos" />
            <label className="flex min-h-11 items-center gap-2 text-xs md:col-span-3">
              <input type="checkbox" name="confirm" value="sim" className="size-5" />
              <span>Confirmo o vínculo como ATIVO (conferi contrato e delegação). Desmarcado, o vínculo fica como CANDIDATO e não confere autoridade.</span><FeatureInfo helpId="integracoes.contatos-externos.campo-confirmacao" />
            </label>
            <div className="md:col-span-3"><button type="submit" className={BTN}>Cadastrar</button><FeatureInfo helpId="integracoes.contatos-externos.acao-cadastrar" /></div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-1.5 text-base">Auditoria recente<FeatureInfo helpId="integracoes.contatos-externos.auditoria" /></CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          {ov.audit.length === 0 ? <p className="text-sm">Nenhuma alteração registrada.</p> : (
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="uppercase text-gray-700"><tr><th className="py-2 pr-2">Quando</th><th className="py-2 pr-2">Ação</th><th className="py-2 pr-2">Item</th><th className="py-2">Motivo</th></tr></thead>
              <tbody>
                {ov.audit.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200"><td className="py-1 pr-2">{fmtDate(r.at)}</td><td className="py-1 pr-2">{r.action}</td><td className="py-1 pr-2">{r.entity_type}</td><td className="py-1">{r.reason ?? "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
