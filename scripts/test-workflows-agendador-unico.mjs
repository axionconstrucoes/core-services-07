// Agendador UNICO dos jobs operacionais (docs/operacao-workflows-agendador-unico.md).
// Arquitetura aprovada: PostgreSQL pg_cron = agendador principal; GitHub Actions = executor (workflow_dispatch)
// e acionamento manual; watchdog = supervisao; dashboard = apresentacao.
// Sem isto, um workflow habilitado com `schedule` E disparado pelo pg_cron roda duas vezes (a concorrencia
// so impede execucoes simultaneas, nao redundantes — ex.: ssma-drive-photo-sync, run schedule 00:23 alem do
// dispatch 00:00 de 25/11/2026).
// Teste estatico (sem rede, sem segredos): le a migration do agendador, o vercel.json e o texto dos YAML.
import { readFileSync, readdirSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
const check = (name, fn) => { try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");

const WF_DIR = ".github/workflows";
const workflowFiles = readdirSync(new URL(`../${WF_DIR}`, import.meta.url)).filter((f) => /\.ya?ml$/.test(f)).sort();
const wf = Object.fromEntries(workflowFiles.map((f) => [f, read(`${WF_DIR}/${f}`)]));

// Bloco `on:` (ate a proxima chave de nivel zero) e os gatilhos declarados nele (chaves com 2 espacos).
function onBlock(text) {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => /^on:\s*$/.test(l) || /^"on":\s*$/.test(l));
  assert(i >= 0, "bloco `on:` nao encontrado (forma multilinha esperada)");
  const out = [];
  for (let j = i + 1; j < lines.length && !/^\S/.test(lines[j]); j += 1) out.push(lines[j]);
  return out.join("\n");
}
const triggers = (text) => [...onBlock(text).matchAll(/^  ([a-z_]+):/gm)].map((m) => m[1]);
const declaredInputs = (text) => {
  const block = onBlock(text);
  const k = block.indexOf("\n    inputs:");
  if (k < 0) return [];
  return [...block.slice(k).matchAll(/^      ([a-z_]+):/gm)].map((m) => m[1]);
};

// ---- Fonte do agendador principal: a migration do pg_cron (alvos) + cron.schedule (jobs e inputs) ----
const migration = read("supabase/migrations/20261119034721_scheduler_pg_cron_dispatch.sql");
const targets = new Map(); // job -> { kind, target }
for (const m of migration.matchAll(/\('([a-z-]+)',\s*'(GITHUB_WORKFLOW|VERCEL_ROUTE)',\s*'([^']+)'/g)) targets.set(m[1], { kind: m[2], target: m[3] });
const dispatched = new Map(); // arquivo do workflow -> { job, cronJob, inputs }
for (const m of migration.matchAll(/cron\.schedule\('([a-z-]+)',\s*'[^']+',\s*\$\$select public\.acc_scheduler_dispatch_workflow\('([a-z-]+)'(?:,\s*'([^']*)'::jsonb)?\)\$\$\)/g)) {
  const t = targets.get(m[2]);
  if (t?.kind === "GITHUB_WORKFLOW") dispatched.set(t.target, { job: m[2], cronJob: m[1], inputs: m[3] ? JSON.parse(m[3]) : {} });
}
const pgCronRoutes = new Set();
for (const m of migration.matchAll(/acc_scheduler_call_route\('([a-z-]+)'\)/g)) {
  const t = targets.get(m[1]);
  if (t?.kind === "VERCEL_ROUTE") pgCronRoutes.add(t.target);
}
const vercelCronRoutes = new Set((JSON.parse(read("apps/web/vercel.json")).crons ?? []).map((c) => c.path));

// Workflows que ainda tem `schedule` proprio por DECISAO PENDENTE do responsavel (nenhum outro agendador cobre a funcao).
// Incluir um workflow aqui exige registrar a decisao no doc; nunca para algo que o pg_cron/Vercel ja agenda.
const SCHEDULE_PENDING_DECISION = new Set(["alert-reminders.yml", "gmail-owner-mailbox-sync.yml"]);
// Workflows de CI/CD: gatilhos preservados exatamente.
const CI_TRIGGERS = { "ci-pr-checks.yml": ["pull_request", "workflow_dispatch"] };

check("a migration do agendador expoe os 7 workflows despachados pelo pg_cron", () => {
  const expected = ["construmanager-content-ingestion.yml", "diario-de-obra-sync.yml", "document-processing-worker.yml", "gmail-inbound-sync.yml", "mpp-document-worker.yml", "ssma-drive-photo-sync.yml", "weekly-schedule-email-ingestion.yml"];
  assert(JSON.stringify([...dispatched.keys()].sort()) === JSON.stringify(expected), `mapa lido: ${[...dispatched.keys()].sort().join(", ")}`);
  assert(pgCronRoutes.has("/api/cron/ssma-notifications") && pgCronRoutes.has("/api/cron/risk-alerts"), "rotas do pg_cron nao encontradas");
});

for (const [file, info] of dispatched) {
  check(`${file}: existe, sem \`schedule\` e com workflow_dispatch (pg_cron ${info.cronJob})`, () => {
    assert(wf[file], "arquivo do workflow ausente (o dispatch do pg_cron receberia 404)");
    const t = triggers(wf[file]);
    assert(!t.includes("schedule"), "tem `schedule` proprio: execucao dupla com o pg_cron");
    assert(t.includes("workflow_dispatch"), "sem workflow_dispatch: o pg_cron nao consegue disparar");
  });
  check(`${file}: inputs enviados pelo pg_cron existem no workflow (senao o GitHub responde 422)`, () => {
    const declared = declaredInputs(wf[file]);
    for (const k of Object.keys(info.inputs)) assert(declared.includes(k), `input "${k}" enviado pelo pg_cron nao declarado`);
  });
}

check("nenhum workflow e ao mesmo tempo agendado pelo GitHub e despachado pelo pg_cron", () => {
  const both = workflowFiles.filter((f) => dispatched.has(f) && triggers(wf[f]).includes("schedule"));
  assert(both.length === 0, both.join(", "));
});

check("workflow que chama rota agendada pelo pg_cron ou pela Vercel nao tem `schedule`", () => {
  const covered = new Set([...pgCronRoutes, ...vercelCronRoutes]);
  const bad = [];
  for (const f of workflowFiles) {
    const routes = [...wf[f].matchAll(/\/api\/cron\/[a-z-]+/g)].map((m) => m[0]);
    if (routes.some((r) => covered.has(r)) && triggers(wf[f]).includes("schedule")) bad.push(f);
  }
  assert(bad.length === 0, bad.join(", "));
});

check("ssma-notifications.yml: so manual (pg_cron chama a rota direto) e mantem a previa dry_run", () => {
  const t = triggers(wf["ssma-notifications.yml"]);
  assert(!t.includes("schedule") && t.includes("workflow_dispatch"), `gatilhos: ${t.join(", ")}`);
  assert(declaredInputs(wf["ssma-notifications.yml"]).includes("dry_run"), "input dry_run removido");
});

check("contract-alert-batches.yml: sem `schedule` (o cron Vercel weekly-alert-digest ja roda runContractAlertBatches)", () => {
  assert(vercelCronRoutes.has("/api/cron/weekly-alert-digest"), "cron Vercel weekly-alert-digest ausente — reavaliar antes de remover o schedule");
  assert(/runContractAlertBatches\(\)/.test(read("apps/web/app/api/cron/weekly-alert-digest/route.ts")), "weekly-alert-digest deixou de rodar os lotes contratuais");
  const t = triggers(wf["contract-alert-batches.yml"]);
  assert(!t.includes("schedule") && t.includes("workflow_dispatch"), `gatilhos: ${t.join(", ")}`);
});

check("so os workflows com decisao pendente mantem `schedule` proprio", () => {
  const scheduled = workflowFiles.filter((f) => triggers(wf[f]).includes("schedule"));
  const unexpected = scheduled.filter((f) => !SCHEDULE_PENDING_DECISION.has(f));
  assert(unexpected.length === 0, `schedule novo/sem decisao registrada: ${unexpected.join(", ")}`);
});

for (const [file, expected] of Object.entries(CI_TRIGGERS)) {
  check(`${file} (CI/CD): gatilhos preservados (${expected.join(", ")})`, () => {
    assert(JSON.stringify(triggers(wf[file]).sort()) === JSON.stringify([...expected].sort()), `gatilhos: ${triggers(wf[file]).join(", ")}`);
    assert(/^  pull_request:\n    branches: \[main\]/m.test(onBlock(wf[file])), "pull_request deixou de cobrir main");
  });
}

check("watchdogs por workflow_run continuam observando workflows existentes (inclusive disparos do pg_cron)", () => {
  const names = new Set(workflowFiles.map((f) => (wf[f].match(/^name:\s*(.+)$/m) || [])[1]?.trim().replace(/^"|"$/g, "")));
  const watchers = workflowFiles.filter((f) => triggers(wf[f]).includes("workflow_run"));
  assert(watchers.length >= 2, `watchdogs encontrados: ${watchers.join(", ")}`);
  for (const f of watchers) {
    const m = onBlock(wf[f]).match(/workflows:\s*\[([^\]]+)\]/);
    assert(m, `${f}: lista workflows ausente`);
    for (const n of m[1].split(",").map((s) => s.trim().replace(/^"|"$/g, ""))) assert(names.has(n), `${f}: observa "${n}", que nao existe`);
  }
});

check("doc operacional cobre todos os workflows e a ordem segura de reativacao", () => {
  const docPath = "docs/operacao-workflows-agendador-unico.md";
  assert(existsSync(new URL(`../${docPath}`, import.meta.url)), "doc ausente");
  const doc = read(docPath);
  for (const f of workflowFiles) assert(doc.includes(f), `doc nao cita ${f}`);
  const order = ["document-processing-worker", "mpp-document-worker", "ssma-drive-photo-sync", "weekly-schedule-email-ingestion"].map((n) => doc.indexOf(`Enable workflow** em \`${n}`));
  assert(order.every((i) => i >= 0), "passos de reativacao ausentes");
  assert(order.every((v, i) => i === 0 || v > order[i - 1]), "ordem de reativacao fora do combinado");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
if (failed > 0) process.exit(1);
