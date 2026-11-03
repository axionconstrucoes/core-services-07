import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient } from "@axion/db/server";

import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { VeraTrigger } from "@/components/assistant/vera-trigger";
import { Card, CardContent } from "@/components/ui/card";
import { getProject } from "@/lib/data";
import {
  authorizationStatusLabel,
  connectionStatusLabel,
  getNoticeSections,
  parseAuthorizationAction,
  type AuthorizationStatus,
} from "@/lib/email-authorization/notice";
import { getEmailAuthorization, getEmailAuthorizationEvents } from "@/lib/email-authorization/store";
import { decideAuthorizationAction, revokeAuthorizationAction } from "./actions";

export const metadata: Metadata = { title: "Autorização de acesso aos e-mails da obra" };

const MESSAGES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  autorizado: { tone: "ok", text: "Autorização registrada para esta obra. Ela não conecta a conta sozinha: a conexão é feita pelo administrador." },
  recusado: { tone: "ok", text: "Recusa registrada. Nada foi alterado na sua conta Google." },
  revogado: { tone: "ok", text: "Autorização revogada para esta obra. O histórico foi preservado." },
  already_decided: { tone: "warn", text: "Esta solicitação já foi respondida. Nada foi alterado." },
  confirmacao: { tone: "warn", text: "É preciso confirmar a decisão marcando a caixa de confirmação. Nada foi registrado." },
  notice_version_mismatch: { tone: "warn", text: "O texto desta autorização mudou. Recarregue a página e leia novamente. Nada foi registrado." },
  not_revocable: { tone: "warn", text: "Esta autorização não pode mais ser revogada. Nada foi alterado." },
  not_found: { tone: "warn", text: "Não foi possível registrar. Nada foi alterado." },
  falha: { tone: "warn", text: "Não foi possível registrar agora. Tente novamente; nada foi alterado." },
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}

const STATUS_STYLE: Record<AuthorizationStatus, string> = {
  PENDENTE: "bg-amber-100 text-amber-900",
  AUTORIZADO: "bg-emerald-100 text-emerald-900",
  RECUSADO: "bg-gray-200 text-gray-900",
  REVOGADO: "bg-red-100 text-red-900",
};

export default async function EmailAuthorizationPage({
  params,
  searchParams,
}: {
  params: Promise<{ authorizationId: string }>;
  searchParams: Promise<{ acao?: string | string[]; resultado?: string | string[]; erro?: string | string[] }>;
}) {
  const { authorizationId } = await params;
  const query = await searchParams;

  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  const authorization = authData.user ? await getEmailAuthorization(authorizationId) : null;

  if (!authorization) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-lg">
          <CardContent className="pt-6 text-sm text-destructive">Este link não existe ou o seu usuário não tem acesso a esta autorização.</CardContent>
        </Card>
      </div>
    );
  }

  const [project, events] = await Promise.all([getProject(authorization.projectId), getEmailAuthorizationEvents(authorization.id)]);
  const projectName = project?.name ?? "Obra";
  const isSubject = authData.user?.id === authorization.userId;
  const sections = getNoticeSections(authorization.noticeVersion);
  // GET só ABRE o painel de confirmação; nada é registrado até o envio do formulário.
  const action = isSubject ? parseAuthorizationAction(query.acao, authorization.status) : null;
  const flashKey = (Array.isArray(query.resultado) ? query.resultado[0] : query.resultado) ?? (Array.isArray(query.erro) ? query.erro[0] : query.erro);
  const flash = flashKey ? MESSAGES[flashKey] : undefined;
  const here = `/autorizacao-email/${authorization.id}`;

  return (
    <div className="min-h-dvh bg-muted p-3 sm:p-4">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        {/* Cabeçalho em uma linha: logo ACC à esquerda, título centralizado, foto da AXIA (clicável) à direita. */}
        <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 shadow-sm sm:gap-4 sm:px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/branding/acc-logo.png" alt="ACC" className="h-10 w-auto sm:h-12" />
          <h1 className="text-balance text-center text-sm font-bold leading-tight text-brand-sidebar sm:text-xl">Autorização de acesso aos e-mails da obra</h1>
          <VeraTrigger context="autorizacao" variant="photo" />
        </header>

        {flash ? (
          <p role="status" className={`rounded-md px-3 py-2 text-sm ${flash.tone === "ok" ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {flash.text}
          </p>
        ) : null}

        <Card>
          <CardContent className="space-y-3 pt-4 text-sm">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-gray-500">Colaborador</dt>
                <dd className="font-semibold">{authorization.userName}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Conta</dt>
                <dd className="break-all font-semibold">{authorization.accountEmail}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Obra</dt>
                <dd className="font-semibold">{projectName}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Solicitada em</dt>
                <dd className="font-semibold">{formatDateTime(authorization.requestedAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Aceite no ACC</dt>
                <dd>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[authorization.status]}`}>{authorizationStatusLabel(authorization.status)}</span>
                  {authorization.decidedAt ? <span className="ml-2 text-xs text-gray-500">em {formatDateTime(authorization.decidedAt)}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Conexão da conta Google (separada do aceite)</dt>
                <dd className="font-semibold">{connectionStatusLabel(authorization.connectionStatus)}</dd>
              </div>
            </dl>
            <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700">
              O aceite registrado aqui é o seu consentimento no ACC. Ele não conecta nem desconecta a conta Google: a conexão é feita pelo administrador, com credenciais guardadas no servidor.
            </p>
          </CardContent>
        </Card>

        {sections ? (
          <Card>
            <CardContent className="space-y-4 pt-4 text-sm">
              {sections.map((section) => (
                <section key={section.id} aria-labelledby={`sec-${section.id}`} className="space-y-1">
                  <h2 id={`sec-${section.id}`} className="text-sm font-bold text-brand-sidebar">
                    {section.title}
                  </h2>
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-gray-800">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
              <p className="text-xs text-gray-500">Versão do texto: {authorization.noticeVersion}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-4 text-sm text-amber-900">
              O texto desta autorização (versão {authorization.noticeVersion}) não está mais disponível. Peça ao administrador da obra uma nova solicitação.
            </CardContent>
          </Card>
        )}

        {isSubject && sections && authorization.status === "PENDENTE" ? (
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <h2 className="text-sm font-bold text-brand-sidebar">Sua decisão para esta obra</h2>
              {!action ? (
                <>
                  <p className="text-gray-700">Escolha uma opção. Você ainda vai confirmar na próxima etapa; nada é registrado só por abrir esta página.</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Link href={`${here}?acao=autorizar`} className="flex min-h-11 items-center justify-center rounded-md bg-brand-sidebar px-4 py-2 text-center text-sm font-bold text-white hover:opacity-90">
                      AUTORIZAR ACESSO PARA ESTA OBRA
                    </Link>
                    <Link href={`${here}?acao=recusar`} className="flex min-h-11 items-center justify-center rounded-md border-2 border-brand-sidebar px-4 py-2 text-center text-sm font-bold text-brand-sidebar hover:bg-gray-50">
                      NÃO AUTORIZAR
                    </Link>
                  </div>
                </>
              ) : (
                <form action={decideAuthorizationAction} className="space-y-3 rounded-md border border-gray-300 p-3">
                  <input type="hidden" name="authorizationId" value={authorization.id} />
                  <input type="hidden" name="noticeVersion" value={authorization.noticeVersion} />
                  <input type="hidden" name="decision" value={action === "autorizar" ? "AUTORIZADO" : "RECUSADO"} />
                  <p className="font-bold">{action === "autorizar" ? "Confirmar: AUTORIZAR o acesso para esta obra" : "Confirmar: NÃO AUTORIZAR o acesso para esta obra"}</p>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="confirm" value="sim" required className="mt-1 size-5" />
                    <span>
                      {action === "autorizar"
                        ? `Li as informações acima e autorizo o ACC a usar a conta ${authorization.accountEmail} na obra ${projectName}, com as permissões e filtros descritos.`
                        : `Li as informações acima e não autorizo o uso da conta ${authorization.accountEmail} na obra ${projectName}.`}
                    </span>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="submit" className="min-h-11 rounded-md bg-brand-sidebar px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                      {action === "autorizar" ? "CONFIRMAR AUTORIZAÇÃO" : "CONFIRMAR RECUSA"}
                    </button>
                    <Link href={here} className="flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                      Voltar sem decidir
                    </Link>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        ) : null}

        {isSubject && authorization.status === "AUTORIZADO" ? (
          <Card>
            <CardContent className="space-y-3 pt-4 text-sm">
              <h2 className="text-sm font-bold text-brand-sidebar">Revogar autorização desta obra</h2>
              {action === "revogar" ? (
                <form action={revokeAuthorizationAction} className="space-y-3 rounded-md border border-gray-300 p-3">
                  <input type="hidden" name="authorizationId" value={authorization.id} />
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs text-gray-600">Motivo (opcional)</span>
                    <input name="note" maxLength={500} className="min-h-11 w-full rounded-md border border-gray-300 px-3 py-2" />
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="confirm" value="sim" required className="mt-1 size-5" />
                    <span>Confirmo que quero revogar a autorização da conta {authorization.accountEmail} para a obra {projectName}.</span>
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button type="submit" className="min-h-11 rounded-md bg-brand-sidebar px-4 py-2 text-sm font-bold text-white hover:opacity-90">
                      CONFIRMAR REVOGAÇÃO
                    </button>
                    <Link href={here} className="flex min-h-11 items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50">
                      Voltar
                    </Link>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-gray-700">Revogar no ACC registra o fim do seu consentimento para esta obra. A permissão dada ao Google continua até você removê-la (veja “Como revogar a permissão concedida ao Google”, acima).</p>
                  <Link href={`${here}?acao=revogar`} className="inline-flex min-h-11 items-center rounded-md border-2 border-brand-sidebar px-4 py-2 text-sm font-bold text-brand-sidebar hover:bg-gray-50">
                    Revogar autorização desta obra
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {!isSubject ? (
          <Card>
            <CardContent className="pt-4 text-sm text-gray-700">Somente {authorization.userName} pode responder a esta solicitação. Administradores acompanham e revogam pela aba “Autorizações” da obra.</CardContent>
          </Card>
        ) : null}

        {events.length > 0 ? (
          <Card>
            <CardContent className="space-y-2 pt-4 text-sm">
              <h2 className="text-sm font-bold text-brand-sidebar">Histórico</h2>
              <ul className="space-y-1">
                {events.map((event) => (
                  <li key={event.id} className="text-gray-800">
                    <span className="font-semibold">{{ SOLICITADA: "Solicitada", AUTORIZADA: "Autorizada", RECUSADA: "Recusada", REVOGADA: "Revogada" }[event.eventType]}</span>
                    {" — "}
                    {formatDateTime(event.occurredAt)}
                    {event.actorName ? ` · ${event.actorName}` : ""}
                    {event.note ? ` · ${event.note}` : ""}
                    <span className="text-xs text-gray-500"> (texto v{event.noticeVersion})</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>

      <AssistantWidget projectId={authorization.projectId} />
    </div>
  );
}
