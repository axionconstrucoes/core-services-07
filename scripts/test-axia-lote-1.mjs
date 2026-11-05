// Lote 1 do Q&A (20 entradas aprovadas): cada pergunta e variação deve cair na entrada certa, citar a seção do manual,
// e perguntas das 18 entradas em revisão NÃO podem ser respondidas por entrada do lote. Sem rede.
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { answerQuestion } = await import("../apps/web/lib/assistant/answer");
const { APPROVED_BATCH_1_ENTRIES, APPROVED_BATCH_1_IDS } = await import("../apps/web/lib/assistant/approved-batch-1");
const { qaFixturesEnabled, OFFICIAL_ADMIN_CHANNEL } = await import("../apps/web/lib/assistant/qa-handoff");
let ok = 0, bad = 0;
const t = (n, c) => (c ? (ok++, console.log("OK  ", n)) : (bad++, console.log("FAIL", n)));
const P = "obra-teste", ENV = {};
const CASES = {
  N2: ["Como entro no ACC e escolho a obra?", "login: não consigo entrar", "como troco de obra?"],
  N7: ["Onde fica o tutorial e como falo com a AXIA?", "onde está o manual", "a AXIA fala?"],
  N8: ["O que é a faixa SISTEMA EM TESTE?", "faixa de teste"],
  R1: ["O que significam os graus de risco?", "o que é crítico", "diferença entre alto e médio", "critérios de risco"],
  R3: ["Como o sistema sugere o grau?", "por que o grau ficou indeterminado", "o que a sugestão considera"],
  R4: ["De onde nasce um risco?", "como o contrato vira alerta", "quando a pessoa precisa revisar um candidato a cláusula"],
  R5: ["O que acontece com cláusula ambígua?", "e se o OCR parcial?", "o que acontece com falta de prazo?"],
  R7: ["O prazo vale também para médio e baixo?", "prazo para médio e baixo"],
  E1: ["Qual a diferença entre os dois mecanismos de escalonamento?", "o que é escalonar", "escalonamento e lembrete são a mesma coisa?"],
  E2: ["Como o alerta sobe de nível?", "quando o alerta sobe para a Diretoria?", "como sobe de nível o alerta"],
  E3: ["O que é Limite de escalonamento atingido?", "limite atingido"],
  E4: ["O que muda se eu responder o alerta?", "o que acontece ao responder alerta com tomando providências"],
  E7: ["E se não houver Nível 2?", "destinatário não cadastrado", "sem destinatário no alerta"],
  E9: ["O que faz o botão Verificar escalonamentos?", "por que aparece 0 escaladas"],
  X1: ["Quais especialistas existem?", "o que é Experts IA", "o que faz o CEO IA"],
  X2: ["Quando uso a AXIA e quando abro um especialista?", "quando usar um especialista"],
  X3: ["A AXIA consulta os especialistas?", "a AXIA lê os dados da obra?"],
  X4: ["O especialista altera dados ou envia e-mails?", "o especialista grava alguma coisa?"],
  X5: ["Quem pode consultar um especialista?", "perfil Leitura pode consultar especialista?"],
  X6: ["Como confiro a resposta de um especialista?", "o que são fontes utilizadas?"],
};
t("20 IDs aprovados, sem duplicata", APPROVED_BATCH_1_IDS.length === 20 && new Set(APPROVED_BATCH_1_IDS).size === 20 && APPROVED_BATCH_1_ENTRIES.length === 20);
for (const id of APPROVED_BATCH_1_IDS) {
  for (const q of CASES[id] ?? []) {
    const a = answerQuestion(q, P, ENV);
    t(`${id} <- "${q}" (obteve ${a.entryId})`, a.entryId === `qa-${id}`);
  }
  const a = answerQuestion(CASES[id][0], P, ENV);
  t(`${id}: cita a seção do manual, cobertura completa, link da Ajuda/módulo`, !!a.manualSection && a.coverage === "completa" && a.links.length > 0 && a.links.every((l) => l.href.startsWith(`/${P}/`)));
}
// Entradas em revisão: não podem ser respondidas por entrada do lote
const REVIEW = ["Quais são os perfis e o que cada um pode fazer?", "Por que não vejo uma aba do menu?", "Quem define o grau de risco?",
  "Qual o prazo para agir em cada grau?", "Quanto tempo depois do vencimento chega o aviso?", "O que são os lembretes Repete a cada N dias?",
  "Onde se configura a Matriz de SLA?", "O que o Consultor Jurídico consegue ler?", "As consultas jurídicas ficam guardadas?",
  "O que mostra o Dashboard?", "Como encontro um evento na Timeline?"];
for (const q of REVIEW) {
  const a = answerQuestion(q, P, ENV);
  t(`em revisão não é respondida por entrada do lote: "${q}" (obteve ${a.entryId})`, !a.entryId.startsWith("qa-"));
}
// Pendentes que o texto genérico antigo respondia errado ou fora do tema: agora vão ao encaminhamento
for (const q of ["Qual o prazo para agir em cada grau?", "Como configuro a matriz de SLA?", "Quais são os perfis e o que cada um pode fazer?", "Qual a diferença entre Gerente e Colaborador?"]) {
  const a = answerQuestion(q, P, ENV);
  t(`pendente vai ao encaminhamento: "${q}" (obteve ${a.entryId})`, a.entryId === "fallback" && a.coverage === "ausente");
}
const cno = answerQuestion("Como funciona o prazo do CNO?", P, ENV);
t("pergunta fora das pendentes continua respondida (prazo do CNO)", cno.entryId !== "fallback");
// Sem resposta aprovada: encaminhamento
const none = answerQuestion("Qual a previsão do tempo em Marte?", P, ENV);
t("sem resposta: fallback, cobertura ausente, link da Ajuda", none.entryId === "fallback" && none.coverage === "ausente" && none.links.some((l) => l.href === `/${P}/ajuda`));
t("sem resposta: orientação ao ADMIN só em texto (canal oficial pendente), sem link", none.adminHandoff.mode === "text" && none.adminHandoff.href === null && OFFICIAL_ADMIN_CHANNEL === null);
t("fixtures e example.invalid fora de produção", qaFixturesEnabled({}) === false && !JSON.stringify(none).includes("example.invalid"));
const all = JSON.stringify(APPROVED_BATCH_1_ENTRIES);
t("lote real não contém example.invalid nem [TESTE]", !all.includes("example.invalid") && !all.includes("[TESTE]"));
console.log(`\n${ok} OK, ${bad} FAIL`);
process.exit(bad ? 1 : 0);
