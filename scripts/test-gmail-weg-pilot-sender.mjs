import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WEG_PILOT_PROJECT as P, WEG_PILOT_SENDER as S, pilotSenderMatches as matches, pilotSenderQuery as query } from "./lib/gmail-weg-pilot-sender.mjs";

assert.equal(matches(P, [S]), true);
assert.equal(matches(P, [S.toUpperCase()]), true);
assert.equal(matches(P, ["outra@weg.net"]), false);
assert.equal(matches(P, ["bruna.santelli@weg.net"]), false);
assert.equal(matches(P, []), false);
assert.equal(matches(P, [S, "outra@weg.net"]), false);
assert.equal(matches(P, ["bmancino@weg.net.exemplo"]), false);
assert.equal(matches("outro-projeto", ["outra@weg.net"]), true);
assert.equal(query(P), "from:bmancino@weg.net");
assert.equal(query("outro-projeto"), "");
for (const file of ["gmail-inbound-ingest.mjs", "gmail-inbound-sync.mjs"]) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  assert.ok(source.includes("pilotSenderQuery(PROJECT_ID)"));
  assert.ok(source.includes("!pilotSenderMatches(PROJECT_ID, policy.from)"));
}
console.log("14 verificações do filtro WEG: OK");
