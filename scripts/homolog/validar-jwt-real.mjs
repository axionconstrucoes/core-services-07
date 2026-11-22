// Valida Auth, RLS, JWT e gravacoes diretas pelos mecanismos REAIS do Supabase (GoTrue + PostgREST + Storage) SOMENTE no acc-homolog.
// Host fixo (gtadbeaevxglrqkhcwfz). A API usa SO a chave publicavel (HOMOLOG_PUBLISHABLE_KEY, publica) e os JWTs dos usuarios temporarios.
// Usuarios temporarios [JWT-TESTE] (+1 vinculo) sao criados/removidos pela conexao GUARDADA ao banco (openGuardedTarget: ref != operacional,
// marcador acc_homolog_marker). NUNCA imprime chave, token ou senha.
// Uso: executar-homolog.ps1 -Etapa jwt -Publicavel <chave publicavel> -Extra "--fase=antes|congelado|depois"
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { openGuardedTarget } from "./connect.mjs";

const REF = "gtadbeaevxglrqkhcwfz";
const BASE = `https://${REF}.supabase.co`;
const OBRA_TESTE = "723b7467-24e9-4401-80d3-3dbc6ee4d57e";
const OBRA_TESTE2 = "57463482-85bc-4474-8186-c4de5540f931";
const SENTINELA = "00000000-0000-4000-8000-000000000001";
const fase = (process.argv.find((a) => a.startsWith("--fase=")) ?? "--fase=antes").slice(7);
const PUB = process.env.HOMOLOG_PUBLISHABLE_KEY;
if (!PUB) { console.error("RECUSADO: falta HOMOLOG_PUBLISHABLE_KEY (use executar-homolog.ps1 -Etapa jwt -Publicavel <chave>)"); process.exit(2); }
if (process.env.HOMOLOG_TARGET_REF !== REF) { console.error("RECUSADO: HOMOLOG_TARGET_REF diferente do acc-homolog"); process.exit(2); }

const redigir = (t) => String(t).split(PUB).join("***");
let ok = 0, falha = 0;
function check(nome, cond, detalhe = "") {
  if (cond) ok += 1; else falha += 1;
  console.log(`${cond ? "OK  " : "FAIL"} [${fase}] ${nome}${detalhe ? ` | ${redigir(detalhe).slice(0, 260)}` : ""}`);
}
// HTTP via curl.exe: o fetch/undici do Node desta maquina nao alcanca o host da API (ECONNRESET/CONNECT_TIMEOUT) enquanto o curl alcanca.
// Chave publicavel nova (sb_publishable_) nao e JWT: vai so em `apikey`; o JWT do usuario vai em Authorization.
async function http(method, pathq, { jwt = null, body, headers = {}, raw = false } = {}) {
  const h = { apikey: PUB, ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...headers };
  if (body !== undefined && !raw) h["Content-Type"] = "application/json";
  const args = ["-sS", "--max-time", "40", "-X", method, "-w", "\n%{http_code}"];
  for (const [k, v] of Object.entries(h)) args.push("-H", `${k}: ${v}`);
  const input = body === undefined ? undefined : raw ? body : JSON.stringify(body);
  if (input !== undefined) args.push("--data-binary", "@-");
  args.push(`${BASE}${pathq}`);
  let out = "";
  for (let tentativa = 1; ; tentativa += 1) {
    const r = spawnSync("curl", args, { input, encoding: "utf8" });
    if (r.status === 0) { out = r.stdout; break; }
    // so repete falha de CONEXAO do curl (6 DNS, 7 conexao, 28 timeout, 35/56 TLS/reset): a requisicao nao foi respondida
    if (tentativa >= 3 || ![6, 7, 28, 35, 52, 56].includes(r.status)) throw new Error(`rede: curl exit ${r.status} ${redigir(r.stderr ?? "").slice(0, 120)}`);
  }
  const k = out.lastIndexOf("\n");
  const t = out.slice(0, k);
  const status = Number(out.slice(k + 1));
  let j = null; try { j = JSON.parse(t); } catch { /* texto */ }
  return { status, json: j, text: t };
}
const msgErro = (r) => `${r.status} ${r.json?.code ?? ""} ${r.json?.message ?? r.json?.error ?? r.text}`.trim();
const congelado = (r) => /ACC_JANELA_CONGELAMENTO/.test(JSON.stringify(r.json ?? r.text));
const jwtPayload = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

const { db } = await openGuardedTarget({ requireMarker: true });
const criados = [];
async function novoUsuario(rotulo) {
  const email = `jwt-teste-${rotulo}@homolog.invalid`;
  const senha = `Hm!${randomBytes(12).toString("base64url")}`;
  const ex = await db.query("select id from auth.users where email = $1", [email]);
  let id;
  if (ex.rowCount) {
    id = ex.rows[0].id;
    await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = $1", [id, senha]);
  } else {
    const r = await db.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change, email_change_token_new)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb, now(), now(), '', '', '', '') returning id`,
      [email, senha, JSON.stringify({ name: `[JWT-TESTE] ${rotulo}` })]);
    id = r.rows[0].id;
  }
  criados.push(id);
  const s = await http("POST", "/auth/v1/token?grant_type=password", { body: { email, password: senha } });
  if (s.status !== 200) throw new Error(`login ${rotulo}: ${msgErro(s)}`);
  return { id, token: s.json.access_token, refresh: s.json.refresh_token, email, senha };
}
const contaNcr = async () => Number((await db.query("select count(*) n from public.quality_ncrs")).rows[0].n);

try {
  const h = await http("GET", "/auth/v1/health");
  check("alvo: Auth do host do acc-homolog responde", h.status === 200, `status ${h.status}`);

  const u1 = await novoUsuario("membro");
  const u2 = await novoUsuario("sem-vinculo");
  const v = await db.query("insert into public.project_memberships (project_id, user_id, permission, status) values ($1,$2,'GESTOR','ACTIVE')", [OBRA_TESTE, u1.id]);
  check("preparo: vinculo temporario GESTOR criado (conexao guardada, dono do banco)", v.rowCount === 1);

  // JWT real
  const p = jwtPayload(u1.token);
  check("JWT real: role=authenticated, aud=authenticated, sub=usuario, emissor do acc-homolog", p.role === "authenticated" && p.aud === "authenticated" && p.sub === u1.id && String(p.iss).includes(REF), `role=${p.role} aud=${p.aud} iss_ref=${String(p.iss).includes(REF)}`);
  check("JWT real: validade de ate 1 h", p.exp - p.iat <= 3600, `${p.exp - p.iat}s`);

  // RLS / leitura
  const anonProj = await http("GET", "/rest/v1/projects?select=id");
  check("RLS anon: nenhuma obra visivel sem login", anonProj.status === 401 || (anonProj.status === 200 && Array.isArray(anonProj.json) && anonProj.json.length === 0), msgErro(anonProj));
  const u1Proj = await http("GET", "/rest/v1/projects?select=id", { jwt: u1.token });
  const ids1 = (u1Proj.json ?? []).map((x) => x.id);
  check("RLS membro: ve a obra TESTE, nao ve TESTE 2 nem a sentinela", u1Proj.status === 200 && ids1.includes(OBRA_TESTE) && !ids1.includes(OBRA_TESTE2) && !ids1.includes(SENTINELA), `obras visiveis=${ids1.length}`);
  const u2Proj = await http("GET", "/rest/v1/projects?select=id", { jwt: u2.token });
  check("RLS sem vinculo: nenhuma obra visivel (isolamento por obra)", u2Proj.status === 200 && (u2Proj.json ?? []).length === 0, msgErro(u2Proj));
  const u1Ncr = await http("GET", "/rest/v1/quality_ncrs?select=id&limit=5", { jwt: u1.token });
  check("RLS membro: leitura de dado de negocio da propria obra funciona", u1Ncr.status === 200 && (u1Ncr.json ?? []).length >= 1, msgErro(u1Ncr));
  const u2Ncr = await http("GET", "/rest/v1/quality_ncrs?select=id&limit=5", { jwt: u2.token });
  check("RLS sem vinculo: nao le dado de negocio de outra obra", u2Ncr.status === 200 && (u2Ncr.json ?? []).length === 0, msgErro(u2Ncr));

  // gravacao direta (tabela): payload vazio -> o gatilho do congelamento dispara ANTES de qualquer validacao
  const w1 = await http("POST", "/rest/v1/esg_obligation_evidence", { jwt: u1.token, body: {} });
  if (fase === "congelado") check("gravacao direta (esg_obligation_evidence) recusada com 42501 pelo congelamento (REVOKE de escrita ou gatilho-guarda)", w1.status >= 400 && String(w1.json?.code) === "42501" && (congelado(w1) || /permission denied for table/.test(JSON.stringify(w1.json))), msgErro(w1));
  else check("gravacao direta com payload vazio e recusada (nao e pelo congelamento)", w1.status >= 400 && !congelado(w1), msgErro(w1));
  const locAntes = (await db.query("select location from public.projects where id=$1", [OBRA_TESTE])).rows[0].location;
  const w2 = await http("PATCH", `/rest/v1/projects?id=eq.${OBRA_TESTE}`, { jwt: u1.token, body: { location: `${locAntes}` }, headers: { Prefer: "return=representation" } });
  if (fase === "congelado") check("UPDATE direto em projects recusado com 42501 pelo congelamento (REVOKE de escrita ou gatilho-guarda)", w2.status >= 400 && String(w2.json?.code) === "42501" && (congelado(w2) || /permission denied for table/.test(JSON.stringify(w2.json))), msgErro(w2));
  else check("UPDATE direto em projects por membro GESTOR: recusado ou sem linha afetada (RLS)", w2.status >= 400 || (w2.status === 200 && Array.isArray(w2.json) && w2.json.length === 0), `${msgErro(w2)} linhas=${Array.isArray(w2.json) ? w2.json.length : "?"}`);
  const w3 = await http("DELETE", `/rest/v1/audit_log_entries?project_id=eq.${OBRA_TESTE}`, { jwt: u1.token });
  check("DELETE direto em audit_log_entries recusado ou sem linhas afetadas (trilha imutavel)", w3.status >= 400 || (Array.isArray(w3.json) && w3.json.length === 0) || w3.status === 204 && (await db.query("select count(*) n from public.audit_log_entries where project_id=$1", [OBRA_TESTE])).rows[0].n > 0, msgErro(w3));
  const w4 = await http("POST", "/rest/v1/esg_obligation_evidence", { body: {} });
  check("anon: gravacao direta recusada", w4.status >= 400, msgErro(w4));

  // RPC (caminho das Server Actions e do navegador). Sonda SEM gravacao: titulo vazio chega ao INSERT e falha no CHECK (23514);
  // com o congelamento o gatilho statement-level dispara ANTES do CHECK e a recusa e ACC_JANELA_CONGELAMENTO (42501).
  const antesNcr = await contaNcr();
  const rpc = await http("POST", "/rest/v1/rpc/quality_ncr_create", { jwt: u1.token, body: { p_project_id: OBRA_TESTE, p_title: "", p_description: "sonda sem gravacao", p_origin_type: "MANUAL", p_origin_ref: "JWT-TESTE-SONDA" } });
  const depoisNcr = await contaNcr();
  if (fase === "congelado") check("RPC de escrita (quality_ncr_create) recusada pelo congelamento (SECURITY DEFINER coberta pelo gatilho)", rpc.status >= 400 && congelado(rpc) && String(rpc.json?.code) === "42501", msgErro(rpc));
  else check("RPC de escrita alcanca o INSERT (falha no CHECK 23514, nao no congelamento nem por permissao)", rpc.status >= 400 && !congelado(rpc) && String(rpc.json?.code) === "23514", msgErro(rpc));
  check("RPC: nenhuma RNC gravada pela sonda (contagem igual)", antesNcr === depoisNcr, `${antesNcr} -> ${depoisNcr}`);
  const rpcSem = await http("POST", "/rest/v1/rpc/quality_ncr_create", { jwt: u2.token, body: { p_project_id: OBRA_TESTE, p_title: "", p_description: "x", p_origin_type: "MANUAL", p_origin_ref: "JWT-TESTE-SEM" } });
  check("RPC por usuario sem vinculo e recusada, em qualquer fase", rpcSem.status >= 400, msgErro(rpcSem));

  // Storage real
  const objeto = `${OBRA_TESTE}/__jwt_teste/${Date.now()}.txt`;
  const up = await http("POST", `/storage/v1/object/project-documents/${objeto}`, { jwt: u1.token, raw: true, body: "jwt-teste", headers: { "Content-Type": "text/plain" } });
  if (fase === "congelado") check("Storage: upload por authenticated recusado durante o congelamento (politica restritiva)", up.status >= 400, msgErro(up));
  else {
    check("Storage: upload por authenticated segue a politica vigente (sem erro de servidor)", up.status < 500, msgErro(up));
    if (up.status < 300) { const del = await http("DELETE", `/storage/v1/object/project-documents/${objeto}`, { jwt: u1.token }); console.log(`limpeza: objeto de teste ${del.status < 300 ? "removido pelo proprio usuario" : `NAO removido (${del.status}); registrar como pendencia`}`); }
  }
  const upAnon = await http("POST", `/storage/v1/object/project-documents/${objeto}`, { raw: true, body: "x", headers: { "Content-Type": "text/plain" } });
  check("Storage: upload anon recusado", upAnon.status >= 400, msgErro(upAnon));

  // service_role pela API: NAO executado (a chave secreta guardada tem formato que o Auth recusa; nao inspecionada)
  console.log(`NAO EXECUTADO [${fase}] service_role pela API real (chave secreta indisponivel); cobertura alternativa: test-congelamento-realpg (service_role mantem escrita) e psql como dono`);

  // Auth continua funcionando na janela (login novo e refresh)
  const novoLogin = await http("POST", "/auth/v1/token?grant_type=password", { body: { email: u1.email, password: u1.senha } });
  check("Auth: login com senha continua funcionando", novoLogin.status === 200 && !!novoLogin.json?.access_token, `status ${novoLogin.status}`);
  const rf = await http("POST", "/auth/v1/token?grant_type=refresh_token", { body: { refresh_token: novoLogin.json?.refresh_token } });
  check("Auth: refresh de token continua funcionando", rf.status === 200, `status ${rf.status}`);
  const usr = await http("GET", "/auth/v1/user", { jwt: u1.token });
  check("Auth: /user devolve o proprio usuario pelo JWT", usr.status === 200 && usr.json?.id === u1.id, `status ${usr.status}`);
} catch (e) {
  falha += 1;
  console.log(`FAIL erro inesperado: ${redigir(e.message)}`);
} finally {
  try {
    for (const id of criados) await db.query("delete from public.project_memberships where user_id = $1", [id]);
    console.log("limpeza: vinculos temporarios removidos; usuarios jwt-teste-* mantidos (a trilha de auditoria e imutavel e referencia o perfil), sem vinculo nem senha conhecida");
  } catch (e) { console.log(`limpeza: ERRO ${redigir(e.message).split("\n")[0]}`); falha += 1; }
  await db.end();
}
console.log(`\nRESULTADO [${fase}]: ${ok} OK, ${falha} FAIL`);
process.exit(falha ? 1 : 0);
