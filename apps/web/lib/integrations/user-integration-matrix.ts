// Modelo somente de leitura da matriz de fontes por projeto/usuário.
// Regras centrais:
//  - Farol VERDE exige evidência operacional da etapa. Cadastro, vínculo ACTIVE, aceite, receber alertas ou "CONECTADO" não bastam.
//  - Mensagens antigas provam HISTÓRICO importado, não coleta atual.
//  - Controle ausente, consulta indisponível, período inválido/futuro/vencido, revogação: nunca verde operacional.
//  - Conteúdo armazenado, extraído e disponível para análise são etapas diferentes.
//  - Não há campo para marcar manualmente um farol: o estado é derivado das evidências.
export type Beacon = { ok: boolean; label: string; reason: string; /** data (ISO) da evidência que sustenta o farol, quando existe */ at: string | null };

export type MatrixMember = { userId: string; status: string; area: string | null; user: { name: string; email: string } };
export type MatrixAuthorization = { user_id: string; account_email: string; status: string; requested_at: string };
export type MatrixControl = {
  mailbox_address: string; technical_permission_status: string; collection_enabled: boolean; individual_consent_status: string;
  corporate_authorization_status: string; period_start: string | null; period_end: string | null; revoked_at: string | null;
  last_sync_at: string | null; last_sync_status: string | null;
};
/**
 * Caixa cuja identidade autenticada o coletor OAuth comprova a cada execução: o cron (gmail-inbound-sync.yml) usa
 * GOOGLE_GMAIL_INBOUND_MAILBOX e o script aborta se getProfile().emailAddress for diferente. Um teste estático confere
 * esta constante contra o workflow e a trava do script. Qualquer outra caixa NÃO herda a execução do projeto.
 */
export const OAUTH_COLLECTOR_MAILBOX = "reynaldo@axion.com.br";
export type OAuthEvidence = {
  enabled: boolean; windowMode: string | null; customStartAt: string | null; customEndAt: string | null;
  monitoringStartedAt: string | null; lastSyncAt: string | null; integrationStatus: string | null;
};
export type MailboxEvidence = {
  mailbox: string; emails: number; bodiesAvailable: number | null; lastMessageAt: string | null;
  attachments: number; attachmentsStored: number; attachmentsProcessed: number; attachmentsPending: number; attachmentsError: number;
};
export type SharedEvidence = {
  diario: { reports: number; lastRunStatus: string | null; lastRunAt: string | null; lastRunErrors: number | null; lastRunCreated: number | null; integrationStatus: string | null } | null;
  weekly: {
    workbooks: number; workbooksExtracted: number; workbooksPartial: number; workbooksPendingReview: number; workbooksOther: number;
    sheets: number; sheetsExtracted: number; sheetsPartial: number; sheetsMissing: number; sheetsPendingReview: number; sheetsOther: number; lastAt: string | null;
  } | null;
  construmanager: { integrationStatus: string | null; lastRunStatus: string | null; lastRunAt: string | null; stored: number; pending: number; humanDecision: number; other: number } | null;
  ssma: {
    integrationStatus: string | null; lastSyncAt: string | null; lastCheckAt: string | null; lastCheckError: boolean;
    submissions: number; photos: number; photosSynced: number; photosFailed: number; photosPending: number;
  } | null;
};
export type MatrixEvidence = {
  measuredAt: string;
  /** Usuários habilitados a receber alertas do piloto (lista de destinatários). null = não conferido. */
  alertRecipientUserIds: string[] | null;
  authorizations: MatrixAuthorization[] | null;
  controls: MatrixControl[] | null; // null = tabela ausente/ilegível: conexão técnica e coleta atual NÃO comprovadas
  /** Evidência do coletor OAuth atual (project_email_ingestion_configs). Só é usada quando não há tabela de controles. */
  oauth?: OAuthEvidence | null;
  ingestion: { projectEnabled: boolean; mailboxes: { mailbox: string; enabled: boolean }[] } | null;
  mailboxes: MailboxEvidence[] | null;
  unassignedEmails: number | null;
  /** Registros sem provedor e sem caixa: alertas gerados pelo ACC (saída do sistema), nunca fonte externa. */
  systemOutputEmails?: number | null;
  shared: SharedEvidence;
  warnings: string[];
};

export type UserSourceRow = {
  userId: string; name: string; email: string; membership: string; area: string | null;
  authorization: Beacon; technical: Beacon; collection: Beacon; material: Beacon;
  emails: number | null; lastMessageAt: string | null; attachments: number | null; attachmentsProcessed: number | null;
  /** Resumo para a aba Usuários: verde somente se as quatro etapas estão verdes. */
  overall: Beacon;
  /** Papéis independentes: receber alerta NÃO é fornecer informação e vice-versa. */
  providesInformation: boolean;
  receivesAlerts: boolean | null;
};
export type SharedSourceRow = {
  key: string; label: string; connection: Beacon; collection: Beacon; availability: Beacon; facts: string[];
};

const norm = (value: string) => value.trim().toLowerCase();
const ok = (label: string, reason: string, at: string | null = null): Beacon => ({ ok: true, label, reason, at });
const bad = (label: string, reason: string, at: string | null = null): Beacon => ({ ok: false, label, reason, at });
const consentText: Record<string, string> = {
  PENDENTE: "Aceite pendente: o usuário ainda não decidiu.", RECUSADO: "Aceite recusado pelo usuário.", REVOGADO: "Aceite revogado.",
  EXPIRADO: "Aceite expirado.", CANCELADO: "Solicitação cancelada.",
};
type OAuthVerdict = { verdict: "OK" | "NOT_PROVEN" | "ABSENT"; label: string; reason: string; at: string | null };
/** Evidência do coletor OAuth atribuída a UMA caixa. last_sync_at é do projeto: só vale para a caixa autenticada pelo coletor. */
function oauthRun(evidence: MatrixEvidence, email: string, authOk: boolean, mailboxEnabled: boolean | null, now: Date): OAuthVerdict {
  const run = evidence.oauth;
  if (!run) return { verdict: "ABSENT", label: "", reason: "", at: null };
  if (email !== OAUTH_COLLECTOR_MAILBOX) {
    return { verdict: "NOT_PROVEN", label: "Execução não atribuível", reason: `A última execução do coletor (${run.lastSyncAt ?? "sem data"}) é do projeto e autentica como outra caixa (${OAUTH_COLLECTOR_MAILBOX}); não comprova a coleta desta caixa.`, at: null };
  }
  if (!authOk) return { verdict: "NOT_PROVEN", label: "Sem aceite válido", reason: "Sem aceite autorizado vigente para esta caixa.", at: run.lastSyncAt };
  if (!run.enabled) return { verdict: "NOT_PROVEN", label: "Monitoramento desligado", reason: "A configuração de ingestão do projeto está desabilitada.", at: run.lastSyncAt };
  if (mailboxEnabled !== true) return { verdict: "NOT_PROVEN", label: "Caixa fora da coleta", reason: "A caixa não está habilitada na configuração de ingestão da obra.", at: run.lastSyncAt };
  const startRaw = run.windowMode === "CUSTOM" ? run.customStartAt : run.windowMode === "FROM_NOW" ? run.monitoringStartedAt : null;
  const start = startRaw ? Date.parse(startRaw) : null, end = run.windowMode === "CUSTOM" && run.customEndAt ? Date.parse(run.customEndAt) : null;
  if ((run.windowMode === "CUSTOM" || run.windowMode === "FROM_NOW") && (start === null || !Number.isFinite(start))) return { verdict: "NOT_PROVEN", label: "Período inválido", reason: "Início do período da configuração ausente ou inválido.", at: run.lastSyncAt };
  if (run.windowMode !== null && !["FROM_PROJECT_START", "FROM_NOW", "CUSTOM"].includes(run.windowMode)) return { verdict: "NOT_PROVEN", label: "Período inválido", reason: `Modo de janela desconhecido: ${run.windowMode}.`, at: run.lastSyncAt };
  if (start !== null && now.getTime() < start) return { verdict: "NOT_PROVEN", label: "Período futuro", reason: `O período só começa em ${startRaw}.`, at: run.lastSyncAt };
  if (end !== null && (!Number.isFinite(end) || now.getTime() > end)) return { verdict: "NOT_PROVEN", label: "Período vencido", reason: `O período configurado terminou em ${run.customEndAt}.`, at: run.lastSyncAt };
  if (!run.lastSyncAt) return { verdict: "NOT_PROVEN", label: "Coleta não comprovada", reason: "Nenhuma execução bem-sucedida registrada.", at: null };
  if (now.getTime() - Date.parse(run.lastSyncAt) > STALE_MS) return { verdict: "NOT_PROVEN", label: "Coleta desatualizada", reason: `Última execução bem-sucedida em ${run.lastSyncAt}.`, at: run.lastSyncAt };
  return { verdict: "OK", label: "", reason: "", at: run.lastSyncAt };
}

const STALE_MS = 48 * 3600 * 1000; // coletas incrementais rodam a cada poucas horas; >48h sem sincronizar não é "coleta atual"

export function buildUserSourceRows(members: MatrixMember[], evidence: MatrixEvidence, now = new Date()): UserSourceRow[] {
  const unique = new Map(members.map((member) => [member.userId, member]));
  return [...unique.values()].map((member) => {
    const email = norm(member.user.email);
    const authorization = evidence.authorizations?.filter((item) => item.user_id === member.userId && norm(item.account_email) === email)
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
    const control = evidence.controls?.find((item) => norm(item.mailbox_address) === email);
    const mailbox = evidence.mailboxes?.find((item) => norm(item.mailbox) === email);
    const mailboxEnabled = evidence.ingestion ? evidence.ingestion.projectEnabled && evidence.ingestion.mailboxes.some((m) => norm(m.mailbox) === email && m.enabled) : null;

    let auth: Beacon;
    if (evidence.authorizations === null) auth = bad("Sem comprovação", "Consulta de aceites indisponível.");
    else if (!authorization) auth = bad("Não solicitado", "Nenhum aceite registrado para esta caixa neste projeto.");
    else if (authorization.status === "AUTORIZADO") auth = ok("Autorizado", "Aceite registrado para esta caixa neste projeto.", authorization.requested_at);
    else auth = bad(authorization.status === "PENDENTE" ? "Aguardando aceite" : "Sem autorização", consentText[authorization.status] ?? `Situação do aceite: ${authorization.status}.`, authorization.requested_at);

    const revoked = Boolean(control && (control.revoked_at || control.corporate_authorization_status === "REVOGADA" || ["REVOGADO", "RECUSADO"].includes(control.individual_consent_status)));
    let technical: Beacon;
    const oauth = evidence.controls === null ? oauthRun(evidence, email, auth.ok, mailboxEnabled, now) : null;
    if (evidence.controls === null) {
      if (oauth?.verdict === "OK") technical = ok("Inferida da execução", `Inferida da execução bem-sucedida em ${oauth.at}: o coletor OAuth autentica como esta caixa (getProfile confere a identidade a cada execução). Não é uma verificação de permissão técnica registrada.`, oauth.at);
      else technical = bad("Não comprovada", oauth?.reason || "A tabela de controles de coleta não existe em produção; a permissão técnica atual não é registrada. Importações antigas são histórico, não prova atual.");
    } else if (!control) technical = bad("Não comprovada", "Sem controle registrado para esta caixa.");
    else if (revoked) technical = bad("Revogada", "Autorização ou consentimento revogado no controle da caixa.");
    else if (control.technical_permission_status === "CONFIRMADA") technical = ok("Confirmada", "Permissão técnica confirmada no controle da caixa.", control.last_sync_at);
    else technical = bad("Não comprovada", `Permissão técnica: ${control.technical_permission_status}.`);

    const emails = evidence.mailboxes === null ? null : mailbox?.emails ?? 0;
    let collection: Beacon;
    if (member.status !== "ACTIVE") collection = bad("Usuário inativo", "O vínculo com a obra não está ativo.");
    else if (emails === null) collection = bad("Sem comprovação", "Contagem de mensagens por caixa indisponível.");
    else if (!auth.ok) collection = bad(emails > 0 ? "Sem aceite válido" : "Nada coletado", emails > 0 ? `${emails} mensagens históricas existem, mas não há aceite autorizado vigente.` : "Nenhuma mensagem importada e sem aceite vigente.");
    else if (evidence.controls === null && oauth?.verdict === "OK") {
      collection = ok("Execução recente comprovada", `Coletor OAuth autenticado como esta caixa; última execução bem-sucedida em ${oauth.at}, dentro da janela da configuração. A tabela de controles por caixa não é usada; ${emails} mensagens importadas.`, oauth.at);
    } else if (evidence.controls === null && oauth && oauth.verdict !== "ABSENT") {
      collection = bad(oauth.label, oauth.reason, oauth.at);
    } else if (evidence.controls === null) {
      collection = emails > 0
        ? bad("Histórico importado", `${emails} mensagens importadas (última enviada em ${mailbox?.lastMessageAt ?? "data indisponível"}). Sem controle de coleta em produção, não há prova de coleta atual.`, mailbox?.lastMessageAt ?? null)
        : bad("Nada coletado", "Nenhuma mensagem importada desta caixa para este projeto.");
    } else if (!control) collection = bad("Coleta não comprovada", "Sem controle de coleta registrado para esta caixa.");
    else if (revoked) collection = bad("Revogada", "Coleta bloqueada por revogação ou recusa.", control.revoked_at);
    else if (!control.collection_enabled) collection = bad("Coleta desligada", "Controle individual da caixa desligado.");
    else if (mailboxEnabled === false) collection = bad("Caixa fora da coleta", "A caixa não está habilitada na configuração de ingestão da obra.");
    else {
      const start = Date.parse(control.period_start ?? ""), end = Date.parse(control.period_end ?? "");
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) collection = bad("Período inválido", "Início e fim do período autorizado ausentes ou inconsistentes.");
      else if (now.getTime() < start) collection = bad("Período futuro", `O período autorizado só começa em ${control.period_start}.`);
      else if (now.getTime() > end) collection = bad("Período vencido", `O período autorizado terminou em ${control.period_end}.`);
      else if (control.technical_permission_status !== "CONFIRMADA") collection = bad("Conexão não comprovada", "Permissão técnica não confirmada.");
      else if (control.last_sync_status === "ERRO" || control.last_sync_status === "BLOQUEADA") collection = bad("Última coleta com falha", `Última coleta: ${control.last_sync_status}.`, control.last_sync_at);
      else if (!control.last_sync_at) collection = bad("Coleta não comprovada", "Nenhuma sincronização registrada para esta caixa.");
      else if (now.getTime() - Date.parse(control.last_sync_at) > STALE_MS) collection = bad("Coleta desatualizada", `Última sincronização em ${control.last_sync_at}.`, control.last_sync_at);
      else collection = ok("Coleta atual", `Sincronização recente dentro do período autorizado; ${emails} mensagens importadas.`, control.last_sync_at);
    }

    // Conteúdo: corpo disponível para análise e anexos (armazenado ≠ extraído/processado ≠ disponível).
    let material: Beacon;
    if (emails === null || !mailbox) material = bad("Sem material", "Nenhum e-mail desta caixa disponível ao ACC.");
    else {
      const bodies = mailbox.bodiesAvailable;
      const bodiesText = bodies === null ? "corpos: contagem indisponível" : `corpos disponíveis ${bodies} de ${mailbox.emails}`;
      const attachText = `anexos: ${mailbox.attachments} registrados, ${mailbox.attachmentsStored} armazenados, ${mailbox.attachmentsProcessed} processados, ${mailbox.attachmentsPending} pendentes, ${mailbox.attachmentsError} com erro`;
      if (bodies === null) material = bad("Sem comprovação", `${bodiesText}; ${attachText}.`);
      else if (bodies < mailbox.emails) material = bad("Corpos ausentes", `${bodiesText}; ${attachText}.`);
      else if (mailbox.attachmentsPending > 0 || mailbox.attachmentsError > 0 || mailbox.attachmentsStored < mailbox.attachments) material = bad("Anexos incompletos", `${bodiesText}; ${attachText}.`);
      else if (mailbox.attachments === 0) material = ok("Corpos disponíveis", `${bodiesText}; nenhum anexo registrado. A existência de anexos não recuperados no Gmail não é verificada por esta consulta (use o diagnóstico de recuperação).`);
      else material = ok("Conteúdo processado", `${bodiesText}; ${attachText}.`);
    }

    const firstBad = [auth, technical, collection, material].find((stage) => !stage.ok);
    return {
      userId: member.userId, name: member.user.name, email, membership: member.status, area: member.area,
      authorization: auth, technical, collection, material, emails, lastMessageAt: mailbox?.lastMessageAt ?? null,
      attachments: evidence.mailboxes === null ? null : mailbox?.attachments ?? 0,
      attachmentsProcessed: evidence.mailboxes === null ? null : mailbox?.attachmentsProcessed ?? 0,
      overall: firstBad ? bad("Pendente", `${firstBad.label}: ${firstBad.reason}`) : ok("Comprovado", "Autorização, conexão, coleta atual e conteúdo processado comprovados."),
      providesInformation: (emails ?? 0) > 0,
      receivesAlerts: evidence.alertRecipientUserIds === null ? null : evidence.alertRecipientUserIds.includes(member.userId),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const unknown = (key: string, label: string): SharedSourceRow => {
  const b = bad("Sem comprovação", "Consulta indisponível.");
  return { key, label, connection: b, collection: b, availability: b, facts: [] };
};

export function buildSharedSourceRows(evidence: MatrixEvidence, now = new Date()): SharedSourceRow[] {
  const { diario, weekly, construmanager, ssma } = evidence.shared;
  const rows: SharedSourceRow[] = [];
  const personal = "Fonte compartilhada da obra: não prova conta individual de cada usuário.";

  // Diário de Obra: dados estruturados.
  if (!diario) rows.push(unknown("diario", "Diário de Obra"));
  else {
    const success = diario.lastRunStatus === "SUCESSO" && diario.lastRunErrors === 0;
    const recent = diario.lastRunAt ? now.getTime() - Date.parse(diario.lastRunAt) <= STALE_MS : false;
    rows.push({
      key: "diario", label: "Diário de Obra",
      connection: diario.integrationStatus === "CONECTADO" && success ? ok("Execução comprovada", "Última execução registrada com sucesso e sem erros.", diario.lastRunAt) : bad("Não comprovada", `Integração ${diario.integrationStatus ?? "sem registro"}; última execução ${diario.lastRunStatus ?? "inexistente"}; erros ${diario.lastRunErrors ?? "?"}.`, diario.lastRunAt),
      collection: success && recent ? ok("Coletando", `Última execução em ${diario.lastRunAt}: ${diario.lastRunCreated ?? 0} novos, 0 erros. Zero novos não significa falha.`, diario.lastRunAt) : bad(success ? "Execução desatualizada" : "Falha ou sem execução", `Última execução ${diario.lastRunStatus ?? "inexistente"}${diario.lastRunAt ? ` em ${diario.lastRunAt}` : ""}.`, diario.lastRunAt),
      availability: diario.reports > 0 ? ok("Estruturado disponível", `${diario.reports} relatórios estruturados importados (fotos e anexos podem existir só como contagem no fornecedor).`, diario.lastRunAt) : bad("Nada disponível", "Nenhum relatório importado."),
      facts: [personal],
    });
  }

  // Relatórios semanais e cronogramas.
  if (!weekly) rows.push(unknown("semanal", "Relatórios semanais e cronogramas"));
  else {
    const pendingWb = weekly.workbooksPartial + weekly.workbooksPendingReview + weekly.workbooksOther;
    const pendingSh = weekly.sheetsPartial + weekly.sheetsMissing + weekly.sheetsPendingReview + weekly.sheetsOther;
    const detail = `Pacotes: ${weekly.workbooks} (${weekly.workbooksExtracted} extraídos, ${weekly.workbooksPartial} parciais, ${weekly.workbooksPendingReview} em revisão humana, ${weekly.workbooksOther} outros/erro). Planilhas: ${weekly.sheets} (${weekly.sheetsExtracted} extraídas, ${weekly.sheetsPartial} parciais, ${weekly.sheetsMissing} ausentes, ${weekly.sheetsPendingReview} em revisão humana, ${weekly.sheetsOther} outras/erro).`;
    const complete = weekly.workbooks > 0 && weekly.sheets > 0 && pendingWb === 0 && pendingSh === 0;
    rows.push({
      key: "semanal", label: "Relatórios semanais e cronogramas",
      connection: weekly.workbooks > 0 ? ok("Recebendo", `${weekly.workbooks} pacotes recebidos por e-mail e registrados.`, weekly.lastAt) : bad("Nada recebido", "Nenhum pacote semanal registrado."),
      collection: complete ? ok("Extração completa", detail, weekly.lastAt) : bad(weekly.workbooks === 0 ? "Zero documentos" : "Extração incompleta", weekly.workbooks === 0 ? "Nenhum pacote para extrair." : detail, weekly.lastAt),
      availability: complete ? ok("Disponível", `${weekly.sheetsExtracted} planilhas extraídas e disponíveis.`, weekly.lastAt) : bad(weekly.sheetsExtracted > 0 ? "Parcialmente disponível" : "Indisponível", `${weekly.sheetsExtracted} planilhas disponíveis para análise; ${pendingSh} pendentes, parciais, ausentes ou em revisão.`, weekly.lastAt),
      facts: ["O cursor de uma mensagem não é a data da última execução do coletor.", personal],
    });
  }

  // Construmanager.
  if (!construmanager) rows.push(unknown("construmanager", "Construmanager"));
  else {
    const total = construmanager.stored + construmanager.pending + construmanager.other;
    const unresolved = construmanager.pending + construmanager.other + construmanager.humanDecision;
    rows.push({
      key: "construmanager", label: "Construmanager",
      connection: construmanager.integrationStatus === "CONECTADO" && construmanager.lastRunStatus === "SUCESSO" ? ok("Catálogo conectado", "Prova o catálogo de metadados, não o conteúdo dos arquivos.", construmanager.lastRunAt) : bad("Não comprovada", `Integração ${construmanager.integrationStatus ?? "sem registro"}; última execução ${construmanager.lastRunStatus ?? "inexistente"}.`, construmanager.lastRunAt),
      collection: total > 0 && unresolved === 0 ? ok("Download completo", `${construmanager.stored} de ${total} conteúdos baixados e armazenados.`, construmanager.lastRunAt) : bad(total === 0 ? "Zero documentos" : "Download incompleto", total === 0 ? "Nenhum conteúdo catalogado." : `${construmanager.stored} armazenados; ${construmanager.pending} pendentes; ${construmanager.other} com erro/outros; ${construmanager.humanDecision} aguardando decisão humana (de ${total}).`, construmanager.lastRunAt),
      // Armazenado não é extraído nem disponível: não há evidência de extração/processamento deste conteúdo.
      availability: bad(construmanager.stored > 0 ? "Armazenado, extração não comprovada" : "Indisponível", `${construmanager.stored} conteúdos armazenados; ${unresolved} pendentes de download/decisão. Extração e processamento destes arquivos não são registrados, então não há prova de disponibilidade para análise.`, construmanager.lastRunAt),
      facts: ["Sucesso do monitoramento de metadados não comprova integração completa.", personal],
    });
  }

  // SSMA / Drive: "CONECTADO" sozinho não comprova funcionamento.
  if (!ssma) rows.push(unknown("ssma", "SSMA / Drive"));
  else {
    const accessOk = ssma.lastCheckAt !== null && !ssma.lastCheckError;
    const synced = ssma.photosSynced > 0 && ssma.photosFailed === 0;
    rows.push({
      key: "ssma", label: "SSMA / Drive",
      connection: ssma.integrationStatus === "CONECTADO" && accessOk ? ok("Acesso verificado", "Última verificação de conexão sem erro.", ssma.lastCheckAt) : bad("Acesso não comprovado", `Integração ${ssma.integrationStatus ?? "sem registro"}${ssma.lastCheckAt ? "" : "; nenhuma verificação de conexão registrada"}${ssma.lastCheckError ? "; última verificação com erro" : ""}. O rótulo "CONECTADO" sozinho não comprova funcionamento.`, ssma.lastCheckAt),
      collection: synced ? ok("Sincronização comprovada", `${ssma.photosSynced} de ${ssma.photos} fotos sincronizadas com o Drive.`, ssma.lastSyncAt) : bad(ssma.photos === 0 ? "Sem execução real" : "Sincronização incompleta", ssma.photos === 0 ? `${ssma.submissions} registros e nenhuma foto sincronizada nesta obra.` : `${ssma.photosSynced} sincronizadas, ${ssma.photosPending} pendentes e ${ssma.photosFailed} com falha (de ${ssma.photos}).`, ssma.lastSyncAt),
      availability: synced && ssma.submissions > 0 ? ok("Material acessível", `${ssma.submissions} registros e ${ssma.photosSynced} fotos com arquivo identificado no Drive. A abertura do arquivo pelo usuário não é verificada por esta consulta.`, ssma.lastSyncAt) : bad("Sem registro validado", "Ainda não há registro real desta obra salvo, sincronizado e aberto como evidência."),
      facts: ["As falhas de fotos anteriores pertencem ao projeto TESTE e permanecem separadas.", personal],
    });
  }
  return rows;
}
