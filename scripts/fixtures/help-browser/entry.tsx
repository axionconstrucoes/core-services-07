// Entrada da FIXTURE estática do HelpHint (testes de navegador). Monta o componente REAL (apps/web/components/shared/help-hint.tsx)
// com o catálogo REAL, sem login, Supabase ou rede. Cenas por hash: #main (fluxo com pai clicável) e #corners (ícones nas bordas).
import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { HelpHint } from "@/components/shared/help-hint";
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

function App() {
  const scene = window.location.hash === "#corners" ? "corners" : window.location.hash === "#catalog" ? "catalog" : "main";
  useEffect(() => {
    if (scene === "corners") window.scrollTo(0, 300);
    requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
  }, [scene]);
  return scene === "corners" ? <Corners /> : scene === "catalog" ? <Catalog /> : <Main />;
}

window.__parent = { click: 0, keydown: 0, pointerdown: 0 };
window.__ids = { full: FULL.id, short: SHORT.id, mid: MID.id };
if (new URLSearchParams(window.location.search).get("dark") === "1") document.documentElement.classList.add("dark");
createRoot(document.getElementById("root")!).render(<App />);
