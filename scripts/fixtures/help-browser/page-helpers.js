// Auxiliares executados DENTRO do navegador (injetados por scripts/test-help-browser.mjs). Expõem window.__t.
(function () {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });

  function num(tok) { return tok.endsWith("%") ? parseFloat(tok) / 100 : parseFloat(tok); }
  // Converte qualquer cor CSS (rgb, color(srgb), oklab, oklch...) para {r,g,b,a}; fallback via canvas.
  function rgba(css) {
    const m = /^rgba?\(([^)]+)\)$/.exec(css);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean);
      return { r: parseFloat(p[0]), g: parseFloat(p[1]), b: parseFloat(p[2]), a: p.length > 3 ? num(p[3]) : 1 };
    }
    cx.globalCompositeOperation = "copy";
    cx.fillStyle = "rgba(0,0,0,0)";
    cx.fillStyle = css;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  function ratio(a, b) { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") + (c.a < 0.999 ? "/" + c.a.toFixed(2) : "");

  // Fundo EFETIVO: sobe a árvore compondo as camadas semitransparentes até achar uma opaca (ou o canvas do documento).
  function effBg(el) {
    const chain = [];
    let image = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      const c = rgba(cs.backgroundColor);
      if (cs.backgroundImage !== "none") image = true;
      chain.push(c);
      if (c.a >= 0.999) break;
    }
    const dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme);
    let base = dark ? { r: 18, g: 18, b: 18, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
    if (chain[chain.length - 1].a >= 0.999) base = chain[chain.length - 1];
    for (let i = chain.length - (chain[chain.length - 1].a >= 0.999 ? 2 : 1); i >= 0; i -= 1) base = over(chain[i], base);
    return { color: base, image };
  }
  function opacityOf(el) { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; }

  function measureText(el) {
    const cs = getComputedStyle(el);
    const fg = rgba(cs.color);
    fg.a *= opacityOf(el);
    const bg = effBg(el);
    const eff = over(fg, bg.color);
    return {
      ratio: ratio(eff, bg.color), fg: hex(eff), bg: hex(bg.color), image: bg.image,
      size: parseFloat(cs.fontSize), weight: cs.fontWeight, text: (el.textContent || "").trim().slice(0, 40),
    };
  }
  // Ícone/controle (traço do SVG) contra o fundo efetivo do pai.
  function measureIcon(btn) {
    const svg = btn.querySelector("svg") || btn;
    const stroke = rgba(getComputedStyle(svg).stroke === "none" ? getComputedStyle(btn).color : getComputedStyle(svg).stroke);
    const bg = effBg(btn);
    const eff = over(stroke, bg.color);
    return { ratio: ratio(eff, bg.color), fg: hex(eff), bg: hex(bg.color) };
  }
  // Anel de foco (box-shadow com espalhamento > 0 ou outline) contra o fundo efetivo ao redor do elemento.
  function measureRing(el) {
    const cs = getComputedStyle(el);
    const reColor = /(rgba?\([^)]*\)|color\([^)]*\)|oklab\([^)]*\)|oklch\([^)]*\)|lab\([^)]*\)|lch\([^)]*\))\s+((?:-?[\d.]+px\s*){3,4})/g;
    let best = null, m;
    while ((m = reColor.exec(cs.boxShadow))) {
      const lens = m[2].trim().split(/\s+/).map(parseFloat);
      const spread = lens.length > 3 ? lens[3] : 0;
      const c = rgba(m[1]);
      if (spread > 0 && c.a > 0) best = { c, spread };
    }
    let source = "box-shadow";
    if (!best && cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) {
      best = { c: rgba(cs.outlineColor), spread: parseFloat(cs.outlineWidth) };
      source = "outline";
    }
    if (!best) return null;
    const bg = effBg(el.parentElement || el);
    const eff = over(best.c, bg.color);
    return { ratio: ratio(eff, bg.color), fg: hex(eff), bg: hex(bg.color), spread: best.spread, source };
  }

  function panel() { return document.querySelector("[role=dialog][data-help-id]"); }
  function rectOf(el) { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }

  function measurePanel() {
    const p = panel();
    if (!p) return null;
    const groups = {};
    const add = (k, m) => { (groups[k] = groups[k] || []).push(m); };
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.textContent.trim()) continue;
      const el = n.parentElement;
      if (seen.has(el)) continue;
      seen.add(el);
      const m = measureText(el);
      let k = "corpo";
      if (el.closest("code")) k = "formula";
      else if (el.tagName === "H3") k = "secao";
      else if (el.id && el.closest("[role=dialog]") === p && (el.tagName === "P" || el.tagName === "H2") && el.className.includes("font-semibold")) k = "titulo";
      else if (/^Versão do texto/.test(el.textContent)) k = "versao";
      else if (el.closest("section") && /Vigência/.test(el.closest("section").querySelector("h3")?.textContent || "") && el.tagName === "P") k = "vigencia";
      add(k, m);
    }
    const close = p.querySelector("button[aria-label='Fechar ajuda']");
    if (close) add("icone-fechar", measureIcon(close));
    const out = {};
    for (const [k, arr] of Object.entries(groups)) {
      const worst = arr.reduce((a, b) => (b.ratio < a.ratio ? b : a));
      out[k] = { count: arr.length, min: worst.ratio, fg: worst.fg, bg: worst.bg, text: worst.text, image: arr.some((x) => x.image) };
    }
    return out;
  }

  window.__t = { rgba, effBg, measureText, measureIcon, measureRing, measurePanel, panel, rectOf, ratio, hex };
})();
