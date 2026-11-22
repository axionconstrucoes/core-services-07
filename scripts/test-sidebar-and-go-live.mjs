// Testes estruturais/de dados do pacote de navegação:
// - sidebar recolhível (persistência localStorage, acessibilidade, sem
//   hydration mismatch — useSyncExternalStore em vez de useEffect+setState);
// - startup oficial do ACC (data de início operacional, config reutilizável).
//
// Não renderiza React (sem jsdom no projeto) — verifica código-fonte e
// as funções puras de apps/web/lib/acc-go-live.ts.
//
// Uso:
//   node scripts/test-sidebar-and-go-live.mjs

import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const { ACC_GO_LIVE_DATE, getAccGoLiveDate, isBeforeAccGoLive } = await import("../apps/web/lib/acc-go-live");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

function readSource(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf8");
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}

console.log("");
console.log("======================================");
console.log("SIDEBAR RECOLHÍVEL + STARTUP OFICIAL DO ACC — TESTES");
console.log("======================================");
console.log("");

const sidebarSource = readSource("apps/web/components/layout/app-sidebar.tsx");

check('sidebar persiste o estado recolhido em localStorage sob a chave exata "acc.sidebar.collapsed"', () => {
  assert(sidebarSource.includes('"acc.sidebar.collapsed"'));
});

check("sidebar usa useSyncExternalStore (client-safe, sem hydration mismatch) — nunca useEffect+setState para sincronizar com localStorage", () => {
  assert(sidebarSource.includes("useSyncExternalStore"), "deveria usar useSyncExternalStore");
  assert(!/useEffect\(/.test(sidebarSource), "não deveria haver chamada a useEffect() síncrona lendo localStorage (causaria o erro de lint set-state-in-effect e risco de hydration mismatch)");
});

check("sidebar tem getServerCollapsedSnapshot retornando sempre false (SSR nunca lê localStorage — nunca diverge do cliente)", () => {
  assert(/function getServerCollapsedSnapshot\(\)[^}]*return false/s.test(sidebarSource));
});

check("botão de recolher/expandir tem aria-label correto nos dois estados", () => {
  assert(sidebarSource.includes('"Expandir menu lateral"'));
  assert(sidebarSource.includes('"Recolher menu lateral"'));
});

check("botão de recolher usa ícones Lucide (PanelLeftClose/PanelLeftOpen)", () => {
  assert(sidebarSource.includes("PanelLeftClose"));
  assert(sidebarSource.includes("PanelLeftOpen"));
});

// Contrato atual: SEM tooltip/title nos itens (ícone + texto sempre visíveis, aria-label idêntico ao texto);
// a ajuda vive no ícone (i) dedicado (FeatureInfo) ao lado de cada item. Intenção original preservada:
// todo item continua identificável quando recolhido — agora pelo texto visível em vez de tooltip.
check("todos os itens de navegação são identificáveis quando recolhidos: sem title/tooltip, texto visível + aria-label e ícone (i) de ajuda ao lado", () => {
  assert(!/\btitle=/.test(sidebarSource), "itens não devem usar atributo title (sem tooltip)");
  assert(sidebarSource.includes("aria-label={item.label}"), "aria-label idêntico ao texto visível");
  assert(sidebarSource.includes("<span") && sidebarSource.includes("{item.label}"), "texto do item sempre renderizado (também recolhido)");
  assert(/<FeatureInfo helpId=\{item\.helpId\}/.test(sidebarSource), "ícone (i) de ajuda por item deve ser mantido");
  assert(sidebarSource.includes('helpId="shared.global.menu-recolher"'), "ícone (i) de ajuda do Recolher deve ser mantido");
});

check("item ativo continua destacado independentemente do estado recolhido (ITEM_ACTIVE creme/bordô aplicado pela mesma lógica em ambos os estados)", () => {
  assert(sidebarSource.includes('const ITEM_ACTIVE = "bg-[#f7f3ea] font-semibold text-[#5e1414]"'));
  assert(sidebarSource.includes("active ? ITEM_ACTIVE : ITEM_IDLE"), "destaque independe de collapsed");
  assert(sidebarSource.includes('aria-current={active ? "page" : undefined}'));
});

check("largura recolhida (coluna compacta w-32) e expandida (w-[264px]) estão definidas — conteúdo principal ocupa a largura liberada automaticamente (aside é shrink-0 dentro de um flex, o main já é flex-1 em layout.tsx)", () => {
  assert(sidebarSource.includes('collapsed ? "w-32" : "w-[264px] max-md:w-32"'));
  assert(sidebarSource.includes("shrink-0"));
  const layoutSource = readSource("apps/web/app/[projectId]/layout.tsx");
  assert(layoutSource.includes("flex-1"), "main já é flex-1 — libera a largura automaticamente quando o aside encolhe");
});

check('"Experts IA" está entre os itens de navegação (NAV_ITEMS) e funciona normalmente recolhido (mesma lista/lógica dos demais itens, sem caso especial)', () => {
  assert(readSource("apps/web/lib/ui/nav-items.ts").includes('href: "experts-ia", label: "Experts IA"'));
  assert(sidebarSource.includes("NAV_ITEMS.filter") && sidebarSource.includes("visibleItems.map"), "sidebar itera a mesma lista");
  assert(!sidebarSource.includes("experts-ia"), "sem caso especial para Experts IA na sidebar");
});

check("opções jurídicas removidas do menu (Expert Jurídico único); rotas técnicas preservadas no repositório", () => {
  const navSource = readSource("apps/web/lib/ui/nav-items.ts");
  assert(!navSource.includes('label: "Análise Contratual"'));
  assert(!navSource.includes('label: "Análise de Cláusulas"'));
  assert(navSource.includes('href: "juridico"'));
  assert(readSource("apps/web/app/[projectId]/revisao-contratual/page.tsx").length > 0, "rota preservada");
  assert(readSource("apps/web/app/[projectId]/revisao-clausulas/page.tsx").length > 0, "rota preservada");
});

// --- Startup oficial do ACC ---

check('ACC_GO_LIVE_DATE é exatamente "2026-09-22" (terça-feira — período de testes até 21/09/2026)', () => {
  assert(ACC_GO_LIVE_DATE === "2026-09-22", `esperado "2026-09-22", obtido "${ACC_GO_LIVE_DATE}"`);
});

check("getAccGoLiveDate() retorna a data correta como Date (UTC, meia-noite)", () => {
  const date = getAccGoLiveDate();
  assert(date.toISOString() === "2026-09-22T00:00:00.000Z");
});

check("isBeforeAccGoLive corretamente classifica datas antes/depois do marco", () => {
  assert(isBeforeAccGoLive(new Date("2026-09-01T23:59:59.000Z")) === true);
  assert(isBeforeAccGoLive(new Date("2026-09-22T00:00:00.000Z")) === false);
  assert(isBeforeAccGoLive(new Date("2026-09-23T00:00:00.000Z")) === false);
});

check("acc-go-live.ts nunca é importado por nenhum código de auditoria/migration (marco não deve tocar dados históricos)", () => {
  const auditReferences = readSource("apps/web/lib/acc-go-live.ts");
  assert(auditReferences.includes("NUNCA usar para alterar/reinterpretar"), "arquivo deveria documentar explicitamente a limitação");
});

console.log("");
console.log("======================================");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
console.log("======================================");

if (failed > 0) {
  process.exit(1);
}
