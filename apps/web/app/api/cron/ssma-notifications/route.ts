import { createSupabaseAdminClient } from "@axion/db/admin";
import { isCronRequestAuthorized } from "@/lib/cron/cron-request-auth";
import { FakeEmailProvider } from "@/lib/email/fake-email-provider";
import { createNotifyDeps, createProviderMailer, sweepFieldNotifications } from "@/lib/ssma/field-notifications/server";

export const runtime = "nodejs";
export const maxDuration = 300;

let inFlight = false;

// Varredura horária: ação corretiva SSMA em atraso + rede de segurança de registros críticos ainda não avisados.
// FAIL CLOSED: só roda com ACC_SSMA_NOTIFICATIONS_ENABLED=true (valor exato). `?dryRun=1` usa o provedor FALSO
// (nenhum e-mail sai) e grava as entregas normalmente para conferência.
export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request, process.env.CRON_SECRET)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  if (process.env.ACC_SSMA_NOTIFICATIONS_ENABLED !== "true") return new Response(null, { status: 204 });
  if (inFlight) return Response.json({ error: "Execução anterior em andamento." }, { status: 409 });

  inFlight = true;
  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const admin = createSupabaseAdminClient();
    const mailer = dryRun ? createProviderMailer(admin, new FakeEmailProvider()) : createProviderMailer(admin);
    const result = await sweepFieldNotifications(admin, { deps: createNotifyDeps(admin, mailer) });
    const failed = result.criticalRecords.failed + result.overdueActions.failed;
    return Response.json({ dryRun, ...result }, { status: failed > 0 ? 207 : 200 });
  } catch {
    return Response.json({ error: "Falha ao processar as notificações de SSMA." }, { status: 500 });
  } finally {
    inFlight = false;
  }
}
