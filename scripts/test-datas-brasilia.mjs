// Padrão de EXIBIÇÃO de data/hora do ACC: America/Sao_Paulo, "DD/MM/AAAA — HH:mm".
//
// Puro: sem rede, sem banco, sem IA. O banco continua em UTC (timestamptz);
// estes helpers só convertem na tela. Protege:
//   1. UTC -> Brasília, inclusive virada de dia/mês/ano;
//   2. data civil "YYYY-MM-DD" (coluna `date`) NUNCA desloca um dia;
//   3. null/vazio/inválido -> "—" (ou fallback), nunca "Invalid Date";
//   4. formato exato "DD/MM/AAAA — HH:mm" (travessão com espaços, 24h);
//   5. o resultado independe do fuso do PROCESSO (servidor Vercel em UTC);
//   6. nomes históricos (formatDate/formatDateTime) e formatadores
//      específicos (financeiro, seguros, Diário de Obra) seguem o padrão;
//   7. telas migradas não voltaram a usar toLocaleString sem timeZone.
//
// Uso: node scripts/test-datas-brasilia.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const L = await import("../apps/web/lib/labels.ts");
const FIN = await import("../apps/web/lib/financial/format-br.ts");
const INS = await import("../apps/web/lib/insurance-ui/format.ts");
const { formatarDataHoraBrasilia } = await import("../apps/web/lib/integrations/diario-de-obra/format-brasilia.ts");

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FALHOU  ${name}\n        ${error instanceof Error ? error.message : String(error)}`);
  }
}

const FORMAT = /^\d{2}\/\d{2}\/\d{4} — \d{2}:\d{2}$/;

console.log("test-datas-brasilia");

for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
  process.env.TZ = tz;

  check(`[TZ do processo=${tz}] UTC -> Brasília no mesmo dia (15:33Z -> 12:33)`, () => {
    assert.equal(L.formatDateTimeBR("2026-11-27T15:33:00Z"), "27/11/2026 — 12:33");
    assert.equal(L.formatDateTime("2026-11-27T15:33:00.000Z"), "27/11/2026 — 12:33");
  });

  check(`[TZ do processo=${tz}] virada de dia: 02:30Z vira 23:30 do dia anterior`, () => {
    assert.equal(L.formatDateTimeBR("2026-11-28T02:30:00Z"), "27/11/2026 — 23:30");
    assert.equal(L.formatDateBR("2026-11-28T02:30:00Z"), "27/11/2026");
    assert.equal(L.formatDate("2026-11-28T02:30:00Z"), "27/11/2026");
  });

  check(`[TZ do processo=${tz}] virada de mês e de ano`, () => {
    assert.equal(L.formatDateTimeBR("2026-12-01T01:00:00Z"), "30/11/2026 — 22:00");
    assert.equal(L.formatDateTimeBR("2027-01-01T02:59:00Z"), "31/12/2026 — 23:59");
    assert.equal(L.formatDateTimeBR("2027-01-01T03:00:00Z"), "01/01/2027 — 00:00");
  });

  check(`[TZ do processo=${tz}] offset explícito e objeto Date`, () => {
    assert.equal(L.formatDateTimeBR("2026-11-27T12:33:00-03:00"), "27/11/2026 — 12:33");
    assert.equal(L.formatDateTimeBR(new Date(Date.UTC(2026, 10, 27, 15, 33))), "27/11/2026 — 12:33");
    assert.equal(L.formatTimeBR("2026-11-27T15:33:00Z"), "12:33");
  });

  check(`[TZ do processo=${tz}] data civil YYYY-MM-DD NÃO é deslocada`, () => {
    assert.equal(L.formatDateBR("2026-11-25"), "25/11/2026");
    assert.equal(L.formatDate("2026-11-25"), "25/11/2026");
    assert.equal(L.formatDateTimeBR("2026-11-25"), "25/11/2026", "data civil não ganha hora inventada");
    assert.equal(L.formatDateBR("2026-01-01"), "01/01/2026");
    assert.equal(L.formatDateBR("2026-12-31"), "31/12/2026");
    assert.equal(FIN.formatDateBR("2026-11-25"), "25/11/2026");
    assert.equal(INS.formatDate("2026-11-25"), "25/11/2026");
  });

  check(`[TZ do processo=${tz}] formatadores específicos seguem o mesmo padrão`, () => {
    assert.equal(FIN.formatDateTimeBR("2026-11-27T15:33:00Z"), "27/11/2026 — 12:33");
    assert.equal(INS.formatDateTime("2026-11-27T15:33:00Z"), "27/11/2026 — 12:33");
    assert.equal(formatarDataHoraBrasilia("2026-11-27T15:33:00Z"), "27/11/2026 — 12:33");
    assert.equal(formatarDataHoraBrasilia("2026-11-28T02:30:00Z"), "27/11/2026 — 23:30");
  });
}
delete process.env.TZ;

check("null/undefined/vazio/inválido -> travessão (nunca 'Invalid Date')", () => {
  for (const v of [null, undefined, "", "nao-e-data", "2026-13-45T99:00:00Z"]) {
    assert.equal(L.formatDateTimeBR(v), "—", `formatDateTimeBR(${JSON.stringify(v)})`);
    assert.equal(L.formatDateBR(v), "—", `formatDateBR(${JSON.stringify(v)})`);
    assert.equal(L.formatTimeBR(v), "—", `formatTimeBR(${JSON.stringify(v)})`);
  }
  assert.equal(L.formatDateTime(null), "—");
  assert.equal(L.formatDate(undefined), "—");
  assert.equal(L.formatDateTimeBR(new Date("x")), "—");
});

check("fallback configurável (financeiro: 'Dado não disponível'; seguros: 'SEM DADOS')", () => {
  assert.equal(L.formatDateTimeBR(null, undefined, "SEM DADOS"), "SEM DADOS");
  assert.equal(FIN.formatDateTimeBR(null), FIN.NOT_AVAILABLE);
  assert.equal(FIN.formatDateTimeBR("lixo"), FIN.NOT_AVAILABLE);
  assert.equal(INS.formatDateTime(undefined), INS.NO_DATA);
});

check("fuso alternativo explícito (ex.: timezone configurado no projeto)", () => {
  assert.equal(L.formatDateTimeBR("2026-11-27T15:33:00Z", "UTC"), "27/11/2026 — 15:33");
  assert.equal(L.formatDateTimeBR("2026-11-27T15:33:00Z", "America/Sao_Paulo"), "27/11/2026 — 12:33");
});

check("formato exato DD/MM/AAAA — HH:mm em 24h (sem vírgula, sem segundos, sem AM/PM)", () => {
  for (const iso of ["2026-11-27T15:33:00Z", "2026-06-01T03:05:09Z", "2026-11-28T02:59:59Z"]) {
    const out = L.formatDateTimeBR(iso);
    assert.match(out, FORMAT, `${iso} -> ${out}`);
  }
  assert.equal(L.formatDateTimeBR("2026-06-01T03:05:09Z"), "01/06/2026 — 00:05", "meia-noite é 00, nunca 24");
  assert.equal(L.DISPLAY_TIME_ZONE, "America/Sao_Paulo");
  assert.equal(L.DATE_TIME_SEPARATOR, " — ");
});

check("helpers usam Intl com timeZone explícito (sem soma/subtração manual de horas)", () => {
  const src = read("apps/web/lib/labels.ts");
  assert.ok(src.includes('DISPLAY_TIME_ZONE = "America/Sao_Paulo"'));
  assert.ok(src.includes("CIVIL_DATE_ONLY"));
  assert.ok(!/getHours\(\)\s*[+-]|setHours\(|[+-]\s*3\s*\*\s*60/.test(src), "conversão manual de fuso proibida");
});

check("telas migradas não usam toLocaleString/toLocaleDateString/Intl.DateTimeFormat ad hoc para datas", () => {
  const migrated = [
    "apps/web/app/[projectId]/alertas/[caseId]/page.tsx",
    "apps/web/app/[projectId]/autorizacoes/page.tsx",
    "apps/web/app/autorizacao-email/[authorizationId]/page.tsx",
    "apps/web/app/[projectId]/documentos/emails/[emailId]/page.tsx",
    "apps/web/app/[projectId]/revisao-clausulas/page.tsx",
    "apps/web/app/[projectId]/ssma-registros/page.tsx",
    "apps/web/components/documents/email-registry/email-registry-panel.tsx",
    "apps/web/components/documents/link-client-response-control.tsx",
    "apps/web/components/ledger/run-multi-expert-curation-button.tsx",
    "apps/web/components/risk/risk-review-panel.tsx",
    "apps/web/components/sla/pilot-risk-alerts-panel.tsx",
    "apps/web/components/ssma/checklist-photos/checklist-submissions-gallery.tsx",
    "apps/web/components/ssma/field-records/esg-evidence-link.tsx",
    "apps/web/components/ssma/field-records/field-records-app.tsx",
    "apps/web/components/ssma/field-records/field-records-table.tsx",
    "apps/web/components/ssma/field-records/possible-duplicates-panel.tsx",
    "apps/web/components/ssma/field-records/record-detail.tsx",
  ];
  for (const rel of migrated) {
    const src = read(rel);
    assert.ok(!/new Date\([^)]*\)\.toLocale(Date)?String\(/.test(src), `${rel} ainda formata data com toLocale*`);
    assert.ok(!/Intl\.DateTimeFormat\("pt-BR"/.test(src), `${rel} ainda tem Intl.DateTimeFormat ad hoc`);
    assert.ok(/formatDate(Time)?BR/.test(src), `${rel} deveria usar formatDateBR/formatDateTimeBR`);
  }
});

console.log(`\n${passed} ok, ${failures.length} falha(s)`);
if (failures.length) process.exit(1);
