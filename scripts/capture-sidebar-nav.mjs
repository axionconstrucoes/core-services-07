// Capturas da barra lateral de navegação (AppSidebar REAL) para documentação visual — SEM login, SEM Supabase, SEM rede e SEM dados reais.
// Reaproveita a fixture estática dos testes de navegador (scripts/fixtures/help-browser, cena #sidebar): o componente real é empacotado
// com o CSS real do app (apps/web/app/globals.css) e aberto via file:// no Chrome headless. Nada entra no build do Next nem vira rota.
// Uso: node scripts/capture-sidebar-nav.mjs <prefixo>   (ex.: antes | depois)  -> docs/manual/capturas/sidebar-<prefixo>-*.png
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./lib/browser-harness-build.mjs";
import { chromeAvailable, CHROME, sleep, withBrowser } from "./lib/browser-harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, "fixtures", "help-browser");
const OUT = path.join(here, "..", "docs", "manual", "capturas");
const prefix = process.argv[2];
if (!prefix || !/^[a-z0-9-]+$/.test(prefix)) { console.error("uso: node scripts/capture-sidebar-nav.mjs <prefixo>"); process.exit(2); }
if (!chromeAvailable()) { console.error(`Chrome não encontrado em "${CHROME}" (defina CHROME_PATH).`); process.exit(2); }
mkdirSync(OUT, { recursive: true });

const work = mkdtempSync(path.join(tmpdir(), "acc-sidebar-capture-"));
const built = await buildFixture({
  entry: path.join(FX, "entry.tsx"),
  html: readFileSync(path.join(FX, "index.template.html"), "utf8"),
  fixtureCss: readFileSync(path.join(FX, "fixture.css"), "utf8"),
  outDir: work,
  stubs: { "next/link": path.join(FX, "stubs", "next-link.tsx"), "next/navigation": path.join(FX, "stubs", "next-navigation.ts") },
});

const DESK = { width: 1280, height: 1100 };
const MOBILE = { width: 390, height: 844, mobile: true };
const shots = [];
try {
  await withBrowser(async (b) => {
    const open = (opts, query = "") => b.open(built.index, { hash: "#sidebar", query, ...opts });
    const save = async (name) => { const file = path.join(OUT, `sidebar-${prefix}-${name}.png`); await b.screenshot(file); shots.push(file); };
    const centerOf = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);

    await open(DESK); await save("desktop-expandido");
    await open(DESK, "dark=1"); await save("desktop-expandido-escuro");
    await open(DESK, "collapsed=1"); await save("desktop-recolhido");
    await open(MOBILE); await save("celular-menu-aberto");
    await open(DESK, "ativo=juridico"); await save("item-ativo-juridico");

    // Foco por teclado: Tab a partir do início da página até o 3º item de navegação.
    await open(DESK);
    for (let i = 0; i < 3; i += 1) { await b.key("Tab"); await sleep(60); }
    await save("foco-teclado");
    await open(DESK, "collapsed=1");
    for (let i = 0; i < 3; i += 1) { await b.key("Tab"); await sleep(60); }
    await save("foco-teclado-recolhido");

    // Mouse sobre um item (link "Timeline") e, quando existir, sobre o ícone (i) de ajuda ao lado do item (texto flutuante).
    await open(DESK);
    let p = await centerOf('nav a[href$="/timeline"]');
    await b.move(p.x, p.y); await sleep(600); await save("hover-item");
    await open(DESK, "collapsed=1");
    p = await centerOf('nav a[href$="/timeline"]');
    await b.move(p.x, p.y); await sleep(600); await save("hover-item-recolhido");
    await open(DESK);
    p = await centerOf('nav button[aria-label^="Informações sobre"]');
    if (p) { await b.move(p.x, p.y); await sleep(700); await save("hover-icone-ajuda"); }
  });
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* tmp */ }
}
for (const s of shots) console.log(path.relative(path.join(here, ".."), s));
