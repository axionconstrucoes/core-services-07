// Barra lateral (AppSidebar REAL): sem tooltip/title nos itens, ícone + texto SEMPRE visíveis, contraste, navegação e acessibilidade.
// Parte 1 (estática, sempre roda): regras no código-fonte. Parte 2 (Chrome real, fixture estática sem login/Supabase/rede):
// mouse, teclado e medidas no componente real. Sem Chrome a parte 2 é pulada (use --require-chrome para exigir).
// Conflito "sem tooltip" x Hover Text de ajuda: a ajuda continua SOMENTE no ícone dedicado (i) ao lado do item (FeatureInfo), que
// abre por clique/Enter/foco; o item em si (link/botão) nunca tem title, tooltip nem texto que só apareça no hover.
// Uso: node scripts/test-sidebar-sem-tooltip.mjs [--require-chrome]
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const FX = path.join(here, "fixtures", "help-browser");
const src = readFileSync(path.join(root, "apps/web/components/layout/app-sidebar.tsx"), "utf8");
const navSrc = readFileSync(path.join(root, "apps/web/lib/ui/nav-items.ts"), "utf8");
const navHrefs = [...navSrc.matchAll(/\{\s*href:\s*"([^"]+)",\s*label:\s*"([^"]+)"/g)].map((m) => ({ href: m[1], label: m[2] }));

let pass = 0; let fail = 0;
function record(name, ok, ev) { if (ok) pass += 1; else fail += 1; console.log(`${ok ? "OK  " : "FAIL"} ${name}${ev ? ` :: ${ev}` : ""}`); }
async function check(name, fn) {
  try { const r = await fn(); record(name, r === true || r?.ok === true, r?.ev); } catch (e) { record(name, false, `exceção: ${String(e?.message ?? e).slice(0, 300)}`); }
}
// Código sem comentários (os comentários explicam a regra e citam "title"/"tooltip").
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---------- Parte 1: estática ----------
console.log("== Parte 1: código-fonte");
await check("fonte: nenhum title=, tooltip, Radix/Popover/Tooltip nem group-hover/hover:block no componente", () =>
  !/\btitle=/.test(code) && !/tooltip/i.test(code) && !/@radix-ui|Popover|Tooltip/.test(code) && !/group-hover|hover:(block|flex|inline|visible|opacity-100)/.test(code));
await check("fonte: texto do item nunca é escondido por estado (sem 'hidden'/'sr-only' no rótulo; só ícone+texto)", () =>
  !/max-md:hidden|\bsr-only\b|collapsed \? null|!collapsed \? <span/.test(code) && /<span className="min-w-0 break-words \[overflow-wrap:anywhere\]">\{item\.label\}<\/span>/.test(code));
await check("fonte: aria-label do link é idêntico ao texto visível (item.label) e do botão contém o texto visível", () =>
  /aria-label=\{item\.label\}/.test(code) && /aria-label=\{collapsed \? "Expandir menu lateral" : "Recolher menu lateral"\}/.test(code) && /"Expandir menu"/.test(code) && /"Recolher menu"/.test(code));
await check("fonte: ajuda por ícone dedicado — FeatureInfo FORA do <Link>/<button>, para cada item (helpId) e para o recolher", () => {
  const link = code.slice(code.indexOf("<Link"), code.indexOf("</Link>"));
  const btn = code.slice(code.indexOf("<button"), code.indexOf("</button>"));
  return !link.includes("FeatureInfo") && !btn.includes("FeatureInfo") && code.includes("<FeatureInfo helpId={item.helpId}") && code.includes('helpId="shared.global.menu-recolher"');
});
await check("fonte: estado recolhido sincronizado com localStorage (chave acc.sidebar.collapsed, useSyncExternalStore, snapshot de servidor false)", () =>
  code.includes('"acc.sidebar.collapsed"') && code.includes("useSyncExternalStore") && /function getServerCollapsedSnapshot\(\)[^}]*return false/s.test(code) && code.includes("localStorage.setItem") && !/useEffect\(/.test(code));
await check("fonte: item ativo com aria-current=page, nav com aria-label, toggle com aria-expanded/aria-controls apontando para o nav", () =>
  code.includes('aria-current={active ? "page" : undefined}') && code.includes('id="acc-sidebar-nav"') && code.includes('aria-label="Navegação principal"') && code.includes("aria-expanded={!collapsed}") && code.includes('aria-controls="acc-sidebar-nav"'));
await check("fonte: itens vêm de NAV_ITEMS (nenhuma rota inventada/duplicada) e ícones são decorativos (aria-hidden)", () =>
  code.includes('from "@/lib/ui/nav-items"') && !/href=["'`]\/(?!\$\{)/.test(code) && /<Icon aria-hidden="true"/.test(code) && /Panel(Left)?(Close|Open)[^>]*aria-hidden="true"/.test(code));
await check("fonte: prefetch={false} e foco visível mantidos (focus-visible:!outline-white sobre o bordô)", () => code.includes("prefetch={false}") && code.includes("focus-visible:!outline-white"));
await check(`NAV_ITEMS: ${navHrefs.length} itens, sem href/label duplicado`, () =>
  navHrefs.length >= 20 && new Set(navHrefs.map((n) => n.href)).size === navHrefs.length && new Set(navHrefs.map((n) => n.label)).size === navHrefs.length);

// ---------- Parte 2: Chrome real ----------
console.log("== Parte 2: Chrome real (fixture estática, sem login/Supabase/rede)");
const { buildFixture } = await import("./lib/browser-harness-build.mjs");
const { chromeAvailable, CHROME, sleep, withBrowser } = await import("./lib/browser-harness.mjs");
if (!chromeAvailable()) {
  console.log(`SKIP: Chrome não encontrado em "${CHROME}". Parte 2 não executada.`);
  console.log(`\nResultado: ${pass} OK, ${fail} FAIL (parte 2 pulada)`);
  process.exit(fail || process.argv.includes("--require-chrome") ? (fail ? 1 : 2) : 0);
}
const work = mkdtempSync(path.join(tmpdir(), "acc-sidebar-test-"));
try {
  const built = await buildFixture({
    entry: path.join(FX, "entry.tsx"),
    html: readFileSync(path.join(FX, "index.template.html"), "utf8"),
    fixtureCss: readFileSync(path.join(FX, "fixture.css"), "utf8"),
    outDir: work,
    stubs: { "next/link": path.join(FX, "stubs", "next-link.tsx"), "next/navigation": path.join(FX, "stubs", "next-navigation.ts") },
  });
  const DESK = { width: 1280, height: 900 };
  const MOBILE = { width: 390, height: 844, mobile: true };
  // contraste WCAG; converte qualquer cor CSS (inclui oklch) para sRGB via canvas
  const HELPERS = `(()=>{const c=document.createElement('canvas');c.width=c.height=1;const x=c.getContext('2d',{willReadFrequently:true});
    window.__rgb=(col)=>{x.clearRect(0,0,1,1);x.fillStyle='#000';x.fillStyle=col;x.fillRect(0,0,1,1);const d=x.getImageData(0,0,1,1).data;return [d[0],d[1],d[2]];};
    const lin=(v)=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};
    window.__L=(r)=>0.2126*lin(r[0])+0.7152*lin(r[1])+0.0722*lin(r[2]);
    window.__cr=(a,b)=>{const l1=__L(a),l2=__L(b);return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05);};return true;})()`;

  await withBrowser(async (b) => {
    const open = async (opts = {}, query = "") => { await b.open(built.index, { hash: "#sidebar", query, ...opts }); await b.eval(HELPERS); await sleep(150); };
    const SNAP = `(()=>{const aside=document.querySelector('aside');const nav=document.querySelector('nav');const links=[...nav.querySelectorAll('a')];
      const ar=aside.getBoundingClientRect();
      return {asideW:ar.width,navLabel:nav.getAttribute('aria-label'),
        titles:[...aside.querySelectorAll('[title]')].map((e)=>e.getAttribute('title')),
        links:links.map((a)=>{const r=a.getBoundingClientRect();const sp=a.querySelector('span');const sr=sp?sp.getBoundingClientRect():null;
          return {href:a.getAttribute('href').replace(/^#/,''),text:(sp?sp.textContent:'').trim(),aria:a.getAttribute('aria-label'),cur:a.getAttribute('aria-current'),svg:!!a.querySelector('svg'),svgHidden:a.querySelector('svg')?.getAttribute('aria-hidden'),
            l:r.left,r:r.right,t:r.top,b:r.bottom,w:r.width,h:r.height,textVisible:!!sr&&sr.width>0&&sr.height>0&&getComputedStyle(sp).visibility!=='hidden'&&getComputedStyle(sp).display!=='none',
            textInside:!!sr&&sr.left>=r.left-0.5&&sr.right<=r.right+0.5,clipX:sp?sp.scrollWidth>sp.clientWidth+1:true,fs:parseFloat(getComputedStyle(a).fontSize)};})};})()`;

    const scenarios = [
      { name: "expandido desktop", opts: DESK, q: "" },
      { name: "recolhido desktop", opts: DESK, q: "collapsed=1" },
      { name: "celular (menu aberto)", opts: MOBILE, q: "" },
      { name: "celular (recolhido)", opts: MOBILE, q: "collapsed=1" },
    ];
    for (const sc of scenarios) {
      await open(sc.opts, sc.q);
      const s = await b.eval(SNAP);
      await check(`[${sc.name}] ${navHrefs.length} links = NAV_ITEMS, ordem e rótulo exatos, nenhum href fora de /fixture-proj/<item>`, () => {
        const ok = s.links.length === navHrefs.length && s.links.every((l, i) => l.href === `/fixture-proj/${navHrefs[i].href}` && l.text === navHrefs[i].label);
        return { ok, ev: `${s.links.length} links; largura ${s.asideW}px` };
      });
      await check(`[${sc.name}] todo item mostra ícone (aria-hidden) + texto visível dentro do item, sem corte; nome acessível = texto visível; nenhum title`, () => {
        const bad = s.links.filter((l) => !(l.svg && l.svgHidden === "true" && l.textVisible && l.textInside && !l.clipX && l.aria === l.text && l.text.length > 0));
        return { ok: bad.length === 0 && s.titles.length === 0 && s.navLabel === "Navegação principal", ev: bad.length ? `problemas: ${bad.slice(0, 3).map((l) => l.href).join(", ")}` : `ok em ${s.links.length}; fonte mín ${Math.min(...s.links.map((l) => l.fs))}px` };
      });
      const compact = sc.name !== "expandido desktop";
      await check(`[${sc.name}] largura do menu ${compact ? "compacta (128px)" : "expandida (264px)"} e página sem rolagem horizontal`, async () => {
        const sx = await b.eval("document.documentElement.scrollWidth<=innerWidth");
        return { ok: s.asideW === (compact ? 128 : 264) && sx, ev: `${s.asideW}px` };
      });
    }

    // Anti-tooltip: mouse sobre CADA item e sobre o botão Recolher; nada flutuante pode aparecer (nem title, nem role=tooltip, nem painel novo).
    for (const sc of [{ name: "expandido", q: "" }, { name: "recolhido", q: "collapsed=1" }]) {
      await check(`ANTI-TOOLTIP [${sc.name}]: hover real do mouse em todos os itens e no Recolher não cria tooltip/painel/title`, async () => {
        await open(DESK, sc.q);
        const base = await b.eval(`document.body.getElementsByTagName('*').length`);
        const n = await b.eval(`document.querySelectorAll('nav a').length`);
        const bad = [];
        for (let i = 0; i < n; i += 1) {
          const p = await b.eval(`(()=>{const e=document.querySelectorAll('nav a')[${i}];e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,t:e.textContent.trim()};})()`);
          await b.move(p.x, p.y); await sleep(120);
          const st = await b.eval(`(()=>{const f=[...document.querySelectorAll('[role="tooltip"],[role="dialog"],[data-radix-popper-content-wrapper],[popover],[data-tooltip],[data-state="open"]')];
            return {n:f.length,total:document.body.getElementsByTagName('*').length,titles:document.querySelectorAll('[title]').length,open:document.querySelectorAll('[aria-expanded="true"]:not(button[aria-controls="acc-sidebar-nav"])').length};})()`);
          if (st.n || st.titles || st.open || st.total !== base) bad.push(`${p.t}: ${JSON.stringify(st)}`);
        }
        const tp = await b.eval(`(()=>{const e=document.querySelector('aside button[aria-controls="acc-sidebar-nav"]');e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
        await b.move(tp.x, tp.y); await sleep(500);
        const st2 = await b.eval(`({n:document.querySelectorAll('[role="tooltip"],[role="dialog"],[data-radix-popper-content-wrapper],[popover]').length,t:document.querySelectorAll('[title]').length,total:document.body.getElementsByTagName('*').length})`);
        if (st2.n || st2.t || st2.total !== base) bad.push(`Recolher: ${JSON.stringify(st2)}`);
        return { ok: bad.length === 0, ev: bad.length ? bad.slice(0, 3).join(" | ") : `${n} itens + botão: 0 tooltips, 0 title, DOM idêntico (${base} elementos)` };
      });
    }

    // Ajuda preservada: o ícone (i) dedicado abre o painel por clique/teclado; não por hover sobre o item.
    await check("AJUDA: cada item tem o ícone (i) dedicado FORA do link (24 itens + Recolher) e ele abre a ajuda por teclado (Enter)", async () => {
      await open(DESK);
      const c = await b.eval(`({hints:document.querySelectorAll('aside button[aria-label^="Informações sobre"]').length,inLink:document.querySelectorAll('aside a button').length})`);
      await b.eval(`(()=>{const h=document.querySelector('aside button[aria-label^="Informações sobre"]');h.focus();return true;})()`);
      await b.key("Enter"); await sleep(400);
      const opened = await b.eval(`!!document.querySelector('[role="dialog"],[role="tooltip"],[data-help-panel],.help-panel')||document.querySelectorAll('[aria-expanded="true"]').length>0`);
      return { ok: c.hints === navHrefs.length + 1 && c.inLink === 0 && opened, ev: `${c.hints} ícones de ajuda; dentro de link: ${c.inLink}; painel abriu por Enter: ${opened}` };
    });

    // Contraste (CSS real): texto ocioso e ativo, ícone (i), contorno de foco.
    for (const dark of [false, true]) {
      await check(`CONTRASTE [${dark ? "tema escuro" : "tema claro"}]: texto do item ocioso/ativo >= 4,5:1; contorno de foco (fora do item, afastado 2px) >= 3:1 sobre o fundo`, async () => {
        await open(DESK, `${dark ? "dark=1&" : ""}ativo=juridico`);
        const r = await b.eval(`(()=>{const aside=document.querySelector('aside');const bg=__rgb(getComputedStyle(aside).backgroundColor);
          const idle=[...document.querySelectorAll('nav a')].find((a)=>!a.getAttribute('aria-current'));const act=document.querySelector('nav a[aria-current="page"]');
          const hint=document.querySelector('aside button[aria-label^="Informações sobre"] svg, aside button[aria-label^="Informações sobre"]');
          const idleFg=__rgb(getComputedStyle(idle).color);const actFg=__rgb(getComputedStyle(act).color);const actBg=__rgb(getComputedStyle(act).backgroundColor);
          idle.focus();const ol=getComputedStyle(idle);const focusFg=__rgb(ol.outlineColor);
          idle.blur();
          return {bg,idleFg,actFg,actBg,focusFg,idleCR:__cr(idleFg,bg),actCR:__cr(actFg,actBg),focusBgCR:__cr(focusFg,bg),focusActCR:__cr(focusFg,actBg),hintCR:__cr(__rgb(getComputedStyle(hint).color),bg)};})()`);
        const ok = r.idleCR >= 4.5 && r.actCR >= 4.5 && r.focusBgCR >= 3 && r.hintCR >= 3;
        return { ok, ev: `ocioso ${r.idleCR.toFixed(2)}:1; ativo ${r.actCR.toFixed(2)}:1; foco/fundo ${r.focusBgCR.toFixed(2)}:1; (i) ${r.hintCR.toFixed(2)}:1` };
      });
    }
    await check("CONTRASTE: item ativo identificável também sem cor (aria-current=page + peso da fonte) e só um ativo; ativo muda com a rota", async () => {
      await open(DESK, "ativo=juridico");
      const r = await b.eval(`(()=>{const a=[...document.querySelectorAll('nav a[aria-current="page"]')];return {n:a.length,href:a[0]?.getAttribute('href').replace(/^#/,''),fw:a[0]?+getComputedStyle(a[0]).fontWeight:0,idle:+getComputedStyle([...document.querySelectorAll('nav a:not([aria-current])')][0]).fontWeight};})()`);
      return { ok: r.n === 1 && r.href === "/fixture-proj/juridico" && r.fw > r.idle, ev: `${r.n} ativo; ${r.href}; peso ${r.fw} x ${r.idle}` };
    });

    // Teclado: Tab percorre os itens na ordem; foco visível (contorno >= 2px, não nulo); Enter no botão alterna e grava no localStorage.
    for (const sc of [{ name: "expandido", q: "" }, { name: "recolhido", q: "collapsed=1" }]) {
      await check(`TECLADO [${sc.name}]: Tab percorre todos os links na ordem de NAV_ITEMS, com contorno de foco visível (>=2px, sem recorte)`, async () => {
        await open(DESK, sc.q);
        await b.eval("document.activeElement&&document.activeElement.blur();window.scrollTo(0,0);true");
        const seen = []; const bad = [];
        for (let i = 0; i < navHrefs.length * 2 + 4 && seen.length < navHrefs.length; i += 1) {
          await b.key("Tab"); await sleep(25);
          const f = await b.eval(`(()=>{const e=document.activeElement;if(!e||e.tagName!=='A'||!e.closest('nav'))return null;const s=getComputedStyle(e);const r=e.getBoundingClientRect();const nr=document.querySelector('nav').getBoundingClientRect();
            return {href:e.getAttribute('href').replace(/^#/,''),ow:parseFloat(s.outlineWidth),os:s.outlineStyle,off:parseFloat(s.outlineOffset),inNav:r.top>=nr.top-1&&r.bottom<=nr.bottom+1,color:s.outlineColor};})()`);
          if (f) { seen.push(f.href); if (!(f.os !== "none" && f.ow >= 2)) bad.push(`${f.href}: ${f.os} ${f.ow}px`); if (!f.inNav) bad.push(`${f.href}: fora da área rolável`); }
        }
        const order = seen.every((h, i) => h === `/fixture-proj/${navHrefs[i].href}`);
        return { ok: seen.length === navHrefs.length && order && bad.length === 0, ev: bad.length ? bad.slice(0, 3).join(" | ") : `${seen.length} links focados em ordem; contorno branco 2px` };
      });
    }
    await check("TECLADO/ESTADO: botão Recolher por Enter e Espaço alterna aria-label/aria-expanded e grava acc.sidebar.collapsed no localStorage; Expandir restaura os rótulos", async () => {
      await open(DESK);
      const S = `(()=>{const b=document.querySelector('aside button[aria-controls="acc-sidebar-nav"]');return {label:b.getAttribute('aria-label'),exp:b.getAttribute('aria-expanded'),text:b.textContent.trim(),ls:localStorage.getItem('acc.sidebar.collapsed'),w:document.querySelector('aside').getBoundingClientRect().width,names:[...document.querySelectorAll('nav a')].every((a)=>a.getAttribute('aria-label')===a.querySelector('span').textContent.trim())};})()`;
      const a0 = await b.eval(S);
      await b.eval(`document.querySelector('aside button[aria-controls="acc-sidebar-nav"]').focus()`);
      await b.key("Enter"); await sleep(250);
      const a1 = await b.eval(S);
      await b.key("Space"); await sleep(250);
      const a2 = await b.eval(S);
      const ok = a0.label === "Recolher menu lateral" && a0.exp === "true" && a0.ls === "false" && a0.w === 264
        && a1.label === "Expandir menu lateral" && a1.exp === "false" && a1.ls === "true" && a1.w === 128 && a1.names
        && a2.label === "Recolher menu lateral" && a2.ls === "false" && a2.w === 264;
      return { ok, ev: `${a0.w}px/${a0.ls} -> ${a1.w}px/${a1.ls} (${a1.label}) -> ${a2.w}px/${a2.ls}` };
    });
    await check("ESTADO: valor 'true' previamente gravado no localStorage abre o menu recolhido (sincronizado com o armazenamento)", async () => {
      await open(DESK, "collapsed=1");
      const r = await b.eval(`({w:document.querySelector('aside').getBoundingClientRect().width,ls:localStorage.getItem('acc.sidebar.collapsed'),txt:document.querySelector('aside button[aria-controls="acc-sidebar-nav"]').getAttribute('aria-label')})`);
      return { ok: r.w === 128 && r.ls === "true" && r.txt === "Expandir menu lateral", ev: `${r.w}px, ls=${r.ls}, ${r.txt}` };
    });
    await check("MOBILE: alvo de toque dos itens >= 44px de altura e toda a coluna de 128px sem rolagem horizontal", async () => {
      await open(MOBILE);
      const r = await b.eval(`({minH:Math.min(...[...document.querySelectorAll('nav a')].map((a)=>a.getBoundingClientRect().height)),sx:document.querySelector('nav').scrollWidth<=document.querySelector('nav').clientWidth+1})`);
      return { ok: r.minH >= 44 && r.sx, ev: `altura mín ${r.minH.toFixed(1)}px` };
    });
  });
} finally {
  try { rmSync(work, { recursive: true, force: true }); } catch { /* tmp */ }
}
console.log(`\nResultado: ${pass} OK, ${fail} FAIL, total ${pass + fail}.`);
process.exit(fail ? 1 : 0);
