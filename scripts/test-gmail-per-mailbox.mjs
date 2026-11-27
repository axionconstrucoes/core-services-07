// Coleta Gmail POR CAIXA (scripts/lib/gmail-per-mailbox.mjs): seleção (autorizada/pendente/revogada/sem credencial),
// caixa legada e fallback, cursor por caixa com fatias e retomada, deduplicação por caixa e entre caixas, perímetro de
// domínios externos (e-mail só interno DESLIGADO por padrão) e credenciais (nunca a de outra caixa). Puro: sem rede/banco.
// Uso: node scripts/test-gmail-per-mailbox.mjs
import {
  classifyPerimeter,
  compareMailboxIds,
  mailboxesForComparison,
  decideRunMode,
  dedupePerMailbox,
  domainMatches,
  formatPlanForLog,
  isMissingSchemaError,
  latestImported,
  maskMailbox,
  nextCursor,
  perimeterQueryTerms,
  planMailboxCollection,
  resolveMailboxCredential,
  resolveOAuthCredentialNames,
  resolvePerMailboxWindow,
  splitPerimeterDomains,
} from "./lib/gmail-per-mailbox.mjs";

let passed = 0, failed = 0;
const assert = (c, m) => { if (!c) throw new Error(m ?? "assertion failed"); };
function check(name, fn) {
  try { fn(); console.log(`OK   ${name}`); passed += 1; } catch (e) { console.log(`FAIL ${name}\n     ${e.message}`); failed += 1; }
}

const NOW = new Date("2026-11-27T12:00:00Z");
const REY = "reynaldo@axion.com.br", CARLOS = "carlos.evandro@axion.com.br", JAIME = "jaime.ramos@axion.com.br", CORAZZA = "corazza@axion.com.br";
const control = (mailbox, extra = {}) => ({
  mailbox_address: mailbox, auth_mode: "OAUTH_USUARIO", corporate_authorization_status: "AUTORIZADA", individual_consent_status: "ACEITE_REGISTRADO",
  technical_permission_status: "CONFIRMADA", collection_enabled: true, period_start: "2026-11-23T00:00:00Z", period_end: "2027-06-30T00:00:00Z",
  revoked_at: null, consecutive_errors: 0, last_sync_at: null, ...extra,
});
const consent = (mailbox, status, at = "2026-11-27T10:00:00Z") => ({ id: `a-${mailbox}-${status}`, account_email: mailbox, status, requested_at: at, decided_at: status === "PENDENTE" ? null : at });
const allow = (...mailboxes) => mailboxes.map((m) => ({ mailbox_address: m, enabled: true }));
const ENV = {
  GOOGLE_GMAIL_REYNALDO_CLIENT_ID: "x", GOOGLE_GMAIL_REYNALDO_CLIENT_SECRET: "x", GOOGLE_GMAIL_REYNALDO_REFRESH_TOKEN: "x",
  GOOGLE_GMAIL_INBOUND_CLIENT_ID: "c", GOOGLE_GMAIL_INBOUND_CLIENT_SECRET: "s",
  GOOGLE_GMAIL_TITULAR_1_MAILBOX: CARLOS, GOOGLE_GMAIL_TITULAR_1_REFRESH_TOKEN: "t1",
  GOOGLE_GMAIL_TITULAR_2_MAILBOX: JAIME, GOOGLE_GMAIL_TITULAR_2_REFRESH_TOKEN: "t2",
  GOOGLE_GMAIL_INBOUND_MAILBOX: REY,
};

// ---------------- seleção ----------------
check("S1 situação real de 27/11 (sem controles; Carlos/Jaime PENDENTE; Reynaldo AUTORIZADO): nada novo é coletado, Reynaldo segue no caminho histórico", () => {
  const plan = planMailboxCollection({
    allowlist: allow(REY, CORAZZA), controls: [], consents: [consent(REY, "AUTORIZADO"), consent(CARLOS, "PENDENTE"), consent(JAIME, "PENDENTE")],
    legacyMailbox: REY, env: ENV, now: NOW,
  });
  assert(plan.collect.length === 0, JSON.stringify(plan.collect));
  assert(plan.legacy?.mailbox === REY && plan.legacy.run === true, JSON.stringify(plan.legacy));
  const by = Object.fromEntries(plan.skipped.map((s) => [s.mailbox, s.reasons]));
  for (const m of [CARLOS, JAIME]) {
    assert(by[m]?.includes("ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE") && by[m].includes("FORA_DA_LISTA_DA_OBRA") && by[m].includes("SEM_REGISTRO_DE_CONTROLE"), `${m}: ${by[m]}`);
  }
  assert(by[CORAZZA]?.includes("SEM_REGISTRO_DE_CONTROLE") && by[CORAZZA].includes("ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE"), `corazza: ${by[CORAZZA]}`);
});

check("S2 caixa totalmente autorizada (lista + controle + aceite AUTORIZADO + credencial) é coletada; credencial do slot do titular", () => {
  const plan = planMailboxCollection({ allowlist: allow(REY, CARLOS), controls: [control(CARLOS)], consents: [consent(CARLOS, "AUTORIZADO")], legacyMailbox: REY, env: ENV, now: NOW });
  assert(plan.collect.length === 1 && plan.collect[0].mailbox === CARLOS, JSON.stringify(plan));
  assert(plan.collect[0].credential.source === "OAUTH_SLOT_TITULAR" && plan.collect[0].credential.names.refreshToken === "GOOGLE_GMAIL_TITULAR_1_REFRESH_TOKEN");
  assert(plan.collect[0].credential.names.clientId === "GOOGLE_GMAIL_INBOUND_CLIENT_ID", "cliente compartilhado");
});

check("S3 PENDENTE não é autorização: controle completo mas aceite pendente => PULADA", () => {
  const plan = planMailboxCollection({ allowlist: allow(JAIME), controls: [control(JAIME, { individual_consent_status: "NAO_REGISTRADO" })], consents: [consent(JAIME, "PENDENTE")], env: ENV, now: NOW });
  assert(plan.collect.length === 0 && plan.skipped[0].reasons.includes("ACEITE_INDIVIDUAL_PENDENTE_OU_AUSENTE"), JSON.stringify(plan));
});

check("S4 revogação individual (aceite REVOGADO mais recente) vence controle que ainda diz ACEITE => PULADA", () => {
  const plan = planMailboxCollection({
    allowlist: allow(CARLOS), controls: [control(CARLOS)],
    consents: [consent(CARLOS, "AUTORIZADO", "2026-11-25T10:00:00Z"), consent(CARLOS, "REVOGADO", "2026-11-27T09:00:00Z")], env: ENV, now: NOW,
  });
  assert(plan.collect.length === 0 && plan.skipped[0].reasons.includes("ACEITE_INDIVIDUAL_RECUSADO_OU_REVOGADO"), JSON.stringify(plan));
});

check("S5 revogação corporativa da caixa (revoked_at) => PULADA; outras caixas seguem (isolamento)", () => {
  const plan = planMailboxCollection({
    allowlist: allow(CARLOS, JAIME), controls: [control(CARLOS, { revoked_at: "2026-11-27T08:00:00Z", collection_enabled: false, corporate_authorization_status: "REVOGADA" }), control(JAIME)],
    consents: [consent(CARLOS, "AUTORIZADO"), consent(JAIME, "AUTORIZADO")], env: ENV, now: NOW,
  });
  assert(plan.collect.map((c) => c.mailbox).join() === JAIME, JSON.stringify(plan.collect));
  assert(plan.skipped.find((s) => s.mailbox === CARLOS).reasons.includes("REVOGADA"));
});

check("S6 sem credencial => PULADA com SEM_CREDENCIAL (nunca usa GOOGLE_GMAIL_INBOUND_* de outra caixa)", () => {
  const env = { ...ENV, GOOGLE_GMAIL_TITULAR_1_REFRESH_TOKEN: "", GOOGLE_GMAIL_INBOUND_REFRESH_TOKEN: "legado", GOOGLE_GMAIL_INBOUND_MAILBOX: CARLOS };
  const plan = planMailboxCollection({ allowlist: allow(CARLOS), controls: [control(CARLOS)], consents: [consent(CARLOS, "AUTORIZADO")], env, now: NOW });
  assert(plan.collect.length === 0 && plan.skipped[0].reasons.includes("SEM_CREDENCIAL"), JSON.stringify(plan));
  assert(resolveOAuthCredentialNames(CARLOS, env) === null, "nunca a credencial legada sem nome de caixa");
});

check("S7 caixa legada em transição: controle criado mas coleta ainda desligada => continua no caminho histórico; ligada => passa a ser por caixa", () => {
  const consents = [consent(REY, "AUTORIZADO")];
  const transition = planMailboxCollection({ allowlist: allow(REY), controls: [control(REY, { collection_enabled: false, technical_permission_status: "NAO_VERIFICADA" })], consents, legacyMailbox: REY, env: ENV, now: NOW });
  assert(transition.legacy?.run === true && transition.collect.length === 0 && transition.skipped.length === 0, JSON.stringify(transition));
  const migrated = planMailboxCollection({ allowlist: allow(REY), controls: [control(REY)], consents, legacyMailbox: REY, env: ENV, now: NOW });
  assert(migrated.legacy === null && migrated.collect[0]?.mailbox === REY && migrated.collect[0].credential.source === "OAUTH_CAIXA", JSON.stringify(migrated));
});

check("S8 caixa legada revogada/recusada não roda nem no caminho histórico", () => {
  const plan = planMailboxCollection({ allowlist: allow(REY), controls: [control(REY, { collection_enabled: false })], consents: [consent(REY, "REVOGADO")], legacyMailbox: REY, env: ENV, now: NOW });
  assert(plan.legacy?.run === false && plan.legacy.reason === "CAIXA_LEGADA_REVOGADA_OU_RECUSADA", JSON.stringify(plan.legacy));
});

check("S9 fora do período, retentativas esgotadas e coleta não habilitada são bloqueios por caixa", () => {
  const plan = planMailboxCollection({
    allowlist: allow(CARLOS, JAIME, CORAZZA),
    controls: [control(CARLOS, { period_end: "2026-11-01T00:00:00Z", period_start: "2026-10-01T00:00:00Z" }), control(JAIME, { consecutive_errors: 5 }), control(CORAZZA, { collection_enabled: false })],
    consents: [consent(CARLOS, "AUTORIZADO"), consent(JAIME, "AUTORIZADO"), consent(CORAZZA, "AUTORIZADO")],
    env: { ...ENV, GOOGLE_GMAIL_CORAZZA_CLIENT_ID: "a", GOOGLE_GMAIL_CORAZZA_CLIENT_SECRET: "b", GOOGLE_GMAIL_CORAZZA_REFRESH_TOKEN: "c" }, now: NOW,
  });
  const by = Object.fromEntries(plan.skipped.map((s) => [s.mailbox, s.reasons]));
  assert(plan.collect.length === 0, JSON.stringify(plan.collect));
  assert(by[CARLOS].includes("FORA_DO_PERIODO_AUTORIZADO") && by[JAIME].includes("RETENTATIVAS_ESGOTADAS") && by[CORAZZA].includes("COLETA_NAO_HABILITADA"));
});

check("S10 log público só com identificador opaco (nenhum endereço)", () => {
  const plan = planMailboxCollection({ allowlist: allow(REY, CARLOS), controls: [control(CARLOS)], consents: [consent(CARLOS, "AUTORIZADO"), consent(JAIME, "PENDENTE")], legacyMailbox: REY, env: ENV, now: NOW });
  const text = formatPlanForLog(plan).join("\n");
  assert(!/@/.test(text) && text.includes(maskMailbox(CARLOS)) && maskMailbox(CARLOS) !== maskMailbox(JAIME), text);
});

check("S11 delegação só quando o controle pede DOMAIN_DELEGATION e o executor tem a conta de serviço", () => {
  const ctl = control(CORAZZA, { auth_mode: "DOMAIN_DELEGATION" });
  assert(resolveMailboxCredential(CORAZZA, ctl, {}) === null);
  assert(resolveMailboxCredential(CORAZZA, ctl, { GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT: "sa@p.iam.gserviceaccount.com" })?.mode === "DOMAIN_DELEGATION");
  assert(resolveMailboxCredential(CORAZZA, control(CORAZZA), { GOOGLE_GMAIL_DWD_SERVICE_ACCOUNT: "sa@p.iam.gserviceaccount.com" }) === null, "OAUTH_USUARIO não cai em delegação");
});

// ---------------- fallback ----------------
check("F1 migration ausente (coluna/tabela inexistente) => modo histórico de UMA caixa; outra falha => falha fechada", () => {
  assert(decideRunMode({ controlsError: { code: "42703", message: 'column "last_imported_message_id" does not exist' } }).mode === "LEGACY_FALLBACK");
  assert(decideRunMode({ configError: { code: "PGRST204", message: "Could not find the 'include_internal_only_messages' column" } }).mode === "LEGACY_FALLBACK");
  assert(decideRunMode({ controlsError: { code: "PGRST205", message: "Could not find the table in the schema cache" } }).mode === "LEGACY_FALLBACK");
  assert(decideRunMode({ controlsError: { code: "PGRST301", message: "JWT expired" } }).mode === "ERROR");
  assert(decideRunMode({ configError: { message: "fetch failed (522)" } }).mode === "ERROR");
  assert(decideRunMode({}).mode === "PER_MAILBOX");
  assert(isMissingSchemaError(null) === false);
});

// ---------------- cursor por caixa ----------------
check("C1 1ª execução: começa no period_start (sem recuar antes dele) e anda em fatias de 7 dias", () => {
  const w = resolvePerMailboxWindow(control(CARLOS), { now: NOW });
  assert(w.overlapStart.toISOString() === "2026-11-23T00:00:00.000Z", w.overlapStart.toISOString());
  assert(w.end.toISOString() === "2026-11-27T12:00:00.000Z" && w.capped === false, w.end.toISOString());
  const old = resolvePerMailboxWindow(control(CARLOS, { period_start: "2026-10-01T00:00:00Z" }), { now: NOW });
  assert(old.capped === true && old.end.toISOString() === "2026-10-08T00:00:00.000Z", old.end.toISOString());
  assert(nextCursor(old) === "2026-10-08T00:00:00.000Z", "cursor = fim da fatia");
});

check("C2 retomada: cursor PRÓPRIO da caixa com sobreposição de 10 min; caixas diferentes, cursores independentes", () => {
  const a = resolvePerMailboxWindow(control(CARLOS, { last_sync_at: "2026-11-27T11:00:00Z" }), { now: NOW });
  const b = resolvePerMailboxWindow(control(JAIME, { last_sync_at: "2026-11-26T00:00:00Z" }), { now: NOW });
  assert(a.overlapStart.toISOString() === "2026-11-27T10:50:00.000Z" && b.overlapStart.toISOString() === "2026-11-25T23:50:00.000Z");
});

check("C3 após falha o cursor não anda (amostra/erro => null) e a próxima execução relê a mesma janela", () => {
  const ctl = control(CARLOS, { last_sync_at: "2026-11-27T11:00:00Z" });
  const w1 = resolvePerMailboxWindow(ctl, { now: NOW });
  assert(nextCursor(w1, { sample: true }) === null && nextCursor(null) === null);
  const w2 = resolvePerMailboxWindow(ctl, { now: new Date("2026-11-27T12:15:00Z") });
  assert(w2.overlapStart.getTime() === w1.overlapStart.getTime(), "mesmo início");
});

check("C4 nunca lê além do fim do período autorizado", () => {
  const w = resolvePerMailboxWindow(control(CARLOS, { last_sync_at: "2026-11-26T00:00:00Z", period_end: "2026-11-26T12:00:00Z" }), { now: NOW });
  assert(w.end.toISOString() === "2026-11-26T12:00:00.000Z");
});

// ---------------- deduplicação ----------------
check("D1 mesmo id Gmail na MESMA caixa => duplicada; mesma mensagem (Message-ID) de OUTRA caixa => só origem, sem nova linha", () => {
  const rows = [
    { provider_message_id: "g1", message_id_header: "<A@weg.net>", mailbox_address: CARLOS, sent_at: "2026-11-27T10:00:00Z" },
    { provider_message_id: "g2", message_id_header: "<B@weg.net>", mailbox_address: CARLOS, sent_at: "2026-11-27T11:00:00Z" },
    { provider_message_id: "g3", message_id_header: "<C@weg.net>", mailbox_address: CARLOS, sent_at: "2026-11-27T09:00:00Z" },
    { provider_message_id: "g3", message_id_header: "<C@weg.net>", mailbox_address: CARLOS, sent_at: "2026-11-27T09:00:00Z" },
  ];
  const out = dedupePerMailbox(rows, { existingSameMailbox: new Set(["g1"]), existingByHeader: new Map([["<b@weg.net>", { id: "email-rey-b", mailbox_address: REY }]]) });
  assert(out.fresh.map((r) => r.provider_message_id).join() === "g3", JSON.stringify(out.fresh));
  assert(out.sameMailbox === 2 && out.crossMailbox.length === 1 && out.crossMailbox[0].emailId === "email-rey-b" && out.crossMailbox[0].mailbox === CARLOS);
});

check("D2 última mensagem importada = a mais recente por data", () => {
  assert(latestImported([{ provider_message_id: "a", sent_at: "2026-11-27T10:00:00Z" }, { provider_message_id: "b", sent_at: "2026-11-27T11:00:00Z" }])?.messageId === "b");
  assert(latestImported([]) === null);
});

// ---------------- perímetro ----------------
check("P1 domínios externos (cliente, gerenciadora, fornecedor, seguradora...) entram; AXION é interno", () => {
  const p = splitPerimeterDomains([
    { domain: "axion.com.br", domain_role: "AXION", enabled: true }, { domain: "weg.net", domain_role: "CLIENT", enabled: true },
    { domain: "gerenciadora.com.br", domain_role: "MANAGER", enabled: true }, { domain: "seguradora.com", domain_role: "INSURER", enabled: false },
  ]);
  assert(p.external.join() === "gerenciadora.com.br,weg.net" && p.internal.join() === "axion.com.br", JSON.stringify(p));
  assert(perimeterQueryTerms(["weg.net"]) === "from:weg.net to:weg.net cc:weg.net bcc:weg.net");
});

check("P2 recebida e enviada com participante @weg.net (incl. subdomínio) entram; só interno fica FORA por padrão; liga só com a opção", () => {
  const base = { externalDomains: ["weg.net"], internalDomains: ["axion.com.br"] };
  assert(classifyPerimeter({ ...base, participants: ["fulano@weg.net", CARLOS] }).eligible);
  assert(classifyPerimeter({ ...base, participants: [CARLOS, "x@br.weg.net"] }).eligible, "enviada para subdomínio");
  assert(!classifyPerimeter({ ...base, participants: [CARLOS, "x@evilweg.net"] }).eligible, "fronteira de domínio");
  const internal = classifyPerimeter({ ...base, participants: [CARLOS, JAIME] });
  assert(!internal.eligible && internal.reason === "SOMENTE_INTERNO_EXCLUIDO");
  assert(classifyPerimeter({ ...base, participants: [CARLOS, JAIME], includeInternalOnly: true }).reason === "SOMENTE_INTERNO_INCLUIDO");
  assert(domainMatches("weg.net", "weg.net") && !domainMatches("weg.net.evil.com", "weg.net"));
});

// ---------------- comparação só de metadados ----------------
check("K1 comparação Gmail x banco por ids (sem conteúdo): faltantes e só-no-banco", () => {
  const r = compareMailboxIds({ gmailIds: ["a", "b", "c", "c"], dbIds: ["b", "c", "z"] });
  assert(r.gmail === 3 && r.db === 3 && r.matched === 2 && r.missingInDb.join() === "a" && r.onlyInDb.join() === "z", JSON.stringify(r));
});

check("K2 só compara caixa com aceite AUTORIZADO, na lista e com credencial própria (Carlos/Jaime pendentes ficam fora)", () => {
  const targets = mailboxesForComparison({
    allowlist: allow(REY, CARLOS, JAIME), controls: [],
    consents: [consent(REY, "AUTORIZADO"), consent(CARLOS, "PENDENTE"), consent(JAIME, "PENDENTE")], env: ENV,
  });
  assert(targets.map((t) => t.mailbox).join() === REY && targets[0].credential.source === "OAUTH_CAIXA", JSON.stringify(targets));
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
