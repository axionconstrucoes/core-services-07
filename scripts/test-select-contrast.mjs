// Contraste do Select compartilhado (apps/web/components/ui/select.tsx): azul-marinho + letras brancas, WCAG AA.
// Analisa as classes do componente (sem renderizar). Texto >= 4,5:1; borda/foco/estado >= 3:1.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-select-contrast.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootUrl = new URL("../apps/web/", import.meta.url);
const rootDir = fileURLToPath(rootUrl);
const src = readFileSync(new URL("components/ui/select.tsx", rootUrl), "utf8");
let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log("OK   " + n); passed++; } catch (e) { console.log("FAIL " + n + "\n     " + e.message); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m); };

const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const cls = src.slice(src.indexOf("export const SELECT_CLASS"), src.indexOf("function Select"));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// cor da classe "<prefixo>-[#hex]" (token inteiro, delimitado por espaco/aspas); falha se ausente
const col = (prefix) => { const m = cls.match(new RegExp("(?:^|[\\s\"'])" + esc(prefix) + "-(?:\\[(#[0-9a-fA-F]{6})\\]|(white))(?=[\\s\"',])")); ok(m, `classe ${prefix}-[#hex] ausente`); return m[1] ?? "#ffffff"; };

const BASE_BG = col("bg"), BASE_TX = col("text"), HOVER_BG = col("hover:bg");
const SEL_BG = col("[&>option:checked]:bg"), SEL_TX = col("[&>option:checked]:text");
const OPT_BG = col("[&>option]:bg"), OPT_TX = col("[&>option]:text");
const DIS_BG = col("disabled:bg"), DIS_TX = col("disabled:text");
const PH_TX = col("has-[option[value='']:checked]:text");
const BORDER = col("border"), FOCUS = col("focus-visible:ring");
const ODIS_BG = col("[&>option:disabled]:bg"), ODIS_TX = col("[&>option:disabled]:text");
const css = readFileSync(new URL("app/globals.css", rootUrl), "utf8");
const tok = (n) => css.match(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6})`))[1];
const CTX = { "página": tok("background"), "cartão": tok("card"), "formulário claro": "#ffffff" };

const T = (label, a, b, min = 4.5) => ok(ratio(a, b) >= min, `${label}: ${a} sobre ${b} = ${ratio(a, b).toFixed(2)}:1 (< ${min})`);
const rep = (l, a, b) => console.log(`     ${l}: ${ratio(a, b).toFixed(2)}:1`);

check("gatilho normal: branco sobre azul-marinho >= 4,5:1; fundo escuro de matiz azul", () => {
  ok(BASE_TX.toLowerCase() === "#ffffff", "texto do gatilho deve ser branco");
  T("normal", BASE_TX, BASE_BG); rep("normal", BASE_TX, BASE_BG);
  ok(lum(BASE_BG) < 0.05, "fundo do gatilho deve ser escuro");
  const rgb = [1, 3, 5].map((i) => parseInt(BASE_BG.slice(i, i + 2), 16)); ok(rgb[2] > rgb[0], "fundo deve ser de matiz azul");
});
check("hover, selecionado, opcao, desabilitado, opcao desabilitada e placeholder: >= 4,5:1", () => {
  const rows = [["hover", BASE_TX, HOVER_BG], ["selecionado", SEL_TX, SEL_BG], ["opção", OPT_TX, OPT_BG], ["desabilitado", DIS_TX, DIS_BG], ["opção desabilitada", ODIS_TX, ODIS_BG], ["placeholder", PH_TX, BASE_BG]];
  for (const [l, a, b] of rows) { T(l, a, b); rep(l, a, b); }
});
check("nunca texto claro sobre fundo claro: todos os fundos do Select sao escuros; selecionado distingue-se da opcao", () => {
  for (const bg of [BASE_BG, HOVER_BG, SEL_BG, OPT_BG, DIS_BG, ODIS_BG]) ok(lum(bg) < 0.2, `fundo ${bg} claro demais para texto claro`);
  ok(ratio(SEL_BG, OPT_BG) >= 1.5, `selecionado vs opcao ${ratio(SEL_BG, OPT_BG).toFixed(2)}:1`);
});
check("borda e foco >= 3:1 (pagina e cartao); gatilho destaca-se do formulario claro >= 3:1", () => {
  for (const [n, c] of Object.entries(CTX)) {
    // contexto escuro: o limite do componente e a borda; contexto claro: o proprio preenchimento
    if (n !== "formulário claro") { T(`borda/${n}`, BORDER, c, 3); rep("borda/" + n, BORDER, c); }
    else { T(`gatilho/${n}`, BASE_BG, c, 3); rep("gatilho/" + n, BASE_BG, c); }
  }
  T("foco/gatilho", FOCUS, BASE_BG, 3); rep("foco/gatilho", FOCUS, BASE_BG);
});
check("estruturais: color-scheme dark, desabilitado sem apagar texto, sem cores dependentes de tema", () => {
  ok(cls.includes("[color-scheme:dark]"), "color-scheme dark ausente (lista nativa abriria branca)");
  ok(cls.includes("disabled:opacity-100"), "disabled deve manter opacidade 100");
  ok(!/bg-transparent|bg-white|text-foreground|text-muted-foreground/.test(cls), "fundo/texto dependente de tema nao permitido");
});
check("usos existentes: nenhum <Select> forca texto escuro ou fundo claro via className", () => {
  const walk = (d) => readdirSync(d).flatMap((f) => { if (f === "node_modules" || f === ".next") return []; const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(f) ? [p] : []; });
  let uses = 0;
  for (const f of walk(rootDir)) {
    for (const m of readFileSync(f, "utf8").matchAll(/<Select\b[^>]*?className="([^"]*)"/g)) {
      uses++;
      ok(!/\btext-(\[#0|black|slate-[6-9]|gray-[6-9]|zinc-[6-9]|neutral-[6-9])|\bbg-(white|slate-\d|gray-\d|\[#(f|e))/.test(m[1]), `${f}: Select com cor conflitante: ${m[1]}`);
    }
  }
  ok(uses >= 8, "esperado varrer usos com className");
  console.log(`     ${uses} usos com className verificados`);
});
console.log(`\n${passed} OK, ${failed} falha(s)`); process.exit(failed ? 1 : 0);
