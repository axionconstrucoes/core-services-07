// Testes do status de CRONOGRAMA no Dashboard (cronograma oficial MPP).
// Lógica pura + checagem estrutural do leitor (somente-leitura). Sem I/O, sem IA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { resolveCronogramaDisplayStatus, isMppDocumentVersion } = await import("../apps/web/lib/ui/resolve-cronograma-display-status");
const { resolveAllIntegrationStatuses } = await import("../apps/web/lib/ui/resolve-integration-display-status");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

const mpp = { mppExtractedVersionCount: 2, hasActiveMppBaseline: true, weeklyReportWorkbookCount: 5 };

t("MPP processado + baseline ativa => CONECTADO", () => assert.equal(resolveCronogramaDisplayStatus({ storedStatus: null, evidence: mpp }), "CONECTADO"));
t("PENDENTE armazenado + MPP => CONECTADO", () => assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "PENDENTE", evidence: mpp }), "CONECTADO"));
t("so Curva S/Excel (sem MPP) NAO promove", () =>
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "PENDENTE", evidence: { mppExtractedVersionCount: 0, hasActiveMppBaseline: false, weeklyReportWorkbookCount: 54 } }), "PENDENTE"));
t("MPP extraido sem baseline ativa NAO promove", () =>
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "PENDENTE", evidence: { mppExtractedVersionCount: 3, hasActiveMppBaseline: false } }), "PENDENTE"));
t("baseline sem MPP extraido NAO promove", () =>
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: null, evidence: { mppExtractedVersionCount: 0, hasActiveMppBaseline: true } }), "PENDENTE"));
t("sem evidencia => status armazenado", () => assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "PENDENTE", evidence: { mppExtractedVersionCount: 0, hasActiveMppBaseline: false } }), "PENDENTE"));
t("leitura falha (null) => status armazenado", () => {
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "PENDENTE", evidence: null }), "PENDENTE");
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "CONECTADO", evidence: null }), "CONECTADO");
});
t("ERRO e ATENCAO armazenados prevalecem", () => {
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "ERRO", evidence: mpp }), "ERRO");
  assert.equal(resolveCronogramaDisplayStatus({ storedStatus: "ATENCAO", evidence: mpp }), "ATENCAO");
});
t("deteccao de MPP por mime ou extensao", () => {
  assert.equal(isMppDocumentVersion("application/vnd.ms-project", null), true);
  assert.equal(isMppDocumentVersion(null, "a/b/Cronograma.MPP"), true);
  assert.equal(isMppDocumentVersion("application/vnd.ms-excel", "a/curva-s.xlsx"), false);
});
t("override integra em resolveAllIntegrationStatuses sem afetar outras fontes", () => {
  const sources = [{ type: "CRONOGRAMA", label: "Cronograma" }, { type: "ESG_SSMA", label: "ESG" }, { type: "EMAIL", label: "E-mail" }];
  const r = resolveAllIntegrationStatuses(sources, [], "CONECTADO", { CRONOGRAMA: "CONECTADO" });
  assert.deepEqual(r.map((e) => e.status), ["CONECTADO", "PENDENTE", "CONECTADO"]);
  assert.equal(resolveAllIntegrationStatuses(sources, [], "CONECTADO")[0].status, "PENDENTE");
});
t("leitor e somente-leitura por project_id", () => {
  const src = readFileSync(path.join(root, "apps/web/lib/dashboard-visual/get-cronograma-mpp-evidence.ts"), "utf8");
  assert.doesNotMatch(src, /\.(insert|update|upsert|delete|rpc)\(/);
  assert.match(src, /\.eq\("project_id", projectId\)/);
  assert.match(src, /documents\.project_id", projectId/);
  assert.match(src, /catch/);
});
t("Dashboard usa o resolver (ligacao)", () => {
  const src = readFileSync(path.join(root, "apps/web/lib/dashboard-visual/get-dashboard-visual-data.ts"), "utf8");
  assert.match(src, /resolveCronogramaDisplayStatus/);
  assert.match(src, /getCronogramaMppEvidence/);
});
console.log(`${n} testes passaram`);
