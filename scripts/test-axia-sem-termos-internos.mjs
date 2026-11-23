// AXIA/base por aba/manual: nenhum texto voltado ao usuario final pode expor detalhes internos de
// migrations, ondas, banco, versoes ou plano de implantacao. Varre (1) a base por aba (todos os campos, exceto
// `fontes`, que sao caminhos de codigo), (2) todas as entradas da AXIA (knowledge + lote 1) e (3) o manual publicado
// (exceto o cabecalho tecnico e as linhas "Fontes:"). Falha se algum termo interno aparecer.
// Tambem garante que o texto de SLA nao afirma numeros de Medio/Baixo como vigentes em toda obra.
// Sem rede, sem IA, sem e-mail. Uso: node scripts/test-axia-sem-termos-internos.mjs
import { register } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let ok = 0, bad = 0;
const t = (nome, cond, detalhe = "") => { if (cond) { ok++; console.log("OK  ", nome); } else { bad++; console.log("FAIL", nome, detalhe); } };

const { ITENS_CONHECIMENTO: ITENS } = await import("../apps/web/lib/assistant/abas/index");
const { ASSISTANT_ENTRIES } = await import("../apps/web/lib/assistant/knowledge");
const { APPROVED_BATCH_1_ENTRIES } = await import("../apps/web/lib/assistant/approved-batch-1");

const norm = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PROIBIDOS = [
  [/migration/, "migration"], [/migrat/, "migrat"], [/\bonda /, "onda "], [/ainda nao foi aplicada/, "ainda nao foi aplicada"],
  [/20261121/, "20261121"], [/banco de producao/, "banco de producao"], [/implantacao/, "implantacao"], [/\bsql\b/, "SQL"], [/script/, "script"],
];
const achados = (textos) => {
  const r = [];
  for (const { onde, texto } of textos) for (const [re, nome] of PROIBIDOS) if (re.test(norm(texto))) r.push(`${onde}: "${nome}"`);
  return r;
};
// percorre strings/arrays/objetos, ignorando a chave `fontes` (caminhos de codigo, nao e texto de usuario)
function coletar(valor, onde, out = []) {
  if (typeof valor === "string") out.push({ onde, texto: valor });
  else if (Array.isArray(valor)) valor.forEach((v, i) => coletar(v, `${onde}[${i}]`, out));
  else if (valor && typeof valor === "object") for (const [k, v] of Object.entries(valor)) if (k !== "fontes") coletar(v, `${onde}.${k}`, out);
  return out;
}

const base = ITENS.flatMap((i) => coletar(i, `base:${i.id}`));
const entradas = [...ASSISTANT_ENTRIES, ...APPROVED_BATCH_1_ENTRIES].flatMap((e) => coletar({ title: e.title, summary: e.summary, steps: e.steps }, `axia:${e.id}`));
const manualTxt = readFileSync(path.join(root, "docs", "manual", "manual-usuario-acc.md"), "utf8");
const manual = manualTxt.split(/\r?\n/).map((l, i) => ({ l, i: i + 1 }))
  .filter(({ l }) => !l.startsWith("**Fontes:**") && !l.startsWith("> Arquivo GERADO"))
  .map(({ l, i }) => ({ onde: `manual:L${i}`, texto: l }));

t("a varredura cobre base, entradas da AXIA e manual", base.length > 500 && entradas.length > 100 && manual.length > 2000, `${base.length}/${entradas.length}/${manual.length}`);
for (const [nome, textos] of [["base por aba", base], ["entradas da AXIA", entradas], ["manual do usuario", manual]]) {
  const a = achados(textos);
  t(`${nome}: sem termos internos (migration, onda, banco de producao, implantacao, SQL, script)`, a.length === 0, a.slice(0, 5).join(" | "));
}
// o detector de fato detecta
t("detector: pega 'migration' e 'banco de producao'", achados([{ onde: "x", texto: "a migration ainda nao foi aplicada no banco de produção" }]).length >= 3);

// SLA: nada de numeros de Medio/Baixo como vigentes em toda obra; Critico/Alto continuam firmes
const slaTxt = norm([...base, ...entradas, ...manual].map((x) => x.texto).join("\n"));
t("SLA: sem 'medio 2 dias' / 'baixo 5 dias' nem 'politica aprovada (2 e 5'", !/medio:? 2 dias|baixo:? 5 dias|politica aprovada \(2 e 5|10 dias uteis em baixo|4 dias uteis em medio/.test(slaTxt));
const e2 = APPROVED_BATCH_1_ENTRIES.find((e) => e.id === "qa-E2"), e1 = APPROVED_BATCH_1_ENTRIES.find((e) => e.id === "qa-E1");
t("SLA: qa-E1/qa-E2 mantem Critico 1 hora corrida e Alto 4 horas uteis", [e1, e2].every((e) => /Crítico[^;.]{0,6}1 hora corrida/.test(`${e.summary} ${e.steps.join(" ")}`) && /Alto[^;.]{0,6}4 horas úteis/.test(`${e.summary} ${e.steps.join(" ")}`)));
t("SLA: qa-E1/qa-E2 remetem Medio/Baixo a Matriz de SLA da obra", [e1, e2].every((e) => /Matriz de SLA configurada para a obra/.test(`${e.summary} ${e.steps.join(" ")}`)));

console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
