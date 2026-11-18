// Regressão do detector de tensão relacional: não cria riscos contratuais nem altera SLAs.
import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { assessRelationalMessage } = await import("../apps/web/lib/email/relational-risk/assess-relational-message.ts");

const input = (bodyText, overrides = {}) => ({
  subject: "Acompanhamento da obra", bodyText,
  direction: "INBOUND", senderRole: "CLIENT", ...overrides,
});
let passed = 0;
function check(label, verify) {
  verify();
  passed++;
  console.log("OK", label);
}
check("preocupação intensa sugere atenção, não classificação ALTO automática", () => {
  const x = assessRelationalMessage(input("Estamos seriamente preocupados com o andamento da obra."));
  assert.equal(x.tension, "ATTENTION");
  assert.equal(x.suggestedContractRisk, "REVIEW_REQUIRED");
  assert.equal(x.signals[0].kind, "EXPLICIT_CONCERN");
});
check("reiteração textual requer prova do histórico", () => {
  const x = assessRelationalMessage(input("Reiteramos o que já pedimos anteriormente."));
  assert.equal(x.needsConversationHistory, true);
  assert.equal(x.tension, "ATTENTION");
});
check("reiteração confirmada com histórico eleva tensão relacional", () => {
  const x = assessRelationalMessage(input("Reiteramos o que já solicitamos anteriormente.", {priorExternalRequests: 2}));
  assert.equal(x.tension, "HIGH_ATTENTION");
  assert.equal(x.needsConversationHistory, false);
});
check("decepção e cobrança agressiva são sinais de atenção elevada", () => {
  const x = assessRelationalMessage(input("Estamos decepcionados. Exigimos providências imediatas."));
  assert.equal(x.tension, "HIGH_ATTENTION");
  assert.equal(x.signals.length, 2);
});
check("ameaça formal não vira CRITICAL sem cláusula", () => {
  const x = assessRelationalMessage(input("Caso não atendam, adotaremos as medidas contratuais cabíveis."));
  assert.equal(x.tension, "HIGH_ATTENTION");
  assert.equal(x.suggestedContractRisk, "REVIEW_REQUIRED");
});
check("mensagem neutra não é falsamente elevada", () => {
  const x = assessRelationalMessage(input("Solicitamos atualização do cronograma até sexta-feira."));
  assert.equal(x.tension, "NONE");
  assert.equal(x.status, "NO_SIGNAL");
});
check("e-mail interno e mensagem de saída não são avaliados", () => {
  for (const o of [{senderRole: "INTERNAL"}, {direction: "OUTBOUND"}, {senderRole: "UNKNOWN"}]) {
    assert.equal(assessRelationalMessage(input("Estamos seriamente preocupados.",o)).status, "NOT_ASSESSED");
  }
});
check("histórico citado não gera falso positivo", () => {
  const x = assessRelationalMessage(input("Segue resposta.\nOn Monday, Alice wrote:\nEstamos seriamente preocupados."));
  assert.equal(x.tension, "NONE");
});
check("sem corpo não inventa risco", () => {
  const x = assessRelationalMessage(input(null));
  assert.equal(x.status, "NOT_ASSESSED");
});
check("inglês e fornecedor são reconhecidos", () => {
  const x = assessRelationalMessage(input("We are disappointed.", {senderRole: "SUPPLIER"}));
  assert.equal(x.tension, "HIGH_ATTENTION");
});
console.log(`RESULTADO: ${passed} testes concluídos`);
