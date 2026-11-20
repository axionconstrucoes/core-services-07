// Fase `replies` — respostas por e-mail aos avisos de AÇÃO CORRETIVA SSMA (escopo WEG_CORRECTIVE_ACTIONS).
//
// Lê (somente leitura) a caixa institucional já autenticada pela fase de respostas dos alertas de risco e resolve o destino:
//   1º token POR ITEM (email_reply_tokens, tipo SSMA_ACTION); 2º hash legado da auditoria da ação (SSMA_REPLY_TOKEN_ISSUED,
//   lida PAGINADA — sem o antigo teto de 2000 linhas, que fazia tokens novos e ids já processados deixarem de carregar).
// Remetente (P2): domínio corporativo + perfil com o e-mail EXATO do From + membro ATIVO + DMARC/DKIM alinhado (servidor
// confiável) + responsável atual ou Administrador. Limite de taxa por remetente/hora (excedente => revisão humana).
// Toda gravação passa pelas RPCs *_by_email (MESMA regra das RPCs do app; nada de UPDATE direto):
//   - EM ANDAMENTO => ssma_corrective_action_update_by_email(ANDAMENTO) — histórico, ABERTA -> EM_ANDAMENTO e "assumir" do SLA;
//   - RESOLVIDO    => foto JPEG/PNG <= 15 MB anexada (sha256, Storage, ssma_field_record_register_photo_by_email como
//                     EVIDENCIA_ACAO do MESMO registro) + ssma_corrective_action_update_by_email(CONCLUIDA, foto). Sem foto =>
//                     resposta pedindo a evidência; NUNCA conclui;
//   - ENVIAR PARA  => ssma_corrective_action_forward_by_email (destino por e-mail exato ou nome único; justificativa >= 5).
// Confirmação ao remetente SÓ depois da gravação (auditoria SSMA_REPLY_CONFIRMATION_PENDING, enviada pela rota
// /api/cron/ssma-notifications); recusas/pendências também são respondidas e auditadas (SSMA_REPLY_REJECTED), sem gravar na ação.
// Cada mensagem processada/recusada fica em email_reply_inbound_log (idempotência + limite de taxa) — sem corpo.
// Sem e-mail, nome ou corpo nos logs (repositório público): só contagens.

const {
  decideSsmaReply,
  confirmationForecastLine,
  confirmationPendingLine,
  ssmaSeverityOf,
  ssmaRpcErrorMessage,
  SSMA_REPLY_ENTITY_TYPE,
  SSMA_REPLY_TOKEN_ISSUED,
  SSMA_REPLY_PROCESSED,
  SSMA_REPLY_IGNORED,
  SSMA_REPLY_REJECTED,
  SSMA_REPLY_CONFIRMATION_PENDING,
} = await import("../../apps/web/lib/ssma/field-notifications/replies");
const { extractInboundFromGmail } = await import("../../apps/web/lib/risk-alerts/replies/gmail-reply-extract");
const { extractReplyTokens, hashReplyToken } = await import("../../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { createSupabaseEmailReplyTokenStore, tokenUsability } = await import("../../apps/web/lib/email-replies/reply-tokens");
const { SenderRateLimiter, resolveSenderRateLimit } = await import("../../apps/web/lib/email-replies/sender-rate-limit");
const { resolveTrustedAuthservIds } = await import("../../apps/web/lib/email-replies/sender-authentication");
const { decodeGmailData, ssmaPhotoStoragePath, validateSsmaEvidencePhoto, MAX_EVIDENCE_ATTACHMENTS } = await import("../../apps/web/lib/email-replies/inbound-attachments");

const WEG_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
export const SSMA_AUDIT_PAGE_SIZE = 1000;
const AUDIT_MAX_ROWS = 500_000; // trava de segurança (nunca um teto silencioso pequeno)

function parseDetail(detail) {
  try {
    return JSON.parse(String(detail ?? ""));
  } catch {
    return null;
  }
}

/** Auditoria SSMA de respostas, PAGINADA (ordem estável occurred_at, id) até a última página. */
export async function loadSsmaReplyAuditRows(supabase, projectId, pageSize = SSMA_AUDIT_PAGE_SIZE) {
  const rows = [];
  for (let from = 0; from < AUDIT_MAX_ROWS; from += pageSize) {
    const { data, error } = await supabase
      .from("audit_log_entries")
      .select("id,entity_id,action,detail,occurred_at")
      .eq("project_id", projectId)
      .eq("entity_type", SSMA_REPLY_ENTITY_TYPE)
      .in("action", [SSMA_REPLY_TOKEN_ISSUED, SSMA_REPLY_PROCESSED, SSMA_REPLY_IGNORED, SSMA_REPLY_REJECTED])
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error("Falha ao ler os tokens de resposta SSMA.");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

async function downloadAttachment(gmail, messageId, attachment) {
  if (attachment.inlineData) return decodeGmailData(attachment.inlineData);
  if (!attachment.attachmentId) return null;
  const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachment.attachmentId });
  return res?.data?.data ? decodeGmailData(res.data.data) : null;
}

const NOT_APPLIED = "NÃO aplicado — a ação continua como estava";
const TOKEN_TEXT = {
  TOKEN_EXPIRED: "Este atalho de resposta expirou (validade de 30 dias). Use o e-mail mais recente ou o ACC.",
  TOKEN_ALREADY_USED: "Este atalho de resposta já foi usado para concluir ou encaminhar esta ação. Use o e-mail mais recente ou o ACC.",
};

export async function runSsmaRepliesPhase({ supabase, gmail, mailbox, projectId = WEG_PROJECT_ID, now = () => new Date(), env = process.env, corporateDomain = "axion.com.br" }) {
  const summary = { tokens: 0, itemTokens: 0, matched: 0, processed: 0, rejected: 0, ignored: 0, unauthorized: 0, rateLimited: 0, errors: 0 };
  const auditRows = await loadSsmaReplyAuditRows(supabase, projectId);
  const tokenStore = createSupabaseEmailReplyTokenStore(supabase);
  const trustedAuthservIds = resolveTrustedAuthservIds(env);

  const actionByTokenHash = new Map();
  const processedIds = new Set();
  const lastReceivedByAction = new Map();
  for (const row of auditRows) {
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

  // Membros ativos da obra (autorização do remetente e destino do ENVIAR PARA).
  const { data: memberships } = await supabase.from("project_memberships").select("user_id,permission,status").eq("project_id", projectId).eq("status", "ACTIVE");
  const userIds = [...new Set((memberships ?? []).map((m) => m.user_id))];
  const { data: profiles } = userIds.length ? await supabase.from("profiles").select("id,name,email").in("id", userIds) : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const members = (memberships ?? []).map((m) => ({ userId: m.user_id, email: profileById.get(m.user_id)?.email ?? null, name: profileById.get(m.user_id)?.name ?? null, status: m.status, permission: m.permission }));

  // Limite de taxa: histórico recente de TODAS as respostas por e-mail processadas (risco e SSMA).
  const since = new Date(now().getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase.from("email_reply_inbound_log").select("sender_email,received_at,flow,provider_message_id").gte("received_at", since);
  for (const row of recent ?? []) if (row.flow === "SSMA") processedIds.add(row.provider_message_id);
  const limiter = new SenderRateLimiter(resolveSenderRateLimit(env), (recent ?? []).map((r) => ({ senderEmail: r.sender_email, receivedAt: r.received_at })));

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
  const log = async (extracted, actionId, outcome, reason) => {
    try {
      await supabase
        .from("email_reply_inbound_log")
        .insert({ flow: "SSMA", provider_message_id: extracted.providerMessageId, project_id: projectId, sender_email: extracted.headers.from.toLowerCase(), subject_kind: "SSMA_ACTION", subject_id: actionId, outcome, reason: reason ?? null, received_at: extracted.receivedAt });
    } catch {
      // o registro principal é a auditoria da ação
    }
  };
  const confirmation = (action, extracted, actorUserId, fields) => {
    const sender = profileById.get(actorUserId);
    return audit(action.id, SSMA_REPLY_CONFIRMATION_PENDING, {
      providerMessageId: extracted.providerMessageId,
      actionId: action.id,
      recordId: action.record_id,
      to: (sender?.email ?? extracted.headers.from).toLowerCase(),
      recipientName: sender?.name ?? null,
      inReplyTo: extracted.headers.messageId,
      references: [...extracted.headers.references, ...(extracted.headers.messageId ? [extracted.headers.messageId] : [])].slice(-20),
      originalSubject: extracted.headers.subject ?? "",
      outOfOrder: false,
      rejected: false,
      forecastLine: "não se aplica",
      pendingLine: null,
      ...fields,
    });
  };
  /** Recusa EXPLICADA: auditoria + confirmação "não aplicado" (nada gravado na ação). */
  const rejectWithReply = async (action, extracted, actorUserId, code, message, command) => {
    await audit(action.id, SSMA_REPLY_REJECTED, { providerMessageId: extracted.providerMessageId, receivedAt: extracted.receivedAt, code, command, actorUserId });
    processedIds.add(extracted.providerMessageId);
    await confirmation(action, extracted, actorUserId, { statusLabel: NOT_APPLIED, pendingLine: message, rejected: true });
    await log(extracted, action.id, "REJECTED", code);
    summary.rejected += 1;
  };

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
      const hashes = [...new Set(extractReplyTokens(addressed.flatMap((v) => v.split(","))).map((t) => hashReplyToken(t)))];
      if (hashes.length === 0) continue;
      // 1º token por item (email_reply_tokens); 2º legado (auditoria).
      let itemRows = [];
      try {
        itemRows = (await tokenStore.findByHashes(hashes)).filter((r) => r.subjectKind === "SSMA_ACTION" && r.projectId === projectId);
      } catch {
        itemRows = [];
      }
      const itemTargets = [...new Map(itemRows.map((r) => [r.subjectId, r])).values()];
      const legacyTargets = [...new Map(hashes.map((h) => actionByTokenHash.get(h)).filter(Boolean).map((t) => [t.actionId, t])).values()];
      const targetActionIds = itemTargets.length > 0 ? itemTargets.map((r) => r.subjectId) : legacyTargets.map((t) => t.actionId);
      if (targetActionIds.length !== 1) continue; // não é resposta SSMA (ou ambígua): fica para os alertas de risco/revisão
      const itemToken = itemTargets[0] ?? null;
      if (itemToken) summary.itemTokens += 1;
      summary.matched += 1;
      const extracted = extractInboundFromGmail(full.data, mailbox);
      if (!extracted || extracted.isSentByMailbox) continue;

      try {
        const { data: action } = await supabase.from("ssma_corrective_actions").select("id,record_id,project_id,status,responsible_user_id,sla_action_id").eq("id", targetActionIds[0]).maybeSingle();
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
          corporateDomain,
          trustedAuthservIds,
        });

        if (decision.kind === "IGNORE") {
          if (decision.reason !== "ALREADY_PROCESSED") {
            await audit(action.id, SSMA_REPLY_IGNORED, { providerMessageId: extracted.providerMessageId, reason: decision.reason, receivedAt: extracted.receivedAt });
            processedIds.add(extracted.providerMessageId);
            await log(extracted, action.id, "IGNORED", decision.reason);
          }
          summary.ignored += 1;
          continue;
        }
        if (decision.kind === "UNAUTHORIZED") {
          await audit(action.id, SSMA_REPLY_IGNORED, { providerMessageId: extracted.providerMessageId, reason: decision.reason, receivedAt: extracted.receivedAt });
          processedIds.add(extracted.providerMessageId);
          // Explicação só a membro ATIVO conhecido (e-mail exato), na caixa corporativa dele; desconhecido => recusa silenciosa auditada.
          if (decision.explainTo && decision.explanation) {
            await confirmation(action, extracted, decision.explainTo, { statusLabel: NOT_APPLIED, pendingLine: decision.explanation, rejected: true });
          }
          await log(extracted, action.id, "UNAUTHORIZED", decision.reason);
          summary.unauthorized += 1;
          continue;
        }
        // Limite de taxa (remetente já identificado e autenticado): excedente => revisão humana, sem execução nem resposta.
        if (!limiter.allow(extracted.headers.from, extracted.receivedAt)) {
          await audit(action.id, SSMA_REPLY_IGNORED, { providerMessageId: extracted.providerMessageId, reason: "RATE_LIMITED", receivedAt: extracted.receivedAt, reviewRequired: true });
          processedIds.add(extracted.providerMessageId);
          await log(extracted, action.id, "RATE_LIMITED", "Limite por remetente/hora — revisão humana");
          summary.rateLimited += 1;
          continue;
        }
        if (itemToken) {
          const usable = tokenUsability(itemToken, extracted.providerMessageId, now().toISOString());
          if (!usable.ok) {
            await rejectWithReply(action, extracted, decision.actorUserId, usable.reason, TOKEN_TEXT[usable.reason], decision.command);
            continue;
          }
        }
        if (decision.kind === "REJECT") {
          await rejectWithReply(action, extracted, decision.actorUserId, decision.code, decision.message, decision.command);
          continue;
        }

        // ---------- PROCESS: gravação SEMPRE pela RPC *_by_email ----------
        const terminal = decision.command === "RESOLVE" || decision.command === "FORWARD";
        let consumed = false;
        if (terminal && itemToken) {
          consumed = await tokenStore.consume(itemToken.tokenHash, extracted.providerMessageId, now().toISOString());
          if (!consumed) {
            await rejectWithReply(action, extracted, decision.actorUserId, "TOKEN_ALREADY_USED", TOKEN_TEXT.TOKEN_ALREADY_USED, decision.command);
            continue;
          }
        }
        const release = async () => {
          if (consumed) await tokenStore.release(itemToken.tokenHash, extracted.providerMessageId).catch(() => undefined);
          consumed = false;
        };
        const rpcFailure = async (error) => {
          await release();
          const mapped = ssmaRpcErrorMessage(String(error?.message ?? ""));
          if (mapped) {
            await rejectWithReply(action, extracted, decision.actorUserId, mapped.code, mapped.text, decision.command);
            return true;
          }
          return false; // erro desconhecido: nova tentativa na próxima rodada (nada auditado como processado)
        };

        let interpretationExtra = {};
        let statusLabel = decision.statusLabel;
        if (decision.command === "RESOLVE") {
          // Foto de evidência: a PRIMEIRA imagem válida (JPEG/PNG pelo conteúdo, <= 15 MB). Sem foto => pede (nunca conclui).
          let photo = null;
          let lastProblem = "EVIDENCE_PHOTO_MISSING";
          for (const attachment of extracted.attachments.slice(0, MAX_EVIDENCE_ATTACHMENTS)) {
            let bytes = null;
            try {
              bytes = await downloadAttachment(gmail, extracted.providerMessageId, attachment);
            } catch {
              bytes = null;
            }
            if (!bytes) continue;
            const validation = validateSsmaEvidencePhoto(bytes);
            if (!validation.ok) {
              lastProblem = validation.reason;
              continue;
            }
            photo = { ...validation, bytes, fileName: attachment.fileName };
            break;
          }
          if (!photo) {
            await release();
            const text =
              lastProblem === "PHOTO_TOO_LARGE"
                ? "A foto anexada passa de 15 MB. Responda com RESOLVIDO e uma foto menor (JPG ou PNG). A ação NÃO foi concluída."
                : lastProblem === "PHOTO_TYPE_INVALID"
                  ? "O anexo não é uma foto JPG ou PNG. Responda com RESOLVIDO e a FOTO de evidência anexada. A ação NÃO foi concluída."
                  : "A conclusão exige a FOTO de evidência anexada (JPG ou PNG até 15 MB). Responda com RESOLVIDO e a foto anexada. A ação NÃO foi concluída.";
            await rejectWithReply(action, extracted, decision.actorUserId, lastProblem === "EVIDENCE_PHOTO_MISSING" ? "EVIDENCE_REQUIRED" : lastProblem, text, "RESOLVE");
            continue;
          }
          // Mesma foto já registrada neste registro (reenvio): reaproveita se for evidência; foto do REGISTRO não vira evidência.
          const { data: existing } = await supabase.from("ssma_field_record_photos").select("id,purpose").eq("record_id", action.record_id).eq("sha256_hash", photo.sha256).maybeSingle();
          let photoId = existing?.purpose === "EVIDENCIA_ACAO" ? existing.id : null;
          if (existing && !photoId) {
            await release();
            await rejectWithReply(action, extracted, decision.actorUserId, "PHOTO_ALREADY_IN_RECORD", "Esta foto já faz parte do registro original. Envie uma foto que mostre a ação concluída. A ação NÃO foi concluída.", "RESOLVE");
            continue;
          }
          if (!photoId) {
            photoId = crypto.randomUUID();
            const storagePath = ssmaPhotoStoragePath(projectId, action.record_id, photoId, photo.fileName, photo.mimeType);
            const upload = await supabase.storage.from("project-documents").upload(storagePath, photo.bytes, { contentType: photo.mimeType, upsert: false });
            if (upload?.error) {
              await release();
              throw new Error("upload");
            }
            const { error: photoError } = await supabase.rpc("ssma_field_record_register_photo_by_email", {
              p_actor_user_id: decision.actorUserId,
              p_photo_id: photoId,
              p_record_id: action.record_id,
              p_storage_path: storagePath,
              p_original_file_name: photo.fileName,
              p_mime_type: photo.mimeType,
              p_file_size_bytes: photo.sizeBytes,
              p_sha256_hash: photo.sha256,
            });
            if (photoError) {
              if (await rpcFailure(photoError)) continue;
              throw new Error("foto");
            }
            try {
              await supabase.from("email_inbound_attachments").insert({ project_id: projectId, provider_message_id: extracted.providerMessageId, sha256: photo.sha256, file_name: photo.fileName, mime_type: photo.mimeType, size_bytes: photo.sizeBytes, storage_path: storagePath });
            } catch {
              // rastreabilidade adicional; a foto já está registrada no SSMA
            }
          }
          const { error } = await supabase.rpc("ssma_corrective_action_update_by_email", { p_actor_user_id: decision.actorUserId, p_action_id: action.id, p_event: "CONCLUIDA", p_note: decision.resolveNote, p_evidence_photo_id: photoId });
          if (error) {
            if (await rpcFailure(error)) continue;
            await release();
            throw new Error("conclusão");
          }
          interpretationExtra = { evidencePhotoId: photoId, evidenceSha256: photo.sha256 };
          statusLabel = "Concluída por e-mail com foto de evidência";
        } else if (decision.command === "FORWARD") {
          const { error } = await supabase.rpc("ssma_corrective_action_forward_by_email", { p_actor_user_id: decision.actorUserId, p_action_id: action.id, p_new_responsible_user_id: decision.forward.targetUserId, p_reason: decision.forward.reason });
          if (error) {
            if (await rpcFailure(error)) continue;
            await release();
            throw new Error("encaminhamento");
          }
          interpretationExtra = { forwardedTo: decision.forward.targetUserId };
        } else if (decision.command === "IN_PROGRESS") {
          const { error } = await supabase.rpc("ssma_corrective_action_update_by_email", { p_actor_user_id: decision.actorUserId, p_action_id: action.id, p_event: "ANDAMENTO", p_note: decision.note, p_evidence_photo_id: null });
          if (error) {
            if (await rpcFailure(error)) continue;
            throw new Error("andamento");
          }
        }
        // (status não identificado: nada é gravado na ação — só a interpretação auditada e o pedido de complementação.)

        const interpretation = {
          providerMessageId: extracted.providerMessageId,
          receivedAt: extracted.receivedAt,
          command: decision.command,
          status: decision.status,
          forecastStatus: decision.forecast.status,
          forecastAt: decision.forecast.status === "VALID" ? decision.forecast.iso : null,
          forecastProblem: decision.forecastProblem,
          tracked: decision.tracked,
          outOfOrder: decision.outOfOrder,
          newActionStatus: decision.newActionStatus,
          actorUserId: decision.actorUserId,
          viaItemToken: Boolean(itemToken),
          ...interpretationExtra,
        };
        const { error: processedError } = await audit(action.id, SSMA_REPLY_PROCESSED, interpretation);
        if (processedError) throw new Error("auditoria");
        processedIds.add(extracted.providerMessageId);
        if (!decision.outOfOrder) lastReceivedByAction.set(action.id, extracted.receivedAt);
        // Confirmação (enviada pela rota SSMA somente após esta persistência).
        await confirmation(action, extracted, decision.actorUserId, {
          statusLabel,
          forecastLine: confirmationForecastLine(decision),
          pendingLine: confirmationPendingLine(decision),
          outOfOrder: decision.outOfOrder,
        });
        await log(extracted, action.id, decision.command === "NONE" ? "REVIEW" : "APPLIED", decision.command);
        summary.processed += 1;
      } catch {
        summary.errors += 1; // sem detalhes no log público; a mensagem será tentada de novo na próxima rodada
      }
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);
  return summary;
}
