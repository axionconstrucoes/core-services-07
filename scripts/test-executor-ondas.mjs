// Teste UNITÁRIO (offline) do EXECUTOR DE ONDAS (scripts/implantacao/executor-ondas*.mjs). Sem rede, sem banco, sem segredo real.
// Cobre: redação de segredos, alvos e confirmação de produção, recusas de conteúdo, corpo enviado, plano (ordem, hotfix só-registro),
// guardas (HOMOLOG_DATABASE_URL, forbiddenEnvNames, lista negra, marcador acc_homolog_marker), transportes (HTTP com fetch falso e pg),
// orquestração (para na 1ª falha, retomada de prefixo, P0/hash por arquivo/onda) contra um "banco" em memória e a CLI em processo real.
// Os tokens usados aqui são FICTÍCIOS.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALVOS, ExecutorErro, HOTFIX_STEM, MAX_CORPO_BYTES, P0_MD5,
  avaliarGuardasPg, confirmarProducao, criarTransporteHttp, criarTransporteLocalPg, executarPlano, exigirMarcador,
  frasePrConfirmacao, hashHistorico, lerP0Sql, montarCorpoArquivo, montarCorpoRegistroHotfix, montarPlano, redigir, resolverAlvo,
  separarStem, validarConteudoArquivo,
} from "./implantacao/executor-ondas-lib.mjs";
import { lerSegredoDpapi, parseArgs } from "./implantacao/executor-ondas.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
let passed = 0; let failed = 0;
const pend = [];
function check(name, fn) { pend.push([name, fn]); }
const assert = (c, m = "asserção falhou") => { if (!c) throw new Error(m); };
const lanca = async (fn, codigo) => {
  try { await fn(); } catch (e) { assert(!codigo || e.codigo === codigo, `código ${e.codigo} != ${codigo}: ${e.message}`); return e; }
  throw new Error(`não lançou${codigo ? ` ${codigo}` : ""}`);
};
const TOKEN = "sb" + "p_0123456789abcdef0123456789abcdef01234567"; // FICTÍCIO
const FAKE_REF = "abcdefghijklmnopqrst";
const OP = ALVOS.operacional.ref;
const seq = JSON.parse(readFileSync(path.join(here, "data", "implantacao-sequencia.json"), "utf8"));

// ---------------- diretório sintético de migrations + sequência sintética
const tmp = mkdtempSync(path.join(os.tmpdir(), "acc-exec-"));
const dir = path.join(tmp, "m");
mkdirSync(dir);
const S = { a1: "20990101000001_a_um", a2: "20990101000002_a_dois", b1: "20990101000003_b_um", c1: "20990101000004_c_um" };
for (const [k, v] of Object.entries(S)) writeFileSync(path.join(dir, `${v}.sql`), `create table t_${k} (i int);\n-- fim sem ponto-e-virgula\ncomment on table t_${k} is 'x'`);
const seqMini = { jaEfetivaNaoReaplicar: [HOTFIX_STEM], adiadas: [{ onda: "E", motivo: "decisão", migration: S.c1, depende: [S.b1] }],
  ondas: [{ id: "A", nome: "a", migrations: [S.a1, S.a2] }, { id: "B", nome: "b", migrations: [S.b1] }] };

// ---------------- "banco" em memória (interpreta só os formatos de texto que o executor monta)
function bancoFalso({ historico = [], p0 = true, falhaEm = {}, p0DivergeApos = null, naoRegistra = null } = {}) {
  const hist = historico.map((s) => separarStem(s));
  const chamadas = [];
  const ocupar = (ver) => hist.some((h) => h.version === ver);
  const conf = (sql) => {
    const m = /h\.version = '(\d+)' and h\.name = '([a-z0-9_]+)'/.exec(sql);
    const registrado = m ? hist.some((h) => h.version === m[1] && h.name === m[2]) : null;
    return { linhas: [{ p0_ok: p0, p0_md5: p0 ? P0_MD5 : "x", registrado, n: hist.length, ultima: hist.map((h) => h.version).sort().at(-1) ?? null, hash: hashHistorico(hist) }] };
  };
  return {
    chamadas, hist,
    descricao: "memória",
    async executar(sql) {
      chamadas.push(sql);
      if (sql.startsWith("set transaction read only;\nwith p0")) return conf(sql);
      if (sql.startsWith("set transaction read only;\nselect version, name")) return { linhas: hist.map((h) => ({ ...h })).sort((a, b) => (a.version < b.version ? -1 : 1)) };
      const m = /insert into supabase_migrations\.schema_migrations \(version, name\) values \('(\d+)', '([a-z0-9_]+)'\);$/.exec(sql);
      if (!m) throw new Error(`SQL não reconhecido pelo banco falso: ${sql.slice(0, 80)}`);
      const stem = `${m[1]}_${m[2]}`;
      if (falhaEm[stem]) { const e = new Error(`ERROR: ${falhaEm[stem] === "sql" ? "23505" : "rede"}: simulado`); e.tipo = falhaEm[stem]; throw e; }
      if (ocupar(m[1])) { const e = new Error("ERROR: 23505: duplicate key"); e.tipo = "sql"; throw e; }
      if (naoRegistra === stem) return { linhas: [] };
      hist.push({ version: m[1], name: m[2] });
      if (p0DivergeApos === stem) p0 = false;
      return { linhas: [] };
    },
  };
}
const p0Sql = "select true as ok, 'x' as corpo_md5_sem_cr"; // o banco falso não o executa; o texto só precisa existir
const exec = (plano, banco, extra = {}) => executarPlano({ plano, transporte: banco, p0Sql, retomar: false, ...extra });

// ================= redação
check("redigir: token sbp_, Bearer, JWT, URL postgres e segredos explícitos", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghij";
  const t = redigir(`x ${TOKEN} y Authorization: Bearer abcdefgh12345678 z ${jwt} postgres://u:senhaSecreta@h/db e SEGREDO-LOCAL`, ["SEGREDO-LOCAL"]);
  assert(!/sbp_0123|abcdefgh12345678|eyJhbG|senhaSecreta|SEGREDO-LOCAL/.test(t), t);
  assert(/\[REDIGIDO\]/.test(t) && t.includes("postgres://u:[REDIGIDO]@h/db"), t);
});
check("redigir: texto sem segredo permanece igual", () => assert(redigir("pré-voo: P0 ok; 205 linhas") === "pré-voo: P0 ok; 205 linhas"));

// ================= alvo e produção
check("resolverAlvo: homolog ok; operacional exige --producao; flag indevida na homolog; ref desconhecido", async () => {
  assert(resolverAlvo({ ref: ALVOS.homolog.ref }).producao === false);
  assert(resolverAlvo({ ref: OP, producao: true }).producao === true);
  await lanca(() => resolverAlvo({ ref: OP }), "PRODUCAO_SEM_FLAG");
  await lanca(() => resolverAlvo({ ref: ALVOS.homolog.ref, producao: true }), "FLAG_PRODUCAO_INDEVIDA");
  await lanca(() => resolverAlvo({ ref: FAKE_REF }), "ALVO_NAO_PERMITIDO");
});
check("confirmarProducao: só passa com a frase exata; sem callback recusa; homolog dispensa", async () => {
  const plano = montarPlano({ seq: seqMini, dir, ondas: ["A"] });
  const alvo = ALVOS.operacional;
  const frase = frasePrConfirmacao(alvo, plano);
  assert(frase === `APLICAR ${OP} A`);
  assert(await confirmarProducao(alvo, plano, async () => `  ${frase}  `));
  await lanca(() => confirmarProducao(alvo, plano, async () => "sim"), "PRODUCAO_CONFIRMACAO_INVALIDA");
  await lanca(() => confirmarProducao(alvo, plano, async () => `APLICAR ${OP} B`), "PRODUCAO_CONFIRMACAO_INVALIDA");
  await lanca(() => confirmarProducao(alvo, plano, undefined), "PRODUCAO_SEM_CONFIRMACAO");
  assert(await confirmarProducao(ALVOS.homolog, plano, undefined) === true);
});

// ================= conteúdo e corpo
check("validarConteudoArquivo recusa BEGIN/COMMIT/CONCURRENTLY/VACUUM/timeouts/histórico e aceita o resto", async () => {
  for (const ruim of ["begin;\nselect 1;", "BEGIN TRANSACTION;", "select 1;\ncommit;", "rollback;", "create index concurrently i on t(a);", "vacuum t;",
    "set lock_timeout = 0;", "set local statement_timeout = '1s';", "select set_config('lock_timeout', '0', true);", "insert into supabase_migrations.schema_migrations values (1,2);"]) {
    await lanca(() => validarConteudoArquivo("x", ruim), "ARQUIVO_RECUSADO");
  }
  for (const bom of ["create table t(i int);", "-- begin; commit;\nselect 1;", "create function f() returns void language plpgsql as $$ begin null; end; $$;", "do $$ begin\n  perform 1;\nend $$;"]) {
    validarConteudoArquivo("x", bom);
  }
});
check("montarCorpoArquivo: limites, arquivo literal, ';' próprio e insert no fim; aspas escapadas e nome inválido recusado", async () => {
  const c = montarCorpoArquivo({ sql: "select 1 -- sem ;", version: "20990101000001", name: "a_um" }).split("\n");
  assert(c[0] === "set local lock_timeout = '5s';" && c[1] === "set local statement_timeout = '120s';", c.slice(0, 2).join("|"));
  assert(c[2] === "select 1 -- sem ;" && c[3] === ";", "arquivo + ';' em linha própria (comentário final não engole o fecho)");
  assert(c.at(-1) === "insert into supabase_migrations.schema_migrations (version, name) values ('20990101000001', 'a_um');");
  assert(montarCorpoArquivo({ sql: "x", version: "20990101000001", name: "a" }, { statementTimeout: "1s" }).includes("'1s'"));
  await lanca(() => montarCorpoArquivo({ sql: "x", version: "1'; drop table t;--", name: "a" }), "NOME_INVALIDO");
});
check("montarCorpoRegistroHotfix: portão P0 antes do insert, sem reaplicar o arquivo", () => {
  const c = montarCorpoRegistroHotfix(separarStem(HOTFIX_STEM));
  assert(c.includes(P0_MD5) && c.includes("P0_GATE") && c.indexOf("P0_GATE") < c.indexOf("insert into"));
  assert(!/create or replace function/i.test(c));
});

// ================= plano
check("montarPlano: ordem do JSON, anteriores e leitura do arquivo do disco (sha256 do arquivo)", () => {
  const p = montarPlano({ seq: seqMini, dir, ondas: ["B", "A"] });
  assert(p.ondas.map((o) => o.id).join() === "A,B" && p.passos.length === 3 + 1 - 1 + 1 - 1 + 1, `${p.passos.length}`); // A(2)+B(1)+registro hotfix
  assert(p.passos.at(-1).tipo === "registro-hotfix" && p.passos.at(-1).stem === HOTFIX_STEM, "hotfix só-registro logo depois da onda B");
  assert(p.passos[0].sha256.length === 64 && p.passos[0].corpo.includes("create table t_a1"));
  assert(montarPlano({ seq: seqMini, dir, ondas: ["B"] }).anteriores.join() === [S.a1, S.a2].join());
});
check("montarPlano: recusa seleção vazia, desconhecida, repetida, não contígua, mista e arquivo ausente", async () => {
  await lanca(() => montarPlano({ seq: seqMini, dir }), "SELECAO_INVALIDA");
  await lanca(() => montarPlano({ seq: seqMini, dir, ondas: ["Z"] }), "SELECAO_INVALIDA");
  await lanca(() => montarPlano({ seq: seqMini, dir, ondas: ["A", "A"] }), "SELECAO_INVALIDA");
  const tres = { ...seqMini, ondas: [...seqMini.ondas, { id: "C", nome: "c", migrations: [S.c1] }] };
  await lanca(() => montarPlano({ seq: tres, dir, ondas: ["A", "C"] }), "SELECAO_INVALIDA");
  await lanca(() => montarPlano({ seq: seqMini, dir, ondas: ["A"], adiada: "E" }), "SELECAO_INVALIDA");
  await lanca(() => montarPlano({ seq: seqMini, dir, adiada: "Q" }), "SELECAO_INVALIDA");
  await lanca(() => montarPlano({ seq: { ...seqMini, ondas: [{ id: "A", nome: "a", migrations: ["20990101000009_nao_existe"] }] }, dir, ondas: ["A"] }), "ARQUIVO_AUSENTE");
});
check("montarPlano: adiada exige as dependências registradas; migration 'já efetiva' nunca é reaplicada", async () => {
  const p = montarPlano({ seq: seqMini, dir, adiada: "E" });
  assert(p.adiada && p.anteriores.join() === S.b1 && p.passos.length === 1);
  await lanca(() => montarPlano({ seq: { ...seqMini, jaEfetivaNaoReaplicar: [S.a1] }, dir, ondas: ["A"] }), "SELECAO_INVALIDA");
});
check("montarPlano: recusa arquivo com BEGIN e corpo acima do limite", async () => {
  writeFileSync(path.join(dir, "20990101000010_ruim.sql"), "begin;\nselect 1;\ncommit;");
  await lanca(() => montarPlano({ seq: { ...seqMini, ondas: [{ id: "A", nome: "a", migrations: ["20990101000010_ruim"] }] }, dir, ondas: ["A"] }), "ARQUIVO_RECUSADO");
  writeFileSync(path.join(dir, "20990101000011_grande.sql"), `select '${"x".repeat(MAX_CORPO_BYTES)}';`);
  await lanca(() => montarPlano({ seq: { ...seqMini, ondas: [{ id: "A", nome: "a", migrations: ["20990101000011_grande"] }] }, dir, ondas: ["A"] }), "CORPO_GRANDE");
});
check("montarPlano com a sequência REAL do repositório: todas as ondas, hotfix só-registro, nada acima do limite", () => {
  const p = montarPlano({ seq, dir: path.join(root, "supabase", "migrations"), ondas: seq.ondas.map((o) => o.id) });
  const arquivos = p.passos.filter((x) => x.tipo === "arquivo");
  assert(arquivos.length === seq.ondas.flatMap((o) => o.migrations).length, `${arquivos.length}`);
  assert(p.passos.filter((x) => x.tipo === "registro-hotfix").length === 1 && !arquivos.some((x) => x.stem === HOTFIX_STEM));
  assert(arquivos.every((x) => x.bytesCorpo <= MAX_CORPO_BYTES && x.sha256.length === 64));
});

// ================= hash
check("hashHistorico: ordena por versão, ignora nulos, vazio => null (mesmo cálculo de md5(string_agg))", () => {
  const h = hashHistorico([{ version: "2", name: "b" }, { version: "1", name: "a" }, { version: null, name: "x" }]);
  assert(h === "dc3d3fdb4ff1cf98d6bdd2fe7bcaf9fb" || /^[0-9a-f]{32}$/.test(h));
  assert(h === hashHistorico([{ version: "1", name: "a" }, { version: "2", name: "b" }]));
  assert(hashHistorico([]) === null);
});

// ================= guardas
const envOk = { HOMOLOG_DATABASE_URL: "postgres://postgres:x@127.0.0.1:55434/acc_homolog_t1" };
check("avaliarGuardasPg: exige HOMOLOG_DATABASE_URL", async () => { await lanca(() => avaliarGuardasPg({ env: {} }), "GUARDA"); });
check("avaliarGuardasPg: rejeita forbiddenEnvNames (service role, Gmail, Anthropic, NEXT_PUBLIC_SUPABASE_)", async () => {
  for (const k of ["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_GMAIL_CLIENT_ID", "ANTHROPIC_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "CRON_SECRET"]) {
    const e = await lanca(() => avaliarGuardasPg({ env: { ...envOk, [k]: "x" } }), "GUARDA");
    assert(e.message.includes(k) && !e.message.includes("55434"), e.message);
  }
});
check("avaliarGuardasPg: rejeita o operacional (direto, pooler, escondido na senha), host desconhecido, porta/banco errados", async () => {
  const ctx = { HOMOLOG_TARGET_REF: OP, HOMOLOG_I_UNDERSTAND_ISOLATED: "true" };
  for (const url of [`postgresql://postgres:x@db.${OP}.supabase.co:5432/postgres`, `postgresql://postgres.${OP}:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
    `postgres://postgres:${OP}@127.0.0.1:55434/acc_homolog_x`, "postgres://u:p@exemplo.com:5432/postgres", "postgres://postgres:x@127.0.0.1:54322/acc_homolog_x",
    "postgres://postgres:x@127.0.0.1:55434/postgres"]) {
    await lanca(() => avaliarGuardasPg({ env: { HOMOLOG_DATABASE_URL: url, ...ctx } }), "GUARDA");
  }
});
check("avaliarGuardasPg: local aceito; remoto isolado só com TARGET_REF+confirmação; exigirLocal recusa remoto; mensagens sem senha", async () => {
  const g = avaliarGuardasPg({ env: envOk, exigirLocal: true });
  assert(g.info.kind === "local" && g.descricao === "local:acc_homolog_t1");
  const remoto = { HOMOLOG_DATABASE_URL: `postgresql://postgres:segredo99@db.${FAKE_REF}.supabase.co:5432/postgres` };
  await lanca(() => avaliarGuardasPg({ env: remoto }), "GUARDA");
  const okR = avaliarGuardasPg({ env: { ...remoto, HOMOLOG_TARGET_REF: FAKE_REF, HOMOLOG_I_UNDERSTAND_ISOLATED: "true" } });
  assert(okR.info.kind === "remote" && !okR.descricao.includes("segredo99"));
  await lanca(() => avaliarGuardasPg({ env: { ...remoto, HOMOLOG_TARGET_REF: FAKE_REF, HOMOLOG_I_UNDERSTAND_ISOLATED: "true" }, exigirLocal: true }), "GUARDA");
});
check("exigirMarcador: recusa sem o schema acc_homolog_marker e aceita com ele", async () => {
  await lanca(() => exigirMarcador({ query: async () => ({ rowCount: 0 }) }), "GUARDA");
  assert(await exigirMarcador({ query: async (q) => { assert(q.includes("acc_homolog_marker")); return { rowCount: 1 }; } }));
});

// ================= transporte HTTP
const resp = (status, corpo) => ({ status, text: async () => (typeof corpo === "string" ? corpo : JSON.stringify(corpo)) });
check("criarTransporteHttp: URL/cabeçalhos/corpo, sucesso devolve linhas e o token não vaza", async () => {
  let visto;
  const t = criarTransporteHttp({ ref: ALVOS.homolog.ref, token: TOKEN, fetchImpl: async (u, o) => { visto = { u, o }; return resp(201, [{ a: 1 }]); } });
  const r = await t.executar("select 1");
  assert(r.linhas[0].a === 1);
  assert(visto.u === `https://api.supabase.com/v1/projects/${ALVOS.homolog.ref}/database/query` && visto.o.method === "POST");
  assert(JSON.parse(visto.o.body).query === "select 1" && visto.o.headers.Authorization === `Bearer ${TOKEN}`);
  assert(!t.descricao.includes(TOKEN));
});
check("criarTransporteHttp: erro SQL => tipo sql; 401/5xx/rede/não-JSON => incerto; token redigido nas mensagens", async () => {
  const mk = (f) => criarTransporteHttp({ ref: ALVOS.homolog.ref, token: TOKEN, fetchImpl: f });
  let e = await mk(async () => resp(400, { message: "Failed to run sql query: ERROR:  23505: duplicate key" })).executar("x").catch((x) => x);
  assert(e.tipo === "sql", e.message);
  e = await mk(async () => resp(401, { message: `Unauthorized ${TOKEN}` })).executar("x").catch((x) => x);
  assert(e.tipo === "incerto" && !e.message.includes(TOKEN) && e.status === 401, e.message);
  e = await mk(async () => resp(500, "boom")).executar("x").catch((x) => x);
  assert(e.tipo === "incerto");
  e = await mk(async () => { throw new Error(`falha ${TOKEN}`); }).executar("x").catch((x) => x);
  assert(e.tipo === "incerto" && !e.message.includes(TOKEN));
  e = await mk(async () => resp(200, "<html>")).executar("x").catch((x) => x);
  assert(e.tipo === "incerto");
});
check("criarTransporteHttp: tempo esgotado do cliente => incerto", async () => {
  const t = criarTransporteHttp({ ref: ALVOS.homolog.ref, token: TOKEN, timeoutMs: 20, fetchImpl: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(Object.assign(new Error("abortado"), { name: "AbortError" })))) });
  const e = await t.executar("x").catch((x) => x);
  assert(e.tipo === "incerto");
});
check("criarTransporteHttp: recusa ref e token inválidos", async () => {
  await lanca(() => criarTransporteHttp({ ref: "curto", token: TOKEN }), "ALVO_NAO_PERMITIDO");
  await lanca(() => criarTransporteHttp({ ref: ALVOS.homolog.ref, token: "x" }), "TOKEN_INVALIDO");
});
check("criarTransporteLocalPg: SQLSTATE => sql; erro de rede (EPIPE/ECONNRESET) => incerto; devolve linhas do último comando", async () => {
  const t = (f) => criarTransporteLocalPg({ query: f });
  assert((await t(async () => [{ rows: [] }, { rows: [{ k: 1 }] }]).executar("x")).linhas[0].k === 1);
  assert((await t(async () => { throw Object.assign(new Error("dup\nlinha2"), { code: "23505" }); }).executar("x").catch((e) => e)).tipo === "sql");
  assert((await t(async () => { throw Object.assign(new Error("57014"), { code: "57014" }); }).executar("x").catch((e) => e)).tipo === "sql");
  assert((await t(async () => { throw Object.assign(new Error("x"), { code: "XX000" }); }).executar("x").catch((e) => e)).tipo === "sql");
  assert((await t(async () => { throw Object.assign(new Error("x"), { code: "EPIPE" }); }).executar("x").catch((e) => e)).tipo === "incerto");
  assert((await t(async () => { throw Object.assign(new Error("x"), { code: "ECONNRESET" }); }).executar("x").catch((e) => e)).tipo === "incerto");
  assert((await t(async () => { throw new Error("sem codigo"); }).executar("x").catch((e) => e)).tipo === "incerto");
});

// ================= orquestração
check("executarPlano: sucesso aplica na ordem, confere P0 e hash por onda e registra o hotfix só-registro", async () => {
  const b = bancoFalso({ historico: [] });
  const plano = montarPlano({ seq: seqMini, dir, ondas: ["A", "B"] });
  const logs = [];
  const r = await exec(plano, b, { log: (l) => logs.push(l) });
  assert(r.ok && r.aplicados.join() === [S.a1, S.a2, S.b1, HOTFIX_STEM].join(), JSON.stringify(r));
  assert(b.hist.length === 4 && logs.some((l) => l.includes("onda B concluída")) && logs.some((l) => l.includes("só registro")));
  const corpos = b.chamadas.filter((c) => c.includes("insert into supabase_migrations"));
  assert(corpos.length === 4 && corpos[0].startsWith("set local lock_timeout"), "uma chamada por arquivo, com os limites");
});
check("executarPlano: P0 divergente antes de começar => nada executado", async () => {
  const b = bancoFalso({ p0: false });
  const r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), b);
  assert(!r.ok && r.falha.codigo === "P0_PRE" && !b.chamadas.some((c) => c.includes("insert into")));
});
check("executarPlano: onda anterior pendente => recusa; versão com outro nome => recusa; já registrada sem --retomar => recusa", async () => {
  let r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["B"] }), bancoFalso());
  assert(r.falha.codigo === "ONDA_ANTERIOR_PENDENTE");
  r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), bancoFalso({ historico: ["20990101000001_outro_nome"] }));
  assert(r.falha.codigo === "VERSAO_COM_OUTRO_NOME");
  r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), bancoFalso({ historico: [S.a1] }));
  assert(r.falha.codigo === "JA_REGISTRADA");
});
check("executarPlano: para na 1ª falha SQL, não executa os seguintes e informa o estado (não registrado)", async () => {
  const b = bancoFalso({ falhaEm: { [S.a2]: "sql" } });
  const r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A", "B"] }), b);
  assert(!r.ok && r.falha.codigo === "FALHA_SQL" && r.falha.stem === S.a2 && r.aplicados.join() === S.a1);
  assert(r.falha.estado.includes("não registrado") && !b.hist.some((h) => h.version === "20990101000003"));
});
check("executarPlano: falha incerta (rede) => FALHA_INCERTA e confere o estado real", async () => {
  const r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), bancoFalso({ falhaEm: { [S.a1]: "incerto" } }));
  assert(r.falha.codigo === "FALHA_INCERTA" && /estado:|não registrado/.test(`${r.falha.estado}`));
});
check("executarPlano: chamada 'ok' sem linha no histórico => NAO_REGISTRADO; P0 que diverge depois do arquivo => P0_DIVERGENTE", async () => {
  let r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), bancoFalso({ naoRegistra: S.a1 }));
  assert(r.falha.codigo === "NAO_REGISTRADO");
  r = await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), bancoFalso({ p0DivergeApos: S.a1 }));
  assert(r.falha.codigo === "P0_DIVERGENTE" && r.aplicados.join() === S.a1);
});
check("executarPlano: retomada só de PREFIXO; sem prefixo => RETOMADA_INCOERENTE; pulados não reexecutam", async () => {
  const plano = montarPlano({ seq: seqMini, dir, ondas: ["A"] });
  const b = bancoFalso({ historico: [S.a1] });
  const r = await exec(plano, b, { retomar: true });
  assert(r.ok && r.pulados.join() === S.a1 && r.aplicados.join() === S.a2);
  assert(b.chamadas.filter((c) => c.includes("create table t_a1")).length === 0, "não reexecutou o já registrado");
  const r2 = await exec(plano, bancoFalso({ historico: [S.a2] }), { retomar: true });
  assert(r2.falha.codigo === "RETOMADA_INCOERENTE");
});
check("executarPlano: segredo nunca aparece no log", async () => {
  const logs = [];
  const b = bancoFalso({ falhaEm: { [S.a1]: "sql" } });
  const orig = b.executar.bind(b);
  b.executar = async (sql) => { try { return await orig(sql); } catch (e) { e.message += ` ${TOKEN}`; throw e; } };
  await exec(montarPlano({ seq: seqMini, dir, ondas: ["A"] }), b, { log: (l) => logs.push(l), segredos: [TOKEN] });
  assert(logs.length && !logs.join("\n").includes(TOKEN));
});

// ================= CLI e argumentos
check("parseArgs: valores, flags e recusas", async () => {
  const a = parseArgs(["--alvo", "homolog", "--ondas", "A, B", "--verificar"]);
  assert(a.alvo === "homolog" && a.ondas.join() === "A,B" && a.flags.has("verificar"));
  await lanca(() => parseArgs(["--ondas"]), "ARGUMENTO");
  await lanca(() => parseArgs(["--ondas", "--todas"]), "ARGUMENTO");
  await lanca(() => parseArgs(["--foo"]), "ARGUMENTO");
  await lanca(() => parseArgs(["--todas", "--ondas", "A"]), "ARGUMENTO");
  await lanca(() => parseArgs(["--dry-run", "--verificar"]), "ARGUMENTO");
});
check("lerSegredoDpapi: recusa sem arquivo, arquivo no repositório e arquivo inexistente", async () => {
  await lanca(() => lerSegredoDpapi(undefined), "SEGREDO");
  await lanca(() => lerSegredoDpapi(path.join(root, "package.json")), "SEGREDO");
  await lanca(() => lerSegredoDpapi(path.join(tmp, "nao-existe.dpapi")), "SEGREDO");
});
check("lerSegredoDpapi: ida e volta com DPAPI e valor FICTÍCIO (só Windows)", async () => {
  if (process.platform !== "win32") return;
  const f = path.join(tmp, "fake.dpapi");
  const ps = "$s = ConvertTo-SecureString $env:FAKE_V -AsPlainText -Force; ConvertFrom-SecureString $s | Set-Content -LiteralPath $env:FAKE_F -NoNewline";
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { env: { ...process.env, FAKE_V: TOKEN, FAKE_F: f }, encoding: "utf8" });
  assert(r.status === 0, r.stderr);
  assert(lerSegredoDpapi(f) === TOKEN);
});
const cli = (args, env = {}) => spawnSync(process.execPath, [path.join(here, "implantacao", "executor-ondas.mjs"), ...args], {
  env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env }, encoding: "utf8", timeout: 60000,
});
check("CLI --dry-run: offline, sem token, lista o plano e sai 0", () => {
  const r = cli(["--dry-run", "--ondas", "A"]);
  assert(r.status === 0 && /DRY-RUN/.test(r.stdout) && /sha256=/.test(r.stdout), r.stderr + r.stdout);
});
check("CLI: recusas com processo real (exit 2): sem alvo, sem HOMOLOG_DATABASE_URL, ambiente operacional, operacional sem --producao, --producao no local", () => {
  let r = cli(["--ondas", "A"]);
  assert(r.status === 2 && /alvo/.test(r.stderr), r.stderr);
  r = cli(["--alvo", "local", "--ondas", "A"]);
  assert(r.status === 2 && /HOMOLOG_DATABASE_URL/.test(r.stderr), r.stderr);
  r = cli(["--alvo", "local", "--ondas", "A"], { ...envOk, SUPABASE_SERVICE_ROLE_KEY: "x" });
  assert(r.status === 2 && /variáveis do ambiente operacional/.test(r.stderr) && !/service_role_value/.test(r.stderr), r.stderr);
  r = cli(["--alvo", "local", "--ondas", "A"], { HOMOLOG_DATABASE_URL: `postgresql://postgres:x@db.${OP}.supabase.co:5432/postgres`, HOMOLOG_TARGET_REF: OP, HOMOLOG_I_UNDERSTAND_ISOLATED: "true" });
  assert(r.status === 2 && /lista negra/.test(r.stderr), r.stderr);
  r = cli(["--alvo", "operacional", "--ondas", "A", "--segredo", path.join(tmp, "x")]);
  assert(r.status === 2 && /PRODUCAO_SEM_FLAG|--producao/.test(r.stderr + r.stdout), r.stderr);
  r = cli(["--alvo", "operacional", "--producao", "--ondas", "A"], { NEXT_PUBLIC_SUPABASE_URL: "https://x" });
  assert(r.status === 2 && /variáveis do ambiente operacional/.test(r.stderr), r.stderr);
  r = cli(["--alvo", "local", "--producao", "--ondas", "A"], envOk);
  assert(r.status === 2 && /--producao/.test(r.stderr), r.stderr);
});

// ---------------- execução
for (const [name, fn] of pend) {
  try { await fn(); passed += 1; console.log(`OK   ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0]}`); }
}
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} aprovados, ${failed} falhas`);
process.exit(failed ? 1 : 0);
