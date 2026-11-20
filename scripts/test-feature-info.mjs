// Testes da Ajuda Contextual Global (ⓘ) — FeatureInfo + registry
// (ACC_FEATURE_HELP). Este projeto não tem framework de teste de
// componentes React (sem jsdom/testing-library instalado) — testes de
// comportamento de DOM/interação são feitos de forma ESTRUTURAL (leitura
// do código-fonte), mesmo princípio já usado nesta suíte para RLS
// (leitura de texto de migration) quando um ambiente de execução real
// não está disponível. Testes de CONTEÚDO (registry, helpIds, labels de
// risco) são reais, não estruturais. NUNCA chama a API Anthropic — este
// pacote é só UI/conteúdo, nenhuma chamada de IA envolvida.
//
// Uso:
//   node --env-file=apps/web/.env.local scripts/test-feature-info.mjs

import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const { ACC_FEATURE_HELP, getFeatureHelp } = await import("../apps/web/lib/ui/feature-help");
const { NAV_ITEMS } = await import("../apps/web/lib/ui/nav-items");
const { severityLabels } = await import("../apps/web/lib/labels");
const { ALL_OFFICIAL_EXPERT_DEFINITIONS } = await import("../apps/web/lib/ai/expert-definitions/definitions");

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
console.log("AJUDA CONTEXTUAL GLOBAL (ⓘ) — TESTES");
console.log("======================================");
console.log("");

// --- Registry: conteúdo real ---

check("registry: toda definição tem id/title/shortDescription/description não vazios", () => {
  for (const [id, def] of Object.entries(ACC_FEATURE_HELP)) {
    assert(def.id === id, `chave "${id}" deveria bater com def.id ("${def.id}")`);
    assert(def.title.trim().length > 0, `${id}.title vazio`);
    assert(def.shortDescription.trim().length > 0, `${id}.shortDescription vazio`);
    assert(def.description.trim().length > 0, `${id}.description vazio`);
  }
});

check("getFeatureHelp devolve null (nunca lança) para um helpId desconhecido", () => {
  assert(getFeatureHelp("nao-existe-nunca") === null);
});

// --- Menu (sidebar): todos os itens reais têm helpId válido ---

// Itens REAIS de NAV_ITEMS (apps/web/lib/ui/nav-items.ts) — 18 hoje. Os itens restritos (Eventos, Financeiro, Integrações, Usuários,
// Autorizações, Reemissão de alertas, Start-up ACC) continuam em NAV_ITEMS; só a exibição é filtrada no layout (server).
// "Análise Contratual"/"Análise de Cláusulas" saíram do menu (o Expert Jurídico é o ponto único; rotas e ajuda preservadas).
const EXPECTED_SIDEBAR_LABELS = [
  "Dashboard",
  "Quatro Pilares",
  "Timeline",
  "Eventos",
  "Solicitações",
  "Ações e Escalonamentos",
  "Jurídico",
  "Documentos",
  "Providências",
  "Financeiro",
  "ESG/SSMA",
  "Experts IA",
  "Integrações",
  "Usuários",
  "Autorizações",
  "Reemissão de alertas",
  "Auditoria",
  "Ajuda e tutorial",
  "Start-up ACC",
];

check(`menu ${EXPECTED_SIDEBAR_LABELS.length}/${EXPECTED_SIDEBAR_LABELS.length}: NAV_ITEMS cobre exatamente os itens reais da sidebar, todos com helpId válido`, () => {
  assert(NAV_ITEMS.length === EXPECTED_SIDEBAR_LABELS.length, `esperado ${EXPECTED_SIDEBAR_LABELS.length} itens, obtido ${NAV_ITEMS.length}`);
  for (const label of EXPECTED_SIDEBAR_LABELS) {
    assert(NAV_ITEMS.some((item) => item.label === label), `item real da sidebar ausente de NAV_ITEMS: "${label}"`);
  }
  for (const item of NAV_ITEMS) {
    assert(typeof item.helpId === "string" && item.helpId.length > 0, `${item.label} sem helpId`);
    assert(ACC_FEATURE_HELP[item.helpId], `helpId "${item.helpId}" (${item.label}) não existe no registry`);
  }
});

check("consistência futura: todo item principal de navegação possui helpId válido (checagem automática — nunca manual)", () => {
  const missing = NAV_ITEMS.filter((item) => !ACC_FEATURE_HELP[item.helpId]);
  assert(missing.length === 0, `itens sem helpId válido: ${missing.map((i) => i.label).join(", ")}`);
});

// --- Experts individuais têm ajuda ---

check("Experts individuais têm ajuda: todos os Experts oficiais (7 com o Analista IA de Qualidade) têm entrada expert-<id> no registry", () => {
  // Os seis especialistas anteriores mantêm a entrada legada expert-<id> (catálogo legado fixo em 91 entradas, ver
  // test-help-catalog). O Analista IA de Qualidade (quality-analyst) NÃO cria entrada legada: o perfil dele vive no
  // módulo experts-ia (experts.qualidade.perfil, formato modulo.tela.elemento) e é o que o hub exibe.
  for (const def of ALL_OFFICIAL_EXPERT_DEFINITIONS) {
    const legacyId = `expert-${def.expertId}`;
    if (def.expertId === "quality-analyst") {
      const profile = ACC_FEATURE_HELP["experts.qualidade.perfil"];
      assert(profile && profile.title.startsWith(def.expertName), "perfil do Analista IA de Qualidade ausente ou com nome divergente");
      continue;
    }
    assert(ACC_FEATURE_HELP[legacyId], `${legacyId} ausente do registry`);
    assert(ACC_FEATURE_HELP[legacyId].title === def.expertName, `título de ${legacyId} deveria bater com o nome real do Expert`);
  }
});

// --- Start-up tem ajuda ---

check("Start-up tem ajuda: os 6 campos/ações internas têm entrada no registry", () => {
  const ids = [
    "startup-project-start-date",
    "startup-acc-operational-start-date",
    "startup-dismiss",
    "startup-resolve",
    "startup-create-action",
    "startup-complete",
  ];
  for (const id of ids) assert(ACC_FEATURE_HELP[id], `${id} ausente do registry`);
});

check("Start-up tem ajuda: page.tsx e os componentes internos realmente renderizam FeatureInfo com os helpIds certos", () => {
  // A tela atual do Start-up é SÓ o checklist de implantação (commit 913d672: cabeçalho histórico, editor de datas e achados saíram da
  // página). A página e o checklist renderizam os ícones novos; os componentes históricos preservados (não montados hoje) mantêm os seus.
  const pageSource = readSource("apps/web/app/[projectId]/startup/page.tsx");
  assert(pageSource.includes('helpId="juridico.startup.pagina"'));
  const checklistSource = readSource("apps/web/components/startup/new-project-startup-checklist.tsx");
  assert(checklistSource.includes('helpId="juridico.startup.checklist"'));
  assert(checklistSource.includes('helpId="juridico.startup.etapa"'));

  const cardSource = readSource("apps/web/components/startup/historical-finding-card.tsx");
  assert(cardSource.includes('helpId="startup-dismiss"'));
  assert(cardSource.includes('helpId="startup-resolve"'));
  assert(cardSource.includes('helpId="startup-create-action"'));

  const buttonSource = readSource("apps/web/components/startup/complete-startup-button.tsx");
  assert(buttonSource.includes('helpId="startup-complete"'));
});

// --- Adicionais tem ajuda ---

check("Adicionais tem ajuda: os 5 campos/ações internas têm entrada no registry", () => {
  const ids = [
    "adicionais-nova-proposta",
    "adicionais-marcar-contratado",
    "adicionais-formalizacao",
    "adicionais-status-prazo",
    "adicionais-documentacao",
  ];
  for (const id of ids) assert(ACC_FEATURE_HELP[id], `${id} ausente do registry`);
});

check("Adicionais tem ajuda: componentes internos (preservados) realmente renderizam FeatureInfo com os helpIds certos", () => {
  // page.tsx e o helpId "adicionais-nova-proposta" (só usado na aba "+
  // Nova proposta", removida) ficaram de fora deste check de propósito:
  // a aba "Serviços Adicionais" foi descontinuada da interface — os
  // componentes internos abaixo continuam existindo (lib/components
  // preservados, só o ponto de entrada foi removido).
  const contractedSource = readSource("apps/web/components/additionals/additional-proposal-contracted-form.tsx");
  assert(contractedSource.includes('helpId="adicionais-marcar-contratado"'));
  assert(contractedSource.includes('helpId="adicionais-formalizacao"'));

  const approvalsSource = readSource("apps/web/components/additionals/additional-proposal-approvals-form.tsx");
  assert(approvalsSource.includes('helpId="adicionais-status-prazo"'));

  const checklistSource = readSource("apps/web/components/additionals/additional-proposal-checklist.tsx");
  assert(checklistSource.includes('helpId="adicionais-documentacao"'));
});

// --- Riscos: labels corretos, nunca HIGH/CRITICAL/Alta/Crítica em PT-BR ---

check("labels de risco corretos: BAIXO/MÉDIO/ALTO/CRÍTICO, nunca a forma feminina nem inglês", () => {
  assert(severityLabels.BAIXA === "Baixo");
  assert(severityLabels.MEDIA === "Médio");
  assert(severityLabels.ALTA === "Alto");
  assert(severityLabels.CRITICA === "Crítico");
});

check("nenhum HIGH/CRITICAL visível em PT-BR: registry de risco nunca contém esses termos em texto exibível", () => {
  for (const id of ["risco-baixo", "risco-medio", "risco-alto", "risco-critico"]) {
    const def = ACC_FEATURE_HELP[id];
    assert(def, `${id} ausente`);
    const allText = `${def.title} ${def.shortDescription} ${def.description}`;
    assert(!/\bHIGH\b|\bCRITICAL\b|\bAlta\b|\bCrítica\b/.test(allText), `${id} contém termo de risco em inglês/feminino: "${allText}"`);
  }
});

check("badges: ALTO (amarelo/preto) e CRÍTICO (vermelho/branco) mantêm caixa sólida + bold (paleta global definitiva); SeverityBadge aceita withInfo opcional sem poluir o uso default", () => {
  const source = readSource("apps/web/components/shared/badges.tsx");
  assert(/ALTA:\s*"[^"]*bg-\[#FFD600\]\s+text-\[#000000\]\s+font-bold[^"]*"/.test(source));
  assert(/CRITICA:\s*"[^"]*bg-\[#DC2626\]\s+text-\[#FFFFFF\]\s+font-bold[^"]*"/.test(source));
  assert(source.includes("withInfo = false"), "withInfo deveria ter default false — nunca poluir os usos existentes de SeverityBadge");
});

// --- FeatureInfo: verificação estrutural (sem framework de DOM disponível) ---

// A implementação vive em HelpHint (sistema universal de Hover Text); FeatureInfo é só o nome histórico (wrapper).
const wrapperSource = readSource("apps/web/components/shared/feature-info.tsx");
const featureInfoSource = readSource("apps/web/components/shared/help-hint.tsx");
const helpContentSource = readSource("apps/web/components/shared/help-content.tsx");

check("FeatureInfo: continua exportado como wrapper fino de HelpHint (usos existentes preservados)", () => {
  assert(wrapperSource.includes("export function FeatureInfo"));
  assert(wrapperSource.includes("<HelpHint"));
});

check("FeatureInfo: acessibilidade — aria-label, aria-expanded, aria-haspopup, role=dialog no popover", () => {
  assert(featureInfoSource.includes("aria-label={`Informações sobre"));
  assert(featureInfoSource.includes("aria-expanded={open}"));
  assert(featureInfoSource.includes("aria-controls={open ? panelId : undefined}") && featureInfoSource.includes("aria-labelledby={titleId}"));
  assert(featureInfoSource.includes('aria-haspopup="dialog"'));
  assert(featureInfoSource.includes('role="dialog"'));
});

check("FeatureInfo: teclado — botão nativo (Enter/Space funcionam sem JS extra), ESC fecha, foco visível", () => {
  assert(/<button/.test(featureInfoSource), "deveria usar <button> nativo (Enter/Space acessíveis por padrão)");
  assert(featureInfoSource.includes('"Escape"'), "deveria fechar com ESC");
  assert(featureInfoSource.includes("focus-visible:ring"), "deveria ter foco visível (focus-visible)");
});

check("FeatureInfo: click nunca navega/seleciona/fecha sidebar/executa ação da linha — preventDefault + stopPropagation no próprio botão", () => {
  assert(featureInfoSource.includes("event.preventDefault()"));
  assert(featureInfoSource.includes("event.stopPropagation()"));
});

check("FeatureInfo: desktop — mouse sobre o ícone abre o painel e ele permanece aberto enquanto o ponteiro estiver no painel; clique fixa", () => {
  assert(featureInfoSource.includes("onPointerEnter") && featureInfoSource.includes("onPointerLeave"), "deveria tratar entrada/saída do ponteiro");
  assert(featureInfoSource.includes("cancelClose") && featureInfoSource.includes("scheduleClose"), "painel deveria permanecer aberto sob o ponteiro (tolerância de saída)");
  assert(featureInfoSource.includes('event.pointerType !== "mouse"'), "hover só vale para mouse (toque nunca depende de hover)");
  assert(helpContentSource.includes("help.description"), "painel deveria usar description (completo)");
  assert(featureInfoSource.includes("HelpContent"), "painel deveria renderizar o conteúdo estruturado");
});

check("HelpHint: posicionamento — portal fixo dentro da tela, vira para cima, rolagem interna, sem rolar a página", () => {
  assert(featureInfoSource.includes("createPortal"), "painel em portal (não é cortado por overflow de ancestrais)");
  assert(featureInfoSource.includes("getBoundingClientRect") && featureInfoSource.includes("window.innerWidth") && featureInfoSource.includes("window.innerHeight"));
  assert(featureInfoSource.includes("overflow-y-auto") && featureInfoSource.includes("overscroll-contain"), "conteúdo longo rolável sem vazar a rolagem");
  assert(!featureInfoSource.includes("scrollIntoView"), "nunca rolar a página automaticamente");
  assert(!/title={[^}]+}|title="/.test(featureInfoSource), "não usar o atributo title");
});

check("HelpHint: mobile — folha inferior com botão Fechar e toque fora; um painel por vez", () => {
  assert(featureInfoSource.includes("max-width: 639px") && featureInfoSource.includes("pointer: coarse"));
  assert(featureInfoSource.includes('aria-label="Fechar ajuda"'));
  assert(featureInfoSource.includes("acc-help-open"), "um painel aberto por vez");
});

check("FeatureInfo: mobile/touch — o mesmo botão que recebe click também recebe tap (nenhum caminho hover-only para abrir o popover)", () => {
  assert(featureInfoSource.includes("onClick={(event) => {"), "abrir o popover deveria estar sempre atrelado a onClick (cobre tap em touch)");
});

check("FeatureInfo: nunca renderiza nada quando helpId é desconhecido (nunca quebra a página por um id inválido)", () => {
  assert(featureInfoSource.includes("if (!help) {"));
  assert(featureInfoSource.includes("return null;"));
});

// --- Sidebar: Hover Text universal (HelpHint/FeatureInfo) AO LADO de cada item e do botão Recolher/Expandir ---
// Mudança de regra (fechamento do Hover Text): antes a trava exigia NENHUM ícone (i) e a dica nativa title; agora exige o ícone universal
// (que funciona por mouse, teclado e toque, inclusive com a sidebar recolhida) e PROÍBE o atributo title como ajuda.

const sidebarSource = readSource("apps/web/components/layout/app-sidebar.tsx");

check("sidebar: cada item de menu renderiza o Hover Text universal (FeatureInfo) com o helpId do item, FORA do <Link>", () => {
  assert(sidebarSource.includes('import { FeatureInfo } from "@/components/shared/feature-info"'), "a sidebar deveria importar FeatureInfo");
  assert(sidebarSource.includes("<FeatureInfo helpId={item.helpId}"), "cada item deveria renderizar <FeatureInfo helpId={item.helpId} />");
  const linkBlock = sidebarSource.slice(sidebarSource.indexOf("<Link"), sidebarSource.indexOf("</Link>"));
  assert(!linkBlock.includes("FeatureInfo") && !linkBlock.includes("HelpHint"), "o ícone de ajuda não pode ficar dentro do <a> (HTML inválido e clique navegaria)");
});

check("sidebar: o botão Recolher/Expandir tem o Hover Text (shared.global.menu-recolher) ao lado, fora do <button>", () => {
  assert(sidebarSource.includes('helpId="shared.global.menu-recolher"'));
  const buttonBlock = sidebarSource.slice(sidebarSource.indexOf("<button"), sidebarSource.indexOf("</button>"));
  assert(!buttonBlock.includes("FeatureInfo"), "o ícone de ajuda não pode ficar dentro do <button> de recolher");
  assert(ACC_FEATURE_HELP["shared.global.menu-recolher"], "entrada shared.global.menu-recolher ausente do registry");
});

check("sidebar: NUNCA usa o atributo title como ajuda (nem itemTitle/shortDescription nativo); aria-label e navegação preservados", () => {
  assert(!/title=/.test(sidebarSource), "a sidebar não deve usar o atributo title");
  assert(!sidebarSource.includes("itemTitle"));
  assert(sidebarSource.includes("aria-label={item.label}"), "aria-label do item preservado");
  assert(sidebarSource.includes("aria-label={collapsed"), "aria-label do botão de recolher preservado");
  assert(sidebarSource.includes("prefetch={false}") && sidebarSource.includes("pathname?.startsWith(href)"));
});

check("sidebar recolhida (só ícones): o ícone de ajuda continua presente em todos os itens (não depende de collapsed nem de hover)", () => {
  const feature = sidebarSource.indexOf("<FeatureInfo helpId={item.helpId}");
  const before = sidebarSource.slice(Math.max(0, feature - 300), feature);
  assert(!/collapsed\s*(\?|&&)\s*\(?\s*<FeatureInfo/.test(before), "FeatureInfo não pode ser condicional a collapsed");
  assert(!sidebarSource.includes("{!collapsed ? <FeatureInfo"), "FeatureInfo não pode ser escondido quando recolhida");
});

check("cabeçalho (top-bar): renderiza shared.global.cabecalho ao lado do título e não usa title nativo", () => {
  const topBar = readSource("apps/web/components/layout/top-bar.tsx");
  assert(topBar.includes('helpId="shared.global.cabecalho"'));
  assert(!/title=/.test(topBar), "o cabeçalho não deve usar o atributo title");
});

check("tela Ajuda e tutorial: expõe icone-ajuda, menu-lateral e status-global (pontos de renderização globais)", () => {
  const ajuda = readSource("apps/web/app/[projectId]/ajuda/page.tsx");
  for (const id of ["shared.global.icone-ajuda", "shared.global.menu-lateral", "shared.global.status-global"]) {
    assert(ajuda.includes(`helpId="${id}"`), `${id} não renderizado na tela Ajuda`);
  }
});

// --- Seção 12: inventário de TODAS as abas/seções reais mapeadas ---
// Cada entrada é um helpId + o arquivo onde ele deve estar realmente
// renderizado (não apenas presente no registry). Usado tanto para testar
// quanto para gerar a tabela "página → abas/seções → ajuda" do relatório.

const TAB_COVERAGE = [
  {
    page: "Ações e Escalonamentos",
    entries: [
      { id: "acoes-tab-abertas", file: "apps/web/app/[projectId]/acoes/page.tsx" },
      { id: "acoes-tab-gerencial", file: "apps/web/app/[projectId]/acoes/page.tsx" },
      { id: "acoes-tab-historico", file: "apps/web/app/[projectId]/acoes/page.tsx" },
      { id: "acoes-tab-nova", file: "apps/web/app/[projectId]/acoes/page.tsx" },
    ],
  },
  {
    page: "Matriz de SLA e Escalonamento (configuração)",
    entries: [
      { id: "sla-config-timezone", file: "apps/web/app/[projectId]/acoes/configuracao/page.tsx" },
      { id: "sla-config-matriz-prazos", file: "apps/web/app/[projectId]/acoes/configuracao/page.tsx" },
      { id: "sla-config-responsaveis", file: "apps/web/app/[projectId]/acoes/configuracao/page.tsx" },
    ],
  },
  {
    page: "ESG/SSMA",
    entries: [
      { id: "esg-tab-pendencias", file: "apps/web/app/[projectId]/esg/page.tsx" },
      { id: "esg-tab-gerencial", file: "apps/web/app/[projectId]/esg/page.tsx" },
      { id: "esg-tab-checklist", file: "apps/web/app/[projectId]/esg/page.tsx" },
      { id: "esg-tab-consultar", file: "apps/web/app/[projectId]/esg/page.tsx" },
    ],
  },
  {
    page: "Documentos",
    entries: [
      { id: "documentos-tab-documentos", file: "apps/web/app/[projectId]/documentos/page.tsx" },
      { id: "documentos-tab-clausulas", file: "apps/web/app/[projectId]/documentos/page.tsx" },
      { id: "documentos-tab-cronograma", file: "apps/web/app/[projectId]/documentos/page.tsx" },
    ],
  },
  // "Adicionais" removida da cobertura de abas: a pagina (page.tsx) nao
  // tem mais aba/secao real, virou redirecionamento (aba "Servicos
  // Adicionais" descontinuada). Os helpIds dos componentes internos
  // preservados (adicionais-marcar-contratado/formalizacao/status-prazo/
  // documentacao) continuam existindo e renderizados nesses arquivos —
  // so nao tem mais uma "pagina" navegavel para agrupa-los aqui.
  {
    page: "Start-up ACC",
    entries: [
      { id: "juridico.startup.pagina", file: "apps/web/app/[projectId]/startup/page.tsx" },
      { id: "juridico.startup.checklist", file: "apps/web/components/startup/new-project-startup-checklist.tsx" },
      { id: "juridico.startup.etapa", file: "apps/web/components/startup/new-project-startup-checklist.tsx" },
      { id: "startup-dismiss", file: "apps/web/components/startup/historical-finding-card.tsx" },
      { id: "startup-resolve", file: "apps/web/components/startup/historical-finding-card.tsx" },
      { id: "startup-create-action", file: "apps/web/components/startup/historical-finding-card.tsx" },
      { id: "startup-complete", file: "apps/web/components/startup/complete-startup-button.tsx" },
    ],
  },
];

console.log("");
console.log("======================================");
console.log("SEÇÃO 12 — COBERTURA DE ABAS/SEÇÕES REAIS");
console.log("======================================");

let coverageTotal = 0;
let coverageWithHelp = 0;

for (const { page, entries } of TAB_COVERAGE) {
  check(`cobertura "${page}": todos os helpIds existem no registry e estão realmente renderizados no arquivo certo`, () => {
    const sourceCache = new Map();
    for (const { id, file } of entries) {
      assert(ACC_FEATURE_HELP[id], `helpId "${id}" (${page}) ausente do registry`);
      if (!sourceCache.has(file)) sourceCache.set(file, readSource(file));
      const source = sourceCache.get(file);
      assert(source.includes(`helpId="${id}"`), `"${file}" não renderiza FeatureInfo com helpId="${id}"`);
    }
  });
  coverageTotal += entries.length;
  coverageWithHelp += entries.length;
  console.log(`${page}: ${entries.length}/${entries.length}`);
}

console.log(`TOTAL GERAL: ${coverageWithHelp}/${coverageTotal}`);

// --- Cada TabsTrigger real das páginas com abas tem um FeatureInfo irmão ---
// (Tabs deste projeto é implementação própria — TabsList é um <div> comum,
// não Radix — então um FeatureInfo pode ser irmão de cada TabsTrigger sem
// quebrar navegação por teclado nem semântica.)

const TABBED_PAGES = [
  "apps/web/app/[projectId]/acoes/page.tsx",
  "apps/web/app/[projectId]/esg/page.tsx",
  "apps/web/app/[projectId]/documentos/page.tsx",
  // "adicionais/page.tsx" removida desta lista: virou redirecionamento
  // puro (aba "Serviços Adicionais" descontinuada), não tem mais <Tabs>.
];

check("nenhuma aba funcional relevante sem ajuda: toda ocorrência de <TabsTrigger tem um <FeatureInfo irmão na mesma página", () => {
  for (const file of TABBED_PAGES) {
    const source = readSource(file);
    const triggerCount = (source.match(/<TabsTrigger/g) ?? []).length;
    const featureInfoInTabsListCount = (source.match(/<FeatureInfo helpId="[^"]+" \/>/g) ?? []).length;
    assert(triggerCount > 0, `${file} deveria ter pelo menos um TabsTrigger`);
    assert(
      featureInfoInTabsListCount >= triggerCount,
      `${file}: ${triggerCount} TabsTrigger mas só ${featureInfoInTabsListCount} FeatureInfo encontrados`
    );
  }
});

check("FeatureInfo dentro de TabsList nunca navega/troca de aba sozinho: é irmão do TabsTrigger, não filho (evita botão dentro de botão)", () => {
  for (const file of TABBED_PAGES) {
    const source = readSource(file);
    // Nenhum FeatureInfo deve aparecer DENTRO do texto de um TabsTrigger
    // (entre a abertura e o fechamento da tag), o que criaria button > button.
    const nestedButtonInButton = /<TabsTrigger[^>]*>[^<]*<FeatureInfo/;
    assert(!nestedButtonInButton.test(source), `${file}: possível FeatureInfo aninhado dentro de um TabsTrigger`);
  }
});

console.log("");
console.log("======================================");
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`);
console.log("======================================");

if (failed > 0) {
  process.exit(1);
}
