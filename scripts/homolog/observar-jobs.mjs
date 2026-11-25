// Janela de observacao dos 11 jobs pg_cron no acc-homolog (SOMENTE homologacao; pela guarda openGuardedTarget).
// Fases: (0) baseline (fingerprints + contagem de linhas de TODAS as tabelas de public + estado dos jobs); (1) pausar (6-pg-cron-pausar.sql);
// (2) observar --pausa-min (padrao 10) amostrando a cada 30 s: execucoes novas (esperado 0), jobs ativos (esperado 0), em execucao;
// integridade na pausa: contagem de linhas igual a do baseline (ninguem escreve); (3) retomar (7-pg-cron-retomar.sql);
// (4) observar --pos-min (padrao 4): execucoes por job, duplicidade (mesmo job, mesmo minuto), falhas; (5) fingerprints iguais ao baseline.
// Uso: executar-homolog.ps1 -Etapa observar -Extra "--pausa-min=10 --pos-min=4"
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openGuardedTarget } from "./connect.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n, d) => Number((process.argv.find((a) => a.startsWith(`--${n}=`)) ?? `--${n}=${d}`).split("=")[1]);
const PAUSA_MIN = arg("pausa-min", 10);
const POS_MIN = arg("pos-min", 4);
const sqlFile = (f) => readFileSync(path.join(root, "docs", "implantacao", "congelamento", f), "utf8").replace(/^﻿/, "");
const { db } = await openGuardedTarget({ requireMarker: true });
const ts = () => new Date().toISOString().slice(11, 19);
const log = (m) => console.log(`[${ts()}] ${m}`);
let ok = 0, falha = 0;
const check = (nome, cond, det = "") => { if (cond) ok += 1; else falha += 1; log(`${cond ? "OK  " : "FAIL"} ${nome}${det ? ` | ${det}` : ""}`); };
const q = async (sql, p) => (await db.query(sql, p)).rows;
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

const FP = `select
 (select md5(string_agg(p.oid::regprocedure::text||coalesce(p.proacl::text,''), ',' order by p.oid::regprocedure::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') acl_funcoes,
 (select md5(string_agg(c.oid::regclass::text||coalesce(c.relacl::text,''), ',' order by c.oid::regclass::text)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v','m','p')) acl_tabelas,
 (select md5(string_agg(schemaname||'.'||tablename||'.'||policyname||coalesce(qual,'')||coalesce(with_check,''), ',' order by schemaname,tablename,policyname)) from pg_policies where schemaname in ('public','storage')) politicas,
 (select md5(string_agg(c.relname||'.'||t.tgname, ',' order by c.relname,t.tgname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) gatilhos,
 (select md5(string_agg(jobid||jobname||schedule||active::text, ',' order by jobid)) from cron.job) cron,
 (select md5(string_agg(version||'_'||coalesce(name,''), ',' order by version)) from supabase_migrations.schema_migrations) historico,
 (select md5(replace(prosrc, chr(13), '')) from pg_proc where oid=to_regprocedure('public.record_risk_alert_action(uuid,text,jsonb)')) p0`;
const CONTAGENS = `select c.relname t, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::int n
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p') order by 1`;
const mapa = (rows) => Object.fromEntries(rows.map((r) => [r.t, r.n]));

try {
  const alvo = (await q("select current_database() db, (select count(*) from pg_namespace where nspname='acc_homolog_marker') marcador"))[0];
  log(`alvo: db=${alvo.db} marcador=${alvo.marcador} | pausa=${PAUSA_MIN} min, pos=${POS_MIN} min`);

  // (0) baseline
  const fp0 = (await q(FP))[0];
  const cont0 = mapa(await q(CONTAGENS));
  const jobs0 = await q("select jobid, jobname, active, schedule from cron.job order by jobid");
  log(`baseline: ${jobs0.length} jobs (${jobs0.filter((j) => j.active).length} ativos), ${Object.keys(cont0).length} tabelas, ${Object.values(cont0).reduce((a, b) => a + b, 0)} linhas`);
  check("baseline: 11 jobs, todos ativos", jobs0.length === 11 && jobs0.every((j) => j.active));

  // (1) pausa
  const tPausa = (await q("select now() t"))[0].t;
  await db.query("begin"); await db.query(sqlFile("6-pg-cron-pausar.sql")); await db.query("commit");
  const ativos = (await q("select count(*) filter (where active)::int a from cron.job"))[0].a;
  check("pausa: 0 jobs ativos", ativos === 0, `ativos=${ativos}`);

  // (2) observacao da pausa
  const fim = Date.now() + PAUSA_MIN * 60_000;
  let maxExec = 0, maxRodando = 0, amostras = 0;
  while (Date.now() < fim) {
    await dorme(30_000);
    const a = (await q("select (select count(*) from cron.job_run_details where start_time > $1)::int novas, (select count(*) from cron.job_run_details where status in ('running','starting'))::int rodando, (select count(*) filter (where active) from cron.job)::int ativos", [tPausa]))[0];
    maxExec = Math.max(maxExec, a.novas); maxRodando = Math.max(maxRodando, a.rodando); amostras += 1;
    if (amostras % 4 === 0) log(`pausa: amostra ${amostras}: novas execucoes=${a.novas}, rodando=${a.rodando}, ativos=${a.ativos}`);
  }
  // marcas de agendamento que PASSARAM durante a pausa (jobs que teriam rodado)
  const esperadas = (await q(`select count(*)::int n from cron.job j where j.schedule ~ '^\\*/[0-9]+ \\* \\* \\* \\*$' `))[0].n;
  check(`pausa de ${PAUSA_MIN} min: 0 execucoes novas em ${amostras} amostras`, maxExec === 0, `maximo observado=${maxExec}; jobs de alta frequencia que teriam disparado=${esperadas}`);
  check("pausa: nenhuma execucao em andamento", maxRodando === 0, `maximo=${maxRodando}`);
  const contPausa = mapa(await q(CONTAGENS));
  const difs = Object.keys(cont0).filter((t) => cont0[t] !== contPausa[t]);
  check("integridade na pausa: contagem de linhas de todas as tabelas igual ao baseline (ninguem escreveu)", difs.length === 0, difs.length ? `diferentes: ${difs.map((t) => `${t} ${cont0[t]}->${contPausa[t]}`).join(", ")}` : `${Object.keys(cont0).length} tabelas`);

  // (3) retomada
  const tRetoma = (await q("select now() t"))[0].t;
  await db.query("begin"); await db.query(sqlFile("7-pg-cron-retomar.sql")); await db.query("commit");
  const jobs1 = await q("select jobid, jobname, active, schedule from cron.job order by jobid");
  check("retomada: os 11 jobs voltaram ao estado original (ativo/agenda)", JSON.stringify(jobs1) === JSON.stringify(jobs0));
  check("retomada: tabela auxiliar removida", (await q("select to_regclass('public.acc_janela_cron_estado') r"))[0].r === null);

  // (4) observacao pos-retomada
  const fim2 = Date.now() + POS_MIN * 60_000;
  while (Date.now() < fim2) await dorme(30_000);
  const exec = await q("select j.jobname, count(d.*)::int execs, count(d.*) filter (where d.status='failed')::int falhas, count(d.*) filter (where d.status='succeeded')::int ok from cron.job j left join cron.job_run_details d on d.jobid=j.jobid and d.start_time > $1 group by j.jobname order by j.jobname", [tRetoma]);
  for (const e of exec) log(`  ${e.jobname}: ${e.execs} execs, ${e.ok} ok, ${e.falhas} falhas`);
  const total = exec.reduce((a, e) => a + e.execs, 0);
  check("retomada: jobs voltaram a executar", total > 0, `${total} execucoes em ${POS_MIN} min`);
  check("retomada: nenhuma falha de execucao", exec.every((e) => e.falhas === 0), exec.filter((e) => e.falhas).map((e) => `${e.jobname}:${e.falhas}`).join(","));
  const dup = await q("select j.jobname, date_trunc('minute', d.start_time) minuto, count(*)::int n from cron.job_run_details d join cron.job j on j.jobid=d.jobid where d.start_time > $1 group by 1,2 having count(*) > 1", [tRetoma]);
  check("retomada: nenhuma duplicidade (mesmo job duas vezes no mesmo minuto)", dup.length === 0, dup.map((d) => `${d.jobname}@${d.minuto.toISOString().slice(11, 16)}x${d.n}`).join(","));
  // execucoes "recuperadas" por retomada: nenhuma execucao com start_time dentro da janela de pausa
  const dentro = (await q("select count(*)::int n from cron.job_run_details where start_time > $1 and start_time < $2", [tPausa, tRetoma]))[0].n;
  check("retomada: nao recupera execucoes perdidas (0 execucoes com inicio dentro da janela de pausa)", dentro === 0, `n=${dentro}`);

  // (5) integridade final
  const fp1 = (await q(FP))[0];
  for (const k of Object.keys(fp0)) check(`integridade final: fingerprint ${k} igual ao baseline`, fp0[k] === fp1[k]);
  const contFim = mapa(await q(CONTAGENS));
  const mudaram = Object.keys(cont0).filter((t) => cont0[t] !== contFim[t]).map((t) => `${t} ${cont0[t]}->${contFim[t]}`);
  log(`tabelas com contagem diferente apos ${POS_MIN} min de jobs ativos (esperado: so tabelas operacionais dos agendadores): ${mudaram.join(", ") || "nenhuma"}`);
  const inesperadas = mudaram.filter((m) => !/^(acc_scheduler|acc_system_health|cron|acc_.*heartbeat|audit_log)/.test(m));
  check("integridade final: so tabelas de agendador/saude/auditoria mudaram", inesperadas.length === 0, inesperadas.join(", "));
} catch (e) {
  falha += 1;
  log(`FAIL erro inesperado: ${String(e.message).split("\n")[0]}`);
  try { await db.query("rollback"); } catch { /* sem transacao */ }
  // seguranca: se a pausa ficou ativa por erro, NAO deixar o ambiente pausado sem aviso
  try {
    const pend = (await q("select to_regclass('public.acc_janela_cron_estado') r"))[0].r;
    if (pend) {
      log("ATENCAO: a pausa dos jobs ficou ativa por causa do erro; restaurando o estado original (7-pg-cron-retomar.sql).");
      await db.query("begin"); await db.query(sqlFile("7-pg-cron-retomar.sql")); await db.query("commit");
      log("jobs restaurados ao estado original.");
    }
  } catch { /* ignora */ }
} finally {
  await db.end();
}
log(`RESULTADO: ${ok} OK, ${falha} FAIL`);
process.exit(falha ? 1 : 0);
