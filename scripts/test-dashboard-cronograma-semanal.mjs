// Testes da regra SEMANAL do indicador "Cronograma atualizado" do Dashboard.
// Executa o resolvedor REAL (puro) e verifica o leitor somente-leitura
// com um cliente Supabase falso (grava as chamadas). Sem I/O real, sem IA.
//   node --import ./scripts/lib/block-live-ai.mjs scripts/test-dashboard-cronograma-semanal.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
// Stub do pacote "server-only" (so existe dentro do bundler do Next).
register(
  "data:text/javascript," +
    encodeURIComponent(
      'export async function resolve(s,c,n){ if(s==="server-only") return {url:"data:text/javascript,export{}",shortCircuit:true}; return n(s,c); }'
    )
);
const R = await import("../apps/web/lib/schedule/weekly-ingestion/resolve-weekly-cronograma-status");
const { resolveAllIntegrationStatuses } = await import("../apps/web/lib/ui/resolve-integration-display-status");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => readFileSync(path.join(root, p), "utf8");
let n = 0;
const t = (name, fn) => {
  fn();
  n++;
  console.log("ok -", name);
};

// "Agora": segunda 16/11/2026 12:00 BRT => prazo (sexta 18:00) da semana 16/11 NAO passou => esperada = 09/11.
const NOW_MON = new Date("2026-11-16T15:00:00Z");
// Sabado 14/11 => prazo da semana 09/11 passou => esperada = 09/11 (corrente tambem 09/11).
const NOW_SAT = new Date("2026-11-14T15:00:00Z");
const config = { enabled: true, deadlineWeekday: 5, deadlineTime: "18:00:00", timezone: "America/Sao_Paulo" };
const W = "2026-11-09";
const SENT_IN_W = "2026-11-11T14:00:00Z";

const facts = (over = {}) => ({ config, intakes: [], workbooks: [], scheduleVersions: [], ...over });
const intake = (over = {}) => ({ id: "i1", weekStart: W, status: "AUTHORIZED_AUTO", mppDocumentVersionId: "dv1", sha256: "a".repeat(64), ...over });
const version = (over = {}) => ({ documentVersionId: "dv1", extractionStatus: "EXTRACTED", isMpp: true, ...over });
const wb = (over = {}) => ({ id: "w1", emailSentAt: SENT_IN_W, sha256: "b".repeat(64), ...over });
const run = (f, o = {}) => R.resolveWeeklyCronogramaStatus({ storedStatus: "PENDENTE", facts: f, now: NOW_MON, ...o });

t("semana esperada: antes do prazo = anterior; depois do prazo = corrente", () => {
  assert.equal(R.resolveExpectedWeek(NOW_MON, config).expectedWeekStart, "2026-11-09");
  assert.equal(R.resolveExpectedWeek(NOW_MON, config).currentWeekStart, "2026-11-16");
  assert.equal(R.resolveExpectedWeek(new Date("2026-11-20T22:00:00Z"), config).expectedWeekStart, "2026-11-16");
  assert.equal(R.resolveExpectedWeek(NOW_SAT, config).expectedWeekStart, "2026-11-09");
});

t("recebimento CONJUNTO (MPP autorizado processado + Excel) => CONECTADO", () => {
  const r = run(facts({ intakes: [intake()], scheduleVersions: [version()], workbooks: [wb()] }));
  assert.equal(r.status, "CONECTADO");
  assert.equal(r.cause, "OK_RECEIVED_PROCESSED");
  assert.equal(r.processedMppCount, 1);
  assert.equal(r.weeklyExcelCount, 1);
});

t("MPP recebido na semana corrente (antes do prazo) tambem atende", () => {
  const r = run(facts({ intakes: [intake({ weekStart: "2026-11-16" })], scheduleVersions: [version()] }));
  assert.equal(r.status, "CONECTADO");
});

t("recebimento PARCIAL: so Excel => PENDENTE EXCEL_ONLY_NO_MPP (Excel nunca promove)", () => {
  const r = run(facts({ workbooks: [wb()] }));
  assert.equal(r.status, "PENDENTE");
  assert.equal(r.cause, "EXCEL_ONLY_NO_MPP");
  assert.match(r.detail, /só o Excel, sem MPP/);
});

t("e-mail IGNORED_NO_MPP => EXCEL_ONLY_NO_MPP", () => {
  assert.equal(run(facts({ intakes: [intake({ status: "IGNORED_NO_MPP", mppDocumentVersionId: null })] })).cause, "EXCEL_ONLY_NO_MPP");
});

t("recebimento PARCIAL: so MPP, processado => CONECTADO (Excel ausente nao impede)", () => {
  const r = run(facts({ intakes: [intake()], scheduleVersions: [version()] }));
  assert.equal(r.status, "CONECTADO");
  assert.equal(r.weeklyExcelCount, 0);
});

t("AUSENCIA do MPP e de e-mails => PENDENTE NO_WEEKLY_EMAIL com semana", () => {
  const r = run(facts());
  assert.equal(r.status, "PENDENTE");
  assert.equal(r.cause, "NO_WEEKLY_EMAIL");
  assert.equal(r.detail, "nenhum e-mail semanal recebido (sem. 09/11)");
});

t("MPP de semana ANTERIOR a esperada nao promove", () => {
  const r = run(facts({ intakes: [intake({ weekStart: "2026-11-02" })], scheduleVersions: [version()] }));
  assert.equal(r.status, "PENDENTE");
  assert.equal(r.cause, "NO_WEEKLY_EMAIL");
});

t("REMETENTE NAO AUTORIZADO => PENDENTE SENDER_NOT_AUTHORIZED (mesmo com versao existente)", () => {
  const r = run(facts({ intakes: [intake({ status: "REJECTED_UNAUTHORIZED_SENDER", mppDocumentVersionId: null })], scheduleVersions: [version()] }));
  assert.equal(r.status, "PENDENTE");
  assert.equal(r.cause, "SENDER_NOT_AUTHORIZED");
});

t("destinatario sem cliente => RECIPIENT_NOT_CLIENT", () => {
  assert.equal(run(facts({ intakes: [intake({ status: "REJECTED_RECIPIENT_MISMATCH", mppDocumentVersionId: null })] })).cause, "RECIPIENT_NOT_CLIENT");
});

t("ANEXOS NAO PROCESSADOS: pendente de revisao / nao promovido / sem extracao / falha", () => {
  assert.equal(run(facts({ intakes: [intake({ status: "PENDING_HUMAN_REVIEW", mppDocumentVersionId: null })] })).cause, "MPP_PENDING_REVIEW");
  assert.equal(run(facts({ intakes: [intake({ status: "REJECTED_HUMAN_REVIEW", mppDocumentVersionId: null })] })).cause, "MPP_REVIEW_REJECTED");
  assert.equal(run(facts({ intakes: [intake({ mppDocumentVersionId: null })] })).cause, "MPP_NOT_PROMOTED");
  assert.equal(run(facts({ intakes: [intake()], scheduleVersions: [] })).cause, "MPP_NOT_PROCESSED");
  assert.equal(run(facts({ intakes: [intake()], scheduleVersions: [version({ extractionStatus: "PENDING" })] })).cause, "MPP_NOT_PROCESSED");
  assert.equal(run(facts({ intakes: [intake()], scheduleVersions: [version({ extractionStatus: "FAILED" })] })).cause, "MPP_EXTRACTION_FAILED");
  assert.equal(run(facts({ intakes: [intake({ status: "FAILED", mppDocumentVersionId: null })] })).cause, "INGESTION_FAILED");
});

t("versao EXTRACTED que NAO e .mpp nao conta", () => {
  const r = run(facts({ intakes: [intake()], scheduleVersions: [version({ isMpp: false })] }));
  assert.equal(r.status, "PENDENTE");
  assert.equal(r.cause, "MPP_NOT_PROCESSED");
});

t("prioridade: um MPP processado vence rejeicoes/erros da mesma janela", () => {
  const r = run(
    facts({
      intakes: [
        intake({ id: "i0", status: "REJECTED_UNAUTHORIZED_SENDER", mppDocumentVersionId: null, sha256: null }),
        intake({ id: "i2", mppDocumentVersionId: "dv2", sha256: "c".repeat(64) }),
        intake(),
      ],
      scheduleVersions: [version({ documentVersionId: "dv2", extractionStatus: "FAILED" }), version()],
    })
  );
  assert.equal(r.status, "CONECTADO");
});

t("idempotencia: reenvio/duplicata do mesmo MPP conta UMA vez", () => {
  const r = run(
    facts({
      intakes: [intake(), intake({ id: "i2", status: "RECEIVED_DUPLICATE", mppDocumentVersionId: "dv1" }), intake({ id: "i3", mppDocumentVersionId: "dv9", sha256: "a".repeat(64) })],
      scheduleVersions: [version(), version({ documentVersionId: "dv9" })],
      workbooks: [wb(), wb({ id: "w2" })],
    })
  );
  assert.equal(r.processedMppCount, 1);
  assert.equal(r.weeklyExcelCount, 1);
});

t("ingestao semanal desabilitada/ausente => PENDENTE INGESTION_NOT_ENABLED", () => {
  assert.equal(run(facts({ config: null })).cause, "INGESTION_NOT_ENABLED");
  assert.equal(run(facts({ config: { ...config, enabled: false } })).cause, "INGESTION_NOT_ENABLED");
});

t("ERRO/ATENCAO armazenados prevalecem; CONECTADO armazenado nao e rebaixado", () => {
  const f = facts({ intakes: [intake()], scheduleVersions: [version()] });
  assert.equal(run(f, { storedStatus: "ERRO" }).status, "ERRO");
  assert.equal(run(f, { storedStatus: "ATENCAO" }).status, "ATENCAO");
  assert.equal(run(facts(), { storedStatus: "CONECTADO" }).status, "CONECTADO");
});

t("leitura falha (facts null) => fail-safe: mantem status armazenado, sem motivo", () => {
  assert.deepEqual(
    [run(null).status, run(null).cause, run(null).detail],
    ["PENDENTE", null, null]
  );
  assert.equal(run(null, { storedStatus: null }).status, "PENDENTE");
});

t("isolamento: a regra so olha os fatos recebidos (outro projeto => fatos vazios => pendente)", () => {
  const projectA = facts({ intakes: [intake()], scheduleVersions: [version()] });
  const projectB = facts();
  assert.equal(run(projectA).status, "CONECTADO");
  assert.equal(run(projectB).status, "PENDENTE");
});

t("override em resolveAllIntegrationStatuses: status + motivo no rotulo; demais fontes intactas", () => {
  const sources = [
    { type: "EMAIL", label: "E-mail" },
    { type: "CRONOGRAMA", label: "Cronograma" },
    { type: "ERP", label: "ERP" },
  ];
  const entries = resolveAllIntegrationStatuses(sources, [], "CONECTADO", {
    CRONOGRAMA: { status: "PENDENTE", detail: "nenhum e-mail semanal recebido (sem. 09/11)" },
  });
  assert.equal(entries[0].status, "CONECTADO");
  assert.equal(entries[1].label, "Cronograma · nenhum e-mail semanal recebido (sem. 09/11)");
  assert.equal(entries[2].label, "ERP");
  const legacy = resolveAllIntegrationStatuses(sources, [], "CONECTADO");
  assert.equal(legacy[1].label, "Cronograma");
});

// ---------- leitor somente-leitura ----------
t("leitor: estaticamente SOMENTE leitura (sem insert/update/delete/upsert/rpc)", () => {
  const code = src("apps/web/lib/dashboard-visual/get-cronograma-weekly-facts.ts").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\.(insert|update|delete|upsert|rpc)\s*\(/);
  assert.match(code, /\.select\(/);
  for (const table of ["weekly_schedule_email_intakes", "weekly_report_workbooks", "schedule_versions", "project_weekly_schedule_ingestion_configs"]) {
    assert.ok(code.includes(table), table);
  }
});

t("dashboard: ligacao usa o resolvedor semanal e nao o Excel para promover", () => {
  const dash = src("apps/web/lib/dashboard-visual/get-dashboard-visual-data.ts");
  assert.match(dash, /resolveWeeklyCronogramaStatus/);
  assert.match(dash, /getCronogramaWeeklyFacts\(supabase, projectId\)/);
  const resolver = src("apps/web/lib/schedule/weekly-ingestion/resolve-weekly-cronograma-status.ts").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(resolver, /import .*supabase/i);
});

// Cliente falso: grava chamadas; so permite metodos de leitura.
function fakeClient({ failOn = null } = {}) {
  const calls = [];
  const tables = {
    project_weekly_schedule_ingestion_configs: { enabled: true, deadline_weekday: 5, deadline_time: "18:00:00", timezone: "America/Sao_Paulo" },
    weekly_schedule_email_intakes: [
      { id: "i1", week_start: "2026-11-09", status: "AUTHORIZED_AUTO", document_version_id: "dv1", duplicate_of_document_version_id: null, selected_sha256_hash: "a".repeat(64) },
    ],
    weekly_report_workbooks: [{ id: "w1", file_sha256: "b".repeat(64), emails: { sent_at: "2026-11-11T14:00:00Z" } }],
    schedule_versions: [{ document_version_id: "dv1", extraction_status: "EXTRACTED", document_versions: { mime_type: null, file_path: "x/y.mpp", original_file_name: "cronograma.mpp" } }],
  };
  const from = (table) => {
    const rec = { table, ops: [] };
    calls.push(rec);
    const result = () => (failOn === table ? { data: null, error: { message: "boom" } } : { data: tables[table], error: null });
    const chain = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") return (res) => res(result());
          if (["insert", "update", "delete", "upsert", "rpc"].includes(prop)) throw new Error(`escrita proibida: ${prop}`);
          return (...args) => {
            rec.ops.push([prop, ...args]);
            return prop === "maybeSingle" ? Promise.resolve(result()) : chain;
          };
        },
      }
    );
    return chain;
  };
  return { client: { from, rpc: () => { throw new Error("rpc proibido"); } }, calls };
}

// "server-only" lanca fora do bundler: o leitor e verificado carregando-o com stub.
const { getCronogramaWeeklyFacts: getFacts } = await import("../apps/web/lib/dashboard-visual/get-cronograma-weekly-facts");

{
  const readerCases = [
    ["leitor: filtra TODAS as tabelas por project_id e devolve fatos", async () => {
      const { client, calls } = fakeClient();
      const f = await getFacts(client, "proj-A", NOW_MON);
      assert.ok(f && f.intakes.length === 1 && f.workbooks.length === 1 && f.scheduleVersions[0].isMpp);
      for (const c of calls) {
        const scoped = c.ops.some(([op, col, val]) => op === "eq" && (col === "project_id" || col === "document_versions.project_id") && val === "proj-A");
        assert.ok(scoped, `sem project_id em ${c.table}`);
      }
      assert.equal(R.resolveWeeklyCronogramaStatus({ storedStatus: "PENDENTE", facts: f, now: NOW_MON }).status, "CONECTADO");
    }],
    ["leitor: falha de leitura em qualquer tabela => null (fail-safe)", async () => {
      for (const table of ["project_weekly_schedule_ingestion_configs", "weekly_schedule_email_intakes", "weekly_report_workbooks", "schedule_versions"]) {
        const { client } = fakeClient({ failOn: table });
        assert.equal(await getFacts(client, "proj-A", NOW_MON), null, table);
      }
    }],
  ];
  for (const [name, fn] of readerCases) {
    await fn();
    n++;
    console.log("ok -", name);
  }
}

console.log(`\n${n} verificacoes passaram.`);
