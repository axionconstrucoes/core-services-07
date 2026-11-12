// Garante que a recuperacao de conteudo do Construmanager nasce MANUAL, limitada e restrita a WEG,
// sem tocar no monitoramento de metadados nem em crons. Sem rede.
import { readFileSync } from "node:fs";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { resolveAutomationConfig, evaluateSizePolicy } = await import("../apps/web/lib/integrations/construmanager/automation-policy.ts");

let passed = 0, failed = 0;
const check = (name, cond) => { if (cond) { passed++; console.log("OK   " + name); } else { failed++; console.log("FAIL " + name); } };
const rd = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const WF = rd(".github/workflows/construmanager-content-recovery.yml");
const MON = rd(".github/workflows/construmanager-content-ingestion.yml");
const exec = (s) => s.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");

check("somente workflow_dispatch (sem schedule)", /^\s{2}workflow_dispatch:/m.test(WF) && !/^\s{2}schedule:/m.test(WF) && !/- cron:/.test(WF));
check("executa apenas na main", /if: github\.ref == 'refs\/heads\/main'/.test(WF));
check("dry-run e o padrao e apply exige escolha explicita", /default: dry-run/.test(WF) && /inputs\.mode == 'apply' && 'false' \|\| 'true'/.test(WF));
check("projeto fixo WEG, sem entrada de projeto", /construmanager-content-worker\.mjs 00000000-0000-4000-8000-000000000001/.test(WF) && !/project_id/.test(exec(WF)));
check("tetos validados antes de executar", /-le 50/.test(WF) && /-le 100/.test(WF));
check("sem segredos literais", !/sb_secret_[A-Za-z0-9]{6,}|eyJ[A-Za-z0-9_-]{20,}\./.test(WF));
check("segredos vem de secrets e kill switch de vars", /secrets\.SUPABASE_SECRET_KEY/.test(WF) && /vars\.CONSTRUMANAGER_AUTO_KILL_SWITCH/.test(WF));
check("monitoramento de metadados segue sem invocar o worker de conteudo", !/construmanager-content-worker\.mjs/.test(exec(MON)));
check("nenhum cron novo: o monitoramento mantem seu unico cron", (MON.match(/- cron:/g) ?? []).length === 1);

const env = (over) => ({ CONSTRUMANAGER_AUTO_DOWNLOAD_ENABLED: "true", CONSTRUMANAGER_AUTO_DRY_RUN: "true", CONSTRUMANAGER_AUTO_MAX_ITEMS: "10", CONSTRUMANAGER_AUTO_MAX_FILE_BYTES: "50000000", CONSTRUMANAGER_AUTO_TIME_BUDGET_MS: "6600000", ...over });
const d = resolveAutomationConfig(env());
check("config do workflow e aceita e permanece dry-run", d.enabled && d.config.dryRun && d.config.maxItems === 10 && d.config.maxFileBytes === 50000000);
check("apply so com 'false' exato", resolveAutomationConfig(env({ CONSTRUMANAGER_AUTO_DRY_RUN: "false" })).config.dryRun === false && resolveAutomationConfig(env({ CONSTRUMANAGER_AUTO_DRY_RUN: "" })).config.dryRun === true);
check("kill switch desliga mesmo com tudo ligado", resolveAutomationConfig(env({ CONSTRUMANAGER_AUTO_KILL_SWITCH: "true" })).enabled === false);
check("itens acima do teto de 50 desligam (fail-closed)", resolveAutomationConfig(env({ CONSTRUMANAGER_AUTO_MAX_ITEMS: "51" })).enabled === false);
const cap = 50_000_000;
check("arquivo acima do teto vira referencia externa e nao e baixado", evaluateSizePolicy(256_261_753, cap).classification === "REFERENCIA_EXTERNA" && evaluateSizePolicy(10_326_397, cap).eligible === true);
check("tamanho desconhecido exige decisao humana", evaluateSizePolicy(null, cap).classification === "DECISAO_HUMANA");
const WORKER = rd("scripts/construmanager-content-worker.mjs");
check("falha por item nao usa .catch sobre valor sincrono (abortava a rodada)", !/firstRow\([\s\S]{0,400}?\)\s*\.catch\(/.test(WORKER));
console.log(`\n${passed} OK, ${failed} falha(s)`); process.exit(failed ? 1 : 0);
