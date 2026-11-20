import { createSupabaseAdminClient } from "@axion/db/admin";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { informativeDeliveryOk } from "@/lib/email/informative-delivery";
import { deliverAccidentNotifications } from "@/lib/email/special-routine-deliveries";

// Comunicação imediata de acidente (alerta INFORMATIVO). Entrega pela outbox persistente
// (ssma_accident_notification_deliveries): reivindicação atômica, tentativas limitadas e classificadas, SENT só após o
// aceite do provedor. Falha transitória é retentada automaticamente pelo cron remoto /api/cron/system-health.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return Response.json({ error: "Sessão expirada." }, { status: 401 });

  let submissionId = "";
  try {
    submissionId = String((await request.json() as { submissionId?: unknown }).submissionId ?? "").trim();
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(submissionId)) {
    return Response.json({ error: "Registro inválido." }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: submission } = await admin.from("ssma_form_submissions").select("project_id").eq("id", submissionId).maybeSingle();
  if (!submission) return Response.json({ error: "Ocorrência finalizada não encontrada." }, { status: 404 });
  const projectId = String(submission.project_id);
  if ((await getCurrentProjectPermission(projectId)) === null) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  const outcome = await deliverAccidentNotifications(admin, submissionId);
  if (outcome.kind === "NOT_FOUND") return Response.json({ error: "Ocorrência finalizada não encontrada." }, { status: 404 });
  if (outcome.kind === "NO_RECIPIENTS") {
    // actor_type SYSTEM exige actor_user_id e actor_label nulos (constraint de audit_log_entries).
    await admin.from("audit_log_entries").insert({
      project_id: projectId,
      actor_type: "SYSTEM",
      actor_user_id: null,
      actor_label: null,
      action: "ACCIDENT_NOTIFICATION_TARGET_NOT_CONFIGURED",
      entity_type: "SSMA_FORM_SUBMISSION",
      entity_id: submissionId,
      detail: "Nenhum destinatário ativo de Engenharia/Comercial foi encontrado para a ocorrência.",
    });
    return Response.json({ error: "Destinatários não configurados." }, { status: 409 });
  }

  const { summary } = outcome;
  const ok = informativeDeliveryOk(summary);
  const failures = summary.retryableFailures + summary.terminalFailures + summary.terminalSkipped + summary.acceptedUnrecorded;
  await admin.from("audit_log_entries").insert({
    project_id: projectId,
    actor_type: "SYSTEM",
    actor_user_id: null,
    actor_label: null,
    action: ok ? "ACCIDENT_NOTIFICATION_SENT" : "ACCIDENT_NOTIFICATION_FAILED",
    entity_type: "SSMA_FORM_SUBMISSION",
    entity_id: submissionId,
    detail: `${summary.accepted + summary.alreadyAccepted} comunicação(ões) aceita(s) pelo provedor (aceite não é confirmação de entrega); ${failures} falha(s) (${summary.retryableFailures} com nova tentativa automática).`,
  });
  return Response.json(
    { accepted: summary.accepted + summary.alreadyAccepted, failures, retrying: summary.retryableFailures },
    { status: ok ? 200 : 502 }
  );
}
