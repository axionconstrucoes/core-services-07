// Estados da flag ACC_WEEKLY_REPORTS_ENABLED no Hover Text (ajuda contextual) do registro documental por e-mail.
// A flag é fail-closed: só o valor EXATO "true" liga. Este teste NÃO usa data fixa nem chama IA; lê o código real e usa a função real
// isWeeklyReportsEnabled com valores explícitos (ligada e desligada), sem depender do ambiente.
//
//   LIGADA    -> os elementos do registro por e-mail e do detalhe do e-mail estão no manifesto, o texto existe no catálogo, o ícone
//                está renderizado no código e as Server Actions de revisão aceitam a chamada (assertWeeklyReportsEnabled não lança).
//   DESLIGADA -> a aba "Registro por e-mail" não é montada em Documentos, a rota do e-mail responde "não encontrada" antes de qualquer
//                leitura, e as Server Actions lançam a mensagem padrão: logo nenhum desses elementos (nem seu ícone de ajuda) é exibido.
//
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-help-weekly-flag.mjs
import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const { ALL_HELP_MANIFESTS } = await import("../apps/web/lib/ui/help/manifests/index.ts");
const { isWeeklyReportsEnabled, assertWeeklyReportsEnabled, WEEKLY_REPORTS_DISABLED_MESSAGE, WEEKLY_REPORTS_FLAG_NAME } = await import(
  "../apps/web/lib/feature-flags/weekly-reports.ts"
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");
let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${error.message}`);
    failed += 1;
  }
};
const ok = (condition, message) => {
  if (!condition) throw new Error(message ?? "assertion failed");
};

const PAGE_DOCUMENTOS = read("apps/web/app/[projectId]/documentos/page.tsx");
const PAGE_EMAIL = read("apps/web/app/[projectId]/documentos/emails/[emailId]/page.tsx");
const ACTIONS = read("apps/web/app/[projectId]/documentos/emails/actions.ts");
const COMPONENT_FILES = [
  "apps/web/app/[projectId]/documentos/emails/[emailId]/page.tsx",
  "apps/web/components/documents/email-registry/email-registry-panel.tsx",
  "apps/web/components/documents/email-registry/email-registry-review-forms.tsx",
  "apps/web/components/documents/email-registry/weekly-report-workbook-section.tsx",
];
const COMPONENT_TEXT = COMPONENT_FILES.map(read).join("\n") + "\n" + PAGE_DOCUMENTOS;

const juridico = ALL_HELP_MANIFESTS.find((m) => m.module === "juridico");
const WEEKLY_ELEMENTS = juridico.elements.filter(
  (el) => (el.tab === "registro-email" && el.route === "/[projectId]/documentos") || (el.route === "/[projectId]/documentos/emails/[emailId]" && el.kind !== "page")
);

console.log(`\nFLAG ${WEEKLY_REPORTS_FLAG_NAME} — Hover Text do registro por e-mail\n`);

check("fail-closed: só o valor exato 'true' liga a flag (ausente, vazio, false, 1, TRUE e ' true' mantêm desligada)", () => {
  ok(isWeeklyReportsEnabled("true") === true, "'true' deveria ligar");
  for (const value of [undefined, "", "false", "1", "TRUE", " true", "yes"]) ok(isWeeklyReportsEnabled(value) === false, `valor ${JSON.stringify(value)} deveria manter desligada`);
});

check("LIGADA: o manifesto jurídico lista os elementos do registro por e-mail e do detalhe do e-mail, todos com helpId (sem lacuna)", () => {
  ok(WEEKLY_ELEMENTS.length >= 20, `esperado >= 20 elementos do bloco semanal, obtido ${WEEKLY_ELEMENTS.length}`);
  const semAjuda = WEEKLY_ELEMENTS.filter((el) => !el.helpId && !el.exempt);
  ok(semAjuda.length === 0, `elementos sem helpId: ${semAjuda.map((el) => el.label).join(" | ")}`);
  ok(!WEEKLY_ELEMENTS.some((el) => el.gap), "o bloco semanal não deve ter mais lacunas declaradas");
});

check("LIGADA: cada helpId do bloco existe no catálogo e está renderizado (<FeatureInfo helpId=...> ou mapa de ids) nos componentes do bloco", () => {
  const ids = [...new Set(WEEKLY_ELEMENTS.map((el) => el.helpId).filter(Boolean))];
  for (const id of ids) {
    ok(ACC_FEATURE_HELP[id], `${id} ausente do catálogo`);
    ok(COMPONENT_TEXT.includes(`"${id}"`), `${id} não é renderizado nos componentes do registro por e-mail`);
  }
});

check("LIGADA: o catálogo do bloco traz conteúdo real (permissão do administrador/gerente, justificativa mínima, fórmula da Curva S)", () => {
  const revisao = ACC_FEATURE_HELP["juridico.emails.revisao-humana"];
  ok(/ADMINISTRADOR/.test(revisao.permissions) && /10 caracteres/.test(revisao.description), "revisão humana deve citar permissão e justificativa mínima");
  const classificar = ACC_FEATURE_HELP["juridico.emails.confirmar-classificacao"];
  ok(/ADMINISTRADOR ou GERENTE/.test(classificar.permissions), "confirmar classificação exige ADMINISTRADOR ou GERENTE");
  const curva = ACC_FEATURE_HELP["juridico.emails.aba-curva-s"];
  ok(/realizado acumulado menos planejado acumulado/.test(curva.formula), "fórmula do desvio da Curva S ausente");
  const busca = ACC_FEATURE_HELP["juridico.registro-email.busca"];
  ok(/ACC_WEEKLY_REPORTS_ENABLED/.test(busca.validity), "a vigência deve declarar a dependência da flag");
});

check("LIGADA: as Server Actions de revisão aceitam a chamada (assertWeeklyReportsEnabled não lança com 'true')", () => {
  assertWeeklyReportsEnabled("true");
});

check("DESLIGADA: a aba Registro por e-mail só é montada quando isWeeklyReportsEnabled() é verdadeiro (trigger e conteúdo)", () => {
  ok(/const weeklyReportsEnabled = isWeeklyReportsEnabled\(\)/.test(PAGE_DOCUMENTOS), "Documentos deve ler a flag");
  ok(/weeklyReportsEnabled \? \(\s*<span[^>]*>\s*<TabsTrigger value="registro-email">/.test(PAGE_DOCUMENTOS), "TabsTrigger registro-email deve ser condicional à flag");
  ok(/weeklyReportsEnabled \? \(\s*<TabsContent value="registro-email">/.test(PAGE_DOCUMENTOS), "TabsContent registro-email deve ser condicional à flag");
  ok(/\.\.\.\(weeklyReportsEnabled \? \["registro-email"\] : \[\]\)/.test(PAGE_DOCUMENTOS), "aba inicial registro-email só vale com a flag ligada");
});

check("DESLIGADA: o ícone (i) da aba (documentos-tab-registro-email) está dentro do bloco condicional à flag", () => {
  const trigger = PAGE_DOCUMENTOS.indexOf('<TabsTrigger value="registro-email">');
  const hint = PAGE_DOCUMENTOS.indexOf('helpId="documentos-tab-registro-email"');
  const closing = PAGE_DOCUMENTOS.indexOf(") : null}", trigger);
  ok(closing > trigger, "ramo condicional não encontrado");
  ok(trigger > 0 && hint > trigger && hint < closing, "o ícone da aba precisa estar dentro do ramo condicional");
});

check("DESLIGADA: a rota do detalhe do e-mail responde 'não encontrada' (notFound) ANTES de qualquer leitura, sem renderizar ajuda", () => {
  const flagCheck = PAGE_EMAIL.indexOf("if (!isWeeklyReportsEnabled()) notFound();");
  const firstRead = PAGE_EMAIL.indexOf("getEmailDocumentDetail(projectId, emailId)");
  ok(flagCheck > 0, "a página deve chamar notFound() com a flag desligada");
  ok(flagCheck < firstRead, "o notFound() deve vir antes do carregamento dos dados");
});

check("DESLIGADA: as Server Actions de revisão lançam a mensagem padrão (nenhuma gravação possível)", () => {
  let thrown = null;
  try {
    assertWeeklyReportsEnabled(undefined);
  } catch (error) {
    thrown = error;
  }
  ok(thrown && thrown.message === WEEKLY_REPORTS_DISABLED_MESSAGE, "com a flag desligada deveria lançar WEEKLY_REPORTS_DISABLED_MESSAGE");
  const calls = (ACTIONS.match(/assertWeeklyReportsEnabled\(\)/g) ?? []).length;
  ok(calls >= 1 && /async function requireUser[\s\S]{0,200}assertWeeklyReportsEnabled\(\)/.test(ACTIONS), "requireUser deve chamar assertWeeklyReportsEnabled antes de qualquer ação");
});

check("DESLIGADA: a ajuda do bloco declara a dependência da flag (rota e aba inexistentes sem ela)", () => {
  ok(/ACC_WEEKLY_REPORTS_ENABLED/.test(ACC_FEATURE_HELP["juridico.emails.pagina"].howItWorks), "juridico.emails.pagina deve explicar o comportamento com a flag desligada");
  ok(/ACC_WEEKLY_REPORTS_ENABLED/.test(ACC_FEATURE_HELP["juridico.registro-email.busca"].validity), "a vigência do registro deve citar a flag");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam\n`);
process.exit(failed ? 1 : 0);
