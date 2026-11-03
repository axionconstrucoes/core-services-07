// Descarte FÍSICO de foto SSMA pela API do Storage, com storage.protect_delete ATIVO, numa stack Supabase local completa e
// DESCARTÁVEL (Auth + PostgREST + Storage). Exercita o código real do servidor (lib/ssma/discard-unregistered-photo.ts) com:
//   - autorização: RPC authorize_discard_unregistered_ssma_photo via PostgREST, com o JWT real do técnico;
//   - remoção: API do Storage (DELETE /storage/v1/object) com a chave de serviço LOCAL da stack, como faz o cliente admin.
// O teste NÃO desativa nem contorna storage.protect_delete (storage.allow_delete_query nunca é definido) e prova que o DELETE
// direto em storage.objects continua recusado.
//
// Segurança: container "supabase_db_acc-disposable-*" e API local 127.0.0.1 fora da faixa 54300-54399 (disposable-target);
// só usuários/arquivos fictícios; tudo o que cria é removido no finally (storage só pela API) e o resíduo é conferido.
//
// Uso:
//   ACC_SSMA_DISCARD_TEST_WORKDIR=<dir da stack> ACC_SSMA_DISCARD_TEST_API_URL=http://127.0.0.1:57321 \
//   ACC_SSMA_DISCARD_TEST_DB_CONTAINER=supabase_db_acc-disposable-full \
//   ACC_SSMA_DISCARD_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true node scripts/sql/run-ssma-photo-discard-storage-test.mjs
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireDisposableContainer, requireLocalApiUrl } from "./lib/disposable-target.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const container = requireDisposableContainer("ACC_SSMA_DISCARD_TEST_DB_CONTAINER");
const API = requireLocalApiUrl("ACC_SSMA_DISCARD_TEST_API_URL");
const workdir = process.env.ACC_SSMA_DISCARD_TEST_WORKDIR;
if (!workdir || process.env.ACC_SSMA_DISCARD_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error("Defina ACC_SSMA_DISCARD_TEST_WORKDIR e ACC_SSMA_DISCARD_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true.");
  process.exit(2);
}

register("../ts-module-resolver.mjs", import.meta.url);
const { discardUnregisteredSsmaPhoto } = await import("../../apps/web/lib/ssma/discard-unregistered-photo");

// Chaves LOCAIS da stack (nunca impressas).
const cli = path.join(repo, "node_modules", ".bin", process.platform === "win32" ? "supabase.cmd" : "supabase");
const status = spawnSync(`"${cli}"`, ["status", "--workdir", `"${workdir}"`, "-o", "env"], { shell: true, encoding: "utf8" });
const env = Object.fromEntries(
  status.stdout.split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const [k, ...rest] = l.split("=");
    return [k, rest.join("=").replace(/^"|"$/g, "")];
  })
);
if (env.API_URL !== API) {
  console.error(`Recusado: API_URL da stack (${env.API_URL ?? "ausente"}) difere de ACC_SSMA_DISCARD_TEST_API_URL.`);
  process.exit(2);
}
const ANON = env.ANON_KEY;
const SERVICE = env.SERVICE_ROLE_KEY;

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
const emailA = `ana-${suffix}@exemplo.invalid`;
const emailB = `bruno-${suffix}@exemplo.invalid`;
const P = randomUUID();
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let userA;
let userB;
let tokenA;
let tokenB;
let submissionId;
const created = [];

async function signupLogin(email) {
  const s = await fetch(`${API}/auth/v1/signup`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  assert(s.ok, `signup HTTP ${s.status}`);
  const l = await fetch(`${API}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await l.json();
  assert(l.ok && body.access_token, `login HTTP ${l.status}`);
  return body;
}
const rest = (token, p, init = {}) => fetch(`${API}/rest/v1/${p}`, { ...init, headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
const objectPath = (name) => `${P}/ssma/${submissionId}/${name}`;
const upload = (token, p) => fetch(`${API}/storage/v1/object/project-documents/${p}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "image/png", "x-upsert": "false" }, body: png });
const objectExists = (p) => psqlOk(`select count(*) from storage.objects where bucket_id='project-documents' and name='${p}'`) === "1";

// Mesmas dependências que a rota de produção injeta: autorização com a sessão do técnico; remoção pela API do Storage.
const depsFor = (token) => ({
  authorize: async (sub, p) => {
    const res = await rest(token, "rpc/authorize_discard_unregistered_ssma_photo", { method: "POST", body: JSON.stringify({ p_submission_id: sub, p_storage_path: p }) });
    return res.ok ? { data: await res.json(), error: null } : { data: null, error: new Error(`HTTP ${res.status}`) };
  },
  removeObject: async (p) => {
    const res = await fetch(`${API}/storage/v1/object/project-documents`, {
      method: "DELETE",
      headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
      body: JSON.stringify({ prefixes: [p] }),
    });
    return { error: res.ok ? null : new Error(`Storage HTTP ${res.status}`) };
  },
});

console.log("\n======================================");
console.log(`DESCARTE FÍSICO DE FOTO SSMA — Storage API (${container})`);
console.log("======================================\n");

try {
  await check("fixtures: usuários reais (Auth), obra, vínculos e envio SSMA em UPLOADING criado pelo RPC", async () => {
    const a = await signupLogin(emailA);
    const b = await signupLogin(emailB);
    userA = a.user;
    userB = b.user;
    tokenA = a.access_token;
    tokenB = b.access_token;
    psqlOk(`
      insert into public.projects (id, code, name, client, location, start_date, baseline_end_date) values ('${P}', 'TST-${suffix}-DSC', 'Obra Fictícia descarte', 'Cliente F', 'Local', '2027-01-01', '2027-12-31');
      insert into public.project_memberships (project_id, user_id, permission, status) values ('${P}', '${userA.id}', 'COLABORADOR', 'ACTIVE'), ('${P}', '${userB.id}', 'COLABORADOR', 'ACTIVE');
    `);
    const res = await rest(tokenA, "rpc/create_ssma_form_submission", {
      method: "POST",
      body: JSON.stringify({
        p_project_id: P, p_checklist_slug: "dda", p_checklist_number: 1, p_checklist_title: "DDA",
        p_drive_folder_name: "01 - DIÁLOGO DIÁRIO DE SEGURANÇA - DDA (FOTOS)", p_occurred_at: new Date().toISOString(),
        p_field_values: {}, p_checklist_values: { "DDA realizado": "FEITO", "Registro dos participantes": "FEITO" }, p_risk_level: null,
      }),
    });
    if (!res.ok) throw new Error(`create_ssma_form_submission HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
    submissionId = await res.json();
    assert(/^[0-9a-f-]{36}$/.test(submissionId), "id da submissão inválido");
  });

  const orphan = () => objectPath(`${randomUUID()}-orfa.png`);
  const registeredPhoto = randomUUID();
  const registered = () => objectPath(`${registeredPhoto}-registrada.png`);
  const orphanPath = orphan();
  const foreignPath = orphan();

  await check("protect_delete está ATIVO e o DELETE direto em storage.objects é recusado (antes de qualquer descarte)", async () => {
    const trg = psqlOk(`select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and t.tgname='protect_objects_delete' and t.tgenabled='O'`);
    assert(trg === "1", `gatilho storage.protect_objects_delete ativo: ${trg}`);
    const setting = psqlOk(`select coalesce(current_setting('storage.allow_delete_query', true), '')`);
    assert(setting === "", `storage.allow_delete_query não pode estar definido (obtido "${setting}")`);
    const probe = orphan();
    const up = await upload(tokenA, probe);
    assert(up.ok, `upload de sonda HTTP ${up.status}`);
    created.push(probe);
    const del = psql(`delete from storage.objects where bucket_id='project-documents' and name='${probe}'`);
    assert(del.status !== 0 && /Direct deletion from storage tables is not allowed/.test(del.err), `DELETE direto deveria ser recusado: ${del.err.slice(0, 120)}`);
    assert(objectExists(probe), "o objeto da sonda deveria continuar existindo");
  });

  await check("foto órfã (enviada, não registrada): o servidor autoriza no banco e a API do Storage remove o arquivo", async () => {
    const up = await upload(tokenA, orphanPath);
    if (!up.ok) throw new Error(`upload HTTP ${up.status} ${(await up.text()).slice(0, 120)}`);
    created.push(orphanPath);
    assert(objectExists(orphanPath), "objeto deveria existir antes do descarte");
    const result = await discardUnregisteredSsmaPhoto({ submissionId, storagePath: orphanPath }, depsFor(tokenA));
    assert(result.status === 200 && result.body.discarded === true, `resultado: ${JSON.stringify(result)}`);
    assert(!objectExists(orphanPath), "objeto ainda existe após o descarte");
    const dl = await fetch(`${API}/storage/v1/object/authenticated/project-documents/${orphanPath}`, { headers: { apikey: ANON, authorization: `Bearer ${tokenA}` } });
    assert(!dl.ok, `download deveria falhar após o descarte (HTTP ${dl.status})`);
  });

  await check("foto REGISTRADA nunca é removida: autorização recusa e o arquivo permanece", async () => {
    const p = registered();
    const up = await upload(tokenA, p);
    assert(up.ok, `upload HTTP ${up.status}`);
    created.push(p);
    const reg = await rest(tokenA, "rpc/register_ssma_submission_photo", {
      method: "POST",
      body: JSON.stringify({ p_photo_id: registeredPhoto, p_submission_id: submissionId, p_action_label: "Foto antes", p_storage_path: p, p_original_file_name: "registrada.png", p_mime_type: "image/png", p_file_size_bytes: png.length, p_sha256_hash: "a".repeat(64) }),
    });
    if (!reg.ok) throw new Error(`register HTTP ${reg.status} ${(await reg.text()).slice(0, 160)}`);
    const result = await discardUnregisteredSsmaPhoto({ submissionId, storagePath: p }, depsFor(tokenA));
    assert(result.status === 403 && result.body.discarded === false, `resultado: ${JSON.stringify(result)}`);
    assert(objectExists(p), "foto registrada foi removida");
  });

  await check("outro membro da obra não consegue descartar o arquivo do envio alheio; objeto inexistente também é recusado", async () => {
    const up = await upload(tokenA, foreignPath);
    assert(up.ok, `upload HTTP ${up.status}`);
    created.push(foreignPath);
    const byB = await discardUnregisteredSsmaPhoto({ submissionId, storagePath: foreignPath }, depsFor(tokenB));
    assert(byB.status === 403, `B: ${JSON.stringify(byB)}`);
    assert(objectExists(foreignPath), "arquivo de A foi removido por B");
    const ghost = await discardUnregisteredSsmaPhoto({ submissionId, storagePath: objectPath(`${randomUUID()}-fantasma.png`) }, depsFor(tokenA));
    assert(ghost.status === 403, `fantasma: ${JSON.stringify(ghost)}`);
  });

  await check("falha da API do Storage vira 502 (nada é afirmado como descartado) e o arquivo continua", async () => {
    const result = await discardUnregisteredSsmaPhoto(
      { submissionId, storagePath: foreignPath },
      { ...depsFor(tokenA), removeObject: async () => ({ error: new Error("indisponível") }) }
    );
    assert(result.status === 502 && result.body.discarded === false, JSON.stringify(result));
    assert(objectExists(foreignPath), "arquivo não deveria ter sido removido");
  });

  await check("protect_delete continua ativo ao final e allow_delete_query nunca foi definido", async () => {
    const trg = psqlOk(`select t.tgenabled from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and c.relname='objects' and t.tgname='protect_objects_delete'`);
    assert(trg === "O", `estado do gatilho: ${trg}`);
    assert(psqlOk(`select coalesce(current_setting('storage.allow_delete_query', true), '')`) === "", "allow_delete_query definido");
  });
} finally {
  // Limpeza: só o que este script criou. Storage apenas pela API (o banco recusa DELETE direto).
  try {
    if (created.length > 0) {
      await fetch(`${API}/storage/v1/object/project-documents`, {
        method: "DELETE",
        headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}`, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: created }),
      });
    }
    if (submissionId) psql(`delete from public.ssma_submission_photos where submission_id='${submissionId}'; delete from public.ssma_form_submissions where id='${submissionId}';`);
    psql(`delete from public.projects where id='${P}';`);
    for (const u of [userA, userB]) {
      if (u?.id) await fetch(`${API}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: { apikey: SERVICE, authorization: `Bearer ${SERVICE}` } });
    }
    const left = psqlOk(
      `select (select count(*) from public.projects where id='${P}') || ',' || (select count(*) from storage.objects where name like '${P}/%') || ',' || (select count(*) from auth.users where email in ('${emailA}','${emailB}'))`
    );
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
