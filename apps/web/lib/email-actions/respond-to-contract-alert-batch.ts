import "server-only";

import { createSupabaseAdminClient } from "@axion/db/admin";
import { createSupabaseServerClient } from "@axion/db/server";

import { applyBatchResponsesToFollowups } from "../alerts/followup-service";
import {
  decideContractAlertBatchRespondOutcome,
  type ContractAlertBatchRespondOutcome,
} from "./contract-alert-batch-validation";
import type {
  ContractAlertBatchItemAction,
  ContractAlertBatchItemInput,
  ContractAlertBatchResponsePayload,
} from "./contract-alert-batch-types";

export interface RespondToContractAlertBatchInput {
  batchId: string;
  responses: ContractAlertBatchResponsePayload[];
}

// Único ponto que EFETIVA a resposta final de um lote de alertas de
// contrato — tanto o endpoint HTTP
// (apps/web/app/api/contract-alert-batches/[batchId]/respond/route.ts)
// quanto o Server Action da página do lote
// (app/[projectId]/ledger/lote-alertas/[batchId]/actions.ts) chamam só
// esta função; nenhum dos dois duplica a leitura do lote nem a decisão
// de liberar/recusar (requisito 5: "Não confiar somente na interface").
//
// SEMPRE recarrega o estado do lote/itens/colaboradores do banco antes
// de decidir — nunca confia no que o cliente diz já estar respondido
// ("mesmo que alguém manipule o frontend, a resposta parcial não pode
// ser enviada"). A decisão em si (decideContractAlertBatchRespondOutcome)
// é pura/testável sem banco; a gravação real só acontece depois de um
// outcome.ok === true, e é sempre a RPC atômica
// (submit_contract_alert_batch_response) quem grava — defesa em
// profundidade: mesmo que esta função tivesse um bug de validação, a
// RPC reconfirma tudo antes de persistir qualquer linha.
export async function respondToContractAlertBatch(
  input: RespondToContractAlertBatchInput
): Promise<ContractAlertBatchRespondOutcome> {
  const supabase = await createSupabaseServerClient();

  const { data: batch, error: batchError } = await supabase
    .from("contract_alert_batches")
    .select("id,project_id,status")
    .eq("id", input.batchId)
    .maybeSingle();

  if (batchError || !batch) {
    return { ok: false, status: 409, error: "Lote de alertas não encontrado." };
  }

  const { data: itemRows, error: itemsError } = await supabase
    .from("contract_alert_batch_items")
    .select("event_id,title_snapshot,action,assigned_user_id")
    .eq("batch_id", input.batchId);

  if (itemsError) {
    return { ok: false, status: 409, error: "Não foi possível carregar os alertas deste lote." };
  }

  const items: ContractAlertBatchItemInput[] = (itemRows ?? []).map((row) => ({
    eventId: row.event_id as string,
    title: row.title_snapshot as string,
    action: row.action as ContractAlertBatchItemAction | null,
    assignedUserId: row.assigned_user_id as string | null,
  }));

  const { data: memberRows, error: membersError } = await supabase
    .from("project_memberships")
    .select("user_id,status")
    .eq("project_id", batch.project_id as string);

  if (membersError) {
    return { ok: false, status: 409, error: "Não foi possível validar os colaboradores do projeto." };
  }

  const activeProjectMemberUserIds = new Set(
    (memberRows ?? [])
      .filter((row) => (row.status ?? "ACTIVE") === "ACTIVE")
      .map((row) => row.user_id as string)
  );

  const outcome = decideContractAlertBatchRespondOutcome({
    batchStatus: batch.status as "PENDING" | "SENT" | "RESPONDED" | "FAILED",
    items,
    responses: input.responses,
    activeProjectMemberUserIds,
  });

  if (!outcome.ok) {
    return outcome;
  }

  const { error: rpcError } = await supabase.rpc("submit_contract_alert_batch_response", {
    p_batch_id: input.batchId,
    p_responses: input.responses,
  });

  if (rpcError) {
    // A RPC é a autoridade final e atômica — se ela recusar (ex.: outro
    // clique concorrente já respondeu o lote entre a leitura acima e
    // agora), o erro dela vira 409, nunca é escondido/ignorado.
    return { ok: false, status: 409, error: rpcError.message || "Falha ao registrar as respostas." };
  }

  // Espelha a resposta no acompanhamento recorrente (RESOLVIDO interrompe os lembretes; EM ANDAMENTO
  // não adia nada; ENVIADO P/ troca o responsável). A resposta do lote já está gravada e é a
  // fonte da verdade — uma falha aqui não a desfaz, mas nunca é silenciosa: vira aviso na tela e
  // registro na auditoria (ex.: quem respondeu não é o responsável dos lembretes daquele alerta).
  let failedFollowups = 0;
  try {
    const mirrored = await applyBatchResponsesToFollowups(supabase, {
      projectId: batch.project_id as string,
      responses: input.responses.map((response) => ({
        eventId: response.eventId,
        action: response.action,
        assignedUserId: response.assignedUserId ?? null,
      })),
    });
    failedFollowups = mirrored.failed;
  } catch {
    failedFollowups = input.responses.length;
  }

  const warnings: string[] = [];
  const auditRows: Array<{ action: string; detail: string }> = [];
  if (failedFollowups > 0) {
    warnings.push(`A resposta foi registrada, mas os lembretes de ${failedFollowups} alerta(s) não foram atualizados (somente o responsável pelos lembretes ou um ADMINISTRADOR pode alterá-los). O ADMINISTRADOR da obra foi sinalizado na auditoria.`);
    auditRows.push({ action: "CONTRACT_ALERT_FOLLOWUP_NOT_APPLIED", detail: `Lembretes não atualizados para ${failedFollowups} de ${input.responses.length} alerta(s) após a resposta do lote.` });
  }

  // Responder RESOLVIDO no lote encerra o alerta contratual, NÃO a ação SLA vinculada ao mesmo evento (obrigação
  // distinta: a conclusão exige nota e é feita em Ações). A ação aberta deixa de ficar órfã em silêncio: aviso na tela
  // e registro na auditoria, sem alterar status, prazos ou escalonamento.
  const resolvedEventIds = input.responses.filter((response) => response.action === "RESOLVIDO").map((response) => response.eventId);
  if (resolvedEventIds.length > 0) {
    const { data: openLinked } = await supabase
      .from("sla_actions")
      .select("id,title,related_event_id")
      .eq("project_id", batch.project_id as string)
      .in("related_event_id", resolvedEventIds)
      .not("status", "in", "(COMPLETED,CANCELLED)");
    if (openLinked && openLinked.length > 0) {
      warnings.push(`${openLinked.length} ação(ões) de SLA vinculada(s) a alerta(s) marcado(s) como RESOLVIDO continua(m) aberta(s): conclua em Ações, com a nota de conclusão, se a obrigação foi cumprida.`);
      auditRows.push({ action: "CONTRACT_ALERT_SLA_ACTION_STILL_OPEN", detail: `Ações SLA ainda abertas após RESOLVIDO no lote: ${openLinked.map((row) => row.id).join(", ")}.` });
    }
  }

  if (warnings.length > 0) {
    try {
      const { data: auth } = await supabase.auth.getUser();
      await createSupabaseAdminClient().from("audit_log_entries").insert(
        auditRows.map((row) => ({
          project_id: batch.project_id as string,
          actor_type: auth.user ? "USER" : "SYSTEM",
          actor_user_id: auth.user?.id ?? null,
          action: row.action,
          entity_type: "CONTRACT_ALERT_BATCH",
          entity_id: input.batchId,
          detail: row.detail,
        }))
      );
    } catch {
      // A auditoria complementar não desfaz a resposta já gravada; o aviso continua visível ao usuário.
    }
    return { ...outcome, followupWarning: warnings.join(" ") };
  }

  return outcome;
}
