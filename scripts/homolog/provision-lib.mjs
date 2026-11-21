// Parte PURA do procedimento de provisionamento do acc-homolog (Fase 7 / H6a). Sem rede, sem I/O, sem segredos.
import path from "node:path";
import { OPERATIONAL_REFS } from "./guard.mjs";

export const ORG_ID = "vlkuhdxanitymduyvhxi"; // organização Axion (Supabase)
export const PROJECT_NAME = "acc-homolog";
export const REGION = "sa-east-1";
export const SIZE = "micro";
export const REF_RE = /^[a-z]{20}$/;

/** Comando de criação para IMPRESSÃO. A senha NUNCA aparece: usa a variável de ambiente (sintaxe de shell). */
export function buildCreateCommand() {
  return `npx supabase projects create ${PROJECT_NAME} --org-id ${ORG_ID} --region ${REGION} --size ${SIZE} --db-password "$HOMOLOG_DB_PASSWORD"`;
}
/** Argumentos reais (usados só no modo --execute). */
export function buildCreateArgs(password) {
  return ["supabase", "projects", "create", PROJECT_NAME, "--org-id", ORG_ID, "--region", REGION, "--size", SIZE, "--db-password", password];
}

/** O arquivo com o ref deve ficar FORA do repositório. */
export function isOutsideRepo(file, repoRoot) {
  const rel = path.relative(path.resolve(repoRoot), path.resolve(file));
  return rel.startsWith("..") || path.isAbsolute(rel);
}

/**
 * Decide o que o procedimento pode fazer. Fail-closed.
 * @param {{execute:boolean, confirmCost:string|null, adoptRef:string|null, refFile:string|null}} args
 * @param {Record<string,string|undefined>} env
 * @param {{repoRoot:string, linkedRefText?:string}} ctx
 * @returns {{ok:boolean, mode:"dry-run"|"execute", createsResource:boolean, problems:string[]}}
 */
export function evaluateProvision(args, env, ctx) {
  const problems = [];
  const adopt = args.adoptRef ?? null;
  const execute = !!args.execute;
  if (adopt) {
    if (!REF_RE.test(adopt)) problems.push("--adopt-ref inválido (20 letras minúsculas)");
    if (OPERATIONAL_REFS.includes(adopt)) problems.push("--adopt-ref é um projeto OPERACIONAL (lista negra)");
    const appText = `${env.NEXT_PUBLIC_SUPABASE_URL ?? ""} ${env.SUPABASE_URL ?? ""} ${ctx.linkedRefText ?? ""}`;
    if (appText.includes(adopt)) problems.push("--adopt-ref coincide com o projeto do app/CLI (operacional)");
  }
  const createsResource = execute && !adopt;
  if (execute) {
    if (env.HOMOLOG_AUTHORIZED !== "SIM") problems.push("falta HOMOLOG_AUTHORIZED=SIM");
    if (!adopt) {
      if (!args.confirmCost || !String(args.confirmCost).trim()) problems.push('falta --confirm-cost "<valor>" (criar projeto gera custo recorrente)');
      if (!env.HOMOLOG_DB_PASSWORD) problems.push("falta HOMOLOG_DB_PASSWORD no ambiente (nunca em arquivo/argumento)");
    }
    if (!args.refFile) problems.push("falta --ref-file=<caminho FORA do repositório>");
    else if (!isOutsideRepo(args.refFile, ctx.repoRoot)) problems.push("--ref-file deve ficar FORA do repositório");
  }
  if (problems.length) return { ok: false, mode: execute ? "execute" : "dry-run", createsResource: false, problems };
  return { ok: true, mode: execute ? "execute" : "dry-run", createsResource, problems };
}

/** Texto de log seguro: remove qualquer ocorrência de valores secretos conhecidos. */
export function redact(text, secrets) {
  let out = String(text);
  for (const s of secrets) if (s && String(s).length >= 4) out = out.split(String(s)).join("***");
  return out;
}
