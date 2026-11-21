// Fase 5/A: o piloto WEG aceita QUALQUER participante @weg.net (From, To, Cc, Bcc) — não só o remetente único.
// As travas de ENVIO (only-recipient-guard / pilot-outbound-guard) não pertencem a este arquivo e seguem testadas à parte.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  WEG_PILOT_PROJECT as P, pilotMessageEligible as eligible, pilotScopeBypass as bypass, pilotSenderMatches as matches,
  pilotSenderQuery as query, pilotSenderTerms as terms,
} from "./lib/gmail-weg-pilot-sender.mjs";

const S = "bmancino@weg.net";
assert.equal(matches(P, [S]), true);
assert.equal(matches(P, [S.toUpperCase()]), true);
assert.equal(matches(P, ["outra@weg.net"]), true);
assert.equal(matches(P, ["externo@outro.net"]), false);
assert.equal(matches(P, []), false);
assert.equal(matches(P, [S, "outra@weg.net"]), true, "vários @weg.net: continua aceito");
assert.equal(matches(P, ["externo@outro.net", S]), true, "um participante @weg.net basta");
assert.equal(matches(P, ["bmancino@weg.net.exemplo"]), false);
assert.equal(matches(P, ["a@xweg.net"]), false);
assert.equal(matches(P, ["a@sub.weg.net"]), true, "subdomínio legítimo");
assert.equal(matches(P, ["a@a.b.weg.net"]), true);
assert.equal(matches(P, ["a@evilweg.net", "a@weg.net.evil.com", "a@weg.net.", "a@.weg.net", "a@weg.network"]), false);
assert.equal(matches("outro-projeto", ["outra@weg.net"]), true);
assert.equal(query(P), "{from:weg.net to:weg.net cc:weg.net bcc:weg.net}");
assert.equal(terms(P, "from:x.com"), "from:weg.net to:weg.net cc:weg.net bcc:weg.net");
assert.equal(terms("outro-projeto", "from:x.com"), "from:x.com", "outros projetos mantêm o filtro padrão");
assert.equal(query("outro-projeto"), "");
for (const file of ["gmail-inbound-ingest.mjs", "gmail-inbound-sync.mjs"]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.ok(source.includes("pilotSenderQuery(PROJECT_ID)"));
  assert.ok(source.includes("pilotSenderTerms("), `${file}: filtro por remetente do domínio não foi substituído no piloto`);
  assert.ok(source.includes("!pilotMessageEligible(PROJECT_ID, policy)"));
  assert.ok(source.includes("pilotScopeBypass(PROJECT_ID)"), `${file}: o piloto não pode depender de palavra-chave`);
}
// Remetente de fora, destinatário/cópia/cópia oculta @weg.net: elegível. Ninguém @weg.net: não.
assert.equal(eligible(P, { eligible: false, from: [S], recipients: [] }), true);
assert.equal(eligible(P, { eligible: false, from: ["a@axion.com.br"], recipients: ["x@weg.net"] }), true, "enviada para @weg.net");
assert.equal(eligible(P, { eligible: false, from: ["a@axion.com.br"], recipients: ["b@outro.com"], cc: ["c@weg.net"] }), true, "cópia @weg.net");
assert.equal(eligible(P, { eligible: false, from: ["a@axion.com.br"], recipients: ["b@outro.com"], bcc: ["c@weg.net"] }), true, "cópia oculta @weg.net");
assert.equal(eligible(P, { eligible: true, from: ["externo@outro.net"], recipients: ["x@cliente.com"] }), false);
assert.equal(eligible("outro-projeto", { eligible: false, from: [S], recipients: [] }), false);
assert.equal(eligible("outro-projeto", { eligible: true, from: [], recipients: [] }), true);
assert.equal(bypass(P), true);
assert.equal(bypass("outro-projeto"), false);
console.log("32 verificações do filtro WEG (qualquer participante): OK");
