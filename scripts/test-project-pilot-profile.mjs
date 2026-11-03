// Testes do perfil de e-mail do PROJETO PILOTO (remetente e destino fixos, sem CC/BCC, identificação PILOTO).
// Nenhuma chamada de rede: usa FakeEmailProvider (mesma cadeia de guardas do transporte real) e leitura estrutural do GmailEmailProvider.
//
// Uso: node scripts/test-project-pilot-profile.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const profileMod = await import("../apps/web/lib/email/project-pilot-profile");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const readiness = await import("../apps/web/lib/risk-alerts/pilot-readiness");
const { resolveProjectPilotProfile, applyProjectPilotProfile, assertPilotMimeRecipients, isProjectPilotMessage } = profileMod;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`OK   ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${error instanceof Error ? error.message : error}`);
  }
}
const assert = (cond, msg = "asserção falhou") => {
  if (!cond) throw new Error(msg);
};
const throwsEmail = async (fn, why) => {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof EmailSendError, `${why}: erro de tipo errado (${error?.name})`);
    return;
  }
  throw new Error(`${why}: deveria ter lançado EmailSendError`);
};

const PILOT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const REAL = "pessoa.real@exemplo.invalid";
const ENV = { ACC_PROJECT_PILOT_PROJECT_ID: PILOT, ACC_PROJECT_PILOT_DESTINATION: "axion@axion.com.br", ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br" };
const msg = (projectId, extra = {}) => ({
  to: REAL,
  subject: "Alerta de risco",
  text: "Corpo do alerta",
  html: "<html><body><p>Corpo do alerta</p></body></html>",
  correlationId: "corr-1",
  vera: { projectId, context: "alerta" },
  ...extra,
});

await check("sem a variável de projeto, nada muda (configured=false) e a mensagem volta intocada", () => {
  assert(resolveProjectPilotProfile({}).configured === false);
  const input = msg(PILOT);
  const r = applyProjectPilotProfile(input, {});
  assert(r.input === input && r.routed === false);
});

await check("configuração: UUID, destino e remetente só da lista fixa do código", () => {
  assert(resolveProjectPilotProfile(ENV).valid === true);
  assert(resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_PROJECT_ID: "nome-da-obra" }).valid === false, "nome no lugar do id");
  assert(resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_DESTINATION: REAL }).valid === false, "destino real");
  assert(resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_DESTINATION: "crm@axion.com.br" }).valid === false, "destino fora da lista");
  assert(resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_SENDER: REAL }).valid === false, "remetente real");
  assert(resolveProjectPilotProfile({ ...ENV, ACC_PROJECT_PILOT_SENDER: undefined }).valid === false, "remetente ausente");
});

await check("outro projeto e mensagem sem projeto voltam INTOCADOS (demais projetos sem alteração)", () => {
  const other = msg(OTHER);
  assert(applyProjectPilotProfile(other, ENV).input === other && !applyProjectPilotProfile(other, ENV).routed);
  const noProject = { ...msg(PILOT), vera: undefined };
  assert(applyProjectPilotProfile(noProject, ENV).input === noProject);
  assert(isProjectPilotMessage(msg(PILOT), ENV) && !isProjectPilotMessage(other, ENV));
});

await check("projeto piloto: Para = destino único; assunto, texto e HTML identificados como PILOTO com participante e nível", () => {
  const r = applyProjectPilotProfile(
    msg(PILOT, { pilot: { projectId: PILOT, participantLabel: "Responsável A", escalationLevel: "DIRETORIA" } }),
    ENV
  );
  assert(r.routed && r.sender === "crm@axion.com.br" && r.destination === "axion@axion.com.br");
  assert(r.input.to === "axion@axion.com.br");
  assert(r.input.subject.startsWith("[PILOTO] [DIRETORIA] "), r.input.subject);
  for (const body of [r.input.text, r.input.html]) {
    assert(body.includes("PILOTO") && body.includes("Participante simulado") && body.includes("Responsável A") && body.includes("DIRETORIA"));
    assert(!body.includes(REAL), "endereço real não pode aparecer");
  }
  assert(r.input.html.indexOf("data-acc-pilot") < r.input.html.indexOf("Corpo do alerta"), "faixa antes do conteúdo");
});

await check("cc/bcc injetados são removidos e rótulos com e-mail/quebra de linha são saneados", () => {
  const r = applyProjectPilotProfile(
    msg(PILOT, { cc: REAL, bcc: REAL, pilot: { participantLabel: `Fulano <${REAL}>\r\nBcc: ${REAL}`, escalationLevel: "ESCALAO_1" } }),
    ENV
  );
  assert(!("cc" in r.input) && !("bcc" in r.input));
  assert(!r.input.text.includes(REAL) && !/\r|Bcc:/.test(r.input.subject));
});

await check("escalonamentos, repetições e reenvios (mesmo conteúdo, níveis distintos) vão todos ao destino único, sem duplicar prefixos", () => {
  let subject = "[TESTE CONTROLADO] Alerta de risco";
  for (const level of ["T0 Responsável", "ESCALAO_1", "DIRETORIA", "TOP_LEVEL_REACHED", "REPETIÇÃO", "REENVIO"]) {
    const r = applyProjectPilotProfile(msg(PILOT, { subject, pilot: { escalationLevel: level, participantLabel: "P" } }), ENV);
    assert(r.input.to === "axion@axion.com.br");
    assert((r.input.subject.match(/\[PILOTO\]/g) ?? []).length === 1 && !r.input.subject.includes("TESTE CONTROLADO"), r.input.subject);
    const again = applyProjectPilotProfile({ ...r.input, vera: { projectId: PILOT } }, ENV); // reaplicar (reenvio de mensagem já tratada)
    assert((again.input.subject.match(/\[PILOTO\]/g) ?? []).length === 1, "prefixo duplicado no reenvio");
  }
});

await check("perfil inválido: mensagem do projeto piloto é RECUSADA (fail closed); outros projetos seguem", async () => {
  const bad = { ...ENV, ACC_PROJECT_PILOT_DESTINATION: REAL };
  await throwsEmail(() => applyProjectPilotProfile(msg(PILOT), bad), "destino real configurado");
  const other = msg(OTHER);
  assert(applyProjectPilotProfile(other, bad).input === other);
});

await check("FakeEmailProvider (mesma cadeia do transporte real): modo piloto global e modo produção chegam ao mesmo destino único", async () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, ENV, { ACC_PILOT_RECIPIENT: "crm@axion.com.br" });
    delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
    for (const mode of [undefined, "pilot", "production"]) {
      if (mode === undefined) delete process.env.ACC_OUTBOUND_MODE;
      else process.env.ACC_OUTBOUND_MODE = mode;
      let seen = null;
      const provider = new FakeEmailProvider({ onGuardedInput: (i) => (seen = i) });
      const result = await provider.send(msg(PILOT, { pilot: { participantLabel: "A", escalationLevel: "ESCALAO_1" } }));
      assert(seen.to === "axion@axion.com.br", `modo ${mode}: to=${seen.to}`);
      assert(result.from === "crm@axion.com.br", "remetente do piloto");
      assert(seen.subject.includes("[PILOTO]") && seen.text.includes("Participante simulado"));
      // outro projeto: continua como antes (produção => destinatário original; piloto global => crm)
      let other = null;
      await new FakeEmailProvider({ onGuardedInput: (i) => (other = i) }).send(msg(OTHER));
      assert(mode === "production" ? other.to === REAL : other.to === "crm@axion.com.br", `outro projeto, modo ${mode}: ${other.to}`);
      assert(!other.subject.includes("[PILOTO]") && !other.text.includes("Participante simulado"), "outro projeto não recebe faixa do piloto");
    }
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

await check("transporte final: conferência do MIME (Para único, From do piloto, nenhum Cc/Bcc)", async () => {
  const good = "From: \"ACC\" <crm@axion.com.br>\r\nTo: axion@axion.com.br\r\nSubject: x\r\n\r\ncorpo Cc: a@b.invalid";
  assertPilotMimeRecipients(good, "crm@axion.com.br", "axion@axion.com.br");
  const bad = [
    ["To: axion@axion.com.br, outra@exemplo.invalid", "dois destinatários"],
    ["To: axion@axion.com.br\r\nCc: outra@exemplo.invalid", "Cc"],
    ["To: axion@axion.com.br\r\nBcc: outra@exemplo.invalid", "Bcc"],
    ["To: axion@axion.com.br\r\nBCC: outra@exemplo.invalid", "BCC maiúsculo"],
    ["To: axion@axion.com.br\r\nResent-To: outra@exemplo.invalid", "Resent-To"],
    ["To: pessoa.real@exemplo.invalid", "Para real"],
    ["To: axion@axion.com.br,\r\n outra@exemplo.invalid", "Para dobrado em duas linhas"],
  ];
  for (const [tail, why] of bad) {
    await throwsEmail(() => assertPilotMimeRecipients(`From: <crm@axion.com.br>\r\n${tail}\r\nSubject: x\r\n\r\ncorpo`, "crm@axion.com.br", "axion@axion.com.br"), why);
  }
  await throwsEmail(() => assertPilotMimeRecipients("From: <outra@axion.com.br>\r\nTo: axion@axion.com.br\r\n\r\nx", "crm@axion.com.br", "axion@axion.com.br"), "From diferente");
});

await check("prontidão: perfil do piloto inválido para o projeto bloqueia o ciclo; sem perfil nada muda", () => {
  const base = {
    featureEnabled: true,
    config: { enabled: true, riskAlertsEnabled: true },
    providerConfigured: true,
    explicitRuleLevels: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    matrixStatuses: [],
    allowlistValid: true,
    projectConfirmed: true,
    workspaceConfigured: true,
    severityMapConfigured: true,
    replyMailboxConfigured: true,
    replyMailbox: "x@axion.com.br",
  };
  assert(readiness.evaluatePilotReadiness({ ...base, projectPilotProfileInvalid: true }).blockers.includes("PROJECT_PILOT_PROFILE_INVALID"));
  assert(readiness.blockerToSuppressionReason("PROJECT_PILOT_PROFILE_INVALID") === "PROVIDER_NOT_CONFIGURED");
  assert(readiness.evaluatePilotReadiness({ ...base, projectPilotProfileInvalid: false }).blockers.length === 0);
  assert(readiness.evaluatePilotReadiness(base).blockers.length === 0, "projeto sem perfil não muda");
});

await check("estrutural: o transporte real aplica o perfil, usa a identidade do piloto e confere o MIME antes da rede", () => {
  const gmail = read("apps/web/lib/email/gmail-email-provider.ts");
  assert(gmail.includes("applyProjectPilotProfile(applyPilotOutboundGuard(input))"));
  assert(gmail.includes("loadGmailPilotSenderConfig(routing.sender"), "identidade do remetente do piloto");
  assert(gmail.includes("this.config.senderEmail.trim().toLowerCase() !== routing.sender"), "usa a conta padrão quando ela já é o remetente do piloto");
  assert(gmail.indexOf("assertPilotMimeRecipients(") > 0 && gmail.indexOf("assertPilotMimeRecipients(") < gmail.indexOf("gmail.users.messages.send"), "conferência do MIME antes do envio");
  assert(!/this\.config\.(clientId|refreshToken)/.test(gmail), "credenciais devem vir da identidade escolhida");
  const auth = read("apps/web/lib/email/gmail-auth.ts");
  assert(auth.includes("loadGmailPilotSenderConfig") && auth.includes("sem fallback para o remetente padrão"));
  const fake = read("apps/web/lib/email/fake-email-provider.ts");
  assert(fake.includes("applyProjectPilotProfile(applyPilotOutboundGuard(input))"));
});

await check("estrutural: todo envio por provider.send carrega o projeto (vera.projectId ou pilot.projectId) — nenhum caminho escapa do perfil", () => {
  const libDir = path.join(root, "apps/web/lib");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name)) files.push(full);
    }
  };
  walk(libDir);
  const offenders = [];
  let calls = 0;
  for (const file of files) {
    if (/gmail-email-provider|fake-email-provider/.test(file)) continue;
    const src = readFileSync(file, "utf8");
    const re = /(?:getEmailProvider\(\)|provider|ctx\.provider)\.send\(\{/g;
    let m;
    while ((m = re.exec(src))) {
      calls += 1;
      const window = src.slice(m.index, m.index + 1800);
      const end = window.indexOf("\n    });") > 0 ? window.indexOf("\n    });") : window.length;
      const block = window.slice(0, end);
      if (!/vera:\s*\{\s*projectId/.test(block) && !/pilot:\s*\{\s*projectId/.test(block)) offenders.push(path.relative(root, file));
    }
  }
  assert(calls >= 10, `poucas chamadas encontradas (${calls})`);
  assert(offenders.length === 0, `envio sem projeto: ${offenders.join(", ")}`);
});

await check("três participantes simulados na MESMA caixa: cada mensagem mantém seu participante, nível e correlação (sem fusão)", async () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, ENV, { ACC_OUTBOUND_MODE: "production" });
    delete process.env.ACC_EMAIL_ONLY_RECIPIENT;
    const levels = [
      ["Responsável (usuário aaaa1111)", "RESPONSAVEL"],
      ["Gestor (usuário bbbb2222)", "ESCALAO_1"],
      ["Diretoria (usuário cccc3333)", "DIRETORIA"],
    ];
    const seen = [];
    for (const [i, [participantLabel, escalationLevel]] of levels.entries()) {
      await new FakeEmailProvider({ onGuardedInput: (g) => seen.push(g) }).send(
        msg(PILOT, { to: `logico${i}@exemplo.invalid`, correlationId: `corr-${i}`, pilot: { projectId: PILOT, participantLabel, escalationLevel } })
      );
    }
    assert(seen.length === 3 && seen.every((g) => g.to === "axion@axion.com.br"), "todas na caixa do piloto");
    assert(new Set(seen.map((g) => g.correlationId)).size === 3, "correlação distinta por mensagem");
    levels.forEach(([label, level], i) => {
      assert(seen[i].text.includes(label) && seen[i].text.includes(level) && seen[i].subject.includes(`[${level}]`), `participante/nível da mensagem ${i}`);
      for (const [j, [otherLabel]] of levels.entries()) if (j !== i) assert(!seen[i].text.includes(otherLabel), `mensagem ${i} não pode citar o participante ${j}`);
    });
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});

await check("OAuth do remetente do piloto: só variáveis GOOGLE_GMAIL_PILOT_*, só remetente da lista fixa, só salva se a conta autenticada for a caixa", () => {
  const oauth = read("scripts/gmail-pilot-sender-oauth.mjs");
  const literal = profileMod.PROJECT_PILOT_ALLOWED_SENDERS.map((s) => JSON.stringify(s)).join(", ");
  assert(oauth.includes(`const ALLOWED_SENDERS = [${literal}]`), "lista de remetentes espelhada");
  assert(oauth.includes('setEnvValue("GOOGLE_GMAIL_PILOT_REFRESH_TOKEN"') && oauth.includes('setEnvValue("GOOGLE_GMAIL_PILOT_SENDER_EMAIL"'));
  assert(!oauth.includes('setEnvValue("GOOGLE_GMAIL_REFRESH_TOKEN"') && !oauth.includes('setEnvValue("GOOGLE_GMAIL_SENDER_EMAIL"'), "não toca no envio padrão");
  const check = oauth.indexOf("account !== mailbox");
  assert(check > 0 && check < oauth.indexOf('setEnvValue("GOOGLE_GMAIL_PILOT_REFRESH_TOKEN"'), "confere a conta antes de salvar");
  assert(!/console\.log\([^)]*tokens\.refresh_token/.test(oauth), "não exibe o token");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed > 0 ? 1 : 0);
