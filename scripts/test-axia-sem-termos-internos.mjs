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
  [/20261121/, "20261121"], [/banco de producao/, "banco de producao"], [/implantacao/, "implantacao"], [/\bsql\b/, "SQL"], [/\bscripts?\b/, "script"],
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


// ───────── Ampliação: textos de ajuda das telas (lib/ui/help) e termos de processo interno ─────────
// Varre o código-fonte dos textos de ajuda (legacy, manifests, modules), ignorando linhas de comentário.
// "implantação" só é permitida nos usos de produto: selo "Em implantação" do hub de especialistas e a disciplina de obra
// "implantação e terraplenagem". Termos de processo interno (Fase N, frente X, homologação, roteiro, sessão autenticada) também falham.
import { readdirSync } from "node:fs";
const helpRoot = path.join(root, "apps", "web", "lib", "ui", "help");
const arquivosHelp = [path.join(helpRoot, "legacy.ts"), ...["manifests", "modules"].flatMap((d) => readdirSync(path.join(helpRoot, d)).filter((f) => f.endsWith(".ts")).map((f) => path.join(helpRoot, d, f)))];
const helpTextos = arquivosHelp.flatMap((f) => readFileSync(f, "utf8").split(/\r?\n/).map((l, i) => ({ onde: `help:${path.relative(helpRoot, f)}:L${i + 1}`, texto: l }))
  .filter(({ texto }) => !/^\s*(\/\/|\*|\/\*)/.test(texto)));
// "implantacao" em ajuda e produto (checklist de implantacao da obra, selo "Em implantacao"); so falha plano/onda de implantacao.
const PROIBIDOS_HELP = PROIBIDOS.filter(([, n]) => n !== "implantacao").concat([[/plano de implantacao|onda de implantacao|implantacao d[ao]s? migra/, "plano de implantacao"]]);
const INTERNOS_EXTRA = [[/\bfase [0-9]/, "Fase N"], [/\bfrente [a-e]\s*[\).,;:]/, "frente X"], [/homolog/, "homolog"], [/roteiro (pil|al|d|g|q)-\d/, "roteiro (homologacao)"], [/migra[cç]/, "migra"], [/\bonda\b/, "onda"], [/publicada hoje|em producao/, "configuracao publicada em producao"], [/2026\d{10}/, "id de migration"]];
const SESSAO_AUT = [/sessao autenticada/, "sessao autenticada"];
const achadosHelp = [];
for (const { onde, texto } of helpTextos) {
  const n = norm(texto);
  for (const [re, nome] of [...PROIBIDOS_HELP, ...INTERNOS_EXTRA]) if (re.test(n)) achadosHelp.push(`${onde}: "${nome}"`);
  if (/(medio|baixo)\s+(2|5|1|3)\s+dias?|(2|5) dias uteis/.test(n) && /sla|prazo|assum|matriz/.test(n)) achadosHelp.push(`${onde}: numero de Medio/Baixo`);
}
t("ajuda das telas: sem termos internos nem prazos de Medio/Baixo afirmados", achadosHelp.length === 0, achadosHelp.slice(0, 8).join(" | "));
t("ajuda das telas: varredura cobre os modulos", helpTextos.length > 8000, String(helpTextos.length));

// Base por aba e manual: mesmos termos de processo interno (ev/statusRoteiro/situacao/fontes sao metadados internos nao exibidos)
const usuarioBase = ITENS.flatMap((i) => coletar({ ...i, evidenciaSituacao: undefined, statusRoteiro: undefined, situacao: undefined }, `base:${i.id}`));
const achadosExtra = [];
for (const { onde, texto } of [...usuarioBase, ...entradas, ...manual]) {
  const n = norm(texto);
  for (const [re, nome] of [...INTERNOS_EXTRA, SESSAO_AUT]) if (re.test(n) && nome !== "migra" && nome !== "onda") achadosExtra.push(`${onde}: "${nome}"`);
  if (/\bintegrad[oa]s? a esta base|ainda nao foi integrad/.test(n)) achadosExtra.push(`${onde}: "ainda nao foi integrada"`);
}
t("base/AXIA/manual: sem Fase N, frente X, homologacao, roteiro, sessao autenticada", achadosExtra.length === 0, achadosExtra.slice(0, 8).join(" | "));
t("detector de ajuda: pega 'Fase 6' e 'migration 20261121177000'", /fase [0-9]/.test(norm("antes da Fase 6")) && /2026\d{10}/.test("migration 20261121177000"));

// ───────── Telas: avisos visiveis ao usuario (apps/web/app e apps/web/components) ─────────
// Varre .tsx/.ts ignorando comentarios (linha e bloco) e falha se uma LINHA de texto visivel (JSX/strings) citar migration/migrac,
// "onda", "pendencia de banco" ou "Fase N". Comentarios e nomes de funcoes/tabelas no codigo nao entram (linhas de comentario sao descartadas).
function arquivosTela(dir, acc = []) {
  for (const nome of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) arquivosTela(p, acc);
    else if (/\.(tsx|ts)$/.test(nome.name)) acc.push(p);
  }
  return acc;
}
function semComentarios(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).split(/\r?\n/).map((l) => l.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"));
}
const TELA_PROIBIDOS = [[/migration|migrac|migrad/, "migration"], [/\bonda /, "onda"], [/ainda nao foi aplicada|nao foi aplicada|ainda nao aplicada/, "nao foi aplicada"], [/pendencia de banco/, "pendencia de banco"], [/\bfases? [0-9]/, "Fase N"]];
const achadosTela = [];
for (const base of ["app", "components"]) {
  for (const f of arquivosTela(path.join(root, "apps", "web", base))) {
    const rel = path.relative(root, f);
    semComentarios(readFileSync(f, "utf8")).forEach((l, i) => {
      // so linhas que parecem texto/string visivel: contem letras acentuadas/espacos em literal ou JSX; descarta linhas de codigo puro com identificadores
      if (!/["'`>]/.test(l) && !/^\s+[A-Za-zÀ-ú]/.test(l)) return;
      const n = norm(l);
      for (const [re, nome] of TELA_PROIBIDOS) if (re.test(n)) achadosTela.push(`${rel}:L${i + 1}: "${nome}"`);
    });
  }
}
t("telas: nenhum texto visivel cita migration/onda/'nao foi aplicada'/pendencia de banco/Fase N", achadosTela.length === 0, achadosTela.slice(0, 8).join(" | "));
t("detector de telas: pega aviso com migration", TELA_PROIBIDOS.some(([re]) => re.test(norm("<p>Recurso indisponivel (migration pendente).</p>"))));
console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
