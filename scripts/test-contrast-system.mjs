// Sistema global de contraste do ACC — testa a biblioteca (lib/ui/contrast.ts) e os pares semânticos de tokens de globals.css.
// REGRA: fundo claro -> fonte escura; fundo escuro -> fonte clara; texto normal >= 4,5:1, texto grande e controles/gráficos >= 3:1.
// A medição usa o FUNDO EFETIVO (transparência composta sobre o que está atrás). Só leitura (CSS + TS puro). Sem rede.
// Uso: node scripts/test-contrast-system.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);
const C = await import("../apps/web/lib/ui/contrast.ts");
const { PAIRS, KNOWN_GAPS } = await import("../apps/web/lib/ui/contrast-pairs.ts");

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
for (const [theme, tokens] of Object.entries(THEMES)) {
  check(`tokens (${theme}): todos os pares semânticos obrigatórios cumprem o mínimo e a regra claro/escuro`, () => {
    const problems = [];
    for (const p of PAIRS) {
      if (p.themes && !p.themes.includes(theme)) continue;
      const fgv = tokens[p.fg], bgv = tokens[p.bg];
      if (!fgv || !bgv) { problems.push(`${p.name}: token ausente (${p.fg}/${p.bg})`); continue; }
      const gapKey = `${theme}:${p.name}`;
      const v = C.evaluatePair(C.parseColor(fgv), [C.parseColor(bgv)], p.kind);
      const gap = KNOWN_GAPS[gapKey];
      if (gap) { if (v.passes) problems.push(`${gapKey} estava em KNOWN_GAPS mas passou (${v.ratio.toFixed(2)}): remova a entrada`); continue; }
      if (!v.passes) problems.push(`${gapKey}: ${v.ratio.toFixed(2)}:1 < ${v.min}:1`);
      if (p.kind !== "graphic" && !v.followsRule) problems.push(`${gapKey}: viola fundo claro->fonte escura / fundo escuro->fonte clara`);
    }
    ok(problems.length === 0, problems.join(" | "));
  });
}

check("KNOWN_GAPS: cada lacuna conhecida tem justificativa e providência (nenhuma lacuna silenciosa)", () => {
  for (const [k, v] of Object.entries(KNOWN_GAPS)) ok(v && v.length >= 30, `${k}: descreva motivo e providência`);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
