// Descarte de foto SSMA por HTTP REAL em /api/ssma/photos/discard, num Next isolado (`next start` de uma cópia sem .env) apontando
// para a stack local completa e DESCARTÁVEL. Tudo passa pela rota de verdade: proxy (sessão), checagem de origem, RPC de
// autorização com o JWT do cookie e remoção pela API do Storage. storage.protect_delete permanece ativo.
//
// Precisa de DOIS servidores Next da mesma build:
//   BASE_URL       — configuração normal (chave de serviço local correta);
//   FAIL_BASE_URL  — SUPABASE_SECRET_KEY inválida: a autorização (sessão do usuário) funciona, a remoção pelo Storage falha (=> 502).
//
// Segurança: container "supabase_db_acc-disposable-*"; API e servidores só em 127.0.0.1/localhost; usuários/arquivos fictícios, tudo
// removido no finally (Storage só pela API); o resíduo é conferido.
//
// Uso:
//   ACC_SSMA_HTTP_TEST_WORKDIR=<dir da stack> ACC_SSMA_HTTP_TEST_API_URL=http://127.0.0.1:57321 \
//   ACC_SSMA_HTTP_TEST_DB_CONTAINER=supabase_db_acc-disposable-full \
//   ACC_SSMA_HTTP_TEST_BASE_URL=http://localhost:3999 ACC_SSMA_HTTP_TEST_FAIL_BASE_URL=http://localhost:3998 \
//   ACC_SSMA_HTTP_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true node scripts/sql/run-ssma-photo-discard-http-test.mjs
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDisposableContainer, requireLocalApiUrl } from "./lib/disposable-target.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const container = requireDisposableContainer("ACC_SSMA_HTTP_TEST_DB_CONTAINER");
const API = requireLocalApiUrl("ACC_SSMA_HTTP_TEST_API_URL");
const BASE = requireLocalApiUrl("ACC_SSMA_HTTP_TEST_BASE_URL");
const FAIL_BASE = requireLocalApiUrl("ACC_SSMA_HTTP_TEST_FAIL_BASE_URL");
const workdir = process.env.ACC_SSMA_HTTP_TEST_WORKDIR;
if (!workdir || process.env.ACC_SSMA_HTTP_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error("Defina ACC_SSMA_HTTP_TEST_WORKDIR e ACC_SSMA_HTTP_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true.");
  process.exit(2);
}

const cli = path.join(repo, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
const status = spawnSync(`"${cli}"`, ["status", "--workdir", `"${workdir}"`, "-o", "env"], { shell: true, encoding: "utf8" });
const stackEnv = Object.fromEntries(
  status.stdout.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const [k, ...rest] = l.split("=");
    return [k, rest.join("=").replace(/^"|"$/g, "")];
  })
);
if (stackEnv.API_URL !== API) {
  console.error(`Recusado: API_URL da stack (${stackEnv.API_URL ?? "ausente"}) difere de ACC_SSMA_HTTP_TEST_API_URL.`);
  process.exit(2);
}
const ANON = stackEnv.ANON_KEY;
const SERVICE = stackEnv.SERVICE_ROLE_KEY;
const COOKIE_NAME = `sb-${new URL(API).hostname.split(".")[0]}-auth-token`;

function psql(sql) {
  const r = spawnSync("docker", ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
  return { status: r.status, out: r.stdout.trim(), err: r.stderr.trim() };
}
function psqlOk(sql) {
  const r = psql(sql);
  if (r.status !== 0) throw new Error(`psql falhou: ${r.err.slice(0, 300)}`);
  return r.out;
}

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const suffix = randomUUID().slice(0, 8);
const password = `Senha-${suffix}-Teste!1`;
const P = randomUUID();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const users = {};
let submissionId;
const created = [];

async function signupLogin(label) {
  const email = `${label}-${suffix}@exemplo.invalid`;
  const s = await fetch(`${API}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  if (!s.ok) throw new Error(`signup HTTP ${s.status}`);
  const l = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const session = await l.json();
  if (!l.ok || !session.access_token) throw new Error(`login HTTP ${l.status}`);
  // Mesmo formato de cookie do @supabase/ssr: "base64-" + JSON da sessão em base64url (cabe em um único cookie).
  const value = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  if (value.length > 3180) throw new Error("cookie de sessão precisaria de chunks");
  users[label] = { id: session.user.id, token: session.access_token, email, cookie: `${COOKIE_NAME}=${value}` };
}
const objectPath = (name) => `${P}/ssma/${submissionId}/${name}`;
const upload = (label, p) => fetch(`${API}/storage/v1/object/project-documents/${p}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${users[label].token}`, "content-type": "image/png", "x-upsert": "false" }, body: png });
const exists = (p) => psqlOk(`select count(*) from storage.objects where bucket_id='project-documents' and name='${p}'`) === "1";
const download = (label, p) => fetch(`${API}/storage/v1/object/authenticated/project-documents/${p}`, { headers: { apikey: ANON, authorization: `Bearer ${users[label].token}` } });

/** POST real à rota. `cookie` null = sem sessão. Redirecionamentos NÃO são seguidos (o proxy redireciona quem não tem sessão). */
async function discard(base, { cookie, body, headers = {}, raw }) {
  const res = await fetch(`${base}/api/ssma/photos/discard`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
    body: raw ?? JSON.stringify(body),
  });
  let json = null;
  try { json = await res.clone().json(); } catch { /* corpo não JSON (redirect/HTML) */ }
  return { status: res.status, json, location: res.headers.get("location") };
}
const sameOrigin = (base) => ({ origin: base });

console.log("\n======================================");
console.log(`DESCARTE SSMA POR HTTP REAL — Next isolado (${BASE}) + stack (${container})`);
console.log("======================================\n");

try {
  await check("servidores Next respondem e a rota existe (proxy exige sessão)", async () => {
    for (const base of [BASE, FAIL_BASE]) {
      const res = await fetch(`${base}/login`);
      assert(res.ok, `${base}/login HTTP ${res.status}`);
    }
  });

  await check("fixtures: usuários A e B reais (Auth), obra com os dois, envio SSMA em UPLOADING do técnico A", async () => {
    await signupLogin("ana");
    await signupLogin("bruno");
    psqlOk(`
      insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ('${P}', 'TST-${suffix}-HTTP', 'Obra Fictícia descarte HTTP', 'Cliente F', 'Local', '2027-01-01', '2027-12-31');
      insert into public.project_memberships (project_id, user_id, permission, status) values ('${P}', '${users.ana.id}', 'COLABORADOR', 'ACTIVE'), ('${P}', '${users.bruno.id}', 'COLABORADOR', 'ACTIVE');
    `);
    const res = await fetch(`${API}/rest/v1/rpc/create_ssma_form_submission`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${users.ana.token}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_project_id: P, p_checklist_slug: "dda", p_checklist_number: 1, p_checklist_title: "DDA",
        p_drive_folder_name: "01 - DIÁLOGO DIÁRIO DE SEGURANÇA - DDA (FOTOS)", p_occurred_at: new Date().toISOString(),
        p_field_values: {}, p_checklist_values: { "DDA realizado": "FEITO", "Registro dos participantes": "FEITO" }, p_risk_level: null,
      }),
    });
    if (!res.ok) throw new Error(`create_ssma_form_submission HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    submissionId = await res.json();
  });

  const orphan = () => objectPath(`${randomUUID()}-orfa.png`);
  const put = async (label, p) => {
    const up = await upload(label, p);
    if (!up.ok) throw new Error(`upload HTTP ${up.status} ${(await up.text()).slice(0, 120)}`);
    created.push(p);
  };

  await check("storage.protect_delete ATIVO antes dos testes; DELETE direto em storage.objects recusado", async () => {
    assert(psqlOk(`select t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and t.tgname='protect_objects_delete'`) === "O", "gatilho inativo");
    assert(psqlOk(`select coalesce(current_setting('storage.allow_delete_query', true), '')`) === "", "allow_delete_query definido");
    const probe = orphan();
    await put("ana", probe);
    const del = psql(`delete from storage.objects where bucket_id='project-documents' and name='${probe}'`);
    assert(del.status !== 0 && /Direct deletion from storage tables is not allowed/.test(del.err), `DELETE direto deveria ser recusado: ${del.err.slice(0, 100)}`);
    assert(exists(probe), "objeto da sonda sumiu");
  });

  await check("A (autorizada, mesma origem) remove a PRÓPRIA foto não registrada: 200, objeto some do bucket e do download", async () => {
    const p = orphan();
    await put("ana", p);
    assert(exists(p), "objeto deveria existir");
    const r = await discard(BASE, { cookie: users.ana.cookie, headers: sameOrigin(BASE), body: { submissionId, storagePath: p } });
    assert(r.status === 200 && r.json?.discarded === true, `resposta: ${r.status} ${JSON.stringify(r.json)}`);
    assert(!exists(p), "objeto ainda existe após o descarte");
    const dl = await download("ana", p);
    assert(!dl.ok, `download deveria falhar (HTTP ${dl.status})`);
  });

  const registeredId = randomUUID();
  const registered = () => objectPath(`${registeredId}-registrada.png`);
  await check("foto REGISTRADA é preservada: 403 e o arquivo permanece (bucket e download)", async () => {
    const p = registered();
    await put("ana", p);
    const reg = await fetch(`${API}/rest/v1/rpc/register_ssma_submission_photo`, {
      method: "POST",
      headers: { apikey: ANON, authorization: `Bearer ${users.ana.token}`, "content-type": "application/json" },
      body: JSON.stringify({ p_photo_id: registeredId, p_submission_id: submissionId, p_action_label: "Foto antes", p_storage_path: p, p_original_file_name: "registrada.png", p_mime_type: "image/png", p_file_size_bytes: png.length, p_sha256_hash: "a".repeat(64) }),
    });
    if (!reg.ok) throw new Error(`register HTTP ${reg.status} ${(await reg.text()).slice(0, 160)}`);
    const r = await discard(BASE, { cookie: users.ana.cookie, headers: sameOrigin(BASE), body: { submissionId, storagePath: p } });
    assert(r.status === 403 && r.json?.discarded === false, `resposta: ${r.status} ${JSON.stringify(r.json)}`);
    assert(exists(p), "foto registrada foi removida");
    assert((await download("ana", p)).ok, "foto registrada não baixa mais");
  });

  const victim = orphan();
  await check("outro usuário (B, membro da mesma obra) é recusado e o arquivo de A permanece", async () => {
    await put("ana", victim);
    const r = await discard(BASE, { cookie: users.bruno.cookie, headers: sameOrigin(BASE), body: { submissionId, storagePath: victim } });
    assert(r.status === 403 && r.json?.discarded === false, `resposta: ${r.status} ${JSON.stringify(r.json)}`);
    assert(exists(victim), "arquivo de A foi removido por B");
  });

  await check("sem sessão: recusado pelo proxy (redireciona ao login, não executa) e o arquivo permanece", async () => {
    const r = await discard(BASE, { cookie: null, headers: sameOrigin(BASE), body: { submissionId, storagePath: victim } });
    assert(r.status !== 200 && r.status < 500, `status inesperado: ${r.status}`);
    assert(r.status === 307 || r.status === 308 || r.status === 401 || r.status === 403, `status: ${r.status}`);
    if (r.status === 307 || r.status === 308) assert(/\/login/.test(r.location ?? ""), `redirecionamento para: ${r.location}`);
    assert(exists(victim), "arquivo removido sem sessão");
  });

  await check("sessão inválida (cookie adulterado) também é recusada", async () => {
    const r = await discard(BASE, { cookie: `${COOKIE_NAME}=base64-${Buffer.from("{\"access_token\":\"x\"}").toString("base64url")}`, headers: sameOrigin(BASE), body: { submissionId, storagePath: victim } });
    assert(r.status !== 200 && r.status < 500, `status: ${r.status} ${JSON.stringify(r.json)}`);
    assert(exists(victim), "arquivo removido com sessão inválida");
  });

  await check("origem indevida (Origin de outro site, ou Sec-Fetch-Site cross-site) é recusada com 403 mesmo com a sessão de A", async () => {
    for (const headers of [{ origin: "https://evil.example" }, { origin: "http://localhost:1" }, { "sec-fetch-site": "cross-site" }, { origin: "null" }]) {
      const r = await discard(BASE, { cookie: users.ana.cookie, headers, body: { submissionId, storagePath: victim } });
      assert(r.status === 403 && /Origem/.test(r.json?.error ?? ""), `${JSON.stringify(headers)} => ${r.status} ${JSON.stringify(r.json)}`);
      assert(exists(victim), `arquivo removido com ${JSON.stringify(headers)}`);
    }
  });

  await check("entrada inválida (JSON quebrado, id/caminho inválidos): 400 e nada é removido", async () => {
    const bad = [
      { raw: "{nao-e-json" },
      { body: { submissionId: "x", storagePath: victim } },
      { body: { submissionId, storagePath: `${P}/ssma/${submissionId}/../outra/x.png` } },
      { body: { submissionId } },
    ];
    for (const b of bad) {
      const r = await discard(BASE, { cookie: users.ana.cookie, headers: sameOrigin(BASE), ...b });
      assert(r.status === 400, `${JSON.stringify(b).slice(0, 80)} => ${r.status}`);
    }
    assert(exists(victim), "arquivo removido por entrada inválida");
  });

  await check("falha do Storage NÃO é apresentada como sucesso: a autorização passa, a remoção falha => 502, discarded:false e o arquivo permanece", async () => {
    // Mesmo pedido válido de A, mas no servidor cuja chave de serviço é inválida (o Storage recusa a remoção).
    const r = await discard(FAIL_BASE, { cookie: users.ana.cookie, headers: sameOrigin(FAIL_BASE), body: { submissionId, storagePath: victim } });
    assert(r.status === 502 && r.json?.discarded === false, `resposta: ${r.status} ${JSON.stringify(r.json)}`);
    assert(exists(victim), "arquivo foi removido apesar da falha");
    // E o servidor saudável remove o mesmo arquivo depois (prova que a falha era da chave e não do pedido).
    const ok = await discard(BASE, { cookie: users.ana.cookie, headers: sameOrigin(BASE), body: { submissionId, storagePath: victim } });
    assert(ok.status === 200 && ok.json?.discarded === true, `servidor saudável: ${ok.status} ${JSON.stringify(ok.json)}`);
    assert(!exists(victim), "arquivo deveria ter sido removido pelo servidor saudável");
  });

  await check("protect_delete continua ativo ao final e allow_delete_query nunca foi definido", async () => {
    assert(psqlOk(`select t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and t.tgname='protect_objects_delete'`) === "O", "gatilho inativo");
    assert(psqlOk(`select coalesce(current_setting('storage.allow_delete_query', true), '')`) === "", "allow_delete_query definido");
  });
} finally {
  try {
    if (created.length > 0) {
      await fetch(`${API}/storage/v1/object/project-documents`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" }, body: JSON.stringify({ prefixes: created }) });
    }
    if (submissionId) psql(`delete from public.ssma_submission_photos where submission_id='${submissionId}'; delete from public.ssma_form_submissions where id='${submissionId}';`);
    psql(`delete from public.projects where id='${P}';`);
    for (const u of Object.values(users)) {
      await fetch(`${API}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    }
    const emails = Object.values(users).map((u) => `'${u.email}'`).join(",") || "''";
    const left = psqlOk(`select (select count(*) from public.projects where id='${P}') || ',' || (select count(*) from storage.objects where name like '${P}/%') || ',' || (select count(*) from auth.users where email in (${emails}))`);
    await check("limpeza: nenhum resíduo (projeto, objetos, usuários)", async () => assert(left === "0,0,0", `resíduos: ${left}`));
  } catch (error) {
    failed += 1;
    console.log(`FAIL limpeza: ${error.message}`);
  }
}

console.log("\n======================================");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
console.log("======================================");
process.exit(failed > 0 ? 1 : 0);
