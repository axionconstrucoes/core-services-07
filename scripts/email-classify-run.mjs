// Fase 5 / G — runner do pipeline de classificação de e-mail (A -> C -> B -> sinais; D coleta os sinais). DESLIGADO por padrão.
//
// Liga/desliga:  ACC_EMAIL_CLASSIFY_ENABLED=1      (sem isso: imprime "DESLIGADO" e sai com 0, sem tocar no banco)
// Modo:          --dry-run (padrão)  |  --apply  (grava só com --apply E ACC_EMAIL_CLASSIFY_APPLY=1)
// Conexão:       ACC_EMAIL_PIPELINE_DATABASE_URL  (string de conexão de SERVIÇO, apenas servidor/worker; nunca impressa)
//                ACC_REALPG_PKG_DIR               (opcional: pasta com node_modules/pg, como nos testes realpg)
// Escopo:        --project <uuid>  --limit <n>  --internal-domains axion.com.br,...
// Remoto:        --apply em host que não seja 127.0.0.1/localhost exige ACC_EMAIL_CLASSIFY_ALLOW_REMOTE=1 (decisão do dono).
//
// NÃO lê caixas (Gmail/Graph): consome o que A já ingeriu em public.emails. NÃO envia e-mail. NÃO altera mensagens.
// A saída traz SÓ ids e contagens (nenhum conteúdo de mensagem, nenhum segredo).
import { createRequire } from "node:module";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const { resolvePipelineConfig } = await import("../apps/web/lib/email-pipeline/config.ts");
const { runEmailPipeline, createRpcPartyResolver } = await import("../apps/web/lib/email-pipeline/pipeline.ts");
const { createSqlPipelineStore, createSqlRpcClient } = await import("../apps/web/lib/email-pipeline/sql-store.ts");

function argValue(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), env = process.env, out = console) {
  const cfg = resolvePipelineConfig(env, argv);
  if (!cfg.enabled) {
    out.log(cfg.reason);
    return 0;
  }
  const url = env.ACC_EMAIL_PIPELINE_DATABASE_URL;
  if (!url) {
    out.error("ACC_EMAIL_PIPELINE_DATABASE_URL ausente: nada foi consultado.");
    return 2;
  }
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    out.error("ACC_EMAIL_PIPELINE_DATABASE_URL inválida.");
    return 2;
  }
  const local = host === "127.0.0.1" || host === "localhost";
  if (cfg.apply && !local && env.ACC_EMAIL_CLASSIFY_ALLOW_REMOTE !== "1") {
    out.error("RECUSADO: --apply em host remoto exige ACC_EMAIL_CLASSIFY_ALLOW_REMOTE=1 (decisão explícita do dono).");
    return 2;
  }
  const pg = createRequire(path.join(env.ACC_REALPG_PKG_DIR ?? here, "x.js"))("pg");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const limit = Number(argValue(argv, "--limit") ?? 500);
    const report = await runEmailPipeline({
      store: createSqlPipelineStore(client),
      resolveParty: createRpcPartyResolver(createSqlRpcClient(client)),
      apply: cfg.apply,
      projectId: argValue(argv, "--project") ?? null,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 500,
      internalDomains: (argValue(argv, "--internal-domains") ?? env.ACC_EMAIL_CLASSIFY_INTERNAL_DOMAINS ?? "axion.com.br")
        .split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean),
    });
    out.log(`${cfg.reason}`);
    out.log(JSON.stringify({ mode: report.mode, rule_version: report.rule_version, projects: report.projects, totals: report.totals, reconciliation: report.reconciliation }, null, 2));
    for (const o of report.outcomes) {
      if (o.action === "FAILED") out.log(`FALHA ${o.email_id}: ${o.error}`);
    }
    return report.totals.failed > 0 ? 1 : 0;
  } finally {
    await client.end().catch(() => undefined);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main());
}
