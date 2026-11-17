// Regressão: isolamento por projeto no espelhamento de fotos SSMA para o Drive.
// Sem rede, sem Supabase, sem Drive: tudo injetado.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runSsmaPhotoSync, decideOutcome, buildSummaries } from "./lib/ssma-photo-sync-runner.mjs";

let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
}

const WEG = "00000000-0000-4000-8000-000000000001";
const TESTE = "061f6a4e-e490-4c00-838a-4e0ccb2e3cd4";
const OUTRO = "aaaaaaaa-0000-4000-8000-000000000002";

const row = (id, project) => ({ id, project_id: project, ssma_form_submissions: { status: "SUBMITTED" } });

function makeDeps({ configured, actionable, blocked, syncRow }) {
  const calls = { synced: [], loadActionableArgs: null };
  return {
    calls,
    deps: {
      loadConfiguredProjectIds: async () => configured,
      loadActionableRows: async (ids) => {
        calls.loadActionableArgs = ids;
        return actionable.filter((r) => ids.includes(r.project_id));
      },
      loadBlockedRows: async () => blocked,
      syncRow: async (r) => {
        calls.synced.push(r.id);
        return syncRow(r);
      },
    },
  };
}
const quiet = () => {};
const twelveBlocked = Array.from({ length: 12 }, (_, i) => ({ project_id: TESTE, id: `t${i}` }));

// 1) Cenário real de produção: WEG ok + 12 fotos do TESTE sem pasta configurada.
{
  const { deps, calls } = makeDeps({
    configured: [WEG],
    actionable: [],
    blocked: twelveBlocked,
    syncRow: async () => ({ status: "SYNCED" }),
  });
  const out = await runSsmaPhotoSync({ deps, limit: 100, apply: true, criticalProjectIds: [WEG], log: quiet });
  check("projeto não-piloto sem pasta NÃO derruba o job", out.exitCode === 0);
  check("fotos do projeto sem pasta NÃO são reprocessadas (preservadas, sem auditoria nova)", calls.synced.length === 0);
  check("projeto sem pasta nunca entra na consulta de processamento", !calls.loadActionableArgs.includes(TESTE));
  const teste = out.summaries.find((s) => s.projectId === TESTE);
  check("as 12 fotos aparecem no relatório do projeto TESTE", teste.blockedByConfig === 12);
  check("a pendência continua VISÍVEL como ::warning:: por projeto", out.annotations.some((a) => a.startsWith("::warning") && a.includes("projeto 061f6a4e") && a.includes("12 foto")));
}

// 2) Falha real em um projeto não mascara nem bloqueia o outro, e continua visível.
{
  const { deps, calls } = makeDeps({
    configured: [WEG, OUTRO],
    actionable: [row("w1", WEG), row("o1", OUTRO), row("w2", WEG)],
    blocked: [],
    syncRow: async (r) => (r.project_id === OUTRO ? { status: "FAILED", error: "Credencial Google Drive sem permissão de escrita na pasta SSMA/ESG." } : { status: "SYNCED" }),
  });
  const out = await runSsmaPhotoSync({ deps, limit: 100, apply: true, criticalProjectIds: [WEG], log: quiet });
  check("falha em um projeto não impede o processamento dos demais", calls.synced.length === 3);
  check("falha real faz o job falhar (exit 1)", out.exitCode === 1);
  const weg = out.summaries.find((s) => s.projectId === WEG);
  const outro = out.summaries.find((s) => s.projectId === OUTRO);
  check("projeto saudável fica 100% sincronizado no relatório", weg.synced === 2 && weg.failed === 0);
  check("projeto com falha é identificado por projeto", outro.failed === 1 && outro.synced === 0);
  check("anotação ::error:: aponta o projeto com falha e o motivo", out.annotations.some((a) => a.startsWith("::error") && a.includes("projeto aaaaaaaa") && a.includes("sem permissão")));
  check("projeto saudável não gera anotação de erro", !out.annotations.some((a) => a.includes("projeto 00000000")));
}

// 3) Duas falhas em projetos distintos aparecem como duas anotações separadas.
{
  const { deps } = makeDeps({
    configured: [WEG, OUTRO],
    actionable: [row("w1", WEG), row("o1", OUTRO)],
    blocked: [],
    syncRow: async () => ({ status: "FAILED", error: "Autorização Google Drive expirada ou revogada." }),
  });
  const out = await runSsmaPhotoSync({ deps, limit: 100, apply: true, criticalProjectIds: [WEG], log: quiet });
  check("falhas de projetos distintos geram anotações distintas", out.annotations.filter((a) => a.startsWith("::error")).length === 2);
  check("projeto do piloto é rotulado como PILOTO", out.annotations.some((a) => a.includes("(PILOTO)")));
}

// 4) Projeto crítico (piloto) sem pasta configurada NUNCA fica silencioso.
{
  const { deps } = makeDeps({
    configured: [],
    actionable: [],
    blocked: [{ project_id: WEG, id: "w9" }],
    syncRow: async () => ({ status: "SYNCED" }),
  });
  const out = await runSsmaPhotoSync({ deps, limit: 100, apply: true, criticalProjectIds: [WEG], log: quiet });
  check("piloto sem pasta configurada falha o job", out.exitCode === 1);
  check("piloto sem pasta gera ::error::", out.annotations.some((a) => a.startsWith("::error") && a.includes("(PILOTO)")));
}

// 5) Exceção inesperada em uma foto não interrompe as demais.
{
  const { deps, calls } = makeDeps({
    configured: [WEG],
    actionable: [row("w1", WEG), row("w2", WEG), row("w3", WEG)],
    blocked: [],
    syncRow: async (r) => {
      if (r.id === "w2") throw new Error("boom com segredo=abc123");
      return { status: "SYNCED" };
    },
  });
  const out = await runSsmaPhotoSync({ deps, limit: 100, apply: true, criticalProjectIds: [WEG], log: quiet });
  check("exceção em uma foto não interrompe as seguintes", calls.synced.length === 3);
  check("exceção vira falha visível (exit 1)", out.exitCode === 1);
  check("mensagem da exceção (possível segredo) não vaza para o relatório", !out.annotations.join("\n").includes("abc123"));
}

// 6) Simulação (sem --apply) não processa nada e não falha.
{
  const { deps, calls } = makeDeps({
    configured: [WEG],
    actionable: [row("w1", WEG)],
    blocked: twelveBlocked,
    syncRow: async () => ({ status: "SYNCED" }),
  });
  const out = await runSsmaPhotoSync({ deps, limit: 100, apply: false, criticalProjectIds: [WEG], log: quiet });
  check("simulação não espelha nenhuma foto", calls.synced.length === 0 && out.exitCode === 0);
}

// 7) Estrutura: o script nunca apaga nada e o workflow informa o projeto crítico.
{
  const script = await readFile(new URL("./sync-ssma-drive-photos.mjs", import.meta.url), "utf8");
  const runner = await readFile(new URL("./lib/ssma-photo-sync-runner.mjs", import.meta.url), "utf8");
  const workflow = await readFile(new URL("../.github/workflows/ssma-drive-photo-sync.yml", import.meta.url), "utf8");
  check("script não apaga linhas nem arquivos", !/\.delete\(|\.remove\(|unlink|rmSync/.test(script + runner));
  check("script não escreve em fotos de projeto sem pasta (não faz update/insert direto)", !/\.update\(|\.insert\(/.test(script + runner));
  check("workflow passa o projeto crítico do piloto", workflow.includes("SSMA_SYNC_CRITICAL_PROJECT_IDS: ${{ vars.ACC_PROJECT_PILOT_PROJECT_ID }}"));
  check("workflow mantém --apply --limit=100 e cron de 2h", workflow.includes("--apply --limit=100") && workflow.includes('cron: "0 */2 * * *"'));
  check("script continua restrito a PENDING/FAILED de formulários SUBMITTED", script.includes('.in("drive_sync_status", ["PENDING", "FAILED"])') && script.includes('.eq("ssma_form_submissions.status", "SUBMITTED")'));
}

// 8) decideOutcome sem nada a fazer.
{
  const s = buildSummaries({ processed: [], blockedCounts: new Map(), criticalProjectIds: [WEG] });
  check("sem pendências: exit 0 e nenhuma anotação", decideOutcome(s).exitCode === 0 && decideOutcome(s).annotations.length === 0);
}

console.log(`SSMA DRIVE PHOTO SYNC (isolamento por projeto): ${passed} verificações, 0 falhas`);
