// Contraste do tema escuro (correção compartilhada em apps/web/app/globals.css). Mede a razão de contraste WCAG dos tokens:
// fundos sólidos 600-900 (normal e hover) com texto branco, texto institucional e texto discreto sobre o azul-marinho e o cartão.
// Não altera conteúdo, permissões nem regras. Uso: node scripts/test-theme-contrast.mjs
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../apps/web/app/globals.css", import.meta.url), "utf8").split("\r\n").join("\n");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const token = (name) => { const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`)); ok(m, `token --${name} ausente`); return m[1]; };

const CARD = token("card"), BG = token("background");
const COLORS = ["red", "orange", "amber", "yellow", "green", "emerald", "blue", "sky", "violet"];
const SHADES = ["600", "700", "800", "900"];

check("fundos sólidos 600-900 e hover: texto branco >= 4,5:1 (normal e hover) em todas as cores", () => {
  for (const c of COLORS) for (const n of SHADES) {
    for (const sel of [`.bg-${c}-${n}`, `.hover\\:bg-${c}-${n}:hover`]) {
      const m = css.match(new RegExp(`${sel.replace(/[.\\:]/g, "\\$&")} \\{ background-color: (#[0-9a-fA-F]{6}); \\}`));
      ok(m, `regra ${sel} ausente`);
      const r = ratio(m[1], "#ffffff");
      ok(r >= 4.5, `${sel} ${m[1]}: branco ${r.toFixed(2)}:1`);
    }
  }
});
check("hover nunca fica mais claro que o normal (estado visível e legível)", () => {
  for (const c of COLORS) for (const n of SHADES) {
    const g = (sel) => css.match(new RegExp(`${sel.replace(/[.\\:]/g, "\\$&")} \\{ background-color: (#[0-9a-fA-F]{6}); \\}`))[1];
    ok(lum(g(`.hover\\:bg-${c}-${n}:hover`)) <= lum(g(`.bg-${c}-${n}`)) + 1e-9, `hover de ${c}-${n} mais claro que o normal`);
  }
});
check("fundo laranja 500 (selo ATENÇÃO), desabilitado (red-300) e translúcidos blue-800/40|50: texto branco legível", () => {
  ok(ratio(css.match(/\.bg-orange-500 \{ background-color: (#[0-9a-fA-F]{6}); \}/)[1], "#ffffff") >= 4.5, "orange-500");
  ok(ratio(css.match(/\.disabled\\:bg-red-300:disabled \{ background-color: (#[0-9a-fA-F]{6}); \}/)[1], "#ffffff") >= 4.5, "disabled red-300");
  ok(/\.bg-blue-800\\\/50 \{ background-color: color-mix\(in srgb, #1a44bf 55%, transparent\); \}/.test(css), "blue-800/50");
  // pior caso: o translúcido sobre o azul-marinho mais claro (cartão)
  const mix = (f, b, a) => "#" + [1, 3, 5].map((i) => Math.round(parseInt(f.slice(i, i + 2), 16) * a + parseInt(b.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, "0")).join("");
  ok(ratio(mix("#1a44bf", CARD, 0.55), "#ffffff") >= 4.5 && ratio(mix("#1a44bf", CARD, 0.45), "#ffffff") >= 4.5, "translúcidos sobre o cartão");
});
check("texto institucional (coral) e texto discreto: >= 4,5:1 sobre o cartão e o fundo azul-marinho", () => {
  const brand = token("text-brand-on-dark"), quiet = token("text-quiet-on-dark");
  for (const [n, c] of [["coral", brand], ["discreto", quiet]]) for (const [bn, b] of [["cartão", CARD], ["fundo", BG]]) ok(ratio(c, b) >= 4.5, `${n} sobre ${bn}: ${ratio(c, b).toFixed(2)}:1`);
  ok(/\.text-brand-sidebar, \.text-brand-header \{ color: var\(--text-brand-on-dark\); \}/.test(css), "regra do texto institucional");
  ok(/\.text-slate-300[^{]*\{ color: var\(--text-quiet-on-dark\); \}/.test(css), "regra do texto discreto");
});
check("anel de foco: >= 3:1 sobre o fundo e o cartão (e regra :focus-visible presente)", () => {
  const f = token("focus-ring");
  ok(ratio(f, BG) >= 3 && ratio(f, CARD) >= 3, `foco ${ratio(f, CARD).toFixed(2)}:1 sobre o cartão`);
  ok(/a:focus-visible, button:focus-visible, input:focus-visible/.test(css) && /outline: 2px solid var\(--focus-ring\)/.test(css), "regra de foco");
});
check("sem substituição global cega: texto e borda das cores da paleta permanecem; só FUNDOS 600-900 e exceções listadas são sobrescritos", () => {
  const marker = css.indexOf("Contraste do tema escuro");
  const after = css.slice(css.indexOf("*/", marker) + 2).split("/*").map((part, i) => (i === 0 ? part : part.slice(part.indexOf("*/") + 2))).join("");
  ok(!/\.(border|ring|from|to|via|fill|stroke)-(red|orange|amber|yellow|green|emerald|blue|sky|violet)-\d+/.test(after), "borda/anel da paleta não pode ser sobrescrito");
  const textRules = after.match(/\.text-(red|orange|amber|yellow|green|emerald|blue|sky|violet)-\d+/g) ?? [];
  ok(textRules.every((r) => /-(200|300|400|500|600)$/.test(r)), "só tons 200-600 de texto podem ser ajustados");
  ok(!/\.bg-white\b/.test(after) && !/\.bg-black\b/.test(after), "superfícies claras explícitas não são tocadas aqui");
});
check("texto colorido 200/300 e azul 400-600: >= 4,5:1 sobre o cartão e o fundo (KPIs, selos)", () => {
  for (const c of COLORS) {
    const m = css.match(new RegExp("\\.text-" + c + "-200, \\.text-" + c + "-300 \\{ color: (#[0-9a-fA-F]{6}); \\}"));
    ok(m, "regra text-" + c + "-200/300 ausente");
    ok(ratio(m[1], CARD) >= 4.5 && ratio(m[1], BG) >= 4.5, "text-" + c + "-300 " + m[1] + ": " + ratio(m[1], CARD).toFixed(2) + ":1");
  }
  const b = css.match(/\.text-blue-400, [^{]*\{ color: (#[0-9a-fA-F]{6}); \}/);
  ok(b && ratio(b[1], CARD) >= 4.5, "azul 400-600 sobre o cartão");
});
check("texto de severidade baixa/crítica: >= 4,5:1 sobre o cartão e o fundo (selos translúcidos)", () => {
  for (const n of ["baixa", "critica"]) {
    const m = css.match(new RegExp("\.text-severity-" + n + " \{ color: (#[0-9a-fA-F]{6}); \}"));
    ok(m, "regra text-severity-" + n + " ausente");
    ok(ratio(m[1], CARD) >= 4.5 && ratio(m[1], BG) >= 4.5, "text-severity-" + n + " " + m[1]);
  }
});
console.log(`\n${passed} OK, ${failed} falha(s)`); process.exit(failed ? 1 : 0);
