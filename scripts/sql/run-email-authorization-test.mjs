// Prova REAL (REST + sessões reais) das regras de autorização de acesso a e-mails por obra, aplicadas NO BANCO:
// quem solicita, quem decide, quem revoga, quem enxerga, isolamento entre obras, histórico imutável.
//
// SEGURANÇA DE AMBIENTE: só roda contra o stack DESCARTÁVEL local (porta e container EXATOS) e com confirmação.
//
// Uso (stack descartável "acc-disposable-clean" de pé, porta base 57320):
//   ACC_EMAILAUTH_TEST_API_URL="http://127.0.0.1:57321" \
//   ACC_EMAILAUTH_TEST_DB_CONTAINER="supabase_db_acc-disposable-clean" \
//   ACC_EMAILAUTH_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE=true \
//     node scripts/sql/run-email-authorization-test.mjs

import { spawnSync } from "node:child_process";
import { requireDisposableContainer, requireLocalApiUrl } from "./lib/disposable-target.mjs";

const EXACT_API_URL = requireLocalApiUrl("ACC_EMAILAUTH_TEST_API_URL");
const EXACT_DB_CONTAINER = requireDisposableContainer("ACC_EMAILAUTH_TEST_DB_CONTAINER");
const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

if (process.env.ACC_EMAILAUTH_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE !== "true") {
  console.error('ACC_EMAILAUTH_TEST_I_UNDERSTAND_THIS_IS_DISPOSABLE precisa ser exatamente "true".');
  process.exit(1);
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
const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

function psql(sql) {
  const r = spawnSync("docker", ["exec", "-i", EXACT_DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--quiet", "-v", "ON_ERROR_STOP=1", "-At"], {
    input: sql,
    encoding: "utf8",
  });
  return { status: r.status, out: r.stdout, err: r.stderr };
}

async function signup(email) {
  const resp = await fetch(`${EXACT_API_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  let body = await resp.json();
  if (!body.access_token) {
    const login = await fetch(`${EXACT_API_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: ANON_KEY },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    body = await login.json();
  }
  if (!body.access_token || !body.user?.id) throw new Error(`sessão falhou para ${email}: ${JSON.stringify(body).slice(0, 160)}`);
  return { id: body.user.id, token: body.access_token };
}

async function rest(method, path, token, body) {
  const resp = await fetch(`${EXACT_API_URL}/rest/v1/${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), Prefer: "return=representation" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await resp.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: resp.status, body: parsed };
}
const rpc = (fn, token, args) => rest("POST", `rpc/${fn}`, token, args);
const errText = (r) => JSON.stringify(r.body);

const PASSWORD = "Disposable-Test-Pw-2026!";
const P1 = "88888888-8888-4888-8888-888888888801";
const P2 = "88888888-8888-4888-8888-888888888802";
const VERSION = "2026-10-v1";
const SNAPSHOT = { escopo: "https://www.googleapis.com/auth/gmail.readonly", filtros: ["dominios", "palavras-chave"] };

const stamp = Date.now();
const A = await signup(`ea.admin.${stamp}@exemplo.invalid`); // admin da obra 1
const B = await signup(`ea.colab.${stamp}@exemplo.invalid`); // colaborador da obra 1 (titular da conta)
const C = await signup(`ea.outra.${stamp}@exemplo.invalid`); // colaborador só da obra 2
const D = await signup(`ea.fora.${stamp}@exemplo.invalid`); // sem nenhuma obra
const E = await signup(`ea.admin2.${stamp}@exemplo.invalid`); // admin da obra 2

const setup = psql(`
insert into public.projects (id, code, name, client, status, location, contract_number, start_date, baseline_end_date, workspace_type) values
 ('${P1}','EA-1','Obra Autorizacao 1','Cliente','ATIVO','Local','CT-1', current_date, current_date + 100,'OBRA'),
 ('${P2}','EA-2','Obra Autorizacao 2','Cliente','ATIVO','Local','CT-2', current_date, current_date + 100,'OBRA')
 on conflict (id) do nothing;
insert into public.project_memberships (project_id, user_id, permission, status, area) values
 ('${P1}','${A.id}','ADMINISTRADOR','ACTIVE','DIRETORIA'),
 ('${P1}','${B.id}','COLABORADOR','ACTIVE','ENGENHARIA'),
 ('${P2}','${C.id}','COLABORADOR','ACTIVE','ENGENHARIA'),
 ('${P2}','${E.id}','ADMINISTRADOR','ACTIVE','DIRETORIA')
 on conflict do nothing;
insert into public.email_accounts (email_address, display_name, status) values ('colab.${stamp}@axion.com.br','Colaborador Teste','CONNECTED') on conflict do nothing;
`);
if (setup.status !== 0) throw new Error(`setup falhou: ${setup.err}`);

const ACCOUNT = `colab.${stamp}@axion.com.br`;
let authId = null;

await check("anônimo não executa nenhuma função", async () => {
  for (const [fn, args] of [
    ["request_email_access_authorization", { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT }],
    ["decide_email_access_authorization", { p_id: P1, p_decision: "AUTORIZADO", p_notice_version: VERSION }],
    ["revoke_email_access_authorization", { p_id: P1 }],
  ]) {
    const r = await rpc(fn, null, args);
    ok(r.status >= 400, `${fn}: status ${r.status}`);
  }
});

await check("colaborador (não administrador) NÃO solicita autorização", async () => {
  const r = await rpc("request_email_access_authorization", B.token, { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status >= 400 && errText(r).includes("PERMISSION_DENIED"), errText(r));
});

await check("administrador de OUTRA obra NÃO solicita para esta obra (isolamento)", async () => {
  const r = await rpc("request_email_access_authorization", E.token, { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status >= 400 && errText(r).includes("PERMISSION_DENIED"), errText(r));
});

await check("administrador não solicita para quem não é membro da obra", async () => {
  const r = await rpc("request_email_access_authorization", A.token, { p_project_id: P1, p_user_id: C.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status >= 400 && errText(r).includes("USER_NOT_PROJECT_MEMBER"), errText(r));
});

await check("conta fora de @axion.com.br é recusada", async () => {
  const r = await rpc("request_email_access_authorization", A.token, { p_project_id: P1, p_user_id: B.id, p_account_email: "alguem@gmail.com", p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status >= 400 && errText(r).includes("INVALID_ACCOUNT"), errText(r));
});

await check("administrador da obra solicita; fica PENDENTE com versão e escopo", async () => {
  const r = await rpc("request_email_access_authorization", A.token, { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT.toUpperCase(), p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status === 200 && typeof r.body === "string", errText(r));
  authId = r.body;
  const row = await rest("GET", `email_access_authorizations?id=eq.${authId}&select=status,notice_version,scope_snapshot,account_email,email_account_id`, A.token);
  ok(row.body[0]?.status === "PENDENTE" && row.body[0].notice_version === VERSION && row.body[0].scope_snapshot.escopo === SNAPSHOT.escopo, errText(row));
  ok(row.body[0].account_email === ACCOUNT && row.body[0].email_account_id, "conta normalizada e vinculada ao registro da conta");
});

await check("solicitação duplicada em aberto é recusada", async () => {
  const r = await rpc("request_email_access_authorization", A.token, { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status >= 400 && errText(r).includes("ALREADY_OPEN"), errText(r));
});

await check("visibilidade: só o titular e o administrador da obra enxergam; demais não", async () => {
  const q = `email_access_authorizations?id=eq.${authId}&select=id`;
  ok((await rest("GET", q, B.token)).body.length === 1, "titular deveria ver");
  ok((await rest("GET", q, A.token)).body.length === 1, "administrador deveria ver");
  ok((await rest("GET", q, C.token)).body.length === 0, "colaborador da outra obra não deveria ver");
  ok((await rest("GET", q, D.token)).body.length === 0, "sem obra não deveria ver");
  ok((await rest("GET", q, E.token)).body.length === 0, "administrador de outra obra não deveria ver");
  ok((await rest("GET", q, null)).status >= 400 || (await rest("GET", q, null)).body.length === 0, "anônimo não deveria ver");
});

await check("escrita direta nas tabelas é negada para todos", async () => {
  for (const who of [A, B, E]) {
    const patch = await rest("PATCH", `email_access_authorizations?id=eq.${authId}`, who.token, { status: "AUTORIZADO" });
    ok(patch.status >= 400 || (Array.isArray(patch.body) && patch.body.length === 0), `PATCH permitido? ${patch.status} ${errText(patch)}`);
    const ins = await rest("POST", "email_access_authorization_events", who.token, { authorization_id: authId, event_type: "AUTORIZADA", notice_version: VERSION, scope_snapshot: SNAPSHOT });
    ok(ins.status >= 400, `INSERT de evento permitido: ${ins.status}`);
  }
  const still = psql(`select status from public.email_access_authorizations where id = '${authId}';`);
  ok(still.out.trim() === "PENDENTE", `status mudou: ${still.out}`);
});

await check("o administrador NÃO decide pelo colaborador", async () => {
  const r = await rpc("decide_email_access_authorization", A.token, { p_id: authId, p_decision: "AUTORIZADO", p_notice_version: VERSION });
  ok(r.status >= 400 && errText(r).includes("NOT_FOUND"), errText(r));
});

await check("versão de texto diferente da apresentada é recusada", async () => {
  const r = await rpc("decide_email_access_authorization", B.token, { p_id: authId, p_decision: "AUTORIZADO", p_notice_version: "outra-versao" });
  ok(r.status >= 400 && errText(r).includes("NOTICE_VERSION_MISMATCH"), errText(r));
});

await check("decisão inválida é recusada", async () => {
  const r = await rpc("decide_email_access_authorization", B.token, { p_id: authId, p_decision: "TALVEZ", p_notice_version: VERSION });
  ok(r.status >= 400 && errText(r).includes("INVALID_DECISION"), errText(r));
});

await check("o colaborador autoriza (ação explícita): status, data, versão e eventos registrados", async () => {
  const r = await rpc("decide_email_access_authorization", B.token, { p_id: authId, p_decision: "AUTORIZADO", p_notice_version: VERSION });
  ok(r.status === 200 && r.body === "AUTORIZADO", errText(r));
  const row = await rest("GET", `email_access_authorizations?id=eq.${authId}&select=status,decided_at,decided_by_user_id,notice_version`, B.token);
  ok(row.body[0].status === "AUTORIZADO" && row.body[0].decided_at && row.body[0].decided_by_user_id === B.id, errText(row));
  const ev = await rest("GET", `email_access_authorization_events?authorization_id=eq.${authId}&select=event_type,actor_user_id,notice_version,scope_snapshot&order=occurred_at`, A.token);
  ok(ev.body.map((e) => e.event_type).join(",") === "SOLICITADA,AUTORIZADA", errText(ev));
  ok(ev.body[1].actor_user_id === B.id && ev.body[1].notice_version === VERSION && ev.body[1].scope_snapshot.escopo === SNAPSHOT.escopo, "evento sem autor/versão/escopo");
});

await check("segunda decisão sobre a mesma solicitação é recusada", async () => {
  const r = await rpc("decide_email_access_authorization", B.token, { p_id: authId, p_decision: "RECUSADO", p_notice_version: VERSION });
  ok(r.status >= 400 && errText(r).includes("ALREADY_DECIDED"), errText(r));
});

await check("histórico: titular e administrador leem; outros não", async () => {
  const q = `email_access_authorization_events?authorization_id=eq.${authId}&select=id`;
  ok((await rest("GET", q, B.token)).body.length === 2, "titular");
  ok((await rest("GET", q, A.token)).body.length === 2, "administrador");
  ok((await rest("GET", q, C.token)).body.length === 0, "outra obra");
  ok((await rest("GET", q, E.token)).body.length === 0, "admin de outra obra");
});

await check("quem não é titular nem administrador da obra não revoga", async () => {
  for (const who of [C, D, E]) {
    const r = await rpc("revoke_email_access_authorization", who.token, { p_id: authId });
    ok(r.status >= 400 && errText(r).includes("NOT_FOUND"), errText(r));
  }
});

await check("o titular revoga; vira REVOGADO e o histórico é preservado", async () => {
  const r = await rpc("revoke_email_access_authorization", B.token, { p_id: authId, p_note: "Não quero mais" });
  ok(r.status === 200 && r.body === "REVOGADO", errText(r));
  const ev = await rest("GET", `email_access_authorization_events?authorization_id=eq.${authId}&select=event_type,note&order=occurred_at`, A.token);
  ok(ev.body.map((e) => e.event_type).join(",") === "SOLICITADA,AUTORIZADA,REVOGADA" && ev.body[2].note === "Não quero mais", errText(ev));
});

await check("revogar de novo é recusado", async () => {
  const r = await rpc("revoke_email_access_authorization", B.token, { p_id: authId });
  ok(r.status >= 400 && errText(r).includes("NOT_REVOCABLE"), errText(r));
});

await check("histórico é imutável (UPDATE e DELETE de evento falham até para o dono do banco)", async () => {
  const u = psql(`update public.email_access_authorization_events set note = 'x' where authorization_id = '${authId}';`);
  ok(u.status !== 0 && u.err.includes("EVENTOS_IMUTAVEIS"), `UPDATE: ${u.err}`);
  const d = psql(`delete from public.email_access_authorization_events where authorization_id = '${authId}';`);
  ok(d.status !== 0 && d.err.includes("EVENTOS_IMUTAVEIS"), `DELETE: ${d.err}`);
  ok(psql(`select count(*) from public.email_access_authorization_events where authorization_id = '${authId}';`).out.trim() === "3", "eventos mudaram");
});

let secondId = null;
await check("após revogar, nova solicitação é possível; o colaborador RECUSA (recusa registrada)", async () => {
  const r = await rpc("request_email_access_authorization", A.token, { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status === 200, errText(r));
  secondId = r.body;
  const d = await rpc("decide_email_access_authorization", B.token, { p_id: secondId, p_decision: "RECUSADO", p_notice_version: VERSION });
  ok(d.status === 200 && d.body === "RECUSADO", errText(d));
  const rev = await rpc("revoke_email_access_authorization", B.token, { p_id: secondId });
  ok(rev.status >= 400 && errText(rev).includes("NOT_REVOCABLE"), "recusa não pode ser revogada");
});

await check("pendente: o colaborador não 'revoga' (ele recusa); o administrador cancela", async () => {
  const r = await rpc("request_email_access_authorization", A.token, { p_project_id: P1, p_user_id: B.id, p_account_email: ACCOUNT, p_notice_version: VERSION, p_scope_snapshot: SNAPSHOT });
  ok(r.status === 200, errText(r));
  const byUser = await rpc("revoke_email_access_authorization", B.token, { p_id: r.body });
  ok(byUser.status >= 400 && errText(byUser).includes("NOT_REVOCABLE"), errText(byUser));
  const byAdmin = await rpc("revoke_email_access_authorization", A.token, { p_id: r.body, p_note: "Solicitação cancelada" });
  ok(byAdmin.status === 200, errText(byAdmin));
});

await check("a lista do administrador mostra as 3 autorizações da obra com a situação da conta; a outra obra não vê nenhuma", async () => {
  const list = await rest("GET", `email_access_authorizations?project_id=eq.${P1}&user_id=eq.${B.id}&select=status&order=requested_at`, A.token);
  ok(list.body.map((x) => x.status).join(",") === "REVOGADO,RECUSADO,REVOGADO", errText(list));
  ok((await rest("GET", `email_access_authorizations?project_id=eq.${P1}&select=id`, E.token)).body.length === 0, "isolamento falhou");
  const acc = await rest("GET", `email_accounts?email_address=eq.${ACCOUNT}&select=status`, A.token);
  ok(acc.body[0]?.status === "CONNECTED", "situação da conexão não legível");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
