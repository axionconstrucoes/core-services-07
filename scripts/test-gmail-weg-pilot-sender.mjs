import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEG_PILOT_PROJECT as P, pilotMessageEligible as eligible, pilotSenderMatches as matches, pilotSenderQuery as query } from "./lib/gmail-weg-pilot-sender.mjs";

const S = "bmancino@weg.net";
assert.equal(matches(P, [S]), true);
assert.equal(matches(P, [S.toUpperCase()]), true);
assert.equal(matches(P, ["outra@weg.net"]), true);
assert.equal(matches(P, ["externo@outro.net"]), false);
assert.equal(matches(P, []), false);
assert.equal(matches(P, [S, "outra@weg.net"]), false);
assert.equal(matches(P, ["bmancino@weg.net.exemplo"]), false);
assert.equal(matches("outro-projeto", ["outra@weg.net"]), true);
assert.equal(query(P), "from:weg.net");
assert.equal(query("outro-projeto"), "");
for (const file of ["gmail-inbound-ingest.mjs", "gmail-inbound-sync.mjs"]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.ok(source.includes("pilotSenderQuery(PROJECT_ID)"));
  assert.ok(source.includes("!pilotMessageEligible(PROJECT_ID, policy)"));
}
assert.equal(eligible(P, { eligible: false, from: [S] }), true);
assert.equal(eligible(P, { eligible: true, from: ["externo@outro.net"] }), false);
assert.equal(eligible("outro-projeto", { eligible: false, from: [S] }), false);
assert.equal(eligible("outro-projeto", { eligible: true, from: [] }), true);
console.log("18 verificações do filtro WEG: OK");
