// Entrada da FIXTURE estática do HelpHint (testes de navegador). Monta o componente REAL (apps/web/components/shared/help-hint.tsx)
// com o catálogo REAL, sem login, Supabase ou rede. Cenas por hash: #main (fluxo com pai clicável) e #corners (ícones nas bordas).
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HelpHint } from "@/components/shared/help-hint";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CONSTRUMANAGER_SEARCH_INPUT_CLASS } from "@/components/integrations/construmanager-panel-styles";
import { ACC_FEATURE_HELP, ALL_HELP_ENTRIES } from "@/lib/ui/help/registry";
import type { FeatureHelpDefinition } from "@/lib/ui/help/types";

const size = (e: unknown) => JSON.stringify(e).length;
const para = (n: number) => Array.from({ length: n }, (_, i) => `Frase ${i + 1} de teste com texto suficiente para exigir rolagem interna do painel de ajuda.`).join(" ");
const items = (n: number, label: string) => Array.from({ length: n }, (_, i) => `${label} ${i + 1}: descrição de item com extensão realista para a lista do painel.`);

// Entradas SINTÉTICAS da fixture (todos os campos do contrato, incluindo fórmula e vigência): não dependem do estado do catálogo real,
// que muda conforme os módulos são preenchidos. Registradas no mesmo objeto que o HelpHint consulta (ACC_FEATURE_HELP).
const FIXTURE_FULL: FeatureHelpDefinition = {
  id: "fixture.completo.todos-os-campos", title: "Entrada completa da fixture (todos os campos)", shortDescription: "Entrada sintética com todos os campos.",
  description: para(4), purpose: para(2), howToUse: items(5, "Passo"), howItWorks: para(3), data: items(4, "Dado"), uses: items(2, "Uso"), criteria: items(4, "Critério"),
  formula: "SE (valor_medido / valor_contratado) > 1,10 ENTÃO 'acima' SENÃO 'dentro' ; soma(itens.valor) - desconto", source: "tabela fixture_origem (somente leitura)",
  unit: "R$ por mês de referência", refresh: "Atualiza a cada abertura da tela.", missingData: "Sem fonte; nunca tratado como zero.", result: "Indicador numérico com status.",
  consequences: items(2, "Consequência"), permissions: "Perfis com acesso ao módulo.", limitations: items(3, "Limitação"),
  validity: "Regra aprovada difere da publicada até a migration correspondente ser aplicada.", humanReview: "Toda leitura exige revisão humana antes de decidir.", version: "2026-11-20", kind: "kpi", module: "fixture",
};
const FIXTURE_KPI: FeatureHelpDefinition = {
  id: "fixture.kpi.com-formula", title: "Indicador com fórmula", shortDescription: "KPI sintético.", description: "Indicador sintético com fórmula e fonte para teste de contraste.",
  formula: "a / b", source: "tabela fixture", unit: "%", version: "2026-11-20", kind: "kpi", module: "fixture",
};
(ACC_FEATURE_HELP as Record<string, FeatureHelpDefinition>)[FIXTURE_FULL.id] = FIXTURE_FULL;
(ACC_FEATURE_HELP as Record<string, FeatureHelpDefinition>)[FIXTURE_KPI.id] = FIXTURE_KPI;
const FULL = FIXTURE_FULL;
const MID = FIXTURE_KPI;
const SHORT = [...ALL_HELP_ENTRIES].sort((a, b) => size(a) - size(b))[0]; // entrada REAL mais curta do catálogo

declare global {
  interface Window {
    __ready?: boolean;
    __ids?: Record<string, string>;
    __parent?: { click: number; keydown: number; pointerdown: number };
  }
}

const POS = ["tl", "tm", "tr", "ml", "mm", "mr", "bl", "bm", "br"] as const;
const POS_STYLE: Record<(typeof POS)[number], React.CSSProperties> = {
  tl: { left: 6, top: 6 },
  tm: { left: "50%", top: 6 },
  tr: { right: 6, top: 6 },
  ml: { left: 6, top: "50%" },
  mm: { left: "50%", top: "50%" },
  mr: { right: 6, top: "50%" },
  bl: { left: 6, bottom: 6 },
  bm: { left: "50%", bottom: 6 },
  br: { right: 6, bottom: 6 },
};

function Main() {
  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Fixture do Hover Text</h1>
      <p>Texto de página para contexto de contraste.</p>
      <button id="before" type="button" style={{ border: "1px solid var(--input)", padding: "4px 8px", marginRight: 8 }}>Antes</button>
      <div
        id="parent"
        role="group"
        aria-label="Linha clicável de teste"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: 8, border: "1px solid var(--border)", margin: "8px 0" }}
        onClick={() => { window.__parent!.click += 1; }}
        onKeyDown={() => { window.__parent!.keydown += 1; }}
        onPointerDown={() => { window.__parent!.pointerdown += 1; }}
      >
        <span>Indicador curto</span>
        <HelpHint helpId={SHORT.id} className="hint-a" />
      </div>
      <button id="after" type="button" style={{ border: "1px solid var(--input)", padding: "4px 8px", marginLeft: 8 }}>Depois</button>
      <p style={{ marginTop: 24 }}>
        Indicador com fórmula <HelpHint helpId={MID.id} className="hint-b" />
      </p>
      <p style={{ marginTop: 24 }}>
        Entrada completa (conteúdo longo) <HelpHint helpId={FULL.id} className="hint-c" />
      </p>
      <div style={{ height: 1600 }} aria-hidden="true" />
    </main>
  );
}

function Corners() {
  return (
    <main>
      <h1 style={{ position: "absolute", left: 120, top: 120, fontSize: 16 }}>Ícones nas bordas</h1>
      {POS.map((p) => (
        <div key={p} style={{ position: "fixed", ...POS_STYLE[p] }}>
          <HelpHint helpId={FULL.id} className={`pos-${p}`} />
        </div>
      ))}
      <div style={{ height: 2400 }} aria-hidden="true" />
    </main>
  );
}

function Catalog() {
  // Uma linha por entrada REAL do catálogo (varredura --sweep): cada ícone é aberto e medido no navegador.
  return (
    <main style={{ padding: 12 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600 }}>Catálogo completo ({ALL_HELP_ENTRIES.length} entradas)</h1>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {ALL_HELP_ENTRIES.map((en) => (
          <li key={en.id} data-sw={en.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 2px" }}>
            <span style={{ fontSize: 12 }}>{en.title}</span>
            <HelpHint helpId={en.id} />
          </li>
        ))}
      </ul>
    </main>
  );
}

// Sidebar REAL (components/layout/app-sidebar.tsx; next/link e next/navigation substituídos por stubs da fixture). ?collapsed=1 recolhe.
function Sidebar() {
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <AppSidebar projectId="fixture-proj" hiddenHrefs={[]} />
      <main style={{ flex: 1, padding: 12 }}><h1 style={{ fontSize: 16 }}>Conteúdo</h1></main>
    </div>
  );
}

// Cabeçalhos de tabela, cartões de Ações e formulário extenso com ícones de ajuda (popovers em contextos reais de layout).
function Layout() {
  const cols = ["Título", "Prazo", "Responsável", "Criticidade", "Status"];
  return (
    <main style={{ padding: 12 }}>
      <h1 style={{ fontSize: 16, fontWeight: 600 }}>Tabela</h1>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th key={c} style={{ textAlign: "left", padding: "6px 4px", whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {c}
                    <HelpHint helpId={i % 2 ? MID.id : FULL.id} className={`th-${i}`} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody><tr>{cols.map((c) => <td key={c} style={{ padding: 4 }}>valor</td>)}</tr></tbody>
        </table>
      </div>
      <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Cartões de ações</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 8 }}>
        {[0, 1, 2].map((i) => (
          <section key={i} className="rounded-md border border-border bg-card p-3 text-card-foreground">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4 }}>
              <h2 style={{ fontSize: 14, fontWeight: 600 }}>Ação {i + 1}</h2>
              <HelpHint helpId={FULL.id} className={`card-${i}`} />
            </div>
            <button type="button" style={{ marginTop: 8, border: "1px solid var(--input)", padding: "6px 10px" }}>Registrar</button>
          </section>
        ))}
      </div>
      <h1 style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Formulário extenso</h1>
      <form>
        {Array.from({ length: 24 }, (_, i) => (
          <div key={i} style={{ marginBottom: 10 }}>
            <label htmlFor={`f${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>Campo {i + 1}<HelpHint helpId={FULL.id} className={`form-${i}`} /></label>
            <input id={`f${i}`} style={{ display: "block", width: "100%", border: "1px solid var(--input)", padding: 6, background: "transparent" }} />
          </div>
        ))}
      </form>
    </main>
  );
}

// Os 16 apontamentos do auditor de contraste (docs/design-system/contraste-revisao-modulos.md), com as CLASSES REAIS dos arquivos de módulo
// (copiadas literalmente; scripts/test-help-fixture-sync.mjs garante que continuam idênticas ao código-fonte) e o CSS REAL do app.
// Componentes com server action não podem ser importados no navegador; por isso a fixture reproduz a estrutura mínima ao redor das classes.
const A = (n: string) => <button id={`anchor-${n}`} type="button" style={{ border: "1px solid var(--input)", padding: "2px 6px", marginRight: 6 }}>âncora</button>;
function ContrastScene() {
  const veraBase = "group inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full p-0.5 pr-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 sm:pr-3 hover:bg-black/10 focus-visible:!outline-black";
  const veraText = "sm:inline text-[11px] font-bold leading-tight text-black group-hover:text-black group-focus-visible:text-black sm:max-w-none sm:text-sm";
  const editField = "border-[#374151] bg-[#ffffff] text-[#000000] shadow-none placeholder:text-[#4b5563] [color-scheme:light] focus-visible:border-[#7f1d1d] focus-visible:ring-2 focus-visible:ring-[#7f1d1d]";
  const iconOnGray = "text-[#000000] hover:text-[#000000] focus-visible:text-[#000000]";
  return (
    <main style={{ padding: 12, display: "grid", gap: 14 }}>
      <section id="c-vera" className="relative flex w-full max-w-5xl flex-col gap-6 rounded-2xl border border-black/10 bg-[#F7F4EC] p-4 text-black">
        {A("vera")}
        <button type="button" id="vera-btn" className={veraBase}><span aria-hidden="true" className="size-11 shrink-0 rounded-full border-2 border-black bg-slate-500" /><span id="vera-text" className={veraText}>Fale com a AXIA</span></button>
      </section>
      <section id="c-cm-search" className="rounded-md border border-border bg-card p-3 text-card-foreground">
        {A("cm-search")}
        <Input id="cm-input" defaultValue="busca" placeholder="Buscar" className={`h-7 text-xs ${CONSTRUMANAGER_SEARCH_INPUT_CLASS}`} />
        <Input id="cm-input-ph" placeholder="Buscar (placeholder)" className={`mt-2 h-7 text-xs ${CONSTRUMANAGER_SEARCH_INPUT_CLASS}`} />
      </section>
      <form id="c-cm-impact" className="mt-2 grid gap-2 rounded-md border border-amber-300 bg-white p-3 text-xs text-black">
        {A("cm-impact")}
        <p className="flex items-center gap-1.5 font-bold">Análise obrigatória de impacto<HelpHint helpId={MID.id} className="cm-i1" iconClassName="text-neutral-700 hover:text-black focus-visible:text-black" /></p>
        <label className="grid gap-1"><span className="inline-flex items-center gap-1.5">Impacto no prazo<HelpHint helpId={MID.id} className="cm-i2" iconClassName="text-neutral-700 hover:text-black focus-visible:text-black" /></span></label>
      </form>
      <section id="c-legal" className="rounded-md border border-border bg-card p-3 text-card-foreground">
        <span className="inline-flex flex-wrap items-center gap-2">
          <button id="legal-enabled" type="button" className="min-h-9 rounded-md bg-[#ff6b57] px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-60">Confirmar exclusão</button>
          <button id="legal-disabled" type="button" disabled className="min-h-9 rounded-md bg-[#ff6b57] px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-60">Excluindo…</button>
        </span>
      </section>
      <Card id="c-copy" className="border-black/10 bg-white/95 text-[#0f172a] shadow-xl">
        <div style={{ padding: 12 }}><p id="copy-err" role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-[#b42318]">Erro de exemplo ao copiar a estrutura.</p></div>
      </Card>
      <Card id="c-create" className="border-black/10 bg-white/95 text-[#0f172a] shadow-xl">
        <div style={{ padding: 12 }}>{A("create")}<Input id="create-ph" placeholder="Nome do projeto" className="placeholder:text-[#475569]" /></div>
      </Card>
      <Card id="c-edit" className="border-[#6b7280] bg-[#A8ADB5] text-[#000000] shadow-xl">
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {A("edit-field")}
          <Input id="edit-field" defaultValue="Projeto" className={editField} />
          <Input id="edit-ph" placeholder="Código" className={editField} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            {A("edit-cancel")}
            <a id="edit-cancel" href="#x" className={buttonVariants({ variant: "outline", className: "!border-[#000000] bg-transparent text-[#000000] hover:bg-black/10 hover:text-[#000000] focus-visible:ring-2 focus-visible:ring-[#000000]" })}>Cancelar</a>
            <div className="flex items-center gap-1.5">
              <Button id="edit-save" type="submit" className="bg-[#7f1d1d] text-[#ffffff] hover:bg-[#681717] hover:text-[#ffffff] focus-visible:ring-2 focus-visible:ring-[#000000]">Salvar alterações</Button>
              <HelpHint helpId={MID.id} className="edit-i" iconClassName={iconOnGray} />
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}

// Identificação do projeto na TopBar (F3): TopBar é componente de servidor (getProjects), então a fixture reproduz as classes do
// cabeçalho e usa o ProjectSwitcher REAL. Decisão: o código NÃO fica na TopBar (commit d6cf562); o nome vem do seletor.
const TOPBAR_PROJECTS = [
  { id: "fixture-proj", name: "Piloto WEG Jaraguá do Sul - Subestação e Montagem Eletromecânica · 0079", code: "0079", contractNumber: "CT-2026/0079" },
  { id: "outro", name: "Outra obra", code: "0001" },
] as never;
function TopBarScene() {
  return (
    <header id="tb" className="grid shrink-0 grid-cols-2 items-center gap-x-3 gap-y-2 border-b border-border bg-[var(--surface-topbar)] px-4 py-2 text-foreground sm:h-[72px] sm:grid-cols-[minmax(0,1fr)_auto_minmax(max-content,1fr)] sm:py-0">
      <div aria-hidden="true" className="hidden sm:block" />
      <div className="col-start-1 row-start-1 flex min-w-0 items-center justify-center gap-1 sm:col-start-2">
        <h1 className="min-w-0 truncate text-center text-base font-semibold tracking-tight text-foreground sm:text-xl">AXION Controle de Contratos</h1>
      </div>
      <div className="contents sm:col-start-3 sm:row-start-1 sm:flex sm:items-center sm:justify-end sm:gap-3">
        <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-2 gap-y-1 sm:col-span-1 sm:row-start-1 sm:flex-nowrap sm:min-w-0">
          <ProjectSwitcher projects={TOPBAR_PROJECTS} currentProjectId="fixture-proj" className="min-w-24 flex-1 sm:max-w-[7rem] sm:flex-initial lg:max-w-[10rem] xl:max-w-[16rem]" />
          <span id="tb-contract" className="shrink-0 text-xs text-muted-foreground">Contrato CT-2026/0079</span>
        </div>
        <div className="col-start-2 row-start-1 flex shrink-0 items-center gap-2 sm:gap-3"><span id="tb-avatar">AS</span></div>
      </div>
    </header>
  );
}

function App() {
  const scene = window.location.hash === "#corners" ? "corners" : window.location.hash === "#catalog" ? "catalog" : window.location.hash === "#sidebar" ? "sidebar" : window.location.hash === "#layout" ? "layout" : window.location.hash === "#contrast" ? "contrast" : window.location.hash === "#topbar" ? "topbar" : "main";
  useEffect(() => {
    if (scene === "corners") window.scrollTo(0, 300);
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
  }, [scene]);
  return scene === "corners" ? <Corners /> : scene === "catalog" ? <Catalog /> : scene === "sidebar" ? <Sidebar /> : scene === "layout" ? <Layout /> : scene === "contrast" ? <ContrastScene /> : scene === "topbar" ? <TopBarScene /> : <Main />;
}

window.__parent = { click: 0, keydown: 0, pointerdown: 0 };
window.__ids = { full: FULL.id, short: SHORT.id, mid: MID.id };
try { window.localStorage.setItem("acc.sidebar.collapsed", new URLSearchParams(window.location.search).get("collapsed") === "1" ? "true" : "false"); } catch { /* sem storage: sidebar expandida */ }
if (new URLSearchParams(window.location.search).get("dark") === "1") document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<App />);
