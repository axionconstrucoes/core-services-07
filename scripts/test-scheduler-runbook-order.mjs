// Guarda a ORDEM do runbook do agendador (docs/operacao-agendador-sla.md): ativação (§11) e reversão (§12) nunca podem deixar
// duas origens chamando as mesmas rotas. Só lê arquivos; nenhuma rede, nenhum banco.
// Uso: node scripts/test-scheduler-runbook-order.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
const doc = read("docs/operacao-agendador-sla.md");
const migration = read("supabase/migrations/20261118093000_scheduler_pg_cron_dispatch.sql");

let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};
const section = (from, to) => {
  const a = doc.indexOf(from);
  const b = doc.indexOf(to);
  assert(a > -1 && b > a, `seção ${from} não encontrada`);
  return doc.slice(a, b);
};
const s11 = section("## 11. ", "## 12. ");
const s12 = section("## 12. ", "## 13. ");
const before = (text, a, b) => {
  const ia = text.indexOf(a);
  const ib = text.indexOf(b);
  assert(ia > -1, `não achei: ${a}`);
  assert(ib > -1, `não achei: ${b}`);
  assert(ia < ib, `"${a}" deve vir antes de "${b}"`);
};

check("§11: ordem merge(flag ausente) → segredos → dry-run → flag true → confirmar runs antigos → migration → 2 ciclos → 24 h", () => {
  const steps = ["### Passo 1 ", "### Passo 2 ", "### Passo 3 ", "### Passo 4 ", "### Passo 5 ", "### Passo 6 ", "### Passo 7 ", "### Passo 8 "];
  let last = -1;
  for (const step of steps) {
    const i = s11.indexOf(step);
    assert(i > last, `${step.trim()} fora de ordem ou ausente`);
    last = i;
  }
});

check("§11: o GitHub para (flag=true, passo 4) e os runs antigos terminam (passo 5) ANTES da migration (passo 6)", () => {
  before(s11, "ACC_SCHEDULER_PG_CRON_ENABLED=true", "Aplicar `20261118093000_scheduler_pg_cron_dispatch.sql`");
  before(s11, "### Passo 5", "### Passo 6");
  assert(/Merge do #236 \(flag ausente/.test(s11), "o merge tem de ser com a flag ausente");
});

check("§11: dry-run de portão imediatamente antes da ativação e inboundCheck como pré-condição", () => {
  assert(/Risk Alerts WEG Dry-Run/.test(s11) && /inboundCheck\.ok=true/.test(s11));
  before(s11, "### Passo 3", "### Passo 4");
});

check("§11: documenta quais chamadas o GitHub deixa de fazer (as 2 rotas) e o que continua", () => {
  assert(s11.includes("GET /api/cron/risk-alerts") && s11.includes("GET /api/cron/ssma-notifications"));
  assert(/Continua no GitHub/.test(s11) && /gmail-inbound-sync/.test(s11) && /concurrency/.test(s11));
});

check("§11: confirmação de que nada antigo está em andamento (runs ativos, ≥ 6 min, outbox sem claim)", () => {
  const s5 = section("### Passo 5", "### Passo 6");
  assert(/--status in_progress/.test(s5) && /--status queued/.test(s5));
  assert(/≥ 6 min/.test(s5) && /claimed_at > now\(\) - interval '10 minutes'/.test(s5));
  assert(/ssma-notifications\.yml/.test(s5) && /weekly-schedule-email-ingestion\.yml/.test(s5));
});

check("§11: prova dos 2 primeiros ciclos sem duplicidade (heartbeat, HTTP 200, cron, outbox, auditoria, uma só origem)", () => {
  const s7 = section("### Passo 7", "### Passo 8");
  for (const needle of ["acc_scheduler_heartbeats", "net._http_response", "cron.job_run_details", "idempotency_key", "having count(*) > 1", "audit_log_entries", "HTTP **200**"]) {
    assert(s7.includes(needle), `faltou: ${needle}`);
  }
  assert(/Ciclo 1/.test(s7) && /ciclo 2/.test(s7));
  assert(/reversão do §12/.test(s7), "falha ⇒ reversão do §12");
});

check("§11.1: lista o que pode gerar e-mail real no primeiro ciclo e que os casos retidos não são liberados", () => {
  assert(/O que pode gerar e-mail REAL/.test(s11) && /Esperado: nenhum/.test(s11));
  assert(/REISSUE_DECISION_REQUIRED/.test(s11) && /PILOT_SINGLE/.test(s11));
});

check("§12: parar o pg_cron → confirmar chamadas/workflows → só então reabilitar o GitHub → conferir o retorno", () => {
  before(s12, "cron.unschedule", "Confirmar que nada ficou em andamento");
  before(s12, "Confirmar que nada ficou em andamento", "Reabilitar os chamadores do GitHub");
  before(s12, "Reabilitar os chamadores do GitHub", "Conferir o retorno");
  const reenable = s12.indexOf("Reabilitar os chamadores do GitHub");
  const unschedule = s12.indexOf("cron.unschedule");
  assert(unschedule < reenable, "unschedule antes de ACC_SCHEDULER_PG_CRON_ENABLED=false");
  assert(/net\.http_request_queue/.test(s12) && /--status in_progress/.test(s12) && /claimed_at/.test(s12));
});

check("§11 e §12 são espelhos: a flag é ligada ANTES do pg_cron e desligada DEPOIS dele parar", () => {
  const on = s11.indexOf("ACC_SCHEDULER_PG_CRON_ENABLED=true");
  const migrate = s11.indexOf("### Passo 6");
  assert(on > -1 && on < migrate, "ativação: flag true antes da migration");
  const off = s12.indexOf("ACC_SCHEDULER_PG_CRON_ENABLED=false");
  const stop = s12.indexOf("cron.unschedule");
  assert(stop > -1 && off > stop, "reversão: pg_cron para antes da flag false");
});

check("a migration aponta para o §12 e continua NÃO aplicada por nenhum workflow", () => {
  assert(/docs\/operacao-agendador-sla\.md §12/.test(migration), "comentário da migration deve citar o §12");
  assert(/NÃO APLICAR sem aprovação explícita/i.test(migration), "cabeçalho de não aplicar");
  const wfs = ["weekly-schedule-email-ingestion", "ssma-notifications", "mpp-document-worker", "document-processing-worker", "gmail-inbound-sync", "ssma-drive-photo-sync", "construmanager-content-ingestion", "diario-de-obra-sync"];
  for (const wf of wfs) assert(!/supabase\s+db\s+push|apply_migration|supabase\s+migration/i.test(read(`.github/workflows/${wf}.yml`)), `${wf} aplica migration`);
});

check("os dois workflows de rota respeitam a flag e o dry-run manual continua possível", () => {
  const weekly = read(".github/workflows/weekly-schedule-email-ingestion.yml");
  const ssma = read(".github/workflows/ssma-notifications.yml");
  assert(/vars\.ACC_SCHEDULER_PG_CRON_ENABLED != 'true'/.test(weekly) && /risk-alerts:/.test(weekly));
  assert(/vars\.ACC_SCHEDULER_PG_CRON_ENABLED != 'true' \|\| \(github\.event_name == 'workflow_dispatch' && inputs\.dry_run\)/.test(ssma));
});

check("o runbook não contém segredos nem tokens", () => {
  assert(!/ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{20,}|GOCSPX-|ya29\.|1\/\/0g|eyJ[A-Za-z0-9_-]{30,}/.test(doc), "padrão de segredo no runbook");
  // "Bearer <valor>": so nomes de variavel em MAIUSCULAS (ACC_RISK_ALERTS_CRON_SECRET) e <placeholders> sao permitidos; um token real tem minusculas.
  const bearerRe = /Bearer[ 	]+([A-Za-z0-9._-]{20,})/g;
  const realTokens = (text) => [...text.matchAll(bearerRe)].map((m) => m[1]).filter((token) => token !== token.toUpperCase());
  assert(realTokens(doc).length === 0, "Bearer com valor que nao e nome de variavel");
  assert(realTokens("Authorization: Bearer abcdefghijklmnopqrstuvwxyz0123456789").length === 1, "o detector deve pegar um token de exemplo (teste negativo)");
  assert(realTokens("Bearer ACC_RISK_ALERTS_CRON_SECRET").length === 0, "nome de variavel nao e segredo");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
