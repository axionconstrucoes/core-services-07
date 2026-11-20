// Diagnóstico POR CAIXA da ingestão de e-mails, em 7 etapas independentes. Puro (sem banco, sem rede) e testável.
//
// Regra central: NENHUMA etapa é inferida da anterior. Cada etapa só fica COMPROVADA com evidência própria:
//   1 usuário cadastrado           -> vínculo na obra (project_memberships + profiles)
//   2 autorização                  -> aceite individual (email_access_authorizations) OU autorização corporativa (controle)
//   3 caixa tecnicamente autenticada-> teste técnico registrado no controle (delegação) — OAuth histórico é só INDÍCIO
//   4 habilitada para coleta       -> controle com coleta ligada e período vigente (lista da obra sozinha NÃO habilita)
//   5 sincronização executada      -> resultado registrado PARA ESTA CAIXA (execução de outra caixa não conta)
//   6 mensagens importadas         -> contagem em emails por mailbox_address
//   7 corpos e anexos disponíveis  -> corpos não vazios e anexos armazenados/processados
// INDÍCIO = evidência indireta (ex.: coletor OAuth do projeto); nunca é exibido como comprovado.
import { OAUTH_COLLECTOR_MAILBOX } from "@/lib/integrations/user-integration-matrix";

export const MAILBOX_STAGE_KEYS = ["usuario", "autorizacao", "tecnica", "habilitada", "sincronizacao", "mensagens", "conteudo"] as const;
export type MailboxStageKey = (typeof MAILBOX_STAGE_KEYS)[number];
export type MailboxStageStatus = "COMPROVADO" | "INDICIO" | "PARCIAL" | "PENDENTE" | "BLOQUEADO" | "INDISPONIVEL";
export type MailboxStage = { key: MailboxStageKey; title: string; status: MailboxStageStatus; label: string; evidence: string; at: string | null };

export const MAILBOX_STAGE_TITLES: Record<MailboxStageKey, string> = {
  usuario: "1. Usuário cadastrado",
  autorizacao: "2. Autorização (individual ou corporativa)",
  tecnica: "3. Caixa tecnicamente autenticada",
  habilitada: "4. Habilitada para coleta",
  sincronizacao: "5. Sincronização executada",
  mensagens: "6. Mensagens importadas",
  conteudo: "7. Corpos e anexos disponíveis",
};

export const MAX_CONSECUTIVE_SYNC_ERRORS = 5; // mesmo teto do coletor e da migration 20261121110000

export type DiagnosticsMember = { userId: string; name: string; email: string; permission: string; status: string };
export type DiagnosticsAuthorization = { id: string; user_id: string; account_email: string; status: string; requested_at: string; decided_at: string | null };
export type DiagnosticsControl = {
  mailbox_address: string; auth_mode?: string | null;
  corporate_authorization_status: string; corporate_authorized_at: string | null; corporate_authorization_ref: string | null;
  individual_consent_status: string;
  technical_permission_status: string; technical_checked_at: string | null; technical_check_detail: string | null;
  collection_enabled: boolean; period_start: string | null; period_end: string | null;
  last_sync_at: string | null; last_sync_status: string | null; last_sync_detail: string | null; last_sync_imported: number | null;
  revoked_at: string | null; revoked_reason: string | null; updated_at?: string | null;
  consecutive_errors?: number | null; last_error_at?: string | null;
};
export type DiagnosticsCounts = {
  emails: number; bodies: number | null; lastMessageAt: string | null;
  attachments: number; attachmentsStored: number; attachmentsProcessed: number; attachmentsPending: number; attachmentsFailed: number;
};
export type MailboxDiagnosticsEvidence = {
  measuredAt: string;
  members: DiagnosticsMember[] | null;
  /** lista explícita de caixas da obra (project_email_ingestion_mailboxes); null = ilegível */
  allowlist: { mailbox: string; enabled: boolean }[] | null;
  projectIngestionEnabled: boolean | null;
  /** last_sync_at da configuração da OBRA (coletor OAuth histórico); só atribuível a OAUTH_COLLECTOR_MAILBOX */
  oauthProjectLastSyncAt: string | null;
  /** OK = tabela lida; MISSING = migration 20261107090000 não aplicada; ERROR = leitura falhou */
  controlsAvailability: "OK" | "MISSING" | "ERROR";
  controls: DiagnosticsControl[];
  authorizations: DiagnosticsAuthorization[] | null;
  counts: Record<string, DiagnosticsCounts> | null;
  unassignedEmails: number | null;
};

export type MailboxAdminAction = "REGISTRAR_AUTORIZACAO" | "HABILITAR_COLETA" | "DESABILITAR_COLETA" | "REVOGAR";
export type MailboxActionState = { action: MailboxAdminAction; enabled: boolean; reason: string };

export type MailboxDiagnosticsRow = {
  mailbox: string;
  responsible: { name: string; userId: string | null; source: "VINCULO" | "AUTORIZACAO" | "NENHUM" };
  inAllowlist: boolean | null;
  control: DiagnosticsControl | null;
  latestAuthorization: DiagnosticsAuthorization | null;
  stages: MailboxStage[];
  counts: DiagnosticsCounts | null;
  period: { start: string | null; end: string | null };
  errors: string[];
  pendencies: string[];
  actions: MailboxActionState[];
};

const norm = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();
const stage = (key: MailboxStageKey, status: MailboxStageStatus, label: string, evidence: string, at: string | null = null): MailboxStage =>
  ({ key, title: MAILBOX_STAGE_TITLES[key], status, label, evidence, at });

export const CONTROLS_MISSING_TEXT =
  "Controles por caixa indisponíveis: a migration 20261107090000 (tabela email_mailbox_collection_controls) não está aplicada neste banco. Nada pode ser habilitado por caixa até ela ser aprovada e aplicada.";

function latestAuthorization(rows: DiagnosticsAuthorization[] | null, mailbox: string): DiagnosticsAuthorization | null {
  const mine = (rows ?? []).filter((row) => norm(row.account_email) === mailbox);
  return mine.sort((a, b) => String(b.decided_at ?? b.requested_at).localeCompare(String(a.decided_at ?? a.requested_at)))[0] ?? null;
}

function periodState(control: DiagnosticsControl, now: Date): { ok: boolean; text: string } {
  const start = Date.parse(control.period_start ?? ""), end = Date.parse(control.period_end ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return { ok: false, text: "período autorizado ausente ou inválido" };
  if (now.getTime() < start) return { ok: false, text: `período só começa em ${control.period_start}` };
  if (now.getTime() > end) return { ok: false, text: `período terminou em ${control.period_end}` };
  return { ok: true, text: `período ${control.period_start} a ${control.period_end}` };
}

/** Lista de caixas: lista da obra + controles + aceites + caixas com mensagens + e-mails dos usuários ativos (candidatas). */
export function collectMailboxes(evidence: MailboxDiagnosticsEvidence): string[] {
  const set = new Set<string>();
  for (const item of evidence.allowlist ?? []) set.add(norm(item.mailbox));
  for (const item of evidence.controls) set.add(norm(item.mailbox_address));
  for (const item of evidence.authorizations ?? []) set.add(norm(item.account_email));
  for (const key of Object.keys(evidence.counts ?? {})) set.add(norm(key));
  for (const member of evidence.members ?? []) if (member.status === "ACTIVE" && norm(member.email).endsWith("@axion.com.br")) set.add(norm(member.email));
  set.delete("");
  return [...set].sort();
}

export function buildMailboxDiagnostics(evidence: MailboxDiagnosticsEvidence, now = new Date()): MailboxDiagnosticsRow[] {
  return collectMailboxes(evidence).map((mailbox) => buildRow(evidence, mailbox, now));
}

function buildRow(evidence: MailboxDiagnosticsEvidence, mailbox: string, now: Date): MailboxDiagnosticsRow {
  const member = evidence.members?.find((item) => norm(item.email) === mailbox) ?? null;
  const authorization = latestAuthorization(evidence.authorizations, mailbox);
  const authUser = authorization ? evidence.members?.find((item) => item.userId === authorization.user_id) ?? null : null;
  const responsible = member
    ? { name: member.name, userId: member.userId, source: "VINCULO" as const }
    : authUser ? { name: authUser.name, userId: authUser.userId, source: "AUTORIZACAO" as const }
    : { name: "Sem usuário vinculado nesta obra", userId: null, source: "NENHUM" as const };
  const person = member?.name ?? authUser?.name ?? mailbox;
  const controlsOk = evidence.controlsAvailability === "OK";
  const control = controlsOk ? evidence.controls.find((item) => norm(item.mailbox_address) === mailbox) ?? null : null;
  const allow = evidence.allowlist?.find((item) => norm(item.mailbox) === mailbox) ?? null;
  const inAllowlist = evidence.allowlist === null ? null : Boolean(allow?.enabled);
  const counts = evidence.counts === null ? null : evidence.counts[mailbox] ?? { emails: 0, bodies: 0, lastMessageAt: null, attachments: 0, attachmentsStored: 0, attachmentsProcessed: 0, attachmentsPending: 0, attachmentsFailed: 0 };
  const isOauthMailbox = mailbox === OAUTH_COLLECTOR_MAILBOX;
  const legacy = isOauthMailbox && !control; // caixa do coletor OAuth histórico, sem controle por caixa
  const stages: MailboxStage[] = [];
  const errors: string[] = [];
  const pendencies: string[] = [];

  // 1 — usuário cadastrado
  if (evidence.members === null) stages.push(stage("usuario", "INDISPONIVEL", "Sem comprovação", "Consulta de usuários da obra indisponível."));
  else if (member?.status === "ACTIVE") stages.push(stage("usuario", "COMPROVADO", "Cadastrado", `${member.name}: vínculo ATIVO na obra (${member.permission}).`));
  else if (member) stages.push(stage("usuario", "PENDENTE", "Vínculo inativo", `${member.name}: vínculo ${member.status} na obra.`));
  else stages.push(stage("usuario", "PENDENTE", "Sem usuário", "Nenhum usuário desta obra tem este e-mail (caixa sem responsável cadastrado)."));

  // 2 — autorização individual OU corporativa (estado de cada uma informado separadamente)
  const individualBlocked = authorization && ["RECUSADO", "REVOGADO"].includes(authorization.status);
  const corporateOk = control?.corporate_authorization_status === "AUTORIZADA" && !control.revoked_at;
  const individualOk = authorization?.status === "AUTORIZADO";
  const corporateText = !controlsOk ? "autorização corporativa: não verificável (controles indisponíveis)"
    : control ? `autorização corporativa: ${control.corporate_authorization_status}${control.corporate_authorization_ref ? ` (ref.: ${control.corporate_authorization_ref})` : ""}`
    : "autorização corporativa: não registrada";
  const individualText = evidence.authorizations === null ? "aceite individual: consulta indisponível"
    : authorization ? `aceite individual: ${authorization.status} em ${authorization.decided_at ?? authorization.requested_at}` : "aceite individual: não solicitado";
  if (individualBlocked) stages.push(stage("autorizacao", "BLOQUEADO", `Aceite ${authorization!.status.toLowerCase()}`, `${individualText}; ${corporateText}. Recusa/revogação do titular bloqueia a coleta.`, authorization!.decided_at));
  else if (control?.revoked_at || control?.corporate_authorization_status === "REVOGADA") stages.push(stage("autorizacao", "BLOQUEADO", "Autorização revogada", `${corporateText}; revogada em ${control?.revoked_at ?? "?"}${control?.revoked_reason ? ` (${control.revoked_reason})` : ""}; ${individualText}.`, control?.revoked_at ?? null));
  else if (individualOk || corporateOk) stages.push(stage("autorizacao", "COMPROVADO", individualOk && corporateOk ? "Individual e corporativa" : individualOk ? "Aceite individual" : "Autorização corporativa", `${individualText}; ${corporateText}.`, individualOk ? authorization!.decided_at : control?.corporate_authorized_at ?? null));
  else if (evidence.authorizations === null && !controlsOk) stages.push(stage("autorizacao", "INDISPONIVEL", "Sem comprovação", `${individualText}; ${corporateText}.`));
  else {
    const pending = authorization?.status === "PENDENTE" ? ` Solicitação pendente desde ${authorization.requested_at}.` : "";
    stages.push(stage("autorizacao", "PENDENTE", `Aguardando autorização de ${person}`, `${individualText}; ${corporateText}.${pending}`));
    pendencies.push(`Aguardando autorização de ${person} (aceite individual na aba Autorizações) ou registro de autorização corporativa por um Administrador da obra.`);
  }

  // 3 — autenticação técnica (só o teste técnico registrado comprova; OAuth histórico é indício)
  if (control) {
    if (control.technical_permission_status === "CONFIRMADA") stages.push(stage("tecnica", "COMPROVADO", "Teste técnico confirmado", `Delegação testada (getProfile da própria caixa) em ${control.technical_checked_at ?? "?"}${control.technical_check_detail ? `: ${control.technical_check_detail}` : ""}.`, control.technical_checked_at));
    else if (control.technical_permission_status === "FALHA") {
      stages.push(stage("tecnica", "BLOQUEADO", "Teste técnico falhou", `Falha registrada em ${control.technical_checked_at ?? "?"}: ${control.technical_check_detail ?? "sem detalhe"}.`, control.technical_checked_at));
      errors.push(`Teste técnico: ${control.technical_check_detail ?? "falha sem detalhe"}`);
    } else {
      stages.push(stage("tecnica", "PENDENTE", "Aguardando delegação no Google Workspace", "Nenhum teste técnico registrado. Requer a delegação autorizada no Google Admin (Superadministrador) e a execução manual do workflow 'Gmail Delegated Sync' em modo technical_check."));
      pendencies.push("Aguardando delegação no Google Workspace (Superadministrador) e teste técnico desta caixa.");
    }
  } else if (legacy) {
    stages.push(stage("tecnica", "INDICIO", "Credencial OAuth (histórica)", `O coletor agendado usa um refresh token desta caixa (segredo do GitHub Actions) e confere getProfile a cada execução, mas não registra teste técnico por caixa. Última execução do coletor da obra: ${evidence.oauthProjectLastSyncAt ?? "sem registro"}.`, evidence.oauthProjectLastSyncAt));
  } else if (!controlsOk) {
    stages.push(stage("tecnica", "INDISPONIVEL", "Não verificável", CONTROLS_MISSING_TEXT));
    pendencies.push("Aguardando delegação no Google Workspace e aplicação da migration de controles por caixa.");
  } else {
    stages.push(stage("tecnica", "PENDENTE", "Aguardando delegação no Google Workspace", "Sem controle registrado para esta caixa; nenhuma credencial individual nem teste técnico."));
    if (!pendencies.some((p) => p.startsWith("Aguardando delegação"))) pendencies.push("Aguardando delegação no Google Workspace (Superadministrador) e teste técnico desta caixa.");
  }

  // 4 — habilitada para coleta
  const suspended = Number(control?.consecutive_errors ?? 0) >= MAX_CONSECUTIVE_SYNC_ERRORS;
  if (control) {
    const period = periodState(control, now);
    if (control.collection_enabled && period.ok && !suspended) stages.push(stage("habilitada", "COMPROVADO", "Coleta ligada", `Controle da caixa com coleta ligada; ${period.text}.`, control.period_start));
    else if (control.collection_enabled) stages.push(stage("habilitada", "BLOQUEADO", suspended ? "Suspensa por erros" : "Fora do período", suspended ? `${control.consecutive_errors} erros seguidos; requer nova habilitação.` : `Coleta ligada, mas ${period.text}.`));
    else stages.push(stage("habilitada", suspended ? "BLOQUEADO" : "PENDENTE", suspended ? "Suspensa por erros" : "Coleta desligada", suspended ? `${control.consecutive_errors} erros seguidos; coleta suspensa automaticamente.` : `Controle existe, mas a coleta está desligada${control.period_start ? ` (último período: ${control.period_start} a ${control.period_end})` : ""}.`));
  } else if (legacy && inAllowlist && evidence.projectIngestionEnabled) {
    stages.push(stage("habilitada", "INDICIO", "Lista da obra + coletor agendado", "A caixa está na lista habilitada da obra e o coletor OAuth agendado (a cada 15 min) autentica somente como ela. Não há controle por caixa nem período por caixa."));
  } else if (inAllowlist) {
    stages.push(stage("habilitada", "PENDENTE", "Só na lista da obra", "A caixa está na lista da obra, mas a lista NÃO autoriza coleta: não há controle por caixa nem coletor configurado para ela."));
  } else stages.push(stage("habilitada", inAllowlist === null ? "INDISPONIVEL" : "PENDENTE", "Não habilitada", inAllowlist === null ? "Lista de caixas da obra ilegível." : "Fora da lista explícita de caixas da obra."));

  // 5 — sincronização executada (desta caixa)
  if (control?.last_sync_status) {
    const text = `Último registro desta caixa: ${control.last_sync_status}${control.last_sync_detail ? ` — ${control.last_sync_detail}` : ""}; cursor em ${control.last_sync_at ?? "sem avanço"}.`;
    if (control.last_sync_status === "SUCESSO") stages.push(stage("sincronizacao", "COMPROVADO", "Sincronizada", text, control.last_sync_at ?? control.updated_at ?? null));
    else {
      stages.push(stage("sincronizacao", "BLOQUEADO", control.last_sync_status === "ERRO" ? "Última execução com erro" : "Última execução bloqueada", text, control.last_error_at ?? control.updated_at ?? null));
      errors.push(`Sincronização: ${control.last_sync_status}${control.last_sync_detail ? ` — ${control.last_sync_detail}` : ""}`);
    }
  } else if (legacy && evidence.oauthProjectLastSyncAt) {
    stages.push(stage("sincronizacao", "INDICIO", "Execução do coletor da obra", `last_sync_at da configuração da obra: ${evidence.oauthProjectLastSyncAt}. Atribuída a esta caixa só porque o coletor OAuth autentica exclusivamente como ela.`, evidence.oauthProjectLastSyncAt));
  } else stages.push(stage("sincronizacao", "PENDENTE", "Nunca sincronizada", "Nenhuma sincronização registrada para esta caixa. A execução de outra caixa ou da obra não conta."));

  // 6 — mensagens importadas
  if (counts === null) stages.push(stage("mensagens", "INDISPONIVEL", "Sem comprovação", "Contagem de mensagens por caixa indisponível."));
  else if (counts.emails > 0) stages.push(stage("mensagens", "COMPROVADO", `${counts.emails} mensagens`, `${counts.emails} mensagens com mailbox_address = esta caixa; a mais recente enviada em ${counts.lastMessageAt ?? "?"}.`, counts.lastMessageAt));
  else stages.push(stage("mensagens", "PENDENTE", "Nenhuma mensagem", "Nenhuma mensagem importada desta caixa nesta obra."));

  // 7 — corpos e anexos
  if (counts === null) stages.push(stage("conteudo", "INDISPONIVEL", "Sem comprovação", "Contagem indisponível."));
  else if (counts.emails === 0) stages.push(stage("conteudo", "PENDENTE", "Sem conteúdo", "Sem mensagens, não há corpos nem anexos."));
  else {
    const bodiesText = counts.bodies === null ? "corpos: contagem indisponível" : `corpos ${counts.bodies} de ${counts.emails}`;
    const attText = `anexos ${counts.attachments} (armazenados ${counts.attachmentsStored}, processados ${counts.attachmentsProcessed}, pendentes ${counts.attachmentsPending}, falhas ${counts.attachmentsFailed})`;
    const complete = counts.bodies === counts.emails && counts.attachmentsStored === counts.attachments && counts.attachmentsFailed === 0;
    if (counts.attachmentsFailed > 0) errors.push(`${counts.attachmentsFailed} anexos com falha de ingestão`);
    stages.push(stage("conteudo", counts.bodies === null ? "INDISPONIVEL" : complete ? "COMPROVADO" : "PARCIAL", complete ? "Disponível" : "Parcial", `${bodiesText}; ${attText}. Anexos não listados no Gmail não são verificados aqui.`));
  }

  if (suspended) errors.push(`${control?.consecutive_errors} erros seguidos: coleta suspensa.`);
  return {
    mailbox, responsible, inAllowlist, control, latestAuthorization: authorization, stages, counts,
    period: { start: control?.period_start ?? null, end: control?.period_end ?? null },
    errors, pendencies, actions: availableActions({ mailbox, person, control, controlsOk, inAllowlist, authorization }),
  };
}

function availableActions(ctx: { mailbox: string; person: string; control: DiagnosticsControl | null; controlsOk: boolean; inAllowlist: boolean | null; authorization: DiagnosticsAuthorization | null }): MailboxActionState[] {
  const { control, controlsOk, inAllowlist, authorization, person } = ctx;
  const off = (action: MailboxAdminAction, reason: string): MailboxActionState => ({ action, enabled: false, reason });
  const on = (action: MailboxAdminAction, reason: string): MailboxActionState => ({ action, enabled: true, reason });
  if (!controlsOk) return (["REGISTRAR_AUTORIZACAO", "HABILITAR_COLETA", "DESABILITAR_COLETA", "REVOGAR"] as const).map((a) => off(a, CONTROLS_MISSING_TEXT));
  const consentBlocked = Boolean(authorization && ["RECUSADO", "REVOGADO"].includes(authorization.status)) || ["RECUSADO", "REVOGADO"].includes(control?.individual_consent_status ?? "");
  const revoked = Boolean(control?.revoked_at);
  const corporateOk = control?.corporate_authorization_status === "AUTORIZADA" && !revoked;

  let register: MailboxActionState;
  if (inAllowlist !== true) register = off("REGISTRAR_AUTORIZACAO", "Caixa fora da lista explícita da obra: inclua-a na configuração de ingestão antes (a lista sozinha não autoriza nada).");
  else if (consentBlocked) register = off("REGISTRAR_AUTORIZACAO", `Aceite individual de ${person} recusado ou revogado.`);
  else if (corporateOk) register = off("REGISTRAR_AUTORIZACAO", "Autorização corporativa já registrada.");
  else register = on("REGISTRAR_AUTORIZACAO", "Registra a decisão da empresa (com referência). Não liga a coleta nem testa a delegação.");

  let enable: MailboxActionState;
  if (!control) enable = off("HABILITAR_COLETA", `Aguardando autorização de ${person} ou registro de autorização corporativa.`);
  else if (revoked) enable = off("HABILITAR_COLETA", "Autorização revogada: registre nova autorização corporativa antes.");
  else if (consentBlocked) enable = off("HABILITAR_COLETA", `Aceite individual de ${person} recusado ou revogado.`);
  else if (!corporateOk) enable = off("HABILITAR_COLETA", `Aguardando autorização de ${person} ou registro de autorização corporativa.`);
  else if (control.technical_permission_status !== "CONFIRMADA") enable = off("HABILITAR_COLETA", "Aguardando delegação no Google Workspace: o teste técnico desta caixa ainda não foi confirmado.");
  else enable = on("HABILITAR_COLETA", control.collection_enabled ? "Atualiza o período autorizado (início e fim obrigatórios)." : "Liga a coleta com período explícito (início e fim).");

  const disable = control?.collection_enabled ? on("DESABILITAR_COLETA", "Desliga a coleta (sem revogar a autorização).") : off("DESABILITAR_COLETA", "A coleta já está desligada.");
  const revoke = control && !revoked ? on("REVOGAR", "Revoga autorização e coleta na hora; o histórico é preservado.") : off("REVOGAR", control ? "Já revogada." : "Nada a revogar: não há controle registrado para esta caixa.");
  return [register, enable, disable, revoke];
}

/** Checagem do SERVIDOR antes de cada ação (a página e o banco aplicam a mesma regra). */
export function authorizeMailboxAdminAction(input: { isAdmin: boolean; row: MailboxDiagnosticsRow | null; action: MailboxAdminAction }): { ok: boolean; reason: string } {
  if (!input.isAdmin) return { ok: false, reason: "Somente administradores da obra podem fazer isso." };
  if (!input.row) return { ok: false, reason: "Caixa não encontrada nesta obra." };
  const state = input.row.actions.find((item) => item.action === input.action);
  if (!state) return { ok: false, reason: "Ação desconhecida." };
  return state.enabled ? { ok: true, reason: "" } : { ok: false, reason: state.reason };
}

/** Mensagens claras para os códigos das RPCs (migrations 20261107090000 e 20261121110000). */
export function friendlyMailboxRpcError(message: string): string {
  const map: Record<string, string> = {
    AUTH_REQUIRED: "Sessão expirada. Entre novamente.",
    FORBIDDEN: "Somente administradores da obra podem fazer isso.",
    REFERENCE_REQUIRED: "Informe a referência da decisão (3 a 300 caracteres).",
    MAILBOX_NOT_IN_PROJECT_ALLOWLIST: "A caixa não está na lista explícita da obra.",
    CONTROL_NOT_FOUND: "Não há controle registrado para esta caixa.",
    REVOKED: "A autorização desta caixa está revogada.",
    CORPORATE_AUTHORIZATION_REQUIRED: "Registre a autorização corporativa antes.",
    INDIVIDUAL_CONSENT_DENIED: "O titular recusou ou revogou o aceite individual.",
    TECHNICAL_PERMISSION_REQUIRED: "Aguardando delegação no Google Workspace: teste técnico não confirmado.",
    PERIOD_START_REQUIRED: "Informe o início do período.",
    PERIOD_END_REQUIRED: "Informe o fim do período.",
    PERIOD_INVALID: "O fim do período precisa ser posterior ao início.",
    REASON_REQUIRED: "Informe o motivo (3 a 500 caracteres).",
    ALREADY_REVOKED: "Já revogada.",
  };
  const code = Object.keys(map).find((key) => message.includes(key));
  if (code) return map[code];
  if (/does not exist|schema cache|could not find the function/i.test(message)) return CONTROLS_MISSING_TEXT;
  return "Não foi possível concluir. Nada foi alterado.";
}
