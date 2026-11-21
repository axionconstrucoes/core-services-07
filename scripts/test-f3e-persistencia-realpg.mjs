// FASE 3 / E — PERSISTÊNCIA de pareceres de garantia, checklist RCC e sujeitos esperados em PostgreSQL REAL (adversarial).
// Replay de TODAS as migrations numa base descartável (acc_f3e_*, apagada no fim), identidade por claims JWT (request.jwt.claims + set role)
// e dados 100% SINTÉTICOS. Cobre CASO 10-14, 19, 20, 21, 22, 31, 33, 37, 38, 39 e os 'CASO F3-E-NN'. NÃO roda no CI.
// Uso: ACC_REALPG_URL=postgres://...@127.0.0.1:55434/postgres ACC_REALPG_PKG_DIR=<pasta com node_modules/pg> \
//   node scripts/test-f3e-persistencia-realpg.mjs        (sem ACC_REALPG_URL é PULADO, exit 0)
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const W = await import("../apps/web/lib/ai/legal/warranty-coverage.ts");
const CF = await import("../apps/web/lib/garantias/coverage-form.ts");
const OP = await import("../apps/web/lib/garantias/opinion.ts");
const PS = await import("../apps/web/lib/insurance-ui/persistence.ts");
const RCC = await import("../apps/web/lib/insurance/rcc-checklist.ts");
const SA = await import("../apps/web/lib/insurance/subjects-audit.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const pg = createRequire(path.join(process.env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
const dir = path.join(here, "..", "supabase", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
const MINE = files.filter((f) => /^202611234\d{5}_/.test(f));
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
const DENIED = /FORBIDDEN|AUTH_REQUIRED|permission denied|row-level security/i;

const admin = new pg.Client({ connectionString: url });
await admin.connect();
const version = (await admin.query("show server_version")).rows[0].server_version;
const dbName = `acc_f3e_${Date.now().toString(36)}`;
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
  console.log(`PostgreSQL ${version}: ${files.length} migrations aplicadas (+ ${MINE.length} da fase 3/E reaplicadas 2x) — base ${dbName}`);

  const uid = (n) => `00000000-0000-4000-8000-${String(3400 + n).padStart(12, "0")}`;
  const PA = "10000000-0000-4000-8000-0000000034a0";
  const PB = "10000000-0000-4000-8000-0000000034b0";
  const U = { ADMIN: 1, GESTOR: 2, GERENTE: 3, COLAB: 4, LEITURA: 5, INATIVO: 6, PENDENTE: 7, ADMINB: 8 };
  for (const n of Object.values(U)) {
    await su.query("insert into auth.users (id,email) values ($1,$2)", [uid(n), `f3e-${n}@axion.com.br`]);
    await su.query("insert into public.profiles (id,name,email) values ($1,$2,$3) on conflict (id) do nothing", [uid(n), `F3E ${n}`, `f3e-${n}@axion.com.br`]);
  }
  await su.query("insert into public.projects (id,name,code,client,location,start_date,baseline_end_date) values ($1,'Obra A','FEA','C','L','2026-01-01','2027-01-01'),($2,'Obra B','FEB','C','L','2026-01-01','2027-01-01')", [PA, PB]);
  const mem = (p, n, perm, status = "ACTIVE") => su.query("insert into public.project_memberships (project_id,user_id,permission,status) values ($1,$2,$3,$4)", [p, uid(n), perm, status]);
  await mem(PA, U.ADMIN, "ADMINISTRADOR");
  await mem(PA, U.GESTOR, "GESTOR");
  await mem(PA, U.GERENTE, "GERENTE");
  await mem(PA, U.COLAB, "COLABORADOR");
  await mem(PA, U.LEITURA, "LEITURA");
  await mem(PA, U.INATIVO, "ADMINISTRADOR", "INACTIVE");
  await mem(PB, U.ADMINB, "ADMINISTRADOR");
  await su.query("insert into public.project_member_invitations (project_id,email,name,permission,created_by) values ($1,$2,'Pendente','ADMINISTRADOR',$3)", [PA, `f3e-${U.PENDENTE}@axion.com.br`, uid(U.ADMIN)]);

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
  const rejects = async (promise, re, msg) => {
    try { await promise; } catch (e) { ok(re.test(e.message), `${msg}: erro inesperado "${e.message}"`); return e; }
    throw new Error(`${msg}: deveria ser recusado`);
  };
  const nq = async (sql, params = []) => Number((await su.query(sql, params)).rows[0].n);
  const J = (o) => JSON.stringify(o);

  // PERFIS: [rótulo, usuário, role db, nível]
  const PROFILES = [
    ["LEITURA", U.LEITURA, "authenticated", 1], ["COLABORADOR", U.COLAB, "authenticated", 2], ["GESTOR", U.GESTOR, "authenticated", 3],
    ["GERENTE", U.GERENTE, "authenticated", 3], ["ADMINISTRADOR", U.ADMIN, "authenticated", 4], ["INATIVO", U.INATIVO, "authenticated", 0],
    ["PENDENTE", U.PENDENTE, "authenticated", 0], ["OUTRO_PROJETO", U.ADMINB, "authenticated", 0], ["AUTHENTICATED_SEM_SUB", null, "authenticated", 0],
    ["ANON", null, "anon", 0],
  ];

  // ---------- fixtures ----------
  const seq = { n: 0 };
  const uniq = () => `${Date.now().toString(36)}-${(seq.n += 1)}`;
  const mkCase = async (project = PA, who = U.GESTOR) => rpc(await as(who), "quality_warranty_create", project, "Pintura externa", "Descolamento sintético da pintura", J({ origin_ref: `w-${uniq()}` }));
  const docOf = async (project, title = "Doc sintético") => (await su.query("insert into public.documents (project_id,kind,title) values ($1,'ESPECIFICACAO',$2) returning id", [project, title])).rows[0].id;
  const POL = { modality: "RC_CRUZADA", insurer_name: "Seguradora Sintética SA", coverage_start: "2026-01-01", coverage_end: "2027-01-01", max_amount: 1000000, status: "VIGENTE" };
  const mkPolicy = async (project = PA, who = U.ADMIN) => rpc(await as(who), "insurance_policy_create", project, J({ ...POL, policy_number: `P-${uniq()}`, source_document_id: await docOf(project) }));
  const mkClaim = async (policyId, who = U.ADMIN) => rpc(await as(who), "insurance_claim_open", PA, J({ claim_kind: "RC_CRUZADA", title: "Evento sintético", stage: "AVISO", policy_id: policyId, source_ref: `c-${uniq()}` }));

  // formulário COMPLETO e válido (todos os itens PREENCHIDO com fonte; opcionais NAO_APLICAVEL com justificativa)
  const SRC = "Contrato 001, cláusula 7 (sintético)";
  const fullForm = (signals = {}) => {
    const f = CF.emptyCoverageForm();
    for (const def of W.WARRANTY_COVERAGE_ITEMS) {
      f.items[def.key] = def.optional
        ? { status: "NAO_APLICAVEL", value: "", source: "Não cabível neste enquadramento (justificativa sintética)" }
        : { status: "PREENCHIDO", value: `conteúdo de ${def.key}`, source: SRC };
    }
    f.signals = { contractualWarranty: "VIGENTE", legalWarrantyPotential: "SIM", hiddenDefect: "NAO", claimDeadline: "DENTRO", maintenance: "COMPROVADA", legalControversy: false, ...signals };
    return f;
  };
  const payloadArgs = (built, expected, note = null) => {
    const p = built.payload;
    return [p.items, p.signals, p.conclusion, p.reasons, p.missing, p.referencesSnapshot, p.referencesVersion, p.engineVersion, expected, note].map((v, i) => ([0, 1, 3, 4, 5].includes(i) ? J(v) : v));
  };
  const saveOpinion = async (c, caseId, form, expected = 0, note = null) => {
    const built = OP.buildOpinionPayload(form);
    ok(built.ok, `payload do formulário inválido: ${built.errors?.join("; ")}`);
    return rpc(c, "quality_warranty_opinion_save", caseId, ...payloadArgs(built, expected, note));
  };

  // ======================= (1) PARECER: persistência, versões, append-only =======================
  await check("CASO F3-E-01) parecer imutável/append-only: v1 e v2 (supersedes); v1 preservada; UPDATE/DELETE/TRUNCATE bloqueados até para superusuário; INSERT direto negado", async () => {
    const c0 = await mkCase();
    const col = await as(U.COLAB);
    const v1 = await saveOpinion(col, c0.id, fullForm(), 0, "primeira avaliação");
    eq([v1.versionNo, v1.conclusion, v1.supersedesId], [1, "POTENCIALMENTE COBERTO", null], "v1");
    const v2 = await saveOpinion(await as(U.GESTOR), c0.id, fullForm({ legalControversy: true }), 1);
    eq([v2.versionNo, v2.conclusion, v2.supersedesId], [2, "COBERTURA CONDICIONADA", v1.id], "v2 supersede v1");
    const rows = (await su.query("select version_no, conclusion, supersedes_id, derived_by, engine_version, jsonb_array_length(items) n, route_to_human, jsonb_array_length(references_snapshot) refs from public.quality_warranty_coverage_opinions where warranty_case_id=$1 order by version_no", [c0.id])).rows;
    eq(rows.map((r) => [r.version_no, r.conclusion]), [[1, "POTENCIALMENTE COBERTO"], [2, "COBERTURA CONDICIONADA"]], "ambas as versões existem (nada sobrescrito)");
    ok(rows.every((r) => r.n === 16 && r.derived_by === "SERVER_TS_SQL_VERIFIED" && r.engine_version === OP.WARRANTY_COVERAGE_ENGINE_VERSION && r.refs > 0), "16 itens, derivação verificada, engine_version e snapshot de referências");
    eq(rows[1].route_to_human, true, "controvérsia => encaminhamento humano");
    for (const sql of ["update public.quality_warranty_coverage_opinions set conclusion='POTENCIALMENTE COBERTO'", "delete from public.quality_warranty_coverage_opinions", "truncate public.quality_warranty_coverage_opinions"]) {
      await rejects(su.query(sql), /F3E_APPEND_ONLY|F3E_NO_DELETE/, `superusuário: ${sql}`);
    }
    await rejects(col.query("insert into public.quality_warranty_coverage_opinions (project_id,warranty_case_id,version_no,engine_version,items,signals,conclusion,legal_controversy,route_to_human,created_by) values ($1,$2,9,'x','[]','{}','COBERTURA CONDICIONADA',false,false,$3)", [PA, c0.id, uid(U.COLAB)]), /permission denied/i, "INSERT direto");
    await rejects(col.query("update public.quality_warranty_coverage_opinions set note='x'"), /permission denied/i, "UPDATE direto");
    // leitura da lista de versões (mais recente primeiro)
    const list = await rpc(await as(U.LEITURA), "quality_warranty_opinion_versions", c0.id);
    eq(list.map((v) => v.versionNo), [2, 1], "lista mais recente primeiro");
    const mapped = OP.mapOpinionVersions(list);
    eq([mapped.length, mapped[0].conclusion], [2, "COBERTURA CONDICIONADA"], "mapeamento TS");
    eq(OP.formFromOpinion(mapped[1]).items["tipo-defeito"].source, SRC, "formFromOpinion recarrega a fonte");
  });

  await check("CASO F3-E-02) conclusão adulterada/digitada livremente é rejeitada (CONCLUSION_MISMATCH) e nada é gravado", async () => {
    const c0 = await mkCase();
    const col = await as(U.COLAB);
    const built = OP.buildOpinionPayload(fullForm());
    ok(built.ok, "payload base");
    const wrong = ["POTENCIALMENTE NÃO COBERTO", "COBERTURA CONDICIONADA", "INFORMAÇÕES INSUFICIENTES", "COBERTO", "", null];
    for (const w of wrong) {
      const args = payloadArgs(built, 0); args[2] = w;
      await rejects(rpc(col, "quality_warranty_opinion_save", c0.id, ...args), /CONCLUSION_MISMATCH/, `conclusão adulterada (${w})`);
    }
    // conclusão "NÃO COBERTO" por mera expiração (sem todos os regimes definidos) também é rejeitada pelo banco
    const expired = fullForm({ contractualWarranty: "DECORRIDA", legalWarrantyPotential: "INDETERMINADO", hiddenDefect: "INDETERMINADO", claimDeadline: "FORA" });
    const b2 = OP.buildOpinionPayload(expired);
    ok(b2.ok && b2.payload.conclusion === "COBERTURA CONDICIONADA", "TS: expiração não exclui automaticamente");
    const a2 = payloadArgs(b2, 0); a2[2] = "POTENCIALMENTE NÃO COBERTO";
    await rejects(rpc(col, "quality_warranty_opinion_save", c0.id, ...a2), /CONCLUSION_MISMATCH/, "NÃO COBERTO por expiração");
    // adulterar os itens depois de derivar (remove a fonte) também falha
    const b3 = OP.buildOpinionPayload(fullForm()); const a3 = payloadArgs(b3, 0);
    const items = JSON.parse(a3[0]); items[0].evidence = ""; a3[0] = J(items);
    await rejects(rpc(col, "quality_warranty_opinion_save", c0.id, ...a3), /ITEM_SOURCE_REQUIRED/, "item sem fonte");
    eq(await nq("select count(*)::int n from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id]), 0, "nada gravado");
  });

  await check("CASO F3-E-03) estrutura: item ausente/duplicado/fora de ordem/NAO_APLICAVEL em item obrigatório, sinais inválidos, versão esperada ausente", async () => {
    const c0 = await mkCase();
    const col = await as(U.COLAB);
    const base = OP.buildOpinionPayload(fullForm()).payload;
    const call = (mut, expected = 0) => {
      const items = JSON.parse(J(base.items)); const signals = JSON.parse(J(base.signals));
      const r = mut({ items, signals });
      return rpc(col, "quality_warranty_opinion_save", c0.id, J(r.items), J(r.signals), base.conclusion, J(base.reasons), J(base.missing), J(base.referencesSnapshot), base.referencesVersion, base.engineVersion, expected, null);
    };
    await rejects(call((x) => ({ ...x, items: x.items.slice(1) })), /INVALID_ITEMS/, "15 itens");
    await rejects(call((x) => { x.items[1].key = x.items[0].key; return x; }), /INVALID_ITEMS/, "duplicado");
    await rejects(call((x) => { [x.items[0], x.items[1]] = [x.items[1], x.items[0]]; return x; }), /INVALID_ITEMS/, "fora de ordem");
    await rejects(call((x) => { x.items[0].status = "NAO_APLICAVEL"; return x; }), /INVALID_ITEMS/, "NAO_APLICAVEL em item obrigatório");
    await rejects(call((x) => { x.items[0].status = "TALVEZ"; return x; }), /INVALID_ITEMS/, "status inválido");
    await rejects(call((x) => { x.signals.claimDeadline = "QUASE"; return x; }), /INVALID_SIGNALS/, "sinal inválido");
    await rejects(call((x) => { x.signals.legalControversy = "sim"; return x; }), /INVALID_SIGNALS/, "controvérsia não booleana");
    await rejects(call((x) => x, null), /EXPECTED_VERSION_REQUIRED/, "sem versão esperada");
    await rejects(rpc(col, "quality_warranty_opinion_save", c0.id, J(base.items), J(base.signals), base.conclusion, J(base.reasons), J(base.missing), J([{ id: "x" }]), base.referencesVersion, base.engineVersion, 0, null), /INVALID_INPUT/, "referência sem estado de verificação");
    eq(await nq("select count(*)::int n from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id]), 0, "nada gravado");
  });

  await check("PARIDADE SQL x TS: quality_warranty_coverage_check == deriveWarrantyCoverage em toda a grade de sinais x variantes de itens (conclusão, encaminhamento e itens fundamentais)", async () => {
    const c = await as(U.GESTOR);
    const variants = {
      completo: (f) => f,
      semDataEntrega: (f) => { f.items["data-entrega"] = { status: "SEM_DADOS", value: "", source: "" }; return f; },
      semFundamentacao: (f) => { f.items.fundamentacao = { status: "SEM_DADOS", value: "", source: "" }; return f; },
      opcionaisPreenchidos: (f) => { f.items["prazo-decadencial"] = { status: "PREENCHIDO", value: "5 anos?", source: "estudo sintético" }; return f; },
      itemSemFonte: (f) => { f.items["tipo-defeito"] = { status: "PREENCHIDO", value: "defeito", source: "" }; return f; },
      obrigatorioNaoAplicavel: (f) => { f.items["vicio-oculto"] = { status: "NAO_APLICAVEL", value: "", source: "porque sim" }; return f; },
    };
    let n = 0;
    for (const [vname, mut] of Object.entries(variants)) {
      for (const contractualWarranty of ["VIGENTE", "DECORRIDA", "NAO_PREVISTA", "NAO_INFORMADA"])
        for (const legalWarrantyPotential of ["SIM", "NAO", "INDETERMINADO"])
          for (const hiddenDefect of ["SIM", "NAO", "INDETERMINADO"])
            for (const claimDeadline of ["DENTRO", "FORA", "INDETERMINADO"])
              for (const maintenance of ["COMPROVADA", "NAO_COMPROVADA", "NAO_EXIGIDA", "SEM_DADOS"])
                for (const legalControversy of [false, true]) {
                  const form = mut(fullForm({ contractualWarranty, legalWarrantyPotential, hiddenDefect, claimDeadline, maintenance, legalControversy }));
                  const ev = CF.evaluateCoverageForm(form);
                  const sql = (await c.query("select public.quality_warranty_coverage_check($1::jsonb,$2::jsonb) r", [J(ev.items), J(form.signals)])).rows[0].r;
                  const label = `${vname}/${contractualWarranty}/${legalWarrantyPotential}/${hiddenDefect}/${claimDeadline}/${maintenance}/${legalControversy}`;
                  eq(sql.conclusion, ev.derivation.conclusion, `conclusão ${label}`);
                  eq(sql.route, ev.derivation.routeToHumanResponsible, `encaminhamento ${label}`);
                  eq([...sql.missingCore].sort(), [...ev.derivation.missingCoreItems].sort(), `itens fundamentais ${label}`);
                  n += 1;
                }
    }
    ok(n === 6 * 4 * 3 * 3 * 3 * 4 * 2, `grade completa: ${n}`);
    console.log(`     (${n} combinações conferidas)`);
  });

  await check("CASO 10/11/12/13/14/33) cenários de garantia persistidos: máquina em garantia, após término contratual (sem exclusão automática), vício oculto, solidez e segurança, manutenção não comprovada, dados insuficientes", async () => {
    const col = await as(U.COLAB);
    const run = async (label, form, expectConclusion, extra) => {
      const c0 = await mkCase();
      const r = await saveOpinion(col, c0.id, form);
      eq(r.conclusion, expectConclusion, label);
      const row = (await su.query("select * from public.quality_warranty_coverage_opinions where id=$1", [r.id])).rows[0];
      if (extra) extra(row);
      return row;
    };
    await run("CASO 10 máquina em garantia (vigente, dentro do prazo, manutenção comprovada)", fullForm(), "POTENCIALMENTE COBERTO");
    await run("CASO 11 máquina após término contratual: garantia decorrida NÃO exclui automaticamente", fullForm({ contractualWarranty: "DECORRIDA", legalWarrantyPotential: "INDETERMINADO", claimDeadline: "INDETERMINADO" }), "COBERTURA CONDICIONADA", (row) => ok(JSON.stringify(row.reasons).includes("NÃO exclui automaticamente"), "razão registra que a expiração não exclui"));
    await run("CASO 12 vício oculto", fullForm({ hiddenDefect: "SIM" }), "COBERTURA CONDICIONADA");
    await run("CASO 13 solidez e segurança (controvérsia => responsável humano)", fullForm({ legalControversy: true }), "COBERTURA CONDICIONADA", (row) => eq([row.legal_controversy, row.route_to_human], [true, true], "encaminhamento humano"));
    await run("CASO 11 garantia legal potencial com prazo de reclamação FORA não é 'potencialmente coberto' (SQL == TS)", fullForm({ contractualWarranty: "DECORRIDA", claimDeadline: "FORA" }), "COBERTURA CONDICIONADA");
    await run("CASO 14 ausência de comprovantes de manutenção", fullForm({ maintenance: "NAO_COMPROVADA" }), "COBERTURA CONDICIONADA");
    const empty = await run("CASO 33 dados insuficientes: formulário vazio", CF.emptyCoverageForm(), "INFORMAÇÕES INSUFICIENTES", (row) => ok(row.missing.length > 0, "itens SEM DADOS listados em missing"));
    ok(empty.items.every((i) => i.status === "SEM_DADOS" || i.status === "NAO_APLICAVEL" || i.status === "PREENCHIDO"), "itens persistidos");
    const neg = await run("NÃO COBERTO só com todos os regimes definidos, prazo FORA e fundamentação", fullForm({ contractualWarranty: "DECORRIDA", legalWarrantyPotential: "NAO", hiddenDefect: "NAO", claimDeadline: "FORA" }), "POTENCIALMENTE NÃO COBERTO");
    eq(neg.route_to_human, false, "sem controvérsia");
  });

  await check("CASO 38) concorrência: duas versões simultâneas do mesmo parecer (esperada 0) => uma vence, a outra VERSION_CONFLICT; sequência sem buracos", async () => {
    const c0 = await mkCase();
    const a = await as(U.COLAB); const b = await as(U.GESTOR);
    const settled = await Promise.allSettled([saveOpinion(a, c0.id, fullForm(), 0, "A"), saveOpinion(b, c0.id, fullForm({ legalControversy: true }), 0, "B")]);
    const okN = settled.filter((s) => s.status === "fulfilled").length;
    const bad = settled.filter((s) => s.status === "rejected");
    eq(okN, 1, "exatamente uma versão gravada");
    ok(bad.length === 1 && /VERSION_CONFLICT/.test(bad[0].reason.message), `a outra falha com VERSION_CONFLICT: ${bad[0]?.reason?.message}`);
    eq(await nq("select count(*)::int n from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id]), 1, "uma linha");
    // versão esperada defasada
    await rejects(saveOpinion(a, c0.id, fullForm(), 0), /VERSION_CONFLICT/, "versão defasada");
    await saveOpinion(a, c0.id, fullForm(), 1);
    // 4 gravações concorrentes da mesma versão esperada (2): uma só passa
    const cs = await Promise.all([1, 2, 3, 4].map((i) => as([U.COLAB, U.GESTOR, U.GERENTE, U.ADMIN][i % 4])));
    const res = await Promise.allSettled(cs.map((c) => saveOpinion(c, c0.id, fullForm(), 2)));
    eq(res.filter((s) => s.status === "fulfilled").length, 1, "uma vencedora entre 4");
    ok(res.filter((s) => s.status === "rejected").every((s) => /VERSION_CONFLICT/.test(s.reason.message)), "todas as demais VERSION_CONFLICT");
    eq((await su.query("select array_agg(version_no order by version_no) v from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id])).rows[0].v, [1, 2, 3], "versões 1..3 sem buracos");
  });

  await check("CASO 31/37/39) autorização do parecer: salvar exige REGISTER+, listar exige READ+; recusas sem efeito e sem auditoria; ator correto; isolamento entre projetos", async () => {
    const c0 = await mkCase();
    const cB = await mkCase(PB, U.ADMINB);
    const auditBefore = await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_WARRANTY_COVERAGE_OPINION_SAVED'");
    let saved = 0;
    for (const [label, n, role, tier] of PROFILES) {
      const c = await as(n, role);
      const mustSave = tier >= 2;
      let err = null; let r = null;
      try { r = await saveOpinion(c, c0.id, fullForm(), saved); } catch (e) { err = e; }
      if (mustSave) { ok(!err, `${label} deveria salvar: ${err?.message}`); saved += 1; eq(r.versionNo, saved, `${label}: versão`); }
      else ok(err && DENIED.test(err.message), `${label} deveria ser recusado ao salvar: ${err?.message ?? "passou"}`);
      let lerr = null; let list = null;
      try { list = await rpc(c, "quality_warranty_opinion_versions", c0.id); } catch (e) { lerr = e; }
      if (tier >= 1) ok(!lerr && list.length === saved, `${label} deveria listar ${saved} (err=${lerr?.message})`);
      else ok(lerr && DENIED.test(lerr.message), `${label} NÃO deveria listar: ${lerr?.message ?? "listou"}`);
      // leitura direta sob RLS
      let cnt = null; let derr = null;
      try { cnt = Number((await c.query("select count(*)::int n from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id])).rows[0].n); } catch (e) { derr = e; }
      if (tier >= 1) eq(cnt, saved, `${label}: RLS lê as versões do próprio projeto`);
      else ok(derr ? /permission denied/i.test(derr.message) : cnt === 0, `${label}: RLS não devolve nada (${cnt}/${derr?.message})`);
    }
    eq(saved, 4, "COLAB, GESTOR, GERENTE e ADMIN gravaram");
    eq(await nq("select count(*)::int n from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id]), 4, "só os 4 autorizados gravaram");
    eq((await nq("select count(*)::int n from public.audit_log_entries where action='QUALITY_WARRANTY_COVERAGE_OPINION_SAVED'")) - auditBefore, 4, "CASO 37: auditoria só das gravações autorizadas");
    const aud = (await su.query("select actor_user_id, entity_id from public.audit_log_entries where action='QUALITY_WARRANTY_COVERAGE_OPINION_SAVED' and entity_id=$1 order by created_at", [c0.id])).rows;
    eq(aud.map((a) => a.actor_user_id), [uid(U.COLAB), uid(U.GESTOR), uid(U.GERENTE), uid(U.ADMIN)], "ator de cada gravação");
    // CASO 39: isolamento
    const b = await as(U.ADMINB); const a = await as(U.ADMIN);
    await rejects(saveOpinion(b, c0.id, fullForm(), 4), DENIED, "ADMIN de B salvando parecer do caso de A");
    await rejects(rpc(b, "quality_warranty_opinion_versions", c0.id), DENIED, "ADMIN de B listando parecer de A");
    await rejects(saveOpinion(a, cB.id, fullForm(), 0), DENIED, "ADMIN de A salvando no caso de B");
    await rejects(saveOpinion(a, "00000000-0000-4000-8000-00000000dead", fullForm(), 0), DENIED, "caso inexistente (sem vazar existência)");
    eq(Number((await b.query("select count(*)::int n from public.quality_warranty_coverage_opinions where warranty_case_id=$1", [c0.id])).rows[0].n), 0, "RLS: B não vê pareceres de A");
    // uma versão do mesmo caso não pode ser gravada apontando para outro projeto
    const cFresh = await mkCase();
    await rejects(su.query("insert into public.quality_warranty_coverage_opinions (project_id,warranty_case_id,version_no,engine_version,items,signals,conclusion,legal_controversy,route_to_human,created_by) values ($1,$2,1,'x',$3::jsonb,'{}','COBERTURA CONDICIONADA',false,false,$4)", [PB, cFresh.id, J(Array(16).fill({})), uid(U.ADMINB)]), /foreign key/i, "FK composta por projeto");
  });

  // ======================= (2) CHECKLIST RCC =======================
  const rccFull = (docId) => {
    const a = {};
    for (const q of RCC.RCC_QUESTIONS) a[q.key] = { answer: `resposta sintética para ${q.key}`, source: docId ? { documentId: docId, ref: "Apólice, cláusula 3" } : { ref: "Apólice, cláusula 3" } };
    a.BENS_TERCEIROS_X_PROPRIA_OBRA.propertyScope = "BENS_TERCEIROS";
    return a;
  };
  const saveRcc = async (c, policyId, claimId, answers, expected, note = null) => {
    const call = PS.buildPersistenceCall({ projectId: PA, op: "rcc_save", policyId, claimId, rccAnswers: answers, expectedVersion: expected, note });
    return rpc(c, call.rpc, call.params.p_policy_id, call.params.p_claim_id, J(call.params.p_items), call.params.p_expected_version, call.params.p_note);
  };

  await check("CASO F3-E-04) RCC com FONTE obrigatória: resposta sem fonte recusada (SOURCE_REQUIRED); sem resposta = SEM DADOS; escopo do bem obrigatório; nada parcial gravado", async () => {
    const pol = await mkPolicy();
    const col = await as(U.COLAB);
    const bad = { items: [{ key: "CAUSADOR", answer: "A subcontratada X causou o dano" }] };
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J(bad.items), 0, null), /SOURCE_REQUIRED/, "resposta sem fonte");
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "BENS_TERCEIROS_X_PROPRIA_OBRA", answer: "dano ao pavimento", sourceRef: "Apólice cl. 4" }]), 0, null), /PROPERTY_SCOPE_REQUIRED/, "escopo do bem");
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "XPTO", answer: "x", sourceRef: "r" }]), 0, null), /INVALID_ITEMS/, "pergunta desconhecida");
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "CAUSADOR", answer: "a", sourceRef: "r" }, { key: "CAUSADOR", answer: "b", sourceRef: "r" }]), 0, null), /INVALID_ITEMS/, "duplicada");
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "VITIMA", sourceRef: "r" }]), 0, null), /INVALID_ITEMS/, "fonte sem resposta");
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "CAUSADOR", answer: "a", sourceRef: "r", propertyScope: "AMBOS" }]), 0, null), /INVALID_ITEMS/, "escopo em pergunta errada");
    eq(await nq("select count(*)::int n from public.insurance_rcc_checklists where policy_id=$1", [pol.id]), 0, "nada parcial gravado");
    // parcial válido: 2 respostas com fonte; o resto fica SEM DADOS (NULL), nunca presumido
    const r = await rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "CAUSADOR", answer: "Subcontratada X", sourceRef: "Relatório de ocorrência 12" }, { key: "VITIMA", answer: "Subcontratada Y", sourceRef: "Relatório de ocorrência 12" }]), 0, null);
    eq([r.versionNo, r.answeredWithSource, r.total], [1, 2, 10], "v1 com 2 respostas");
    const items = (await su.query("select question_key, answer, source_ref from public.insurance_rcc_checklist_items where checklist_id=$1 order by question_key", [r.id])).rows;
    eq(items.length, 10, "sempre 10 linhas");
    eq(items.filter((i) => i.answer === null).length, 8, "8 sem dado (NULL)");
    const got = PS.mapRccGet(await rpc(col, "insurance_rcc_checklist_get", pol.id, null));
    const ev = RCC.evaluateRccChecklist(got.latest.answers);
    eq([ev.answeredWithSource, ev.readyForCoverageAssessment], [2, false], "2/10 com fonte: NÃO apto para avaliação de cobertura");
  });

  await check("CASO 19/20) RCC entre subcontratadas e danos à própria obra: nada é presumido; checklist completo só é 'pronto' com as 10 respostas COM fonte; própria obra gera aviso", async () => {
    const pol = await mkPolicy();
    const col = await as(U.COLAB);
    const docId = await docOf(PA, "Apólice sintética");
    const full = rccFull(docId);
    full.BENS_TERCEIROS_X_PROPRIA_OBRA.propertyScope = "PROPRIA_OBRA";
    full.ABRANGENCIA_SEGURADOS.answer = "A apólice não especifica se subcontratadas são terceiras entre si";
    const r = await saveRcc(col, pol.id, null, full, 0);
    eq([r.versionNo, r.answeredWithSource], [1, 10], "10 respostas com fonte");
    const got = PS.mapRccGet(await rpc(col, "insurance_rcc_checklist_get", pol.id, null));
    const ev = RCC.evaluateRccChecklist(got.latest.answers);
    eq(ev.readyForCoverageAssessment, true, "10/10 com fonte");
    ok(ev.warnings.some((w) => /própria obra/i.test(w) && /NÃO presumir cobertura/i.test(w)), "aviso de própria obra (CASO 20)");
    ok(ev.neverPresumed.some((w) => /Subcontratadas/.test(w)) && ev.neverPresumed.some((w) => /danos à própria obra/.test(w)) && ev.neverPresumed.some((w) => /defeito de execução/.test(w)), "nunca presumido (CASO 19/20)");
    eq(got.latest.answers.BENS_TERCEIROS_X_PROPRIA_OBRA.propertyScope, "PROPRIA_OBRA", "escopo persistido");
    eq(got.latest.answers.CAUSADOR.source.documentId, docId, "fonte documental persistida");
  });

  await check("CASO F3-E-05) RCC versionado/append-only: v2 supersede v1; v1 intacta; VERSION_CONFLICT; evento do mesmo projeto e da MESMA apólice; documento de outro projeto recusado; UPDATE/DELETE bloqueados", async () => {
    const pol = await mkPolicy(); const pol2 = await mkPolicy();
    const claim = await mkClaim(pol.id);
    const col = await as(U.COLAB); const ger = await as(U.GERENTE);
    const answers = { CAUSADOR: { answer: "Subcontratada X", source: { ref: "RO 12" } } };
    const v1 = await saveRcc(col, pol.id, null, answers, 0);
    const v2 = await saveRcc(ger, pol.id, null, { ...answers, VITIMA: { answer: "Subcontratada Y", source: { ref: "RO 12" } } }, 1, "revisão");
    eq([v1.versionNo, v2.versionNo, v2.supersedesId], [1, 2, v1.id], "versões");
    await rejects(saveRcc(col, pol.id, null, answers, 1), /VERSION_CONFLICT/, "versão defasada");
    const c1 = await saveRcc(col, pol.id, claim.id, answers, 0); // sequência separada para o evento
    eq(c1.versionNo, 1, "evento tem a sua sequência");
    await rejects(saveRcc(col, pol2.id, claim.id, answers, 0), /CLAIM_POLICY_MISMATCH/, "evento de outra apólice");
    const docB = await docOf(PB, "Doc de B");
    await rejects(rpc(col, "insurance_rcc_checklist_save", pol.id, null, J([{ key: "CAUSADOR", answer: "x", sourceDocumentId: docB }]), 2, null), /REFERENCE_OUT_OF_PROJECT/, "documento de outro projeto");
    const items1 = (await su.query("select count(*)::int n from public.insurance_rcc_checklist_items where checklist_id=$1 and answer is not null", [v1.id])).rows[0].n;
    eq(items1, 1, "v1 preservada (1 resposta)");
    for (const sql of ["update public.insurance_rcc_checklists set note='x'", "delete from public.insurance_rcc_checklists", "update public.insurance_rcc_checklist_items set answer='x'", "delete from public.insurance_rcc_checklist_items", "truncate public.insurance_rcc_checklist_items"]) {
      await rejects(su.query(sql), /F3E_APPEND_ONLY|F3E_NO_DELETE/, sql);
    }
    const hist = PS.mapRccGet(await rpc(col, "insurance_rcc_checklist_get", pol.id, null));
    eq([hist.versions.map((v) => v.versionNo), hist.latest.versionNo], [[2, 1], 2], "histórico");
    // concorrência: 4 gravações simultâneas da mesma versão esperada => uma vence
    const cs = await Promise.all([1, 2, 3, 4].map((i) => as([U.COLAB, U.GESTOR, U.GERENTE, U.ADMIN][i % 4])));
    const res = await Promise.allSettled(cs.map((c) => saveRcc(c, pol.id, null, answers, 2)));
    eq(res.filter((s) => s.status === "fulfilled").length, 1, "uma vencedora");
    ok(res.filter((s) => s.status === "rejected").every((s) => /VERSION_CONFLICT/.test(s.reason.message)), "demais VERSION_CONFLICT");
  });

  await check("CASO 31/37/39) RCC: salvar exige REGISTER+, ler exige READ+; isolamento entre projetos; auditoria com ator", async () => {
    const pol = await mkPolicy();
    let saved = 0;
    for (const [label, n, role, tier] of PROFILES) {
      const c = await as(n, role);
      let err = null;
      try { await saveRcc(c, pol.id, null, { CAUSADOR: { answer: "A", source: { ref: "r" } } }, saved); } catch (e) { err = e; }
      if (tier >= 2) { ok(!err, `${label} deveria salvar: ${err?.message}`); saved += 1; }
      else ok(err && DENIED.test(err.message), `${label} deveria ser recusado: ${err?.message ?? "passou"}`);
      let rerr = null;
      try { await rpc(c, "insurance_rcc_checklist_get", pol.id, null); } catch (e) { rerr = e; }
      if (tier >= 1) ok(!rerr, `${label} deveria ler: ${rerr?.message}`); else ok(rerr && DENIED.test(rerr.message), `${label} NÃO deveria ler`);
    }
    eq(await nq("select count(*)::int n from public.insurance_rcc_checklists where policy_id=$1", [pol.id]), 4, "só os 4 autorizados gravaram");
    const aud = (await su.query("select actor_user_id from public.insurance_audit_events where entity_type='INSURANCE_RCC_CHECKLIST' and detail->>'policyId'=$1 order by occurred_at", [pol.id])).rows;
    eq(aud.map((a) => a.actor_user_id), [uid(U.COLAB), uid(U.GESTOR), uid(U.GERENTE), uid(U.ADMIN)], "CASO 37: ator de cada gravação");
    const b = await as(U.ADMINB);
    await rejects(saveRcc(b, pol.id, null, { CAUSADOR: { answer: "A", source: { ref: "r" } } }, 4), DENIED, "ADMIN de B gravando RCC de A");
    await rejects(rpc(b, "insurance_rcc_checklist_get", pol.id, null), DENIED, "ADMIN de B lendo RCC de A");
    eq(Number((await b.query("select count(*)::int n from public.insurance_rcc_checklist_items")).rows[0].n), 0, "RLS: B não vê itens de A");
    await rejects(rpc(await as(U.ADMIN), "insurance_rcc_checklist_save", "00000000-0000-4000-8000-00000000dead", null, "[]", 0, null), DENIED, "apólice inexistente");
  });

  // ======================= (3) SUJEITOS ESPERADOS =======================
  const subj = (partyRole, expectation, extra = {}) => ({ partyRole, expectation, sourceKind: "CONTRATO", sourceRef: "Contrato 001, cláusula 2", ...extra });
  const saveSubject = async (c, policyId, form, expected) => {
    const call = PS.buildPersistenceCall({ projectId: PA, op: "subject_save", policyId, subject: form, expectedVersion: expected });
    return rpc(c, call.rpc, call.params.p_policy_id, J(call.params.p_data), call.params.p_expected_version);
  };
  const addParty = (c, policy, data) => rpc(c, "insurance_policy_party_add", policy.id, policy.rowVersion ?? 1, J(data));

  await check("CASO 21/22 + F3-E-06) sujeitos esperados PERSISTIDOS comparados com a apólice: segurado incorreto, beneficiário final não identificado, sem presumir que o beneficiário deva ser segurado", async () => {
    const pol = await mkPolicy();
    const adm = await as(U.ADMIN);
    await addParty(adm, pol, { party_role: "SEGURADO", party_name: "Construtora Alfa Ltda", tax_id: "11.222.333/0001-81", source_ref: "Apólice p.1" });
    await addParty(adm, { id: pol.id, rowVersion: 2 }, { party_role: "TOMADOR", party_name: "Axion Engenharia", source_ref: "Apólice p.1" });
    const ger = await as(U.GERENTE);
    const parties = async () => (await su.query("select party_role as role, party_name as name, tax_id, identification_status from public.insurance_policy_parties where policy_id=$1", [pol.id])).rows.map((p) => ({ role: p.role, name: p.name, taxId: p.tax_id, identificationStatus: p.identification_status }));
    const audit = async () => SA.auditPolicySubjects(await parties(), PS.toAuditExpected(PS.mapExpectedSubjectsGet(await rpc(ger, "insurance_expected_subjects_get", pol.id)).current));
    const codes = async () => (await audit()).findings.map((f) => f.code);

    // sem expectativa persistida: o segurado não é conferido (não presume)
    ok((await codes()).includes("SEGURADO_NAO_CONFERIDO"), "sem expectativa: SEGURADO_NAO_CONFERIDO");
    // CASO 21: segurado esperado diferente do cadastrado
    const s1 = await saveSubject(ger, pol.id, subj("SEGURADO", "ESPERADO", { expectedName: "Incorporadora Beta SA", expectedTaxId: "12.345.678/0001-95" }), 0);
    eq(s1.versionNo, 1, "v1 do segurado esperado");
    const c1 = await codes();
    ok(c1.includes("SEGURADO_INCORRETO") && !c1.includes("SEGURADO_NAO_CONFERIDO"), `CASO 21 segurado incorreto: ${c1}`);
    // corrigir a expectativa (nova versão supersede): passa a coincidir
    const s2 = await saveSubject(ger, pol.id, subj("SEGURADO", "ESPERADO", { expectedName: "CONSTRUTORA ALFA LTDA", expectedTaxId: "11222333000181" }), 1);
    eq([s2.versionNo, s2.supersedesId], [2, s1.id], "v2 supersede v1");
    ok(!(await codes()).includes("SEGURADO_INCORRETO"), "CNPJ/nome coincidentes: sem SEGURADO_INCORRETO");
    // CASO 22: o contrato aponta proprietário final, mas a apólice não o identifica
    await saveSubject(ger, pol.id, subj("PROPRIETARIO_FINAL", "ESPERADO", { expectedName: "Cliente Final SA", sourceKind: "EDITAL" }), 0);
    ok((await codes()).includes("BENEFICIARIO_FINAL_NAO_IDENTIFICADO"), "CASO 22 beneficiário final não identificado");
    // apólice passa a trazer outro proprietário final => divergência (inferência), NÃO erro de segurado
    await addParty(adm, { id: pol.id, rowVersion: 3 }, { party_role: "PROPRIETARIO_FINAL", party_name: "Outra Empresa SA", tax_id: "55.566.677/0001-83", source_ref: "Apólice p.2" });
    const c3 = await audit();
    const div = c3.findings.find((f) => f.code === "SUJEITO_ESPERADO_DIVERGENTE");
    ok(div && div.epistemic === "INFERENCIA" && /Cliente Final SA/.test(div.text) && /Edital/.test(div.text), `divergência do proprietário final com a fonte: ${JSON.stringify(c3.findings.map((f) => f.code))}`);
    ok(!c3.findings.some((f) => f.code === "SEGURADO_INCORRETO"), "o proprietário final divergente não vira erro de segurado");
    ok(c3.notes.some((n) => /Não se presume que o beneficiário final deva figurar como segurado/.test(n)), "nota: não presume beneficiário = segurado");
    // NAO_ESPERADO: a fonte diz que o contrato não tem proprietário final; ainda assim a apólice traz um => INFO, sem exigir identificação
    await saveSubject(ger, pol.id, subj("PROPRIETARIO_FINAL", "NAO_ESPERADO", { sourceKind: "CONTRATO" }), 1);
    const c4 = await audit();
    ok(c4.findings.some((f) => f.code === "SUJEITO_NAO_ESPERADO_CADASTRADO" && f.severity === "INFO"), "NAO_ESPERADO cadastrado => INFO para conferir");
    ok(!c4.findings.some((f) => f.code === "BENEFICIARIO_FINAL_NAO_IDENTIFICADO"), "NAO_ESPERADO não exige identificação");
    const cur = PS.mapExpectedSubjectsGet(await rpc(ger, "insurance_expected_subjects_get", pol.id));
    eq([cur.current.length, cur.history.length], [2, 4], "2 papéis atuais, 4 versões no histórico");
    eq(cur.current.find((x) => x.partyRole === "SEGURADO").versionNo, 2, "versão atual do segurado");
  });

  await check("CASO F3-E-07) sujeitos esperados: fonte obrigatória, validação, VERSION_CONFLICT/corrida, append-only, documento de outro projeto, MANAGE+ (COLABORADOR e LEITURA recusados), isolamento", async () => {
    const pol = await mkPolicy();
    const ger = await as(U.GERENTE);
    const D = (o) => J({ party_role: "SEGURADO", expectation: "ESPERADO", expected_name: "X", source_kind: "CONTRATO", source_ref: "c1", ...o });
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D({ source_ref: null }), 0), /SOURCE_REQUIRED/, "sem fonte");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D({ expected_name: null }), 0), /INVALID_INPUT/, "ESPERADO sem nome/CNPJ");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D({ expectation: "NAO_ESPERADO" }), 0), /INVALID_INPUT/, "NAO_ESPERADO com nome");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D({ party_role: "CORRETOR" }), 0), /INVALID_INPUT/, "papel inválido");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D({ source_kind: "BOATO" }), 0), /INVALID_INPUT/, "tipo de fonte inválido");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D({ source_document_id: await docOf(PB) }), 0), /REFERENCE_OUT_OF_PROJECT/, "documento de outro projeto");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D(), null), /EXPECTED_VERSION_REQUIRED/, "sem versão esperada");
    eq(await nq("select count(*)::int n from public.insurance_expected_subjects where policy_id=$1", [pol.id]), 0, "nada gravado");
    const okR = await rpc(ger, "insurance_expected_subject_save", pol.id, D(), 0);
    eq(okR.versionNo, 1, "v1");
    await rejects(rpc(ger, "insurance_expected_subject_save", pol.id, D(), 0), /VERSION_CONFLICT/, "versão defasada");
    // corrida de 4 gravações simultâneas da versão esperada 1
    const cs = await Promise.all([1, 2, 3, 4].map((i) => as([U.GESTOR, U.GERENTE, U.ADMIN][i % 3])));
    const res = await Promise.allSettled(cs.map((c, i) => rpc(c, "insurance_expected_subject_save", pol.id, D({ expected_name: `Concorrente ${i}` }), 1)));
    eq(res.filter((s) => s.status === "fulfilled").length, 1, "uma vencedora");
    ok(res.filter((s) => s.status === "rejected").every((s) => /VERSION_CONFLICT/.test(s.reason.message)), "demais VERSION_CONFLICT");
    // papéis diferentes têm sequências independentes
    eq((await rpc(ger, "insurance_expected_subject_save", pol.id, D({ party_role: "TOMADOR" }), 0)).versionNo, 1, "sequência independente por papel");
    for (const sql of ["update public.insurance_expected_subjects set expected_name='y'", "delete from public.insurance_expected_subjects", "truncate public.insurance_expected_subjects"]) {
      await rejects(su.query(sql), /F3E_APPEND_ONLY|F3E_NO_DELETE/, sql);
    }
    // autorização por perfil (MANAGE+ grava; READ+ lê)
    let v = 0;
    const pol2 = await mkPolicy();
    for (const [label, n, role, tier] of PROFILES) {
      const c = await as(n, role);
      let err = null;
      try { await rpc(c, "insurance_expected_subject_save", pol2.id, D({ party_role: "BENEFICIARIO" }), v); } catch (e) { err = e; }
      if (tier >= 3) { ok(!err, `${label} deveria gravar: ${err?.message}`); v += 1; }
      else ok(err && DENIED.test(err.message), `${label} deveria ser recusado: ${err?.message ?? "passou"}`);
      let rerr = null;
      try { await rpc(c, "insurance_expected_subjects_get", pol2.id); } catch (e) { rerr = e; }
      if (tier >= 1) ok(!rerr, `${label} deveria ler: ${rerr?.message}`); else ok(rerr && DENIED.test(rerr.message), `${label} NÃO deveria ler`);
    }
    eq(v, 3, "GESTOR, GERENTE e ADMIN gravaram");
    eq(await nq("select count(*)::int n from public.insurance_expected_subjects where policy_id=$1", [pol2.id]), 3, "COLABORADOR/LEITURA/inativo/pendente/outro/anon não gravaram");
    const aud = (await su.query("select actor_user_id from public.insurance_audit_events where entity_type='INSURANCE_EXPECTED_SUBJECT' and detail->>'policyId'=$1 order by occurred_at", [pol2.id])).rows;
    eq(aud.map((a) => a.actor_user_id), [uid(U.GESTOR), uid(U.GERENTE), uid(U.ADMIN)], "CASO 37: auditoria com o ator correto");
    const b = await as(U.ADMINB);
    await rejects(rpc(b, "insurance_expected_subject_save", pol2.id, D(), 3), DENIED, "CASO 39: ADMIN de B gravando em A");
    await rejects(rpc(b, "insurance_expected_subjects_get", pol2.id), DENIED, "CASO 39: ADMIN de B lendo A");
    eq(Number((await b.query("select count(*)::int n from public.insurance_expected_subjects")).rows[0].n), 0, "RLS: B não vê sujeitos de A");
  });

  await check("CASO 32) persistência nova não abre envio real: nenhuma função nova envia nada; insurance_settings.real_send_enabled continua false e sem RPC para ligá-la", async () => {
    const bodies = (await su.query("select proname, prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('quality_warranty_opinion_save','quality_warranty_opinion_versions','quality_warranty_coverage_check','insurance_rcc_checklist_save','insurance_rcc_checklist_get','insurance_expected_subject_save','insurance_expected_subjects_get')")).rows;
    eq(bodies.length, 7, "as 7 funções existem");
    ok(bodies.every((b) => !/real_send_enabled|http_post|net\.http|pg_notify|dblink|send_mail/i.test(b.prosrc)), "nenhuma função toca na trava, rede ou e-mail");
    eq(await nq("select count(*)::int n from public.insurance_settings where real_send_enabled = true"), 0, "trava intacta");
    for (const f of ["quality_warranty_opinion_save(uuid,jsonb,jsonb,text,jsonb,jsonb,jsonb,text,text,integer,text)", "insurance_rcc_checklist_save(uuid,uuid,jsonb,integer,text)", "insurance_expected_subject_save(uuid,jsonb,integer)"]) {
      const g = (await su.query(`select has_function_privilege('anon','public.${f}','execute') a, has_function_privilege('public','public.${f}','execute') p, has_function_privilege('authenticated','public.${f}','execute') u, (select prosecdef from pg_proc where oid='public.${f}'::regprocedure) d, (select proconfig from pg_proc where oid='public.${f}'::regprocedure) c`)).rows[0];
      eq([g.a, g.p, g.u, g.d, g.c], [false, false, true, true, ['search_path=""']], `GRANTs/definer/search_path de ${f}`);
    }
  });
} finally {
  await su.end().catch(() => {});
  await admin.query(`drop database if exists ${dbName} with (force)`).catch(() => {});
  await admin.end().catch(() => {});
}
console.log(`\n${passed} OK, ${failed} FAIL`);
process.exit(failed === 0 ? 0 : 1);
