// Testes offline do contrato de intenções operacionais por e-mail.
// Não usa Gmail, banco, rede nem envio de mensagens.
import { register } from "node:module";
import assert from "node:assert/strict";
register("./ts-module-resolver.mjs", import.meta.url);

const { assessOperationalEmailIntent } = await import("../apps/web/lib/risk-alerts/replies/operational-email-intent");
const { parseReplyBody } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");

const cases = [
  ["Concluído. Pendência resolvida.", "RESOLVE", true],
  ["Encaminho ao responsável da manutenção.", "TRANSFER", true],
  ["Temos um impedimento no fornecimento.", "BLOCKED", true],
  ["Segue evidência anexa.", "EVIDENCE", true],
  ["Em andamento.", "STATUS", false],
  ["Nova previsão de conclusão: 20/11/2026.", "FORECAST_UPDATE", false],
  ["Concluído e encaminhado ao gerente.", "UNDETERMINED", true],
  ["Recebido, obrigado.", "UNDETERMINED", false],
  ["", "UNDETERMINED", true],
];
for (const [message, intent, requiresReview] of cases) {
  const actual = assessOperationalEmailIntent(message);
  assert.equal(actual.intent, intent, message);
  assert.equal(actual.requiresReview, requiresReview, message);
}
const quoted = parseReplyBody("Em andamento.\n\nEm 17 nov 2026 escreveu:\n> Pendência resolvida.");
assert.equal(assessOperationalEmailIntent(quoted.clean).intent, "STATUS");
console.log(`OK — ${cases.length + 1} casos de intenção e histórico citado; nenhuma chamada externa`);
