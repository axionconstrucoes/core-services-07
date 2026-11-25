// Identidade do remetente — endurecimento (P2+): (a) só o Authentication-Results do TOPO (servidor que recebeu) pode dar
// aceitação — um cabeçalho "mx.google.com" abaixo dele (forjado pelo remetente) nunca aceita sozinho e conflito continua
// recusando; (b) o From é o endereço REAL entre "<>" (nome de exibição com e-mail de terceiro não vale; vários remetentes
// => vazio); (c) Reply-To/Sender/corpo/Subject nunca influenciam a autenticação; (d) texto "mx.google.com" no corpo é inócuo.
// Sem rede, banco ou e-mail. Uso: node scripts/test-email-sender-identity-hardening.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const auth = await import("../apps/web/lib/email-replies/sender-authentication");
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { extractFromAddress, extractInboundFromGmail } = await import("../apps/web/lib/risk-alerts/replies/gmail-reply-extract");

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message ?? "assertion failed");
}
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0].slice(0, 400)}`);
    failed += 1;
  }
}

const FROM = "maria.silva@axion.com.br";
const REAL_PASS = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google; spf=pass smtp.mailfrom=maria.silva@axion.com.br; dmarc=pass (p=QUARANTINE) header.from=axion.com.br";
const REAL_NONE = "mx.google.com; spf=none smtp.mailfrom=maria.silva@axion.com.br; dmarc=none header.from=axion.com.br";
const REAL_FAIL = "mx.google.com; dmarc=fail (p=NONE) header.from=axion.com.br";
const FORGED_PASS = "mx.google.com; dkim=pass header.d=axion.com.br; dmarc=pass header.from=axion.com.br";
const verify = (ar, extra = {}) => auth.verifySenderAuthentication({ fromEmail: FROM, authenticationResults: ar, ...extra });

await check("1. Cabeçalho do topo com pass => aceito (fluxo legítimo inalterado)", () => {
  assert(verify(REAL_PASS).ok === true);
  assert(verify([REAL_PASS, "attacker.example; dmarc=fail header.from=axion.com.br"].join("\n")).ok === true, "não confiável abaixo é ignorado");
});
await check("2. Forjado 'mx.google.com' ABAIXO do real sem pass (dmarc=none) NÃO aceita", () => {
  const r = verify([REAL_NONE, FORGED_PASS].join("\n"));
  assert(r.ok === false && r.reason === "AUTH_NOT_ALIGNED", JSON.stringify(r));
});
await check("3. Forjado 'mx.google.com' abaixo do real com fail => AUTH_FAILED (conflito nunca vira aceitação)", () => {
  assert(verify([REAL_FAIL, FORGED_PASS].join("\n")).reason === "AUTH_FAILED");
  assert(verify([FORGED_PASS, REAL_FAIL].join("\n")).reason === "AUTH_FAILED", "ordem inversa também recusa");
});
await check("4. Fallback do locatário também só vale no cabeçalho do topo", () => {
  const tenant = "mx.google.com; dkim=pass header.i=@axion-com-br.20230601.gappssmtp.com; spf=pass smtp.mailfrom=maria.silva@axion.com.br";
  assert(verify([REAL_NONE, tenant].join("\n"), { workspaceTenantDomains: ["axion.com.br"] }).ok === false, "forjado abaixo");
  assert(verify(tenant, { workspaceTenantDomains: ["axion.com.br"] }).ok === true, "no topo");
});
await check("5. Authentication-Results de cabeçalho dobrado/quebra de linha injetada no valor não cria cabeçalho novo", () => {
  const r = extractInboundFromGmail({ id: "m1", payload: { headers: [{ name: "From", value: FROM }, { name: "Authentication-Results", value: "attacker.example; spf=none\r\n mx.google.com; dmarc=pass header.from=axion.com.br" }], body: { data: "" } } }, "crm@axion.com.br");
  assert(!/\n/.test(r.headers.authenticationResults), "um único valor, sem quebra de linha");
  assert(verify(r.headers.authenticationResults).ok === false, "o authserv-id é o primeiro token (attacker.example)");
});
await check("6. From: nome de exibição com e-mail de terceiro não vale; usa o endereço entre '<>'", () => {
  assert(extractFromAddress('"maria.silva@axion.com.br" <externo@evil.com>') === "externo@evil.com");
  assert(extractFromAddress("maria.silva@axion.com.br <externo@evil.com>") === "externo@evil.com");
  assert(extractFromAddress("Maria Silva <Maria.Silva@AXION.com.br>") === "maria.silva@axion.com.br");
  assert(extractFromAddress("maria.silva@axion.com.br") === "maria.silva@axion.com.br");
  assert(extractFromAddress('"Silva, Maria (Obra)" <maria.silva@axion.com.br>') === "maria.silva@axion.com.br");
});
await check("7. From com vários remetentes ou sem endereço => vazio (recusado como não corporativo)", () => {
  assert(extractFromAddress("a@axion.com.br, b@axion.com.br") === "");
  assert(extractFromAddress("A <a@axion.com.br>, B <b@evil.com>") === "");
  assert(extractFromAddress("") === "" && extractFromAddress(null) === "");
  const base = { senderEmail: "", profile: null, membershipStatus: null, alertRecipientUserIds: [], allowlistUserIds: [], activeForwardToUserId: null, corporateDomain: "axion.com.br", authenticationResults: REAL_PASS };
  assert(pipeline.authorizeReply(base).reason === "NOT_CORPORATE");
});
await check("8. Spoof de nome de exibição ponta a ponta: remetente real externo nunca autoriza o usuário interno", () => {
  const msg = extractInboundFromGmail({ id: "m2", payload: { headers: [{ name: "From", value: '"maria.silva@axion.com.br" <externo@evil.com>' }, { name: "Authentication-Results", value: "mx.google.com; dmarc=pass header.from=evil.com" }], body: { data: "" } } }, "crm@axion.com.br");
  assert(msg.headers.from === "externo@evil.com");
  const r = pipeline.authorizeReply({ senderEmail: msg.headers.from, profile: { userId: "u1", email: FROM, active: true }, membershipStatus: "ACTIVE", alertRecipientUserIds: ["u1"], allowlistUserIds: ["u1"], activeForwardToUserId: null, corporateDomain: "axion.com.br", authenticationResults: msg.headers.authenticationResults });
  assert(r.authorized === false && r.reason === "NOT_CORPORATE", JSON.stringify(r));
});
await check("9. Reply-To, Sender, Subject e corpo com 'mx.google.com; dmarc=pass' não alteram a autenticação", () => {
  const msg = extractInboundFromGmail({
    id: "m3",
    payload: {
      headers: [
        { name: "From", value: FROM },
        { name: "Reply-To", value: "Authentication-Results: mx.google.com; dmarc=pass header.from=axion.com.br <x@evil.com>" },
        { name: "Sender", value: "mx.google.com; dmarc=pass header.from=axion.com.br" },
        { name: "Subject", value: "mx.google.com; dmarc=pass header.from=axion.com.br" },
      ],
      mimeType: "text/plain",
      body: { data: Buffer.from("Authentication-Results: mx.google.com; dmarc=pass header.from=axion.com.br\nRESOLVIDO").toString("base64url") },
    },
  }, "crm@axion.com.br");
  assert(msg.headers.authenticationResults === null, "sem cabeçalho real => nulo");
  assert(verify(msg.headers.authenticationResults).reason === "AUTH_RESULTS_MISSING");
});
await check("10. Alinhamento From x d=: subdomínio do From alinha; domínio-irmão/sufixo/oposto não", () => {
  const v = (d) => verify(`mx.google.com; dkim=pass header.d=${d}`).ok;
  assert(v("axion.com.br") && v("mail.axion.com.br"));
  assert(!v("evil.com") && !v("axion.com.br.evil.com") && !v("com.br") && !v("notaxion.com.br"));
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
