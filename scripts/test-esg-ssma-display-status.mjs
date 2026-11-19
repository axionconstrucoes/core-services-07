// ESG/SSMA no Dashboard: "módulo SSMA operacional" x "integração externa ESG/SSMA conectada" (lib/ui/resolve-esg-ssma-display-status.ts).
// Regra: registros internos NUNCA promovem o status da integração externa (PENDENTE segue PENDENTE); só o rótulo informa o módulo.
// Lógica pura; nenhuma chamada externa, nenhum banco.
// Uso: node scripts/test-esg-ssma-display-status.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { resolveSsmaModuleState, resolveEsgSsmaIntegrationLabel } = await import("../apps/web/lib/ui/resolve-esg-ssma-display-status");
const { resolveAllIntegrationStatuses, summarizeIntegrationStatuses } = await import("../apps/web/lib/ui/resolve-integration-display-status");
const { resolveSystemStatus } = await import("../apps/web/lib/ui/resolve-system-status");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name}: ${e instanceof Error ? e.message : e}`);
  }
}
const eq = (a, b, m) => {
  if (a !== b) throw new Error(`${m ?? ""} esperado=${b} obtido=${a}`);
};
const ev = (o = {}) => ({ formSubmissions: 0, fieldRecords: 0, correctiveActions: 0, photosFailed: 0, ...o });
// Retrato real do projeto WEG DEV em 16/11/2026: integração externa PENDENTE; módulo com 21 formulários, 2 registros de campo, 2 ações.
const WEG = ev({ formSubmissions: 21, fieldRecords: 2, correctiveActions: 2 });
const BASE = "ESG/SSMA";

check("módulo: registros reais => OPERACIONAL; qualquer um dos 3 tipos basta", () => {
  eq(resolveSsmaModuleState(WEG), "OPERACIONAL");
  for (const k of ["formSubmissions", "fieldRecords", "correctiveActions"]) eq(resolveSsmaModuleState(ev({ [k]: 1 })), "OPERACIONAL", k);
});
check("módulo: sem registros => SEM_REGISTROS; só fotos com falha (sem registros) não é operação", () => {
  eq(resolveSsmaModuleState(ev()), "SEM_REGISTROS");
  eq(resolveSsmaModuleState(ev({ photosFailed: 3 })), "SEM_REGISTROS");
});
check("módulo: leitura falhou (null) => NAO_VERIFICADO (nada é afirmado)", () => eq(resolveSsmaModuleState(null), "NAO_VERIFICADO"));
check("módulo: registros + fotos com falha => COM_FALHA_DE_FOTOS", () => eq(resolveSsmaModuleState(ev({ formSubmissions: 2, photosFailed: 1 })), "COM_FALHA_DE_FOTOS"));

check("rótulo (caso real): PENDENTE + módulo operacional => explica os dois estados, sem dizer que está conectado", () => {
  const label = resolveEsgSsmaIntegrationLabel(BASE, "PENDENTE", WEG);
  eq(label, "ESG/SSMA (módulo SSMA operacional; integração externa não conectada)");
  if (/ativo|conectado\)/i.test(label.replace("não conectada", ""))) throw new Error("rótulo afirma conexão");
});
check("rótulo: status ausente também qualifica (integração externa não existe/nunca verificada)", () => eq(resolveEsgSsmaIntegrationLabel(BASE, null, WEG), "ESG/SSMA (módulo SSMA operacional; integração externa não conectada)"));
check("rótulo: ERRO/ATENCAO também mostram a situação do módulo, sem esconder o problema da integração", () => {
  for (const st of ["ERRO", "ATENCAO"]) eq(resolveEsgSsmaIntegrationLabel(BASE, st, WEG), "ESG/SSMA (módulo SSMA operacional; integração externa não conectada)", st);
});
check("rótulo: fotos com falha => informa a falha (não afirma 'operacional' limpo)", () => {
  const label = resolveEsgSsmaIntegrationLabel(BASE, "PENDENTE", ev({ formSubmissions: 5, photosFailed: 2 }));
  if (!label.includes("fotos sem sincronizar")) throw new Error(label);
});
check("rótulo: CONECTADO mantém o rótulo original", () => eq(resolveEsgSsmaIntegrationLabel(BASE, "CONECTADO", WEG), BASE));
check("rótulo: sem registros, sem leitura ou zero evidência => rótulo original (nada novo é afirmado)", () => {
  eq(resolveEsgSsmaIntegrationLabel(BASE, "PENDENTE", ev()), BASE);
  eq(resolveEsgSsmaIntegrationLabel(BASE, "PENDENTE", null), BASE);
});

// Integração com o cabeçalho: o STATUS não muda — continua INTEGRAÇÕES PARCIAIS, agora com o motivo claro.
const sources = [
  { type: "EMAIL", label: "E-mail corporativo" },
  { type: "DIARIO_OBRA", label: "Diário de Obra" },
  { type: "CONSTRUMANAGER", label: "Construmanager" },
  { type: "ESG_SSMA", label: BASE },
];
const header = (esgStored, evidence) => {
  const configs = [
    { sourceType: "DIARIO_OBRA", status: "CONECTADO" },
    { sourceType: "CONSTRUMANAGER", status: "CONECTADO" },
    ...(esgStored ? [{ sourceType: "ESG_SSMA", status: esgStored }] : []),
  ];
  const labeled = sources.map((s) => (s.type === "ESG_SSMA" ? { ...s, label: resolveEsgSsmaIntegrationLabel(s.label, esgStored, evidence) } : s));
  const entries = resolveAllIntegrationStatuses(labeled, configs, "CONECTADO");
  return { entries, system: resolveSystemStatus(summarizeIntegrationStatuses(entries)) };
};
check("cabeçalho: PENDENTE + módulo operacional NÃO vira ATIVO — segue PARCIAIS e o motivo cita módulo e integração externa", () => {
  const { entries, system } = header("PENDENTE", WEG);
  eq(entries.find((e) => e.sourceType === "ESG_SSMA").status, "PENDENTE");
  eq(system.label, "INTEGRAÇÕES PARCIAIS");
  if (!system.reason.includes("módulo SSMA operacional") || !system.reason.includes("integração externa não conectada")) throw new Error(system.reason);
});
check("cabeçalho: sem cadastro da fonte (ausente) + módulo operacional => PENDENTE, nunca ATIVO", () => eq(header(null, WEG).entries.find((e) => e.sourceType === "ESG_SSMA").status, "PENDENTE"));
check("cabeçalho: integração externa CONECTADO => INTEGRAÇÕES ATIVAS (rótulo original)", () => {
  const { system } = header("CONECTADO", ev());
  eq(system.label, "INTEGRAÇÕES ATIVAS");
});
check("cabeçalho: ERRO da integração externa => FALHA EM INTEGRAÇÃO (não é suavizado)", () => eq(header("ERRO", WEG).system.label, "FALHA EM INTEGRAÇÃO"));

// Estrutura: a leitura é só-leitura (head count), filtrada por projeto, e o Dashboard NÃO altera o status.
const read = (p) => readFileSync(path.join(root, p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const reader = strip(read("apps/web/lib/integrations/esg-ssma/get-ssma-operation-evidence.ts"));
const resolver = strip(read("apps/web/lib/ui/resolve-esg-ssma-display-status.ts"));
const dash = strip(read("apps/web/lib/dashboard-visual/get-dashboard-visual-data.ts"));
check("leitor: só select/head count, sempre por project_id, sem escrita; falha => null", () => {
  if (/\.(insert|update|upsert|delete|rpc)\(/.test(reader)) throw new Error("escrita/rpc no leitor");
  const selects = reader.match(/\.select\(/g)?.length ?? 0;
  const byProject = reader.match(/\.eq\("project_id", projectId\)/g)?.length ?? 0;
  if (selects < 2 || byProject < 2 || !/head: true/.test(reader) || !/return null/.test(reader)) throw new Error(`select=${selects} eq=${byProject}`);
});
check("resolvedor não produz status (não promove): nenhum retorno de 'CONECTADO'/'PENDENTE' como IntegrationStatus", () => {
  if (/return\s+"(CONECTADO|PENDENTE|ATENCAO|ERRO)"/.test(resolver)) throw new Error("resolvedor retorna status");
});
check("Dashboard: usa só o rótulo; integrationConfigs vai intacto ao resumo (status não é reescrito)", () => {
  if (!/resolveEsgSsmaIntegrationLabel\(/.test(dash)) throw new Error("sem rótulo");
  if (!/resolveAllIntegrationStatuses\(sourcesForStatus, integrationConfigs, emailStatus(?:\)|,\s*\{\s*CRONOGRAMA:)/.test(dash)) throw new Error("configs alterados");
  if (/displayConfigs/.test(dash)) throw new Error("ainda reescreve configs");
});

console.log(`\n${passed} OK, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
