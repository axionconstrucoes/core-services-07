// Testes em NAVEGADOR REAL (Chrome headless via CDP) do HelpHint (Hover Text) e da acessibilidade.
// Uso: node scripts/test-help-browser.mjs [--update-baseline] [--require-chrome]
//   HELP_BROWSER_OUT=<dir>  pasta das capturas/relatório (padrão: ../axion-backups/homologacao/browser se existir, senão tmp)
//   CHROME_PATH=<exe>       Chrome (padrão: instalação do Windows)
//
// Como funciona: empacota o componente REAL (help-hint.tsx + help-content.tsx + catálogo) com um empacotador mínimo (scripts/lib/
// browser-harness-build.mjs: TypeScript + resolução de "@/") e compila o CSS REAL (apps/web/app/globals.css) com PostCSS +
// @tailwindcss/postcss — sem dev server do Next, sem login/Supabase/rede e sem tocar apps/web/proxy.ts. A página é estática (file://).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFixture } from "./lib/browser-harness-build.mjs";
import { chromeAvailable, CHROME, sleep, withBrowser } from "./lib/browser-harness.mjs";
import { diffPng, sha256 } from "./lib/browser-harness-png.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const FX = path.join(here, "fixtures", "help-browser");
const BASELINE = path.join(FX, "baseline");
const args = new Set(process.argv.slice(2));

if (!chromeAvailable()) {
  console.log(`SKIP: Chrome não encontrado em "${CHROME}" (defina CHROME_PATH). Nenhuma verificação de navegador foi executada.`);
  process.exit(args.has("--require-chrome") ? 2 : 0);
}

const sibling = path.resolve(root, "..", "axion-backups", "homologacao", "browser");
const OUT = process.env.HELP_BROWSER_OUT ?? (existsSync(path.dirname(sibling)) ? sibling : path.join(tmpdir(), "acc-help-browser-out"));
mkdirSync(OUT, { recursive: true });
mkdirSync(BASELINE, { recursive: true });

const results = [];
function record(name, ok, evidence) {
  results.push({ name, ok, evidence });
  console.log(`${ok ? "OK  " : "FAIL"} ${name}${evidence ? ` :: ${evidence}` : ""}`);
}
async function check(name, fn) {
  try {
    const r = await fn();
    record(name, r.ok, r.ev);
  } catch (e) {
    record(name, false, `exceção: ${String(e?.message ?? e).slice(0, 300)}`);
  }
}
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const f2 = (n) => (Math.round(n * 100) / 100).toString();

const work = mkdtempSync(path.join(tmpdir(), "acc-help-fixture-"));
const built = await buildFixture({
  entry: path.join(FX, "entry.tsx"),
  html: readFileSync(path.join(FX, "index.template.html"), "utf8"),
  fixtureCss: readFileSync(path.join(FX, "fixture.css"), "utf8"),
  outDir: work,
  stubs: { "next/link": path.join(FX, "stubs", "next-link.tsx"), "next/navigation": path.join(FX, "stubs", "next-navigation.ts") },
});
console.log(`fixture: ${built.modules} módulos, bundle ${Math.round(built.jsBytes / 1024)} KB, css ${Math.round(built.cssBytes / 1024)} KB; ausentes: ${built.missing.length ? built.missing.join(", ") : "nenhum"}`);

const D = { width: 1280, height: 800 };
const M = { width: 390, height: 844, mobile: true };
const HELP = path.join(FX, "page-helpers.js");
const PANEL = "document.querySelector('[role=dialog][data-help-id]')";

try {
  await withBrowser(async (b) => {
    const load = async (scene, { dark = false, mobile = false, extra = "" } = {}) => {
      await b.open(built.index, { hash: `#${scene}`, query: [dark ? "dark=1" : "", extra].filter(Boolean).join("&"), ...(mobile ? M : D) });
      await b.injectHelpers(HELP);
    };
    const rect = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return e?__t.rectOf(e):null})()`);
    const panelRect = () => b.eval(`(()=>{const p=${PANEL};return p?{...__t.rectOf(p),scrollTop:p.scrollTop,scrollHeight:p.scrollHeight,clientHeight:p.clientHeight}:null})()`);
    const active = () => b.eval("(()=>{const a=document.activeElement;return a?(a.getAttribute('role')||a.tagName)+'#'+(a.id||'')+'.'+(a.getAttribute('aria-label')||''):'none'})()");
    const panelCount = () => b.eval("document.querySelectorAll('[role=dialog][data-help-id]').length");
    const hover = async (sel) => { const r = await rect(sel); await b.move(r.cx, r.cy); return r; };

    // ---------- (1) Desktop: hover ----------
    await check("D1 hover abre o painel em ~120 ms", async () => {
      await load("main");
      await b.eval(`window.__t0=null;window.__tOpen=null;
        document.addEventListener('pointerover',e=>{ if(window.__t0===null) window.__t0=e.timeStamp; },true);
        new MutationObserver(()=>{ if(window.__tOpen===null && ${PANEL}) window.__tOpen=performance.now(); }).observe(document.body,{childList:true,subtree:true});`);
      const r = await rect(".hint-a button");
      await b.move(r.cx, r.cy);
      await sleep(40);
      const earlyOpen = await panelCount();
      await sleep(500);
      const delay = await b.eval("window.__tOpen===null||window.__t0===null?-1:window.__tOpen-window.__t0");
      const n = await panelCount();
      const pinned = await b.eval(`${PANEL}?.contains(document.activeElement)`);
      return { ok: earlyOpen === 0 && n === 1 && delay >= 100 && delay <= 400 && pinned === false, ev: `atraso ${f1(delay)} ms (esperado 100-400); aberto em 40 ms? ${earlyOpen === 1}; painéis ${n}; foco roubado? ${pinned}` };
    });
    await check("D2 permanece aberto com o ponteiro no painel e fecha ao sair", async () => {
      await load("main");
      await hover(".hint-a button");
      await sleep(400);
      const pr = await panelRect();
      await b.move(pr.cx, pr.cy);
      await sleep(900);
      const stay = await panelCount();
      await b.move(1100, 700);
      await sleep(120);
      const stillShortlyAfter = await panelCount();
      await sleep(700);
      const closed = await panelCount();
      return { ok: stay === 1 && closed === 0, ev: `no painel após 900 ms: ${stay} aberto; 120 ms após sair: ${stillShortlyAfter} (tolerância); 820 ms após sair: ${closed}` };
    });
    await check("D3 clique fixa; clique de novo fecha", async () => {
      await load("main");
      const r = await hover(".hint-a button");
      await sleep(400);
      await b.click(r.cx, r.cy);
      await sleep(150);
      const expanded = await b.eval("document.querySelector('.hint-a button').getAttribute('aria-expanded')");
      await b.move(1100, 700);
      await sleep(900);
      const pinnedOpen = await panelCount();
      const focused = await b.eval(`document.activeElement===${PANEL}`);
      await b.click(r.cx, r.cy);
      await sleep(300);
      const closed = await panelCount();
      return { ok: expanded === "true" && pinnedOpen === 1 && focused && closed === 0, ev: `aria-expanded=${expanded}; fixado após sair: ${pinnedOpen}; foco no painel: ${focused}; após 2º clique: ${closed}` };
    });

    // ---------- (2) Posicionamento ----------
    await check("P1 painel dentro da viewport (margem 8 px) nas 4 bordas e cantos; vira para cima; 70vh; sem rolar a página", async () => {
      await load("corners");
      const sy0 = await b.eval("window.scrollY");
      const rows = [];
      let ok = true;
      for (const p of ["tl", "tm", "tr", "ml", "mm", "mr", "bl", "bm", "br"]) {
        const sel = `.pos-${p} button`;
        const ir = await hover(sel);
        await sleep(450);
        const pr = await panelRect();
        if (!pr) { ok = false; rows.push(`${p}:SEM PAINEL`); await b.move(640, 200); await sleep(500); continue; }
        const tol = 0.6;
        const inside = pr.left >= 8 - tol && pr.right <= D.width - 8 + tol && pr.top >= 8 - tol && pr.bottom <= D.height - 8 + tol;
        const maxH = pr.height <= D.height * 0.7 + 1;
        const scrolls = pr.scrollHeight > pr.clientHeight;
        const flipUp = pr.bottom <= ir.top + 0.5;
        const wantUp = ir.cy > D.height * 0.6;
        const flipOk = wantUp ? flipUp : pr.top >= ir.bottom - 0.5;
        const sy = await b.eval("window.scrollY");
        const sx = await b.eval("document.documentElement.scrollWidth<=window.innerWidth");
        const row = inside && maxH && scrolls && flipOk && sy === sy0 && sx;
        if (!row) ok = false;
        rows.push(`${p}:${row ? "ok" : "FALHA"}[${Math.round(pr.left)},${Math.round(pr.top)}-${Math.round(pr.right)},${Math.round(pr.bottom)} h=${Math.round(pr.height)} ${flipUp ? "cima" : "baixo"}${inside ? "" : " FORA"}${maxH ? "" : " >70vh"}${scrolls ? "" : " sem-rolagem"}${sy === sy0 ? "" : " PÁGINA-ROLOU"}${sx ? "" : " OVERFLOW-X"}]`);
        if (p === "bl") await b.screenshot(path.join(OUT, "p1-canto-inferior-esquerdo.png"));
        await b.move(640, 200);
        await sleep(500);
      }
      return { ok, ev: rows.join(" ") };
    });
    await check("P2 conteúdo longo rola internamente (roda do mouse) sem rolar a página", async () => {
      await load("main");
      await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'})");
      const sy0 = await b.eval("window.scrollY");
      const r = await rect(".hint-c button");
      await b.click(r.cx, r.cy);
      await sleep(300);
      const pr0 = await panelRect();
      await b.wheel(pr0.cx, pr0.cy, 240);
      await sleep(250);
      const pr1 = await panelRect();
      const sy1 = await b.eval("window.scrollY");
      // overscroll-contain: rolar além do fim do painel não deve arrastar a página
      await b.wheel(pr0.cx, pr0.cy, 5000);
      await sleep(250);
      await b.wheel(pr0.cx, pr0.cy, 400);
      await sleep(250);
      const sy2 = await b.eval("window.scrollY");
      await b.screenshot(path.join(OUT, "p2-conteudo-longo.png"));
      return { ok: pr1.scrollTop > pr0.scrollTop && sy1 === sy0 && sy2 === sy0 && pr0.height <= D.height * 0.7 + 1 && pr0.scrollHeight > pr0.clientHeight,
        ev: `painel h=${Math.round(pr0.height)} scrollHeight=${pr0.scrollHeight} clientHeight=${pr0.clientHeight}; scrollTop ${pr0.scrollTop}->${pr1.scrollTop}; scrollY ${sy0}->${sy1}->${sy2} (após rolar além do fim)` };
    });
    await check("P3 painel acompanha o ícone quando a página rola (doc: recalculado em scroll/resize)", async () => {
      await load("main");
      const r = await rect(".hint-a button");
      await b.click(r.cx, r.cy);
      await sleep(300);
      const before = await panelRect();
      const gap0 = before.top - r.bottom;
      await b.eval("window.scrollTo(0,60)");
      await sleep(400);
      const r2 = await rect(".hint-a button");
      const after = await panelRect();
      const gap1 = after ? after.top - r2.bottom : NaN;
      await b.screenshot(path.join(OUT, "p3-apos-rolagem-da-pagina.png"));
      return { ok: !!after && Math.abs(gap1 - gap0) <= 2, ev: `distância ícone->painel ${f1(gap0)} px -> ${f1(gap1)} px após rolar 60 px (ícone ${f1(r.cy)} -> ${f1(r2.cy)}; painel top ${f1(before.top)} -> ${after ? f1(after.top) : "fechou"})` };
    });
    await check("P4 painel permanece dentro da viewport ao redimensionar a janela", async () => {
      await load("corners");
      const r = await rect(".pos-tr button");
      await b.click(r.cx, r.cy);
      await sleep(300);
      const w0 = (await panelRect()).right;
      await b.resize(700, 800);
      await sleep(400);
      const pr = await panelRect();
      await b.screenshot(path.join(OUT, "p4-apos-redimensionar.png"));
      return { ok: !!pr && pr.left >= 7.4 && pr.right <= 700 - 7.4, ev: pr ? `viewport 1280->700: painel [${Math.round(pr.left)}..${Math.round(pr.right)}] (direita antes: ${Math.round(w0)}; limite ${700 - 8})` : "painel fechou" };
    });

    // ---------- (3) Teclado ----------
    await check("K1 Tab chega ao ícone com anel de foco visível (>= 3:1)", async () => {
      await load("main");
      await b.key("Tab");
      await b.key("Tab");
      const a = await active();
      const info = await b.eval(`(()=>{const e=document.activeElement;return {fv:e.matches(':focus-visible'),ring:__t.measureRing(e)}})()`);
      await b.screenshot(path.join(OUT, "k1-foco-no-icone.png"));
      return { ok: a.includes("Informações sobre") && info.fv && !!info.ring && info.ring.ratio >= 3, ev: `foco em "${a}"; :focus-visible=${info.fv}; anel ${info.ring ? `${f2(info.ring.ratio)}:1 (${info.ring.fg} sobre ${info.ring.bg}, ${info.ring.spread}px)` : "AUSENTE"}` };
    });
    await check("K2 Enter abre; foco vai ao painel; ESC fecha e devolve o foco ao ícone; sem vazar para o pai", async () => {
      await load("main");
      await b.key("Tab"); await b.key("Tab");
      await b.key("Enter");
      await sleep(250);
      const exp = await b.eval("document.activeElement?.getAttribute('aria-expanded')");
      const ctl = await b.eval(`(()=>{const t=document.querySelector('.hint-a button');return t.getAttribute('aria-controls')===${PANEL}?.id && ${PANEL}?.getAttribute('aria-labelledby') && document.getElementById(${PANEL}?.getAttribute('aria-labelledby'))?.textContent.length>0})()`);
      const onPanel = await b.eval(`document.activeElement===${PANEL}`);
      await b.key("Escape");
      await sleep(250);
      const n = await panelCount();
      const a = await active();
      const parent = await b.eval("window.__parent");
      return { ok: onPanel && n === 0 && a.includes("Informações sobre") && ctl && parent.keydown === 0 && parent.click === 0, ev: `aria-expanded(antes)=${exp} aria-controls/labelledby ok=${ctl}; foco no painel=${onPanel}; após ESC painéis=${n}, foco="${a}"; pai: click=${parent.click} keydown=${parent.keydown}` };
    });
    await check("K3 Espaço abre; setas rolam o painel (não a página)", async () => {
      await load("main");
      await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'});document.querySelector('.hint-c button').focus()");
      const sy0 = await b.eval("window.scrollY");
      await b.key("Space");
      await sleep(300);
      const open = await panelCount();
      const onPanel = await b.eval(`document.activeElement===${PANEL}`);
      const p0 = await panelRect();
      for (let i = 0; i < 6; i += 1) await b.key("ArrowDown");
      await sleep(250);
      const p1 = await panelRect();
      const sy1 = await b.eval("window.scrollY");
      return { ok: open === 1 && onPanel && p1.scrollTop > p0.scrollTop && sy1 === sy0, ev: `abriu=${open}; foco no painel=${onPanel}; scrollTop ${p0.scrollTop}->${p1.scrollTop}; scrollY ${sy0}->${sy1}` };
    });
    await check("K4 Tab (e Shift+Tab) a partir do painel fecha", async () => {
      const outcomes = [];
      for (const shift of [false, true]) {
        await load("main");
        await b.key("Tab"); await b.key("Tab");
        await b.key("Enter");
        await sleep(250);
        await b.key("Tab", { shift });
        await sleep(300);
        outcomes.push(`${shift ? "Shift+" : ""}Tab -> painéis=${await panelCount()}, foco="${await active()}"`);
      }
      return { ok: outcomes.every((o) => o.includes("painéis=0")), ev: outcomes.join("; ") };
    });
    await check("K5 observação: botão \"Fechar ajuda\" por teclado (desktop)", async () => {
      await load("main");
      await b.key("Tab"); await b.key("Tab");
      await b.key("Enter");
      await sleep(250);
      // Tab a partir do painel fecha (K4), então a única via por teclado ao botão X seria Shift+Tab/Tab dentro do painel.
      await b.key("Tab");
      await sleep(250);
      const reachable = (await panelCount()) === 1 && (await active()).includes("Fechar ajuda");
      // Observação (não reprova): o contrato do componente é "Tab para fora fecha"; ESC é a via por teclado para fechar.
      return { ok: true, ev: reachable ? "OBSERVAÇÃO: foco chegou ao botão Fechar" : "OBSERVAÇÃO: o botão Fechar não é alcançável por Tab no desktop (Tab a partir do painel o fecha); ESC fecha e devolve o foco. Severidade baixa." };
    });

    // ---------- (5)(6) Um por vez; sem vazamento ----------
    await check("O1 um painel por vez (hover A -> hover B; clique A -> clique B)", async () => {
      await load("main");
      await hover(".hint-a button"); await sleep(400);
      const idA = await b.eval(`${PANEL}?.id`);
      await hover(".hint-b button"); await sleep(500);
      const afterHover = await b.eval("[...document.querySelectorAll('[role=dialog][data-help-id]')].map(p=>p.getAttribute('data-help-id'))");
      await b.move(1100, 700); await sleep(700);
      const ra = await rect(".hint-a button"); await b.click(ra.cx, ra.cy); await sleep(250);
      const rb = await rect(".hint-b button"); await b.click(rb.cx, rb.cy); await sleep(250);
      const afterClick = await b.eval("[...document.querySelectorAll('[role=dialog][data-help-id]')].map(p=>p.getAttribute('data-help-id'))");
      return { ok: afterHover.length === 1 && afterClick.length === 1 && !!idA, ev: `após hover A->B: ${afterHover.length} painel; após clique A->B: ${afterClick.length} painel` };
    });
    await check("L1 clique/tecla/ponteiro não vazam para o elemento pai (inclui eventos dentro do painel)", async () => {
      await load("main");
      const r = await rect(".hint-a button");
      await b.click(r.cx, r.cy); await sleep(300);
      const afterClick = await b.eval("({...window.__parent})");
      const pr = await panelRect();
      await b.click(pr.cx, pr.cy); await sleep(150);
      await b.key("ArrowDown"); await b.key("Space");
      const afterPanel = await b.eval("({...window.__parent})");
      await b.key("Escape"); await sleep(200);
      await b.eval("document.querySelector('.hint-a button').focus()");
      await b.key("Enter"); await sleep(250);
      await b.key("Escape");
      const end = await b.eval("({...window.__parent})");
      return { ok: end.click === 0 && end.keydown === 0 && end.pointerdown === 0, ev: `contadores do pai após clique no ícone ${JSON.stringify(afterClick)}; após clique/teclas no painel ${JSON.stringify(afterPanel)}; final ${JSON.stringify(end)}` };
    });

    // ---------- (4) Mobile ----------
    let mobileCloseVisible = null;
    await check("M1 toque abre folha inferior (sem hover); rolagem por toque; botão Fechar; toque fora fecha", async () => {
      await load("main", { mobile: true });
      const r = await rect(".hint-c button");
      await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'})");
      const r1 = await rect(".hint-c button");
      await b.touchStart(r1.cx, r1.cy);
      await sleep(500);
      const duringTouch = await panelCount();
      await b.touchEnd();
      await sleep(350);
      const pr = await panelRect();
      const sheet = !!pr && Math.abs(pr.left - 8) < 1 && Math.abs(pr.right - (M.width - 8)) < 1 && Math.abs(pr.bottom - (M.height - 8)) < 1 && pr.height <= M.height * 0.8 + 1;
      const overlay = await b.eval("!!document.querySelector('.fixed.inset-0[aria-hidden=true]')");
      await b.screenshot(path.join(OUT, "m1-folha-inferior.png"));
      await b.swipeUp(pr.cx, pr.cy, 200);
      await sleep(400);
      const pr2 = await panelRect();
      const sy = await b.eval("window.scrollY");
      mobileCloseVisible = await b.eval(`(()=>{const p=${PANEL};const c=p.querySelector("button[aria-label='Fechar ajuda']");const a=p.getBoundingClientRect(),r=c.getBoundingClientRect();return {visible:r.top>=a.top&&r.bottom<=a.bottom,top:Math.round(r.top),panelTop:Math.round(a.top)}})()`);
      await b.screenshot(path.join(OUT, "m3-folha-rolada-sem-botao-fechar.png"));
      await b.eval(`${PANEL}.scrollTop=0`);
      await sleep(150);
      const closeBtn = await rect("[role=dialog] button[aria-label='Fechar ajuda']");
      await b.tap(closeBtn.cx, closeBtn.cy);
      await sleep(300);
      const closedByBtn = await panelCount();
      const focusBack = (await active()).includes("Informações sobre");
      await b.tap(r1.cx, r1.cy); await sleep(350);
      const reopened = await panelCount();
      await b.tap(40, 40); await sleep(350);
      const closedOutside = await panelCount();
      return { ok: duringTouch === 0 && sheet && overlay && pr2.scrollTop > pr.scrollTop && closedByBtn === 0 && focusBack && reopened === 1 && closedOutside === 0,
        ev: `abriu só com touchStart (hover)? ${duringTouch === 1}; folha [${Math.round(pr.left)},${Math.round(pr.top)}-${Math.round(pr.right)},${Math.round(pr.bottom)}] h=${Math.round(pr.height)} (<=80vh=${Math.round(M.height * 0.8)}); overlay=${overlay}; scrollTop ${pr.scrollTop}->${pr2.scrollTop}; scrollY=${sy}; fechar: ${closedByBtn}, foco volta ao ícone=${focusBack}; reabre=${reopened}; toque fora -> ${closedOutside}` };
    });
    await check("M3 mobile: botão \"Fechar ajuda\" continua visível depois de rolar o conteúdo da folha", async () => {
      const v = mobileCloseVisible;
      return { ok: !!v?.visible, ev: v ? `após rolar a folha por toque, o botão Fechar ${v.visible ? "permanece visível" : `saiu da área visível (topo do botão ${v.top}px < topo da folha ${v.panelTop}px): o cabeçalho não é fixo (sticky); só toque fora/rolar de volta fecham`}` : "medição indisponível" };
    });
    await check("M2 mobile: sem overflow horizontal e painel dentro da tela", async () => {
      await load("main", { mobile: true });
      await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'})");
      const r = await rect(".hint-c button");
      await b.tap(r.cx, r.cy); await sleep(350);
      const sx = await b.eval("[document.documentElement.scrollWidth,window.innerWidth]");
      const pr = await panelRect();
      return { ok: sx[0] <= sx[1] && pr.left >= 0 && pr.right <= M.width && pr.top >= 0, ev: `scrollWidth ${sx[0]} / innerWidth ${sx[1]}; painel [${Math.round(pr.left)}..${Math.round(pr.right)}] top ${Math.round(pr.top)}` };
    });

    // ---------- (7) axe-core ----------
    for (const dark of [false, true]) {
      for (const mobile of [false, true]) {
        for (const open of [false, true]) {
          await check(`A11Y axe ${dark ? "tema .dark" : "tema :root"} / ${mobile ? "mobile" : "desktop"} / painel ${open ? "aberto" : "fechado"}`, async () => {
            await load("main", { dark, mobile });
            if (open) {
              await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'})");
              const r = await rect(".hint-c button");
              if (mobile) await b.tap(r.cx, r.cy); else await b.click(r.cx, r.cy);
              await sleep(400);
              if ((await panelCount()) !== 1) return { ok: false, ev: "painel não abriu" };
            }
            const ax = await b.runAxe();
            const serious = ax.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
            const minor = ax.violations.filter((v) => !(v.impact === "serious" || v.impact === "critical"));
            const contrastIncomplete = ax.incomplete.filter((i) => i.id === "color-contrast").reduce((s, i) => s + i.count, 0);
            const detail = serious.map((v) => `${v.id}[${v.impact}] ${v.nodes.map((n) => n.target).join(" | ")}`).join("; ");
            return { ok: serious.length === 0, ev: `axe ${ax.version}: sérias/críticas=${serious.length}${detail ? ` (${detail})` : ""}; moderadas/leves=${minor.map((v) => v.id).join(",") || "0"}; regras aprovadas=${ax.passes}; color-contrast "incompleto"=${contrastIncomplete}` };
          });
        }
      }
    }
    await check("A11Y roles/aria: ícone (aria-label, haspopup, expanded, controls) e painel (dialog, labelledby)", async () => {
      await load("main");
      const closed = await b.eval("(()=>{const t=document.querySelector('.hint-c button');return {label:t.getAttribute('aria-label'),pop:t.getAttribute('aria-haspopup'),exp:t.getAttribute('aria-expanded'),ctl:t.getAttribute('aria-controls'),title:t.hasAttribute('title')}})()");
      const r = await rect(".hint-c button");
      await b.click(r.cx, r.cy); await sleep(300);
      const open = await b.eval(`(()=>{const t=document.querySelector('.hint-c button');const p=${PANEL};return {exp:t.getAttribute('aria-expanded'),ctl:t.getAttribute('aria-controls'),id:p.id,role:p.getAttribute('role'),modal:p.getAttribute('aria-modal'),lb:document.getElementById(p.getAttribute('aria-labelledby'))?.textContent,titleAttr:!!document.querySelector('[title]')}})()`);
      const ok = !!closed.label && closed.pop === "dialog" && closed.exp === "false" && !closed.ctl && !closed.title && open.exp === "true" && open.ctl === open.id && open.role === "dialog" && !!open.lb && !open.titleAttr;
      return { ok, ev: `fechado ${JSON.stringify(closed)}; aberto ${JSON.stringify({ ...open, lb: (open.lb || "").slice(0, 30) })}` };
    });

    // ---------- (8)(9) Contraste real medido ----------
    for (const dark of [false, true]) {
      const tema = dark ? "tema .dark" : "tema :root";
      await check(`C1 contraste do ícone (normal, hover, foco, aberto) >= 3:1 [${tema}]`, async () => {
        const rows = [];
        let ok = true;
        const rec = (state, m) => { const pass = m.ratio >= 3; if (!pass) ok = false; rows.push(`${state} ${f2(m.ratio)}:1 (${m.fg} sobre ${m.bg})${pass ? "" : " FALHA"}`); };
        await load("main", { dark });
        rec("normal", await b.eval("__t.measureIcon(document.querySelector('.hint-a button'))"));
        const r = await rect(".hint-a button");
        await b.move(r.cx, r.cy); await sleep(60);
        await b.eval("window.__p=true");
        await sleep(350);
        rec("hover", await b.eval("__t.measureIcon(document.querySelector('.hint-a button'))"));
        await b.move(1100, 700); await sleep(800);
        await b.key("Tab"); await b.key("Tab"); await sleep(300);
        rec("foco", await b.eval("__t.measureIcon(document.activeElement)"));
        const ring = await b.eval("__t.measureRing(document.activeElement)");
        if (!ring || ring.ratio < 3) ok = false;
        rows.push(`anel de foco ${ring ? `${f2(ring.ratio)}:1 (${ring.fg} sobre ${ring.bg})` : "AUSENTE"}`);
        await b.key("Enter"); await sleep(300);
        rec("aberto (teclado)", await b.eval("__t.measureIcon(document.querySelector('.hint-a button'))"));
        return { ok, ev: rows.join("; ") };
      });
      for (const mobile of [false, true]) {
        await check(`C2 contraste do painel (título, corpo, seções, fórmula, vigência, versão, ícone fechar) [${tema}, ${mobile ? "mobile" : "desktop"}]`, async () => {
          await load("main", { dark, mobile });
          await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'})");
          const r = await rect(".hint-c button");
          if (mobile) await b.tap(r.cx, r.cy); else await b.click(r.cx, r.cy);
          await sleep(400);
          const m = await b.eval("__t.measurePanel()");
          if (!m) return { ok: false, ev: "painel não abriu" };
          const need = ["titulo", "corpo", "secao", "formula", "vigencia", "versao", "icone-fechar"];
          const absent = need.filter((k) => !m[k]);
          let ok = absent.length === 0;
          const rows = [];
          for (const k of need) {
            if (!m[k]) continue;
            const min = k === "icone-fechar" ? 3 : 4.5;
            const pass = m[k].min >= min && !m[k].image;
            if (!pass) ok = false;
            rows.push(`${k}(${m[k].count}) min ${f2(m[k].min)}:1 [${m[k].fg}/${m[k].bg}]${pass ? "" : " FALHA"}`);
          }
          return { ok, ev: `${rows.join("; ")}${absent.length ? `; GRUPOS AUSENTES NA ENTRADA: ${absent.join(",")}` : ""}` };
        });
      }
    }

    // ---------- (10) Regressão visual ----------
    const shots = [];
    for (const [name, { dark, mobile, open }] of Object.entries({
      "desktop-fechado": { dark: false, mobile: false, open: false },
      "desktop-aberto": { dark: false, mobile: false, open: true },
      "mobile-fechado": { dark: false, mobile: true, open: false },
      "mobile-aberto": { dark: false, mobile: true, open: true },
      "dark-desktop-aberto": { dark: true, mobile: false, open: true },
      "dark-mobile-aberto": { dark: true, mobile: true, open: true },
    })) {
      await check(`V1 regressão visual "${name}" (baseline por diferença de pixels)`, async () => {
        await load("main", { dark, mobile });
        await b.eval("document.querySelector('.hint-c button').scrollIntoView({block:'center'})");
        if (open) {
          const r = await rect(".hint-c button");
          if (mobile) await b.tap(r.cx, r.cy); else await b.click(r.cx, r.cy);
          await sleep(500);
          // fixa o estado para captura determinística (sem anel de foco do painel nem caret)
          await b.eval(`(()=>{const p=${PANEL};if(p)p.blur();document.activeElement&&document.activeElement.blur&&document.activeElement.blur();})()`);
          await b.move(5, 5);
          await sleep(300);
        }
        await sleep(200);
        const png = await b.screenshotPng();
        const file = `help-${name}.png`;
        writeFileSync(path.join(OUT, file), png);
        shots.push({ file, sha: sha256(png) });
        const basePath = path.join(BASELINE, file);
        if (args.has("--update-baseline") || !existsSync(basePath)) {
          writeFileSync(basePath, png);
          return { ok: true, ev: `BASELINE ${args.has("--update-baseline") ? "ATUALIZADA" : "CRIADA (primeira execução)"}: ${file} sha256=${sha256(png).slice(0, 12)}` };
        }
        const base = readFileSync(basePath);
        const same = sha256(base) === sha256(png);
        const d = diffPng(base, png, 16);
        if (!d.comparable) return { ok: false, ev: `tamanhos diferentes (${d.a} vs ${d.b})` };
        const ok = d.ratio <= 0.01;
        return { ok, ev: `hash ${same ? "IGUAL" : "diferente"}; pixels diferentes ${d.diffPixels}/${d.total} (${f2(d.ratio * 100)}%, tolerância 1%)` };
      });
    }

    // ---------- (9) varredura do CATÁLOGO COMPLETO (opcional: --sweep) ----------
    if (args.has("--sweep")) {
      const allIds = await (async () => { await load("catalog"); return b.eval("[...document.querySelectorAll('[data-sw]')].map(e=>e.getAttribute('data-sw'))"); })();
      for (const mobile of [false, true]) {
        await check(`S1 catálogo completo (${allIds.length} entradas) [${mobile ? "mobile" : "desktop"}]: abre, cabe na tela, rola, sem estouro horizontal, título, contraste, ESC e foco`, async () => {
          await load("catalog", { mobile });
          const bad = [];
          let withScroll = 0, minRatio = 99, minId = "";
          for (let i = 0; i < allIds.length; i += 60) {
            const chunk = allIds.slice(i, i + 60);
            const res = await b.eval(`(async (ids)=>{const out=[];const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
              for(const id of ids){const wrap=document.querySelector('[data-sw="'+id.replace(/"/g,'\\"')+'"]');const btn=wrap&&wrap.querySelector('button');const rec={id};
                if(!btn){rec.err='sem ícone';out.push(rec);continue}
                btn.scrollIntoView({block:'center'});const y0=scrollY;btn.click();await raf();await new Promise(r=>setTimeout(r,15));
                const p=__t.panel();if(!p||p.getAttribute('data-help-id')!==id){rec.err='painel não abriu';out.push(rec);continue}
                const r=p.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
                rec.inside=r.left>=7.4&&r.right<=vw-7.4&&r.top>=7.4&&r.bottom<=vh-7.4;
                rec.hover=p.scrollWidth>p.clientWidth+1;rec.scrolls=p.scrollHeight>p.clientHeight+1;
                p.scrollTop=p.scrollHeight;rec.reachesEnd=p.scrollTop+p.clientHeight>=p.scrollHeight-2;p.scrollTop=0;
                rec.title=!!(p.querySelector('h2')&&p.querySelector('h2').textContent.trim().length>0);
                rec.pageMoved=Math.abs(scrollY-y0)>1;
                const m=__t.measurePanel()||{};let worst=99,wk='';for(const [k,v] of Object.entries(m)){const need=k==='icone-fechar'?3:4.5;const rr=v.min-need;if(rr<worst-0.0001&&true){worst=rr;wk=k}}
                rec.contrastWorst=worst;rec.contrastKey=wk;rec.minRatio=Math.min(...Object.values(m).map(v=>v.min),99);
                document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await raf();
                rec.closed=!__t.panel();rec.focusBack=document.activeElement===btn;
                out.push(rec)}
              return out})(${JSON.stringify(chunk)})`);
            for (const r of res) {
              if (r.scrolls) withScroll++;
              if (r.minRatio < minRatio) { minRatio = r.minRatio; minId = r.id; }
              const why = r.err ? [r.err] : [!r.inside && "fora da tela", r.hover && "estouro horizontal", !r.title && "sem título", r.pageMoved && "página rolou", r.contrastWorst < -0.0001 && `contraste ${r.contrastKey}`, !r.closed && "ESC não fechou", !r.focusBack && "foco não voltou", r.scrolls && !r.reachesEnd && "fim inalcançável"].filter(Boolean);
              if (why.length) bad.push(`${r.id}: ${why.join(", ")}`);
            }
          }
          return { ok: bad.length === 0, ev: `${allIds.length} painéis abertos; ${withScroll} com rolagem interna; menor razão de contraste medida ${f2(minRatio)}:1 (${minId})${bad.length ? `; ${bad.length} FALHAS: ${bad.slice(0, 6).join(" | ")}` : ""}` };
        });
      }
    }

    // ---------- (8) Alvos de toque e sobreposição (B3) ----------
    // Retângulo EFETIVO de acerto do ícone = união do botão com o pseudo-elemento ::after transparente (tamanho calculado pelo navegador).
    const HIT_JS = `(sel)=>{const b=document.querySelector(sel);const r=b.getBoundingClientRect();const a=getComputedStyle(b,'::after');
      const w=Math.max(r.width,parseFloat(a.width)||0),h=Math.max(r.height,parseFloat(a.height)||0);const cx=r.left+r.width/2,cy=r.top+r.height/2;
      return {btn:{l:r.left,t:r.top,r:r.right,b:r.bottom},hit:{l:cx-w/2,t:cy-h/2,r:cx+w/2,b:cy+h/2,w,h},cx,cy};}`;
    const hitOf = (sel) => b.eval(`(${HIT_JS})(${JSON.stringify(sel)})`);
    const inter = (A, B) => Math.max(0, Math.min(A.r, B.r) - Math.max(A.l, B.l)) * Math.max(0, Math.min(A.b, B.b) - Math.max(A.t, B.t));
    const topAt = (x, y) => b.eval(`(()=>{const e=document.elementFromPoint(${x},${y});return e?(e.closest('button,a')?.getAttribute('aria-label')||e.tagName):'none'})()`);

    await check("T1 alvo do ícone HelpHint: celular >= 44x44 (área invisível), desktop com mouse 24x24 (visual inalterado em ambos)", async () => {
      await load("main", { mobile: true });
      const m = await hitOf(".hint-b button");
      const visualM = m.btn.r - m.btn.l;
      // o acerto real: os 4 cantos da área 44x44 (a 2 px de cada borda) devem cair no botão
      const corners = [[m.hit.l + 2, m.hit.t + 2], [m.hit.r - 2, m.hit.t + 2], [m.hit.l + 2, m.hit.b - 2], [m.hit.r - 2, m.hit.b - 2]];
      const tops = [];
      for (const [x, y] of corners) tops.push(await topAt(x, y));
      const cornersOk = tops.every((t) => String(t).startsWith("Informações sobre"));
      await load("main");
      const d = await hitOf(".hint-b button");
      return { ok: m.hit.w >= 44 - 0.5 && m.hit.h >= 44 - 0.5 && cornersOk && Math.abs(visualM - 24) < 0.5 && d.hit.w >= 24 - 0.5 && d.hit.h >= 24 - 0.5 && Math.abs(d.btn.r - d.btn.l - 24) < 0.5,
        ev: `celular: área ${f1(m.hit.w)}x${f1(m.hit.h)} px (ícone visual ${f1(visualM)}); 4 cantos acertam o ícone: ${cornersOk}; desktop: ${f1(d.hit.w)}x${f1(d.hit.h)} (visual ${f1(d.btn.r - d.btn.l)})` };
    });

    // Sidebar REAL: nenhum alvo de ícone sobrepõe o link do mesmo item (nem o botão visual, nem a área expandida).
    const SIDE_ROWS = `(()=>{const rows=[...document.querySelectorAll('nav > div')].concat([document.querySelector('aside > div:last-child > div')]);
      window.__rows=rows;return rows.length;})()`;
    const SIDE_ROW = (i) => `(()=>{const row=window.__rows[${i}];row.scrollIntoView({block:'nearest',behavior:'instant'});const H=${HIT_JS};
      const a=row.querySelector('a, button[aria-label$="menu lateral"]');const hb=row.querySelector('button[aria-label^="Informações sobre"]');if(!a||!hb)return null;
      const ar=a.getBoundingClientRect();hb.classList.add('__hb');const h=H('.__hb');hb.classList.remove('__hb');
      return {label:a.getAttribute('aria-label'),link:{l:ar.left,t:ar.top,r:ar.right,b:ar.bottom,w:ar.width,h:ar.height},btn:h.btn,hit:h.hit,cx:h.cx,cy:h.cy};})()`;
    const SIDE_META = `(()=>{const nav=document.querySelector('nav');return {navScroll:[nav.scrollHeight,nav.clientHeight],asideW:document.querySelector('aside').getBoundingClientRect().width,vw:innerWidth,sx:document.documentElement.scrollWidth};})()`;
    const sideCases = [
      { name: "menu expandido, desktop", scene: "sidebar", opts: {}, minLinkH: 36, minHitH: 24, coarse: false },
      { name: "menu recolhido, desktop (mouse)", scene: "sidebar", opts: { extra: "collapsed=1" }, minLinkH: 36, minHitH: 24, coarse: false },
      { name: "menu recolhido, celular", scene: "sidebar", opts: { extra: "collapsed=1", mobile: true }, minLinkH: 44, minHitH: 44, coarse: true },
      { name: "menu expandido, celular (modo estreito)", scene: "sidebar", opts: { mobile: true }, minLinkH: 44, minHitH: 44, coarse: true },
    ];
    for (const sc of sideCases) {
      await check(`T2 sidebar ${sc.name}: sem sobreposição ícone(i) x link; alvos medidos`, async () => {
        await load(sc.scene, sc.opts);
        const nRows = await b.eval(SIDE_ROWS);
        const r = await b.eval(SIDE_META);
        r.rows = [];
        for (let i = 0; i < nRows; i += 1) {
          const row = await b.eval(SIDE_ROW(i));
          if (!row) continue;
          // pontos de acerto medidos com a linha rolada para a vista (elementFromPoint só enxerga o que está visível)
          row.t1 = await topAt(row.cx, row.cy);
          row.t2 = await topAt((row.link.l + row.link.r) / 2, (row.link.t + row.link.b) / 2);
          r.rows.push(row);
        }
        if (!r.rows.length) return { ok: false, ev: "nenhum item medido" };
        let worst = 0; let minLinkW = 1e9; let minLinkH = 1e9; let minHitH = 1e9; let minHitW = 1e9; const bad = [];
        for (const row of r.rows) {
          const L = { l: row.link.l, t: row.link.t, r: row.link.r, b: row.link.b };
          const ovBtn = inter(row.btn, L); const ovHit = inter(row.hit, L);
          worst = Math.max(worst, ovBtn, ovHit);
          minLinkW = Math.min(minLinkW, row.link.w); minLinkH = Math.min(minLinkH, row.link.h); minHitH = Math.min(minHitH, row.hit.h); minHitW = Math.min(minHitW, row.hit.w);
          if (ovBtn > 0.5 || ovHit > 0.5) bad.push(`${row.label}: sobreposição ${f1(Math.max(ovBtn, ovHit))} px²`);
          // o ponto central do ícone cai no ícone e o central do link cai no link
          const { t1, t2 } = row;
          if (!String(t1).startsWith("Informações sobre")) bad.push(`${row.label}: centro do (i) acerta "${t1}"`);
          if (t2 !== row.label) bad.push(`${row.label}: centro do link acerta "${t2}"`);
        }
        const heightOk = minLinkH >= sc.minLinkH - 0.5 && minHitH >= sc.minHitH - 0.5 && minHitW >= 24 - 0.5;
        if (sc.coarse && minLinkW < 44 - 0.5) bad.push(`link com largura ${f1(minLinkW)} < 44`);
        await b.screenshot(path.join(OUT, `t2-sidebar-${sc.name.replace(/[^a-z0-9]+/gi, "-")}.png`));
        return { ok: bad.length === 0 && heightOk && r.sx <= r.vw, ev: `${r.rows.length} itens; sidebar ${f1(r.asideW)} px; link min ${f1(minLinkW)}x${f1(minLinkH)}; área do (i) min ${f1(minHitW)}x${f1(minHitH)}; maior sobreposição ${f1(worst)} px²; nav ${r.navScroll[0] > r.navScroll[1] ? "rola" : "cabe"} (${r.navScroll[0]}/${r.navScroll[1]}); overflow-x página ${r.sx > r.vw}${bad.length ? `; FALHAS: ${bad.slice(0, 4).join(" | ")}` : ""}` };
      });
    }

    // Popovers em cabeçalhos de tabela, cartões de Ações e formulário extenso: desktop + celular, mouse/toque/teclado.
    for (const mobile of [false, true]) {
      await check(`T3 popovers em <th>, cartões e formulário extenso [${mobile ? "celular" : "desktop"}]: dentro da tela, sem rolar a página, teclado abre/ESC devolve foco`, async () => {
        await load("layout", { mobile });
        const vp = mobile ? M : D;
        const bad = []; let n = 0;
        const sy0 = await b.eval("window.scrollY");
        for (const cls of ["th-0", "th-2", "th-4", "card-0", "card-2", "form-0", "form-12", "form-23"]) {
          await b.eval(`document.querySelector('.${cls} button').scrollIntoView({block:'center'})`);
          const syBefore = await b.eval("window.scrollY");
          const ir = await rect(`.${cls} button`);
          if (mobile) await b.tap(ir.cx, ir.cy); else { await b.move(ir.cx, ir.cy); await sleep(400); }
          await sleep(350);
          const pr = await panelRect();
          n += 1;
          if (!pr) { bad.push(`${cls}: sem painel`); continue; }
          const inside = pr.left >= 8 - 0.6 && pr.right <= vp.width - 8 + 0.6 && pr.top >= 8 - 0.6 && pr.bottom <= vp.height - 8 + 0.6;
          const syAfter = await b.eval("window.scrollY");
          if (!inside) bad.push(`${cls}: fora da tela [${Math.round(pr.left)},${Math.round(pr.top)}-${Math.round(pr.right)},${Math.round(pr.bottom)}]`);
          if (syAfter !== syBefore) bad.push(`${cls}: página rolou`);
          await b.key("Escape"); await sleep(200);
          if (mobile && (await panelCount()) !== 0) { await b.tap(20, 20); await sleep(300); }
          if (!mobile) { await b.move(5, vp.height - 5); await sleep(450); }
        }
        // teclado: Tab até o ícone do cabeçalho, Enter abre, ESC fecha e devolve o foco
        await load("layout", { mobile });
        await b.eval("document.querySelector('.th-1 button').focus()");
        await b.key("Enter"); await sleep(300);
        const opened = await panelCount();
        await b.key("Escape"); await sleep(250);
        const closed = await panelCount();
        const focusBack = (await active()).includes("Informações sobre");
        const sx = await b.eval("document.documentElement.scrollWidth<=window.innerWidth");
        if (opened !== 1 || closed !== 0 || !focusBack) bad.push(`teclado: abriu=${opened} fechou=${closed === 0} foco=${focusBack}`);
        if (!sx) bad.push("overflow horizontal da página");
        await b.screenshot(path.join(OUT, `t3-layout-${mobile ? "celular" : "desktop"}.png`));
        return { ok: bad.length === 0 && sy0 === 0, ev: `${n} popovers medidos (th, cartões, formulário)${bad.length ? `; FALHAS: ${bad.join(" | ")}` : "; todos dentro da tela, sem rolar a página"}; teclado Enter/ESC ok: ${opened === 1 && closed === 0 && focusBack}` };
      });
    }
    await check("T4 alvos dos ícones nos cabeçalhos de tabela e cartões [celular] >= 44x44", async () => {
      await load("layout", { mobile: true });
      const rows = [];
      for (const cls of ["th-0", "th-4", "card-0", "form-0"]) { const h = await hitOf(`.${cls} button`); rows.push(`${cls} ${f1(h.hit.w)}x${f1(h.hit.h)}`); if (h.hit.w < 43.5 || h.hit.h < 43.5) return { ok: false, ev: rows.join("; ") }; }
      return { ok: true, ev: rows.join("; ") };
    });

    // ---------- (9) Os 16 apontamentos do auditor de contraste, medidos no Chrome com o CSS real (B3) ----------
    // Uso das classes REAIS dos módulos em fixture isolada; sem login/Supabase. Cada linha reporta a razão medida e o limite aplicável.
    const tab = async (anchorSel, expectSel, max = 6) => {
      await b.eval(`document.querySelector(${JSON.stringify(anchorSel)}).focus()`);
      for (let i = 0; i < max; i += 1) {
        await b.key("Tab"); await sleep(60);
        if (await b.eval(`document.activeElement===document.querySelector(${JSON.stringify(expectSel)})`)) { await sleep(350); return true; }
      }
      return false;
    };
    const mText = (sel) => b.eval(`(()=>{const m=__t.measureText(document.querySelector(${JSON.stringify(sel)}));return {ratio:m.ratio,fg:m.fg,bg:m.bg}})()`);
    const mRing = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const r=__t.measureRing(e);const cs=getComputedStyle(e);
      // fundo "de dentro" do controle (preenchimento do próprio elemento) para anéis que ficam entre o controle e o entorno
      const inner=__t.effBg(e).color;const ringC=r?null:null;return r?{ratio:r.ratio,fg:r.fg,bg:r.bg,source:r.source,spread:r.spread,inner:__t.hex(inner)}:null})()`);
    // contorno global de foco (globals.css: outline 2px #4d8dff) — complementa o anel do Tailwind em controles que o definem
    const mOutline = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const cs=getComputedStyle(e);if(cs.outlineStyle==='none'||!(parseFloat(cs.outlineWidth)>0))return null;
      const c=__t.rgba(cs.outlineColor);const bg=__t.effBg(e.parentElement).color;return {ratio:__t.ratio(c,bg),fg:__t.hex(c),bg:__t.hex(bg),w:cs.outlineWidth}})()`);
    const mRingInner = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const r=__t.measureRing(e);if(!r)return null;
      const cs=getComputedStyle(e);let c=null;const m=/(rgba?\\([^)]*\\))/.exec(cs.boxShadow);const col=m?__t.rgba(m[1]):__t.rgba(cs.outlineColor);const inner=__t.effBg(e).color;return {ratio:__t.ratio(col,inner),inner:__t.hex(inner)}})()`);
    const mBorder = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const cs=getComputedStyle(e);const c=__t.rgba(cs.borderTopColor);const bg=__t.effBg(e.parentElement).color;return {ratio:__t.ratio(c,bg),fg:__t.hex(c),bg:__t.hex(bg)}})()`);
    const mPlaceholder = (sel) => b.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});const c=__t.rgba(getComputedStyle(e,'::placeholder').color);const bg=__t.effBg(e).color;return {ratio:__t.ratio(c,bg),fg:__t.hex(c),bg:__t.hex(bg)}})()`);
    const mIcon = (sel) => b.eval(`(()=>{const m=__t.measureIcon(document.querySelector(${JSON.stringify(sel)}));return m})()`);
    const E = (m) => `${f2(m.ratio)}:1 (${m.fg} sobre ${m.bg})`;
    const contrastRows = [];
    const addRow = (id, finding, minimum, ratio, ev) => contrastRows.push({ id, finding, minimum, ratio, ok: ratio >= minimum, ev });

    await check("CA1-CA16 os 16 apontamentos do auditor medidos no Chrome (CSS real, fixture isolada)", async () => {
      await load("contrast");
      // 1-4 vera-trigger (tone onLight) sobre #F7F4EC
      await b.eval("document.querySelector('#vera-btn').scrollIntoView({block:'center'})");
      const veraText0 = await mText("#vera-text");
      const vr = await rect("#vera-btn"); await b.move(vr.cx, vr.cy); await sleep(150);
      const veraTextHover = await mText("#vera-text"); await b.move(5, 5);
      const okF = await tab("#anchor-vera", "#vera-btn");
      const veraTextFocus = await mText("#vera-text");
      const veraRing = await mRing("#vera-btn");
      const veraOut = await mOutline("#vera-btn");
      addRow(1, "vera-trigger.tsx:38 contorno de foco (focus-visible:!outline-black)", 3, veraOut ? veraOut.ratio : 0, veraOut ? E(veraOut) : "sem contorno");
      addRow(2, "vera-trigger.tsx:48 texto base", 4.5, veraText0.ratio, E(veraText0));
      addRow(3, "vera-trigger.tsx:48 texto hover", 4.5, veraTextHover.ratio, E(veraTextHover));
      addRow(4, "vera-trigger.tsx:48 texto foco", 4.5, veraTextFocus.ratio, E(veraTextFocus) + (okF ? "" : " [foco por Tab não confirmado]"));
      // 5-6 construmanager-panel-styles
      await b.eval("document.querySelector('#cm-input').scrollIntoView({block:'center'})");
      const cmText = await mText("#cm-input");
      await tab("#anchor-cm-search", "#cm-input");
      const cmRing = await mRing("#cm-input"); const cmRingInner = await mRingInner("#cm-input");
      addRow(5, "construmanager-panel-styles.ts:27 texto do campo (text-black)", 4.5, cmText.ratio, E(cmText));
      const cmOut = await mOutline("#cm-input");
      addRow(6, `construmanager-panel-styles.ts:31 indicador de foco: anel #C2185B (${cmRing ? E(cmRing) : "sem anel"}; sobre o preenchimento branco ${cmRingInner ? f2(cmRingInner.ratio) + ":1" : "n/d"}) + contorno global (${cmOut ? E(cmOut) : "ausente"}) — vale o melhor`, 3, Math.max(cmRing ? cmRing.ratio : 0, cmOut ? cmOut.ratio : 0), `contorno global ${cmOut ? E(cmOut) : "ausente"}`);
      // 7-8 version-impact (ícone hover/foco sobre formulário claro) — página recarregada para não carregar estado das etapas anteriores
      await load("contrast");
      await b.eval("document.querySelector('.cm-i2 button').scrollIntoView({block:'center'})");
      const iconBase = await mIcon(".cm-i2 button");
      const ic = await rect(".cm-i2 button"); await b.move(ic.cx, ic.cy); await sleep(150);
      const iconHover = await mIcon(".cm-i2 button");
      await load("contrast");
      await b.eval("document.querySelector('.cm-i2 button').scrollIntoView({block:'center'})");
      const iconFocused = await tab("#anchor-cm-impact", ".cm-i2 button", 4);
      const iconFocus = await mIcon(".cm-i2 button");
      addRow(7, "construmanager-version-impact-form.tsx:28 ícone hover (hover:text-black)", 3, iconHover.ratio, E(iconHover) + `; base ${f2(iconBase.ratio)}:1`);
      addRow(8, "construmanager-version-impact-form.tsx:28 ícone foco (focus-visible:text-black)", 3, iconFocus.ratio, E(iconFocus) + (iconFocused ? "" : " [foco não confirmado]"));
      await load("contrast");
      // 9 legal desabilitado (+ ativo)
      await b.eval("document.querySelector('#legal-enabled').scrollIntoView({block:'center'})");
      const legOn = await mText("#legal-enabled"); const legOff = await mText("#legal-disabled");
      addRow(9, `delete-legal-consultation-button.tsx:75 texto desabilitado (ativo: ${f2(legOn.ratio)}:1)`, 3, legOff.ratio, E(legOff));
      // 10 copy-structure-wizard erro
      const copyErr = await mText("#copy-err");
      addRow(10, "copy-structure-wizard.tsx:205 texto de erro #b42318", 4.5, copyErr.ratio, E(copyErr));
      // 11 create-project placeholder
      const crPh = await mPlaceholder("#create-ph");
      addRow(11, "create-project-form.tsx:17 placeholder #475569", 4.5, crPh.ratio, E(crPh));
      // 12 edit-project campo: anel #7f1d1d
      await b.eval("document.querySelector('#edit-field').scrollIntoView({block:'center'})");
      await tab("#anchor-edit-field", "#edit-field");
      const edRing = await mRing("#edit-field"); const edPh = await mPlaceholder("#edit-ph");
      addRow(12, `edit-project-form.tsx:23 anel de foco do campo #7f1d1d (placeholder ${f2(edPh.ratio)}:1)`, 3, edRing ? edRing.ratio : 0, edRing ? E(edRing) : "sem anel");
      // 13-15 cancelar (borda base, anel e borda no foco)
      const canB = await mBorder("#edit-cancel");
      await tab("#anchor-edit-cancel", "#edit-cancel");
      const canRing = await mRing("#edit-cancel"); const canBorderF = await mBorder("#edit-cancel");
      addRow(13, "edit-project-form.tsx:82 borda de controle base (!border-black)", 3, canB.ratio, E(canB));
      addRow(14, "edit-project-form.tsx:82 anel de foco do Cancelar", 3, canRing ? canRing.ratio : 0, canRing ? E(canRing) : "sem anel");
      addRow(15, "edit-project-form.tsx:82 borda de controle no foco", 3, canBorderF.ratio, E(canBorderF));
      // 16 salvar: anel de foco
      await b.eval("document.querySelector('#edit-cancel').focus()"); await b.key("Tab"); await sleep(120);
      const saveFocused = await b.eval("document.activeElement===document.querySelector('#edit-save')");
      const saveRing = await mRing("#edit-save");
      addRow(16, "edit-project-form.tsx:86 anel de foco do Salvar" + (saveFocused ? "" : " [foco não confirmado]"), 3, saveRing ? saveRing.ratio : 0, saveRing ? E(saveRing) : "sem anel");
      await b.screenshot(path.join(OUT, "ca-contraste-16-apontamentos.png"));
      const fails = contrastRows.filter((r) => !r.ok);
      for (const r of contrastRows) console.log(`     [CA${String(r.id).padStart(2, "0")}] ${r.ok ? "OK  " : "REAL"} ${r.finding} :: ${r.ev} (mínimo ${r.minimum}:1)`);
      return { ok: fails.length === 0, ev: `${contrastRows.length} apontamentos medidos; reais (abaixo do mínimo): ${fails.map((r) => "CA" + r.id).join(", ") || "nenhum"}` };
    });

    // erros de console da última página
    await check("Z1 sem exceções/erros de console na fixture", async () => ({ ok: b.consoleErrors.length === 0, ev: b.consoleErrors.length ? b.consoleErrors.slice(0, 3).join(" | ") : "nenhum" }));
  }, { timeoutMs: args.has("--sweep") ? 900000 : 280000 });
} finally {
  rmSync(work, { recursive: true, force: true });
}

const fail = results.filter((r) => !r.ok);
writeFileSync(path.join(OUT, "resultados-help-browser.json"), JSON.stringify({ ranAt: new Date().toISOString(), ok: results.length - fail.length, fail: fail.length, results }, null, 2));
console.log(`\nResultado: ${results.length - fail.length} OK, ${fail.length} FAIL, total ${results.length}. Capturas e relatório: ${OUT}`);
if (fail.length) console.log(`Falhas:\n${fail.map((f) => ` - ${f.name}`).join("\n")}`);
process.exit(fail.length ? 1 : 0);
