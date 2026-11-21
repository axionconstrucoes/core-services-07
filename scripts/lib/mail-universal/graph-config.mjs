// Fase 6/H3 — configuração do leitor Outlook/Graph POR VARIÁVEIS DE AMBIENTE (só NOMES documentados; valores nunca versionados).
// Nenhuma variável é lida do frontend. Segredo só no repositório de segredos do executor (ou, preferível, certificado/WIF).
import { createGraphTransport, GRAPH_DEFAULT_AUTHORITY, GRAPH_DEFAULT_BASE } from "./graph-transport.mjs";
import { GRAPH_DEFAULT_FOLDERS } from "./graph-reader.mjs";

export const GRAPH_ENV = Object.freeze({
  tenantId: "ACC_GRAPH_TENANT_ID",
  clientId: "ACC_GRAPH_CLIENT_ID",
  clientSecret: "ACC_GRAPH_CLIENT_SECRET",
  mailboxes: "ACC_GRAPH_MAILBOXES", // lista separada por vírgula; PRIORIDADE: crm@axion.com.br — só se for caixa Exchange Online
  folders: "ACC_GRAPH_FOLDERS", // opcional; padrão inbox,sentitems
  graphBase: "ACC_GRAPH_BASE_URL", // opcional (teste/nuvem soberana); padrão https://graph.microsoft.com/v1.0
  authority: "ACC_GRAPH_AUTHORITY", // opcional; padrão https://login.microsoftonline.com
});

/** Nomes que faltam (nunca valores). Vazio = configuração mínima presente. */
export function missingGraphConfig(env = process.env) {
  return [GRAPH_ENV.tenantId, GRAPH_ENV.clientId, GRAPH_ENV.clientSecret, GRAPH_ENV.mailboxes].filter((n) => !String(env[n] ?? "").trim());
}

export function graphMailboxes(env = process.env) {
  return [...new Set(String(env[GRAPH_ENV.mailboxes] ?? "").split(",").map((m) => m.trim().toLowerCase()).filter(Boolean))];
}

export function graphFolders(env = process.env) {
  const list = String(env[GRAPH_ENV.folders] ?? "").split(",").map((m) => m.trim()).filter(Boolean);
  return list.length ? list : [...GRAPH_DEFAULT_FOLDERS];
}

/** Falha fechado: sem configuração completa NÃO cria transporte (e nada é chamado). */
export function createGraphTransportFromEnv(env = process.env, extra = {}) {
  const missing = missingGraphConfig(env);
  if (missing.length) throw new Error(`GRAPH_CONFIG_INCOMPLETA: faltam variáveis ${missing.join(", ")}`);
  return createGraphTransport({
    tenantId: env[GRAPH_ENV.tenantId],
    clientId: env[GRAPH_ENV.clientId],
    clientSecret: env[GRAPH_ENV.clientSecret],
    graphBase: env[GRAPH_ENV.graphBase] || GRAPH_DEFAULT_BASE,
    authority: env[GRAPH_ENV.authority] || GRAPH_DEFAULT_AUTHORITY,
    ...extra,
  });
}
