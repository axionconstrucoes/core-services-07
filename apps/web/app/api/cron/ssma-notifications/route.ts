import { createSupabaseAdminClient } from "@axion/db/admin";
import { isCronRequestAuthorized } from "@/lib/cron/cron-request-auth";
import { FakeEmailProvider } from "@/lib/email/fake-email-provider";
import { resolveSsmaNotificationScope } from "@/lib/ssma/field-notifications/enabled";
import { startRouteMetrics } from "@/lib/cron/route-metrics";
import { createNotifyDeps, createProviderMailer, previewOverdueActionNotifications, sweepFieldNotifications } from "@/lib/ssma/field-notifications/server";

export const runtime = "nodejs";
export const maxDuration = 300;

let inFlight = false;

// Varredura: ação corretiva SSMA em atraso + rede de segurança de registros críticos ainda não avisados + confirmações de resposta.
// FAIL CLOSED: só roda com ACC_SSMA_NOTIFICATIONS_ENABLED=true (valor exato) e escopo válido (ACC_SSMA_NOTIFICATIONS_SCOPE).
// Escopo WEG_CORRECTIVE_ACTIONS: `?dryRun=1` é uma PRÉVIA sem efeito (nada gravado, nenhum provedor chamado).
// Modo legado (sem escopo): `?dryRun=1` usa o provedor FALSO e grava as entregas normalmente para conferência.
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request, process.env.CRON_SECRET)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (process.env.ACC_SSMA_NOTIFICATIONS_ENABLED !== "true") return new Response(null, { status: 204 });
  const scope = resolveSsmaNotificationScope();
  if (scope.mode === "DISABLED" || scope.mode === "INVALID_SCOPE") return new Response(null, { status: 204 });
  if (inFlight) return Response.json({ error: "Execução anterior em andamento." }, { status: 409 });

  inFlight = true;
  const stopMetrics = startRouteMetrics();
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const admin = createSupabaseAdminClient();
    if (dryRun && scope.mode === "WEG_CORRECTIVE_ACTIONS") {
      const preview = await previewOverdueActionNotifications(admin, { scope });
      return Response.json({ dryRun: true, preview, metrics: stopMetrics() }, { status: 200 });
    }
    const mailer = dryRun ? createProviderMailer(admin, new FakeEmailProvider()) : createProviderMailer(admin);
    const result = await sweepFieldNotifications(admin, { deps: createNotifyDeps(admin, mailer), scope });
    const failed = result.criticalRecords.failed + result.overdueActions.failed + result.replyConfirmations.failed + (result.followUp?.failed ?? 0) + (result.followUp?.uncertain ?? 0);
    return Response.json({ dryRun, ...result, metrics: stopMetrics() }, { status: failed > 0 ? 207 : 200 });
  } catch {
    return Response.json({ error: "Falha ao processar as notificações de SSMA." }, { status: 500 });
  } finally {
    inFlight = false;
  }
}
