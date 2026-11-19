// Garante que e-mails SSMA (alerta e confirmação de resposta) usam o layout universal com os quatro botões HABILITADOS.
import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const c = await import("../apps/web/lib/ssma/field-notifications/content.ts");
const r = await import("../apps/web/lib/ssma/field-notifications/replies.ts");
const url = "https://acc.axion.com.br/p/ssma-registros";
const m = c.buildSsmaReplyConfirmationEmail({ projectName: "WEG", recipientName: "Carlos", category: "EPI", location: "Pátio", visibleCode: "AB12CD34",
  originalSubject: "RES: [RISCO ALTO] ACC", severity: "ALTA", statusLabel: r.ssmaStatusLabel("OTHER"), forecastLine: null, pendingLine: null, outOfOrder: false, accUrl: url });
let fail = 0;
const check = (n, f) => { try { f(); console.log("OK  ", n); } catch (e) { fail++; console.log("FAIL", n, e.message); } };
check("quatro botões na ordem, todos com link", () => {
  const order = ["RESOLVIDO", "EM ANDAMENTO", "ENVIAR PARA", "ESPECIALISTA"].map((b) => m.html.indexOf(b));
  assert.ok(order.every((i) => i > 0) && [...order].sort((a, b) => a - b).join() === order.join());
  assert.ok(!/disabled/i.test(m.html), "nenhum botão desativado");
  assert.ok(m.html.includes(`href="${url}"`));
});
check("cores padronizadas", () => { assert.ok(m.html.includes("#6B7280") && m.html.includes("#C2410C")); });
check("rótulo de status não reconhecido é orientativo", () => { assert.ok(!/sem status reconhecido/.test(m.html) && /previsão de conclusão/.test(m.html)); });
console.log(fail ? "FALHOU" : "TUDO OK"); process.exit(fail ? 1 : 0);
