// Promocao do conteudo armazenado do Construmanager ao pipeline
// documental: elegibilidade, tipo, dedup, versoes, idempotencia e
// ausencia de nomes no log publico. Sem banco, sem rede.
//
// Uso: node scripts/test-construmanager-document-promotion.mjs

import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";

register("./ts-module-resolver.mjs", import.meta.url);

const m = await import("../apps/web/lib/integrations/construmanager/promote-to-documents.ts");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`OK ${name}`);
}

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sha = (c) => c.repeat(64).slice(0, 64);

function link(n, over = {}) {
  return {
    linkId: uuid(n),
    cmDocumentId: uuid(100 + n),
    cmVersionId: null,
    sha256: sha(String(n % 10)),
    sizeBytes: 1000,
    mimeType: "application/pdf",
    detectedExtension: "pdf",
    metadataExtension: "pdf",
    name: `arquivo-${n}.pdf`,
    folderPath: "OBRA\\PROJETOS - X\\2 - GALPAO",
    revision: "R01",
    statusLabel: "Aprovado",
    authorName: "Autor",
    sourceCreatedAt: "2026-09-01T10:00:00Z",
    sourceApprovedAt: null,
    firstSeenAt: "2026-09-05T10:00:00Z",
    ...over,
  };
}

const empty = { existingProjectHashes: new Set(), existingPromotions: [] };

test("formatos sem extrator ficam fora com motivo", () => {
  const d = m.planPromotions({
    ...empty,
    links: [
      link(1, { detectedExtension: "dwg", metadataExtension: "dwg" }),
      link(2, { detectedExtension: "rvt", metadataExtension: "rvt" }),
      link(3, { detectedExtension: "zip", metadataExtension: "zip" }),
    ],
  });
  assert.ok(d.every((x) => x.action === "EXCLUIDO" && x.reason === "FORMATO_SEM_PROCESSADOR"));
});

test("conteudo real (detectado) prevalece sobre o metadado", () => {
  const [d] = m.planPromotions({ ...empty, links: [link(1, { metadataExtension: "dwg", detectedExtension: "pdf" })] });
  assert.equal(d.action, "PROMOVER");
});

test("tipo documental conservador: nunca contratual, cronograma ou relatorio semanal", () => {
  assert.equal(m.kindFor("pdf", "OBRA\\PROJETOS - WEG\\9 - HIDRO"), "DESENHO");
  assert.equal(m.kindFor("pdf", "OBRA\\ADMINISTRATIVO"), "OUTRO");
  assert.equal(m.kindFor("xlsx", "OBRA\\PROJETOS\\LISTA MESTRA"), "PLANILHA");
  assert.equal(m.kindFor("xls", null), "PLANILHA");
  assert.equal(m.kindFor("txt", "OBRA\\PROJETOS"), "OUTRO");
  for (const ext of ["pdf", "xls", "xlsx", "txt", "docx", "csv", "xml"]) {
    assert.ok(["DESENHO", "PLANILHA", "OUTRO"].includes(m.kindFor(ext, "PROJETOS")));
  }
});

test("acima de 50 MB e vazio sao excluidos", () => {
  const d = m.planPromotions({
    ...empty,
    links: [link(1, { sizeBytes: 52_428_801 }), link(2, { sizeBytes: 0 })],
  });
  assert.equal(d.find((x) => x.linkId === uuid(1)).reason, "ACIMA_DO_LIMITE");
  assert.equal(d.find((x) => x.linkId === uuid(2)).reason, "ARQUIVO_VAZIO");
});

test("dedup por SHA-256 contra o projeto e dentro do lote", () => {
  const d = m.planPromotions({
    existingProjectHashes: new Set([sha("1")]),
    existingPromotions: [],
    links: [link(1), link(2, { sha256: sha("9") }), link(3, { sha256: sha("9") })],
  });
  assert.equal(d.find((x) => x.linkId === uuid(1)).reason, "DUPLICADO_NO_PROJETO");
  const promoted = d.filter((x) => x.action === "PROMOVER");
  assert.equal(promoted.length, 1);
  assert.equal(d.filter((x) => x.reason === "DUPLICADO_NO_LOTE").length, 1);
});

test("idempotente: vinculo ja promovido nao e promovido de novo", () => {
  const d = m.planPromotions({
    existingProjectHashes: new Set([sha("1")]),
    existingPromotions: [{ linkId: uuid(1), cmDocumentId: uuid(101), accDocumentId: "doc", versionIndex: 1, versionLabel: "R01" }],
    links: [link(1)],
  });
  assert.equal(d[0].action, "JA_PROMOVIDO");
});

test("revisoes historicas antes da vigente, no mesmo documento", () => {
  const doc = uuid(500);
  const d = m.planPromotions({
    ...empty,
    links: [
      link(1, { cmDocumentId: doc, cmVersionId: null, sha256: sha("a"), sourceCreatedAt: "2026-10-01T00:00:00Z" }),
      link(2, { cmDocumentId: doc, cmVersionId: uuid(900), sha256: sha("b"), sourceCreatedAt: "2026-08-01T00:00:00Z" }),
      link(3, { cmDocumentId: doc, cmVersionId: uuid(901), sha256: sha("c"), sourceCreatedAt: "2026-07-01T00:00:00Z" }),
    ],
  });
  assert.deepEqual(d.map((x) => x.linkId), [uuid(3), uuid(2), uuid(1)]);
});

test("rotulo de versao usa a revisao sem colidir", () => {
  assert.deepEqual(m.nextVersionSlot([], "R02"), { versionIndex: 1, versionLabel: "R02" });
  assert.deepEqual(m.nextVersionSlot([{ versionIndex: 1, versionLabel: "R02" }], "R02"), { versionIndex: 2, versionLabel: "v2" });
  assert.deepEqual(m.nextVersionSlot([{ versionIndex: 1, versionLabel: "v2" }], null), { versionIndex: 2, versionLabel: "v2-cm" });
});

test("marcador de rastreabilidade ida e volta", () => {
  const notes = m.buildPromotionNotes({ linkId: uuid(7), cmDocumentId: uuid(8), sha256: sha("f") });
  assert.deepEqual(m.parsePromotionNotes(notes), { linkId: uuid(7), cmDocumentId: uuid(8) });
  assert.equal(m.parsePromotionNotes("upload manual"), null);
});

test("limite por rodada e 10", () => {
  assert.equal(m.MAX_PROMOTIONS_PER_RUN, 10);
});

test("script de promocao nao imprime nome, pasta ou titulo", () => {
  const src = readFileSync(new URL("./construmanager-promote-documents.mjs", import.meta.url), "utf8");
  const logCalls = src.match(/log\(\s*`[\s\S]*?`\s*\)/g) ?? [];
  assert.ok(logCalls.length >= 8);
  for (const call of logCalls) {
    assert.ok(!/\$\{[^}]*\b(name|folderPath|title|original_file_name|revision|statusLabel|authorName)\b[^}]*\}/.test(call), call);
  }
});

test("worker de processamento documental nao imprime nome de arquivo", () => {
  const wf = readFileSync(new URL("../.github/workflows/document-processing-worker.yml", import.meta.url), "utf8");
  assert.ok(!/console\.log\([^\n]*original_file_name/.test(wf));
  const proc = readFileSync(new URL("./process-document-version.mjs", import.meta.url), "utf8");
  const lines = proc.split(/\r?\n/).filter((l) => /console\.(log|warn|error)\(/.test(l));
  for (const l of lines) assert.ok(!/original_file_name|document\.title/.test(l), l.trim());
});

console.log(`Resultado: ${passed} passaram, 0 falharam.`);
