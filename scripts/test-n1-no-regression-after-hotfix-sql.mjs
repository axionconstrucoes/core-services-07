// PROTEÇÃO CONTRA REGRESSÃO DA FUNÇÃO record_risk_alert_action NA ORDEM DE PUBLICAÇÃO.
//
// Risco: o hotfix 20261121090000 pode ser aplicado manualmente ANTES da pilha 20261120100000–20261121*. As definições
// intermediárias (20261120130000 e 20261120151000) são mais fracas que o hotfix; se rodassem depois dele, rebaixariam a
// segurança até a 20261121101000. As duas agora só criam a função se ela AINDA NÃO estiver na versão endurecida.
//
// Prova (PGlite descartável, sem rede, nada de produção):
//   A) hotfix primeiro, pilha depois: o md5(prosrc) da função é o do hotfix APÓS CADA migration da pilha (nunca regride);
//   B) ordem normal (sem hotfix manual): as intermediárias AINDA se aplicam (replay fiel) e a função termina endurecida;
//   C) o comportamento de segurança (LEITURA com responsável anterior NULL é recusada) vale ao final de A e de B.
//
// Uso: node scripts/test-n1-no-regression-after-hotfix-sql.mjs

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "..", "supabase", "migrations");
const platform = /const PLATFORM = `([\s\S]*?)`;/.exec(readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8"))[1];

const HOTFIX = "20261121090000_hotfix_risk_alert_action_authorization.sql";
const VULNERABLE_MD5 = "90bc6965c95c62a3df46ba2149f92335"; // corpo vigente em produção (20260921090000), com CRLF
const HARDENED = new Set(["c2f015a91b8f4e94c52a68c3536cb89d", "930f6d75898793479b418950b0053bd9"]); // hotfix (CRLF / LF)
const FN = "public.record_risk_alert_action(uuid,text,jsonb)";

let passed = 0;
let failed = 0;
const assert = (c, m) => {
  if (!c) throw new Error(m ?? "assertion failed");
};
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 300)}`);
    failed += 1;
  }
}

const all = readdirSync(dir).filter((x) => x.endsWith(".sql")).sort();
const base = all.filter((f) => f < "20261120"); // = main de produção (sem a pilha)
const stack = all.filter((f) => f >= "20261120" && f !== HOTFIX); // pilha pós-base, sem o hotfix
assert(base.length > 100 && stack.length >= 10, "conjunto de migrations inesperado");
const sql = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "").replace(/create extension if not exists pgcrypto[^;]*;/gi, "");
const md5 = async (db) =>
  (await db.query("select md5(prosrc) h from pg_proc where oid = to_regprocedure($1)", [FN])).rows[0]?.h ?? null;
const md5OfFile = (f) => {
  // corpo entre "as $$" e o "$$;" que fecha a função (bytes do arquivo, como o Postgres grava em prosrc)
  const s = readFileSync(path.join(dir, f), "utf8");
  const i = s.indexOf("create or replace function public.record_risk_alert_action(");
  const a = s.indexOf("as $$", i) + "as $$".length;
  const b = s.indexOf("$$;", a);
  return createHash("md5").update(s.slice(a, b)).digest("hex");
};
async function newDb() {
  const db = new PGlite();
  await db.exec(platform);
  for (const f of base) await db.exec(sql(f));
  return db;
}

// ---------------- A) hotfix primeiro, pilha depois ----------------
const dbA = await newDb();
await check("A0 base de produção: a função é a versão vulnerável 90bc6965…", async () => {
  assert((await md5(dbA)) === VULNERABLE_MD5, `md5 base = ${await md5(dbA)}`);
});
await dbA.exec(sql(HOTFIX));
await check("A1 hotfix aplicado: a função é a versão endurecida", async () => {
  assert(HARDENED.has(await md5(dbA)), `md5 = ${await md5(dbA)}`);
});
const hardenedMd5 = await md5(dbA);
for (const f of stack) {
  await dbA.exec(sql(f));
  const h = await md5(dbA);
  await check(`A  após ${f}: a função continua endurecida (sem regressão)`, async () => {
    assert(h === hardenedMd5, `md5 = ${h} (esperado ${hardenedMd5})`);
  });
}

// ---------------- B) ordem normal (sem hotfix manual) ----------------
const dbB = await newDb();
const trail = [];
for (const f of [...stack, HOTFIX].sort()) {
  await dbB.exec(sql(f));
  trail.push([f, await md5(dbB)]);
}
const at = (name) => trail.find(([f]) => f.startsWith(name))?.[1];
await check("B1 ordem normal: 20261120130000 AINDA se aplica (replay fiel; função muda de 90bc6965…)", async () => {
  const h = at("20261120130000");
  assert(h && h !== VULNERABLE_MD5 && !HARDENED.has(h), `md5 após 130000 = ${h}`);
  assert(h === md5OfFile("20261120130000_risk_alert_action_server_side_guard.sql"), "o corpo aplicado difere do arquivo");
});
await check("B2 ordem normal: 20261120151000 AINDA se aplica e o corpo é o do arquivo", async () => {
  const h = at("20261120151000");
  assert(h && !HARDENED.has(h), `md5 após 151000 = ${h}`);
  assert(h === md5OfFile("20261120151000_risk_alert_action_no_outbox_authorization.sql"), "o corpo aplicado difere do arquivo");
});
await check("B3 ordem normal: a função termina endurecida (hotfix e 20261121101000)", async () => {
  assert(HARDENED.has(await md5(dbB)), `md5 final = ${await md5(dbB)}`);
  assert(at("20261121101000") === (await md5(dbB)), "a 101000 não manteve a versão final");
});

// ---------------- C) comportamento nos dois finais + metadados ----------------
for (const [label, db] of [["A (hotfix primeiro)", dbA], ["B (ordem normal)", dbB]]) {
  await check(`C ${label}: dono, SECURITY DEFINER, search_path vazio e ACL sem anon`, async () => {
    const r = (
      await db.query(
        "select pg_get_userbyid(proowner) o, prosecdef d, coalesce(proconfig::text,'') c, coalesce(proacl::text,'') a from pg_proc where oid = to_regprocedure($1)",
        [FN],
      )
    ).rows[0];
    assert(r.o === "postgres" && r.d === true, JSON.stringify(r));
    assert(/search_path=""/.test(r.c) || /search_path=\"\"/.test(r.c) || r.c.includes("search_path"), `config = ${r.c}`);
    assert(!/anon=/.test(r.a) && /authenticated=X/.test(r.a) && /service_role=X/.test(r.a), `acl = ${r.a}`);
  });
}

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
