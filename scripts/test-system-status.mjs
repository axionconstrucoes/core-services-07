// Testa a regra do selo "SISTEMA ..." do Dashboard (lib/ui/resolve-system-status.ts)
// e a ligação dela com a página. Lógica pura; nenhuma chamada externa.
//
// Uso: node scripts/test-system-status.mjs

import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const { resolveSystemStatus } = await import("../apps/web/lib/ui/resolve-system-status");
const { summarizeIntegrationStatuses } = await import("../apps/web/lib/ui/resolve-integration-display-status");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(actual)}`);
}

const entry = (sourceType, label, status) => ({ sourceType, label, status });
const EMAIL = ["EMAIL", "E-mail Corporativo (Google Workspace)"];
const DIARIO = ["DIARIO_OBRA", "Diário de Obra"];
const CONSTRU = ["CONSTRUMANAGER", "Construmanager"];
const ESG = ["ESG_SSMA", "ESG / SSMA"];
const status = (...entries) => resolveSystemStatus(summarizeIntegrationStatuses(entries.map(([src, st]) => entry(src[0], src[1], st))));

check("todas as fontes ativas: OPERACIONAL, sem motivo", () => {
  const s = status([EMAIL, "CONECTADO"], [DIARIO, "CONECTADO"], [CONSTRU, "CONECTADO"], [ESG, "CONECTADO"]);
  eq(s.level, "OPERACIONAL", "nível");
  eq(s.label, "INTEGRAÇÕES ATIVAS", "selo");
  eq(s.reason, "", "motivo");
});

check("caso exemplo (3 ativas + ESG/SSMA pendente): PARCIAL e nomeia a fonte; não é falha", () => {
  const s = status([EMAIL, "CONECTADO"], [DIARIO, "CONECTADO"], [CONSTRU, "CONECTADO"], [ESG, "PENDENTE"]);
  eq(s.level, "PARCIAL", "nível");
  eq(s.label, "INTEGRAÇÕES PARCIAIS", "selo");
  if (!s.reason.includes("ESG / SSMA") || !s.reason.includes("pendente")) throw new Error(`motivo: ${s.reason}`);
});

check("fonte em ATENCAO (credencial a renovar): PARCIAL", () => {
  const s = status([EMAIL, "ATENCAO"], [DIARIO, "CONECTADO"], [CONSTRU, "CONECTADO"], [ESG, "CONECTADO"]);
  eq(s.level, "PARCIAL", "nível");
  if (!s.reason.includes("E-mail Corporativo")) throw new Error(`motivo: ${s.reason}`);
});

check("fonte em ERRO: FALHA, mesmo com as outras ativas", () => {
  const s = status([EMAIL, "ERRO"], [DIARIO, "CONECTADO"], [CONSTRU, "CONECTADO"], [ESG, "CONECTADO"]);
  eq(s.level, "FALHA", "nível");
  eq(s.label, "FALHA EM INTEGRAÇÃO", "selo");
  if (!s.reason.includes("E-mail Corporativo")) throw new Error(`motivo: ${s.reason}`);
});

check("ERRO prevalece sobre PENDENTE", () => {
  const s = status([EMAIL, "PENDENTE"], [DIARIO, "ERRO"], [CONSTRU, "CONECTADO"], [ESG, "PENDENTE"]);
  eq(s.level, "FALHA", "nível");
});

check("todas pendentes (projeto novo, nada configurado): PARCIAL, não indisponível", () => {
  const s = status([EMAIL, "PENDENTE"], [DIARIO, "PENDENTE"], [CONSTRU, "PENDENTE"], [ESG, "PENDENTE"]);
  eq(s.level, "PARCIAL", "nível");
});

check("sem nenhuma fonte conhecida: SEM_INTEGRACOES (não afirma falha nem operação)", () => {
  eq(resolveSystemStatus([]).level, "SEM_INTEGRACOES", "lista vazia");
  eq(resolveSystemStatus(summarizeIntegrationStatuses([])).label, "SEM INTEGRAÇÕES", "grupos zerados");
});

check("nomenclatura mede integrações: nenhum rótulo declara que o sistema/suíte está fora do ar", () => {
  const groups = (statuses) => summarizeIntegrationStatuses(statuses.map((st, i) => entry("EMAIL", `Fonte ${i}`, st)));
  for (const statuses of [["CONECTADO"], ["CONECTADO", "PENDENTE"], ["CONECTADO", "ATENCAO"], ["ERRO", "CONECTADO"], ["PENDENTE", "PENDENTE"], []]) {
    const label = resolveSystemStatus(groups(statuses)).label;
    if (!/INTEGRA/.test(label) || /SISTEMA|NÃO OPERACIONAL/.test(label)) throw new Error(`rótulo ambíguo: ${label}`);
  }
});

const page = readFileSync(path.join(root, "apps/web/app/[projectId]/dashboard/page.tsx"), "utf8");
check("a página usa resolveSystemStatus e não repete a regra antiga", () => {
  if (!page.includes("resolveSystemStatus(data.integrationStatusGroups)")) throw new Error("a página não chama resolveSystemStatus");
  if (/systemOperational/.test(page)) throw new Error("ainda existe a variável systemOperational");
  if (page.includes("FALHA EM INTEGRAÇÃO")) throw new Error("texto fixo do selo na página");
});

check("o selo mostra cor por nível (verde / âmbar / vermelho) e o motivo", () => {
  for (const marker of ['systemStatus.level === "OPERACIONAL"', 'systemStatus.level === "PARCIAL"', 'systemStatus.level === "FALHA"', "bg-red-600", "bg-amber-400", "bg-emerald-600", "systemStatus.reason"]) {
    if (!page.includes(marker)) throw new Error(`falta ${marker} na página`);
  }
});

const css = readFileSync(path.join(root, "apps/web/app/globals.css"), "utf8");
check("fundo do Dashboard vem do token --dashboard-bg e o antigo #260611 saiu", () => {
  if (!css.includes("--dashboard-bg:")) throw new Error("token --dashboard-bg ausente em globals.css");
  if (!page.includes("bg-[var(--dashboard-bg)]")) throw new Error("a página não usa o token");
  if (page.includes("#260611")) throw new Error("cor antiga ainda na página");
});

check("o fundo do Dashboard segue o tema escuro aprovado (grafite #1B2027, docs/ui-redesign-axion.md), sem redefinir a marca", () => {
  const dash = css.match(/--dashboard-bg:\s*(#[0-9a-fA-F]{6})/);
  if (!dash) throw new Error("--dashboard-bg deve ser o grafite hexadecimal do tema");
  if (dash[1].toLowerCase() !== "#0b1629") throw new Error(`fundo esperado #0b1629, obtido ${dash[1]}`);
  if (!/--brand-sidebar:\s*oklch\(0\.396 0\.141 25\.723\)/.test(css)) throw new Error("--brand-sidebar (vermelho da marca) não pode ser alterado");
});

check("sem font-black no Dashboard", () => {
  if (/font-(black|extrabold)/.test(page)) throw new Error("peso Black/Extrabold encontrado");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
