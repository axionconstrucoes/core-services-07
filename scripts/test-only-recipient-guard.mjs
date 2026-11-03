// Trava opcional de destino único (ACC_EMAIL_ONLY_RECIPIENT): atua depois da guarda do piloto e antes de qualquer
// rede; sem a variável, nada muda. Nenhuma rede, nenhum e-mail real.
// Uso: node --import ./scripts/lib/block-live-ai.mjs scripts/test-only-recipient-guard.mjs

import { readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const { assertOnlyRecipient, ONLY_RECIPIENT_ENV } = await import("../apps/web/lib/email/only-recipient-guard");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error.message}`);
  }
}
const ok = (c, m) => {
  if (!c) throw new Error(m);
};
const throwsWith = (fn, text) => {
  try {
    fn();
  } catch (e) {
    ok(String(e.message).includes(text), `mensagem inesperada: ${e.message}`);
    return;
  }
  throw new Error("deveria lançar");
};
const mail = (to) => ({ to, subject: "TESTE", text: "t", correlationId: "c1" });
const quiet = () => {};

await check("sem a variável: não interfere (produção inalterada)", () => {
  const input = mail("qualquer@exemplo.com");
  ok(assertOnlyRecipient(input, {}, quiet) === input, "deveria devolver o mesmo input");
  ok(assertOnlyRecipient(input, { [ONLY_RECIPIENT_ENV]: "  " }, quiet) === input, "vazio deveria ser ignorado");
});

await check("com a variável: libera só o destino exato (sem diferenciar maiúsculas) e confirma no log", () => {
  const lines = [];
  const env = { [ONLY_RECIPIENT_ENV]: "CRM@axion.com.br" };
  assertOnlyRecipient(mail("crm@axion.com.br"), env, (m) => lines.push(m));
  assertOnlyRecipient(mail(" Crm@Axion.com.br "), env, (m) => lines.push(m));
  ok(lines.length === 2 && lines.every((l) => l.includes("crm@axion.com.br") && l.includes("liberado")), `log: ${lines}`);
});

await check("com a variável: qualquer outro destino é BLOQUEADO antes da rede", () => {
  const env = { [ONLY_RECIPIENT_ENV]: "crm@axion.com.br" };
  for (const to of ["outro@axion.com.br", "crm@axion.com.br.evil.com", "crm@axion.com.br, outro@axion.com.br", "xcrm@axion.com.br", ""]) {
    throwsWith(() => assertOnlyRecipient(mail(to), env, quiet), "bloqueado antes de qualquer chamada de rede");
  }
});

await check("valor inválido da variável também bloqueia (fail closed)", () => {
  for (const bad of ["crm", "a@b", "a@b.com, c@d.com", "<x@y.com>"]) throwsWith(() => assertOnlyRecipient(mail("crm@axion.com.br"), { [ONLY_RECIPIENT_ENV]: bad }, quiet), "inválido");
});

await check("a mensagem de bloqueio não vaza endereços nem conteúdo", () => {
  try {
    assertOnlyRecipient({ ...mail("segredo@cliente.com"), subject: "ASSUNTO SIGILOSO", text: "corpo sigiloso" }, { [ONLY_RECIPIENT_ENV]: "crm@axion.com.br" }, quiet);
  } catch (e) {
    ok(!/segredo@|SIGILOSO|sigiloso|crm@/.test(e.message), `vazou: ${e.message}`);
    return;
  }
  throw new Error("deveria lançar");
});

await check("encadeado ao piloto: destino qualquer vira crm@ (guarda do piloto) e passa pela trava; sem piloto configurado, bloqueia", async () => {
  const keys = ["ACC_OUTBOUND_MODE", "ACC_PILOT_RECIPIENT", ONLY_RECIPIENT_ENV];
  const previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    process.env.ACC_OUTBOUND_MODE = "pilot";
    process.env.ACC_PILOT_RECIPIENT = "crm@axion.com.br";
    process.env[ONLY_RECIPIENT_ENV] = "crm@axion.com.br";
    let seen = null;
    await new FakeEmailProvider({ onGuardedInput: (i) => (seen = i) }).send(mail("colaborador.real@cliente.com"));
    ok(seen && seen.to === "crm@axion.com.br", `destino efetivo: ${seen?.to}`);
    ok(seen.subject.startsWith("[TESTE CONTROLADO]"), "prefixo do piloto ausente");
    // Se alguém configurar a trava para outro endereço, o envio é recusado mesmo com o piloto ativo.
    process.env[ONLY_RECIPIENT_ENV] = "outro@axion.com.br";
    let blocked = false;
    try {
      await new FakeEmailProvider().send(mail("colaborador.real@cliente.com"));
    } catch {
      blocked = true;
    }
    ok(blocked, "deveria ter bloqueado");
  } finally {
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
  }
});

await check("o provider do Gmail aplica a trava ANTES de credenciais, MIME e rede", () => {
  const src = readFileSync(path.join(root, "apps/web/lib/email/gmail-email-provider.ts"), "utf8");
  const guard = src.indexOf("assertOnlyRecipient(applyVeraEmailHeader(applyPilotOutboundGuard(input)))");
  ok(guard > 0, "trava não aplicada no provider do Gmail");
  ok(guard < src.indexOf("google.auth.OAuth2") && guard < src.indexOf("messages.send"), "a trava precisa vir antes de credenciais e rede");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
