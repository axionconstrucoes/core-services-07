// Teste do KIT de homologação isolada em PostgreSQL 17 REAL LOCAL (127.0.0.1:55434), base descartável acc_homolog_* (apagada no fim).
// Exercita: recusa do operacional/host desconhecido (processo real), recusa sem marcador, --init-marker, --apply de TODAS as migrations,
// idempotência (2ª execução = 0 pendentes), --verify, seed de obras e perfis (membership para quem "já entrou", pré-cadastro PENDING para
// quem não entrou) e ativação do pré-cadastro pelo trigger handle_new_user quando o login acontece.
// FIXTURE: o "login" aqui é uma linha em auth.users inserida pelo teste (simula SOMENTE o efeito do GoTrue no banco; não é login real).
// NÃO roda no CI.  Sem ACC_REALPG_URL é PULADO (exit 0).
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.ACC_REALPG_URL;
if (!url) { console.log("PULADO: defina ACC_REALPG_URL e ACC_REALPG_PKG_DIR (PostgreSQL real local). Este teste não roda no CI."); process.exit(0); }
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") { console.error("RECUSADO: só aceito 127.0.0.1:55434."); process.exit(2); }

const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dbName = `acc_homolog_t${Date.now().toString(36)}`;
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();

let passed = 0, failed = 0;
const ok = (name, cond, extra = "") => { if (cond) { passed += 1; console.log(`OK   ${name}`); } else { failed += 1; console.log(`FAIL ${name} ${extra}`); } };
const run = (script, args, env) => spawnSync(process.execPath, [path.join(here, "homolog", script), ...args], {
  env: { ...process.env, ...env }, encoding: "utf8", timeout: 600000, maxBuffer: 64 * 1024 * 1024,
});
const E = { HOMOLOG_DATABASE_URL: dbUrl };

// 1) recusas com processo real (nenhuma conexão deve ser tentada)
let r = run("apply-migrations.mjs", ["--apply"], { HOMOLOG_DATABASE_URL: "postgresql://postgres:x@db.plbcvwostmdmdmrziwmd.supabase.co:5432/postgres", HOMOLOG_TARGET_REF: "plbcvwostmdmdmrziwmd", HOMOLOG_I_UNDERSTAND_ISOLATED: "true" });
ok("apply recusa o Supabase operacional (exit 2)", r.status === 2 && /lista negra/.test(r.stderr), r.stderr);
r = run("seed-e-perfis.mjs", ["--apply"], { HOMOLOG_DATABASE_URL: "postgresql://postgres:x@exemplo.com:5432/postgres", HOMOLOG_TEST_ACCOUNTS: "P-ADM=a@axion.com.br" });
ok("seed recusa host desconhecido (exit 2)", r.status === 2 && /host desconhecido/.test(r.stderr), r.stderr);
r = run("apply-migrations.mjs", ["--apply"], { SUPABASE_SECRET_KEY: "x", ...E });
ok("apply recusa ambiente com variáveis operacionais", r.status === 2 && /variáveis do ambiente operacional/.test(r.stderr), r.stderr);
r = run("apply-migrations.mjs", [], { HOMOLOG_DATABASE_URL: "" });
ok("dry-run sem URL não conecta e sai 0", r.status === 0 && /DRY-RUN/.test(r.stdout), r.stderr);

// 2) local: banco novo, sem marcador => recusa; init-marker; apply
r = run("apply-migrations.mjs", ["--create-local-db", "--local-platform-stub", "--apply"], E);
ok("sem marcador o apply é recusado", r.status === 2 && /marcador/.test(r.stderr), r.stderr);
r = run("apply-migrations.mjs", ["--local-platform-stub", "--init-marker"], E);
ok("--init-marker em banco vazio", r.status === 0 && /Marcador/.test(r.stdout), r.stderr + r.stdout);
r = run("apply-migrations.mjs", ["--apply"], E);
ok("--apply aplica todas as migrations", r.status === 0 && /Aplicadas (\d+) migrations/.test(r.stdout), (r.stderr + r.stdout).slice(-600));
const applied = Number(/Aplicadas (\d+)/.exec(r.stdout)?.[1] ?? 0);
ok("número aplicado >= 195", applied >= 195, String(applied));
r = run("apply-migrations.mjs", ["--apply"], E);
ok("2ª execução é idempotente (0 aplicadas)", r.status === 0 && /Aplicadas 0 migrations/.test(r.stdout), r.stdout);
r = run("apply-migrations.mjs", ["--verify"], E);
const ver = (() => { try { return JSON.parse(r.stdout.split("\n").find((l) => l.startsWith("{"))); } catch { return null; } })();
ok("--verify: 0 pendentes", ver?.pendentes === 0, r.stdout);
ok("--verify: 0 tabelas public sem RLS", ver?.tabelas_public_sem_rls === 0, JSON.stringify(ver));
ok("--verify: função P0 presente", ver?.p0_funcoes === 1, JSON.stringify(ver));

// 3) seed e perfis
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
try {
  const login = async (email) => { await db.query("insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, '{}')", [email]); };
  await login("adm@axion.com.br"); // FIXTURE: efeito do 1º login Google do P-ADM (profile via trigger handle_new_user)
  const ACC = "P-ADM=adm@axion.com.br;P-GES=ges@axion.com.br;P-COL=col@axion.com.br;P-ADM2=adm2@axion.com.br;P-PEN=pen@axion.com.br";
  r = run("seed-e-perfis.mjs", [], { ...E, HOMOLOG_TEST_ACCOUNTS: ACC });
  ok("seed em dry-run não grava", r.status === 0 && /DRY-RUN/.test(r.stdout) && (await db.query("select count(*)::int c from public.projects")).rows[0].c === 0, r.stderr + r.stdout);
  r = run("seed-e-perfis.mjs", ["--apply"], { ...E, HOMOLOG_TEST_ACCOUNTS: ACC });
  ok("seed --apply cria obras e perfis", r.status === 0 && /APLICADO/.test(r.stdout), r.stderr + r.stdout);
  ok("2 obras fictícias", (await db.query("select count(*)::int c from public.projects")).rows[0].c === 2);
  ok("P-ADM tem ADMINISTRADOR ACTIVE na obra TESTE", (await db.query(
    "select 1 from public.project_memberships m join public.projects p on p.id=m.project_id join public.profiles f on f.id=m.user_id where p.code='TESTE' and f.email='adm@axion.com.br' and m.permission='ADMINISTRADOR' and m.status='ACTIVE'")).rowCount === 1);
  ok("quem não entrou fica com pré-cadastro PENDING e SEM membership", (await db.query("select count(*)::int c from public.project_member_invitations where status='PENDING'")).rows[0].c === 4
    && (await db.query("select count(*)::int c from public.project_memberships")).rows[0].c === 1);
  ok("seed não criou usuários em auth.users", (await db.query("select count(*)::int c from auth.users")).rows[0].c === 1);
  r = run("seed-e-perfis.mjs", ["--apply"], { ...E, HOMOLOG_TEST_ACCOUNTS: ACC });
  ok("seed é idempotente", r.status === 0 && (await db.query("select count(*)::int c from public.project_member_invitations")).rows[0].c === 4);
  await login("ges@axion.com.br"); // FIXTURE: 1º login Google do P-GES => trigger handle_new_user ativa o pré-cadastro
  ok("1º login ativa o pré-cadastro (trigger real) e concede GESTOR", (await db.query(
    "select m.permission, i.status from public.project_memberships m join public.profiles f on f.id=m.user_id join public.project_member_invitations i on lower(i.email)=lower(f.email) where f.email='ges@axion.com.br'")).rows.some((x) => x.permission === "GESTOR" && x.status === "ACTIVATED"));
  ok("P-PEN continua sem acesso (convite pendente)", (await db.query("select count(*)::int c from public.project_memberships m join public.profiles f on f.id=m.user_id where f.email='pen@axion.com.br'")).rows[0].c === 0);
  r = run("rollback-seed.mjs", [], E);
  ok("rollback-seed em dry-run não remove", r.status === 0 && /DRY-RUN/.test(r.stdout) && (await db.query("select count(*)::int c from public.project_member_invitations")).rows[0].c === 4, r.stderr + r.stdout);
  r = run("rollback-seed.mjs", ["--apply"], E);
  ok("rollback-seed --apply remove pré-cadastros e memberships não administrativas, mantém admin e obras", r.status === 0 && (await db.query("select count(*)::int c from public.project_member_invitations")).rows[0].c === 0 && (await db.query("select count(*)::int c from public.project_memberships")).rows[0].c === 1 && (await db.query("select count(*)::int c from public.projects")).rows[0].c === 2, r.stderr + r.stdout);
  // seed recusa e-mail não @axion.com.br
  r = run("seed-e-perfis.mjs", ["--apply"], { ...E, HOMOLOG_TEST_ACCOUNTS: "P-ADM=a@gmail.com" });
  ok("seed recusa conta fora de @axion.com.br", r.status === 2, r.stderr);
} finally {
  await db.end().catch(() => {});
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.end();
}
console.log(`\n${passed} OK / ${failed} FAIL`);
process.exit(failed ? 1 : 0);
