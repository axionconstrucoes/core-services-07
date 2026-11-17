// Apelidos do Message-ID real (Gmail) -> gravado: só em memória, nunca sobrescreve outro caso. Sem rede.
import assert from "node:assert/strict";
import { register } from "node:module";
register("./ts-module-resolver.mjs", import.meta.url);
const { buildCorrelationIndex, applyMessageIdAliases } = await import("../apps/web/lib/risk-alerts/replies/build-correlation-index");
const { correlateReply, resolveReplyParticipant } = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log(`OK   ${name}`); };
const msgs = [
  { case_id: "case-A", message_id_header: "<gravado-a@axion.com.br>", reply_token_hash: null, direction: "OUTBOUND", status: "SENT", outbox_id: "ob-1" },
  { case_id: "case-B", message_id_header: "<gravado-b@axion.com.br>", reply_token_hash: null, direction: "OUTBOUND", status: "SENT", outbox_id: "ob-2" },
];
const build = () => buildCorrelationIndex(msgs, [], [], new Map([["ob-1", "user-1"], ["ob-2", "user-2"]]));
const headers = (inReplyTo, references = []) => ({ from: "x@axion.com.br", to: ["crm@axion.com.br"], cc: [], subject: "Re: alerta", messageId: "<resp@x>", inReplyTo, references });

ok("sem apelido, In-Reply-To com o Message-ID real não correlaciona", () => {
  const index = build();
  assert.equal(correlateReply(headers("<real-a@mail.gmail.com>"), "", index).caseId, null);
});
ok("com apelido, In-Reply-To real correlaciona ao caso e ao participante", () => {
  const index = build();
  assert.equal(applyMessageIdAliases(index, new Map([["<real-a@mail.gmail.com>", "<gravado-a@axion.com.br>"]])), 1);
  const r = correlateReply(headers("<real-a@mail.gmail.com>"), "", index);
  assert.equal(r.caseId, "case-A");
  assert.equal(r.method, "IN_REPLY_TO");
  assert.equal(resolveReplyParticipant(headers("<real-a@mail.gmail.com>"), index), "user-1");
  assert.ok(index.seenMessageIds.has("<real-a@mail.gmail.com>"));
});
ok("References com o real também correlaciona", () => {
  const index = build();
  applyMessageIdAliases(index, new Map([["real-b@mail.gmail.com", "gravado-b@axion.com.br"]]));
  assert.equal(correlateReply(headers(null, ["<real-b@mail.gmail.com>"]), "", index).caseId, "case-B");
});
ok("apelido que já aponta para outro caso não é sobrescrito", () => {
  const index = build();
  applyMessageIdAliases(index, new Map([["<gravado-b@axion.com.br>", "<gravado-a@axion.com.br>"]]));
  assert.equal(index.byMessageId.get("<gravado-b@axion.com.br>"), "case-B");
});
ok("apelido de Message-ID gravado desconhecido é ignorado", () => {
  const index = build();
  assert.equal(applyMessageIdAliases(index, new Map([["<real-x@mail.gmail.com>", "<nao-existe@axion.com.br>"]])), 0);
  assert.equal(index.byMessageId.has("<real-x@mail.gmail.com>"), false);
});
console.log(`\n${passed} OK, 0 falha(s)`);
