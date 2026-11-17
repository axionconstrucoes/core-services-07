// Convergência de TODOS os caminhos de envio de e-mail para o MODELO DE ENTREGA DIRETA do piloto WEG:
//   To = o próprio colaborador (Reynaldo, Jaime ou Carlos Evandro) · Cc = acc@axion.com.br SEMPRE · Remetente = acc@ (ou participante
//   autorizado e autenticado) · axion@axion.com.br proibido em qualquer cabeçalho de destinatário.
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
const credsMod = await import("../apps/web/lib/email/gmail-pilot-credentials");
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEG = "00000000-0000-4000-8000-000000000001";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ACC = "acc@axion.com.br";
const BOX = "axion@axion.com.br"; // PROIBIDO
const REY = "reynaldo@axion.com.br";
const JAIME = "jaime.ramos@axion.com.br";
const CARLOS = "carlos.evandro@axion.com.br";
const PARTS = [REY, JAIME, CARLOS];

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
async function rejects(fn, re, msg) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof EmailSendError, `${msg}: erro não é EmailSendError (${error?.message})`);
    if (re) assert(re.test(error.message), `${msg}: mensagem inesperada (${error.message})`);
    return;
  }
  throw new Error(`${msg}: não bloqueou`);
}

const ENV_KEYS = [
  "ACC_OUTBOUND_MODE", "ACC_PILOT_RECIPIENT", "ACC_PILOT_ADDITIONAL_RECIPIENTS", "ACC_EMAIL_ONLY_RECIPIENT", "ACC_PROJECT_PILOT_PROJECT_ID",
  "ACC_PROJECT_PILOT_DESTINATION", "ACC_PROJECT_PILOT_SENDER", "ACC_PROJECT_PILOT_TEST_GROUP", "ACC_PROJECT_PILOT_AUTHORIZED_SENDERS",
  "GOOGLE_GMAIL_INBOUND_MAILBOX",
];
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

const PILOT_ENV = { ACC_PILOT_RECIPIENT: "crm@axion.com.br", ACC_PROJECT_PILOT_PROJECT_ID: WEG, ACC_PROJECT_PILOT_SENDER: ACC, GOOGLE_GMAIL_INBOUND_MAILBOX: ACC };

const base = (over = {}) => ({
  to: REY,
  subject: "Alerta de risco",
  text: "Corpo do alerta",
  html: "<html><body><p>Corpo do alerta</p></body></html>",
  correlationId: "conv-1",
  pilot: { projectId: WEG },
  ...over,
});

async function sendThroughChain(input, options = {}) {
  let guarded = null;
  const provider = new FakeEmailProvider({ onGuardedInput: (g) => (guarded = g), ...options });
  const result = await provider.send(input);
  return { guarded, result };
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

await check("os dois providers roteiam por prepareOutboundMessage (perfil do piloto → guarda global) → assertOnlyRecipient → MIME → conferência do MIME final", () => {
  for (const file of ["apps/web/lib/email/gmail-email-provider.ts", "apps/web/lib/email/fake-email-provider.ts"]) {
    const src = stripComments(readFileSync(path.join(root, file), "utf8"));
    const routeAt = src.indexOf("prepareOutboundMessage(");
    const onlyAt = src.indexOf("assertOnlyRecipient(");
    const mimeAt = src.indexOf("buildMimeMessage(");
    const assertAt = src.indexOf("assertPilotMimeRecipients(");
    assert(routeAt > -1 && onlyAt > routeAt && mimeAt > onlyAt && assertAt > onlyAt, `${file}: ordem das travas incorreta`);
  }
  const routing = stripComments(readFileSync(path.join(root, "apps/web/lib/email/outbound-routing.ts"), "utf8"));
  assert(routing.indexOf("applyProjectPilotProfile(") > -1 && routing.indexOf("applyProjectPilotProfile(") < routing.indexOf("applyPilotOutboundGuard("), "perfil do piloto precisa vir ANTES da guarda global");
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

await check("axion@axion.com.br NÃO aparece em nenhuma lista de roteamento do código de produção (só como endereço PROIBIDO)", () => {
  const prod = sources.filter((f) => f.replace(/\\/g, "/").includes("/apps/web/lib/") || f.replace(/\\/g, "/").includes("/apps/web/app/"));
  const offenders = [];
  for (const f of prod) {
    const code = stripComments(readFileSync(f, "utf8"));
    if (!code.includes("axion@axion.com.br")) continue;
    const rel = path.relative(root, f).replace(/\\/g, "/");
    if (rel !== "apps/web/lib/email/project-pilot-profile.ts") offenders.push(rel);
  }
  assert(offenders.length === 0, `axion@ referenciado em: ${offenders.join(", ")}`);
  const prof = stripComments(readFileSync(path.join(root, "apps/web/lib/email/project-pilot-profile.ts"), "utf8"));
  assert(/PILOT_FORBIDDEN_ADDRESSES\s*=\s*\[\s*"axion@axion\.com\.br"\s*\]/.test(prof), "axion@ precisa estar apenas na lista PROIBIDA");
});

// --- 2. Entrega direta com Cc institucional (cadeia real, MIME final) --------------------------------------------------------------
for (const mode of [undefined, "production"]) {
  for (const participant of PARTS) {
    await check(`ACC → ${participant}: To = o colaborador, Cc = acc@, From = acc@ (institucional), sem Bcc/Resent, PILOTO — ACC_OUTBOUND_MODE=${mode ?? "(ausente)"}`, () =>
      withEnv({ ...PILOT_ENV, ...(mode ? { ACC_OUTBOUND_MODE: mode } : {}) }, async () => {
        const { guarded, result } = await sendThroughChain(base({ to: participant, cc: ["externo.cc@weg.net"], bcc: "externo.bcc@fornecedor.com" }));
        const mime = buildMimeMessage(guarded, ACC, "<conv@axion.invalid>");
        const h = headersOf(mime);
        assert(addrs(h.get("to")).join() === participant, `To=${addrs(h.get("to"))}`);
        assert(addrs(h.get("cc")).join() === ACC, `Cc=${addrs(h.get("cc"))}`);
        for (const f of ["bcc", "resent-to", "resent-cc", "resent-bcc"]) assert(!h.has(f), `cabeçalho ${f} presente`);
        assert(addrs(h.get("from")).join() === ACC && /ACC AXION CONTROLE DE CONTRATOS/.test(h.get("from")[0]), "From diferente da identidade institucional");
        assert(/\[PILOTO\]/.test(guarded.subject) && guarded.text.includes("PILOTO — TESTE CONTROLADO"), "sem identificação de PILOTO");
        assert(!/externo|weg\.net|fornecedor/i.test(mime.split(/\r?\n\r?\n/, 1)[0]), "endereço externo vazou para os cabeçalhos");
        assert(!mime.toLowerCase().includes(BOX), "axion@ apareceu no MIME");
        assert(result.to === participant && JSON.stringify(result.cc) === JSON.stringify([ACC]) && result.from === ACC, JSON.stringify(result));
        assert(/X-ACC-Outbound: 1/.test(mime), "mensagem sem marca de saída do ACC (a cópia Cc seria lida como resposta)");
      }));
  }
}

await check("destinatário fora dos participantes (externo, crm@, axion@, acc@, vários, com CRLF) é BLOQUEADO antes do MIME — nunca substituído", () =>
  withEnv(PILOT_ENV, async () => {
    for (const to of ["cliente.externo@weg.net", "crm@axion.com.br", BOX, ACC, `${REY}, ${JAIME}`, `${REY}\r\nBcc: invasor@x.com`, "Ricardo <ricardo.martins@axion.com.br>"]) {
      await rejects(() => sendThroughChain(base({ to })), /Destinat/, `to=${JSON.stringify(to)}`);
    }
  }));

await check("injeção de cabeçalho no assunto não cria destinatários (Bcc/Cc injetados viram texto, nunca cabeçalho)", () =>
  withEnv(PILOT_ENV, async () => {
    const { guarded } = await sendThroughChain(base({ subject: "Alerta\r\nBcc: invasor@x.com\r\nCc: outro@x.com" }));
    const h = headersOf(buildMimeMessage(guarded, ACC, "<conv@axion.invalid>"));
    assert(!h.has("bcc") && addrs(h.get("cc")).join() === ACC, "cabeçalho injetado");
    assert(!addrs(h.get("to")).concat(addrs(h.get("cc"))).includes("invasor@x.com"), "invasor virou destinatário");
  }));

await check("Reply-To: só <caixa-inbound>+alerta-<token>@ da caixa oficial (acc@) e só com contexto de conversa; externo/axion@ é removido ou bloqueado", () =>
  withEnv(PILOT_ENV, async () => {
    const ctx = { kind: "RISK_ALERT_CONVERSATION", outboxId: "11111111-1111-4111-8111-111111111111", conversationId: "22222222-2222-4222-8222-222222222222" };
    const token = "Qm9vayB0aGUgc3RhZ2VYWVo";
    const ok = await sendThroughChain(base({ replyTo: `acc+alerta-${token}@axion.com.br`, replyToContext: ctx }));
    assert(ok.guarded.replyTo === `acc+alerta-${token}@axion.com.br`, `Reply-To=${ok.guarded.replyTo}`);
    for (const bad of ["externo@weg.net", `axion+alerta-${token}@axion.com.br`, `crm+alerta-${token}@axion.com.br`, `acc+alerta-${token}@outro.com`]) {
      const r = await sendThroughChain(base({ replyTo: bad, replyToContext: ctx }));
      assert(r.guarded.replyTo === undefined, `Reply-To inválido sobreviveu: ${bad}`);
    }
    const noCtx = await sendThroughChain(base({ replyTo: `acc+alerta-${token}@axion.com.br` }));
    assert(noCtx.guarded.replyTo === undefined, "Reply-To sem contexto sobreviveu");
  }));

await check("caixa inbound configurada como axion@ (proibida) BLOQUEIA o envio do piloto antes de MIME/rede", () =>
  withEnv({ ...PILOT_ENV, GOOGLE_GMAIL_INBOUND_MAILBOX: BOX }, async () => {
    await rejects(() => sendThroughChain(base()), /proibida/, "inbound axion@");
  }));

await check("mensagem de outro projeto ou sem projeto NÃO usa o perfil: em modo piloto vai só para crm@, sem Cc institucional", () =>
  withEnv(PILOT_ENV, async () => {
    for (const pilot of [{ projectId: OTHER }, undefined]) {
      const { guarded } = await sendThroughChain(base({ to: "cliente.externo@weg.net", pilot, cc: ["x@y.com"] }));
      assert(guarded.to === "crm@axion.com.br" && !guarded.cc && !guarded.bcc, `to=${guarded.to} cc=${guarded.cc}`);
    }
  }));

await check("perfil inválido falha fechado antes de MIME/rede (projeto fora da WEG, remetente ≠ acc@, autorizado desconhecido) e nunca cai para outro comportamento", async () => {
  for (const env of [
    { ...PILOT_ENV, ACC_PROJECT_PILOT_PROJECT_ID: OTHER },
    { ...PILOT_ENV, ACC_PROJECT_PILOT_SENDER: "crm@axion.com.br" },
    { ...PILOT_ENV, ACC_PROJECT_PILOT_SENDER: BOX },
    { ...PILOT_ENV, ACC_PROJECT_PILOT_SENDER: "" },
    { ...PILOT_ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: "estranho@exemplo.com" },
    { ...PILOT_ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: ACC },
  ]) {
    await withEnv(env, async () => {
      if (env.ACC_PROJECT_PILOT_PROJECT_ID === OTHER) {
        // projeto ≠ WEG: o perfil é inválido e mensagens da WEG não são "do piloto" — a mensagem segue a guarda global (nunca o perfil direto).
        const profile = profileMod.resolveProjectPilotProfile();
        assert(profile.configured && !profile.valid, "perfil de outro projeto deveria ser inválido");
        return;
      }
      await rejects(() => sendThroughChain(base()), /Perfil do projeto piloto inválido/, JSON.stringify(env));
    });
  }
});

await check("variáveis LEGADAS (ACC_PROJECT_PILOT_DESTINATION=axion@, ACC_PROJECT_PILOT_TEST_GROUP) NÃO são lidas: nada é roteado para axion@ nem para o grupo antigo", () =>
  withEnv({ ...PILOT_ENV, ACC_PROJECT_PILOT_DESTINATION: BOX, ACC_PROJECT_PILOT_TEST_GROUP: "WEG_INTERNAL_FOUR" }, async () => {
    const { guarded } = await sendThroughChain(base({ to: JAIME }));
    assert(guarded.to === JAIME && JSON.stringify(guarded.cc) === JSON.stringify([ACC]), `to=${guarded.to} cc=${guarded.cc}`);
    assert(!JSON.stringify(guarded).toLowerCase().includes(BOX), "axion@ apareceu");
    assert(!JSON.stringify(guarded).includes("crm@axion.com.br"), "crm@ do grupo antigo apareceu");
  }));

await check("ACC_EMAIL_ONLY_RECIPIENT=crm@ não bloqueia a entrega direta da WEG, mas continua prendendo os demais projetos", () =>
  withEnv({ ...PILOT_ENV, ACC_EMAIL_ONLY_RECIPIENT: "crm@axion.com.br" }, async () => {
    const weg = await sendThroughChain(base({ to: CARLOS }));
    assert(weg.guarded.to === CARLOS, "entrega direta bloqueada pela trava global");
    const other = await sendThroughChain(base({ to: "cliente@weg.net", pilot: { projectId: OTHER } }));
    assert(other.guarded.to === "crm@axion.com.br", "demais projetos deixaram de ser presos a crm@");
  }));

// --- 3. Remetente = identidade autenticada (H: nunca envio silencioso com outra identidade) ----------------------------------------
const FULL_CREDS = {
  GOOGLE_GMAIL_PILOT_CLIENT_ID: "pilot-client", GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "pilot-secret",
  GOOGLE_GMAIL_PILOT_SENDER_EMAIL: ACC, GOOGLE_GMAIL_PILOT_REFRESH_TOKEN: "rt-acc",
  GOOGLE_GMAIL_PILOT_USER_JAIME_RAMOS_REFRESH_TOKEN: "rt-jaime",
};

await check("participante AUTORIZADO e AUTENTICADO envia com a PRÓPRIA identidade (From = ele, sem nome institucional), To = destinatário, Cc = acc@", () =>
  withEnv({ ...PILOT_ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: JAIME }, async () => {
    const { guarded, result } = await sendThroughChain(base({ to: CARLOS, pilot: { projectId: WEG, senderEmail: JAIME } }), { requireSenderCredentials: true, credentialEnv: FULL_CREDS });
    const mime = buildMimeMessage(guarded, JAIME, "<conv@axion.invalid>", { displayName: null });
    const h = headersOf(mime);
    assert(addrs(h.get("from")).join() === JAIME && !/ACC AXION/.test(h.get("from")[0]), `From=${h.get("from")}`);
    assert(addrs(h.get("to")).join() === CARLOS && addrs(h.get("cc")).join() === ACC, "To/Cc incorretos");
    assert(result.from === JAIME && result.cc[0] === ACC, JSON.stringify(result));
  }));

await check("participante NÃO autorizado como remetente, fora da lista, ou proibido => BLOQUEIA (nunca troca para acc@)", () =>
  withEnv(PILOT_ENV, async () => {
    for (const sender of [JAIME, CARLOS, "externo@weg.net", BOX, "crm@axion.com.br"]) {
      await rejects(() => sendThroughChain(base({ pilot: { projectId: WEG, senderEmail: sender } }), { requireSenderCredentials: true, credentialEnv: FULL_CREDS }), /Remetente/, `sender=${sender}`);
    }
  }));

await check("remetente autorizado SEM credencial própria => BLOQUEIA antes de qualquer envio; ACC sem credencial também; nunca usa outra identidade", () =>
  withEnv({ ...PILOT_ENV, ACC_PROJECT_PILOT_AUTHORIZED_SENDERS: `${JAIME}, ${CARLOS}` }, async () => {
    let sent = 0;
    const opts = (env) => ({ requireSenderCredentials: true, credentialEnv: env, onGuardedInput: () => (sent += 1) });
    // Carlos autorizado mas sem refresh token próprio
    await rejects(() => sendThroughChain(base({ pilot: { projectId: WEG, senderEmail: CARLOS } }), opts(FULL_CREDS)), /identidade do remetente do piloto não configurada/, "Carlos sem credencial");
    // Jaime com o token de OUTRA pessoa não passa: a variável é por remetente
    const { GOOGLE_GMAIL_PILOT_USER_JAIME_RAMOS_REFRESH_TOKEN: _drop, ...semJaime } = FULL_CREDS;
    await rejects(() => sendThroughChain(base({ pilot: { projectId: WEG, senderEmail: JAIME } }), opts({ ...semJaime, GOOGLE_GMAIL_PILOT_USER_CARLOS_EVANDRO_REFRESH_TOKEN: "rt-carlos" })), /não configurada/, "Jaime sem o próprio token");
    // ACC sem refresh token
    const { GOOGLE_GMAIL_PILOT_REFRESH_TOKEN: _rt, ...semAcc } = FULL_CREDS;
    await rejects(() => sendThroughChain(base(), opts(semAcc)), /não configurada/, "ACC sem credencial");
    // ACC com SENDER_EMAIL de outra conta (ex.: crm@) não autentica como acc@
    await rejects(() => sendThroughChain(base(), opts({ ...FULL_CREDS, GOOGLE_GMAIL_PILOT_SENDER_EMAIL: "crm@axion.com.br" })), /não configurada/, "ACC com conta diferente");
    assert(sent === 0, "alguma mensagem chegou a sair apesar da falta de credencial");
  }));

await check("resolução de credencial por identidade: variável por remetente, par de cliente do piloto obrigatório, sem fallback", () => {
  const r = credsMod.resolveGmailPilotIdentityConfig(JAIME, FULL_CREDS);
  assert(r.senderEmail === JAIME && r.refreshToken === "rt-jaime" && r.clientSource === "PILOT");
  assert(credsMod.resolveGmailPilotIdentityConfig(ACC, FULL_CREDS).refreshToken === "rt-acc");
  assert(credsMod.pilotParticipantRefreshTokenEnvName(JAIME) === "GOOGLE_GMAIL_PILOT_USER_JAIME_RAMOS_REFRESH_TOKEN");
  assert(credsMod.pilotParticipantRefreshTokenEnvName(CARLOS) === "GOOGLE_GMAIL_PILOT_USER_CARLOS_EVANDRO_REFRESH_TOKEN");
  assert(credsMod.pilotParticipantRefreshTokenEnvName(REY) === "GOOGLE_GMAIL_PILOT_USER_REYNALDO_REFRESH_TOKEN");
  for (const [email, env] of [[CARLOS, FULL_CREDS], [JAIME, { ...FULL_CREDS, GOOGLE_GMAIL_PILOT_CLIENT_SECRET: "" }], ["crm@axion.com.br", FULL_CREDS], [BOX, FULL_CREDS], ["externo@weg.net", FULL_CREDS]]) {
    let threw = false;
    try {
      credsMod.resolveGmailPilotIdentityConfig(email, env);
    } catch (error) {
      threw = true;
      assert(!/rt-acc|rt-jaime|pilot-secret|pilot-client/i.test(error.message), "mensagem de erro expõe valor");
    }
    assert(threw, `não lançou para ${email}`);
  }
});

// --- 4. Conferência do MIME final e respostas -----------------------------------------------------------------------------------------
await check("assertPilotMimeRecipients recusa: Bcc, Cc ausente/errado, axion@ em To/Cc/Reply-To, To diferente, From diferente", () => {
  const mk = (over = {}) => {
    const h = { from: `"ACC" <${ACC}>`, to: JAIME, cc: ACC, "reply-to": `acc+alerta-Qm9vayB0aGUgc3RhZ2VYWVo@axion.com.br`, ...over };
    return Object.entries(h).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join("\r\n") + "\r\n\r\nCorpo";
  };
  profileMod.assertPilotMimeRecipients(mk(), ACC, JAIME);
  for (const over of [{ bcc: "x@y.com" }, { cc: null }, { cc: `${ACC}, ${BOX}` }, { cc: BOX }, { to: `${JAIME}, ${REY}` }, { to: BOX }, { "reply-to": `axion+alerta-Qm9vayB0aGUgc3RhZ2VYWVo@axion.com.br` }, { from: `<${REY}>` }, { "resent-to": "x@y.com" }]) {
    let threw = false;
    try {
      profileMod.assertPilotMimeRecipients(mk(over), ACC, JAIME);
    } catch {
      threw = true;
    }
    assert(threw, `aceitou ${JSON.stringify(over)}`);
  }
});

await check("respostas: sem atribuição por 'caixa do piloto' (funções legadas removidas); a cópia Cc (X-ACC-Outbound) é ignorada; a resposta do ACC é ignorada", () => {
  for (const legacy of ["authorizePilotMailboxReply", "classifyPilotGroupReply"]) assert(!(legacy in pipeline), `${legacy} ainda existe`);
  const headers = (over = {}) => ({ from: JAIME, to: [ACC], messageId: "<m1@exemplo.com>", inReplyTo: null, references: [], replyTo: null, autoSubmitted: null, authenticationResults: null, subject: "Re: alerta", ...over });
  const ctx = { accMailboxes: [ACC], seenMessageIds: new Set() };
  assert(pipeline.filterInboundMessage(headers(), ctx) === "OK", "resposta legítima do colaborador deveria passar");
  assert(pipeline.filterInboundMessage(headers({ xAccOutbound: "1" }), ctx) === "IGNORED_SELF", "cópia Cc não foi ignorada");
  assert(pipeline.filterInboundMessage(headers({ from: ACC }), ctx) === "IGNORED_SELF", "resposta do ACC não foi ignorada");
  assert(pipeline.filterInboundMessage(headers({ from: "acc+alerta-abc@axion.com.br" }), ctx) === "IGNORED_SELF", "sub-endereço do ACC não foi ignorado");
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
if (failed > 0) process.exit(1);
