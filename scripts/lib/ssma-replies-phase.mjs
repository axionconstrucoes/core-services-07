// Fase `replies` — respostas por e-mail aos avisos de AÇÃO CORRETIVA SSMA (escopo WEG_CORRECTIVE_ACTIONS).
//
// Lê (somente leitura) a caixa institucional já autenticada pela fase de respostas dos alertas de risco, resolve o hash do
// token do Reply-To registrado na auditoria da ação (SSMA_REPLY_TOKEN_ISSUED) e PERSISTE a interpretação:
//   - evento ANDAMENTO na ação corretiva (histórico; nunca conclui a ação);
//   - ABERTA -> EM_ANDAMENTO quando a resposta indica tratamento em curso (e não é fora de ordem);
//   - "assumir" da ação SLA vinculada (acknowledged_at) se ainda não houver — prazos e escalonamentos NÃO mudam;
//   - auditoria SSMA_REPLY_PROCESSED (interpretação) e SSMA_REPLY_CONFIRMATION_PENDING (a confirmação é enviada pela rota
//     /api/cron/ssma-notifications SÓ depois desta persistência).
// Sem e-mail, nome ou corpo nos logs (repositório público): só contagens.

const { decideSsmaReply, confirmationForecastLine, confirmationPendingLine, ssmaSeverityOf, SSMA_REPLY_ENTITY_TYPE, SSMA_REPLY_TOKEN_ISSUED, SSMA_REPLY_PROCESSED, SSMA_REPLY_IGNORED, SSMA_REPLY_CONFIRMATION_PENDING } =
  await import("../../apps/web/lib/ssma/field-notifications/replies");
const { extractInboundFromGmail } = await import("../../apps/web/lib/risk-alerts/replies/gmail-reply-extract");
const { extractReplyTokens, hashReplyToken } = await import("../../apps/web/lib/risk-alerts/replies/reply-pipeline");

const WEG_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

function parseDetail(detail) {
  try {
    return JSON.parse(String(detail ?? ""));
  } catch {
    return null;
  }
}

export async function runSsmaRepliesPhase({ supabase, gmail, mailbox, projectId = WEG_PROJECT_ID }) {
  const summary = { tokens: 0, matched: 0, processed: 0, ignored: 0, unauthorized: 0, errors: 0 };
  const { data: auditRows, error } = await supabase
    .from("audit_log_entries")
    .select("entity_id,action,detail,occurred_at")
    .eq("project_id", projectId)
    .eq("entity_type", SSMA_REPLY_ENTITY_TYPE)
    .in("action", [SSMA_REPLY_TOKEN_ISSUED, SSMA_REPLY_PROCESSED, SSMA_REPLY_IGNORED])
    .order("occurred_at", { ascending: true })
    .limit(2000);
  if (error) throw new Error("Falha ao ler os tokens de resposta SSMA.");

  const actionByTokenHash = new Map();
  const processedIds = new Set();
  const lastReceivedByAction = new Map();
  for (const row of auditRows ?? []) {
    const detail = parseDetail(row.detail);
    if (!detail) continue;
    if (row.action === SSMA_REPLY_TOKEN_ISSUED && typeof detail.tokenSha256 === "string") {
      actionByTokenHash.set(detail.tokenSha256, { actionId: row.entity_id, recordId: detail.recordId });
    } else if (typeof detail.providerMessageId === "string") {
      processedIds.add(detail.providerMessageId);
      if (row.action === SSMA_REPLY_PROCESSED && typeof detail.receivedAt === "string" && !detail.outOfOrder) {
        const prev = lastReceivedByAction.get(row.entity_id);
        if (!prev || detail.receivedAt > prev) lastReceivedByAction.set(row.entity_id, detail.receivedAt);
      }
    }
  }
  summary.tokens = actionByTokenHash.size;
  if (actionByTokenHash.size === 0) return summary;

  // Membros ativos da obra (autorização do remetente).
  const { data: memberships } = await supabase.from("project_memberships").select("user_id,permission,status").eq("project_id", projectId).eq("status", "ACTIVE");
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id,name,email").in("id", userIds) : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members = (memberships ?? []).map((m) => ({ userId: m.user_id, email: profileById.get(m.user_id)?.email ?? null, status: m.status, permission: m.permission }));

  const audit = (actionId, action, detail) =>
    supabase.from("audit_log_entries").insert({
      project_id: projectId,
      actor_type: "SYSTEM",
      actor_user_id: null,
      actor_label: null,
      action,
      entity_type: SSMA_REPLY_ENTITY_TYPE,
      entity_id: actionId,
      detail: JSON.stringify(detail),
    });

  const [local] = mailbox.split("@");
  let pageToken;
  do {
    let page;
    try {
      page = await gmail.users.messages.list({ userId: "me", q: `to:${local}+alerta- newer_than:30d -from:me`, maxResults: 100, pageToken });
    } catch {
      break;
    }
    for (const stub of page.data.messages ?? []) {
      if (!stub.id || processedIds.has(stub.id)) continue;
      let full;
      try {
        full = await gmail.users.messages.get({ userId: "me", id: stub.id, format: "full" });
      } catch {
        continue;
      }
      const headers = full.data.payload?.headers ?? [];
      const addressed = headers.filter((h) => /^(to|cc|delivered-to)$/i.test(h.name ?? "")).map((h) => h.value ?? "");
      const tokens = extractReplyTokens(addressed.flatMap((v) => v.split(",")));
      const targets = [...new Map(tokens.map((t) => actionByTokenHash.get(hashReplyToken(t))).filter(Boolean).map((t) => [t.actionId, t])).values()];
      if (targets.length !== 1) continue; // não é resposta SSMA (ou ambígua): fica para os alertas de risco/revisão
      summary.matched += 1;
      const target = targets[0];
      const extracted = extractInboundFromGmail(full.data, mailbox);
      if (!extracted || extracted.isSentByMailbox) continue;

      try {
        const { data: action } = await supabase.from("ssma_corrective_actions").select("id,record_id,project_id,status,responsible_user_id,sla_action_id").eq("id", target.actionId).maybeSingle();
        if (!action || action.project_id !== projectId) continue;
        const { data: record } = await supabase.from("ssma_field_records").select("risk_level").eq("id", action.record_id).maybeSingle();
        const decision = decideSsmaReply({
          message: { providerMessageId: extracted.providerMessageId, headers: extracted.headers, bodyOriginal: extracted.bodyOriginal, receivedAt: extracted.receivedAt },
          target: {
            actionId: action.id,
            recordId: action.record_id,
            projectId,
            actionStatus: action.status,
            responsibleUserId: action.responsible_user_id,
            severity: ssmaSeverityOf(record?.risk_level),
            lastProcessedReceivedAt: lastReceivedByAction.get(action.id) ?? null,
          },
          members,
          accMailboxes: [mailbox],
          processedMessageIds: processedIds,
        });

        if (decision.kind !== "PROCESS") {
          const reason = decision.reason;
          if (reason !== "ALREADY_PROCESSED") {
            await audit(action.id, SSMA_REPLY_IGNORED, { providerMessageId: extracted.providerMessageId, reason, receivedAt: extracted.receivedAt });
            processedIds.add(extracted.providerMessageId);
          }
          if (decision.kind === "UNAUTHORIZED") summary.unauthorized += 1;
          else summary.ignored += 1;
          continue;
        }

        // 1) Histórico da ação (sempre, inclusive fora de ordem).
        const { error: eventError } = await supabase.from("ssma_corrective_action_events").insert({
          action_id: action.id,
          project_id: projectId,
          kind: "ANDAMENTO",
          note: decision.note,
          actor_user_id: decision.actorUserId,
        });
        if (eventError) throw new Error("evento");
        // 2) Situação da ação corretiva (ABERTA -> EM_ANDAMENTO); nunca conclui.
        if (decision.newActionStatus) {
          await supabase.from("ssma_corrective_actions").update({ status: decision.newActionStatus }).eq("id", action.id).eq("status", "ABERTA");
        }
        // 3) "Assumir" da ação SLA vinculada — prazos, nível e escalonamentos inalterados.
        if (decision.acknowledge && !decision.outOfOrder && action.sla_action_id) {
          await supabase
            .from("sla_actions")
            .update({ acknowledged_at: extracted.receivedAt, acknowledged_by_user_id: decision.actorUserId })
            .eq("id", action.sla_action_id)
            .is("acknowledged_at", null);
        }
        // 4) Interpretação auditada.
        const interpretation = {
          providerMessageId: extracted.providerMessageId,
          receivedAt: extracted.receivedAt,
          status: decision.status,
          forecastStatus: decision.forecast.status,
          forecastAt: decision.forecast.status === "VALID" ? decision.forecast.iso : null,
          forecastProblem: decision.forecastProblem,
          tracked: decision.tracked,
          outOfOrder: decision.outOfOrder,
          newActionStatus: decision.newActionStatus,
          actorUserId: decision.actorUserId,
        };
        const { error: processedError } = await audit(action.id, SSMA_REPLY_PROCESSED, interpretation);
        if (processedError) throw new Error("auditoria");
        processedIds.add(extracted.providerMessageId);
        if (!decision.outOfOrder) lastReceivedByAction.set(action.id, extracted.receivedAt);
        // 5) Confirmação pendente (enviada pela rota SSMA somente após esta persistência).
        const sender = profileById.get(decision.actorUserId);
        await audit(action.id, SSMA_REPLY_CONFIRMATION_PENDING, {
          providerMessageId: extracted.providerMessageId,
          actionId: action.id,
          recordId: action.record_id,
          to: (sender?.email ?? extracted.headers.from).toLowerCase(),
          recipientName: sender?.name ?? null,
          inReplyTo: extracted.headers.messageId,
          references: [...extracted.headers.references, ...(extracted.headers.messageId ? [extracted.headers.messageId] : [])].slice(-20),
          originalSubject: extracted.headers.subject ?? "",
          statusLabel: decision.statusLabel,
          forecastLine: confirmationForecastLine(decision),
          pendingLine: confirmationPendingLine(decision),
          outOfOrder: decision.outOfOrder,
        });
        summary.processed += 1;
      } catch {
        summary.errors += 1; // sem detalhes no log público; a mensagem será tentada de novo na próxima rodada
      }
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);
  return summary;
}
