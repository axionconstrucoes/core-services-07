// Convergência de TODOS os caminhos de envio de e-mail para a trava do piloto (grupo WEG_INTERNAL_FOUR).
// Sem rede: cadeia real de guardas via FakeEmailProvider + montagem do MIME final. Nenhum e-mail é enviado.
//
// Uso: node scripts/test-pilot-send-paths-convergence.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);

const profileMod = await import("../apps/web/lib/email/project-pilot-profile");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { buildMimeMessage } = await import("../apps/web/lib/email/mime-message");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEG = "00000000-0000-4000-8000-000000000001";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FOUR = ["crm@axion.com.br", "reynaldo@axion.com.br", "jaime.ramos@axion.com.br", "carlos.evandro@axion.com.br"];

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

const ENV_KEYS = ["ACC_OUTBOUND_MODE", "ACC_PILOT_RECIPIENT", "ACC_PILOT_ADDITIONAL_RECIPIENTS", "ACC_EMAIL_ONLY_RECIPIENT", "ACC_PROJECT_PILOT_PROJECT_ID", "ACC_PROJECT_PILOT_DESTINATION", "ACC_PROJECT_PILOT_SENDER", "ACC_PROJECT_PILOT_TEST_GROUP", "GOOGLE_GMAIL_INBOUND_MAILBOX"];
async function withEnv(values, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
  try {
    return await fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

const GROUP_ENV = { ACC_PILOT_RECIPIENT: "crm@axion.com.br", ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_DESTINATION: "axion@axion.com.br", ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br", ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" };

const base = (over = {}) => ({
  to: "cliente.externo@weg.net",
  subject: "Alerta de risco",
  text: "Corpo do alerta",
  html: "<html><body><p>Corpo do alerta</p></body></html>",
  correlationId: "conv-1",
  ...over,
});

async function sendThroughChain(input) {
  let guarded = null;
  const provider = new FakeEmailProvider({ onGuardedInput: (g) => (guarded = g) });
  await provider.send(input);
  return guarded;
}
function headersOf(mime) {
  const block = mime.split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, " ");
  const map = new Map();
  for (const line of block.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) map.set(line.slice(0, i).toLowerCase(), [...(map.get(line.slice(0, i).toLowerCase()) ?? []), line.slice(i + 1).trim()]);
  }
  return map;
}
const addrs = (v) => (v ?? []).flatMap((x) => x.match(/[^\s<>",;]+@[^\s<>",;]+/g) ?? []).map((a) => a.toLowerCase());

// --- 1. Transporte único (estrutural) ------------------------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(name)) continue;
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name) && !/(^|[\\/])test-/.test(name) && !/\.test\./.test(name)) out.push(full);
  }
  return out;
}
const sources = [...walk(path.join(root, "apps")), ...walk(path.join(root, "scripts")), ...walk(path.join(root, "packages"))];
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

await check("só existe UM transporte real: users.messages.send fica exclusivamente em gmail-email-provider.ts", () => {
  const hits = sources.filter((f) => /users\.messages\.(send|insert|import)|users\.drafts\.send/.test(stripComments(readFileSync(f, "utf8"))));
  const rel = hits.map((f) => path.relative(root, f).replace(/\\/g, "/"));
  assert(rel.length === 1 && rel[0] === "apps/web/lib/email/gmail-email-provider.ts", `transportes encontrados: ${rel.join(", ")}`);
});

await check("nenhum outro cliente de e-mail (SMTP, SendGrid, Resend, Mailgun, SES, Postmark) é usado no código", () => {
  const pattern = /nodemailer|createTransport|api\.sendgrid|@sendgrid|api\.resend\.com|from ["']resend["']|api\.mailgun|@aws-sdk\/client-ses|postmark/i;
  const hits = sources.filter((f) => pattern.test(stripComments(readFileSync(f, "utf8")))).map((f) => path.relative(root, f));
  assert(hits.length === 0, `clientes de e-mail alternativos: ${hits.join(", ")}`);
});

await check("os dois providers aplicam applyPilotOutboundGuard → applyProjectPilotProfile → assertOnlyRecipient e conferem o MIME", () => {
  for (const file of ["apps/web/lib/email/gmail-email-provider.ts", "apps/web/lib/email/fake-email-provider.ts"]) {
    const src = stripComments(readFileSync(path.join(root, file), "utf8"));
    const guardAt = src.indexOf("applyPilotOutboundGuard(");
    const profileAt = src.indexOf("applyProjectPilotProfile(");
    const onlyAt = src.indexOf("assertOnlyRecipient(");
    const mimeAt = src.indexOf("buildMimeMessage(");
    const assertAt = src.indexOf("assertPilotMimeRecipients(");
    assert(guardAt > -1 && profileAt > -1 && onlyAt > guardAt && mimeAt > onlyAt && assertAt > -1, `${file}: ordem das travas incorreta`);
  }
});

await check("todo remetente de aplicação usa getEmailProvider()/EmailProvider (nenhum atalho para o Gmail)", () => {
  const importers = sources.filter((f) => /gmail-email-provider["']/.test(stripComments(readFileSync(f, "utf8"))));
  const rel = importers.map((f) => path.relative(root, f).replace(/\\/g, "/"));
  const allowed = new Set(["apps/web/lib/email/get-email-provider.ts"]);
  const extra = rel.filter((f) => !allowed.has(f));
  assert(extra.length === 0, `importam o provider do Gmail diretamente: ${extra.join(", ")}`);
});

await check("WhatsApp é simulado (nenhum provider real de mensagens fora do e-mail)", () => {
  const src = readFileSync(path.join(root, "apps/web/lib/whatsapp/simulated-provider.ts"), "utf8");
  assert(/simulad/i.test(src) && !/fetch\(|graph\.facebook|twilio/i.test(stripComments(src)), "provider de WhatsApp não é puramente simulado");
});

// --- 2. Comportamento do grupo (cadeia real, MIME final) ---------------------------------------------------------------------------
for (const mode of [undefined, "production"]) {
  await check(`WEG com grupo: To exato nas quatro caixas, sem Cc/Bcc/Resent, From=crm, PILOTO — ACC_OUTBOUND_MODE=${mode ?? "(ausente)"}`, () =>
    withEnv({ ...GROUP_ENV, ...(mode ? { ACC_OUTBOUND_MODE: mode } : {}) }, async () => {
      const guarded = await sendThroughChain(base({ pilot: { projectId: WEG }, cc: "externo.cc@weg.net", bcc: "externo.bcc@fornecedor.com" }));
      const mime = buildMimeMessage(guarded, "crm@axion.com.br", "<conv@axion.invalid>");
      const h = headersOf(mime);
      assert(JSON.stringify([...addrs(h.get("to"))].sort()) === JSON.stringify([...FOUR].sort()), `To=${addrs(h.get("to"))}`);
      for (const f of ["cc", "bcc", "resent-to", "resent-cc", "resent-bcc"]) assert(!h.has(f), `cabeçalho ${f} presente`);
      assert(addrs(h.get("from")).join() === "crm@axion.com.br", "From diferente do remetente do piloto");
      assert(/\[PILOTO\]/.test(guarded.subject), "assunto sem [PILOTO]");
      assert(guarded.text.includes("PILOTO — TESTE CONTROLADO"), "corpo sem rótulo PILOTO");
      assert(!/externo|weg\.net|fornecedor/i.test(mime.split(/\r?\n\r?\n/, 1)[0]), "endereço externo vazou para os cabeçalhos");
    }));
}

await check("destinatário externo na linha To é bloqueado/substituído: nunca chega ao MIME do grupo", () =>
  withEnv(GROUP_ENV, async () => {
    const guarded = await sendThroughChain(base({ pilot: { projectId: WEG }, to: "diretor@weg.net, outro@fornecedor.com" }));
    const mime = buildMimeMessage(guarded, "crm@axion.com.br", "<x@axion.invalid>");
    assert(!/weg\.net|fornecedor/i.test(mime.split(/\r?\n\r?\n/, 1)[0]), "To original vazou");
    const { assertPilotMimeRecipients } = profileMod;
    const tampered = mime.replace(/^To: .*$/m, "To: crm@axion.com.br, reynaldo@axion.com.br, jaime.ramos@axion.com.br, carlos.evandro@axion.com.br, diretor@weg.net");
    let blocked = false;
    try {
      assertPilotMimeRecipients(tampered, "crm@axion.com.br", FOUR.join(", "));
    } catch (e) {
      blocked = e instanceof EmailSendError;
    }
    assert(blocked, "conferência final aceitou um quinto destinatário externo");
  }));

await check("injeção de cabeçalho (CRLF + Bcc/Cc no assunto e no Para) não cria destinatários", () =>
  withEnv(GROUP_ENV, async () => {
    const guarded = await sendThroughChain(base({ pilot: { projectId: WEG }, subject: "Alerta\r\nBcc: externo@weg.net\r\nCc: x@weg.net" }));
    const mime = buildMimeMessage(guarded, "crm@axion.com.br", "<x@axion.invalid>");
    const h = headersOf(mime);
    assert(!h.has("bcc") && !h.has("cc"), "cabeçalho injetado");
    assert(!addrs(h.get("to")).concat(addrs(h.get("from"))).some((a) => !FOUR.includes(a)), "endereço fora da lista em To/From");
  }));

await check("Reply-To externo/arbitrário é removido; só a caixa inbound oficial pode permanecer", () =>
  withEnv({ ...GROUP_ENV, GOOGLE_GMAIL_INBOUND_MAILBOX: "axion@axion.com.br" }, async () => {
    const guarded = await sendThroughChain(base({ pilot: { projectId: WEG }, replyTo: "atacante@weg.net" }));
    assert(!guarded.replyTo, "Reply-To externo permaneceu");
    const mime = buildMimeMessage(guarded, "crm@axion.com.br", "<x@axion.invalid>");
    assert(!/atacante|weg\.net/i.test(mime), "Reply-To externo no MIME");
  }));

await check("mensagem de outro projeto ou sem projeto NÃO usa o grupo: em modo piloto vai só para crm@", () =>
  withEnv(GROUP_ENV, async () => {
    for (const input of [base({ pilot: { projectId: OTHER } }), base()]) {
      const guarded = await sendThroughChain(input);
      assert(guarded.to === "crm@axion.com.br", `destino=${guarded.to}`);
    }
  }));

await check("grupo inválido ou fora da WEG falha fechado antes de MIME/rede", async () => {
  for (const patch of [{ ACC_PROJECT_PILOT_TEST_GROUP: "OUTRO" }, { ACC_PROJECT_PILOT_PROJECT_ID: OTHER }, { ACC_PROJECT_PILOT_SENDER: "reynaldo@axion.com.br" }]) {
    await withEnv({ ...GROUP_ENV, ...patch }, async () => {
      let blocked = false;
      try {
        await sendThroughChain(base({ pilot: { projectId: patch.ACC_PROJECT_PILOT_PROJECT_ID ?? WEG } }));
      } catch (e) {
        blocked = e instanceof EmailSendError;
      }
      assert(blocked, `não bloqueou com ${JSON.stringify(patch)}`);
    });
  }
});

await check("sem a variável do grupo: comportamento anterior preservado (destino institucional único)", () =>
  withEnv({ ...GROUP_ENV, ACC_PROJECT_PILOT_TEST_GROUP: "" }, async () => {
    const guarded = await sendThroughChain(base({ pilot: { projectId: WEG } }));
    assert(guarded.to === "axion@axion.com.br", `destino=${guarded.to}`);
  }));

await check("ACC_EMAIL_ONLY_RECIPIENT=crm@ não bloqueia o grupo da WEG, mas continua prendendo os demais projetos", () =>
  withEnv({ ...GROUP_ENV, ACC_EMAIL_ONLY_RECIPIENT: "crm@axion.com.br" }, async () => {
    const weg = await sendThroughChain(base({ pilot: { projectId: WEG } }));
    assert(weg.to.split(",").length === 4, "grupo não liberado pela trava global");
    const other = await sendThroughChain(base({ pilot: { projectId: OTHER } }));
    assert(other.to === "crm@axion.com.br", "outro projeto escapou da trava global");
  }));

// --- 3. Respostas -------------------------------------------------------------------------------------------------------------------
await check("respostas (função LEGADA authorizePilotMailboxReply, não usada no grupo; ver test-pilot-group-reply.mjs): só a caixa remetente do piloto (crm@) é aceita como resposta do piloto; as outras três NÃO são atribuídas ao participante simulado", () => {
  const mailbox = withEnvSync(GROUP_ENV, () => profileMod.resolveProjectPilotReplyMailbox(WEG));
  assert(mailbox === "crm@axion.com.br", `caixa=${mailbox}`);
  const ctx = (sender) => ({ senderEmail: sender, pilotMailbox: mailbox, correlationMethod: "REPLY_TO_TOKEN", participantUserId: "u1", participant: { userId: "u1", active: true, membershipStatus: "ACTIVE" }, alertRecipientUserIds: ["u1"], allowlistUserIds: ["u1"], authenticationResults: null });
  const ok = pipeline.authorizePilotMailboxReply(ctx("crm@axion.com.br"));
  assert(ok.authorized === true, "resposta do crm@ não autorizada");
  for (const sender of ["reynaldo@axion.com.br", "jaime.ramos@axion.com.br", "carlos.evandro@axion.com.br", "externo@weg.net"]) {
    const r = pipeline.authorizePilotMailboxReply(ctx(sender));
    assert(r.authorized === false, `${sender} atribuído indevidamente`);
  }
});

function withEnvSync(values, fn) {
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, values);
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
if (failed > 0) process.exit(1);
