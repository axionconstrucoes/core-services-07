// Teste de DESLIGAMENTO e RELIGAMENTO da Data API (PostgREST) SOMENTE no acc-homolog (gtadbeaevxglrqkhcwfz), em tres fases:
//   antes (Data API ligada) -> [VOCE desliga no painel] -> desligada -> [VOCE religa no painel] -> religada.
// O script NAO liga nem desliga nada: ele aguarda (polling) a mudanca que voce faz no painel do acc-homolog
// (Project Settings > Data API > "Enable Data API") e, a cada fase, verifica leitura/escrita pela API, autenticacao, acesso direto ao banco,
// recuperacao (tempo ate voltar) e INTEGRIDADE (contagem de linhas de todas as tabelas de public, fingerprints e P0 identicos nas tres fases).
// Usa so a chave publicavel e JWTs de usuarios temporarios (vinculo criado/removido pela conexao guardada); HTTP via curl.exe; nunca imprime chaves.
// Uso: executar-homolog.ps1 -Etapa dataapi -Publicavel <chave publicavel> -Extra "--espera-min=25"
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { openGuardedTarget } from "./connect.mjs";

const REF = "gtadbeaevxglrqkhcwfz";
const BASE = `https://${REF}.supabase.co`;
const OBRA_TESTE = "723b7467-24e9-4401-80d3-3dbc6ee4d57e";
const PUB = process.env.HOMOLOG_PUBLISHABLE_KEY;
const ESPERA_MIN = Number((process.argv.find((a) => a.startsWith("--espera-min=")) ?? "--espera-min=25").split("=")[1]);
if (!PUB) { console.error("RECUSADO: falta HOMOLOG_PUBLISHABLE_KEY"); process.exit(2); }
if (process.env.HOMOLOG_TARGET_REF !== REF) { console.error("RECUSADO: HOMOLOG_TARGET_REF diferente do acc-homolog"); process.exit(2); }

const ts = () => new Date().toISOString().slice(11, 19);
const log = (m) => console.log(`[${ts()}] ${m}`);
let ok = 0, falha = 0;
const check = (nome, cond, det = "") => { if (cond) ok += 1; else falha += 1; log(`${cond ? "OK  " : "FAIL"} ${nome}${det ? ` | ${String(det).slice(0, 220)}` : ""}`); };
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

function http(method, pathq, { jwt = null, body } = {}) {
  const h = { apikey: PUB, ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}) };
  const args = ["-sS", "--max-time", "20", "-X", method, "-w", "\n%{http_code}"];
  for (const [k, v] of Object.entries(h)) args.push("-H", `${k}: ${v}`);
  if (body !== undefined) args.push("--data-binary", "@-");
  args.push(`${BASE}${pathq}`);
  const r = spawnSync("curl", args, { input: body === undefined ? undefined : JSON.stringify(body), encoding: "utf8" });
  if (r.status !== 0) return { status: 0, json: null, text: `curl exit ${r.status}`, rede: true };
  const k = r.stdout.lastIndexOf("\n");
  const t = r.stdout.slice(0, k);
  let j = null; try { j = JSON.parse(t); } catch { /* texto */ }
  return { status: Number(r.stdout.slice(k + 1)), json: j, text: t };
}
const resumo = (r) => `${r.status} ${r.json?.code ?? ""} ${String(r.json?.message ?? r.text).slice(0, 90)}`.trim();

const { db } = await openGuardedTarget({ requireMarker: true });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const CONT = `select c.relname t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int n
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by 1`;
const FP = `select
 (select md5(string_agg(p.oid::regprocedure::text||coalesce(p.proacl::text,''), ',' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') acl_funcoes,
 (select md5(string_agg(c.oid::regclass::text||coalesce(c.relacl::text,''), ',' order by c.oid::regclass::text)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p')) acl_tabelas,
 (select md5(string_agg(schemaname||'.'||tablename||'.'||policyname||coalesce(qual,'')||coalesce(with_check,''), ',' order by schemaname,tablename,policyname)) from pg_policies where schemaname in ('public','storage')) politicas,
 (select md5(string_agg(version||'_'||coalesce(name,''), ',' order by version)) from supabase_migrations.schema_migrations) historico,
 (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid=to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)')) p0`;
const mapa = (rows) => Object.fromEntries(rows.map((r) => [r.t, r.n]));

async function usuario(rotulo) {
  const email = `jwt-teste-${rotulo}@homolog.invalid`;
  const senha = `Hm!${randomBytes(12).toString("base64url")}`;
  const ex = await q("select id from auth.users where email = $1", [email]);
  let id;
  if (ex.length) { id = ex[0].id; await db.query("update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')), email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now() where id = $1", [id, senha]); }
  else {
    id = (await q(`insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
      values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, $3::jsonb, now(), now(), '', '', '', '') returning id`, [email, senha, JSON.stringify({ name: `[JWT-TESTE] ${rotulo}` })]))[0].id;
  }
  return { id, email, senha };
}
const login = (u) => http("POST", "/auth/v1/token?grant_type=password", { body: { email: u.email, password: u.senha } });

let membro = null;
try {
  const alvo = (await q("select current_database() db, (select count(*) from pg_namespace where nspname='acc_homolog_marker') marcador"))[0];
  log(`alvo: db=${alvo.db} marcador=${alvo.marcador} ref=${REF}`);
  check("pre-condicao: projeto e o acc-homolog (marcador presente, host do acc-homolog)", Number(alvo.marcador) === 1 && BASE.includes(REF), `marcador=${alvo.marcador}`);

  membro = await usuario("membro");
  await db.query("delete from public.project_memberships where user_id=$1", [membro.id]);
  await db.query("insert into public.project_memberships (project_id, user_id, permission, status) values ($1,$2,'GESTOR','ACTIVE')", [OBRA_TESTE, membro.id]);
  const l0 = await login(membro);
  check("preparo: login do usuario temporario funciona", l0.status === 200, resumo(l0));
  const tok = l0.json?.access_token;

  // baseline de integridade (todas as fases comparam com este)
  const cont0 = mapa(await q(CONT));
  const fp0 = (await q(FP))[0];
  log(`baseline: ${Object.keys(cont0).length} tabelas, ${Object.values(cont0).reduce((a, b) => a + b, 0)} linhas`);

  const leituraApi = (t) => http("GET", "/rest/v1/projects?select=id", { jwt: t });
  const escritaApi = (t) => http("POST", "/rest/v1/rpc/quality_ncr_create", { jwt: t, body: { p_project_id: OBRA_TESTE, p_title: "", p_description: "sonda sem gravacao", p_origin_type: "MANUAL", p_origin_ref: "DATAAPI-SONDA" } });

  // ---- fase ANTES
  log("=== fase ANTES (Data API LIGADA)");
  const a1 = http("GET", "/rest/v1/", {});
  check("antes: REST responde (Data API ligada)", a1.status === 200 || a1.status === 401 || a1.status === 400, resumo(a1));
  const a2 = await leituraApi(tok);
  check("antes: leitura pela API com JWT funciona", a2.status === 200 && (a2.json ?? []).length >= 1, resumo(a2));
  const a3 = await escritaApi(tok);
  check("antes: escrita (RPC) alcanca o banco (falha no CHECK 23514, sem gravar)", a3.status >= 400 && String(a3.json?.code) === "23514", resumo(a3));

  // ---- DESLIGAR
  log(`[ACAO NECESSARIA] Desligue a Data API do acc-homolog no painel (Project Settings > Data API). Aguardando ate ${ESPERA_MIN} min...`);
  const tEspera = Date.now();
  let desligadaEm = null;
  let seguidas = 0;
  while (Date.now() - tEspera < ESPERA_MIN * 60_000) {
    await dorme(8000);
    const r = leituraApi(tok);
    // conta so RESPOSTAS HTTP reais diferentes de 200 (status 0 = falha de rede/curl: nao e prova de desligamento)
    seguidas = r.status !== 200 && r.status !== 0 ? seguidas + 1 : 0;
    if (seguidas >= 3) { desligadaEm = Date.now(); log(`detectado: leitura pela API deixou de funcionar em 3 tentativas seguidas (${resumo(r)})`); break; }
  }
  check("Data API foi desligada no painel dentro da janela de espera", desligadaEm !== null);
  if (desligadaEm) {
    await dorme(5000);
    log("=== fase DESLIGADA");
    const d1 = await leituraApi(tok);
    check("desligada: LEITURA pela API indisponivel (nao devolve dados)", d1.status !== 200 && !Array.isArray(d1.json), resumo(d1));
    const d2 = await escritaApi(tok);
    check("desligada: ESCRITA pela API indisponivel (RPC nao executa)", d2.status >= 400 && String(d2.json?.code) !== "23514", resumo(d2));
    const d3 = http("GET", "/rest/v1/projects?select=id", {});
    check("desligada: anon tambem sem acesso aos dados pela API", d3.status !== 200 || (Array.isArray(d3.json) && d3.json.length === 0), resumo(d3));
    const d4 = await login(membro);
    check("desligada: Auth (GoTrue) continua funcionando (login com senha)", d4.status === 200, resumo(d4));
    const d5 = http("GET", "/auth/v1/user", { jwt: d4.json?.access_token });
    check("desligada: Auth /user devolve o usuario", d5.status === 200 && d5.json?.id === membro.id, `status ${d5.status}`);
    const contD = mapa(await q(CONT));
    const difD = Object.keys(cont0).filter((t) => cont0[t] !== contD[t]);
    check("desligada: banco acessivel diretamente e contagem de linhas igual ao baseline (nada gravado)", difD.length === 0, difD.map((t) => `${t} ${cont0[t]}->${contD[t]}`).join(","));
    const fpD = (await q(FP))[0];
    check("desligada: fingerprints (ACL, politicas, historico, P0) iguais ao baseline", Object.keys(fp0).every((k) => fp0[k] === fpD[k]));
  }

  // ---- RELIGAR
  log(`[ACAO NECESSARIA] RELIGUE a Data API do acc-homolog no painel. Aguardando ate ${ESPERA_MIN} min...`);
  const tRel = Date.now();
  let religadaEm = null;
  while (Date.now() - tRel < ESPERA_MIN * 60_000) {
    await dorme(8000);
    const r = leituraApi(tok);
    if (r.status === 200 && Array.isArray(r.json) && r.json.length >= 1) { religadaEm = Date.now(); log("detectado: leitura pela API voltou"); break; }
  }
  check("Data API foi religada no painel dentro da janela de espera", religadaEm !== null);
  if (religadaEm) {
    await dorme(3000);
    log("=== fase RELIGADA");
    check("religada: tempo ate a leitura voltar apos o religamento (informativo)", true, `${Math.round((religadaEm - tRel) / 1000)} s desde que o religamento foi aguardado`);
    const r1 = await leituraApi(tok);
    check("religada: leitura pela API volta (mesmo JWT)", r1.status === 200 && (r1.json ?? []).length >= 1, resumo(r1));
    const r2 = await escritaApi(tok);
    check("religada: escrita (RPC) alcanca o banco de novo (23514, sem gravar)", r2.status >= 400 && String(r2.json?.code) === "23514", resumo(r2));
    const r3 = await login(membro);
    check("religada: login continua funcionando", r3.status === 200, resumo(r3));
    const contR = mapa(await q(CONT));
    const difR = Object.keys(cont0).filter((t) => cont0[t] !== contR[t]);
    check("religada: contagem de linhas de todas as tabelas igual ao baseline (integridade)", difR.length === 0, difR.map((t) => `${t} ${cont0[t]}->${contR[t]}`).join(","));
    const fpR = (await q(FP))[0];
    for (const k of Object.keys(fp0)) check(`religada: fingerprint ${k} igual ao baseline`, fp0[k] === fpR[k]);
  }
} catch (e) {
  falha += 1;
  log(`FAIL erro inesperado: ${String(e.message).split("\n")[0]}`);
} finally {
  try { if (membro) await db.query("delete from public.project_memberships where user_id=$1", [membro.id]); log("limpeza: vinculo temporario removido (usuarios jwt-teste-* mantidos; a trilha de auditoria e imutavel)"); } catch (e) { log(`limpeza: ERRO ${String(e.message).split("\n")[0]}`); falha += 1; }
  await db.end();
}
log(`RESULTADO: ${ok} OK, ${falha} FAIL`);
process.exit(falha ? 1 : 0);
