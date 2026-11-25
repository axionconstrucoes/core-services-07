// Fase `replies` — respostas por e-mail com token POR ITEM de AÇÃO SLA, ITEM DO RESUMO SEMANAL e ALERTA DE CONTRATO (N3).
//
// Lê (somente leitura) a caixa institucional já autenticada pela fase de respostas dos alertas de risco; considera só as
// mensagens endereçadas a <caixa>+alerta-<token> cujo token (email_reply_tokens) é de um dos tipos SLA_ACTION,
// WEEKLY_DIGEST_ITEM ou CONTRACT_ALERT_ITEM das obras configuradas (risco e SSMA continuam nas fases próprias).
// Remetente: domínio corporativo + perfil com o e-mail EXATO do From + membro ATIVO + DMARC/DKIM alinhado (servidor
// confiável) + perfil diferente de LEITURA + quem pode agir no item (ou Administrador). Limite de taxa por remetente/hora.
// Toda gravação passa pelas RPCs *_by_email (MESMA regra das RPCs do app; nada de UPDATE direto), com idempotência
// transacional por mensagem (email_reply_command_receipts):
//   SLA_ACTION          RESOLVIDO => sla_action_complete_by_email (descrição; ALTO/CRÍTICO exige anexo-evidência)
//                       EM ANDAMENTO => sla_action_progress_by_email (assumir/estudando + providência e previsão)
//                       ENVIAR PARA => sla_action_forward_by_email
//   WEEKLY_DIGEST_ITEM  submit_weekly_alert_digest_item_by_email (RESOLVED / STUDYING / FORWARDED)
//   CONTRACT_ALERT_ITEM save_contract_alert_batch_item_response_by_email (RESOLVIDO / EM_ANDAMENTO / ENVIADO_PARA)
// Anexos do RESOLVIDO: guardados no Storage (sha256) + email_inbound_attachments e referenciados como evidência.
// Confirmação ao remetente SÓ depois da gravação (email_reply_confirmations, entregue pela aplicação); recusas e pedidos
// de complementação também são respondidos (nada gravado no item). Cada mensagem fica em email_reply_inbound_log (flow
// TOKEN) — sem corpo. Sem e-mail, nome ou corpo nos logs (repositório público): só contagens.

const { decideTokenReply, tokenReplyRpcErrorMessage, tokenReplyConfirmationLine, TOKEN_REPLY_KINDS } = await import("../../apps/web/lib/email-replies/token-reply-decision");
const { enqueueTokenReplyConfirmation } = await import("../../apps/web/lib/email-replies/token-reply-confirmations");
const { extractInboundFromGmail } = await import("../../apps/web/lib/risk-alerts/replies/gmail-reply-extract");
const { extractReplyTokens, hashReplyToken } = await import("../../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { createSupabaseEmailReplyTokenStore, tokenUsability } = await import("../../apps/web/lib/email-replies/reply-tokens");
const { SenderRateLimiter, resolveSenderRateLimit } = await import("../../apps/web/lib/email-replies/sender-rate-limit");
const { isSpecialistEmailEnabled } = await import("../../apps/web/lib/email-replies/specialist-flag");
const { recordSpecialistConsultation } = await import("../../apps/web/lib/email-replies/specialist-consultations");
const { resolveTrustedAuthservIds, resolveWorkspaceTenantDomains, resolveTokenOwnerStrict } = await import("../../apps/web/lib/email-replies/sender-authentication");
const { decodeGmailData, sha256Hex, buildEvidenceText, tokenReplyEvidenceStoragePath, MAX_EVIDENCE_ATTACHMENTS, MAX_EVIDENCE_ATTACHMENT_BYTES } = await import("../../apps/web/lib/email-replies/inbound-attachments");

const SEVERITY_FROM_PT = { CRITICA: "CRITICAL", ALTA: "HIGH", MEDIA: "MEDIUM", BAIXA: "LOW" };
const TOKEN_TEXT = {
  TOKEN_EXPIRED: "Este atalho de resposta expirou (validade de 30 dias). Use o e-mail mais recente ou o ACC.",
  TOKEN_ALREADY_USED: "Este atalho de resposta já foi usado para concluir ou encaminhar este item. Use o e-mail mais recente ou o ACC.",
};

/** Estado do item para a decisão (null = não existe / fora do escopo). */
export async function loadTokenReplyTarget(supabase, row) {
  if (row.subjectKind === "SLA_ACTION") {
    const { data: a } = await supabase.from("sla_actions").select("id,project_id,status,responsible_user_id,risk_level,area,related_ssma_corrective_action_id").eq("id", row.subjectId).maybeSingle();
    if (!a || a.project_id !== row.projectId) return null;
    const { data: linked } = await supabase.from("risk_alert_cases").select("id").eq("sla_action_id", a.id);
    const closed = a.status === "COMPLETED" || a.status === "CANCELLED";
    const closedReason = a.related_ssma_corrective_action_id
      ? "Esta é uma ação corretiva SSMA: responda pelo aviso SSMA (com a foto) ou registre no app SSMA. Nada foi alterado."
      : (linked ?? []).length > 0
        ? "Esta ação pertence a um alerta de risco: responda pelo e-mail do alerta ou registre pela página do alerta. Nada foi alterado."
        : closed
          ? "A ação já está concluída ou cancelada: nada foi alterado."
          : null;
    return {
      kind: "SLA_ACTION", subjectId: a.id, projectId: a.project_id, actorUserIds: a.responsible_user_id ? [a.responsible_user_id] : [],
      closed: Boolean(closedReason), closedReason, severity: a.risk_level, currentResponsibleUserId: a.responsible_user_id,
      evidenceRequired: a.risk_level === "HIGH" || a.risk_level === "CRITICAL", area: a.area ?? null,
    };
  }
  if (row.subjectKind === "WEEKLY_DIGEST_ITEM") {
    const { data: item } = await supabase.from("weekly_alert_digest_items").select("id,digest_id,action_id,risk_level,responded_at").eq("id", row.subjectId).maybeSingle();
    if (!item) return null;
    const { data: digest } = await supabase.from("weekly_alert_digests").select("id,project_id,recipient_user_id,status").eq("id", item.digest_id).maybeSingle();
    if (!digest || digest.project_id !== row.projectId) return null;
    const { data: action } = await supabase.from("sla_actions").select("responsible_user_id,area").eq("id", item.action_id).maybeSingle();
    const closedReason = item.responded_at
      ? "Este item do resumo semanal já foi respondido: nada foi alterado."
      : digest.status !== "SENT"
        ? "Este resumo semanal já foi respondido ou não está disponível para resposta: nada foi alterado."
        : null;
    return {
      kind: "WEEKLY_DIGEST_ITEM", subjectId: item.id, projectId: digest.project_id, actorUserIds: [digest.recipient_user_id],
      closed: Boolean(closedReason), closedReason, severity: item.risk_level, currentResponsibleUserId: action?.responsible_user_id ?? null, evidenceRequired: false, area: action?.area ?? null,
    };
  }
  if (row.subjectKind === "CONTRACT_ALERT_ITEM") {
    const { data: item } = await supabase.from("contract_alert_batch_items").select("id,batch_id,event_id,severity,assigned_user_id").eq("id", row.subjectId).maybeSingle();
    if (!item) return null;
    const { data: batch } = await supabase.from("contract_alert_batches").select("id,project_id,recipient_user_id,status").eq("id", item.batch_id).maybeSingle();
    if (!batch || batch.project_id !== row.projectId) return null;
    const closedReason = batch.status !== "SENT" ? "A resposta final deste lote de alertas já foi enviada (ou o lote não está disponível): nada foi alterado." : null;
    return {
      kind: "CONTRACT_ALERT_ITEM", subjectId: item.id, projectId: batch.project_id, actorUserIds: [batch.recipient_user_id],
      closed: Boolean(closedReason), closedReason, severity: SEVERITY_FROM_PT[item.severity] ?? "MEDIUM", currentResponsibleUserId: item.assigned_user_id ?? null, evidenceRequired: false, area: null,
    };
  }
  return null;
}

/** Chamada da RPC *_by_email do tipo × comando (o ator é SEMPRE o remetente autenticado). */
export function rpcFor(kind, decision, subjectId, providerMessageId, evidence) {
  const actor = decision.actorUserId;
  if (kind === "SLA_ACTION") {
    if (decision.command === "RESOLVE") return ["sla_action_complete_by_email", { p_actor_user_id: actor, p_action_id: subjectId, p_completion_note: decision.note, p_evidence: evidence, p_provider_message_id: providerMessageId }];
    // Previsão de término VÁLIDA (EM ANDAMENTO + Previsão) vira registro estruturado e auditado na mesma transação (lote 2).
    if (decision.command === "IN_PROGRESS" && decision.forecast?.status === "VALID" && decision.forecast.iso) return ["sla_action_progress_with_forecast_by_email", { p_actor_user_id: actor, p_action_id: subjectId, p_note: decision.note, p_forecast_at: decision.forecast.iso, p_provider_message_id: providerMessageId }];
    if (decision.command === "IN_PROGRESS") return ["sla_action_progress_by_email", { p_actor_user_id: actor, p_action_id: subjectId, p_note: decision.note, p_provider_message_id: providerMessageId }];
    return ["sla_action_forward_by_email", { p_actor_user_id: actor, p_action_id: subjectId, p_new_responsible_user_id: decision.forward.targetUserId, p_reason: decision.forward.reason, p_provider_message_id: providerMessageId }];
  }
  if (kind === "WEEKLY_DIGEST_ITEM") {
    const response = decision.command === "RESOLVE" ? "RESOLVED" : decision.command === "IN_PROGRESS" ? "STUDYING" : "FORWARDED";
    return ["submit_weekly_alert_digest_item_by_email", { p_actor_user_id: actor, p_digest_item_id: subjectId, p_response: response, p_directed_to_user_id: decision.forward?.targetUserId ?? null, p_note: decision.note, p_evidence: evidence, p_provider_message_id: providerMessageId }];
  }
  const action = decision.command === "RESOLVE" ? "RESOLVIDO" : decision.command === "IN_PROGRESS" ? "EM_ANDAMENTO" : "ENVIADO_PARA";
  return ["save_contract_alert_batch_item_response_by_email", { p_actor_user_id: actor, p_batch_item_id: subjectId, p_action: action, p_assigned_user_id: decision.forward?.targetUserId ?? null, p_note: decision.note, p_evidence: evidence, p_provider_message_id: providerMessageId }];
}

async function downloadAttachment(gmail, messageId, attachment) {
  if (attachment.inlineData) return decodeGmailData(attachment.inlineData);
  if (!attachment.attachmentId) return null;
  const res = await gmail.users.messages.attachments.get({ userId: "me", messageId, id: attachment.attachmentId });
  return res?.data?.data ? decodeGmailData(res.data.data) : null;
}

export async function runTokenRepliesPhase({ supabase, gmail, mailbox, projectIds = null, now = () => new Date(), env = process.env, corporateDomain = "axion.com.br" }) {
  const summary = { matched: 0, processed: 0, rejected: 0, ignored: 0, unauthorized: 0, rateLimited: 0, alreadyApplied: 0, errors: 0, byKind: {} };
  const tokenStore = createSupabaseEmailReplyTokenStore(supabase);
  const trustedAuthservIds = resolveTrustedAuthservIds(env);
  const workspaceTenantDomains = resolveWorkspaceTenantDomains(env);
  const ownerStrict = resolveTokenOwnerStrict(env);
  const allowedProjects = projectIds ? new Set(projectIds) : null;

  // Idempotência: mensagens já registradas no fluxo TOKEN (31 dias = janela da busca + margem).
  const processedIds = new Set();
  const logSince = new Date(now().getTime() - 31 * 86_400_000).toISOString();
  const { data: logged } = await supabase.from("email_reply_inbound_log").select("provider_message_id").eq("flow", "TOKEN").gte("received_at", logSince);
  for (const row of logged ?? []) processedIds.add(row.provider_message_id);
  const since = new Date(now().getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase.from("email_reply_inbound_log").select("sender_email,received_at").gte("received_at", since);
  const limiter = new SenderRateLimiter(resolveSenderRateLimit(env), (recent ?? []).map((r) => ({ senderEmail: r.sender_email, receivedAt: r.received_at })));

  const membersCache = new Map();
  const membersOf = async (projectId) => {
    if (membersCache.has(projectId)) return membersCache.get(projectId);
    const { data: memberships } = await supabase.from("project_memberships").select("user_id,permission,status").eq("project_id", projectId);
    const ids = [...new Set((memberships ?? []).map((m) => m.user_id))];
    const { data: profiles } = ids.length ? await supabase.from("profiles").select("id,name,email").in("id", ids) : { data: [] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    const members = (memberships ?? []).map((m) => ({ userId: m.user_id, email: byId.get(m.user_id)?.email ?? null, name: byId.get(m.user_id)?.name ?? null, status: m.status, permission: m.permission }));
    membersCache.set(projectId, members);
    return members;
  };

  const log = async (row, extracted, outcome, reason) => {
    try {
      await supabase.from("email_reply_inbound_log").insert({ flow: "TOKEN", provider_message_id: extracted.providerMessageId, project_id: row.projectId, sender_email: extracted.headers.from.toLowerCase().slice(0, 320), subject_kind: row.subjectKind, subject_id: row.subjectId, outcome, reason: reason ? String(reason).slice(0, 300) : null, received_at: extracted.receivedAt });
    } catch {
      // idempotência principal: recibo transacional da RPC e confirmação única por mensagem
    }
    processedIds.add(extracted.providerMessageId);
  };
  const confirm = (row, extracted, members, actorUserId, outcome, statusLabel, detailLine) => {
    const profile = members.find((m) => m.userId === actorUserId);
    return enqueueTokenReplyConfirmation(supabase, {
      projectId: row.projectId,
      inboundProviderMessageId: extracted.providerMessageId,
      subjectKind: row.subjectKind,
      subjectId: row.subjectId,
      recipientUserId: actorUserId,
      recipientEmail: profile?.email ?? extracted.headers.from,
      inReplyTo: extracted.headers.messageId,
      references: [...extracted.headers.references, ...(extracted.headers.messageId ? [extracted.headers.messageId] : [])],
      originalSubject: extracted.headers.subject ?? null,
      outcome,
      statusLabel,
      detailLine,
    });
  };
  const count = (kind, key) => {
    summary.byKind[kind] = summary.byKind[kind] ?? { processed: 0, rejected: 0 };
    summary.byKind[kind][key] += 1;
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
      let rows = [];
      try {
        rows = (await tokenStore.findByHashes(hashes)).filter((r) => TOKEN_REPLY_KINDS.includes(r.subjectKind) && (!allowedProjects || allowedProjects.has(r.projectId)));
      } catch {
        rows = [];
      }
      const distinct = [...new Map(rows.map((r) => [`${r.subjectKind}:${r.subjectId}`, r])).values()];
      if (distinct.length !== 1) continue; // não é deste fluxo (ou ambígua): fica para risco/SSMA/revisão
      const row = distinct[0];
      const extracted = extractInboundFromGmail(full.data, mailbox);
      if (!extracted || extracted.isSentByMailbox) continue;
      summary.matched += 1;

      try {
        const target = await loadTokenReplyTarget(supabase, row);
        if (!target) continue;
        const members = await membersOf(row.projectId);
        const decision = decideTokenReply({
          message: { providerMessageId: extracted.providerMessageId, headers: extracted.headers, bodyOriginal: extracted.bodyOriginal, receivedAt: extracted.receivedAt },
          target,
          members,
          accMailboxes: [mailbox],
          processedMessageIds: processedIds,
          corporateDomain,
          trustedAuthservIds,
          workspaceTenantDomains,
          tokenRecipientUserId: row.recipientUserId,
          ownerStrict,
          specialistEnabled: isSpecialistEmailEnabled(env),
        });
        if (decision.kind === "IGNORE") {
          if (decision.reason !== "ALREADY_PROCESSED") await log(row, extracted, "IGNORED", decision.reason);
          summary.ignored += 1;
          continue;
        }
        if (decision.kind === "UNAUTHORIZED") {
          // Explicação só a membro ATIVO conhecido (e-mail exato), na caixa corporativa dele; desconhecido => recusa silenciosa auditada.
          if (decision.explainTo && decision.explanation) await confirm(row, extracted, members, decision.explainTo, "REJECTED", "NÃO aplicado — o item continua como estava", decision.explanation);
          await log(row, extracted, "UNAUTHORIZED", decision.reason);
          summary.unauthorized += 1;
          continue;
        }
        if (!limiter.allow(extracted.headers.from, extracted.receivedAt)) {
          await log(row, extracted, "RATE_LIMITED", "Limite por remetente/hora — revisão humana");
          summary.rateLimited += 1;
          continue;
        }
        const reject = async (code, text, outcome = "INCOMPLETE") => {
          await confirm(row, extracted, members, decision.actorUserId, outcome, "NÃO aplicado — o item continua como estava", text);
          await log(row, extracted, "REJECTED", code);
          summary.rejected += 1;
          count(row.subjectKind, "rejected");
        };
        const usable = tokenUsability(row, extracted.providerMessageId, now().toISOString());
        if (!usable.ok) {
          await reject(usable.reason, TOKEN_TEXT[usable.reason], "REJECTED");
          continue;
        }
        if (decision.kind === "REJECT") {
          await reject(decision.code, decision.message);
          continue;
        }

        // ---------- ESPECIALISTA: consulta escrita ao Expert da área. NÃO altera o item e NÃO consome o token. ----------
        if (decision.kind === "SPECIALIST") {
          const profile = members.find((m) => m.userId === decision.actorUserId);
          const recorded = await recordSpecialistConsultation(supabase, {
            actorUserId: decision.actorUserId, projectId: row.projectId, flow: "TOKEN", subjectKind: row.subjectKind, subjectId: row.subjectId,
            providerMessageId: extracted.providerMessageId, record: decision.record, recipientEmail: profile?.email ?? extracted.headers.from,
            inReplyTo: extracted.headers.messageId, references: [...extracted.headers.references, ...(extracted.headers.messageId ? [extracted.headers.messageId] : [])],
            originalSubject: extracted.headers.subject ?? null,
          });
          if (recorded.ok || recorded.code === "MESSAGE_ALREADY_APPLIED") {
            await log(row, extracted, "APPLIED", "SPECIALIST");
            summary.specialist = (summary.specialist ?? 0) + (recorded.ok ? 1 : 0);
          } else {
            await reject(recorded.code, recorded.text, "REJECTED");
          }
          continue;
        }

        // ---------- PROCESS ----------
        const terminal = decision.command === "RESOLVE" || decision.command === "FORWARD";
        let consumed = false;
        if (terminal) {
          consumed = await tokenStore.consume(row.tokenHash, extracted.providerMessageId, now().toISOString());
          if (!consumed) {
            await reject("TOKEN_ALREADY_USED", TOKEN_TEXT.TOKEN_ALREADY_USED, "REJECTED");
            continue;
          }
        }
        const release = async () => {
          if (consumed) await tokenStore.release(row.tokenHash, extracted.providerMessageId).catch(() => undefined);
          consumed = false;
        };

        // Evidência do RESOLVIDO: anexos guardados (Storage + sha256) e referenciados.
        let evidence = null;
        let stored = [];
        if (decision.command === "RESOLVE") {
          for (const attachment of extracted.attachments.slice(0, MAX_EVIDENCE_ATTACHMENTS)) {
            let bytes = null;
            try {
              bytes = await downloadAttachment(gmail, extracted.providerMessageId, attachment);
            } catch {
              bytes = null;
            }
            if (!bytes || bytes.length === 0 || bytes.length > MAX_EVIDENCE_ATTACHMENT_BYTES) continue;
            const sha = sha256Hex(bytes);
            const storagePath = tokenReplyEvidenceStoragePath(row.projectId, row.subjectKind, row.subjectId, sha, attachment.fileName);
            const upload = await supabase.storage.from("project-documents").upload(storagePath, bytes, { contentType: attachment.mimeType, upsert: true });
            if (upload?.error) continue; // sem arquivo guardado não há evidência referenciável
            const { error: attError } = await supabase.from("email_inbound_attachments").insert({ project_id: row.projectId, provider_message_id: extracted.providerMessageId, sha256: sha, file_name: attachment.fileName, mime_type: attachment.mimeType, size_bytes: bytes.length, storage_path: storagePath });
            if (attError && attError.code !== "23505" && !/duplicate|unique/i.test(String(attError.message ?? ""))) continue;
            stored.push({ sha256: sha, fileName: attachment.fileName });
          }
          evidence = buildEvidenceText(stored, null);
          if (decision.evidenceRequired && !evidence) {
            await release();
            await reject("EVIDENCE_REQUIRED", "Este item é de risco ALTO/CRÍTICO: a conclusão exige a evidência ANEXADA à resposta (arquivo ou foto, até 25 MB). Responda com RESOLVIDO, a descrição e o anexo. Nada foi alterado.");
            continue;
          }
        }

        const [fn, args] = rpcFor(row.subjectKind, decision, row.subjectId, extracted.providerMessageId, evidence);
        const { error } = await supabase.rpc(fn, args);
        if (error) {
          const message = String(error.message ?? "");
          if (message.includes("MESSAGE_ALREADY_APPLIED")) {
            // Gravada numa rodada anterior (o registro/confirmação é que faltou): confirma agora, sem gravar de novo.
            await confirm(row, extracted, members, decision.actorUserId, "APPLIED", decision.statusLabel, tokenReplyConfirmationLine(decision, target));
            await log(row, extracted, "APPLIED", `${decision.command} (já aplicado)`);
            summary.alreadyApplied += 1;
            continue;
          }
          await release();
          const mapped = tokenReplyRpcErrorMessage(message);
          if (mapped) {
            await reject(mapped.code, mapped.text, "REJECTED");
            continue;
          }
          throw new Error("rpc"); // erro desconhecido: nova tentativa na próxima rodada (nada registrado)
        }
        // Gravado: só agora a confirmação.
        await confirm(row, extracted, members, decision.actorUserId, "APPLIED", decision.statusLabel, [tokenReplyConfirmationLine(decision, target), stored.length ? `Evidência guardada: ${stored.length} anexo(s).` : null].filter(Boolean).join(" ") || null);
        await log(row, extracted, "APPLIED", decision.command);
        summary.processed += 1;
        count(row.subjectKind, "processed");
      } catch {
        summary.errors += 1; // sem detalhes no log público; a mensagem será tentada de novo na próxima rodada
      }
    }
    pageToken = page.data.nextPageToken ?? undefined;
  } while (pageToken);
  return summary;
}
