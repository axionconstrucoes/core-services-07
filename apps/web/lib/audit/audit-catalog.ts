// Catálogo explícito dos códigos de auditoria (tela /[projectId]/auditoria).
//
// Substitui a heurística antiga, que procurava palavras-chave também no texto livre do detalhe
// e dependia da ordem dos testes. Exemplos do erro: "DATA " casava com "ATA ", "SSMA" citado num
// detalhe de documento jogava o registro em SSMA/ESG, e eventos de cadastro e de congelamento
// caíam em "Projetos e versões".
//
// Regras:
// - A categoria depende só do código da ação e do tipo de entidade, nunca do detalhe livre.
// - Cada registro recebe exatamente uma categoria e o identificador da regra que a definiu
//   (rastreável na tela, no title da linha).
// - Código sem regra vai para NAO_CATALOGADO: continua visível em "Todos" e no filtro próprio,
//   nunca some e nunca é escondido em outra categoria.
// - Os códigos originais ficam intactos no banco; a tradução é só para exibição.

export const AUDIT_CATEGORIES = [
  { value: "PROJETOS", label: "Projetos e versões" },
  { value: "ATAS", label: "Atas de reunião" },
  { value: "RELATORIOS", label: "Relatórios e RDO" },
  { value: "MEDICOES", label: "Medições" },
  { value: "EMAILS", label: "E-mails" },
  { value: "ACOES", label: "Ações e SLA" },
  { value: "SSMA", label: "SSMA/ESG" },
  { value: "INTEGRACOES", label: "Integrações e falhas" },
  { value: "SEGURANCA", label: "Segurança e permissões" },
  { value: "NAO_CATALOGADO", label: "Não catalogados" },
] as const;

export type AuditCategory = (typeof AUDIT_CATEGORIES)[number]["value"];
export type AuditFilter = AuditCategory | "TODOS";

export const AUDIT_FILTERS: ReadonlyArray<{ value: AuditFilter; label: string }> = [
  { value: "TODOS", label: "Todos" },
  ...AUDIT_CATEGORIES,
];

export function parseAuditFilter(raw: string | undefined | null): AuditFilter {
  const value = (raw ?? "").trim().toLocaleUpperCase("pt-BR");
  return AUDIT_FILTERS.some((item) => item.value === value) ? (value as AuditFilter) : "TODOS";
}

export function auditCategoryLabel(category: AuditFilter): string {
  return AUDIT_FILTERS.find((item) => item.value === category)?.label ?? category;
}

/** Ações de falha ou indisponibilidade. Sempre classificadas como INTEGRACOES. */
export function isFailureAction(action: string): boolean {
  return /_FAILED$|_UNAVAILABLE$|_DISCREPANCY$|_ERROR$/.test(action);
}

type Rule = { id: string; category: AuditCategory; test: (action: string, entityType: string) => boolean };

const exact = (...codes: string[]) => (action: string) => codes.includes(action);
const prefix = (...prefixes: string[]) => (action: string) => prefixes.some((p) => action.startsWith(p));

// Ordem importa apenas onde um código casaria com dois prefixos; cada caso está comentado.
const RULES: Rule[] = [
  // Falhas primeiro: o filtro "Integrações e falhas" deve reunir toda falha, de qualquer módulo.
  { id: "falha", category: "INTEGRACOES", test: (a) => isFailureAction(a) },

  // Segurança, permissões, cadastro e travas — eventos transversais, com classificação própria.
  {
    id: "seguranca",
    category: "SEGURANCA",
    test: (a, e) =>
      prefix("MEMBER_", "WRITE_FREEZE_", "MODULE_LOCK_", "USER_COMPLIANCE_TERM_", "AUDIT_NOTE_", "PROJECT_TEAM_COP", "TEAM_TRANSITION_")(a) ||
      exact("Administrador adicionado ao projeto")(a) ||
      e === "ProjectMembership",
  },

  // SSMA/ESG. Sincronização de fotos com o Drive é integração (vem antes por ser mais específica).
  { id: "ssma-drive", category: "INTEGRACOES", test: exact("SSMA_DRIVE_FILE_SYNCED") },
  { id: "ssma-esg", category: "SSMA", test: prefix("SSMA_", "ESG_", "ACCIDENT_") },

  // Medições e atas (ainda sem eventos na WEG; regras prontas para quando existirem).
  { id: "medicoes", category: "MEDICOES", test: (a, e) => prefix("MEASUREMENT_", "MEDICAO_")(a) || /^MEASUREMENT/.test(e) },
  { id: "atas", category: "ATAS", test: (a, e) => prefix("MEETING_", "MINUTES_", "ATA_")(a) || /^MEETING/.test(e) },

  // Relatórios semanais, cronograma semanal, ausências de envio, RDO e exportações.
  {
    id: "relatorios",
    category: "RELATORIOS",
    test: prefix("WEEKLY_REPORT_", "WEEKLY_S_CURVE_", "WEEKLY_SCHEDULE_", "WEEKLY_ABSENCE_", "DAILY_REPORT_", "RDO_", "DIARIO_", "CONTRACTUAL_TIMELINE_EXPORTED"),
  },

  // Ações, SLA, alertas de risco e escalonamentos.
  {
    id: "acoes-sla",
    category: "ACOES",
    test: prefix(
      "ACTION_",
      "SLA_",
      "RISK_ALERT",
      "ALERT_GOVERNOR_",
      "CONTRACT_ALERT_",
      "PILOT_",
      "FINANCIAL_INDICATOR_",
      "WEEKLY_ALERT_DIGEST_",
      "HISTORICAL_FINDING_ACTION_"
    ),
  },

  // E-mails: caixas, sincronização Gmail, anexos e candidatos vindos de threads.
  {
    id: "emails",
    category: "EMAILS",
    test: (a, e) =>
      prefix("EMAIL_", "GMAIL_", "CONTRACT_REVIEW_CANDIDATE_", "CONTRACT_EVENT_CREATED_FROM_EMAIL")(a) ||
      /Gmail|e-mail/i.test(a) ||
      e === "EmailIngestionRun" ||
      e === "EmailIngestionConfig",
  },

  // Integrações (Drive, Construmanager, origem de integração). Versões do Construmanager são "Projetos e versões".
  { id: "construmanager-versao", category: "PROJETOS", test: exact("CONSTRUMANAGER_NOVA_VERSAO_VIGENTE", "CONSTRUMANAGER_VERSION_IMPACT_REVIEWED") },
  { id: "integracoes", category: "INTEGRACOES", test: (a, e) => prefix("DRIVE_FILE_", "INTEGRATION_", "CONSTRUMANAGER_", "SCHEDULER_", "SYSTEM_HEALTH_")(a) || e === "Integration" || e === "CRON_JOB" },

  // Projeto, documentos, versões, cláusulas, eventos contratuais, IA e cronograma.
  {
    id: "projetos",
    category: "PROJETOS",
    test: prefix(
      "PROJECT_",
      "DOCUMENT_",
      "CLAUSE_",
      "EVENT_",
      "CONTRACT_EVENT_",
      "AI_",
      "HISTORICAL_FINDING_",
      "SCHEDULE_"
    ),
  },
];

export type AuditClassification = { category: AuditCategory; ruleId: string };

export function classifyAuditEntry(action: string, entityType: string | null | undefined): AuditClassification {
  const a = action ?? "";
  const e = entityType ?? "";
  for (const rule of RULES) {
    if (rule.test(a, e)) return { category: rule.category, ruleId: rule.id };
  }
  return { category: "NAO_CATALOGADO", ruleId: "sem-regra" };
}

// ---------------------------------------------------------------------------------------------
// Tradução dos códigos para exibição. O código original continua no banco e aparece na tela.

const ACTION_LABELS: Record<string, string> = {
  ACTION_ACKNOWLEDGED: "Ação reconhecida pelo responsável",
  ACTION_COMPLETED: "Ação concluída",
  ACTION_CREATED: "Ação criada",
  ACTION_ESCALATED: "Ação escalonada",
  ACTION_REASSIGNED: "Ação reatribuída",
  AI_FINDING_CREATED: "Achado de IA criado",
  AI_FINDING_STATUS_CHANGED: "Situação do achado de IA alterada",
  AI_MULTI_EXPERT_CURATION_CREATED: "Curadoria multiespecialista criada",
  ALERT_GOVERNOR_DEFERRED: "Envio de alerta adiado pelo limitador",
  ALERT_GOVERNOR_SUPPRESSED: "Envio de alerta suprimido pelo limitador",
  AUDIT_NOTE_TECHNICAL_EXECUTOR: "Nota de auditoria do executor técnico",
  CLAUSE_CREATED_FROM_EXTRACTION_CANDIDATE: "Cláusula criada a partir de candidata extraída",
  CLAUSE_DETECTION_COMPLETED: "Detecção de cláusulas concluída",
  CONSTRUMANAGER_DOCUMENT_PROMOTED: "Documento do Construmanager incorporado",
  CONSTRUMANAGER_NOVA_VERSAO_VIGENTE: "Nova versão vigente no Construmanager",
  CONSTRUMANAGER_VERSION_IMPACT_REVIEWED: "Impacto de versão do Construmanager revisado",
  CONTRACT_ALERT_BATCH_ITEM_RESPONDED: "Item de lote de alerta contratual respondido",
  CONTRACT_ALERT_BATCH_RESPONDED: "Lote de alerta contratual respondido",
  CONTRACT_ALERT_BATCH_SENT: "Lote de alerta contratual enviado",
  CONTRACT_ALERT_EMAIL_SENT: "E-mail de alerta contratual enviado",
  CONTRACT_EVENT_CREATED: "Evento contratual criado",
  CONTRACT_EVENT_CREATED_FROM_EMAIL_THREAD: "Evento contratual criado a partir de e-mail",
  CONTRACT_REVIEW_CANDIDATE_REJECTED: "Candidato à revisão contratual rejeitado",
  CONTRACT_REVIEW_CANDIDATE_REOPENED_FOR_TEST_RESET: "Candidato à revisão contratual reaberto (reinício de teste)",
  CONTRACTUAL_TIMELINE_EXPORTED: "Linha do tempo contratual exportada",
  DOCUMENT_CONTRACTUAL_ATTACHMENT_LINKED: "Anexo contratual vinculado ao documento",
  DOCUMENT_CONTRACTUAL_ATTACHMENT_UNLINKED: "Anexo contratual desvinculado do documento",
  DOCUMENT_DELETED: "Documento excluído",
  DOCUMENT_FILE_RELINKED: "Arquivo do documento revinculado",
  DOCUMENT_PROCESSING_COMPLETED: "Processamento de documento concluído",
  DOCUMENT_PROCESSING_FAILED: "Falha no processamento de documento",
  DOCUMENT_REPROCESSED: "Documento reprocessado",
  DOCUMENT_RESET_BULK_DELETE: "Exclusão em lote de documentos (reinício)",
  DOCUMENT_RESTORED: "Documento restaurado",
  DOCUMENT_TRASHED: "Documento enviado à lixeira",
  DOCUMENT_VERSION_CLIENT_RESPONSE_LINKED: "Resposta do cliente vinculada à versão",
  DOCUMENT_VERSION_FILE_ADDED: "Arquivo adicionado à versão do documento",
  DRIVE_FILE_SYNC_FAILED: "Falha ao espelhar arquivo no Google Drive",
  DRIVE_FILE_SYNCED: "Arquivo espelhado no Google Drive",
  EMAIL_ACCOUNT_CONNECTED: "Caixa de e-mail conectada",
  EMAIL_ACCOUNT_DISCONNECTED: "Caixa de e-mail desconectada",
  EMAIL_ATTACHMENT_INGESTED: "Anexo de e-mail importado",
  EMAIL_ATTACHMENT_PROCESSED: "Anexo de e-mail processado",
  EMAIL_BACKFILL_ALREADY_QUEUED: "Importação retroativa de e-mail já enfileirada",
  EMAIL_BACKFILL_SKIPPED_NO_CONFIG: "Importação retroativa ignorada (sem configuração)",
  EMAIL_SYNC_STARTED: "Sincronização de e-mail iniciada",
  ESG_OBLIGATION_CREATED: "Obrigação ESG criada",
  ESG_OBLIGATION_EVIDENCE_SUBMITTED: "Evidência de obrigação ESG enviada",
  ESG_OBLIGATION_REVIEWED: "Obrigação ESG revisada",
  ESG_OBLIGATION_STATUS_UPDATED: "Situação de obrigação ESG atualizada",
  EVENT_CLAUSE_CONFRONTATION_APPROVED: "Confronto evento × cláusula aprovado",
  EVENT_CLAUSE_CONFRONTATION_CANDIDATE_CREATED: "Candidato a confronto evento × cláusula criado",
  EVENT_CLAUSE_CONFRONTATION_REJECTED: "Confronto evento × cláusula rejeitado",
  EVENT_NOTE_CREATED: "Nota de evento criada",
  FINANCIAL_INDICATOR_INFORMATIVE_ANALYSIS: "Indicador financeiro em análise informativa",
  FINANCIAL_INDICATOR_REVIEW_PENDING: "Indicador financeiro aguardando revisão",
  GMAIL_MESSAGE_UNAVAILABLE: "Mensagem do Gmail indisponível",
  HISTORICAL_FINDING_ACTION_CREATED: "Ação criada a partir de achado histórico",
  HISTORICAL_FINDING_DISMISSED: "Achado histórico descartado",
  HISTORICAL_FINDING_RESOLVED: "Achado histórico resolvido",
  INTEGRATION_ORIGIN_UPDATED: "Origem da integração atualizada",
  MEMBER_ADDED: "Colaborador adicionado ao projeto",
  MEMBER_INVITATION_ACTIVATED: "Convite de colaborador ativado",
  MEMBER_INVITATION_AREA_CHANGED: "Área do convite alterada",
  MEMBER_INVITATION_CANCELLED: "Convite de colaborador cancelado",
  MEMBER_JOB_TITLE_SET: "Cargo do colaborador definido",
  MEMBER_PRE_REGISTERED: "Colaborador pré-cadastrado",
  MEMBER_REMOVED: "Colaborador removido do projeto",
  MEMBER_ROLE_CHANGED: "Perfil do colaborador alterado",
  MODULE_LOCK_APPLIED: "Bloqueio de módulos aplicado",
  PILOT_SEND_DELIVERY_DISCREPANCY: "Divergência de entrega no envio do piloto",
  PILOT_SINGLE_SEND_CONFIRMED_MANUALLY: "Envio único do piloto confirmado manualmente",
  PROJECT_ADDITIONAL_DOCUMENT_LINKED: "Documento vinculado a serviço adicional",
  PROJECT_ADDITIONAL_PROPOSAL_CONTRACTED: "Proposta de serviço adicional contratada",
  PROJECT_ADDITIONAL_PROPOSAL_CREATED: "Proposta de serviço adicional criada",
  PROJECT_DOCUMENT_UPLOADED: "Documento do projeto enviado",
  PROJECT_DOCUMENT_VERSION_UPLOADED: "Nova versão de documento enviada",
  PROJECT_STARTUP_COMPLETED: "Implantação do projeto concluída",
  PROJECT_STARTUP_REVIEW_STARTED: "Revisão de implantação iniciada",
  PROJECT_TEAM_COPIED: "Equipe copiada de outro projeto",
  PROJECT_TEAM_COPY_USED_AS_SOURCE: "Equipe do projeto usada como origem de cópia",
  PROJECT_UPDATED: "Projeto atualizado",
  RISK_ALERT_ACTION: "Ação registrada no alerta de risco",
  RISK_ALERT_AREA_INFORMATIVE_SET: "Área de alerta definida como informativa",
  RISK_ALERT_AUTOMATION_SUSPENDED_BY_SCOPE: "Automação de alerta suspensa por escopo",
  RISK_ALERT_CASE_COMMUNICATION_RESUMED: "Comunicação do caso de alerta retomada",
  RISK_ALERT_CASE_COMMUNICATION_SUSPENDED: "Comunicação do caso de alerta suspensa",
  RISK_ALERT_CASE_DUPLICATE_IDENTIFIED: "Caso de alerta duplicado identificado",
  RISK_ALERT_DEADLINE_EXPIRED: "Prazo do alerta de risco vencido",
  RISK_ALERT_EMAIL_FAILED: "Falha no envio de e-mail de alerta",
  RISK_ALERT_EMAIL_SENT: "E-mail de alerta de risco enviado",
  RISK_ALERT_NOT_READY_FOR_REAL_SEND: "Alertas ainda não liberados para envio real",
  RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_SET: "Destinatário de nível definido no piloto",
  RISK_ALERT_PILOT_LEVEL_RECIPIENT_OVERRIDE_UNSET: "Destinatário de nível do piloto revogado",
  RISK_ALERT_PILOT_SINGLE_RUN: "Execução única de alerta no piloto",
  RISK_ALERT_PLANNED: "Alerta de risco planejado",
  RISK_ALERT_READY_FOR_REAL_SEND: "Alertas liberados para envio real",
  RISK_ALERT_RECIPIENT_SUPPRESSED: "Destinatário de alerta suprimido",
  RISK_ALERT_REISSUE_DECISION_REQUIRED: "Decisão de reemissão de alerta necessária",
  RISK_ALERT_RESPONSIBLE_TRANSFERRED: "Responsável pelo alerta transferido",
  RISK_ALERT_TOP_LEVEL_REACHED: "Alerta atingiu o nível máximo de escalonamento",
  RISK_ALERT_UNAUTHORIZED_REPLY: "Resposta não autorizada a alerta",
  RISK_ALERTS_ENABLED: "Alertas de risco habilitados",
  SCHEDULER_JOB_DEACTIVATED: "Agendador desligado",
  SCHEDULER_JOB_REACTIVATED: "Agendador religado",
  SYSTEM_HEALTH_ALERT_FAILED: "Falha no envio do alerta técnico de supervisão",
  SYSTEM_HEALTH_ALERT_SENT: "Alerta técnico de supervisão enviado",
  SCHEDULE_RISK_THRESHOLDS_CONFIGURED: "Limites de risco do cronograma configurados",
  SCHEDULE_VERSION_COMPARISON_COMPUTED: "Comparação de versões do cronograma calculada",
  SLA_ACTION_RESPONSIBLE_TRANSFERRED: "Responsável pela ação de SLA transferido",
  SLA_AREA_RESPONSIBLES_UPDATED: "Responsáveis da área na Matriz SLA atualizados",
  SLA_CONFIGURATION_UPDATED: "Configuração de SLA atualizada",
  SLA_INTERIM_RESPONSIBLE_ASSIGNED: "Responsável interino de SLA designado",
  SLA_INTERIM_RESPONSIBLE_REVOKED: "Responsável interino de SLA revogado",
  SLA_MATRIX_RULE_DUPLICATE_DEACTIVATED: "Regra duplicada da Matriz SLA desativada",
  SLA_MATRIX_RULE_UPDATED: "Regra da Matriz SLA atualizada",
  SSMA_DRIVE_FILE_SYNC_FAILED: "Falha ao espelhar foto SSMA no Google Drive",
  SSMA_DRIVE_FILE_SYNCED: "Foto SSMA espelhada no Google Drive",
  SSMA_ESCALATION_CHANNEL_ACTIVATED: "Canal de escalonamento SSMA ativado",
  SSMA_ESCALATION_DECISION_REQUIRED: "Decisão de escalonamento SSMA necessária",
  SSMA_ESCALATION_LEVEL_APPLIED: "Nível de escalonamento SSMA aplicado",
  SSMA_ESCALATION_TOP_LEVEL_REACHED: "Escalonamento SSMA atingiu o nível máximo",
  SSMA_FIELD_NOTIFICATION_SENT: "Notificação de campo SSMA enviada",
  SSMA_FORM_SUBMITTED: "Formulário SSMA enviado",
  SSMA_REPLY_CONFIRMATION_CLAIMED: "Confirmação de resposta SSMA reservada",
  SSMA_REPLY_CONFIRMATION_PENDING: "Confirmação de resposta SSMA pendente",
  SSMA_REPLY_CONFIRMATION_SENT: "Confirmação de resposta SSMA enviada",
  SSMA_REPLY_NOTICE_SENT: "Aviso de resposta SSMA enviado",
  SSMA_REPLY_PROCESSED: "Resposta SSMA processada",
  SSMA_REPLY_TOKEN_ISSUED: "Código de resposta SSMA emitido",
  TEAM_TRANSITION_PLANNING_REGISTERED: "Planejamento de transição de equipe registrado",
  USER_COMPLIANCE_TERM_APPROVED: "Termo de conformidade aprovado",
  USER_COMPLIANCE_TERM_SENT: "Termo de conformidade enviado",
  USER_COMPLIANCE_TERM_VIEWED: "Termo de conformidade visualizado",
  WEEKLY_ABSENCE_ALERT_DETECTED_LATE: "Ausência de envio semanal detectada com atraso",
  WEEKLY_ABSENCE_ALERT_RESOLVED: "Ausência de envio semanal resolvida",
  WEEKLY_ABSENCE_CURRENT_WEEK_INTEGRATION_PENDING: "Semana atual com integração pendente",
  WEEKLY_ABSENCE_INTEGRATION_PENDING: "Envio semanal com integração pendente",
  WEEKLY_ABSENCE_MARKED_UNPROVEN: "Ausência de envio semanal marcada como não comprovada",
  WEEKLY_ABSENCE_RECLASSIFIED_INTEGRATION_PENDING: "Ausência reclassificada como integração pendente",
  WEEKLY_ABSENCE_WEEKS_VERIFIED_CHECKPOINT: "Semanas verificadas (ponto de controle)",
  WEEKLY_ALERT_DIGEST_SENT: "Resumo semanal de alertas enviado",
  WEEKLY_REPORT_WORKBOOK_DUPLICATE_IDENTIFIED: "Planilha de relatório semanal duplicada identificada",
  WEEKLY_REPORT_WORKBOOK_MISSING_ALERT_CREATED: "Alerta de planilha semanal ausente criado",
  WEEKLY_REPORT_WORKBOOK_PROCESSED: "Planilha de relatório semanal processada",
  WEEKLY_S_CURVE_MISSING_ALERT_CREATED: "Alerta de curva S semanal ausente criado",
  WEEKLY_SCHEDULE_CONFIG_INSERT: "Configuração do cronograma semanal criada",
  WEEKLY_SCHEDULE_CONFIG_UPDATE: "Configuração do cronograma semanal atualizada",
  WEEKLY_SCHEDULE_EMAIL_PENDING_HUMAN_REVIEW: "E-mail de cronograma aguardando revisão humana",
  WEEKLY_SCHEDULE_HISTORICAL_FROM_STORAGE: "Cronograma histórico recuperado do armazenamento",
  WEEKLY_SCHEDULE_HISTORICAL_RECOVERY: "Recuperação histórica de cronograma",
  WEEKLY_SCHEDULE_MISSING_ALERT_CREATED: "Alerta de cronograma semanal ausente criado",
  WEEKLY_SCHEDULE_VERSION_CREATED: "Versão do cronograma semanal criada",
  WRITE_FREEZE_APPLIED: "Congelamento de escrita aplicado",
  WRITE_FREEZE_REVERTED: "Congelamento de escrita revertido",
};

const TECHNICAL_CODE = /^[A-Z][A-Z0-9_]+$/;

/** Rótulo em português. Códigos sem tradução aparecem como estão (nunca são escondidos). */
export function translateAuditAction(action: string): { label: string; translated: boolean; technical: boolean } {
  const label = ACTION_LABELS[action];
  if (label) return { label, translated: true, technical: true };
  return { label: action, translated: false, technical: TECHNICAL_CODE.test(action) };
}

/** Códigos cuja tradução contém o termo pesquisado (para a busca por palavra-chave em português). */
export function actionCodesMatchingLabel(term: string): string[] {
  const needle = normalizeForSearch(term);
  if (!needle) return [];
  return Object.entries(ACTION_LABELS)
    .filter(([, label]) => normalizeForSearch(label).includes(needle))
    .map(([code]) => code);
}

export function normalizeForSearch(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR").trim();
}

export const KNOWN_AUDIT_ACTION_CODES = Object.keys(ACTION_LABELS);

// ---------------------------------------------------------------------------------------------
// Situação das falhas (faixa de supervisão).

export type FailureStatus = "ATIVA" | "AGUARDANDO_INVESTIGACAO" | "RECUPERADA" | "HISTORICA";

export const FAILURE_STATUS_LABELS: Record<FailureStatus, string> = {
  ATIVA: "Falhas ativas",
  AGUARDANDO_INVESTIGACAO: "Aguardando investigação",
  RECUPERADA: "Recuperadas",
  HISTORICA: "Históricas",
};

/** Ação de sucesso que encerra a falha da mesma entidade (evidência de recuperação). */
export const FAILURE_RECOVERY_ACTIONS: Record<string, string[]> = {
  DRIVE_FILE_SYNC_FAILED: ["DRIVE_FILE_SYNCED"],
  SSMA_DRIVE_FILE_SYNC_FAILED: ["SSMA_DRIVE_FILE_SYNCED"],
  DOCUMENT_PROCESSING_FAILED: ["DOCUMENT_PROCESSING_COMPLETED", "DOCUMENT_REPROCESSED"],
  RISK_ALERT_EMAIL_FAILED: ["RISK_ALERT_EMAIL_SENT"],
};

export const FAILURE_ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const FAILURE_HISTORICAL_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

export type FailureEvent = { id: string; action: string; entityId: string; occurredAt: string };
export type RecoveryEvent = { action: string; entityId: string; occurredAt: string };

export type FailureAssessment = FailureEvent & { status: FailureStatus; evidence: string; occurrences: number };

/**
 * Agrupa falhas por (ação, entidade) — tentativas repetidas da mesma falha contam uma vez — e
 * define a situação com evidência:
 * - RECUPERADA: há registro de sucesso da mesma entidade depois da última falha.
 * - ATIVA: sem recuperação e a última falha tem menos de 24 h.
 * - AGUARDANDO_INVESTIGACAO: sem recuperação, entre 24 h e 30 dias.
 * - HISTORICA: sem recuperação há mais de 30 dias.
 */
export function assessFailures(failures: FailureEvent[], recoveries: RecoveryEvent[], now: Date): FailureAssessment[] {
  const groups = new Map<string, { latest: FailureEvent; occurrences: number }>();
  for (const failure of failures) {
    const key = `${failure.action}|${failure.entityId}`;
    const current = groups.get(key);
    if (!current) groups.set(key, { latest: failure, occurrences: 1 });
    else {
      current.occurrences += 1;
      if (Date.parse(failure.occurredAt) > Date.parse(current.latest.occurredAt)) current.latest = failure;
    }
  }

  const result: FailureAssessment[] = [];
  for (const { latest, occurrences } of groups.values()) {
    const recoveryCodes = FAILURE_RECOVERY_ACTIONS[latest.action] ?? [];
    const failedAt = Date.parse(latest.occurredAt);
    const recovery = recoveries
      .filter((r) => r.entityId === latest.entityId && recoveryCodes.includes(r.action) && Date.parse(r.occurredAt) > failedAt)
      .sort((x, y) => Date.parse(x.occurredAt) - Date.parse(y.occurredAt))[0];
    const age = now.getTime() - failedAt;
    let status: FailureStatus;
    let evidence: string;
    if (recovery) {
      status = "RECUPERADA";
      evidence = `${recovery.action} em ${recovery.occurredAt} para a mesma entidade`;
    } else if (age < FAILURE_ACTIVE_WINDOW_MS) {
      status = "ATIVA";
      evidence = "sem registro de recuperação; última ocorrência há menos de 24 h";
    } else if (age < FAILURE_HISTORICAL_AFTER_MS) {
      status = "AGUARDANDO_INVESTIGACAO";
      evidence = "sem registro de recuperação; última ocorrência entre 24 h e 30 dias";
    } else {
      status = "HISTORICA";
      evidence = "sem registro de recuperação; última ocorrência há mais de 30 dias";
    }
    result.push({ ...latest, status, evidence, occurrences });
  }
  return result.sort((x, y) => Date.parse(y.occurredAt) - Date.parse(x.occurredAt));
}

// ---------------------------------------------------------------------------------------------
// Data e hora em Brasília.

export const AUDIT_TIME_ZONE = "America/Sao_Paulo";

export function formatAuditDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: AUDIT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Converte "AAAA-MM-DD" (dia em Brasília) no instante UTC de início desse dia. Brasil sem horário de verão desde 2019: UTC−03:00. */
export function brasiliaDayStartUtc(day: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T00:00:00-03:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function brasiliaNextDayStartUtc(day: string): string | null {
  const start = brasiliaDayStartUtc(day);
  if (!start) return null;
  return new Date(Date.parse(start) + 24 * 60 * 60 * 1000).toISOString();
}

/** Remove caracteres que alteram a sintaxe dos filtros do PostgREST (or/ilike). */
export function sanitizeAuditKeyword(raw: string | undefined | null): string {
  return (raw ?? "").replace(/[,()*%\\:"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}
