// Farol do E-mail no Dashboard executivo, dividido por ETAPA. Puro, sem I/O.
//
// Problema: o resumo de integrações mostrava "E-mail … ATIVO" (verde) quando a
// configuração estava completa e houve uma sincronização — isso comprova só a
// conexão/ingestão, não o envio operacional nem o processamento de respostas.
// Regra: cada etapa tem seu próprio farol com o fato que a comprova; o farol
// GLOBAL do e-mail só é verde quando TODAS as etapas verificáveis estão
// comprovadas. Etapa sem evidência legível fica "não verificável" (neutra) e
// também impede o verde global — nada é presumido.
//
// Etapas:
//   SERVICE ......... serviço de e-mail conectado (conta AXION vinculada CONNECTED/SYNCING; resolveEmailIntegrationDisplayStatus)
//   INGESTION ....... ingestão da obra ativa (config habilitada + última sincronização concluída)
//   SHARED_SOURCES .. caixas da obra configuradas (project_email_ingestion_mailboxes habilitadas)
//   INDIVIDUAL ...... coleta individual autorizada (email_mailbox_collection_controls.collection_enabled; legível só p/ Administrador)
//   CONTENT ......... conteúdo disponível (e-mails persistidos da obra)
//   SENDING ......... envio operacional comprovado (risk_alert_outbox SENT; SUPPRESSED/PENDING/FAILED informados)
//   REPLIES ......... respostas por e-mail processadas (risk_alert_outbox origin EMAIL_REPLY — prova de resposta aplicada)

export type EmailStageKey = "SERVICE" | "INGESTION" | "SHARED_SOURCES" | "INDIVIDUAL" | "CONTENT" | "SENDING" | "REPLIES";
export type EmailStageState = "OK" | "PENDENTE" | "ATENCAO" | "ERRO" | "NAO_VERIFICAVEL";

export interface EmailStage {
  key: EmailStageKey;
  label: string;
  state: EmailStageState;
  detail: string;
}

export interface EmailPipelineFacts {
  /** Status já resolvido da integração de e-mail (CONECTADO/PENDENTE/ATENCAO/ERRO). */
  serviceStatus: string;
  ingestionEnabled: boolean | null;
  lastSuccessfulSyncAt: string | null;
  /** Caixas da obra habilitadas (null = leitura indisponível). */
  enabledMailboxes: number | null;
  /** Coletas individuais ativas (null = não legível para o perfil / leitura indisponível). */
  individualCollectionsEnabled: number | null;
  individualCollectionsTotal: number | null;
  /** E-mails persistidos da obra (null = leitura indisponível). */
  persistedEmails: number | null;
  latestEmailAt: string | null;
  /** Contagens da risk_alert_outbox por status (null = leitura indisponível). */
  outbox: { sent: number; suppressed: number; pending: number; failed: number; skipped: number } | null;
  /** Linhas da outbox originadas por resposta de e-mail (null = leitura indisponível). */
  emailReplyOrigins: number | null;
}

export interface EmailPipeline {
  stages: EmailStage[];
  /** Verde global só com todas as etapas OK. */
  allProven: boolean;
  /** Quantas etapas comprovadas / total. */
  proven: number;
  total: number;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function resolveEmailPipelineStages(f: EmailPipelineFacts): EmailPipeline {
  const stages: EmailStage[] = [];

  stages.push({
    key: "SERVICE",
    label: "Serviço de e-mail conectado",
    state: f.serviceStatus === "CONECTADO" ? "OK" : f.serviceStatus === "ERRO" ? "ERRO" : f.serviceStatus === "ATENCAO" ? "ATENCAO" : "PENDENTE",
    detail: f.serviceStatus === "CONECTADO" ? "conta vinculada e sincronizada" : "configuração ou conta pendente",
  });

  stages.push(
    f.ingestionEnabled === null
      ? { key: "INGESTION", label: "Ingestão da obra ativa", state: "PENDENTE", detail: "ingestão não configurada" }
      : !f.ingestionEnabled
        ? { key: "INGESTION", label: "Ingestão da obra ativa", state: "PENDENTE", detail: "ingestão desabilitada" }
        : f.lastSuccessfulSyncAt
          ? { key: "INGESTION", label: "Ingestão da obra ativa", state: "OK", detail: `última sincronização ${fmtDate(f.lastSuccessfulSyncAt)}` }
          : { key: "INGESTION", label: "Ingestão da obra ativa", state: "ATENCAO", detail: "habilitada, sem sincronização concluída" }
  );

  stages.push(
    f.enabledMailboxes === null
      ? { key: "SHARED_SOURCES", label: "Caixas da obra (fontes)", state: "NAO_VERIFICAVEL", detail: "leitura indisponível" }
      : f.enabledMailboxes > 0
        ? { key: "SHARED_SOURCES", label: "Caixas da obra (fontes)", state: "OK", detail: `${f.enabledMailboxes} habilitada(s)` }
        : { key: "SHARED_SOURCES", label: "Caixas da obra (fontes)", state: "PENDENTE", detail: "nenhuma caixa habilitada" }
  );

  stages.push(
    f.individualCollectionsEnabled === null
      ? { key: "INDIVIDUAL", label: "Coleta individual autorizada", state: "NAO_VERIFICAVEL", detail: "visível só para Administrador" }
      : f.individualCollectionsEnabled > 0
        ? { key: "INDIVIDUAL", label: "Coleta individual autorizada", state: "OK", detail: `${f.individualCollectionsEnabled} de ${f.individualCollectionsTotal ?? f.individualCollectionsEnabled} caixa(s) ativa(s)` }
        : { key: "INDIVIDUAL", label: "Coleta individual autorizada", state: "PENDENTE", detail: f.individualCollectionsTotal ? `0 de ${f.individualCollectionsTotal} caixa(s) ativa(s)` : "nenhuma caixa individual registrada" }
  );

  stages.push(
    f.persistedEmails === null
      ? { key: "CONTENT", label: "Conteúdo disponível", state: "NAO_VERIFICAVEL", detail: "leitura indisponível" }
      : f.persistedEmails > 0
        ? { key: "CONTENT", label: "Conteúdo disponível", state: "OK", detail: `${f.persistedEmails} e-mail(s); último ${fmtDate(f.latestEmailAt)}`.trim() }
        : { key: "CONTENT", label: "Conteúdo disponível", state: "PENDENTE", detail: "nenhum e-mail persistido" }
  );

  if (f.outbox === null) {
    stages.push({ key: "SENDING", label: "Envio operacional (alertas)", state: "NAO_VERIFICAVEL", detail: "leitura indisponível" });
  } else {
    const o = f.outbox;
    const parts = [`${o.sent} enviado(s)`];
    if (o.suppressed) parts.push(`${o.suppressed} suprimido(s)`);
    if (o.pending) parts.push(`${o.pending} pendente(s)`);
    if (o.failed) parts.push(`${o.failed} com falha`);
    const state: EmailStageState = o.failed > 0 ? "ATENCAO" : o.sent > 0 ? "OK" : "PENDENTE";
    stages.push({ key: "SENDING", label: "Envio operacional (alertas)", state, detail: o.sent + o.suppressed + o.pending + o.failed + o.skipped === 0 ? "nenhum envio registrado" : parts.join(", ") });
  }

  stages.push(
    f.emailReplyOrigins === null
      ? { key: "REPLIES", label: "Respostas por e-mail processadas", state: "NAO_VERIFICAVEL", detail: "leitura indisponível" }
      : f.emailReplyOrigins > 0
        ? { key: "REPLIES", label: "Respostas por e-mail processadas", state: "OK", detail: `${f.emailReplyOrigins} resposta(s) aplicada(s) a alertas` }
        : { key: "REPLIES", label: "Respostas por e-mail processadas", state: "PENDENTE", detail: "nenhuma resposta processada comprovada" }
  );

  const proven = stages.filter((stage) => stage.state === "OK").length;
  return { stages, allProven: proven === stages.length, proven, total: stages.length };
}

/**
 * Status exibido para a linha "E-mail" do resumo do Dashboard: mantém ERRO/ATENCAO/PENDENTE do serviço; quando o
 * serviço está CONECTADO mas nem todas as etapas estão comprovadas, devolve "PARCIAL" (nunca verde global).
 */
export function resolveEmailDisplayStatus(serviceStatus: string, pipeline: EmailPipeline): "CONECTADO" | "PARCIAL" | "PENDENTE" | "ATENCAO" | "ERRO" {
  if (serviceStatus === "ERRO") return "ERRO";
  if (serviceStatus === "ATENCAO") return "ATENCAO";
  if (serviceStatus !== "CONECTADO") return "PENDENTE";
  return pipeline.allProven ? "CONECTADO" : "PARCIAL";
}
