// Chave única das notificações SSMA por e-mail. FAIL CLOSED: só o valor EXATO "true" liga; ausente, vazio, "false", "TRUE", "1",
// "true " (com espaço) ou qualquer outro valor mantém DESLIGADO. Módulo puro (sem server-only) para ser testável isoladamente.
// Vale para o aviso imediato de registro CRÍTICO (/api/ssma/field-records/notifications) e para a varredura agendada
// (/api/cron/ssma-notifications, que mantém a sua própria checagem equivalente).
//
// ESCOPO (ACC_SSMA_NOTIFICATIONS_SCOPE) — restringe O QUE pode sair quando a chave está ligada:
//   - ausente/vazio  => comportamento legado (todos os tipos, todos os projetos);
//   - "WEG_CORRECTIVE_ACTIONS" => SOMENTE o aviso de ação corretiva em atraso (ACTION_OVERDUE) da WEG, SOMENTE ao responsável
//     da ação (sem lista de área), com Reply-To para resposta no corpo; aviso de registro CRÍTICO e outros projetos ficam DESLIGADOS;
//   - qualquer outro valor => NADA sai (fail closed).

export const NOTIFICATIONS_DISABLED = "NOTIFICATIONS_DISABLED" as const;
export const SSMA_NOTIFICATIONS_SCOPE_ENV = "ACC_SSMA_NOTIFICATIONS_SCOPE";
export const WEG_CORRECTIVE_ACTIONS_SCOPE = "WEG_CORRECTIVE_ACTIONS";
export const WEG_PROJECT_ID = "00000000-0000-4000-8000-000000000001";

type Env = Record<string, string | undefined>;

export function ssmaNotificationsEnabled(env: Env = process.env): boolean {
  return env.ACC_SSMA_NOTIFICATIONS_ENABLED === "true";
}

export interface SsmaNotificationScope {
  /** Aviso de registro CRÍTICO (imediato e rede de segurança da varredura). */
  criticalRecords: boolean;
  /** Aviso de ação corretiva em atraso. */
  overdueActions: boolean;
  /** Projetos permitidos para os avisos (null = todos — só no modo legado). */
  projectIds: string[] | null;
  /** true => o aviso vai SOMENTE ao responsável da ação (sem membros da área). */
  responsibleOnly: boolean;
  /** true => o aviso leva Reply-To opaco para resposta no corpo do e-mail. */
  replyEnabled: boolean;
  /** true => mensagem operacional (sem faixa de teste do piloto). */
  operational: boolean;
  mode: "DISABLED" | "LEGACY_ALL" | "WEG_CORRECTIVE_ACTIONS" | "INVALID_SCOPE";
}

const NONE: Omit<SsmaNotificationScope, "mode"> = {
  criticalRecords: false,
  overdueActions: false,
  projectIds: [],
  responsibleOnly: true,
  replyEnabled: false,
  operational: false,
};

export function resolveSsmaNotificationScope(env: Env = process.env): SsmaNotificationScope {
  if (!ssmaNotificationsEnabled(env)) return { ...NONE, mode: "DISABLED" };
  const raw = env[SSMA_NOTIFICATIONS_SCOPE_ENV];
  if (raw === undefined || raw === "") {
    return { criticalRecords: true, overdueActions: true, projectIds: null, responsibleOnly: false, replyEnabled: false, operational: false, mode: "LEGACY_ALL" };
  }
  if (raw === WEG_CORRECTIVE_ACTIONS_SCOPE) {
    return { criticalRecords: false, overdueActions: true, projectIds: [WEG_PROJECT_ID], responsibleOnly: true, replyEnabled: true, operational: true, mode: "WEG_CORRECTIVE_ACTIONS" };
  }
  return { ...NONE, mode: "INVALID_SCOPE" };
}

export function scopeAllowsProject(scope: SsmaNotificationScope, projectId: string): boolean {
  return scope.projectIds === null || scope.projectIds.includes(projectId.trim().toLowerCase());
}
