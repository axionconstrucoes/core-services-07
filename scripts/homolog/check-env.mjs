#!/usr/bin/env node
// Checklist de VARIÁVEIS do app de homologação isolada (Fase 6 / H1). Lê um arquivo dotenv FORA do repositório (ex.: <pasta-fora-do-repositorio>/.env.homolog)
// e valida NOMES e COERÊNCIA sem imprimir nenhum valor. Nunca lê o .env.local operacional.
// Uso: HOMOLOG_TARGET_REF=<ref> node scripts/homolog/check-env.mjs --file=<caminho>
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OPERATIONAL_REFS } from "./guard.mjs";

/** Obrigatórias no app de homologação. */
export const REQUIRED = Object.freeze([
  "NEXT_PUBLIC_SUPABASE_URL", // https://<ref-da-homologacao>.supabase.co
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", // chave publicável DO PROJETO DE HOMOLOGAÇÃO
  "SUPABASE_SECRET_KEY", // chave secreta DO PROJETO DE HOMOLOGAÇÃO (server-only; nunca no frontend)
  "AXION_APP_BASE_URL", // URL do app de homologação (redirect OAuth e links)
]);
/** Devem estar AUSENTES: integrações reais e segredos operacionais não pertencem à homologação. */
export const MUST_BE_ABSENT = Object.freeze([
  "GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET", "GOOGLE_GMAIL_REFRESH_TOKEN", "GOOGLE_GMAIL_SENDER_EMAIL",
  "GOOGLE_GMAIL_INBOUND_CLIENT_ID", "GOOGLE_GMAIL_INBOUND_CLIENT_SECRET", "GOOGLE_GMAIL_INBOUND_REFRESH_TOKEN", "GOOGLE_GMAIL_INBOUND_MAILBOX",
  "GOOGLE_GMAIL_REYNALDO_CLIENT_ID", "GOOGLE_GMAIL_REYNALDO_CLIENT_SECRET", "GOOGLE_GMAIL_REYNALDO_REFRESH_TOKEN",
  "CONSTRUMANAGER_LOGIN", "CONSTRUMANAGER_PASSWORD", "CONSTRUMANAGER_BASE_URL",
  "CRON_SECRET", "ACC_RISK_ALERTS_CRON_SECRET", "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
]);
/** Valores seguros esperados (fail-closed do app): envio real só com ACC_OUTBOUND_MODE=production, que NÃO deve existir na homologação. */
export const SAFE_VALUES = Object.freeze({ ACC_OUTBOUND_MODE: ["pilot"], ACC_WEEKLY_REPORTS_ENABLED: ["false", ""] });

export function parseDotenv(text) {
  const map = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    map[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return map;
}

/** @returns {{ok:boolean, problems:string[], notes:string[]}} (nunca contém valores) */
export function checkEnvMap(map, { targetRef }) {
  const problems = [];
  const notes = [];
  if (!/^[a-z]{20}$/.test(targetRef ?? "")) problems.push("HOMOLOG_TARGET_REF ausente/inválido");
  else if (OPERATIONAL_REFS.includes(targetRef)) problems.push("HOMOLOG_TARGET_REF é um projeto operacional");
  for (const k of REQUIRED) if (!map[k]) problems.push(`falta ${k}`);
  for (const k of MUST_BE_ABSENT) if (map[k]) problems.push(`${k} deve estar AUSENTE na homologação (integração real/segredo operacional)`);
  for (const [k, allowed] of Object.entries(SAFE_VALUES)) if (k in map && !allowed.includes(map[k])) problems.push(`${k} com valor não permitido na homologação`);
  const url = map.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    const m = /^https:\/\/([a-z]{20})\.supabase\.co\/?$/.exec(url);
    if (!m) problems.push("NEXT_PUBLIC_SUPABASE_URL não é https://<ref>.supabase.co");
    else {
      if (OPERATIONAL_REFS.includes(m[1])) problems.push("NEXT_PUBLIC_SUPABASE_URL aponta para projeto OPERACIONAL");
      if (targetRef && m[1] !== targetRef) problems.push("NEXT_PUBLIC_SUPABASE_URL difere de HOMOLOG_TARGET_REF");
    }
  }
  for (const k of Object.keys(map)) {
    if (/^NEXT_PUBLIC_/.test(k) && /(SECRET|SERVICE|PASSWORD|TOKEN)/i.test(k)) problems.push(`${k}: segredo com prefixo NEXT_PUBLIC_ (vazaria ao navegador)`);
    for (const bad of OPERATIONAL_REFS) if (String(map[k]).includes(bad)) problems.push(`${k} contém o ref de um projeto operacional`);
  }
  if (map.SUPABASE_SECRET_KEY && map.SUPABASE_SECRET_KEY === map.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) problems.push("chave secreta igual à publicável");
  if (!map.ACC_OUTBOUND_MODE) notes.push("ACC_OUTBOUND_MODE ausente = modo piloto (fail-closed): nenhum e-mail real chega a destinatário original");
  if (!("NEXT_PUBLIC_ACC_TEST_MODE" in map)) notes.push("NEXT_PUBLIC_ACC_TEST_MODE ausente = etiqueta SISTEMA EM TESTE visível (desejado)");
  return { ok: problems.length === 0, problems, notes };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = process.argv.find((a) => a.startsWith("--file="))?.slice(7);
  if (!f || !existsSync(f)) { console.error("RECUSADO/ERRO: informe --file=<dotenv de homologação> (fora do repositório)"); process.exit(2); }
  if (/apps[\\/]web[\\/]\.env\.local$/i.test(path.resolve(f))) { console.error("RECUSADO: não use o .env.local operacional"); process.exit(2); }
  const r = checkEnvMap(parseDotenv(readFileSync(f, "utf8")), { targetRef: process.env.HOMOLOG_TARGET_REF });
  console.log(r.ok ? "OK: variáveis coerentes com homologação isolada." : "PROBLEMAS:");
  r.problems.forEach((p) => console.log(`  - ${p}`));
  r.notes.forEach((n) => console.log(`  nota: ${n}`));
  process.exit(r.ok ? 0 : 1);
}
