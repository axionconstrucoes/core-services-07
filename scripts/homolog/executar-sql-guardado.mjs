// Executa UM arquivo SQL de docs/implantacao/** no acc-homolog, SOMENTE pela guarda do kit (openGuardedTarget: ref != operacional,
// HOMOLOG_TARGET_REF, marcador acc_homolog_marker, sem variaveis operacionais). Nunca imprime a conexao.
// Uso (via executar-homolog.ps1 -Etapa sql -Arquivo <caminho> [-Extra "--esperar-erro=TRAVA-TESTE-RESULTADO"]):
//   --transacao            envolve em BEGIN/COMMIT (ROLLBACK em erro)
//   --esperar-erro=TEXTO   o script termina de proposito com um erro cuja mensagem contem TEXTO (teste transacional): imprime a mensagem e sai 0
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openGuardedTarget, refuse } from "./connect.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const transacao = args.includes("--transacao");
const esperar = args.find((a) => a.startsWith("--esperar-erro="))?.slice("--esperar-erro=".length) ?? null;
if (!file) refuse("informe o arquivo SQL");
const abs = path.resolve(root, file);
const permitido = path.join(root, "docs", "implantacao") + path.sep;
if (!abs.startsWith(permitido) || !abs.endsWith(".sql")) refuse("so aceito arquivos .sql dentro de docs/implantacao/");
const sql = readFileSync(abs, "utf8").replace(/^﻿/, "");

const { db, info } = await openGuardedTarget({ requireMarker: true });
let code = 0;
try {
  const id = (await db.query("select current_database() as db, (select count(*) from pg_namespace where nspname='acc_homolog_marker') as marcador")).rows[0];
  console.log(`[guardado] arquivo=${path.relative(root, abs)} transacao=${transacao} db=${id.db} marcador=${id.marcador}`);
  if (transacao) await db.query("begin");
  const res = await db.query(sql);
  if (transacao) await db.query("commit");
  for (const r of Array.isArray(res) ? res : [res]) {
    if (r.rows?.length) console.log(JSON.stringify(r.rows));
  }
  if (esperar) { console.log(`FALHA: esperava erro contendo "${esperar}" e o script terminou sem erro`); code = 1; }
} catch (e) {
  if (transacao) { try { await db.query("rollback"); } catch {} }
  if (esperar && String(e.message).includes(esperar)) {
    console.log(`[erro esperado] ${e.message}`);
  } else {
    console.log(`ERRO ${e.code ?? ""}: ${String(e.message).split("\n")[0]}`);
    code = 1;
  }
} finally {
  await db.end();
}
process.exit(code);
