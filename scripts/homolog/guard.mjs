// GUARDA DURA do kit de homologação isolada (Fase 6 / H1).
// Objetivo: NUNCA permitir que qualquer script de scripts/homolog/* toque o Supabase operacional (ou qualquer host desconhecido).
// Política: LISTA BRANCA estreita + LISTA NEGRA explícita; tudo que não for reconhecido é RECUSADO (fail-closed).
//
// Alvos aceitos:
//   1. LOCAL DESCARTÁVEL: 127.0.0.1 ou localhost, porta 55434 (Postgres 17 de homologação), banco com prefixo "acc_homolog_".
//   2. REMOTO ISOLADO (Supabase): host db.<ref>.supabase.co  OU  aws-<n>-<região>.pooler.supabase.com com usuário postgres.<ref>,
//      sendo <ref> (20 letras minúsculas) IGUAL a HOMOLOG_TARGET_REF, DIFERENTE de qualquer ref da lista negra e diferente de qualquer ref
//      que apareça em variáveis/arquivos do app operacional (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_URL, supabase/.temp/project-ref).
//      Exige HOMOLOG_I_UNDERSTAND_ISOLATED=true.
//
// Este módulo é PURO (sem rede, sem I/O): recebe a URL e o "ambiente" como argumentos. Não imprime a URL nem a senha em nenhuma mensagem.

// Projetos da organização Axion que são OPERACIONAIS (nunca alvo de homologação). O primeiro é o Supabase do ACC.
export const OPERATIONAL_REFS = Object.freeze([
  "plbcvwostmdmdmrziwmd", // axion-contract-intelligence-dev (operacional do ACC)
  "jawaqwtcukrexnisogzo", // Comercial Axion
  "asaraykwyhmdiyrlaupq", // Planejamento Axion
]);

export const LOCAL_PORT = "55434";
export const LOCAL_DB_PREFIX = "acc_homolog_";
const REF_RE = /^[a-z]{20}$/;
const DIRECT_HOST_RE = /^db\.([a-z]{20})\.supabase\.co$/;
const POOLER_HOST_RE = /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/;

function refsInText(text) {
  const out = new Set();
  for (const m of String(text ?? "").matchAll(/\b([a-z]{20})\b/g)) out.add(m[1]);
  return out;
}

/**
 * @param {string} rawUrl  string de conexão Postgres do alvo
 * @param {{env?: Record<string,string|undefined>, linkedRefText?: string}} [ctx]
 *   env: variáveis de ambiente (por padrão process.env); linkedRefText: conteúdo de supabase/.temp/project-ref (se houver)
 * @returns {{ok: true, kind: "local"|"remote", ref: string|null, database: string} | {ok: false, reason: string}}
 */
export function evaluateTarget(rawUrl, ctx = {}) {
  const env = ctx.env ?? process.env;
  const deny = (reason) => ({ ok: false, reason });
  if (!rawUrl || typeof rawUrl !== "string") return deny("string de conexão ausente");

  // Lista negra: qualquer ocorrência de ref operacional em QUALQUER parte da URL (host, usuário, senha, query) recusa.
  for (const bad of OPERATIONAL_REFS) {
    if (rawUrl.includes(bad)) return deny("o alvo referencia um projeto operacional da Axion (lista negra)");
  }

  let u;
  try { u = new URL(rawUrl); } catch { return deny("string de conexão inválida"); }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") return deny("protocolo deve ser postgres/postgresql");
  const host = u.hostname.toLowerCase();
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!database) return deny("banco de dados ausente na string de conexão");

  // ---- 1. local descartável ----
  if (host === "127.0.0.1" || host === "localhost") {
    if (u.port !== LOCAL_PORT) return deny(`local só na porta ${LOCAL_PORT}`);
    if (!database.startsWith(LOCAL_DB_PREFIX)) return deny(`local só em banco descartável com prefixo ${LOCAL_DB_PREFIX}`);
    if (!/^[a-z0-9_]+$/.test(database)) return deny("nome de banco local inválido");
    return { ok: true, kind: "local", ref: null, database };
  }

  // ---- 2. remoto isolado ----
  let ref = null;
  const direct = DIRECT_HOST_RE.exec(host);
  if (direct) {
    ref = direct[1];
  } else if (POOLER_HOST_RE.test(host)) {
    const m = /^postgres\.([a-z]{20})$/.exec(decodeURIComponent(u.username));
    if (!m) return deny("pooler exige usuário postgres.<ref>");
    ref = m[1];
  } else {
    return deny("host desconhecido (só aceito 127.0.0.1:55434, db.<ref>.supabase.co ou pooler do Supabase)");
  }
  if (!REF_RE.test(ref)) return deny("ref do projeto inválido");
  if (OPERATIONAL_REFS.includes(ref)) return deny("ref é de projeto operacional (lista negra)");

  const target = (env.HOMOLOG_TARGET_REF ?? "").trim();
  if (!target) return deny("defina HOMOLOG_TARGET_REF com o ref do projeto de homologação (confirmação explícita)");
  if (!REF_RE.test(target)) return deny("HOMOLOG_TARGET_REF inválido");
  if (target !== ref) return deny("HOMOLOG_TARGET_REF difere do ref da string de conexão");
  if (env.HOMOLOG_I_UNDERSTAND_ISOLATED !== "true") return deny("defina HOMOLOG_I_UNDERSTAND_ISOLATED=true (confirma que o alvo é um projeto de homologação separado)");

  // O alvo nunca pode coincidir com o projeto que o app/repositório usa (variáveis de ambiente e vínculo da CLI).
  const appRefs = new Set([
    ...refsInText(env.NEXT_PUBLIC_SUPABASE_URL),
    ...refsInText(env.SUPABASE_URL),
    ...refsInText(ctx.linkedRefText),
  ]);
  if (appRefs.has(ref)) return deny("o ref do alvo coincide com o projeto configurado no app/CLI (operacional)");

  return { ok: true, kind: "remote", ref, database };
}

/** Variáveis de ambiente do app operacional/segredos que NÃO podem estar presentes quando um script do kit roda. */
export function forbiddenEnvNames(env = process.env) {
  return Object.keys(env).filter((k) =>
    /^(SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_|GOOGLE_GMAIL_|CONSTRUMANAGER_|ANTHROPIC_|OPENAI_|CRON_SECRET|ACC_RISK_ALERTS_CRON_SECRET)/i.test(k)
  );
}

/** Mensagem segura para log: nunca inclui senha. */
export function redactedTarget(info) {
  return info.kind === "local" ? `local:${info.database}` : `remoto-isolado:${info.ref}/${info.database}`;
}
