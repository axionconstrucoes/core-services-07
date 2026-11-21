// FASE 4 / D — destinatário externo + menu por nível em PostgreSQL REAL (adversarial). Replay de TODAS as migrations numa base
// descartável (acc_f4d_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role), dados 100% SINTÉTICOS.
// Cobre: paridade TS x SQL da validação e da classificação de domínio; RPC de confirmação por perfil (LEITURA, COLABORADOR, GESTOR, GERENTE,
// ADMINISTRADOR, inativo, pendente, outro projeto, anon, authenticated sem sub); auditoria append-only (inclusive para superusuário) e RLS da
// trilha; trava do canal oficial de Seguros (tipo e-mail); canais legados intactos; idempotência; e a paridade do MENU por nível
// (acc_project_tier x canAccessSegment x quality_can_read / insurance_access). NÃO roda no CI.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-destinatarios-externos-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INVALID, VALID } from "./fixtures/destinatarios-vetores.mjs";

const url = process.env.ACC_REALPG_URL;
if (!url) {
  console.log("PULADO: defina ACC_REALPG_URL (PostgreSQL real local) e ACC_REALPG_PKG_DIR. Este teste não roda no CI.");
  process.exit(0);
}
const U0 = new URL(url);
if (U0.hostname !== "127.0.0.1" || U0.port !== "55434") {
  console.error("RECUSADO: só aceito 127.0.0.1:55434 (PostgreSQL local de homologação).");
  process.exit(2);
}
register("./ts-module-resolver.mjs", import.meta.url);
const V = await import("../apps/web/lib/email/recipient-validation.ts");
const T = await import("../apps/web/lib/permissions/project-tier.ts");
const N = await import("../apps/web/lib/permissions/nav-access.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^20261127100000_/.test(f));
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

let passed = 0;
let failed = 0;
const open = [];
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (e) {
    console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 600)}`);
    failed += 1;
  } finally {
    while (open.length) await open.pop().end().catch(() => {});
  }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };
const rejects = async (p, re, m) => {
  try { await p; } catch (e) { ok(re.test(e.message), `${m}: erro inesperado: ${e.message.split("\n")[0]}`); return; }
  throw new Error(`${m}: deveria ter sido recusado`);
};

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f4d_${Date.now().toString(36)}`;
await admin.query(`create database ${dbName} template template0 encoding 'UTF8' lc_collate 'C' lc_ctype 'C'`);
const dbUrl = (() => { const b = new URL(url); b.pathname = `/${dbName}`; return b.toString(); })();
for (const [role, extra] of [["anon", "nologin"], ["authenticated", "nologin"], ["service_role", "nologin bypassrls"]]) {
  await admin.query(`do $$ begin create role ${role} ${extra}; exception when duplicate_object then null; end $$`);
}

const su = new pg.Client({ connectionString: dbUrl });
await su.connect();
try {
  await su.query(platform);
  for (const f of files) {
    try { await su.query(readFileSync(path.join(dir, f), "utf8").replace(/^﻿/, "")); }
    catch (e) { console.log(`FAIL replay ${f}: ${e.message.split("\n")[0]}`); throw e; }
  }
  for (let i = 0; i < 2; i += 1) for (const f of MINE) await su.query(readFileSync(path.join(dir, f), "utf8")); // idempotência (2 reaplicações)
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 4/D reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(2700 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000027a0";
  const PB = "10000000-0000-4000-8000-0000000027b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, PENDENTE: 7, ADMINB: 8 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f4d-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F4D ${n}`, `f4d-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','F4A','C','L','2026-01-01','2027-01-01'),($2,'Obra B','F4B','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [PA, `f4d-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);

  async function as(n, role = "authenticated") {
    const c = new pg.Client({ connectionString: dbUrl });
    await c.connect();
    open.push(c);
    await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(n == null ? { role } : { sub: uid(n), role })]);
    await c.query(`set role ${role}`);
    return c;
  }
  const rpc = async (c, fn, ...args) => {
    const ph = args.map((_, i) => `$${i + 1}`).join(",");
    return (await c.query(`select public.${fn}(${ph}) as r`, args)).rows[0].r;
  };
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const confirm = (c, project, email, reason = "Cliente solicitou o envio desta solicitação.", ctx = "SEGUROS_CANAL") =>
    rpc(c, "acc_external_recipient_confirm", project, ctx, "INSURANCE_CHANNEL", null, email, reason, "ref-sintetica-1");
  const channel = (c, project, data) => rpc(c, "insurance_channel_register", project, JSON.stringify({ entity_name: "Seguradora Sintética SA", source_ref: "apolice-sintetica p.1", ...data }));
  const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security/i;

  // ======================= paridade TS x SQL =======================
  await check("PARIDADE: acc_email_normalize == validateRecipientEmail para todos os vetores (válidos, inválidos, injeção, limites)", async () => {
    for (const raw of VALID) {
      const ts = V.validateRecipientEmail(raw);
      const sql = (await su.query("select public.acc_email_normalize($1) v", [raw])).rows[0].v;
      eq(sql, ts.ok ? ts.email : null, `válido ${JSON.stringify(raw)}`);
      ok(ts.ok, `esperado válido: ${JSON.stringify(raw)}`);
    }
    for (const raw of INVALID) {
      const ts = V.validateRecipientEmail(raw);
      ok(!ts.ok, `TS deveria recusar ${JSON.stringify(raw)}`);
      if (typeof raw !== "string" || raw.includes("\u0000")) continue; // NUL/não-string: o Postgres nem aceita como parâmetro de texto
      eq((await su.query("select public.acc_email_normalize($1) v", [raw])).rows[0].v, null, `SQL deveria recusar ${JSON.stringify(raw)}`);
    }
    eq((await su.query("select public.acc_email_normalize(null) v")).rows[0].v, null, "null");
  });

  await check("PARIDADE: acc_recipient_domain_status == classifyRecipientDomain (interno, permitido, externo, inativo, subdomínio, inválido)", async () => {
    await su.query("insert into public.acc_recipient_domains (domain, kind) values ('parceiro.com.br','PERMITIDO'),('antigo.com.br','PERMITIDO')");
    await su.query("update public.acc_recipient_domains set active=false where domain='antigo.com.br'");
    const domains = (await su.query("select domain, kind, active from public.acc_recipient_domains")).rows;
    ok(domains.some((d) => d.domain === "axion.com.br" && d.kind === "TENANT"), "semente axion.com.br TENANT");
    for (const e of ["a@axion.com.br", "A@AXION.COM.BR", "a@parceiro.com.br", "a@antigo.com.br", "a@sub.axion.com.br", "a@axion.com.br.evil.com", "a@fakeaxion.com.br", "a@cliente.com", "lixo", "a@b.com\r\nBcc: x@y.com"]) {
      eq((await su.query("select public.acc_recipient_domain_status($1) s", [e])).rows[0].s, V.classifyRecipientDomain(e, domains), `status de ${JSON.stringify(e)}`);
    }
  });

  await check("lista de domínios: authenticated só lê; não escreve, não apaga; nem superusuário apaga (desative com active=false)", async () => {
    const c = await as(U.ADMIN);
    eq((await c.query("select count(*)::int n from public.acc_recipient_domains")).rows[0].n >= 1, true, "authenticated lê a lista");
    await rejects(c.query("insert into public.acc_recipient_domains (domain, kind) values ('x.com.br','PERMITIDO')"), DENIED, "insert direto");
    await rejects(c.query("update public.acc_recipient_domains set active=false"), DENIED, "update direto");
    await rejects(c.query("delete from public.acc_recipient_domains"), DENIED, "delete direto");
    await rejects(su.query("delete from public.acc_recipient_domains where domain='axion.com.br'"), /RECIPIENT_DOMAINS_NO_DELETE/, "delete por superusuário");
    await rejects(su.query("truncate public.acc_recipient_domains"), /RECIPIENT_DOMAINS_NO_DELETE/, "truncate por superusuário");
    await rejects((await as(null, "anon")).query("select * from public.acc_recipient_domains"), /permission denied/i, "anon");
  });

  // ======================= RPC de confirmação: matriz de perfis =======================
  const PROFILES = [
    ["LEITURA", U.LEITURA, "authenticated", false],
    ["COLABORADOR", U.COLAB, "authenticated", false],
    ["GESTOR", U.GESTOR, "authenticated", true],
    ["GERENTE", U.GERENTE, "authenticated", true],
    ["ADMINISTRADOR", U.ADMIN, "authenticated", true],
    ["INATIVO", U.INATIVO, "authenticated", false],
    ["PENDENTE", U.PENDENTE, "authenticated", false],
    ["OUTRO_PROJETO", U.ADMINB, "authenticated", false],
    ["AUTHENTICATED_SEM_SUB", null, "authenticated", false],
  ];
  await check("acc_external_recipient_confirm: só GESTOR/GERENTE/ADMINISTRADOR; demais perfis recusados sem gravar nada (inclui anon)", async () => {
    for (const [label, n, role, can] of PROFILES) {
      const c = await as(n, role);
      const before = await nq("select count(*)::int n from public.external_recipient_confirmations");
      if (can) {
        const r = await confirm(c, PA, `cliente-${label.toLowerCase()}@cliente-externo.com.br`);
        ok(r.id && r.email.endsWith("@cliente-externo.com.br") && r.domain === "cliente-externo.com.br", `${label}: retorno ${JSON.stringify(r)}`);
        eq(await nq("select count(*)::int n from public.external_recipient_confirmations"), before + 1, `${label} grava 1`);
      } else {
        await rejects(confirm(c, PA, `cliente-${label.toLowerCase()}@cliente-externo.com.br`), DENIED, label);
        eq(await nq("select count(*)::int n from public.external_recipient_confirmations"), before, `${label} não grava`);
      }
    }
    const before = await nq("select count(*)::int n from public.external_recipient_confirmations");
    await rejects(confirm(await as(null, "anon"), PA, "a@cliente-externo.com.br"), /permission denied/i, "anon");
    await rejects(confirm(await as(null, "service_role"), PA, "a@cliente-externo.com.br"), /AUTH_REQUIRED|permission denied/i, "service_role sem sub");
    eq(await nq("select count(*)::int n from public.external_recipient_confirmations"), before, "anon/service_role não gravam");
  });

  await check("acc_external_recipient_confirm: endereço inválido/injeção, destinatário interno ou permitido, motivo curto, projeto nulo/inexistente e ADMIN de outro projeto", async () => {
    const g = await as(U.GESTOR);
    await rejects(confirm(g, PA, "a@b.com\r\nBcc: x@y.com"), /INVALID_RECIPIENT_EMAIL/, "injeção de cabeçalho");
    await rejects(confirm(g, PA, "a@x.com,b@y.com"), /INVALID_RECIPIENT_EMAIL/, "lista");
    await rejects(confirm(g, PA, "naoemail"), /INVALID_RECIPIENT_EMAIL/, "sem @");
    await rejects(confirm(g, PA, "a@axion.com.br"), /CONFIRMATION_NOT_REQUIRED/, "interno");
    await rejects(confirm(g, PA, "a@parceiro.com.br"), /CONFIRMATION_NOT_REQUIRED/, "permitido");
    await rejects(confirm(g, PA, "a@cliente-externo.com.br", "curto"), /REASON_REQUIRED/, "motivo curto");
    await rejects(confirm(g, PA, "a@cliente-externo.com.br", "          "), /REASON_REQUIRED/, "motivo em branco");
    await rejects(confirm(g, null, "a@cliente-externo.com.br"), /FORBIDDEN/, "projeto nulo");
    await rejects(confirm(g, "10000000-0000-4000-8000-00000000dead", "a@cliente-externo.com.br"), /FORBIDDEN/, "projeto inexistente");
    await rejects(confirm(g, PB, "a@cliente-externo.com.br"), /FORBIDDEN/, "GESTOR de A em B");
    await rejects(confirm(await as(U.ADMINB), PA, "a@cliente-externo.com.br"), /FORBIDDEN/, "ADMIN de B em A (isolamento entre projetos)");
    await rejects(rpc(g, "acc_external_recipient_confirm", PA, "CONTEXTO_INVENTADO", null, null, "a@cliente-externo.com.br", "motivo suficientemente longo", null), /check|violates/i, "contexto fora da lista");
  });

  await check("AUDITORIA: a confirmação grava quem, quando, destinatário normalizado, domínio, motivo, contexto, fonte e nível; Seguros também audita", async () => {
    const g = await as(U.GESTOR);
    const r = await confirm(g, PA, "  Cliente.Final@Cliente-Aud.COM.br ", "  Cliente pediu envio ao seu escritório jurídico.  ");
    const row = (await su.query("select * from public.external_recipient_confirmations where id=$1", [r.id])).rows[0];
    eq(row.confirmed_by, uid(U.GESTOR), "quem confirmou");
    eq(row.recipient_email, "cliente.final@cliente-aud.com.br", "destinatário normalizado");
    eq(row.recipient_domain, "cliente-aud.com.br", "domínio");
    eq(row.reason, "Cliente pediu envio ao seu escritório jurídico.", "motivo aparado");
    eq([row.context, row.project_id, row.domain_status, row.tier_at_confirmation, row.source_ref], ["SEGUROS_CANAL", PA, "EXTERNO", "MANAGE", "ref-sintetica-1"], "metadados");
    ok(Math.abs(Date.now() - new Date(row.confirmed_at).getTime()) < 60000, "instante recente");
    const ev = (await su.query("select actor_user_id, detail from public.insurance_audit_events where entity_id=$1 and action='EXTERNAL_RECIPIENT_CONFIRMED'", [r.id])).rows;
    eq(ev.length, 1, "evento no insurance_audit_events");
    eq(ev[0].actor_user_id, uid(U.GESTOR), "ator do evento");
    ok(!JSON.stringify(ev[0].detail).includes("@"), "o endereço completo não é repetido no detalhe do evento de Seguros");
    const adm = await confirm(await as(U.ADMIN), PA, "x@cliente-aud2.com.br", "Motivo de teste do administrador.", "SOLICITACAO_ACAO");
    eq((await su.query("select tier_at_confirmation t from public.external_recipient_confirmations where id=$1", [adm.id])).rows[0].t, "ADMIN", "nível ADMIN registrado");
    eq(await nq("select count(*)::int n from public.insurance_audit_events where entity_id=$1", [adm.id]), 0, "contexto fora de Seguros não gera evento de Seguros");
  });

  await check("TRILHA APPEND-ONLY: update, delete e truncate falham para authenticated E para superusuário; sem escrita direta", async () => {
    const id = (await su.query("select id from public.external_recipient_confirmations limit 1")).rows[0].id;
    const total = await nq("select count(*)::int n from public.external_recipient_confirmations");
    await rejects(su.query("update public.external_recipient_confirmations set reason='adulterado por superusuário' where id=$1", [id]), /EXTERNAL_RECIPIENT_AUDIT_APPEND_ONLY/, "update superusuário");
    await rejects(su.query("delete from public.external_recipient_confirmations where id=$1", [id]), /EXTERNAL_RECIPIENT_AUDIT_APPEND_ONLY/, "delete superusuário");
    await rejects(su.query("truncate public.external_recipient_confirmations"), /EXTERNAL_RECIPIENT_AUDIT_APPEND_ONLY/, "truncate superusuário");
    for (const [label, n] of [["ADMIN", U.ADMIN], ["GESTOR", U.GESTOR], ["COLAB", U.COLAB]]) {
      const c = await as(n);
      await rejects(c.query("update public.external_recipient_confirmations set reason='x'"), DENIED, `${label} update`);
      await rejects(c.query("delete from public.external_recipient_confirmations"), DENIED, `${label} delete`);
      await rejects(c.query("insert into public.external_recipient_confirmations (project_id,context,recipient_email,recipient_domain,reason,confirmed_by,tier_at_confirmation) values ($1,'OUTRO','a@b.com','b.com','motivo longo aqui',$2,'MANAGE')", [PA, uid(n)]), DENIED, `${label} insert direto (forjar confirmação)`);
    }
    eq(await nq("select count(*)::int n from public.external_recipient_confirmations"), total, "nada mudou");
  });

  await check("RLS da trilha: gestão do PRÓPRIO projeto lê; COLABORADOR, LEITURA, inativo, pendente, outro projeto, anon e sem sub não leem (0 linhas)", async () => {
    const total = await nq("select count(*)::int n from public.external_recipient_confirmations where project_id=$1", [PA]);
    ok(total >= 4, "há confirmações");
    for (const [label, n, role, can] of PROFILES) {
      const c = await as(n, role);
      const seen = Number((await c.query("select count(*)::int n from public.external_recipient_confirmations")).rows[0].n);
      eq(seen, can ? total : 0, `${label} vê`);
    }
    await rejects((await as(null, "anon")).query("select * from public.external_recipient_confirmations"), /permission denied/i, "anon");
    await confirm(await as(U.ADMINB), PB, "b@cliente-b.com.br", "Confirmação do projeto B para teste.");
    eq(Number((await (await as(U.GESTOR)).query("select count(*)::int n from public.external_recipient_confirmations where project_id=$1", [PB])).rows[0].n), 0, "GESTOR de A não vê B");
  });

  // ======================= trava do canal oficial de Seguros =======================
  await check("CANAL (e-mail): domínio EXTERNO sem confirmação é recusado; com confirmação do MESMO usuário/projeto/contexto/endereço passa e normaliza", async () => {
    const g = await as(U.GESTOR);
    const before = await nq("select count(*)::int n from public.insurance_official_channels");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "sinistros@seguradora-ext.com.br" }), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "sem confirmação");
    eq(await nq("select count(*)::int n from public.insurance_official_channels"), before, "nada gravado");
    await confirm(g, PA, "Sinistros@Seguradora-Ext.com.br");
    const r = await channel(g, PA, { channel_type: "EMAIL", channel_value: "  SINISTROS@Seguradora-Ext.com.br " });
    eq((await su.query("select channel_value v from public.insurance_official_channels where id=$1", [r.id])).rows[0].v, "sinistros@seguradora-ext.com.br", "valor normalizado");
    eq(r.verified, false, "nasce não verificado");
  });

  await check("CANAL: confirmação de OUTRO usuário, de OUTRO projeto, de OUTRO contexto, de OUTRO endereço ou expirada (> 24 h) NÃO vale", async () => {
    const g = await as(U.GESTOR);
    const adm = await as(U.ADMIN);
    await confirm(adm, PA, "outro-usuario@ext1.com.br");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "outro-usuario@ext1.com.br" }), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "confirmação de outro usuário");
    await confirm(await as(U.ADMINB), PB, "outro-projeto@ext2.com.br", "Confirmação do projeto B para teste.");
    await rejects(channel(adm, PA, { channel_type: "EMAIL", channel_value: "outro-projeto@ext2.com.br" }), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "confirmação de outro projeto");
    await confirm(g, PA, "outro-contexto@ext3.com.br", "Confirmação para outro contexto de uso.", "SOLICITACAO_ACAO");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "outro-contexto@ext3.com.br" }), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "confirmação de outro contexto");
    await confirm(g, PA, "outro-endereco@ext4.com.br");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "outro-endereco-diferente@ext4.com.br" }), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "confirmação de outro endereço");
    await su.query("insert into public.external_recipient_confirmations (project_id,context,recipient_email,recipient_domain,reason,confirmed_by,confirmed_at,tier_at_confirmation) values ($1,'SEGUROS_CANAL','velho@ext5.com.br','ext5.com.br','Confirmação antiga e expirada.',$2, now() - interval '25 hours','MANAGE')", [PA, uid(U.GESTOR)]);
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "velho@ext5.com.br" }), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "confirmação expirada");
  });

  await check("CANAL: domínio da Axion e domínio permitido passam sem confirmação; inválido/injeção é recusado; PORTAL/telefone não são afetados", async () => {
    const g = await as(U.GESTOR);
    ok((await channel(g, PA, { channel_type: "EMAIL", channel_value: "contato@axion.com.br" })).id, "interno");
    ok((await channel(g, PA, { channel_type: "EMAIL", channel_value: "contato@parceiro.com.br" })).id, "permitido");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "isto nao e email" }), /INVALID_RECIPIENT_EMAIL/, "inválido");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "a@axion.com.br\r\nBcc: x@y.com" }), /INVALID_RECIPIENT_EMAIL/, "injeção de cabeçalho");
    await rejects(channel(g, PA, { channel_type: "EMAIL", channel_value: "a@axion.com.br,b@cliente.com" }), /INVALID_RECIPIENT_EMAIL/, "lista de destinatários");
    ok((await channel(g, PA, { channel_type: "PORTAL", channel_value: "https://portal.seguradora.exemplo/sinistros" })).id, "portal");
    ok((await channel(g, PA, { channel_type: "TELEFONE", channel_value: "+55 11 4000-0000" })).id, "telefone");
  });

  await check("CANAL: permissões do cadastro preservadas (COLABORADOR/LEITURA/inativo/outro projeto recusados antes do gatilho) e UPDATE para domínio externo exige confirmação", async () => {
    for (const [label, n] of [["COLAB", U.COLAB], ["LEITURA", U.LEITURA], ["INATIVO", U.INATIVO], ["OUTRO_PROJETO", U.ADMINB]]) {
      await rejects(channel(await as(n), PA, { channel_type: "EMAIL", channel_value: "x@axion.com.br" }), DENIED, label);
    }
    const g = await as(U.GESTOR);
    const ch = await channel(g, PA, { channel_type: "EMAIL", channel_value: "troca@axion.com.br" });
    await rejects(su.query("update public.insurance_official_channels set channel_value='troca@ext-sem-confirmar.com.br' where id=$1", [ch.id]), /EXTERNAL_RECIPIENT_CONFIRMATION_REQUIRED/, "update para externo");
    eq((await su.query("select channel_value v from public.insurance_official_channels where id=$1", [ch.id])).rows[0].v, "troca@axion.com.br", "valor preservado");
    eq((await rpc(g, "insurance_channel_verify", ch.id)).verified, true, "verificar canal (UPDATE de outras colunas) continua funcionando");
  });

  await check("CANAL LEGADO: linha pré-existente com e-mail fora do padrão permanece intacta e verificável (o gatilho só atua em INSERT e em UPDATE de tipo/valor)", async () => {
    await su.query("alter table public.insurance_official_channels disable trigger insurance_official_channels_recipient_guard");
    const row = (await su.query("insert into public.insurance_official_channels (project_id, entity_name, channel_type, channel_value, source_ref, created_by) values ($1,'Legado','EMAIL','Legado@Seguradora.INVALID',$2,$3) returning id", [PA, "ref-legado", uid(U.GESTOR)])).rows[0];
    await su.query("alter table public.insurance_official_channels enable trigger insurance_official_channels_recipient_guard");
    eq((await rpc(await as(U.GESTOR), "insurance_channel_verify", row.id)).verified, true, "verifica o legado");
    eq((await su.query("select channel_value v from public.insurance_official_channels where id=$1", [row.id])).rows[0].v, "Legado@Seguradora.INVALID", "valor legado intacto");
    eq(Number((await (await as(U.LEITURA)).query("select count(*)::int n from public.insurance_official_channels where id=$1", [row.id])).rows[0].n), 1, "leitura do legado continua");
  });

  await check("funções: SECURITY DEFINER com search_path vazio; anon sem EXECUTE; helper de confirmação sem EXECUTE para authenticated; normalizador não toca dados", async () => {
    for (const sig of ["acc_external_recipient_confirm(uuid,text,text,uuid,text,text,text)", "acc_recipient_domain_status(text)"]) {
      const f = (await su.query(`select prosecdef, proconfig, has_function_privilege('anon','public.${sig}','execute') anon, has_function_privilege('public','public.${sig}','execute') pub, has_function_privilege('authenticated','public.${sig}','execute') auth from pg_proc where oid='public.${sig}'::regprocedure`)).rows[0];
      ok(f.prosecdef, `${sig} definer`); eq(f.proconfig, ["search_path=\"\""], `${sig} search_path`); eq([f.anon, f.pub, f.auth], [false, false, true], `${sig} grants`);
    }
    const h = (await su.query("select has_function_privilege('authenticated','public.acc_external_recipient_confirmed(uuid,text,text,uuid)','execute') a, has_function_privilege('anon','public.acc_external_recipient_confirmed(uuid,text,text,uuid)','execute') b")).rows[0];
    eq([h.a, h.b], [false, false], "helper interno sem EXECUTE");
    const n = (await su.query("select provolatile, proconfig from pg_proc where oid='public.acc_email_normalize(text)'::regprocedure")).rows[0];
    eq(n.provolatile, "i", "IMMUTABLE"); eq(n.proconfig, ["search_path=\"\""], "search_path");
  });

  await check("P0: o hotfix de record_risk_alert_action não foi tocado por esta migration (função existe com ACL protegida)", async () => {
    const f = (await su.query("select prosecdef, proconfig, has_function_privilege('anon', p.oid, 'execute') anon, has_function_privilege('public', p.oid, 'execute') pub from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_risk_alert_action'")).rows;
    ok(f.length >= 1, "função existe");
    for (const r of f) { ok(r.prosecdef, "definer"); eq([r.anon, r.pub], [false, false], "anon/PUBLIC sem EXECUTE"); }
  });

  // ======================= MENU por nível: paridade com o banco =======================
  await check("MENU: para cada perfil, tier do banco == projectTierFor(TS) e a visibilidade do menu == permissão de LEITURA real do banco em Qualidade, Garantias e Seguros", async () => {
    const ROLE = { LEITURA: "LEITURA", COLABORADOR: "COLABORADOR", GESTOR: "GESTOR", GERENTE: "GERENTE", ADMINISTRADOR: "ADMINISTRADOR" };
    for (const [label, n, role] of PROFILES) {
      const c = await as(n, role);
      const tier = (await c.query("select public.acc_project_tier($1) t", [PA])).rows[0].t;
      eq(tier, T.projectTierFor(ROLE[label] ?? null, ROLE[label] ? "ACTIVE" : null), `tier ${label}`);
      const q = (await c.query("select public.quality_can_read($1) q, public.insurance_access($1,'READ') s", [PA])).rows[0];
      eq(N.canAccessSegment("qualidade", tier), q.q, `menu Qualidade == quality_can_read (${label})`);
      eq(N.canAccessSegment("garantias", tier), q.q, `menu Garantias == quality_can_read (${label})`);
      eq(N.canAccessSegment("seguros", tier), q.s, `menu Seguros == insurance_access READ (${label})`);
      eq(N.canAccessSegment("pilares", tier), q.q && q.s, `menu Pilares == leitura de Qualidade e Seguros (${label})`);
      // O que o menu esconde, o banco também não entrega: contagem de linhas visíveis (RLS) = 0 quando oculto.
      const rows = Number((await c.query("select (select count(*) from public.insurance_official_channels) + (select count(*) from public.quality_ncrs) as n")).rows[0].n);
      if (!N.canAccessSegment("seguros", tier) && !N.canAccessSegment("qualidade", tier)) eq(rows, 0, `${label}: menu oculto => RLS devolve 0 linhas`);
    }
  });

  await check("MENU: mudança de papel vale na PRÓXIMA chamada (sem cache): inativar o membro esconde os itens e o banco já nega", async () => {
    await mem(PA, U.PENDENTE, "LEITURA");
    const c = await as(U.PENDENTE);
    eq((await c.query("select public.acc_project_tier($1) t", [PA])).rows[0].t, "READ", "antes");
    ok(N.canAccessSegment("seguros", "READ"), "menu mostra");
    await su.query("update public.project_memberships set status='INACTIVE' where project_id=$1 and user_id=$2", [PA, uid(U.PENDENTE)]);
    const t2 = (await c.query("select public.acc_project_tier($1) t", [PA])).rows[0].t;
    eq(t2, "NONE", "depois");
    ok(!N.canAccessSegment("seguros", t2) && !N.canAccessSegment("qualidade", t2) && !N.canAccessSegment("garantias", t2) && !N.canAccessSegment("pilares", t2), "menu oculta os quatro");
    eq((await c.query("select public.insurance_access($1,'READ') v", [PA])).rows[0].v, false, "banco nega");
  });
} finally {
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
