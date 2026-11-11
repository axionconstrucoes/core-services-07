// Modelo somente de leitura da matriz de fontes por projeto/usuário.
// Regra central: farol VERDE só com prova da etapa; cadastro, vínculo ACTIVE, aceite ou "CONECTADO" não bastam.
// Não há campo para marcar manualmente um farol: o estado é sempre derivado das evidências abaixo.
export type Beacon = { ok: boolean; label: string; reason: string };

export type MatrixMember = { userId: string; status: string; area: string | null; user: { name: string; email: string } };
export type MatrixAuthorization = { user_id: string; account_email: string; status: string; requested_at: string };
export type MatrixControl = {
  mailbox_address: string; technical_permission_status: string; collection_enabled: boolean; individual_consent_status: string;
  corporate_authorization_status: string; period_start: string | null; period_end: string | null; revoked_at: string | null;
  last_sync_at: string | null; last_sync_status: string | null;
};
export type MailboxEvidence = {
  mailbox: string; emails: number; lastMessageAt: string | null; attachments: number; attachmentsProcessed: number; attachmentsPending: number;
};
export type SharedEvidence = {
  diario: { reports: number; lastRunStatus: string | null; lastRunAt: string | null; lastRunErrors: number | null; lastRunCreated: number | null; integrationStatus: string | null } | null;
  weekly: { workbooks: number; workbooksPendingReview: number; sheets: number; sheetsExtracted: number; sheetsMissing: number; sheetsPendingReview: number } | null;
  construmanager: { integrationStatus: string | null; lastRunStatus: string | null; lastRunAt: string | null; stored: number; pending: number; humanDecision: number; other: number } | null;
  ssma: { integrationStatus: string | null; lastSyncAt: string | null } | null;
};
export type MatrixEvidence = {
  measuredAt: string;
  authorizations: MatrixAuthorization[] | null;
  controls: MatrixControl[] | null; // null = tabela ausente/ilegível: conexão técnica NÃO comprovada
  mailboxes: MailboxEvidence[] | null;
  unassignedEmails: number | null;
  shared: SharedEvidence;
  warnings: string[];
};

export type UserSourceRow = {
  userId: string; name: string; email: string; membership: string; area: string | null;
  authorization: Beacon; technical: Beacon; collection: Beacon; material: Beacon;
  emails: number | null; lastMessageAt: string | null; attachments: number | null; attachmentsProcessed: number | null;
  /** Resumo para a aba Usuários: verde somente se as quatro etapas estão verdes. */
  overall: Beacon;
};
export type SharedSourceRow = {
  key: string; label: string; connection: Beacon; collection: Beacon; availability: Beacon; facts: string[];
};

const norm = (value: string) => value.trim().toLowerCase();
const ok = (label: string, reason: string): Beacon => ({ ok: true, label, reason });
const bad = (label: string, reason: string): Beacon => ({ ok: false, label, reason });
const consentText: Record<string, string> = {
  PENDENTE: "Aceite pendente: o usuário ainda não decidiu.", RECUSADO: "Aceite recusado pelo usuário.", REVOGADO: "Aceite revogado.",
  EXPIRADO: "Aceite expirado.", CANCELADO: "Solicitação cancelada.",
};

export function buildUserSourceRows(members: MatrixMember[], evidence: MatrixEvidence, now = new Date()): UserSourceRow[] {
  const unique = new Map(members.map((member) => [member.userId, member]));
  return [...unique.values()].map((member) => {
    const email = norm(member.user.email);
    const authorization = evidence.authorizations?.filter((item) => item.user_id === member.userId && norm(item.account_email) === email)
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
    const control = evidence.controls?.find((item) => norm(item.mailbox_address) === email);
    const mailbox = evidence.mailboxes?.find((item) => norm(item.mailbox) === email);

    let auth: Beacon;
    if (evidence.authorizations === null) auth = bad("Sem comprovação", "Consulta de aceites indisponível.");
    else if (!authorization) auth = bad("Não solicitado", "Nenhum aceite registrado para esta caixa neste projeto.");
    else if (authorization.status === "AUTORIZADO") auth = ok("Autorizado", "Aceite registrado para esta caixa neste projeto.");
    else auth = bad(authorization.status === "PENDENTE" ? "Aguardando aceite" : "Sem autorização", consentText[authorization.status] ?? `Situação do aceite: ${authorization.status}.`);

    let technical: Beacon;
    if (evidence.controls === null) {
      technical = bad("Não comprovada", "A tabela de controles de coleta não existe em produção; a permissão técnica atual não é registrada. Importações antigas são histórico, não prova atual.");
    } else if (!control) technical = bad("Não comprovada", "Sem controle registrado para esta caixa.");
    else if (control.technical_permission_status === "CONFIRMADA") technical = ok("Confirmada", "Permissão técnica confirmada no controle da caixa.");
    else technical = bad("Não comprovada", `Permissão técnica: ${control.technical_permission_status}.`);

    const emails = evidence.mailboxes === null ? null : mailbox?.emails ?? 0;
    let collection: Beacon;
    if (member.status !== "ACTIVE") collection = bad("Usuário inativo", "O vínculo com a obra não está ativo.");
    else if (emails === null) collection = bad("Sem comprovação", "Contagem de mensagens por caixa indisponível.");
    else if (emails === 0) collection = bad("Nada coletado", "Nenhuma mensagem importada desta caixa para este projeto.");
    else if (!auth.ok) collection = bad("Sem aceite válido", `${emails} mensagens existem, mas não há aceite autorizado vigente para esta caixa.`);
    else if (control && (control.revoked_at || !control.collection_enabled)) collection = bad("Coleta desligada", "Controle individual da caixa desligado ou revogado.");
    else if (control?.period_end && Date.parse(control.period_end) < now.getTime()) collection = bad("Fora do período", "O período autorizado terminou.");
    else collection = ok("Coletando", `${emails} mensagens importadas; última enviada em ${mailbox?.lastMessageAt ?? "data indisponível"}.`);

    let material: Beacon;
    if (emails === null || !mailbox) material = bad("Sem material", "Nenhum e-mail ou anexo desta caixa disponível ao ACC.");
    else if (mailbox.attachments === 0) material = bad("Sem anexos", "Há e-mails, mas nenhum anexo cadastrado desta caixa.");
    else if (mailbox.attachmentsPending > 0) material = bad("Anexos pendentes", `${mailbox.attachmentsPending} de ${mailbox.attachments} anexos aguardam processamento (${mailbox.attachmentsProcessed} processados).`);
    else material = ok("Processado", `${mailbox.attachmentsProcessed} de ${mailbox.attachments} anexos processados.`);

    const firstBad = [auth, technical, collection, material].find((stage) => !stage.ok);
    return {
      userId: member.userId, name: member.user.name, email, membership: member.status, area: member.area,
      authorization: auth, technical, collection, material, emails, lastMessageAt: mailbox?.lastMessageAt ?? null,
      attachments: evidence.mailboxes === null ? null : mailbox?.attachments ?? 0,
      attachmentsProcessed: evidence.mailboxes === null ? null : mailbox?.attachmentsProcessed ?? 0,
      overall: firstBad ? bad("Pendente", `${firstBad.label}: ${firstBad.reason}`) : ok("Comprovado", "Autorização, conexão, coleta e processamento comprovados."),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

const unknown = (key: string, label: string): SharedSourceRow => {
  const b = bad("Sem comprovação", "Consulta indisponível.");
  return { key, label, connection: b, collection: b, availability: b, facts: [] };
};

export function buildSharedSourceRows(evidence: MatrixEvidence): SharedSourceRow[] {
  const { diario, weekly, construmanager, ssma } = evidence.shared;
  const rows: SharedSourceRow[] = [];
  const personal = "Fonte compartilhada da obra: não prova conta individual de cada usuário.";

  if (!diario) rows.push(unknown("diario", "Diário de Obra"));
  else {
    const run = diario.lastRunStatus === "SUCESSO";
    rows.push({
      key: "diario", label: "Diário de Obra",
      connection: diario.integrationStatus === "CONECTADO" && run ? ok("Execução comprovada", "Última execução registrada com sucesso.") : bad("Não comprovada", `Integração ${diario.integrationStatus ?? "sem registro"}; última execução ${diario.lastRunStatus ?? "inexistente"}.`),
      collection: run && diario.lastRunErrors === 0 ? ok("Coletando", `Última execução em ${diario.lastRunAt}: ${diario.lastRunCreated ?? 0} novos, 0 erros. Zero novos não significa falha.`) : bad("Falha ou sem execução", `Última execução ${diario.lastRunStatus ?? "inexistente"}, erros ${diario.lastRunErrors ?? "?"}.`),
      availability: diario.reports > 0 ? ok("Disponível", `${diario.reports} relatórios estruturados importados.`) : bad("Nada disponível", "Nenhum relatório importado."),
      facts: ["Dados estruturados importados; fotos e anexos podem existir apenas como contagem no fornecedor.", personal],
    });
  }

  if (!weekly) rows.push(unknown("semanal", "Relatórios semanais e cronogramas"));
  else {
    rows.push({
      key: "semanal", label: "Relatórios semanais e cronogramas",
      connection: weekly.workbooks > 0 ? ok("Recebendo", "Pacotes recebidos por e-mail e registrados.") : bad("Nada recebido", "Nenhum pacote semanal registrado."),
      collection: weekly.workbooks > 0 ? ok("Registrado", `${weekly.workbooks} pacotes e ${weekly.sheets} planilhas registrados.`) : bad("Nada registrado", "Sem pacotes."),
      availability: weekly.sheetsPendingReview === 0 && weekly.sheetsMissing === 0 && weekly.workbooksPendingReview === 0
        ? ok("Disponível", `${weekly.sheetsExtracted} planilhas extraídas.`)
        : bad("Parcial", `${weekly.sheetsExtracted} de ${weekly.sheets} planilhas extraídas; ${weekly.sheetsPendingReview} aguardam revisão humana e ${weekly.sheetsMissing} ausentes. ${weekly.workbooksPendingReview} de ${weekly.workbooks} pacotes aguardam revisão.`),
      facts: ["O cursor de uma mensagem não é a data da última execução do coletor.", personal],
    });
  }

  if (!construmanager) rows.push(unknown("construmanager", "Construmanager"));
  else {
    const total = construmanager.stored + construmanager.pending + construmanager.other;
    rows.push({
      key: "construmanager", label: "Construmanager",
      connection: construmanager.integrationStatus === "CONECTADO" && construmanager.lastRunStatus === "SUCESSO" ? ok("Catálogo conectado", `Última execução de metadados em ${construmanager.lastRunAt}. Prova o catálogo, não o conteúdo.`) : bad("Não comprovada", `Integração ${construmanager.integrationStatus ?? "sem registro"}; última execução ${construmanager.lastRunStatus ?? "inexistente"}.`),
      collection: construmanager.stored > 0 ? ok("Download parcial", `${construmanager.stored} de ${total} conteúdos baixados e armazenados.`) : bad("Sem download", "Nenhum conteúdo armazenado."),
      availability: construmanager.pending === 0 && construmanager.humanDecision === 0 ? ok("Disponível", `${construmanager.stored} conteúdos armazenados.`) : bad("Pendente", `${construmanager.pending} conteúdos pendentes de download e ${construmanager.humanDecision} aguardando decisão humana; ${construmanager.stored} armazenados.`),
      facts: ["Sucesso do monitoramento de metadados não comprova integração completa.", personal],
    });
  }

  if (!ssma) rows.push(unknown("ssma", "SSMA / Drive"));
  else {
    rows.push({
      key: "ssma", label: "SSMA / Drive",
      connection: ssma.integrationStatus === "CONECTADO" ? ok("Conectada", "Integração registrada como conectada.") : bad("Pendente", `Integração ${ssma.integrationStatus ?? "sem registro"}; pasta e permissão não validadas.`),
      collection: ssma.lastSyncAt ? ok("Sincronizou", `Última sincronização em ${ssma.lastSyncAt}.`) : bad("Sem sincronização", "Nenhuma sincronização registrada para esta obra."),
      availability: bad("Sem registro validado", "Ainda não há um registro real desta obra salvo, sincronizado e aberto como evidência."),
      facts: ["As falhas de fotos anteriores pertencem ao projeto TESTE e permanecem separadas.", personal],
    });
  }
  return rows;
}
