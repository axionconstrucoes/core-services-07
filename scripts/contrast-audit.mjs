#!/usr/bin/env node
// Auditor estático de contraste do ACC (heurístico, SOMENTE LEITURA).
// REGRA UNIVERSAL: FUNDO CLARO -> FONTE ESCURA; FUNDO ESCURO -> FONTE CLARA; texto normal >= 4,5:1 (meta 7:1),
// texto grande e controles/gráficos >= 3:1; estados NORMAL, HOVER, FOCUS, ACTIVE, SELECTED, DISABLED (+ placeholder).
//
// COMO FUNCIONA
//  1. Varre os .tsx/.ts de apps/web/{app,components,lib} e extrai LITERAIS de string (aspas e template) que parecem listas de
//     classes Tailwind (todos os tokens com formato de utilitário e ao menos um utilitário de cor reconhecido).
//  2. Resolve cada utilitário de cor (bg-/text-/border-/ring-/outline-/placeholder-/from-via-to-) usando o CSS REAL do projeto:
//     - tokens `:root` de globals.css (inclusive a paleta Tailwind REMAPEADA: --color-red-50 etc., color-mix, oklch, var());
//     - `@theme inline` (bg-card -> var(--card)); paleta padrão de node_modules/tailwindcss/theme.css para o que não foi remapeado;
//     - regras NÃO-CAMADA de globals.css (.bg-red-600, .hover\:bg-red-600:hover, .text-slate-300, .bg-blue-800\/50 ...), que
//       VENCEM os utilitários do Tailwind (camada `utilities`) — inclusive anulando um `hover:bg-*` comum quando o fundo-base
//       veio de uma regra não-camada;
//     - valores arbitrários (bg-[#FFD600] text-[#000000]), opacidade (/40, /[.35]) e variáveis (bg-card, text-muted-foreground).
//  3. Agrupa por ESTADO: base, hover (hover:/group-hover:), focus (focus:/focus-visible:/focus-within:), active, disabled
//     (disabled:/aria-disabled), selected (aria-selected/aria-checked/aria-pressed/aria-current/data-[state=active|on|checked|selected]),
//     placeholder (placeholder:). Cada estado herda o que não sobrescreve do estado base. `opacity-N` (inclui disabled:opacity-N)
//     é aplicado ao par (texto E fundo desbotam sobre o fundo pai).
//  4. FUNDO-BASE (documentado): quando o literal NÃO declara fundo opaco, o fundo pai é desconhecido; o auditor usa o PIOR CASO entre
//     as superfícies reais do tema (background #0b1629, card/popover #182941, muted #0f1d33, secondary #13233b, accent #1b3050;
//     em arquivos de barra lateral, o vermelho institucional). Fundos translúcidos são compostos sobre cada superfície e vale a pior.
//     Texto sem cor própria herda `--foreground` (branco) — marcado como "herdado" no relatório.
//  5. Razão WCAG + regra claro/escuro (lib/ui/contrast.ts). Severidade: CRITICA (< 3:1), ALTA (< mínimo do tipo: 4,5 texto normal,
//     3 grande/gráfico), MEDIA (razão ok mas viola fundo claro->fonte escura / escuro->clara), META (>= mínimo mas < 7:1 em texto normal:
//     informativo, NÃO reprova). Reprovam: CRITICA, ALTA, MEDIA. Em DISABLED o texto exige >= 3:1 (política do ACC: desabilitado legível).
//
// LIMITES DECLARADOS (heurística — NÃO é cobertura de 100%):
//  - análise por LITERAL de string: não conhece a árvore JSX, então o fundo do pai e o texto herdado são presumidos (pior caso);
//    classes montadas por template/concatenação dinâmica (`bg-${cor}-100`) e estilos inline (`style={{color}}`) não são vistos;
//  - literais de classe separados em `cn("a", cond && "b")` são avaliados cada um sozinho (não combina ramos mutuamente exclusivos);
//  - variantes arbitrárias ([&>x]:, has-[..]:, group-data-[..]:, before:/after:/file:/selection:) e `dark:` são ignoradas (tema único escuro);
//    responsivas (sm:/md:/...) só preenchem propriedades ausentes;
//  - bordas só entram como "controle" quando há `border-input`, `ring-*`/`outline-*` de foco, ou borda arbitrária junto de foco; bordas
//    decorativas (divisórias) não são avaliadas; ícones/SVG e gradientes `bg-gradient-*` só pelos from-/via-/to-;
//  - opacidade /N é composta em sRGB (o Tailwind 4 mistura em oklab: diferença desprezível); sombras, blur e imagens não entram;
//  - FALSOS POSITIVOS conhecidos: (a) texto sem fundo declarado em literal cujo pai real é mais escuro/claro que o pior caso;
//    (b) literal de ramo condicional que só existe combinado com outro (ex.: "text-white" alternando com "bg-white" em outro literal);
//    (c) classes declaradas mas sobrescritas por `className` externo em runtime (twMerge); (d) strings de prosa parecidas com classes.
//    FALSOS NEGATIVOS: tudo o que está na lista acima. Exceções aceitas ficam em CONTRAST_AUDIT_EXCEPTIONS (motivo obrigatório).
//
// Uso: node scripts/contrast-audit.mjs [--json] [--scope=all|shared] [--summary] [--files=a,b] [--out=arquivo.json]
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const C = await import("../apps/web/lib/ui/contrast.ts");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");

// ------------------------------------------------------------------------------------------------ CSS real
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const normalize = (s) => s.split("\r\n").join("\n");

function splitTop(str, sep = ",") {
  const out = []; let depth = 0, cur = "";
  for (const ch of str) {
    if (ch === "(") depth++; else if (ch === ")") depth--;
    if (ch === sep && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function loadTheme() {
  const css = stripComments(normalize(readFileSync(path.join(WEB, "app", "globals.css"), "utf8"))).replace(/@(import|custom-variant)[^{;]*;/g, "");
  const rootTokens = {}, darkTokens = {}, themeInline = {}, overrides = {}, compound = {};
  // regras de primeiro nível (sem aninhamento neste arquivo)
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim(), body = m[2];
    const decls = {};
    for (const d of body.matchAll(/(-{0,2}[a-z][a-z0-9-]*)\s*:\s*([^;]+);?/gi)) decls[d[1]] = d[2].trim();
    if (sel === ":root") for (const [k, v] of Object.entries(decls)) rootTokens[k.replace(/^--/, "")] = v;
    else if (sel === ".dark") for (const [k, v] of Object.entries(decls)) darkTokens[k.replace(/^--/, "")] = v;
    else if (sel.startsWith("@theme")) for (const [k, v] of Object.entries(decls)) themeInline[k.replace(/^--/, "")] = v;
    else if (sel.includes(":is(")) {
      // regra composta: .bg-white:is(.text-black, [class~="text-[#000000]"]) { background-color: ... } (várias, separadas por vírgula)
      const bgv = decls["background-color"];
      for (const part of splitTop(sel)) {
        const mm = /^\.([\w\\:/.-]+?)(:hover)?:is\((.+)\)$/.exec(part);
        if (!mm || !bgv) continue;
        const texts = [...mm[3].matchAll(/\.(text-[\w-]+)|\[class~="([^"]+)"\]/g)].map((x) => x[1] ?? x[2]);
        (compound[mm[1].replace(/\\(.)/g, "$1")] ??= []).push({ texts, color: bgv });
      }
    }
    else if (sel.startsWith(".")) {
      for (const one of sel.split(",").map((s) => s.trim())) {
        const mm = /^\.((?:\\.|[^:\s.\\])+)(:[a-z-]+)?$/.exec(one);
        if (!mm) continue;
        const cls = mm[1].replace(/\\(.)/g, "$1");
        for (const [prop, val] of Object.entries(decls)) {
          if (!["background-color", "color", "border-color"].includes(prop)) continue;
          (overrides[cls] ??= {})[prop] = val;
        }
      }
    }
  }
  const defaultTheme = {};
  const themePath = path.join(ROOT, "node_modules", "tailwindcss", "theme.css");
  if (existsSync(themePath)) {
    for (const d of normalize(readFileSync(themePath, "utf8")).matchAll(/--(color-[a-z0-9-]+):\s*([^;]+);/g)) defaultTheme[d[1]] = d[2].trim();
  }
  return { css, rootTokens, darkTokens, themeInline, overrides, compound, defaultTheme };
}

function makeResolver(theme) {
  const { rootTokens, themeInline, defaultTheme } = theme;
  const lookupVar = (name, depth) => {
    const v = rootTokens[name] ?? themeInline[name] ?? defaultTheme[name];
    return v === undefined ? null : resolveValue(v, depth + 1);
  };
  function resolveValue(raw, depth = 0) {
    if (depth > 8 || raw == null) return null;
    const v = String(raw).trim();
    const low = v.toLowerCase();
    if (low === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    if (low === "white") return { r: 255, g: 255, b: 255, a: 1 };
    if (low === "black") return { r: 0, g: 0, b: 0, a: 1 };
    let m = /^var\(\s*--([a-z0-9-]+)\s*(?:,\s*(.+))?\)$/i.exec(v);
    if (m) return lookupVar(m[1], depth) ?? (m[2] ? resolveValue(m[2], depth + 1) : null);
    m = /^color-mix\(\s*in\s+[a-z]+\s*,\s*(.+)\)$/i.exec(v);
    if (m) {
      const parts = splitTop(m[1]);
      if (parts.length !== 2) return null;
      const pick = (p) => { const mm = /^(.*?)(?:\s+([\d.]+)%)?$/.exec(p.trim()); return { c: resolveValue(mm[1], depth + 1), p: mm[2] === undefined ? null : parseFloat(mm[2]) / 100 }; };
      let A = pick(parts[0]), B = pick(parts[1]);
      if (!A.c || !B.c) return null;
      if (A.p === null && B.p === null) { A.p = 0.5; B.p = 0.5; } else if (A.p === null) A.p = 1 - B.p; else if (B.p === null) B.p = 1 - A.p;
      const sum = A.p + B.p, ap = A.p / sum, bp = B.p / sum;
      const alpha = A.c.a * ap + B.c.a * bp;
      if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
      const ch = (k) => Math.round((A.c[k] * A.c.a * ap + B.c[k] * B.c.a * bp) / alpha);
      return { r: ch("r"), g: ch("g"), b: ch("b"), a: alpha * sum };
    }
    try { return C.parseColor(v); } catch { return null; }
  }
  const namedColor = (name) => {
    const v = rootTokens[`color-${name}`] ?? themeInline[`color-${name}`] ?? defaultTheme[`color-${name}`];
    return v === undefined ? null : resolveValue(v);
  };
  return { resolveValue, namedColor };
}

// ------------------------------------------------------------------------------------------------ utilitários
const SIZE_PX = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, "2xl": 24, "3xl": 30, "4xl": 36, "5xl": 48, "6xl": 60, "7xl": 72, "8xl": 96, "9xl": 128 };
const TEXT_NON_COLOR = new Set(["left", "center", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip", "inherit-size"]);
const BORDER_NON_COLOR = new Set(["solid", "dashed", "dotted", "double", "hidden", "none", "collapse", "separate"]);
const RESPONSIVE = new Set(["sm", "md", "lg", "xl", "2xl", "max-sm", "max-md", "max-lg", "max-xl", "max-2xl", "min-[640px]", "print"]);
const IGNORED_VARIANTS = new Set(["dark", "print", "motion-safe", "motion-reduce", "ltr", "rtl", "before", "after", "file", "selection", "marker", "first-line", "first-letter", "backdrop", "placeholder-shown", "autofill", "contrast-more"]);

function splitVariants(cls) {
  const parts = []; let depth = 0, cur = "";
  for (const ch of cls) {
    if (ch === "[" || ch === "(") depth++; else if (ch === "]" || ch === ")") depth--;
    if (ch === ":" && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  return { variants: parts.slice(0, -1), base: parts[parts.length - 1] };
}

function stateOfVariants(variants) {
  // devolve { state, responsive, skip }
  let state = "base", responsive = false, skip = false;
  for (const v of variants) {
    if (RESPONSIVE.has(v) || /^(min|max)-\[/.test(v)) { responsive = true; continue; }
    if (IGNORED_VARIANTS.has(v)) { skip = true; continue; }
    if (/^(group-|peer-)?hover(\/.+)?$/.test(v) || v === "hover") { state = "hover"; continue; }
    if (/^(group-|peer-)?(focus|focus-visible|focus-within)(\/.+)?$/.test(v)) { state = "focus"; continue; }
    if (v === "active" || /^group-active/.test(v)) { state = "active"; continue; }
    if (/^(group-|peer-)?disabled(\/.+)?$/.test(v) || v === "aria-disabled" || /^(group-)?data-\[disabled/.test(v) || v === "aria-disabled=true") { state = "disabled"; continue; }
    if (/^aria-(selected|checked|pressed|current|expanded)/.test(v) || /^(group-)?data-\[(state=(active|on|checked|selected|open)|selected|active|checked)/.test(v) || v === "checked" || v === "open") { state = "selected"; continue; }
    if (v === "placeholder") { state = "placeholder"; continue; }
    if (v === "aria-invalid" || v === "aria-[invalid=true]" || v === "invalid" || v === "user-invalid" || /^data-\[(error|invalid)/.test(v)) { state = "error"; continue; }
    // variantes arbitrárias / desconhecidas: não avaliadas
    skip = true;
  }
  return { state, responsive, skip };
}

function parseAlpha(a) {
  if (a === undefined) return 1;
  let m = /^\[([\d.]+)(%?)\]$/.exec(a);
  if (m) return m[2] ? parseFloat(m[1]) / 100 : parseFloat(m[1]);
  m = /^(\d+(?:\.\d+)?)$/.exec(a);
  return m ? parseFloat(m[1]) / 100 : null;
}

function splitAlpha(v) {
  let depth = 0;
  for (let i = v.length - 1; i >= 0; i--) {
    const ch = v[i];
    if (ch === "]" || ch === ")") depth++; else if (ch === "[" || ch === "(") depth--;
    else if (ch === "/" && depth === 0) return { name: v.slice(0, i), alpha: v.slice(i + 1) };
  }
  return { name: v, alpha: undefined };
}

/** Interpreta um utilitário (sem variantes): { prop, color|null, size?, current? } ou null se não é de cor. */
function parseUtility(base, R, theme, fullKey) {
  let b = base.replace(/^!/, "").replace(/!$/, "");
  const mp = /^(bg|text|border|ring|outline|placeholder|from|via|to|decoration|caret|accent|divide|fill|stroke)-(.+)$/.exec(b);
  if (!mp) return null;
  const [, prefix, restRaw] = mp;
  if (["decoration", "caret", "accent", "fill", "stroke", "divide"].includes(prefix)) return null;
  let rest = restRaw;
  if (prefix === "bg" && /^(gradient|linear|radial|conic|cover|contain|center|top|bottom|left|right|no-repeat|repeat|fixed|local|scroll|clip|origin|blend|none|auto|opacity|size|position|\[url|\[length|\[position|\[image)/.test(rest)) return null;
  if (prefix === "text") {
    if (TEXT_NON_COLOR.has(rest)) return null;
    if (rest in SIZE_PX) return { prop: "size", size: SIZE_PX[rest] };
    const arb = /^\[(?:length:|absolute-size:)?([\d.]+)(px|rem)\]$/.exec(rest);
    if (arb) return { prop: "size", size: parseFloat(arb[1]) * (arb[2] === "rem" ? 16 : 1) };
    if (/^(xs|sm|base|lg|[2-9]?xl)\/.+/.test(rest)) return { prop: "size", size: SIZE_PX[rest.split("/")[0]] ?? 16 };
  }
  if (prefix === "border" || prefix === "ring" || prefix === "outline") {
    // largura/estilo/lado
    if (/^(x|y|t|r|b|l|s|e)$/.test(rest) || /^\d+$/.test(rest) || BORDER_NON_COLOR.has(rest) || /^(spacing|inset|offset|opacity)/.test(rest) || /^\[\d/.test(rest) || rest === "") return null;
    rest = rest.replace(/^(x|y|t|r|b|l|s|e)-(?!\d+$)/, (m0, _s) => ""); // border-t-red-500 -> red-500
    if (/^(x|y|t|r|b|l|s|e)-\d+$/.test(restRaw) || /^offset-/.test(rest)) return null;
  }
  const { name, alpha } = splitAlpha(rest);
  const prop = { bg: "bg", text: "fg", border: "border", ring: "ring", outline: "ring", placeholder: "phfg", from: "grad", via: "grad", to: "grad" }[prefix];
  // sobrescrita NÃO-CAMADA de globals.css (vence os utilitários)
  const ov = theme.overrides[fullKey];
  if (ov) {
    const cssProp = { bg: "background-color", fg: "color", border: "border-color" }[prop];
    if (cssProp && ov[cssProp]) {
      const c = R.resolveValue(ov[cssProp]);
      if (c) return { prop, color: c, override: true };
    }
  }
  if (name === "current" || name === "inherit") return { prop, current: true };
  if (name === "transparent") return { prop, color: { r: 0, g: 0, b: 0, a: 0 } };
  let color = null;
  if (name.startsWith("[") && name.endsWith("]")) {
    let inner = name.slice(1, -1).replace(/^color:/, "").replace(/_/g, " ");
    if (/^(length|percentage|position|url|image|size|absolute-size)/.test(inner)) return null;
    color = R.resolveValue(inner);
    if (!color) return null;
  } else if (name.startsWith("(") && name.endsWith(")")) {
    color = R.resolveValue(`var(${name.slice(1, -1)})`);
    if (!color) return null;
  } else {
    color = R.namedColor(name);
    if (!color) return null;
  }
  const al = parseAlpha(alpha);
  if (al === null) return null;
  return { prop, color: { ...color, a: color.a * al } };
}

// ------------------------------------------------------------------------------------------------ extração de literais
const UTIL_TOKEN = /^[!-]?[a-z0-9\[\]()\-:&>*=_.#%/,~@'+!^$]+$/i;

export function extractStrings(src) {
  const out = []; // { text, index }
  const n = src.length;
  function scanTemplate(start) { // start = índice após a crase; devolve fim (índice após a crase final)
    let i = start, cur = "", curStart = start;
    while (i < n) {
      const ch = src[i];
      if (ch === "\\") { cur += src.slice(i, i + 2); i += 2; continue; }
      if (ch === "`") { out.push({ text: cur, index: curStart }); return i + 1; }
      if (ch === "$" && src[i + 1] === "{") {
        out.push({ text: cur, index: curStart }); cur = ""; i += 2;
        i = scanCode(i, true); curStart = i; continue;
      }
      cur += ch; i++;
    }
    return i;
  }
  function scanCode(start, untilBrace) {
    let i = start, depth = 0;
    while (i < n) {
      const ch = src[i], nx = src[i + 1];
      if (ch === "/" && nx === "/" && src[i - 1] !== ":") { while (i < n && src[i] !== "\n") i++; continue; }
      if (ch === "/" && nx === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      if (ch === '"' || ch === "'") {
        let j = i + 1, s = "";
        while (j < n && src[j] !== ch && src[j] !== "\n") { if (src[j] === "\\") { s += src.slice(j, j + 2); j += 2; } else { s += src[j]; j++; } }
        if (src[j] === ch) { out.push({ text: s, index: i + 1 }); i = j + 1; } else i++;
        continue;
      }
      if (ch === "`") { i = scanTemplate(i + 1); continue; }
      if (untilBrace) { if (ch === "{") depth++; else if (ch === "}") { if (depth === 0) return i + 1; depth--; } }
      i++;
    }
    return i;
  }
  scanCode(0, false);
  return out;
}

function lineOf(src, idx, cache) {
  if (!cache.nl) { cache.nl = []; for (let i = 0; i < src.length; i++) if (src[i] === "\n") cache.nl.push(i); }
  let lo = 0, hi = cache.nl.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cache.nl[mid] < idx) lo = mid + 1; else hi = mid; }
  return lo + 1;
}

// ------------------------------------------------------------------------------------------------ avaliação
const hex = (c) => "#" + [c.r, c.g, c.b].map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0")).join("");

function surfacesFor(file, theme, R) {
  const tok = (n) => R.resolveValue(`var(--${n})`);
  if (/sidebar|brand/i.test(path.basename(file))) return [{ name: "brand-sidebar", rgb: tok("brand-sidebar") }];
  return ["background", "card", "muted", "secondary", "accent"].map((n) => ({ name: n, rgb: tok(n) })).filter((s) => s.rgb);
}

function classify(ratio, min, followsRule, kind, state) {
  let severity = null, rules = [];
  if (ratio < 3) { severity = "CRITICA"; rules.push(`razão ${ratio.toFixed(2)}:1 < 3:1`); }
  else if (ratio < min) { severity = "ALTA"; rules.push(`razão ${ratio.toFixed(2)}:1 < ${min}:1 (${kind})`); }
  if (!followsRule && ratio < 7) { if (!severity) severity = "MEDIA"; rules.push("fundo claro->fonte escura / fundo escuro->fonte clara"); }
  if (!severity && kind === "texto normal" && ratio < 7) { severity = "META"; rules.push(`abaixo da meta AAA 7:1 (${ratio.toFixed(2)}:1)`); }
  return { severity, rules };
}

function evalLiteral(text, file, theme, R) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || !tokens.every((t) => UTIL_TOKEN.test(t))) return [];
  // camadas: por estado, base e responsivo
  const layers = { base: {}, resp: {} };
  const L = (resp) => (resp ? layers.resp : layers.base);
  let size = null, bold = false, opacity = {}, recognized = 0, hasFocusRing = false, hasInputBorder = false, hasArbBorder = false, textHints = false;
  const stateProps = {}; // state -> prop -> {color, override}
  const grad = [];
  for (const tok of tokens) {
    const { variants, base } = splitVariants(tok);
    const { state, responsive, skip } = stateOfVariants(variants);
    const clean = base.replace(/^!/, "").replace(/!$/, "");
    if (/^(font-(bold|extrabold|black)|font-\[(7|8|9)00\])$/.test(clean) && !skip) bold = true;
    if (!skip && /^(px|py|p|pl|pr|pt|pb|font|leading|truncate|uppercase|tracking)(-|$)/.test(clean)) textHints = true;
    const mo = /^opacity-(\d+)$/.exec(clean);
    if (mo && !skip) { opacity[state] = parseInt(mo[1], 10) / 100; if (state !== "base") stateProps[state] ??= {}; continue; }
    if (skip) continue;
    const fullKey = tok.replace(/^!/, "").replace(/!$/, "");
    const u = parseUtility(base, R, theme, fullKey);
    if (!u) continue;
    if (u.prop === "size") { if (state === "base") size = u.size; textHints = true; continue; }
    recognized++;
    if (u.current) continue;
    if (u.prop === "ring" && state === "focus") hasFocusRing = true;
    if (u.prop === "border" && /^border-input$/.test(clean)) hasInputBorder = true;
    if (u.prop === "border" && /^border-\[/.test(clean)) hasArbBorder = true;
    if (u.prop === "grad") { if (state === "base") grad.push(u.color); continue; }
    const key = responsive ? "resp" : state;
    const slot = responsive ? layers.resp : (stateProps[state] ??= {});
    slot[key === "resp" ? `${state}:${u.prop}` : u.prop] = { color: u.color, override: !!u.override, cls: fullKey };
  }
  if (recognized === 0) return [];
  const baseProps = stateProps.base ?? {};
  // regras compostas não-camada: fundo claro devolvido a quem declara texto preto no MESMO elemento
  for (const [st0, props0] of Object.entries(stateProps)) {
    const b0 = props0.bg;
    if (!b0) continue;
    for (const rule of theme.compound[b0.cls] ?? []) {
      if (tokens.some((t) => rule.texts.includes(t))) { const c = R.resolveValue(rule.color); if (c) props0.bg = { color: c, override: true, cls: b0.cls }; }
    }
  }
  // responsivos preenchem apenas o que falta no base
  for (const [k, v] of Object.entries(layers.resp)) { const [st, prop] = k.split(":"); if (st === "base") baseProps[prop] ??= v; else ((stateProps[st] ??= {})[prop] ??= v); }
  const large = size !== null && (size >= 24 || (size >= 18.66 && bold));
  const inheritedFg = R.resolveValue("var(--foreground)");
  const surfaces = surfacesFor(file, theme, R);
  const results = [];
  const states = ["base", ...["hover", "focus", "active", "disabled", "selected", "placeholder", "error"].filter((s) => stateProps[s])];
  for (const st of states) {
    const sp = stateProps[st] ?? {};
    const pick = (prop) => {
      const b = baseProps[prop], s = sp[prop];
      if (st === "base") return b ?? null;
      if (s && b && b.override && !s.override && !(prop === "ring")) return { ...b, ignoredState: true };
      return s ?? b ?? null;
    };
    const touchedColor = st === "base" || ["fg", "bg", "phfg", "ring", "border"].some((p) => sp[p]);
    if (!touchedColor && !(opacity[st] !== undefined)) continue;
    const fgSel = st === "placeholder" ? (sp.phfg ?? sp.fg ?? baseProps.phfg ?? null) : pick("fg");
    const bgSel = pick("bg");
    const bgColor = bgSel && bgSel.color.a > 0 ? bgSel.color : null;
    const bgList = bgColor ? [bgColor] : (!bgSel && grad.length ? grad : []);
    const op = opacity[st] ?? opacity.base ?? 1;
    if (st === "base") {
      if (bgColor && bgColor.a >= 0.6 && C.isLightBackground(C.compositeOver(bgColor, surfaces[0].rgb))) results.lightBg = true;
      if (!bgColor && fgSel && fgSel.color.a === 1 && C.relativeLuminance(fgSel.color) < 0.2) results.darkFgOnly = true;
    }
    // só avalia texto se há cor de texto OU fundo declarado neste estado/base
    const stateChangesText = st === "base" || sp.fg || sp.bg || sp.phfg || st === "disabled";
    if (!stateChangesText) { /* só ring/border */ }
    const isTextEval = (fgSel || bgColor) && (st === "base" || sp.fg || sp.bg || sp.phfg || (st === "disabled" && op < 1));
    if (isTextEval && !(st === "base" && !fgSel && !bgColor)) {
      const inherited = !fgSel;
      if (inherited && !textHints) continue; // barra/ponto/divisor decorativo sem texto próprio
      const fgc = fgSel ? fgSel.color : inheritedFg;
      if (fgc.a > 0 || fgSel) {
        let worst = null;
        for (const s of surfaces) {
          const parent = s.rgb;
          const stack = bgList.length ? bgList : [null];
          for (const bgv of stack) {
            let bgEff = bgv ? C.compositeOver(bgv, parent) : parent;
            let fgEff = C.compositeOver(fgc, bgEff);
            if (op < 1) { bgEff = C.compositeOver({ ...bgEff, a: op }, parent); fgEff = C.compositeOver({ ...fgEff, a: op }, parent); }
            const ratio = C.contrastRatio(fgEff, bgEff);
            const rule = C.followsLightDarkRule(fgEff, bgEff);
            const kind = large ? "texto grande" : "texto normal";
            const min = st === "disabled" ? 3 : large ? 3 : 4.5;
            const cl = classify(ratio, min, rule, st === "disabled" ? "texto desabilitado" : kind, st);
            const sevOrder = { CRITICA: 4, ALTA: 3, MEDIA: 2, META: 1, null: 0 };
            const cand = { ratio, fg: hex(fgEff), bg: hex(bgEff), surface: s.name, sev: cl.severity, rules: cl.rules, kind, rule };
            if (!worst || sevOrder[cand.sev] > sevOrder[worst.sev] || (sevOrder[cand.sev] === sevOrder[worst.sev] && ratio < worst.ratio)) worst = cand;
          }
        }
        if (worst && worst.sev) results.push({ state: st, ...worst, inheritedFg: inherited, ignoredState: !!(fgSel?.ignoredState || bgSel?.ignoredState), target: "texto" });
      }
    }
    // controle: anel de foco / borda de campo (>= 3:1 contra a superfície)
    const ringSel = st === "focus" || st === "error" ? sp.ring : null;
    const borderSel = pick("border");
    const ctrlBorder = hasInputBorder || (hasArbBorder && hasFocusRing);
    const ctrl = [];
    if (ringSel) ctrl.push(["anel", ringSel]);
    if (borderSel && (st === "error" ? sp.border : ctrlBorder && (st === "base" || st === "focus"))) ctrl.push(["borda de controle", borderSel]);
    for (const [label, sel] of ctrl) {
      if (sel.color.a === 0) continue;
      let worst = null;
      for (const s of surfaces) {
        const ref = s.rgb; // anel/borda é avaliado contra a superfície que ENVOLVE o controle
        const eff = C.compositeOver(sel.color, ref);
        let ratio = C.contrastRatio(eff, ref);
        if (label !== "anel" && bgColor && bgColor.a === 1 && C.contrastRatio(C.compositeOver(bgColor, ref), ref) >= 3) ratio = Math.max(ratio, 3); // preenchimento opaco já delimita o controle
        if (!worst || ratio < worst.ratio) worst = { ratio, fg: hex(eff), bg: hex(ref), surface: s.name };
      }
      if (worst && worst.ratio < 3) results.push({ state: st, ...worst, sev: worst.ratio < 3 ? "ALTA" : null, rules: [`${label} ${worst.ratio.toFixed(2)}:1 < 3:1 (controle/gráfico)`], kind: "controle", rule: true, inheritedFg: false, ignoredState: false, target: label });
    }
  }
  return results;
}

// ------------------------------------------------------------------------------------------------ varredura
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name) && !/\.(test|spec)\./.test(name)) acc.push(p);
  }
  return acc;
}

let cachedCtx = null;
/** Avalia UMA lista de classes (já combinada, ex.: base do cva + variante) como se fosse um literal de `file`. Útil para testes. */
export function auditClassString(classes, file = "components/ui/exemplo.tsx") {
  cachedCtx ??= (() => { const theme = loadTheme(); return { theme, R: makeResolver(theme) }; })();
  return evalLiteral(classes, file, cachedCtx.theme, cachedCtx.R).map((r) => ({ ...r, classes }));
}

/** Arquivos COMPARTILHADOS (escopo do teste de regressão): UI base, shared, layout e utilitários de estilo em lib/ui. */
export const SHARED_GLOBS = [/^components\/ui\//, /^components\/shared\//, /^components\/layout\//, /^lib\/ui\/[^/]+\.(ts|tsx)$/];

export function moduleOf(rel) {
  const parts = rel.split("/");
  if (parts[0] === "components") return parts[1].endsWith(".tsx") ? "components(raiz)" : `components/${parts[1]}`;
  if (parts[0] === "lib") return `lib/${parts[1]}`;
  if (parts[0] === "app") {
    const segs = parts.slice(1).filter((s) => !/^\(.*\)$/.test(s) && s !== "[projectId]");
    return `app/${segs[0] ?? "(raiz)"}`;
  }
  return parts[0];
}

export function auditAll({ scope = "all", files = null } = {}) {
  const theme = loadTheme();
  const R = makeResolver(theme);
  const list = [];
  for (const sub of ["app", "components", "lib"]) list.push(...walk(path.join(WEB, sub)));
  const findings = [];
  let scanned = 0, literals = 0, revisar = 0;
  for (const abs of list) {
    const rel = path.relative(WEB, abs).split(path.sep).join("/");
    if (scope === "shared" && !SHARED_GLOBS.some((g) => g.test(rel))) continue;
    if (files && !files.some((f) => rel.includes(f))) continue;
    scanned++;
    const src = normalize(readFileSync(abs, "utf8"));
    const cache = {};
    const seen = new Set();
    const pending = [];
    let fileLightBg = false, fileDarkFg = false;
    for (const s of extractStrings(src)) {
      if (!/(^|[\s:!])(bg|text|border|ring|outline|placeholder|from|via|to)-/.test(s.text)) continue;
      literals++;
      const res = evalLiteral(s.text, rel, theme, R);
      if (res.lightBg) fileLightBg = true;
      if (res.darkFgOnly) fileDarkFg = true;
      for (const r of res) pending.push({ s, r, darkFgOnly: !!res.darkFgOnly });
    }
    for (const { s, r, darkFgOnly } of pending) {
      const classes = s.text.replace(/\s+/g, " ").trim();
      const key = `${rel}|${classes}|${r.state}|${r.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // REVISAR: texto escuro SEM fundo no literal, em arquivo que declara fundo claro (provável pai claro), ou texto herdado em
      // arquivo que usa texto escuro explícito (filhos definem a própria cor). Não reprova; exige revisão humana.
      let sev = r.sev;
      if (FAILING.has(sev) && r.target === "texto" && ((darkFgOnly && fileLightBg) || (r.inheritedFg && fileDarkFg))) { sev = "REVISAR"; revisar++; }
      findings.push({ file: rel, line: lineOf(src, s.index, cache), module: moduleOf(rel), classes, key, ...r, sev });
    }
  }
  return { findings, scanned, literals, revisar, theme };
}

/** Exceções aceitas (escopo compartilhado). Cada uma: { file, classes (trecho exato do literal), state, reason }. */
export const CONTRAST_AUDIT_EXCEPTIONS = [];

export function isExcepted(f) {
  return CONTRAST_AUDIT_EXCEPTIONS.some((e) => e.file === f.file && f.classes.includes(e.classes) && (!e.state || e.state === f.state));
}

export const FAILING = new Set(["CRITICA", "ALTA", "MEDIA"]);

// ------------------------------------------------------------------------------------------------ relatório
function printReport({ findings, scanned, literals }, opts) {
  const fails = findings.filter((f) => FAILING.has(f.sev));
  const metas = findings.filter((f) => f.sev === "META");
  const bySev = (arr) => ["CRITICA", "ALTA", "MEDIA", "META"].map((s) => `${s}=${arr.filter((f) => f.sev === s).length}`).join(" ");
  console.log(`AUDITORIA DE CONTRASTE (heurística; não é cobertura de 100%) — ${scanned} arquivos, ${literals} literais com utilitários de cor`);
  console.log(`Reprovações: ${fails.length} (${bySev(fails)}) | Informativo META (< 7:1, não reprova): ${metas.length} | REVISAR (provável pai claro; revisão humana, não reprova): ${findings.filter((f) => f.sev === "REVISAR").length}`);
  const byMod = {};
  for (const f of fails) (byMod[f.module] ??= []).push(f);
  console.log("\nPor módulo (reprovações):");
  for (const [m, arr] of Object.entries(byMod).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${String(arr.length).padStart(4)}  ${m}  (${new Set(arr.map((x) => x.file)).size} arquivo(s))`);
  if (opts.summary) return;
  const byFile = {};
  for (const f of opts.meta ? findings : fails) (byFile[f.file] ??= []).push(f);
  for (const [file, arr] of Object.entries(byFile).sort()) {
    console.log(`\n${file}`);
    for (const f of arr.sort((a, b) => a.line - b.line)) {
      const cls = f.classes.length > 110 ? f.classes.slice(0, 107) + "..." : f.classes;
      console.log(`  L${f.line} [${f.sev}] estado=${f.state} ${f.target}${f.inheritedFg ? " (texto herdado)" : ""}${f.ignoredState ? " (estado anulado por regra não-camada)" : ""} ${f.fg} sobre ${f.bg} (${f.surface}) = ${f.ratio.toFixed(2)}:1`);
      console.log(`      classes: ${cls}`);
      console.log(`      regra: ${f.rules.join("; ")}`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
  const scope = opt("scope") ?? "all";
  const files = opt("files")?.split(",") ?? null;
  const result = auditAll({ scope, files });
  const out = opt("out");
  if (out) writeFileSync(out, JSON.stringify(result.findings, null, 1));
  if (args.includes("--json")) console.log(JSON.stringify(result.findings, null, 1));
  else printReport(result, { summary: args.includes("--summary"), meta: args.includes("--meta") });
  const fails = result.findings.filter((f) => FAILING.has(f.sev) && !isExcepted(f));
  process.exit(args.includes("--strict") && fails.length ? 1 : 0);
}
