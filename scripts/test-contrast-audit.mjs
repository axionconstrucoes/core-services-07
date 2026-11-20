// Regressão de contraste nos arquivos COMPARTILHADOS (components/ui, components/shared, components/layout, lib/ui) usando o auditor
// estático scripts/contrast-audit.mjs sobre o CSS REAL (globals.css: tokens, paleta remapeada, regras não-camada).
// Falha se surgir violação NOVA (CRITICA/ALTA/MEDIA) fora de CONTRAST_AUDIT_EXCEPTIONS (lista documentada, vazia = ideal).
// LIMITES: o auditor é heurístico (ver cabeçalho de contrast-audit.mjs) — este teste NÃO prova 100% de conformidade; as violações em
// arquivos de MÓDULO são relatadas em docs/design-system e aplicadas por cada módulo. Só leitura. Uso: node scripts/test-contrast-audit.mjs
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAll, auditClassString, CONTRAST_AUDIT_EXCEPTIONS, FAILING, isExcepted, extractStrings } from "./contrast-audit.mjs";

let passed = 0, failed = 0;
const check = (n, fn) => { try { fn(); console.log(`OK   ${n}`); passed++; } catch (e) { console.log(`FAIL ${n}\n     ${e.message}`); failed++; } };
const ok = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, "apps", "web", rel), "utf8").split("\r\n").join("\n");
const failing = (arr) => arr.filter((f) => FAILING.has(f.sev));
const fmt = (f) => `${f.file}:${f.line ?? "?"} [${f.sev}] ${f.state}/${f.target} ${f.fg} sobre ${f.bg} = ${f.ratio.toFixed(2)}:1 :: ${f.classes.slice(0, 100)}`;

// ---- o auditor detecta o que deve detectar (e não acusa o que está correto) ----
check("auditor: detecta texto claro sobre fundo claro e o inverso (regra claro/escuro)", () => {
  ok(failing(auditClassString("bg-[#FFD600] text-white font-bold")).length > 0, "branco sobre amarelo não foi detectado");
  ok(failing(auditClassString("bg-[#0b1629] text-black")).length > 0, "preto sobre azul-marinho não foi detectado");
  ok(failing(auditClassString("bg-primary text-primary-foreground hover:bg-white/90 hover:text-white")).some((f) => f.state === "hover"), "hover claro com texto branco não foi detectado");
});
check("auditor: não acusa combinações corretas dos selos aprovados (ALTA amarelo/preto, CRÍTICA vermelho/branco, BAIXA, MÉDIA)", () => {
  for (const c of ["bg-[#FFD600] text-[#000000] font-bold", "bg-[#DC2626] text-[#FFFFFF] font-bold", "bg-[#166534] text-[#FFFFFF] font-bold", "bg-[#2563EB] text-[#FFFFFF] font-bold"])
    ok(failing(auditClassString(c)).length === 0, `falso positivo em "${c}"`);
});
check("auditor: usa o CSS REAL (paleta remapeada + regras não-camada), não os nomes Tailwind padrão", () => {
  // bg-red-800 text-white: no Tailwind padrão passa; com a paleta remapeada seria 1,9:1 — só passa por causa da regra .bg-red-800 de globals.css
  ok(failing(auditClassString("bg-red-800 text-white font-semibold hover:bg-red-900 hover:text-white")).length === 0, "regra .bg-red-800/.hover:bg-red-900 não foi considerada");
  ok(failing(auditClassString("bg-red-50 text-red-950")).length === 0, "text-red-950 deve ser claro (regra .text-red-950)");
  ok(failing(auditClassString("bg-white text-black")).length === 0, ".bg-white:is(.text-black) deve devolver fundo claro");
  ok(failing(auditClassString("bg-gray-800 text-white")).length === 0, "bg-gray-800 sólido escuro com texto branco");
  ok(failing(auditClassString("text-purple-600")).length === 0, "paleta purple remapeada");
});
check("auditor: opacidade do estado desabilitado compõe texto e fundo sobre o pai (disabled:opacity-*)", () => {
  ok(failing(auditClassString("bg-primary text-primary-foreground disabled:opacity-50")).length === 0, "primário desabilitado a 50% deve ser >= 3:1");
  ok(failing(auditClassString("bg-primary text-primary-foreground disabled:opacity-10")).some((f) => f.state === "disabled"), "10% de opacidade deve reprovar");
});
check("auditor: extração de literais ignora comentários e acha template strings", () => {
  const src = `// "bg-red-500 text-white"\nconst a = "bg-card text-card-foreground"; const b = \`x \${y ? "p-1" : "p-2"} bg-popover\`;`;
  const lits = extractStrings(src).map((s) => s.text);
  ok(lits.includes("bg-card text-card-foreground") && lits.some((t) => t.includes("bg-popover")) && !lits.some((t) => t.includes("bg-red-500")), JSON.stringify(lits));
});

// ---- arquivos compartilhados: nenhuma violação nova ----
const shared = auditAll({ scope: "shared" });
check(`compartilhados (${shared.scanned} arquivos, ${shared.literals} literais): nenhuma violação CRITICA/ALTA/MEDIA fora das exceções documentadas`, () => {
  const bad = failing(shared.findings).filter((f) => !isExcepted(f));
  ok(bad.length === 0, `${bad.length} violação(ões):\n     ` + bad.map(fmt).join("\n     "));
});
check("exceções: cada uma tem motivo e providência, e ainda corresponde a uma violação real (sem exceção obsoleta)", () => {
  for (const e of CONTRAST_AUDIT_EXCEPTIONS) {
    ok(e.reason && e.reason.length >= 40, `exceção sem motivo/providência: ${e.file} ${e.classes}`);
    ok(failing(shared.findings).some((f) => isExcepted(f) && f.file === e.file), `exceção obsoleta (remova): ${e.file} ${e.classes}`);
  }
});

// ---- componentes base: classes COMPOSTAS (base do cva + variante) em todos os estados ----
function cvaParts(src) {
  const base = /cva\(\s*\n?\s*"([^"]+)"/.exec(src)?.[1];
  const block = /variant:\s*\{([\s\S]*?)\n\s*\},\n\s*size:/.exec(src)?.[1] ?? /variant:\s*\{([\s\S]*?)\n\s*\},\n\s*\},/.exec(src)?.[1];
  const variants = [...(block ?? "").matchAll(/^\s*([a-z]+):\s*"([^"]+)",?/gm)].map((m) => [m[1], m[2]]);
  return { base, variants };
}
for (const comp of ["button", "badge"]) {
  check(`componente base ${comp}: toda variante composta com a base cumpre o contraste em todos os estados`, () => {
    const { base, variants } = cvaParts(read(`components/ui/${comp}.tsx`));
    ok(base && variants.length >= 3, `não consegui extrair base/variantes de ${comp}.tsx`);
    const bad = [];
    for (const [name, v] of variants) for (const f of failing(auditClassString(`${base} ${v}`, `components/ui/${comp}.tsx`))) bad.push(`${name}: ${fmt(f)}`);
    ok(bad.length === 0, bad.join("\n     "));
  });
}
check("componente base tabs: base + (ativa | inativa | prominent) cumpre o contraste", () => {
  const src = read("components/ui/tabs.tsx");
  const base = /"(rounded-sm px-3 py-1[^"]+)"/.exec(src)?.[1];
  const states = ['bg-black text-white shadow-sm', 'bg-background text-foreground shadow-sm', 'text-muted-foreground hover:bg-accent hover:text-foreground'];
  ok(base && states.every((s) => src.includes(s)), "estrutura de tabs.tsx mudou: atualize este teste");
  const bad = states.flatMap((s) => failing(auditClassString(`${base} ${s}`, "components/ui/tabs.tsx")).map(fmt));
  ok(bad.length === 0, bad.join("\n     "));
});
check("componentes base input/textarea: placeholder, foco, desabilitado e erro presentes e legíveis", () => {
  for (const f of ["input", "textarea"]) {
    const src = read(`components/ui/${f}.tsx`);
    for (const must of ["placeholder:text-muted-foreground", "focus-visible:ring-", "aria-[invalid=true]:border-destructive", "disabled:bg-muted", "disabled:text-muted-foreground", "disabled:border-dashed"])
      ok(src.includes(must), `${f}.tsx sem "${must}"`);
    ok(!/disabled:opacity-(?:[0-4]\d|\d)\b/.test(src), `${f}.tsx: desabilitado não pode ficar < 50% de opacidade`);
  }
});

// ---- preservação dos selos aprovados (outros testes leem badges.tsx) ----
check("badges.tsx preserva os selos aprovados (ALTA amarelo #FFD600/preto, CRÍTICA #DC2626/branco, BAIXA #166534, MÉDIA #2563EB)", () => {
  const src = read("components/shared/badges.tsx");
  for (const must of ['ALTA: "border-transparent bg-[#FFD600] text-[#000000] font-bold"', 'CRITICA: "border-transparent bg-[#DC2626] text-[#FFFFFF] font-bold"', 'BAIXA: "border-transparent bg-[#166534] text-[#FFFFFF] font-bold"', 'MEDIA: "border-transparent bg-[#2563EB] text-[#FFFFFF] font-bold"'])
    ok(src.includes(must), `selo alterado: ${must}`);
});

console.log(`\nResultado: ${passed} OK, ${failed} falha(s).`);
process.exit(failed ? 1 : 0);
