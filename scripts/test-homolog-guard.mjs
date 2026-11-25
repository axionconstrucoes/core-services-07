// Teste PURO da guarda dura do kit de homologação isolada (scripts/homolog/guard.mjs) e do parser de contas do seed. Sem rede, sem banco.
import { evaluateTarget, forbiddenEnvNames, OPERATIONAL_REFS } from "./homolog/guard.mjs";
import { parseAccounts } from "./homolog/seed-lib.mjs";
import { checkEnvMap, parseDotenv } from "./homolog/check-env.mjs";

let passed = 0;
let failed = 0;
const ok = (name, cond) => { if (cond) { passed += 1; console.log(`OK   ${name}`); } else { failed += 1; console.log(`FAIL ${name}`); } };

const FAKE_REF = "abcdefghijklmnopqrst"; // 20 letras, fictício
const OK_ENV = { HOMOLOG_TARGET_REF: FAKE_REF, HOMOLOG_I_UNDERSTAND_ISOLATED: "true" };
const direct = (ref, pw = "x") => `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`;

// ---- recusas obrigatórias ----
for (const ref of OPERATIONAL_REFS) {
  ok(`recusa operacional direto ${ref.slice(0, 5)}…`, !evaluateTarget(direct(ref), { env: { ...OK_ENV, HOMOLOG_TARGET_REF: ref } }).ok);
  ok(`recusa operacional via pooler ${ref.slice(0, 5)}…`, !evaluateTarget(`postgresql://postgres.${ref}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`, { env: { ...OK_ENV, HOMOLOG_TARGET_REF: ref } }).ok);
}
ok("recusa ref operacional escondido na senha", !evaluateTarget(direct(FAKE_REF, OPERATIONAL_REFS[0]), { env: OK_ENV }).ok);
ok("recusa host desconhecido", !evaluateTarget("postgresql://u:p@exemplo.com:5432/postgres", { env: OK_ENV }).ok);
ok("recusa host parecido (sufixo malicioso)", !evaluateTarget(`postgresql://u:p@db.${FAKE_REF}.supabase.co.evil.com:5432/postgres`, { env: OK_ENV }).ok);
ok("recusa host RDS/aws qualquer", !evaluateTarget("postgresql://u:p@x.rds.amazonaws.com:5432/postgres", { env: OK_ENV }).ok);
ok("recusa sem HOMOLOG_TARGET_REF", !evaluateTarget(direct(FAKE_REF), { env: { HOMOLOG_I_UNDERSTAND_ISOLATED: "true" } }).ok);
ok("recusa TARGET_REF diferente do host", !evaluateTarget(direct(FAKE_REF), { env: { ...OK_ENV, HOMOLOG_TARGET_REF: "zzzzzzzzzzzzzzzzzzzz" } }).ok);
ok("recusa sem confirmação de isolamento", !evaluateTarget(direct(FAKE_REF), { env: { HOMOLOG_TARGET_REF: FAKE_REF } }).ok);
ok("recusa se o ref coincide com NEXT_PUBLIC_SUPABASE_URL do app", !evaluateTarget(direct(FAKE_REF), { env: { ...OK_ENV, NEXT_PUBLIC_SUPABASE_URL: `https://${FAKE_REF}.supabase.co` } }).ok);
ok("recusa se o ref coincide com o vínculo da CLI", !evaluateTarget(direct(FAKE_REF), { env: OK_ENV, linkedRefText: `${FAKE_REF}\n` }).ok);
ok("recusa pooler sem usuário postgres.<ref>", !evaluateTarget(`postgresql://postgres:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`, { env: OK_ENV }).ok);
ok("recusa protocolo http", !evaluateTarget(`http://db.${FAKE_REF}.supabase.co/postgres`, { env: OK_ENV }).ok);
ok("recusa string vazia/inválida", !evaluateTarget("", { env: OK_ENV }).ok && !evaluateTarget("nao-e-url", { env: OK_ENV }).ok);
ok("recusa local em porta errada (54322 do Supabase de dev)", !evaluateTarget("postgres://postgres:x@127.0.0.1:54322/acc_homolog_x", { env: OK_ENV }).ok);
ok("recusa local no banco postgres (não descartável)", !evaluateTarget("postgres://postgres:x@127.0.0.1:55434/postgres", { env: OK_ENV }).ok);
ok("recusa local com banco sem prefixo", !evaluateTarget("postgres://postgres:x@127.0.0.1:55434/meubanco", { env: OK_ENV }).ok);

// ---- aceitações ----
const l = evaluateTarget("postgres://postgres:x@127.0.0.1:55434/acc_homolog_t1", { env: {} });
ok("aceita local descartável 55434/acc_homolog_*", l.ok && l.kind === "local");
const r = evaluateTarget(direct(FAKE_REF), { env: OK_ENV });
ok("aceita remoto isolado confirmado (direto)", r.ok && r.kind === "remote" && r.ref === FAKE_REF);
const p = evaluateTarget(`postgresql://postgres.${FAKE_REF}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`, { env: OK_ENV });
ok("aceita remoto isolado confirmado (pooler)", p.ok && p.ref === FAKE_REF);
ok("mensagens de recusa não vazam a senha", (() => { const e = evaluateTarget(direct(OPERATIONAL_REFS[0], "SENHA-SECRETA"), { env: OK_ENV }); return !e.ok && !String(e.reason).includes("SENHA-SECRETA"); })());

// ---- ambiente proibido ----
const names = forbiddenEnvNames({ SUPABASE_SECRET_KEY: "x", NEXT_PUBLIC_SUPABASE_URL: "x", GOOGLE_GMAIL_CLIENT_ID: "x", HOMOLOG_TARGET_REF: "ok", PATH: "p" });
ok("detecta variáveis operacionais no ambiente", names.length === 3 && !names.includes("HOMOLOG_TARGET_REF"));

// ---- parser de contas do seed ----
const a = parseAccounts("P-ADM=Adm@axion.com.br; P-GES=ges@axion.com.br;P-ADM2=adm2@axion.com.br");
ok("parser normaliza e mapeia papéis", a.length === 3 && a[0].email === "adm@axion.com.br" && a[0].permission === "ADMINISTRADOR" && a[2].project === "TESTE 2");
const throws = (f) => { try { f(); return false; } catch { return true; } };
ok("parser recusa domínio externo", throws(() => parseAccounts("P-ADM=fulano@gmail.com")));
ok("parser recusa código desconhecido", throws(() => parseAccounts("P-XYZ=a@axion.com.br")));
ok("parser recusa e-mail repetido", throws(() => parseAccounts("P-ADM=a@axion.com.br;P-GES=a@axion.com.br")));

console.log(`\n${passed} OK / ${failed} FAIL`);
// ---- checklist de variáveis ----
const good = { NEXT_PUBLIC_SUPABASE_URL: `https://${FAKE_REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "pub", SUPABASE_SECRET_KEY: "sec", AXION_APP_BASE_URL: "https://h.example.com" };
ok("env coerente passa", checkEnvMap(good, { targetRef: FAKE_REF }).ok);
ok("env recusa URL operacional", !checkEnvMap({ ...good, NEXT_PUBLIC_SUPABASE_URL: `https://${OPERATIONAL_REFS[0]}.supabase.co` }, { targetRef: FAKE_REF }).ok);
ok("env recusa URL diferente do alvo", !checkEnvMap({ ...good, NEXT_PUBLIC_SUPABASE_URL: "https://zzzzzzzzzzzzzzzzzzzz.supabase.co" }, { targetRef: FAKE_REF }).ok);
ok("env recusa Gmail real presente", !checkEnvMap({ ...good, GOOGLE_GMAIL_REFRESH_TOKEN: "x" }, { targetRef: FAKE_REF }).ok);
ok("env recusa ACC_OUTBOUND_MODE=production", !checkEnvMap({ ...good, ACC_OUTBOUND_MODE: "production" }, { targetRef: FAKE_REF }).ok);
ok("env recusa segredo NEXT_PUBLIC", !checkEnvMap({ ...good, NEXT_PUBLIC_SUPABASE_SECRET: "x" }, { targetRef: FAKE_REF }).ok);
ok("env recusa variável faltando", !checkEnvMap({ NEXT_PUBLIC_SUPABASE_URL: good.NEXT_PUBLIC_SUPABASE_URL }, { targetRef: FAKE_REF }).ok);
ok("env: relatório não contém valores", (() => { const r = checkEnvMap({ ...good, GOOGLE_GMAIL_REFRESH_TOKEN: "VALOR-SECRETO" }, { targetRef: FAKE_REF }); return !JSON.stringify(r).includes("VALOR-SECRETO"); })());
ok("parseDotenv lê pares e ignora comentários", (() => { const m = parseDotenv(["# c", "A=1", "export B=\"2\""].join("\n")); return m.A === "1" && m.B === "2" && !("#" in m); })());

console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed ? 1 : 0);
