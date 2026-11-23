// Governador de envio de alertas (doc 35): modulo PURO, GovernedEmailProvider com ledger em memoria e verificacoes ESTRUTURAIS.
// Sem rede, sem banco, sem e-mail real (provedores FAKE). Cenarios em PGlite: scripts/test-alert-send-governor-sql.mjs.
//
// Uso: node scripts/test-alert-send-governor.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const G = await import("../apps/web/lib/email/alert-send-governor");
const { GovernedEmailProvider, AlertSendBlockedError } = await import("../apps/web/lib/email/governed-email-provider");
const { EmailSendError } = await import("../apps/web/lib/email/email-provider");
const { FakeEmailProvider } = await import("../apps/web/lib/email/fake-email-provider");
const { classifySendFailure } = await import("../apps/web/lib/email/outbound-delivery");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
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
const assert = (c, m = "asserção falhou") => {
  if (!c) throw new Error(m);
};

const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2027-03-01T12:00:00.000Z");

/** Ledger em memoria com a MESMA semantica do adaptador SQL (liquido = ADMITTED sem RELEASED). */
function memoryLedger() {
  const rows = [];
  const net = (list) => {
    const released = new Set(list.filter((r) => r.action === G.GOVERNOR_ACTIONS.RELEASED).map((r) => r.entityId));
    return new Set(list.filter((r) => r.action === G.GOVERNOR_ACTIONS.ADMITTED && !released.has(r.entityId)).map((r) => r.entityId));
  };
  return {
    rows,
    async rankOfNetAdmission(sinceIso, entityId) {
      const since = Date.parse(sinceIso);
      const ids = [...net(rows.filter((r) => r.t >= since))]; // ordem de inserção (equivale a occurred_at crescente no banco)
      const i = ids.indexOf(entityId);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i + 1;
    },
    async countNetAdmissions(sinceIso) {
      return this.netCount(sinceIso);
    },
    async netCount(sinceIso) {
      const since = Date.parse(sinceIso);
      return net(rows.filter((r) => r.t >= since)).size;
    },
    async hasNetAdmissionForKey(hash, sinceIso) {
      const since = Date.parse(sinceIso);
      return net(rows.filter((r) => r.t >= since && r.entityId.startsWith(`${hash}.`))).size > 0;
    },
    async record(e) {
      rows.push({ ...e, t: NOW.getTime() });
    },
  };
}
let seq = 0;
const newId = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

class CountingFake extends FakeEmailProvider {
  sent = [];
  async send(input) {
    const r = await super.send(input);
    this.sent.push(input);
    return r;
  }
}
const msg = (over = {}) => ({
  to: "colab@axion.com.br",
  subject: "Alerta",
  text: "corpo",
  correlationId: "c-1",
  governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: "k-1" },
  ...over,
});
const govern = (env, ledger, inner = new CountingFake()) => ({
  inner,
  ledger,
  provider: new GovernedEmailProvider({ inner, env: () => env, ledger: () => ledger, now: () => NOW, newId }),
});
const PILOT_ENV = { AXION_EMAIL_PROVIDER: "fake", ACC_OUTBOUND_MODE: "pilot", ACC_PILOT_RECIPIENT: "crm@axion.com.br" };

// Ambiente do piloto para TODO o script (a trava de saída do provedor FAKE exige; nenhum envio real existe aqui).
Object.assign(process.env, PILOT_ENV);

function withProcessEnv(extra, fn) {
  const prev = { ...process.env };
  Object.assign(process.env, extra);
  return fn().finally(() => {
    for (const k of Object.keys(process.env)) if (!(k in prev)) delete process.env[k];
    Object.assign(process.env, prev);
  });
}

// ------------------------------------------------------------------ configuracao
await check("padrão (variáveis ausentes): sem restrição, fontes legadas habilitadas, reservadas bloqueadas, sem uso de ledger", () => {
  const c = G.parseGovernorConfig({});
  assert(c.invalid.length === 0 && !c.killSwitch && c.maxPerHour === null && c.maxPerDay === null && c.batchSize === null && c.enabledProjects === null && c.enabledTypes === null);
  assert(!G.ledgerRequired(c));
  for (const t of Object.keys(G.ALERT_TYPE_CATALOG)) {
    const d = G.evaluateStaticPolicy(c, { type: t, projectId: P1 });
    const reserved = G.RESERVED_ALERT_SOURCES.includes(G.ALERT_TYPE_CATALOG[t]);
    assert(d.allow === !reserved, `${t}: allow=${d.allow}`);
    if (reserved) assert(d.reason === "SOURCE_NOT_ENABLED");
  }
});
await check("valores inválidos bloqueiam tudo (fail-closed) e informam a variável", () => {
  const bad = [
    { ACC_ALERT_KILL_SWITCH: "TRUE" }, { ACC_ALERT_KILL_SWITCH: "1" }, { ACC_ALERT_MAX_PER_HOUR: "-1" }, { ACC_ALERT_MAX_PER_HOUR: "abc" }, { ACC_ALERT_MAX_PER_HOUR: "" },
    { ACC_ALERT_MAX_PER_DAY: "1.5" }, { ACC_ALERT_BATCH_SIZE: "0" }, { ACC_ALERT_ENABLED_PROJECTS: "nao-e-uuid" }, { ACC_ALERT_ENABLED_PROJECTS: `${P1},` }, { ACC_ALERT_ENABLED_PROJECTS: "" },
    { ACC_ALERT_ENABLED_SOURCES: "RISCO,INEXISTENTE" }, { ACC_ALERT_ENABLED_SOURCES: "" }, { ACC_ALERT_ENABLED_TYPES: "RISK_IMMEDIATE,XYZ" },
  ];
  for (const env of bad) {
    const c = G.parseGovernorConfig(env);
    assert(c.invalid.length > 0, `aceitou ${JSON.stringify(env)}`);
    const d = G.evaluateStaticPolicy(c, { type: "RISK_IMMEDIATE", projectId: P1 });
    assert(!d.allow && d.reason === "INVALID_CONFIG", `não bloqueou ${JSON.stringify(env)}`);
  }
  assert(G.parseGovernorConfig({ ACC_ALERT_MAX_PER_HOUR: "0" }).maxPerHour === 0, "0 é válido (bloqueia tudo)");
});
await check("kill switch bloqueia tudo; só o valor exato true; false/ausente não bloqueia", () => {
  const on = G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_ALERT_KILL_SWITCH: "true" }), { type: "SYSTEM_HEALTH", projectId: P1 });
  assert(!on.allow && on.reason === "KILL_SWITCH");
  assert(G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_ALERT_KILL_SWITCH: "false" }), { type: "SYSTEM_HEALTH", projectId: P1 }).allow);
});
await check("habilitação progressiva: projeto, fonte e tipo (allowlists); combinação das três", () => {
  const c = G.parseGovernorConfig({ ACC_ALERT_ENABLED_PROJECTS: P1.toUpperCase(), ACC_ALERT_ENABLED_SOURCES: "RISCO,SSMA", ACC_ALERT_ENABLED_TYPES: "RISK_IMMEDIATE,SSMA_ACCIDENT" });
  assert(c.invalid.length === 0);
  assert(G.evaluateStaticPolicy(c, { type: "RISK_IMMEDIATE", projectId: P1 }).allow, "habilitado deve passar (UUID sem diferenciar caixa)");
  assert(G.evaluateStaticPolicy(c, { type: "RISK_IMMEDIATE", projectId: P2 }).reason === "PROJECT_NOT_ENABLED");
  assert(G.evaluateStaticPolicy(c, { type: "RISK_IMMEDIATE", projectId: null }).reason === "PROJECT_NOT_ENABLED");
  assert(G.evaluateStaticPolicy(c, { type: "WEEKLY_DIGEST", projectId: P1 }).reason === "SOURCE_NOT_ENABLED");
  assert(G.evaluateStaticPolicy(c, { type: "RISK_ESCALATION", projectId: P1 }).reason === "TYPE_NOT_ENABLED");
  assert(G.evaluateStaticPolicy(c, undefined).reason === "NO_GOVERNANCE_CONTEXT");
  assert(G.evaluateStaticPolicy(c, { type: null, projectId: P1 }).reason === "TYPE_UNKNOWN");
  assert(G.evaluateStaticPolicy(c, { type: "NAO_EXISTE", projectId: P1 }).reason === "TYPE_UNKNOWN");
  const open = G.parseGovernorConfig({ ACC_ALERT_ENABLED_SOURCES: "CRONOGRAMA" });
  assert(G.evaluateStaticPolicy(open, { type: "SCHEDULE_ALERT", projectId: P1 }).allow, "fonte reservada abre só por habilitação explícita");
  assert(G.evaluateStaticPolicy(open, { type: "RISK_IMMEDIATE", projectId: P1 }).reason === "SOURCE_NOT_ENABLED", "lista explícita substitui o padrão legado");
});
await check("modo production exige allowlist de projetos E limite; piloto/qualquer outro valor não", () => {
  const ctx = { type: "RISK_IMMEDIATE", projectId: P1 };
  assert(G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_OUTBOUND_MODE: "production" }), ctx).reason === "PRODUCTION_REQUIRES_ALLOWLIST_AND_LIMIT");
  assert(G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_OUTBOUND_MODE: "production", ACC_ALERT_ENABLED_PROJECTS: P1 }), ctx).reason === "PRODUCTION_REQUIRES_ALLOWLIST_AND_LIMIT");
  assert(G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_OUTBOUND_MODE: "production", ACC_ALERT_MAX_PER_HOUR: "5" }), ctx).reason === "PRODUCTION_REQUIRES_ALLOWLIST_AND_LIMIT");
  assert(G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_OUTBOUND_MODE: "production", ACC_ALERT_ENABLED_PROJECTS: P1, ACC_ALERT_MAX_PER_HOUR: "5" }), ctx).allow);
  for (const mode of ["pilot", "PRODUCTION", "Production ", "", undefined]) assert(G.evaluateStaticPolicy(G.parseGovernorConfig({ ACC_OUTBOUND_MODE: mode }), ctx).allow, `modo ${JSON.stringify(mode)}`);
});
await check("tipos de risco: mapeamento do notification_type da outbox; desconhecido => null (bloqueia)", () => {
  for (const t of ["IMMEDIATE", "ESCALATION", "DIGEST", "FORWARD", "RETURNED", "EXPERT_ANSWER", "ACTION_CONFIRMATION"]) assert(G.riskAlertGovernanceType(t) === `RISK_${t}`);
  assert(G.riskAlertGovernanceType("IMMEDIATE", true) === "RISK_PILOT_SINGLE");
  assert(G.riskAlertGovernanceType("OUTRO") === null);
});

// ------------------------------------------------------------------ lotes
await check("lote por execução: capBatchSize nunca aumenta; chunkIntoBatches divide lote maior que o tamanho", () => {
  assert(G.capBatchSize(50, { batchSize: null }) === 50 && G.capBatchSize(50, { batchSize: 10 }) === 10 && G.capBatchSize(3, { batchSize: 10 }) === 3);
  const items = Array.from({ length: 25 }, (_, i) => i);
  const batches = G.chunkIntoBatches(items, 10);
  assert(batches.length === 3 && batches.map((b) => b.length).join() === "10,10,5" && batches.flat().join() === items.join(), "divisão incorreta");
  assert(G.chunkIntoBatches(items, null).length === 1 && G.chunkIntoBatches([], 10).length === 0);
  assert(G.chunkIntoBatches(items, 0).length === 25, "tamanho inválido => 1 por lote");
});

// ------------------------------------------------------------------ provedor governado
await check("padrão (sem variáveis): envia como antes, sem tocar no ledger, preservando a trava do piloto (destino efetivo = caixa do piloto)", () =>
  withProcessEnv(PILOT_ENV, async () => {
    const guarded = [];
    const ledger = memoryLedger();
    const inner = new FakeEmailProvider({ onGuardedInput: (g) => guarded.push(g) });
    const p = new GovernedEmailProvider({ inner, env: () => ({}), ledger: () => ledger, now: () => NOW, newId });
    const r = await p.send(msg({ to: "colab.real@axion.com.br" }));
    assert(r.providerMessageId, "sem resultado");
    assert(ledger.rows.length === 0, "tocou no ledger no caminho padrão");
    assert(guarded.length === 1 && guarded[0].to === "crm@axion.com.br", `destino efetivo ${guarded[0]?.to} (a trava do piloto deve redirecionar)`);
  }));
await check("abaixo do limite envia e registra admissão; NO limite suprime, audita e NADA chega ao provedor interno", async () => {
  const { provider, inner, ledger } = govern({ ACC_ALERT_MAX_PER_HOUR: "2" }, memoryLedger());
  await provider.send(msg({ governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: "a" } }));
  await provider.send(msg({ governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: "b" } }));
  assert(inner.sent.length === 2);
  let err;
  await provider.send(msg({ governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: "c" } })).catch((e) => (err = e));
  assert(err instanceof AlertSendBlockedError && err instanceof EmailSendError && err.reason === "HOURLY_LIMIT", `erro ${err?.message}`);
  assert(inner.sent.length === 2, "enviou acima do limite");
  const sup = ledger.rows.filter((r) => r.action === G.GOVERNOR_ACTIONS.SUPPRESSED);
  assert(sup.length === 1 && sup[0].detail.reason === "HOURLY_LIMIT" && sup[0].projectId === P1, "supressão não auditada");
  assert((await ledger.netCount(new Date(NOW.getTime() - 3600e3).toISOString())) === 2, "a admissão excedente deveria ter sido devolvida");
  assert(classifySendFailure(err) === "RETRYABLE", "bloqueio do governador deve ser retentável (não terminal)");
});
await check("limite diário independente do horário", async () => {
  const { provider, inner } = govern({ ACC_ALERT_MAX_PER_DAY: "1" }, memoryLedger());
  await provider.send(msg({ governance: { type: "WEEKLY_DIGEST", projectId: P1 } }));
  const e = await provider.send(msg({ governance: { type: "WEEKLY_DIGEST", projectId: P1 } })).catch((x) => x);
  assert(e.reason === "DAILY_LIMIT" && inner.sent.length === 1);
});
await check("limite 0, kill switch, projeto/fonte/tipo não habilitados e config inválida bloqueiam ANTES do provedor e auditam", async () => {
  const cases = [
    [{ ACC_ALERT_MAX_PER_HOUR: "0" }, "HOURLY_LIMIT"],
    [{ ACC_ALERT_KILL_SWITCH: "true" }, "KILL_SWITCH"],
    [{ ACC_ALERT_ENABLED_PROJECTS: P2 }, "PROJECT_NOT_ENABLED"],
    [{ ACC_ALERT_ENABLED_SOURCES: "SSMA" }, "SOURCE_NOT_ENABLED"],
    [{ ACC_ALERT_ENABLED_TYPES: "RISK_DIGEST" }, "TYPE_NOT_ENABLED"],
    [{ ACC_ALERT_MAX_PER_HOUR: "x" }, "INVALID_CONFIG"],
  ];
  for (const [env, reason] of cases) {
    const { provider, inner, ledger } = govern(env, memoryLedger());
    const e = await provider.send(msg()).catch((x) => x);
    assert(e instanceof AlertSendBlockedError && e.reason === reason, `${JSON.stringify(env)} -> ${e?.reason ?? "enviou"}`);
    assert(inner.sent.length === 0, "chegou ao provedor");
    assert(ledger.rows.some((r) => r.action === G.GOVERNOR_ACTIONS.SUPPRESSED && r.detail.reason === reason), `supressão não auditada (${reason})`);
  }
});
await check("sem contexto de governança: bloqueia (fail-closed); sem projeto com limite ativo: bloqueia", async () => {
  const a = govern({}, memoryLedger());
  const e1 = await a.provider.send({ to: "x@axion.com.br", subject: "s", text: "t", correlationId: "c" }).catch((x) => x);
  assert(e1.reason === "NO_GOVERNANCE_CONTEXT" && a.inner.sent.length === 0);
  const b = govern({ ACC_ALERT_MAX_PER_HOUR: "5" }, memoryLedger());
  const e2 = await b.provider.send(msg({ governance: { type: "SYSTEM_HEALTH", projectId: null } })).catch((x) => x);
  assert(e2.reason === "NO_PROJECT_CONTEXT" && b.inner.sent.length === 0);
});
await check("ledger indisponível com limite ativo: fail-closed (nada enviado)", async () => {
  const inner = new CountingFake();
  const p = new GovernedEmailProvider({ inner, env: () => ({ ACC_ALERT_MAX_PER_HOUR: "5" }), ledger: () => { throw new Error("db down"); }, now: () => NOW, newId });
  const e = await p.send(msg()).catch((x) => x);
  assert(e.reason === "LEDGER_UNAVAILABLE" && inner.sent.length === 0);
  const p2 = new GovernedEmailProvider({ inner, env: () => ({ ACC_ALERT_MAX_PER_HOUR: "5" }), now: () => NOW, newId });
  assert((await p2.send(msg()).catch((x) => x)).reason === "LEDGER_UNAVAILABLE", "sem fábrica de ledger");
});
await check("deduplicação: mesmo evento (dedupKey) não é admitido duas vezes; falha CERTA devolve a cota e permite nova tentativa; falha INCERTA não", async () => {
  const ledger = memoryLedger();
  let mode = "ok";
  const sent = [];
  const inner = {
    async send(input) {
      if (mode === "fail") throw new EmailSendError("falha", { classification: "DEFINITIVE" });
      if (mode === "uncertain") throw new EmailSendError("incerto", { classification: "UNCERTAIN" });
      sent.push(input);
      return { provider: "fake", from: "f", providerMessageId: "m", providerThreadId: "t", messageIdHeader: "h", sentAt: NOW.toISOString() };
    },
  };
  const p = new GovernedEmailProvider({ inner, env: () => ({ ACC_ALERT_MAX_PER_HOUR: "10" }), ledger: () => ledger, now: () => NOW, newId });
  const gov = (k) => msg({ governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: k } });
  mode = "fail";
  await p.send(gov("evt-1")).catch(() => {});
  mode = "ok";
  await p.send(gov("evt-1")); // permitido: a tentativa anterior com certeza não saiu (cota devolvida)
  assert(sent.length === 1);
  const dup = await p.send(gov("evt-1")).catch((x) => x);
  assert(dup.reason === "DUPLICATE" && sent.length === 1, "reenvio do mesmo evento deveria ser barrado");
  mode = "uncertain";
  await p.send(gov("evt-2")).catch(() => {});
  mode = "ok";
  const again = await p.send(gov("evt-2")).catch((x) => x);
  assert(again.reason === "DUPLICATE" && sent.length === 1, "falha incerta: nunca reenviar");
});
await check("duas instâncias no limite (concorrência): nunca excede o limite", async () => {
  const ledger = memoryLedger();
  const inner = new CountingFake();
  const mk = () => new GovernedEmailProvider({ inner, env: () => ({ ACC_ALERT_MAX_PER_HOUR: "3" }), ledger: () => ledger, now: () => NOW, newId });
  const a = mk();
  const b = mk();
  await Promise.all(Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).send(msg({ governance: { type: "RISK_DIGEST", projectId: P1, dedupKey: `k${i}` } })).catch(() => null)));
  // Disputa simultânea: desempate determinístico (inserir primeiro, ranquear depois) => EXATAMENTE as 3 primeiras seguem, as demais recuam.
  assert(inner.sent.length === 3, `enviou ${inner.sent.length}, esperado exatamente 3`);
  assert((await ledger.netCount(new Date(NOW.getTime() - 3600e3).toISOString())) === 3, "cota líquida diferente do limite");
});
await check("o governador nunca afrouxa a trava do piloto: mesmo habilitado, o destino continua o da caixa do piloto", () =>
  withProcessEnv(PILOT_ENV, async () => {
    const guarded = [];
    const inner = new FakeEmailProvider({ onGuardedInput: (g) => guarded.push(g) });
    const env = { ACC_OUTBOUND_MODE: "production", ACC_ALERT_ENABLED_PROJECTS: P1, ACC_ALERT_MAX_PER_HOUR: "9" };
    const p = new GovernedEmailProvider({ inner, env: () => env, ledger: () => memoryLedger(), now: () => NOW, newId });
    await p.send(msg({ to: "colab.real@axion.com.br" }));
    assert(guarded[0].to === "crm@axion.com.br", `trava afrouxada: ${guarded[0].to}`);
  }));

await check("CRÍTICO: reserva de cota só para críticos; crítico nunca descartado (adiado, não suprimido); kill switch bloqueia inclusive crítico; piloto intacto", async () => {
  const env = { ACC_ALERT_MAX_PER_HOUR: "3", ACC_ALERT_CRITICAL_RESERVE_PER_HOUR: "2" };
  const { provider, inner, ledger } = govern(env, memoryLedger());
  const common = (k) => msg({ governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: k } });
  const crit = (k) => msg({ governance: { type: "RISK_IMMEDIATE", projectId: P1, dedupKey: k, priority: "CRITICAL" } });
  await provider.send(common("c1")); // comum: usa só 1 (3 - reserva 2)
  const e = await provider.send(common("c2")).catch((x) => x);
  assert(e.reason === "HOURLY_LIMIT", "comum deveria ficar de fora da reserva");
  assert(!(await provider.checkCapacity(common("c3").governance)).allowed, "portão deveria adiar o comum");
  assert((await provider.checkCapacity(crit("k1").governance)).allowed, "portão deveria admitir o crítico (reserva)");
  await provider.send(crit("k1"));
  await provider.send(crit("k2"));
  assert(inner.sent.length === 3, `enviados ${inner.sent.length}`);
  assert(!(await provider.checkCapacity(crit("k3").governance)).allowed, "limite cheio: crítico também só é ADIADO (portão), nunca descartado");
  const deferred = ledger.rows.filter((r) => r.action === G.GOVERNOR_ACTIONS.DEFERRED);
  assert(deferred.length >= 1 && deferred.some((r) => r.detail.priority === "CRITICAL") && deferred.every((r) => r.detail.outcome === "ADIADO"), "adiamento não auditado como ADIADO");
  // kill switch: bloqueia tudo, inclusive crítico (portão e envio)
  const ks = govern({ ACC_ALERT_KILL_SWITCH: "true" }, memoryLedger());
  assert(!(await ks.provider.checkCapacity(crit("z").governance)).allowed);
  assert((await ks.provider.send(crit("z")).catch((x) => x)).reason === "KILL_SWITCH" && ks.inner.sent.length === 0);
  // sem variáveis: portão sempre permite e não grava nada (padrão do piloto)
  const d = govern({}, memoryLedger());
  assert((await d.provider.checkCapacity(common("d").governance)).allowed && d.ledger.rows.length === 0);
});
await check("portão duck-typed: provedor sem checkCapacity (FAKE/Gmail direto) sempre permite (comportamento anterior)", async () => {
  const { checkAlertCapacity } = await import("../apps/web/lib/email/governed-email-provider");
  assert((await checkAlertCapacity(new FakeEmailProvider(), { type: "RISK_IMMEDIATE", projectId: P1 })).allowed);
});

// ------------------------------------------------------------------ estrutural
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next") continue;
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}
const rel = (f) => path.relative(repoRoot, f).replace(/\\/g, "/");
await check("estrutural: getEmailProvider() sempre devolve o GovernedEmailProvider (ponto único); ninguém instancia GmailEmailProvider fora dele", () => {
  const src = readFileSync(path.join(repoRoot, "apps/web/lib/email/get-email-provider.ts"), "utf8");
  assert(/new GovernedEmailProvider\(/.test(src) && !/return new GmailEmailProvider/.test(src), "get-email-provider.ts não envolve o provedor");
  const offenders = walk(path.join(repoRoot, "apps/web")).filter((f) => !/get-email-provider\.ts$|gmail-email-provider\.ts$|\.test\./.test(f) && /new GmailEmailProvider\(/.test(readFileSync(f, "utf8")));
  assert(offenders.length === 0, `instanciam GmailEmailProvider fora do ponto único: ${offenders.map(rel).join(", ")}`);
});
await check("estrutural: todo envio de e-mail em apps/web carrega `governance:` com tipo do catálogo", () => {
  const files = walk(path.join(repoRoot, "apps/web")).filter((f) => !/(gmail-email-provider|fake-email-provider|governed-email-provider)\.ts$/.test(f));
  const missing = [];
  let found = 0;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const re = /\b(?:provider|getEmailProvider\(\))\.send\(\{/g;
    let m;
    while ((m = re.exec(src))) {
      found += 1;
      const block = src.slice(m.index, m.index + 1800);
      const end = block.search(/\n\s*\}\);/);
      const body = end > 0 ? block.slice(0, end) : block;
      if (!/governance[:,]/.test(body)) missing.push(`${rel(f)}@${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert(found >= 12, `esperava >= 12 pontos de envio, achei ${found}`);
  assert(missing.length === 0, `envios sem governance: ${missing.join(", ")}`);
  const used = new Set();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/governance: \{ type: "([A-Z_]+)"/g)) used.add(m[1]);
  for (const t of used) assert(Object.prototype.hasOwnProperty.call(G.ALERT_TYPE_CATALOG, t), `tipo fora do catálogo: ${t}`);
});
await check("estrutural: o módulo do governador é puro e não importa nem lê a trava do piloto", () => {
  const strip = (s) => s.replace(/\/\/.*$/gm, "");
  const src = strip(readFileSync(path.join(repoRoot, "apps/web/lib/email/alert-send-governor.ts"), "utf8"));
  assert(!/pilot-outbound-guard|server-only|process\.env/.test(src), "módulo impuro ou acoplado à trava");
  const prov = strip(readFileSync(path.join(repoRoot, "apps/web/lib/email/governed-email-provider.ts"), "utf8"));
  assert(!/pilot-outbound-guard|applyPilotOutboundGuard/.test(prov), "o provedor governado não pode tocar na trava");
});

console.log(`\n${passed} OK, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
