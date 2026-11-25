// FASE 2 / Frente C — TRAVA CENTRAL REVERSIVEL das RPCs de escrita de Qualidade, Seguros/Garantias e Competencias
// (docs/implantacao/trava-modulos/1-aplicar-trava.sql, 2-reverter-trava.sql), em PostgreSQL REAL e DESCARTAVEL.
// Replay de TODAS as migrations numa base propria (acc_trava_*, apagada no fim), dados 100% SINTETICOS, identidade por
// claims JWT (request.jwt.claims + set role). Fluxo: foto das ACLs -> aplicar -> verificar negacao (42501) -> reverter ->
// verificar IDENTIDADE de privilegios (ACL de todas as funcoes de public identica a foto inicial).
// NAO roda no CI (exige PostgreSQL local). Sem ACC_REALPG_URL e PULADO (exit 0). Nunca conecta fora de 127.0.0.1:55434.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> node scripts/test-trava-modulos-realpg.mjs
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO: defina ACC_REALPG_URL (PostgreSQL real local) e ACC_REALPG_PKG_DIR. Este teste não roda no CI.");
  process.exit(0);
}
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") {
  console.error("RECUSADO: só aceito 127.0.0.1:55434 (PostgreSQL local descartável).");
  process.exit(2);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const read = (f) => readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "");
const trava = (f) => readFileSync(path.join(here, "..", "docs", "implantacao", "trava-modulos", f), "utf8").replace(/^﻿/, "");
const APLICAR = trava("1-aplicar-trava.sql");
const REVERTER = trava("2-reverter-trava.sql");
const PLATFORM = readFileSync(path.join(here, "test-migrations-full-replay.mjs"), "utf8").match(/const PLATFORM = `([\s\S]*?)`;/)[1];
const GOTRUE = `
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'))::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim', true), ''), nullif(current_setting('request.jwt.claims', true), ''))::jsonb $$;
grant execute on function auth.uid(), auth.role(), auth.jwt() to anon, authenticated, service_role;`;
const platform = PLATFORM.replace(/^create role .*$/gm, "").replace(/^create function auth\.(uid|role|jwt)\(\).*$/gm, "-- stub removido") + "\n" + GOTRUE;

// As 35 RPCs travadas (23 originais + 12 da ampliacao) e as 6 liberadas (4 homologadas + 2 PARCIAIS com decisao).
const TRAVADAS = [
  "quality_cost_register", "quality_test_register", "quality_inspection_register", "quality_complaint_register", "quality_recurrence_register", "quality_requirement_register",
  "insurance_dossier_item_set", "insurance_dossier_sync", "bank_guarantee_register", "bank_guarantee_update", "other_guarantee_register", "other_guarantee_update",
  "insurance_expected_subject_save", "insurance_rcc_checklist_save",
  "project_competence_grant", "project_competence_request_cancel", "project_competence_request_create", "project_competence_request_decide", "project_competence_revalidate",
  "project_competence_revoke", "project_competence_validator_accept", "project_competence_validator_designate", "project_competence_validator_revoke",
  "quality_ncr_update_fields", "quality_evidence_revise", "quality_capa_update_status", "quality_verification_register", "quality_consequence_register",
  "quality_warranty_survey_register", "quality_warranty_maintenance_register", "quality_warranty_repair_register", "quality_warranty_case_update",
  "quality_warranty_acceptance_register", "quality_warranty_acceptance_prove", "quality_warranty_opinion_save",
];
const LIBERADAS = ["quality_ncr_create", "quality_ncr_transition", "quality_evidence_register", "quality_capa_register", "quality_warranty_create", "quality_warranty_transition"];

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`OK   ${name}`); passed += 1; }
  catch (e) { console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 900)}`); failed += 1; }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_trava_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}
const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
const open = [];
try {
  await su.query(platform);
  for (const f of files) {
    try { await su.query(read(f)); } catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(9100 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000091a0";
  const PERFIS = { ADMIN: [1, "ADMINISTRADOR"], GESTOR: [2, "GESTOR"], GERENTE: [3, "GERENTE"], COLAB: [4, "COLABORADOR"], LEITURA: [5, "LEITURA"] };
  for (const n of [1, 2, 3, 4, 5, 6]) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `trava-${n}@exemplo.invalid`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `Trava ${n}`, `trava-${n}@exemplo.invalid`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra Trava','TRV','C','L','2026-01-01','2027-01-01')", [PA]);
  for (const [n, perm] of Object.values(PERFIS)) {
    await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,'ACTIVE')", [PA, uid(n), perm]);
  }

  /** Conexao com identidade (claims JWT + role), como a API do Supabase. n = null => sem sessao. */
  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    await c.query("begin"); // savepoints por chamada (uma recusa nao aborta a sessao)
    return c;
  }
  /** Chama a funcao com argumentos NULOS do tipo certo (a checagem de privilegio ocorre antes de qualquer corpo). Retorna sqlstate. */
  async function chamar(c, proname) {
    const sig = (await su.query(
      `select (select string_agg('null::' || format_type(t, null), ',' order by o) from unnest(p.proargtypes::oid[]) with ordinality u(t, o)) as nulos
         from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = $1`, [proname])).rows[0].nulos ?? "";
    await c.query("savepoint s");
    try { await c.query(`select public.${proname}(${sig})`); await c.query("release savepoint s"); return "OK"; }
    catch (e) { await c.query("rollback to savepoint s"); return e.code ?? "ERR"; }
  }
  const snapAcl = async () => (await su.query(
    `select p.oid::regprocedure::text as fn, coalesce(p.proacl::text, '<NULL=PUBLIC>') as acl,
            (select string_agg(a.grantor::regrole::text || '>' || a.grantee::text || ':' || a.privilege_type || ':' || a.is_grantable, ',' order by a.grantee, a.grantor)
               from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a) as acl_expl
       from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)).rows;
  const execs = async (pronames) => (await su.query(
    `select p.oid::regprocedure::text as fn, has_function_privilege('authenticated', p.oid, 'EXECUTE') as aut,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon, has_function_privilege('service_role', p.oid, 'EXECUTE') as svc,
            has_function_privilege('postgres', p.oid, 'EXECUTE') as pgu
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any($1)`, [pronames])).rows;
  const selects = (res) => (Array.isArray(res) ? res : [res]).filter((r) => r.command === "SELECT");
  const auditCount = async (action) => Number((await su.query("select count(*) n from public.audit_log_entries where action = $1 and entity_id = 'trava-modulos-fase2-ampliada'", [action])).rows[0].n);

  // ---------------------------------------------------------------------------------------------------------------
  let base; // foto inicial das ACLs de TODAS as funcoes de public
  await check("T0) pre-condicao: as 41 funcoes existem, 1 assinatura por nome (sem sobrecarga), no schema public", async () => {
    const r = await su.query("select p.proname, count(*)::int n from pg_proc p where p.pronamespace='public'::regnamespace and p.proname = any($1) group by 1", [[...TRAVADAS, ...LIBERADAS]]);
    eq(r.rowCount, 41, "nomes distintos encontrados");
    eq(r.rows.filter((x) => x.n !== 1).map((x) => x.proname), [], "nomes com sobrecarga");
    base = await snapAcl();
    ok(base.length > 100, "foto das ACLs");
  });
  await check("T0b) estado anterior: as 35 sao executaveis por authenticated e service_role; anon/PUBLIC nao", async () => {
    const e = await execs(TRAVADAS);
    eq(e.length, 35, "funcoes");
    eq(e.filter((x) => !x.aut || !x.svc || !x.pgu).map((x) => x.fn), [], "faltam privilegios no estado anterior");
    eq(e.filter((x) => x.anon).map((x) => x.fn), [], "anon nao deve executar no estado anterior");
  });
  await check("T0c) sem a trava, um perfil autenticado ALCANCA as 35 (nenhuma recusa 42501)", async () => {
    const c = await as(1);
    const fora = [];
    for (const f of TRAVADAS) { const st = await chamar(c, f); if (st === "42501") fora.push(f); }
    eq(fora, [], "recusadas por privilegio antes da trava");
  });

  await check("T1) aplicar: Conferencia 1 = 35 travadas / 0 executaveis; Conferencia 2 = 6 liberadas; Conferencia 3 = 0 competencias; auditoria gravada", async () => {
    const res = selects(await su.query(APLICAR));
    eq(res.length, 3, "3 conferencias");
    eq([Number(res[0].rows[0].travadas_total), Number(res[0].rows[0].ainda_executaveis_esperado_0)], [35, 0], "conferencia 1");
    eq(Number(res[1].rows[0].liberadas_executaveis_esperado_6), 6, "conferencia 2");
    eq(Number(res[2].rows[0].tecnico_responsavel_ativas_esperado_0), 0, "conferencia 3");
    eq(await auditCount("MODULE_LOCK_APPLIED"), 1, "audit MODULE_LOCK_APPLIED (1 linha por obra; 1 obra no teste)");
  });
  await check("T2) negacao: as 35 recebem 42501 por chamada direta de authenticated em TODOS os perfis (ADMIN, GESTOR, GERENTE, COLAB, LEITURA, sem vinculo) e de anon", async () => {
    const falhas = [];
    for (const n of [1, 2, 3, 4, 5, 6, null]) {
      const c = await as(n, n == null ? "anon" : "authenticated");
      for (const f of TRAVADAS) { const st = await chamar(c, f); if (st !== "42501") falhas.push(`${n ?? "anon"}:${f}=${st}`); }
    }
    eq(falhas, [], "chamadas nao negadas com 42501");
  });
  await check("T3) as 6 liberadas seguem ALCANCAVEIS (nenhum 42501; o corpo decide) e com EXECUTE para authenticated", async () => {
    const c = await as(2);
    const neg = [];
    for (const f of LIBERADAS) { const st = await chamar(c, f); if (st === "42501") neg.push(f); }
    eq(neg, [], "liberadas recusadas por privilegio");
    const e = await execs(LIBERADAS);
    eq(e.filter((x) => !x.aut).map((x) => x.fn), [], "liberadas sem EXECUTE");
  });
  await check("T4) service_role e dono (postgres) mantem EXECUTE nas 35; anon/authenticated/PUBLIC nao; nenhuma funcao FORA da lista mudou de ACL", async () => {
    const e = await execs(TRAVADAS);
    eq(e.filter((x) => !x.svc || !x.pgu).map((x) => x.fn), [], "service_role/postgres perderam EXECUTE");
    eq(e.filter((x) => x.aut || x.anon).map((x) => x.fn), [], "authenticated/anon ainda executam");
    const publicOk = (await su.query("select count(*)::int n from pg_proc p, aclexplode(p.proacl) a where p.proname = any($1) and p.pronamespace='public'::regnamespace and a.grantee = 0", [TRAVADAS])).rows[0].n;
    eq(publicOk, 0, "PUBLIC com EXECUTE");
    const now = await snapAcl();
    eq(now.length, base.length, "numero de funcoes");
    const mudou = now.filter((r, i) => base[i].fn !== r.fn || base[i].acl !== r.acl).map((r) => r.fn).filter((fn) => !TRAVADAS.some((t) => fn.startsWith(`${t}(`)));
    eq(mudou, [], "funcoes fora da lista com ACL alterada");
  });
  await check("T5) service_role segue alcancando uma RPC travada (nao e recusado por privilegio)", async () => {
    const svc = await as(null, "service_role");
    const st = await chamar(svc, "project_competence_revoke");
    ok(st !== "42501", `service_role recusado por privilegio (${st})`);
  });
  await check("T6) aplicar 2x e idempotente (mesmo resultado, sem erro)", async () => {
    const res = selects(await su.query(APLICAR));
    eq([Number(res[0].rows[0].travadas_total), Number(res[0].rows[0].ainda_executaveis_esperado_0)], [35, 0], "conferencia 1 na reaplicacao");
  });
  await check("T7) guarda de seguranca: nome sobrecarregado aborta a trava sem efeito parcial", async () => {
    await su.query(REVERTER);
    const before = (await snapAcl());
    await su.query("create or replace function public.quality_cost_register(integer) returns int language sql as 'select 1'");
    let msg = "";
    try { await su.query(APLICAR); } catch (e) { msg = e.message; }
    await su.query("drop function public.quality_cost_register(integer)");
    ok(/TRAVA: nome ausente ou sobrecarregado/.test(msg), `esperava abortar por sobrecarga, obteve: ${msg.slice(0, 120)}`);
    const after = await snapAcl();
    eq(after.filter((r, i) => before[i]?.acl !== r.acl).map((r) => r.fn), [], "efeito parcial apos abortar");
  });

  await check("T8) reverter (total): authenticated volta a executar as 35; anon nunca; audit MODULE_LOCK_REVERTED", async () => {
    await su.query(APLICAR);
    const antes = await auditCount("MODULE_LOCK_REVERTED");
    const res = selects(await su.query(REVERTER));
    eq([Number(res[0].rows[0].executaveis_authenticated), Number(res[0].rows[0].executaveis_anon_esperado_0)], [35, 0], "conferencia da reversao");
    eq((await auditCount("MODULE_LOCK_REVERTED")) - antes, 1, "audit MODULE_LOCK_REVERTED");
    const c = await as(1);
    const neg = [];
    for (const f of TRAVADAS) { const st = await chamar(c, f); if (st === "42501") neg.push(f); }
    eq(neg, [], "ainda negadas apos reverter");
  });
  await check("T9) IDENTIDADE de privilegios: apos aplicar+reverter, o CONJUNTO de ACEs (grantor/grantee/privilegio; a ordem do array proacl muda e nao tem efeito) de TODAS as funcoes de public e identica a foto inicial", async () => {
    const now = await snapAcl();
    eq(now.length, base.length, "numero de funcoes");
    const dif = [];
    now.forEach((r, i) => { if (base[i].fn !== r.fn || base[i].acl_expl !== r.acl_expl) dif.push(`${r.fn}: ${base[i].acl} -> ${r.acl}`); });
    eq(dif, [], "ACLs diferentes da foto inicial");
  });
  await check("T10) ciclo repetido (aplicar, reverter, aplicar, reverter) continua com identidade de ACL", async () => {
    await su.query(APLICAR); await su.query(REVERTER); await su.query(APLICAR); await su.query(REVERTER);
    const now = await snapAcl();
    eq(now.filter((r, i) => base[i].acl_expl !== r.acl_expl).map((r) => r.fn), [], "ACLs diferentes apos 2 ciclos");
  });
  await check("T11) reversao PARCIAL por modulo (so Competencias = 9): libera apenas essas e as demais ficam travadas", async () => {
    await su.query(APLICAR);
    const comp = TRAVADAS.filter((f) => f.startsWith("project_competence_"));
    const so9 = REVERTER.replace(/(liberar text\[\] := array\[)[\s\S]*?(\];\s*esperado int := )35;/, `$1${comp.map((f) => `'${f}'`).join(",")}$2${comp.length};`);
    ok(so9 !== REVERTER, "substituicao da lista nao aplicada");
    await su.query(so9);
    const e = await execs(TRAVADAS);
    eq(e.filter((x) => x.aut).map((x) => x.fn.replace(/^public\./, "").split("(")[0]).sort(), [...comp].sort(), "liberadas na reversao parcial");
    await su.query(REVERTER);
  });
  await check("T12) reversao com contagem divergente aborta (esperado 35): guarda do script", async () => {
    await su.query("create or replace function public.quality_cost_register(integer) returns int language sql as 'select 1'");
    let msg = "";
    try { await su.query(REVERTER); } catch (e) { msg = e.message; }
    await su.query("drop function public.quality_cost_register(integer)");
    ok(/REVERSÃO: esperadas 35/.test(msg), `esperava abortar, obteve: ${msg.slice(0, 120)}`);
  });
  await check("T13) estado final: ACL identica a foto inicial e nenhuma funcao travada", async () => {
    const now = await snapAcl();
    eq(now.filter((r, i) => base[i].acl_expl !== r.acl_expl).map((r) => r.fn), [], "ACL final");
    eq((await execs(TRAVADAS)).filter((x) => !x.aut).length, 0, "travadas no estado final");
  });
  await check("T14) premissa da trava: nenhuma tabela dos modulos aceita INSERT/UPDATE/DELETE direto de authenticated/anon (a RPC e o unico caminho de escrita)", async () => {
    const r = await su.query(
      `select c.relname,
              array_remove(array[
                case when has_table_privilege('authenticated', c.oid, 'INSERT') or has_any_column_privilege('authenticated', c.oid, 'INSERT') then 'INSERT' end,
                case when has_table_privilege('authenticated', c.oid, 'UPDATE') or has_any_column_privilege('authenticated', c.oid, 'UPDATE') then 'UPDATE' end,
                case when has_table_privilege('authenticated', c.oid, 'DELETE') then 'DELETE' end,
                case when has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE') or has_table_privilege('anon', c.oid, 'DELETE') then 'ANON' end], null) as privs
         from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','p')
          and c.relname ~ '^(quality_|insurance_|bank_guarantee|other_guarantee|project_competence)'
        order by 1`);
    ok(r.rowCount > 20, `tabelas encontradas: ${r.rowCount}`);
    eq(r.rows.filter((x) => x.privs.length > 0).map((x) => `${x.relname}:${x.privs.join("+")}`), [], "tabelas com escrita direta liberada");
  });
  await check("T15) nenhuma funcao/gatilho de public chama as 35 travadas (varredura de prosrc): a trava nao quebra caminho interno, nem SSMA (ssma_*), nem as 6 liberadas", async () => {
    const r = await su.query(
      `select p.proname as chamador, t.n as chamada
         from pg_proc p, unnest($1::text[]) t(n)
        where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname <> t.n
          and p.prosrc ~* ('(^|[^a-z0-9_])' || t.n || '([^a-z0-9_]|$)') order by 1, 2`, [TRAVADAS]);
    // Mencoes conhecidas e inofensivas, so TEXTO (mensagem de erro / nota em jsonb), conferidas na leitura do corpo (22/11/2026):
    //  - project_competences_habilitation_guard: texto do RAISE 'HABILITATION_VALIDATION_REQUIRED: ... (project_competence_request_create / _decide)'
    //  - quality_warranty_acceptance_register: 'note' do retorno ("... aceite COMPROVADO (quality_warranty_acceptance_prove)")
    const so_texto = ["project_competences_habilitation_guard->project_competence_request_create", "quality_warranty_acceptance_register->quality_warranty_acceptance_prove"];
    eq(r.rows.map((x) => `${x.chamador}->${x.chamada}`), so_texto, "funcoes que chamam RPCs travadas (alem das mencoes so de texto)");
  });
  await check("T16) 3-teste-homolog-transacional.sql executado de verdade (aqui com os UUIDs da homologacao semeados como fixture): termina SEMPRE no erro TRAVA-TESTE-RESULTADO, 35x8=280 negadas 42501, matriz inalterada, 6/6 liberadas, tudo desfeito", async () => {
    const T1 = "723b7467-24e9-4401-80d3-3dbc6ee4d57e", T2 = "57463482-85bc-4474-8186-c4de5540f931", ADM = "02f1dc6d-1962-41f7-b910-1c1d1e1366c5";
    const NCR = "f1996d9d-dc1f-495e-bcf0-756efc978eca", GAR = "c43809d8-a6b9-47c2-8b6a-38aaaa00646b";
    const EVN = "8f030e1c-e1e1-409d-83f0-7f454ff4f552", EVG = "b84402dd-ac0e-4746-9370-4e4631ec1f67";
    await su.query("insert into auth.users (id,email) values ($1,'adm-teste@exemplo.invalid')", [ADM]);
    await su.query("insert into public.profiles (id,name,email) values ($1,'ADM Teste','adm-teste@exemplo.invalid') on conflict (id) do nothing", [ADM]);
    await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'TESTE','TST1','C','L','2026-01-01','2027-01-01'),($2,'TESTE 2','TST2','C','L','2026-01-01','2027-01-01')", [T1, T2]);
    await su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,'ADMINISTRADOR','ACTIVE')", [T1, ADM]);
    // O auth.users do Supabase real tem estas colunas (o stub local da plataforma nao); o script de homologacao as preenche.
    await su.query("alter table auth.users add column if not exists aud text, add column if not exists role text, add column if not exists raw_user_meta_data jsonb");
    await su.query("set session_replication_role = replica"); // fixture em estado intermediario (guardas de gatilho so valem para o fluxo real)
    await su.query("insert into public.quality_ncrs (id,project_id,code,title,state,origin_type,origin_ref,origin_key,row_version) values ($1,$2,'RNC-0001','RNC teste','INVESTIGACAO','MANUAL','fixture','MANUAL:fixture',3)", [NCR, T1]);
    await su.query("insert into public.quality_warranty_cases (id,project_id,code,service_system,defect_description,state,row_version) values ($1,$2,'GAR-0001','sistema teste','defeito de teste','EM_ANALISE',3)", [GAR, T1]);
    await su.query("insert into public.quality_evidence (id,project_id,ncr_id,source_type,source_ref,classification) values ($1,$2,$3,'DOCUMENTO','fixture-ncr','INDICIO')", [EVN, T1, NCR]);
    await su.query("insert into public.quality_evidence (id,project_id,warranty_case_id,source_type,source_ref,classification) values ($1,$2,$3,'DOCUMENTO','fixture-gar','INDICIO')", [EVG, T1, GAR]);
    await su.query("set session_replication_role = origin");
    const before = await snapAcl();
    const users = Number((await su.query("select count(*) n from auth.users")).rows[0].n);
    let msg = "";
    try { await su.query(trava("3-teste-homolog-transacional.sql")); } catch (e) { msg = e.message; }
    ok(/^TRAVA-TESTE-RESULTADO \(desfeito\)/.test(msg), `o bloco deveria terminar em TRAVA-TESTE-RESULTADO, obteve: ${msg.slice(0, 300)}`);
    console.log("     " + msg.split("\n").join("\n     "));
    ok(/travadas 42501 = 280\/280/.test(msg), "280/280 negadas");
    ok(/fora do esperado: \[\]/.test(msg), "nenhuma chamada fora do esperado");
    ok(/matriz inalterada = (t|true)/.test(msg), "matriz inalterada");
    ok(/liberadas com EXECUTE = 6\/6/.test(msg), "liberadas 6/6");
    const after = await snapAcl();
    eq(after.filter((r, i) => before[i].acl !== r.acl).map((r) => r.fn), [], "ACL alterada apos o teste (deveria estar tudo desfeito)");
    eq(Number((await su.query("select count(*) n from auth.users")).rows[0].n), users, "usuarios temporarios nao foram desfeitos");
  });
} finally {
  while (open.length) await open.pop().end().catch(() => {});
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
