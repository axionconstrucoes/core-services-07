import { runGmailPilotAuthCheck } from "@/lib/email/gmail-auth-check";
import { isCronRequestAuthorized, RISK_ALERTS_CRON_SECRET_ENV } from "@/lib/cron/cron-request-auth";
import { isWeeklyReportsEnabled } from "@/lib/feature-flags/weekly-reports";
import { authorizePilotSingleRequest, runPilotSingleAlert } from "@/lib/risk-alerts/run-pilot-single-alert";
import { runRiskAlertCycle } from "@/lib/risk-alerts/run-risk-alert-cycle";

// Worker horário dos alertas de risco. Disparado pelo workflow GitHub
// horário (.github/workflows/weekly-schedule-email-ingestion.yml, job
// risk-alerts) — o plano Vercel atual admite só 2 crons diários, por isso
// a rota NÃO está em vercel.json. Segredo DEDICADO do piloto:
// Authorization: Bearer ACC_RISK_ALERTS_CRON_SECRET — exclusivamente
// esse (sem fallback para o CRON_SECRET dos crons Vercel); só no header
// (nunca query string); comparação em tempo constante; ausente/vazio/
// incorreto => 401; o header nunca é registrado.
// - ACC_WEEKLY_REPORTS_ENABLED != "true" => 204 sem tocar no banco.
// - ?dryRun=1 => só o plano (nenhuma escrita, nenhum envio), para
//   inspeção manual controlada.
// - ?projectId=<uuid> => restringe a um projeto.
// - Execução concorrente na mesma instância => 409 (o ciclo já é
//   idempotente pela outbox; entre instâncias, o workflow tem
//   concurrency group e as chaves únicas impedem duplicidade).
// - ?pilotSingleCase=<uuid do caso> => execução MANUAL ÚNICA do piloto WEG (run-pilot-single-alert.ts), no lugar do ciclo:
//   nunca roda o ciclo normal, não liga risk_alerts_enabled e usa a mesma cadeia de guardas do provider. Com dryRun=1 só
//   simula (sem escrita/envio). ?pilotSingleRecipient=<uuid do usuário da allowlist> seleciona UM destinatário lógico (obrigatório
//   na execução real quando a entrega é a caixa única axion@). Sem dryRun, só envia se o id do caso for IDÊNTICO ao configurado em
//   ACC_PILOT_SINGLE_ALERT_CASE_ID no servidor (armamento explícito e removível); ausente/divergente => 403.
// A janela do consolidado (quarta 07:00 no timezone do projeto) é decidida
// pelo próprio ciclo a cada hora — o agendamento em UTC nunca fixa o
// horário local.
export const runtime = "nodejs";
export const maxDuration = 300;

let inFlight = false;

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request, process.env[RISK_ALERTS_CRON_SECRET_ENV])) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (!isWeeklyReportsEnabled()) {
    return new Response(null, { status: 204 });
  }
  if (inFlight) {
    return Response.json({ error: "Ciclo de alertas já em execução." }, { status: 409 });
  }

  const url = new URL(request.url);
  // ?pilotAuthCheck=1 => DIAGNÓSTICO somente-leitura da autenticação Gmail do piloto (gmail-auth-check.ts): renova o access token com as
  // credenciais da Vercel e devolve só campos normalizados. Nunca envia, nunca chama o Gmail de mensagens, nunca toca na outbox nem
  // no ciclo. Mesma autenticação (segredo dedicado) da rota; sem endpoint novo.
  if (url.searchParams.get("pilotAuthCheck") === "1") {
    const check = await runGmailPilotAuthCheck();
    return Response.json(check, { status: check.ok ? 200 : 207, headers: { "Cache-Control": "no-store" } });
  }

  const dryRun = url.searchParams.get("dryRun") === "1";
  const projectId = url.searchParams.get("projectId");

  const pilotSingle = authorizePilotSingleRequest(url.searchParams);
  if (pilotSingle !== null) {
    if (!pilotSingle.ok) return Response.json({ error: pilotSingle.error }, { status: pilotSingle.status });
    inFlight = true;
    try {
      const single = await runPilotSingleAlert({ caseId: pilotSingle.caseId, dryRun: pilotSingle.dryRun, recipientUserId: pilotSingle.recipientUserId });
      return Response.json(single, { status: single.failed > 0 ? 207 : 200 });
    } catch {
      return Response.json({ error: "Falha na execução única do piloto." }, { status: 500 });
    } finally {
      inFlight = false;
    }
  }

  inFlight = true;
  try {
    const result = await runRiskAlertCycle({ dryRun, projectId: projectId && /^[0-9a-f-]{36}$/i.test(projectId) ? projectId : null });
    const failed = result.projects.reduce((sum, project) => sum + project.failed, 0);
    return Response.json(result, { status: failed > 0 ? 207 : 200 });
  } catch {
    // Nunca vaza detalhes (tokens, e-mails) no corpo da resposta.
    return Response.json({ error: "Falha ao processar alertas de risco." }, { status: 500 });
  } finally {
    inFlight = false;
  }
}
