import { createSupabaseAdminClient } from "@axion/db/admin";
import { createSupabaseServerClient } from "@axion/db/server";
import { getCurrentProjectPermission } from "@/lib/contract-review";
import { NOTIFICATIONS_DISABLED, ssmaNotificationsEnabled } from "@/lib/ssma/field-notifications/enabled";
import { notifyCriticalRecord } from "@/lib/ssma/field-notifications/server";

// Aviso por e-mail de registro CRÍTICO de campo. Chamado pelo app logo depois que o registro chega ao servidor.
// Idempotente: repetir a chamada (fila offline, duas abas, reenvio) nunca envia o mesmo aviso duas vezes ao mesmo
// destinatário. Só o autor do registro ou um Administrador da obra pode acioná-lo.
// FAIL CLOSED: sem ACC_SSMA_NOTIFICATIONS_ENABLED=true (valor exato) NADA é enviado, nenhum provedor de e-mail é chamado e nenhuma entrega é
// gravada; a resposta é um estado explícito de "desativadas" (200), que não impede o salvamento nem a sincronização do registro.
export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return Response.json({ error: "Sessão expirada." }, { status: 401 });

  if (!ssmaNotificationsEnabled()) return Response.json({ skipped: NOTIFICATIONS_DISABLED, notificationsEnabled: false }, { status: 200 });

  let recordId = "";
  try {
    recordId = String(((await request.json()) as { recordId?: unknown }).recordId ?? "").trim();
  } catch {
    return Response.json({ error: "Conteúdo inválido." }, { status: 400 });
  }
  if (!/^[0-9a-f-]{36}$/i.test(recordId)) return Response.json({ error: "Registro inválido." }, { status: 400 });

  const admin = createSupabaseAdminClient();
  const { data: record } = await admin.from("ssma_field_records").select("id,project_id,reported_by_user_id,risk_level").eq("id", recordId).maybeSingle();
  if (!record) return Response.json({ error: "Registro não encontrado." }, { status: 404 });

  const permission = await getCurrentProjectPermission(record.project_id as string);
  if (permission === null || (record.reported_by_user_id !== authData.user.id && permission !== "ADMINISTRADOR")) {
    return Response.json({ error: "Acesso negado." }, { status: 403 });
  }

  try {
    const summary = await notifyCriticalRecord(admin, recordId);
    if (!("sent" in summary)) return Response.json({ skipped: summary.skipped }, { status: 200 });
    // Resultado sem e-mails de terceiros: só contagens e o que o usuário precisa ver.
    return Response.json(summary, { status: summary.failed > 0 ? 502 : 200 });
  } catch {
    return Response.json({ error: "Não foi possível processar o aviso agora. Será tentado de novo automaticamente." }, { status: 500 });
  }
}
