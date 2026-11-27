import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/layout/page-header";
import { FieldLabel } from "@/components/admin/field-label";
import { FeatureInfo } from "@/components/shared/feature-info";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProjectMembers } from "@/lib/data";
import { authorizationStatusLabel, connectionStatusLabel, type AuthorizationStatus } from "@/lib/email-authorization/notice";
import { isProjectAdmin } from "@/lib/email-authorization/guard";
import { KNOWN_AUTHORIZATION_MESSAGES } from "@/lib/email-authorization/request";
import { listProjectEmailAuthorizations } from "@/lib/email-authorization/store";
import { adminRevokeAuthorizationAction, requestAuthorizationAction } from "./actions";
import { formatDateTimeBR } from "@/lib/labels";

export const metadata: Metadata = { title: "Autorizações" };

const FLASH: Record<string, { tone: "ok" | "warn"; text: string }> = {
  solicitada: { tone: "ok", text: "Solicitação registrada e e-mail enviado ao colaborador." },
  "solicitada-sem-email": { tone: "warn", text: "Solicitação registrada, mas o e-mail não pôde ser enviado agora. O colaborador ainda não foi avisado." },
  revogada: { tone: "ok", text: "Autorização revogada (ou solicitação cancelada). O histórico foi preservado." },
  permissao: { tone: "warn", text: "Somente administradores da obra podem fazer isso." },
  confirmacao: { tone: "warn", text: "Marque a caixa de confirmação. Nada foi alterado." },
  colaborador: { tone: "warn", text: "Escolha um colaborador da obra." },
};

const STATUS_STYLE: Record<AuthorizationStatus, string> = {
  PENDENTE: "bg-amber-100 text-amber-900",
  AUTORIZADO: "bg-emerald-100 text-emerald-900",
  RECUSADO: "bg-gray-200 text-gray-900",
  REVOGADO: "bg-red-100 text-red-900",
};

function formatDateTime(value: string | null): string {
  return formatDateTimeBR(value);
}

export default async function AuthorizationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ resultado?: string | string[]; erro?: string | string[] }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;

  // Controle no servidor (além do menu e da RLS/funções do banco): quem não é administrador da obra não vê a página.
  if (!(await isProjectAdmin(projectId)).isAdmin) notFound();

  const [authorizations, members] = await Promise.all([listProjectEmailAuthorizations(projectId), getProjectMembers(projectId)]);
  const activeMembers = members.filter((member) => member.status === "ACTIVE");

  const resultado = Array.isArray(query.resultado) ? query.resultado[0] : query.resultado;
  const erro = Array.isArray(query.erro) ? query.erro[0] : query.erro;
  const flash = resultado ? FLASH[resultado] : erro ? (FLASH[erro] ?? (KNOWN_AUTHORIZATION_MESSAGES.has(erro) ? { tone: "warn" as const, text: erro } : undefined)) : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Autorizações de acesso aos e-mails"
        description="Consentimento de cada colaborador para o ACC usar a conta de e-mail corporativa nesta obra."
        actions={<FeatureInfo helpId="autorizacoes-email" />}
      />

      {flash ? (
        <p role="status" className={`rounded-md px-3 py-2 text-sm ${flash.tone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
          {flash.text} <FeatureInfo helpId="admin.autorizacoes.mensagem-resultado" />
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5 text-base">
            Solicitar autorização
            <FeatureInfo helpId="admin.autorizacoes.solicitar" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-gray-700">
            O colaborador recebe um e-mail individual com a finalidade, as permissões e os filtros, e responde dentro do ACC. O aceite registrado aqui é o consentimento no ACC; ele não conecta a conta
            Google (a conexão é feita à parte, e a situação dela aparece na tabela).
          </p>
          <form action={requestAuthorizationAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="block">
              <FieldLabel htmlFor="aut-colaborador" helpId="admin.autorizacoes.colaborador" className="mb-1 text-xs font-normal text-gray-600">Colaborador</FieldLabel>
              <select id="aut-colaborador" name="userId" required className="min-h-11 w-full rounded-md border border-gray-300 bg-white px-3 py-2">
                <option value="">Escolha…</option>
                {activeMembers.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.user.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="block">
              <FieldLabel htmlFor="aut-conta" helpId="admin.autorizacoes.conta" className="mb-1 text-xs font-normal text-gray-600">Conta (em branco = e-mail do colaborador)</FieldLabel>
              <input id="aut-conta" name="accountEmail" type="email" placeholder="nome@axion.com.br" className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2" />
            </div>
            <div className="flex items-center gap-1.5">
              <button type="submit" className="min-h-11 rounded-md bg-brand-sidebar px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                Solicitar e enviar e-mail
              </button>
              <FeatureInfo helpId="admin.autorizacoes.botao-solicitar" />
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Autorizações desta obra</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {authorizations.length === 0 ? (
            <p className="text-sm text-gray-600">Nenhuma solicitação registrada para esta obra.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      Colaborador
                      <FeatureInfo helpId="admin.autorizacoes.col-colaborador" />
                    </span>
                  </th>
                  <th className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      Conta
                      <FeatureInfo helpId="admin.autorizacoes.col-conta" />
                    </span>
                  </th>
                  <th className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      Decisão
                      <FeatureInfo helpId="admin.autorizacoes.col-decisao" />
                    </span>
                  </th>
                  <th className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      Data
                      <FeatureInfo helpId="admin.autorizacoes.col-data" />
                    </span>
                  </th>
                  <th className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1">
                      Conexão da conta
                      <FeatureInfo helpId="admin.autorizacoes.col-conexao" />
                    </span>
                  </th>
                  <th className="py-2">
                    <span className="inline-flex items-center gap-1">
                      Ações
                      <FeatureInfo helpId="admin.autorizacoes.col-acoes" />
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {authorizations.map((item) => (
                  <tr key={item.id} className="border-t border-gray-200 align-top">
                    <td className="py-2 pr-3 font-semibold">{item.userName}</td>
                    <td className="break-all py-2 pr-3">{item.accountEmail}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[item.status]}`}>{authorizationStatusLabel(item.status)}</span>
                    </td>
                    <td className="py-2 pr-3">{formatDateTime(item.decidedAt ?? item.requestedAt)}</td>
                    <td className="py-2 pr-3">{connectionStatusLabel(item.connectionStatus)}</td>
                    <td className="space-y-2 py-2">
                      <Link href={`/autorizacao-email/${item.id}`} className="block text-xs font-semibold text-brand-sidebar hover:underline">
                        Ver texto e histórico
                      </Link>
                      {item.status === "AUTORIZADO" || item.status === "PENDENTE" ? (
                        <div className="flex items-start gap-1">
                        <details>
                          <summary className="cursor-pointer text-xs font-semibold text-red-800">{item.status === "PENDENTE" ? "Cancelar solicitação" : "Revogar"}</summary>
                          <form action={adminRevokeAuthorizationAction} className="mt-2 space-y-2 rounded-md border border-gray-300 p-2">
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="authorizationId" value={item.id} />
                            <input name="note" maxLength={500} placeholder="Motivo (opcional)" className="min-h-9 w-full rounded-md border border-gray-300 px-2 py-1 text-xs" />
                            <label className="flex items-start gap-2 text-xs">
                              <input type="checkbox" name="confirm" value="sim" required className="mt-0.5 size-4" />
                              <span>Confirmo</span>
                            </label>
                            <button type="submit" className="min-h-9 rounded-md bg-red-800 px-3 py-1 text-xs font-bold text-white">
                              {item.status === "PENDENTE" ? "Cancelar" : "Revogar"}
                            </button>
                          </form>
                        </details>
                        <FeatureInfo helpId="admin.autorizacoes.revogar" />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Revogar aqui registra o fim do consentimento no ACC. Para remover a permissão concedida ao Google, o colaborador usa a conta Google dele ou o administrador do Google Workspace.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
