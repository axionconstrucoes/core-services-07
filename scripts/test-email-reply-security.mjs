// P2 — operação dos alertas pelo próprio e-mail: segurança do remetente e peças puras.
// DMARC/DKIM obrigatório (pass, fail, ausente, servidor não confiável, desalinhado, conflito), leitura de TODOS os
// Authentication-Results, remoção de "Mensagem encaminhada/Forwarded message", limite de taxa por remetente, comandos
// (EM ANDAMENTO com previsão, ENVIAR PARA por nome), destino por nome único/ambíguo, mailto (tamanho e codificação) e
// validação da foto de evidência. Sem rede, banco ou e-mail real.
// Uso: node scripts/test-email-reply-security.mjs
import { register } from "node:module";

register("./ts-module-resolver.mjs", import.meta.url);

const auth = await import("../apps/web/lib/email-replies/sender-authentication");
const { SenderRateLimiter, resolveSenderRateLimit } = await import("../apps/web/lib/email-replies/sender-rate-limit");
const mailto = await import("../apps/web/lib/email-replies/reply-mailto");
const { resolveForwardTarget, normalizePersonName } = await import("../apps/web/lib/email-replies/member-target");
const attachments = await import("../apps/web/lib/email-replies/inbound-attachments");
const tokens = await import("../apps/web/lib/email-replies/reply-tokens");
const pipeline = await import("../apps/web/lib/risk-alerts/replies/reply-pipeline");
const { parseOperationalEmailCommand } = await import("../apps/web/lib/risk-alerts/replies/operational-email-command");
const { extractInboundFromGmail } = await import("../apps/web/lib/risk-alerts/replies/gmail-reply-extract");

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
    console.log(`FAIL ${name}`);
    console.log(`     ${error.message}`);
    failed += 1;
  }
}

const FROM = "maria.silva@axion.com.br";
const GOOD_DMARC = "mx.google.com; dkim=pass header.i=@axion.com.br header.s=google header.b=AbCd; spf=pass (google.com: domain of maria.silva@axion.com.br designates 1.2.3.4 as permitted sender) smtp.mailfrom=maria.silva@axion.com.br; dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=axion.com.br";
const verify = (ar, extra = {}) => auth.verifySenderAuthentication({ fromEmail: FROM, authenticationResults: ar, ...extra });

// ------------------------------------------------------------------ autenticação
await check("1. DMARC=pass alinhado (cabeçalho real do Gmail, com comentários) => aceito", () => {
  const r = verify(GOOD_DMARC);
  assert(r.ok && r.method === "DMARC" && r.authservId === "mx.google.com", JSON.stringify(r));
});
await check("2. Só DKIM=pass alinhado (subdomínio do From) => aceito; DKIM de OUTRO domínio => AUTH_NOT_ALIGNED", () => {
  assert(verify("mx.google.com; dkim=pass header.d=mail.axion.com.br header.s=s1; spf=pass").ok, "subdomínio");
  assert(verify("mx.google.com; dkim=pass header.d=axion.com.br").ok, "mesmo domínio");
  const other = verify("mx.google.com; dkim=pass header.d=evil.com; spf=pass smtp.mailfrom=axion.com.br");
  assert(!other.ok && other.reason === "AUTH_NOT_ALIGNED", JSON.stringify(other));
  const parent = verify("mx.google.com; dkim=pass header.d=com.br");
  assert(!parent.ok && parent.reason === "AUTH_NOT_ALIGNED", "domínio-pai não alinha");
});
await check("3. SPF=pass sozinho NÃO basta; dmarc=pass com header.from de outro domínio => AUTH_NOT_ALIGNED", () => {
  const spfOnly = verify("mx.google.com; spf=pass smtp.mailfrom=maria.silva@axion.com.br");
  assert(!spfOnly.ok && spfOnly.reason === "AUTH_NOT_ALIGNED", JSON.stringify(spfOnly));
  const wrongFrom = verify("mx.google.com; dmarc=pass header.from=gmail.com");
  assert(!wrongFrom.ok && wrongFrom.reason === "AUTH_NOT_ALIGNED");
});
await check("4. FAIL: dmarc=fail ou dkim alinhado fail/permerror => AUTH_FAILED (conflito nunca vira aceitação)", () => {
  assert(verify("mx.google.com; dkim=pass header.d=axion.com.br; dmarc=fail header.from=axion.com.br").reason === "AUTH_FAILED");
  assert(verify("mx.google.com; dkim=permerror header.d=axion.com.br; dmarc=pass header.from=axion.com.br").reason === "AUTH_FAILED");
  // Dois cabeçalhos do servidor confiável em conflito (pass + fail) => falha.
  assert(verify([GOOD_DMARC, "mx.google.com; dmarc=fail header.from=axion.com.br"]).reason === "AUTH_FAILED");
});
await check("5. AUSENTE (null, vazio, só lixo) => AUTH_RESULTS_MISSING com texto explicativo (não silencioso)", () => {
  for (const v of [null, undefined, "", "   ", "spf=fail"]) {
    const r = verify(v);
    assert(!r.ok && r.reason === "AUTH_RESULTS_MISSING", `${String(v)} => ${JSON.stringify(r)}`);
  }
  assert(/DMARC\/DKIM/.test(auth.senderAuthenticationMessage("AUTH_RESULTS_MISSING")));
});
await check("6. Servidor NÃO confiável (cabeçalho forjado pelo remetente) => AUTH_UNTRUSTED_SERVER; authserv-id configurável", () => {
  const forged = verify("evil.example; dkim=pass header.d=axion.com.br; dmarc=pass header.from=axion.com.br");
  assert(!forged.ok && forged.reason === "AUTH_UNTRUSTED_SERVER", JSON.stringify(forged));
  const custom = auth.resolveTrustedAuthservIds({ ACC_EMAIL_TRUSTED_AUTHSERV_IDS: "mx.axion.com.br, mx.google.com" });
  assert(custom.includes("mx.axion.com.br") && custom.includes("mx.google.com"));
  assert(verify("mx.axion.com.br; dmarc=pass header.from=axion.com.br", { trustedAuthservIds: custom }).ok);
  assert(auth.resolveTrustedAuthservIds({}).join(",") === "mx.google.com", "padrão");
});
await check("7. Lê TODOS os cabeçalhos: forjado (não confiável) + real do Gmail com pass => aceito; real com fail => recusado", () => {
  const forgedFirst = ["attacker.example; dmarc=pass header.from=axion.com.br", GOOD_DMARC].join("\n");
  assert(verify(forgedFirst).ok);
  const realFail = ["attacker.example; dmarc=pass header.from=axion.com.br", "mx.google.com; dmarc=fail header.from=axion.com.br"].join("\n");
  assert(verify(realFail).reason === "AUTH_FAILED");
});
await check("8. extractInboundFromGmail grava TODOS os Authentication-Results (um por linha, desdobrados) e lista anexos", () => {
  const b64 = (s) => Buffer.from(s).toString("base64url");
  const msg = {
    id: "m1", threadId: "t1", internalDate: String(Date.parse("2026-11-20T12:00:00Z")),
    payload: {
      mimeType: "multipart/mixed",
      headers: [
        { name: "From", value: `Maria <${FROM}>` },
        { name: "To", value: "crm+alerta-AAAAAAAAAAAAAAAAAAAAAAAA@axion.com.br" },
        { name: "Authentication-Results", value: "mx.google.com;\r\n       dkim=pass header.i=@axion.com.br;\r\n       dmarc=pass header.from=axion.com.br" },
        { name: "ARC-Authentication-Results", value: "i=1; mx.google.com; dmarc=fail header.from=axion.com.br" },
        { name: "Authentication-Results", value: "outro.example; spf=none" },
      ],
      parts: [
        { mimeType: "text/plain", body: { data: b64("RESOLVIDO: feito") } },
        { mimeType: "image/jpeg", filename: "foto obra.jpg", body: { attachmentId: "att-1", size: 1200 } },
        { mimeType: "image/png", headers: [{ name: "Content-ID", value: "<logo>" }], body: { data: b64("x") } },
      ],
    },
  };
  const ex = extractInboundFromGmail(msg, "crm@axion.com.br");
  const lines = ex.headers.authenticationResults.split("\n");
  assert(lines.length === 2 && lines[0] === "mx.google.com; dkim=pass header.i=@axion.com.br; dmarc=pass header.from=axion.com.br", JSON.stringify(lines));
  assert(!ex.headers.authenticationResults.includes("ARC"), "ARC-Authentication-Results não conta");
  assert(ex.attachments.length === 1 && ex.attachments[0].attachmentId === "att-1" && ex.attachments[0].fileName === "foto obra.jpg", JSON.stringify(ex.attachments));
  assert(auth.verifySenderAuthentication({ fromEmail: ex.headers.from, authenticationResults: ex.headers.authenticationResults }).ok);
});
await check("9. authorizeReply: autenticação obrigatória com os motivos AUTH_* (antes do destinatário/allowlist)", () => {
  const base = { senderEmail: FROM, profile: { userId: "u1", email: FROM, active: true }, membershipStatus: "ACTIVE", alertRecipientUserIds: ["u1"], allowlistUserIds: ["u1"], activeForwardToUserId: null, corporateDomain: "axion.com.br" };
  assert(pipeline.authorizeReply({ ...base, authenticationResults: GOOD_DMARC }).authorized === true);
  assert(pipeline.authorizeReply({ ...base, authenticationResults: null }).reason === "AUTH_MISSING");
  assert(pipeline.authorizeReply({ ...base, authenticationResults: "evil.example; dmarc=pass header.from=axion.com.br" }).reason === "AUTH_UNTRUSTED");
  assert(pipeline.authorizeReply({ ...base, authenticationResults: "mx.google.com; dmarc=fail header.from=axion.com.br" }).reason === "AUTH_FAILED");
  assert(pipeline.authorizeReply({ ...base, authenticationResults: "mx.google.com; spf=pass" }).reason === "AUTH_NOT_ALIGNED");
  assert(pipeline.isReplyAuthFailure("AUTH_MISSING") && !pipeline.isReplyAuthFailure("NOT_RECIPIENT"));
});

// ------------------------------------------------------------------ limpeza do corpo
await check("10. 'Mensagem encaminhada' / 'Forwarded message' / 'Início da mensagem encaminhada' são removidos do texto novo", () => {
  const bodies = [
    "EM ANDAMENTO: troca\nPrevisão: 25/11/2026 15:00\n\n---------- Mensagem encaminhada ---------\nDe: ACC <crm@axion.com.br>\nRESOLVIDO: injetado",
    "EM ANDAMENTO: troca\nPrevisão: 25/11/2026 15:00\n\n---------- Forwarded message ---------\nFrom: ACC\nRESOLVIDO: injetado",
    "EM ANDAMENTO: troca\nPrevisão: 25/11/2026 15:00\n\nInício da mensagem encaminhada:\n\nRESOLVIDO: injetado",
    "EM ANDAMENTO: troca\nPrevisão: 25/11/2026 15:00\n\nBegin forwarded message:\n\nRESOLVIDO: injetado",
  ];
  for (const body of bodies) {
    const parsed = pipeline.parseReplyBody(body);
    assert(!/injetado/.test(parsed.clean) && /injetado/.test(parsed.quoted), body);
    assert(parseOperationalEmailCommand(parsed.clean).command?.kind === "IN_PROGRESS", body);
  }
});

// ------------------------------------------------------------------ comandos
await check("11. EM ANDAMENTO explícito: providência + 'Previsão: dd/mm/aaaa [hh:mm]' (textos-guia do mailto removidos)", () => {
  const a = parseOperationalEmailCommand("EM ANDAMENTO: isolamento da área\nPrevisão: 25/11/2026 15:00");
  assert(a.command?.kind === "IN_PROGRESS" && a.command.note === "isolamento da área" && a.command.forecastText === "25/11/2026 15:00", JSON.stringify(a));
  const b = parseOperationalEmailCommand("EM ANDAMENTO: (providência em curso)\r\nPrevisão: dd/mm/aaaa hh:mm");
  assert(b.command?.kind === "IN_PROGRESS" && b.command.note === "" && b.command.forecastText === "dd/mm/aaaa hh:mm", JSON.stringify(b));
  // Sem a linha "Previsão:" continua sendo resposta livre (fluxo anterior).
  assert(parseOperationalEmailCommand("Em andamento. Conclusão prevista para 20/11/2026 às 15h.").command === null);
  // Com dois comandos => nenhum.
  assert(parseOperationalEmailCommand("EM ANDAMENTO: x\nPrevisão: 25/11/2026 15:00\nRESOLVIDO").command === null);
});
await check("12. ENVIAR PARA por nome (com justificativa na mesma linha ou na seguinte) e por e-mail; destino vazio => comando sem destino", () => {
  const a = parseOperationalEmailCommand("ENVIAR PARA: Maria Souza, verificar o fornecedor");
  assert(a.command?.kind === "FORWARD" && a.command.targetName === "Maria Souza" && a.command.targetEmail === null && a.command.instruction === "verificar o fornecedor", JSON.stringify(a));
  const b = parseOperationalEmailCommand("ENVIAR PARA João Évora\nJustificativa: férias do responsável");
  assert(b.command?.kind === "FORWARD" && b.command.targetName === "João Évora" && b.command.instruction === "férias do responsável", JSON.stringify(b));
  const c = parseOperationalEmailCommand("ENVIAR PARA: (nome completo ou e-mail corporativo)\r\nJustificativa: ");
  assert(c.command?.kind === "FORWARD" && c.command.targetName === null && c.command.targetEmail === null, JSON.stringify(c));
  const d = parseOperationalEmailCommand("ENVIAR PARA: maria.souza@axion.com.br - assumir");
  assert(d.command?.kind === "FORWARD" && d.command.targetEmail === "maria.souza@axion.com.br");
  const e = parseOperationalEmailCommand("RESOLVIDO: \r\n\r\n(anexe a FOTO de evidência — JPG ou PNG até 15 MB)");
  assert(e.command?.kind === "RESOLVE" && e.command.note === "", "texto-guia não vira nota");
});
await check("13. Destino por NOME ÚNICO (sem acento/maiúsculas); homônimos => ambíguo; LEITURA, externo e o próprio remetente => inválidos", () => {
  const c = (userId, name, email, permission = "COLABORADOR", status = "ACTIVE") => ({ userId, name, email, permission, membershipStatus: status });
  const candidates = [c("u1", "Maria Souza", "maria@axion.com.br"), c("u2", "João Évora", "joao@axion.com.br"), c("u3", "Ana Lima", "ana1@axion.com.br"), c("u4", "Ana Lima", "ana2@axion.com.br"), c("u5", "Leo Leitura", "leo@axion.com.br", "LEITURA"), c("u6", "Externo Silva", "ext@gmail.com"), c("u7", "Inativo Reis", "ina@axion.com.br", "COLABORADOR", "INACTIVE")];
  const r = (targetName, targetEmail = null, sender = "u9") => resolveForwardTarget({ targetName, targetEmail, candidates, senderUserId: sender, corporateDomain: "axion.com.br" });
  assert(r("joao evora").ok && r("JOÃO ÉVORA").userId === "u2", "nome sem acento");
  assert(r("Ana Lima").reason === "TARGET_AMBIGUOUS");
  assert(r("Leo Leitura").reason === "TARGET_NOT_ELIGIBLE");
  assert(r("Externo Silva").reason === "TARGET_NOT_ELIGIBLE");
  assert(r("Inativo Reis").reason === "TARGET_NOT_ELIGIBLE");
  assert(r("Maria Souza", null, "u1").reason === "TARGET_IS_SENDER");
  assert(r("Fulano de Tal").reason === "TARGET_NOT_FOUND");
  assert(r(null).reason === "TARGET_MISSING");
  assert(r(null, "ana2@axion.com.br").userId === "u4", "e-mail exato desambigua");
  assert(normalizePersonName("  José   da Silva ") === "jose da silva");
});

// ------------------------------------------------------------------ mailto
await check("14. mailto: endereço +alerta-<token>, assunto com código visível, corpo curto SEM dados do alerta, RFC 6068, < 2000", () => {
  const token = tokens.generateEmailReplyToken();
  const links = mailto.buildReplyMailtoLinks({ mailbox: "crm@axion.com.br", token, visibleCode: "ACC-ALERTA:ABCD1234", evidenceAttachment: "REQUIRED_FILE", forecastNeedsTime: true });
  assert(links, "links");
  for (const action of mailto.REPLY_MAILTO_ORDER) {
    const url = links[action];
    assert(url.length < mailto.MAILTO_MAX_LENGTH, `${action}: ${url.length}`);
    assert(url.startsWith(`mailto:crm+alerta-${token}@axion.com.br?subject=`), url);
    assert(!/\s/.test(url) && !url.includes("+") === false, "sem espaços; '+' só no endereço");
    assert(!/[^\x21-\x7e]/.test(url), "somente ASCII imprimível (acentos codificados)");
    assert(mailto.isSafeReplyMailto(url), `inseguro: ${url}`);
    const parsed = new URL(url);
    const subject = parsed.searchParams.get("subject");
    const body = decodeURIComponent(url.split("&body=")[1]);
    assert(subject === `${mailto.REPLY_MAILTO_LABELS[action]} [ACC-ALERTA:ABCD1234]`, subject);
    assert(body.length < 200 && !/ABCD1234|crm@|obra|risco/i.test(body), `corpo com dado do alerta: ${body}`);
    assert(url.includes("%0D%0A"), "quebra de linha CRLF codificada");
    assert(url.split("?")[1].split("+").length === 1, "nenhum '+' no assunto/corpo (seria espaço em alguns clientes)");
  }
  assert(decodeURIComponent(links.EM_ANDAMENTO.split("&body=")[1]).includes("Previsão: dd/mm/aaaa hh:mm"));
  assert(mailto.buildReplyMailtoLinks({ mailbox: "", token, visibleCode: "X" }) === null, "sem caixa => sem link");
  assert(mailto.buildReplyMailtoLinks({ mailbox: "crm@axion.com.br", token: "curto", visibleCode: "X" }) === null, "token inválido => sem link");
  assert(!mailto.isSafeReplyMailto("mailto:outra@axion.com.br?subject=x&body=y") && !mailto.isSafeReplyMailto("javascript:alert(1)"));
});

// ------------------------------------------------------------------ limite de taxa
await check("15. Limite por remetente/hora: N mensagens na janela de 1 h; a seguinte excede; janela desliza; histórico conta", () => {
  const limiter = new SenderRateLimiter(3, [{ senderEmail: "A@axion.com.br", receivedAt: "2026-11-20T11:30:00Z" }]);
  assert(limiter.allow("a@axion.com.br", "2026-11-20T12:00:00Z"));
  assert(limiter.allow("a@axion.com.br", "2026-11-20T12:05:00Z"));
  assert(!limiter.allow("a@axion.com.br", "2026-11-20T12:10:00Z"), "4ª na janela (histórico + 2) excede");
  assert(limiter.allow("b@axion.com.br", "2026-11-20T12:10:00Z"), "outro remetente não é afetado");
  assert(limiter.allow("a@axion.com.br", "2026-11-20T12:40:00Z"), "11:30 saiu da janela");
  assert(resolveSenderRateLimit({}) === 10 && resolveSenderRateLimit({ ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "4" }) === 4 && resolveSenderRateLimit({ ACC_EMAIL_REPLY_MAX_PER_SENDER_HOUR: "0" }) === 10);
});

// ------------------------------------------------------------------ anexos / tokens
await check("16. Foto de evidência: JPEG/PNG pelo conteúdo, 1 byte..15 MB, sha256; GIF/PDF renomeado e > 15 MB recusados", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(50, 2)]);
  const ok = attachments.validateSsmaEvidencePhoto(jpeg);
  assert(ok.ok && ok.mimeType === "image/jpeg" && ok.sha256 === attachments.sha256Hex(jpeg) && /^[0-9a-f]{64}$/.test(ok.sha256));
  assert(attachments.validateSsmaEvidencePhoto(png).mimeType === "image/png");
  assert(attachments.validateSsmaEvidencePhoto(Buffer.from("GIF89a....")).reason === "PHOTO_TYPE_INVALID");
  assert(attachments.validateSsmaEvidencePhoto(Buffer.from("%PDF-1.7")).reason === "PHOTO_TYPE_INVALID");
  assert(attachments.validateSsmaEvidencePhoto(Buffer.concat([jpeg, Buffer.alloc(15 * 1024 * 1024)])).reason === "PHOTO_TOO_LARGE");
  const path = attachments.ssmaPhotoStoragePath("p1", "r1", "f1", "Foto da obra.JPG", "image/jpeg");
  assert(path === "p1/ssma-registros/r1/f1-Foto_da_obra.jpg", path);
  assert(attachments.buildEvidenceText([{ sha256: "a".repeat(64), fileName: "laudo:final.pdf" }], "Troca feita") === `anexo:${"a".repeat(64)}:laudofinal.pdf\nTroca feita`);
});
await check("17. Token por item: 24 bytes base64url, só o hash é gravado (antes do envio); validade 30 dias; uso único por mensagem", async () => {
  const store = tokens.createMemoryEmailReplyTokenStore();
  const issued = await tokens.issueEmailReplyToken(store, { projectId: "p1", subjectKind: "RISK_CASE", subjectId: "c1", recipientUserId: "u1", nowIso: "2026-11-20T12:00:00Z" });
  assert(/^[A-Za-z0-9_-]{32}$/.test(issued.token) && store.rows[0].tokenHash === tokens.hashEmailReplyToken(issued.token) && !JSON.stringify(store.rows).includes(issued.token));
  assert(store.rows[0].expiresAt === "2026-12-20T12:00:00.000Z");
  assert(await store.consume(issued.tokenHash, "g1") === true && await store.consume(issued.tokenHash, "g1") === true, "mesma mensagem: idempotente");
  assert(await store.consume(issued.tokenHash, "g2") === false, "outra mensagem: já usado");
  assert(tokens.tokenUsability(store.rows[0], "g2", "2026-11-21T00:00:00Z").reason === "TOKEN_ALREADY_USED");
  assert(tokens.tokenUsability({ ...store.rows[0], consumedByMessageId: null }, "g2", "2026-12-21T00:00:00Z").reason === "TOKEN_EXPIRED");
  assert(tokens.isProcessableReplyKind("RISK_CASE") && tokens.isProcessableReplyKind("SSMA_ACTION"));
  for (const kind of ["SLA_ACTION", "WEEKLY_DIGEST_ITEM", "CONTRACT_ALERT_ITEM", "VERSION_REVIEW"]) assert(!tokens.isProcessableReplyKind(kind), kind);
});

console.log(`\nRESULTADO: ${passed} passaram, ${failed} falharam`);
process.exit(failed === 0 ? 0 : 1);
