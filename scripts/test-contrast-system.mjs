// Sistema global de contraste do ACC — testa a biblioteca (lib/ui/contrast.ts) e os pares semânticos de tokens de globals.css.
// REGRA: fundo claro -> fonte escura; fundo escuro -> fonte clara; texto normal >= 4,5:1, texto grande e controles/gráficos >= 3:1.
// A medição usa o FUNDO EFETIVO (transparência composta sobre o que está atrás). Só leitura (CSS + TS puro). Sem rede.
// Uso: node scripts/test-contrast-system.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const C = await import("../apps/web/lib/ui/contrast.ts");
const { PAIRS, STATE_PAIRS, KNOWN_GAPS } = await import("../apps/web/lib/ui/contrast-pairs.ts");

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };

const css = readFileSync(new URL("../apps/web/app/globals.css", import.meta.url), "utf8").split("\r\n").join("\n");
function tokensOf(kind) {
  const t = {};
  const re = kind === "root" ? /(^|\n):root\s*\{([\s\S]*?)\n\}/g : /(^|\n)\.dark\s*\{([\s\S]*?)\n\}/g;
  for (const m of css.matchAll(re)) for (const x of m[2].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) t[x[1]] = x[2].trim();
  return t;
}
const THEMES = { principal: tokensOf("root"), dark: { ...tokensOf("root"), ...tokensOf("dark") } };

// ---- biblioteca ----
check("lib: razões conhecidas (preto/branco 21:1; cinza #767676 sobre branco ≈ 4,54:1)", () => {
  ok(Math.abs(C.contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 0.01, "preto/branco");
  const r = C.contrastRatio(C.parseColor("#767676"), C.parseColor("#ffffff"));
  ok(r > 4.5 && r < 4.6, `#767676/branco = ${r}`);
});
check("lib: oklch, rgb() e hex produzem a mesma cor (conversão consistente)", () => {
  const a = C.parseColor("oklch(1 0 0)"), b = C.parseColor("#ffffff"), c = C.parseColor("rgb(255 255 255)");
  ok(a.r === 255 && a.g === 255 && a.b === 255 && b.r === 255 && c.r === 255, JSON.stringify([a, b, c]));
  const k = C.parseColor("oklch(0 0 0)");
  ok(k.r === 0 && k.g === 0 && k.b === 0, "oklch preto");
});
check("lib: fundo efetivo — transparência é composta sobre o que está atrás (não vale só a cor declarada)", () => {
  // texto branco sobre branco/40% de preto: o fundo efetivo é CINZA, não preto
  const eff = C.effectiveBackground([C.parseColor("#ffffff"), C.parseColor("rgba(0,0,0,0.4)")]);
  ok(eff.r === 153 && eff.g === 153, `fundo efetivo = ${JSON.stringify(eff)}`);
  const sobreBranco = C.evaluatePair(C.parseColor("#ffffff"), [C.parseColor("#ffffff"), C.parseColor("rgba(0,0,0,0.4)")]);
  const sobrePreto = C.evaluatePair(C.parseColor("#ffffff"), [C.parseColor("#000000"), C.parseColor("rgba(0,0,0,0.4)")]);
  ok(!sobreBranco.passes && sobrePreto.passes, "o mesmo overlay translúcido muda o veredito conforme o que está atrás");
});
check("lib: regra universal — fundo claro exige texto escuro, fundo escuro exige texto claro", () => {
  const light = C.parseColor("#f7f3ea"), dark = C.parseColor("#0b1629");
  ok(C.followsLightDarkRule(dark, light) && C.followsLightDarkRule(light, dark), "pares corretos");
  ok(!C.followsLightDarkRule(light, light) && !C.followsLightDarkRule(dark, dark), "pares invertidos devem falhar");
  ok(C.followsLightDarkRule(C.readableTextFor(light), light) && C.followsLightDarkRule(C.readableTextFor(dark), dark), "readableTextFor");
});

// ---- tokens reais ----
// Avalia um par com opções de translucidez (bgAlpha sobre bgOver) e desbotamento do elemento (opacity sobre bgOver).
function verdictOf(p, tokens) {
  const fgv = tokens[p.fg], bgv = tokens[p.bg];
  if (!fgv || !bgv) return { missing: `token ausente (${p.fg}/${p.bg})` };
  const fgc = C.parseColor(fgv), bgc = C.parseColor(bgv);
  const parent = p.bgOver ? C.parseColor(tokens[p.bgOver] ?? "") : null;
  const layers = parent ? [parent, { ...bgc, a: p.bgAlpha ?? 1 }] : [bgc];
  let bg = C.effectiveBackground(layers);
  let fg = C.compositeOver(fgc, bg);
  if (p.opacity !== undefined && p.opacity < 1) {
    if (!parent) return { missing: "opacity exige bgOver" };
    bg = C.compositeOver({ ...bg, a: p.opacity }, parent);
    fg = C.compositeOver({ ...fg, a: p.opacity }, parent);
  }
  const ratio = C.contrastRatio(fg, bg), min = C.CONTRAST_MIN[p.kind];
  return { ratio, min, passes: ratio >= min, followsRule: C.followsLightDarkRule(fg, bg) };
}
const ALL_PAIRS = [...PAIRS, ...STATE_PAIRS];
for (const [theme, tokens] of Object.entries(THEMES)) {
  check(`tokens (${theme}): todos os pares semânticos e de ESTADO (${ALL_PAIRS.length}) cumprem o mínimo e a regra claro/escuro`, () => {
    const problems = [];
    for (const p of ALL_PAIRS) {
      if (p.themes && !p.themes.includes(theme)) continue;
      const gapKey = `${theme}:${p.name}`;
      const v = verdictOf(p, tokens);
      if (v.missing) { problems.push(`${gapKey}: ${v.missing}`); continue; }
      const gap = KNOWN_GAPS[gapKey];
      if (gap) { if (v.passes) problems.push(`${gapKey} estava em KNOWN_GAPS mas passou (${v.ratio.toFixed(2)}): remova a entrada`); continue; }
      if (!v.passes) problems.push(`${gapKey}: ${v.ratio.toFixed(2)}:1 < ${v.min}:1`);
      if (p.kind !== "graphic" && !v.followsRule) problems.push(`${gapKey}: viola fundo claro->fonte escura / fundo escuro->fonte clara`);
    }
    ok(problems.length === 0, problems.join(" | "));
  });
}

check("cobertura de estados: cada componente base tem pares para os estados aplicáveis (normal, hover, foco, ativo, selecionado, desabilitado, carregando, sucesso, aviso, erro, placeholder, seleção de texto, link)", () => {
  const has = (component, state) => STATE_PAIRS.some((p) => p.component === component && p.state === state);
  const required = {
    button: ["normal", "hover", "ativo", "selecionado", "desabilitado", "foco"], badge: ["normal", "sucesso", "aviso", "erro"],
    input: ["normal", "placeholder", "foco", "desabilitado", "erro"], tabs: ["normal", "hover", "selecionado", "foco", "desabilitado"],
    table: ["normal", "hover", "selecionado"], card: ["normal"], progress: ["normal", "carregando"], link: ["link", "hover"], "página": ["selecao-de-texto"],
  };
  const missing = [];
  for (const [c, states] of Object.entries(required)) for (const st of states) if (!has(c, st)) missing.push(`${c}:${st}`);
  for (const st of ["sucesso", "aviso", "erro"]) if (!has("painel", st)) missing.push(`painel:${st}`);
  ok(missing.length === 0, "estados sem par: " + missing.join(", "));
});

check("sem deriva: tokens --severity-*-text espelham as regras .text-severity-* de globals.css e os pares existem nos dois temas", () => {
  const t = THEMES.principal;
  for (const sev of ["baixa", "media", "alta", "critica"]) {
    ok(t[`severity-${sev}-text`], `token --severity-${sev}-text ausente`);
    const m = css.match(new RegExp(`\.text-severity-${sev} \{ color: ([^;]+); \}`));
    ok(m, `regra .text-severity-${sev} ausente`);
    const val = m[1].trim() === `var(--severity-${sev}-text)` ? t[`severity-${sev}-text`] : m[1].trim();
    ok(val.toLowerCase() === t[`severity-${sev}-text`].toLowerCase(), `deriva em severity-${sev}: regra=${m[1]} token=${t[`severity-${sev}-text`]}`);
  }
});

check("lib: opacity e translucidez nos pares de estado (hover:opacity-90 desbota texto E fundo sobre o pai)", () => {
  const t = THEMES.principal;
  const full = verdictOf({ fg: "primary-foreground", bg: "primary", kind: "textNormal" }, t);
  const faded = verdictOf({ fg: "primary-foreground", bg: "primary", kind: "textNormal", bgOver: "card", opacity: 0.5 }, t);
  ok(faded.ratio < full.ratio, `desbotado (${faded.ratio.toFixed(2)}) deve ser menor que cheio (${full.ratio.toFixed(2)})`);
});

check("KNOWN_GAPS: cada lacuna conhecida tem justificativa e providência (nenhuma lacuna silenciosa)", () => {
  for (const [k, v] of Object.entries(KNOWN_GAPS)) ok(v && v.length >= 30, `${k}: descreva motivo e providência`);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
