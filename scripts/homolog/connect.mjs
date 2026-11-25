// Conexão guardada ao alvo de homologação (usada por seed/rollback/check). Mesma guarda de apply-migrations.mjs.
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateTarget, forbiddenEnvNames, redactedTarget } from "./guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function refuse(msg) {
  console.error(`RECUSADO/ERRO: ${msg}`);
  process.exit(2);
}

/** Abre conexão SOMENTE se a guarda aprovar e o marcador existir. Retorna { db, info }. */
export async function openGuardedTarget({ requireMarker = true } = {}) {
  const rawUrl = process.env.HOMOLOG_DATABASE_URL;
  if (!rawUrl) refuse("defina HOMOLOG_DATABASE_URL (string de conexão do projeto de HOMOLOGAÇÃO; nunca a do operacional)");
  const bad = forbiddenEnvNames();
  if (bad.length) refuse(`variáveis do ambiente operacional presentes (${bad.join(", ")}); use um shell limpo`);
  const linkFile = path.join(root, "supabase", ".temp", "project-ref");
  const linked = existsSync(linkFile) ? readFileSync(linkFile, "utf8") : "";
  const info = evaluateTarget(rawUrl, { env: process.env, linkedRefText: linked });
  if (!info.ok) refuse(info.reason);
  const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? root, "x.js"))("pg");
  const db = new pg.Client({ connectionString: rawUrl, ssl: info.kind === "remote" ? { rejectUnauthorized: false } : undefined });
  await db.connect();
  if (requireMarker) {
    const m = (await db.query("select 1 from pg_namespace where nspname='acc_homolog_marker'")).rowCount;
    if (!m) { await db.end(); refuse("marcador acc_homolog_marker ausente: o alvo não foi marcado como homologação (apply-migrations.mjs --init-marker)"); }
  }
  console.log(`Alvo aprovado pela guarda: ${redactedTarget(info)}`);
  return { db, info };
}
