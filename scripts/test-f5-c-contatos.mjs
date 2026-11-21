// FASE 5 / C — testes SEM banco: resolução pura (resolveFromRows), cálculos da tela (atividade, cobertura, múltiplos vínculos,
// domínio compartilhado) e verificações estáticas das migrations/tela/ações. A prova em PostgreSQL real está em test-f5-c-contatos-realpg.mjs.
// Uso: node scripts/test-f5-c-contatos.mjs
import { readFileSync, existsSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const R = await import("../apps/web/lib/external-parties/resolve.ts");
const O = await import("../apps/web/lib/external-parties/overview.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = (p) => readFileSync(path.join(root, p), "utf8");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`OK   ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL ${name}\n     ${String(e.message).split("\n")[0].slice(0, 500)}`); }
}
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: esperado ${JSON.stringify(b)}, obtido ${JSON.stringify(a)}`); };

const NOW = new Date("2026-11-21T12:00:00Z");
const link = (org, over = {}) => ({ organization_id: org, org_kind: "FORNECEDOR", role_in_project: "FORNECEDOR", status: "ACTIVE", delegation_scope: [], valid_from: "2026-01-01", valid_until: null, ...over });
const UNKNOWN = { matches: [], ambiguous: false, domain_shared: false, known: false };

await check("resolveFromRows: domínio da organização com vínculo ACTIVE => known, escopo e vigência", () => {
  const rows = { links: [link("g", { org_kind: "GERENCIADORA", role_in_project: "GERENCIADORA", delegation_scope: ["OS_ROTINA"] })], domains: [{ organization_id: "g", domain: "ger.com.br", active: true }], contacts: [] };
  const r = R.resolveFromRows(rows, "Fulano@GER.com.br", NOW);
  eq([r.known, r.ambiguous, r.domain_shared, r.matches.length, r.matches[0].valid_now], [true, false, false, 1, true], "resultado");
  ok(R.hasDelegatedScope(r, "OS_ROTINA"), "escopo delegado");
  ok(!R.hasDelegatedScope(r, "ADITIVO_PRAZO"), "escopo não delegado NUNCA autorizado (oficialidade != autoridade)");
});

await check("resolveFromRows fail-closed: e-mail inválido, injeção, sem vínculo, vínculo ENDED, domínio inativo", () => {
  const rows = { links: [link("a"), link("e", { status: "ENDED" })], domains: [{ organization_id: "a", domain: "x.com.br", active: false }, { organization_id: "e", domain: "y.com.br", active: true }], contacts: [] };
  for (const e of ["lixo", "a@b.com\r\nBcc: z@z.com", null, undefined, 42, "a@example.com"]) eq(R.resolveFromRows(rows, e, NOW), UNKNOWN, `inválido ${JSON.stringify(e)}`);
  eq(R.resolveFromRows(rows, "p@x.com.br", NOW), UNKNOWN, "domínio inativo");
  eq(R.resolveFromRows(rows, "p@y.com.br", NOW), UNKNOWN, "vínculo ENDED");
  eq(R.resolveFromRows({ links: [], domains: [], contacts: [] }, "p@y.com.br", NOW), UNKNOWN, "sem vínculos");
});

await check("resolveFromRows: CANDIDATE não é known; vencido não é vigente; contato REJECTED não casa; futuro não é vigente", () => {
  const base = { domains: [{ organization_id: "a", domain: "x.com.br", active: true }], contacts: [] };
  let r = R.resolveFromRows({ ...base, links: [link("a", { status: "CANDIDATE" })] }, "p@x.com.br", NOW);
  eq([r.known, r.matches[0].link_status, r.matches[0].valid_now], [false, "CANDIDATE", false], "candidato");
  r = R.resolveFromRows({ ...base, links: [link("a", { valid_until: "2026-06-30" })] }, "p@x.com.br", NOW);
  eq([r.known, r.matches[0].valid_now], [true, false], "vencido");
  r = R.resolveFromRows({ ...base, links: [link("a", { valid_from: "2027-01-01" })] }, "p@x.com.br", NOW);
  eq(r.matches[0].valid_now, false, "ainda não vigente");
  r = R.resolveFromRows({ ...base, links: [link("a")], contacts: [{ organization_id: "a", email: "p@x.com.br", status: "REJECTED" }] }, "p@x.com.br", NOW);
  eq(r.matches.length, 0, "rejeitado");
});

await check("resolveFromRows: domínio compartilhado => ambiguous/domain_shared; nunca autoriza escopo", () => {
  const rows = { links: [link("a", { delegation_scope: ["OS_ROTINA"] }), link("b", { delegation_scope: ["OS_ROTINA"] })],
    domains: [{ organization_id: "a", domain: "grupo.com.br", active: true }, { organization_id: "b", domain: "grupo.com.br", active: true }], contacts: [] };
  const r = R.resolveFromRows(rows, "x@grupo.com.br", NOW);
  eq([r.ambiguous, r.domain_shared, r.matches.length], [true, true, 2], "duas organizações");
  ok(!R.hasDelegatedScope(r, "OS_ROTINA"), "ambíguo nunca autoriza");
  // Só uma das organizações vinculada ao projeto, domínio compartilhado no tenant, sem contato exato: ainda ambíguo.
  const r2 = R.resolveFromRows({ ...rows, links: [rows.links[0]] }, "x@grupo.com.br", NOW);
  eq([r2.ambiguous, r2.domain_shared, r2.matches.length], [true, true, 1], "compartilhado com 1 vínculo");
  // Contato confirmado exato desempata quando só uma organização casa.
  const r3 = R.resolveFromRows({ links: [rows.links[0]], domains: rows.domains, contacts: [{ organization_id: "a", email: "x@grupo.com.br", status: "CONFIRMED" }] }, "x@grupo.com.br", NOW);
  eq([r3.ambiguous, r3.domain_shared], [false, true], "desempate por contato exato");
});

await check("resolveExternalParty (wrapper): erro, forma inesperada, exceção e nulos => UNKNOWN; resposta válida é repassada", async () => {
  const mk = (res) => ({ rpc: () => res });
  eq(await R.resolveExternalParty(mk(Promise.resolve({ data: null, error: { message: "x" } })), "p", "a@b.com.br"), UNKNOWN, "erro");
  eq(await R.resolveExternalParty(mk(Promise.resolve({ data: "oi", error: null })), "p", "a@b.com.br"), UNKNOWN, "string");
  eq(await R.resolveExternalParty(mk(Promise.resolve({ data: { known: true }, error: null })), "p", "a@b.com.br"), UNKNOWN, "forma incompleta");
  eq(await R.resolveExternalParty({ rpc: () => { throw new Error("boom"); } }, "p", "a@b.com.br"), UNKNOWN, "exceção");
  const good = { matches: [], ambiguous: false, domain_shared: false, known: false };
  eq(await R.resolveExternalParty(mk(Promise.resolve({ data: good, error: null })), "p", "a@b.com.br"), good, "válida");
});

await check("overview.extractAddresses / isMissingRelation", () => {
  eq(O.extractAddresses('"Ana" <Ana@X.com.br>, bob@y.com.br; ana@x.com.br'), ["ana@x.com.br", "bob@y.com.br"], "endereços");
  eq(O.extractAddresses(null), [], "nulo");
  ok(O.isMissingRelation({ code: "42P01" }) && O.isMissingRelation({ code: "PGRST205" }) && O.isMissingRelation({ message: 'relation "x" does not exist' }), "tabela ausente");
  ok(!O.isMissingRelation({ code: "42501", message: "permission denied" }) && !O.isMissingRelation(null), "outros erros não são 'ausente'");
});

await check("overview.buildOrgActivity: atribui só quando não ambíguo; compartilhado => ambígua; sem casamento => sem vínculo; sinais por pilar; SEM DADOS", () => {
  const orgs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const links = [{ organization_id: "a", status: "ACTIVE" }, { organization_id: "b", status: "ACTIVE" }, { organization_id: "c", status: "ENDED" }];
  const domains = [{ organization_id: "a", domain: "a.com.br", active: true }, { organization_id: "a", domain: "comum.com.br", active: true }, { organization_id: "b", domain: "comum.com.br", active: true }, { organization_id: "c", domain: "c.com.br", active: true }];
  const contacts = [{ organization_id: "b", email: "joao@comum.com.br", status: "CONFIRMED" }, { organization_id: "a", email: "spam@a.com.br", status: "REJECTED" }];
  const emails = [
    { id: "1", from_address: "x@a.com.br", to_address: "eu@axion.com.br", sent_at: "2026-11-01T10:00:00Z" },
    { id: "2", from_address: "eu@axion.com.br", to_address: "Ana <y@A.com.br>, z@a.com.br", sent_at: "2026-11-03T10:00:00Z" },
    { id: "3", from_address: "alguem@comum.com.br", to_address: "eu@axion.com.br", sent_at: "2026-11-04T10:00:00Z" },
    { id: "4", from_address: "joao@comum.com.br", to_address: "eu@axion.com.br", sent_at: "2026-11-05T10:00:00Z" },
    { id: "5", from_address: "x@c.com.br", to_address: "eu@axion.com.br", sent_at: "2026-11-06T10:00:00Z" },
    { id: "6", from_address: "spam@a.com.br", to_address: "eu@axion.com.br", sent_at: "2026-11-07T10:00:00Z" },
    { id: "7", from_address: "x@a.com.br", to_address: "joao@comum.com.br", sent_at: "2026-11-08T10:00:00Z" },
  ];
  const signals = [{ email_id: "1", pillar: "PRAZO", alert_case_id: "k1" }, { email_id: "2", pillar: "CUSTO", alert_case_id: null }, { email_id: "4", pillar: "PRAZO", alert_case_id: null }, { email_id: "3", pillar: "PRAZO", alert_case_id: "k2" }];
  const r = O.buildOrgActivity({ orgs, links, domains, contacts, emails, signals });
  eq(r.byOrg.get("a").messages, 2, "a: msgs 1 e 2 (a 6 rejeitada, a 7 ambígua entre a e b)");
  eq(r.byOrg.get("b").messages, 1, "b: contato exato desempata (4)");
  eq(r.byOrg.get("c").messages, 0, "vínculo ENDED não atribui");
  eq(r.ambiguousMessages, 2, "ambíguas: 3 (domínio compartilhado sem contato) e 7 (a.com.br + joao@comum)");
  eq(r.unattributedMessages, 2, "sem vínculo: 5 (ENDED) e 6 (rejeitado)");
  eq([r.byOrg.get("a").risk_signals, r.byOrg.get("a").alerts_originated, r.byOrg.get("a").by_pillar], [2, 1, { PRAZO: 1, CUSTO: 1 }], "sinais de a");
  eq(r.byOrg.get("a").last_message_at, "2026-11-03T10:00:00Z", "última mensagem");
  eq(O.buildOrgActivity({ orgs, links, domains, contacts, emails, signals: null }).byOrg.get("a").risk_signals, null, "tabela de sinais indisponível => null (SEM DADOS)");
});

await check("overview.summarizeCoverage: SEM DADOS sem execução/sem tabela; última reconciliação por caixa; percentual", () => {
  eq(O.summarizeCoverage(null).state, "SEM_DADOS", "tabela ausente");
  eq(O.summarizeCoverage([]).state, "SEM_DADOS", "sem execuções");
  const run = (id, mailbox, created_at, p, e) => ({ id, provider: "GMAIL", mailbox, period_start: null, period_end: null, universe_count: 100, eligible_count: e, processed_count: p, excluded_count: 1, failed_count: 0, status: "OK", created_at });
  const c = O.summarizeCoverage([run("1", "m1@axion.com.br", "2026-11-01T00:00:00Z", 10, 50), run("2", "m1@axion.com.br", "2026-11-10T00:00:00Z", 40, 50), run("3", "m2@axion.com.br", "2026-11-05T00:00:00Z", 50, 50)]);
  eq([c.state, c.runs, c.eligible, c.processed, c.processedPct, c.last.id], ["OK", 2, 100, 90, 90, "2"], "agregado");
  eq(O.summarizeCoverage([{ ...run("4", "m@axion.com.br", "2026-11-01T00:00:00Z", 0, 0) }]).processedPct, null, "sem elegíveis => sem percentual");
});

await check("overview.multiLinkOrgs / sharedDomains", () => {
  eq([...O.multiLinkOrgs([{ organization_id: "a", status: "ACTIVE" }, { organization_id: "a", status: "CANDIDATE" }, { organization_id: "b", status: "ACTIVE" }, { organization_id: "b", status: "ENDED" }])], ["a"], "múltiplos");
  eq([...O.sharedDomains([{ organization_id: "a", domain: "x.com", active: true }, { organization_id: "b", domain: "x.com", active: true }, { organization_id: "c", domain: "y.com", active: true }, { organization_id: "d", domain: "y.com", active: false }])], ["x.com"], "compartilhados");
});

await check("migrations: idempotentes, SECURITY DEFINER com search_path vazio, RLS ligada, sem escrita direta, auditoria append-only, sem segredos nem envio", () => {
  const c = read("supabase/migrations/20261203100000_external_parties_contract.sql");
  const m = read("supabase/migrations/20261203110000_external_parties_management.sql");
  for (const t of ["external_organizations", "external_org_domains", "external_contacts", "external_org_project_links", "external_contact_candidates", "external_contacts_audit"]) {
    ok(new RegExp(`create table if not exists public\\.${t}\\b`).test(c), `${t} idempotente`);
    ok(new RegExp(`alter table public\\.${t} enable row level security`).test(c), `${t} com RLS`);
  }
  ok(/revoke all on public\.external_organizations[\s\S]*from public, anon, authenticated/.test(c), "revoga escrita direta");
  ok(/grant select on public\.external_organizations/.test(c) && !/grant (insert|update|delete)[^;]*to authenticated/i.test(c), "authenticated só lê");
  ok(/external_contacts_audit_no_update[\s\S]*before update or delete/.test(c) && /before truncate/.test(c), "auditoria append-only");
  for (const src of [c, m]) {
    const defs = src.match(/create or replace function[\s\S]*?\$\$;/g) ?? [];
    ok(defs.length > 0, "funções");
    for (const d of defs) if (/security definer/i.test(d)) ok(/set search_path = ''/.test(d), `search_path vazio: ${d.slice(0, 80)}`);
  }
  ok(/acc_resolve_external_party[\s\S]*stable[\s\S]*security definer/.test(c), "resolve é STABLE + SECURITY DEFINER");
  ok(/coalesce\(auth\.role\(\), ''\) = 'service_role' or public\.acc_project_tier\(p_project_id\) <> 'NONE'/.test(c), "resolve exige acesso ao projeto");
  for (const src of [c, m]) {
    ok(!/postgres(ql)?:\/\/[^\s:@]+:[^\s@]+@/.test(src) && !/eyJ[A-Za-z0-9_-]{20,}\./.test(src), "sem segredos");
    ok(!/\b(smtp|sendmail|gmail\.googleapis|graph\.microsoft)\b/i.test(src), "não envia nem lê caixa");
  }
  ok(!/record_risk_alert_action/.test(c + m), "não toca o hotfix P0");
  for (const f of ["20261203100000_external_parties_contract", "20261203110000_external_parties_management"]) ok(existsSync(path.join(root, `supabase/rollbacks/${f}.rollback.sql`)), `rollback ${f}`);
});

await check("ações e tela: guarda MANAGE/ADMIN no servidor, 404 para os demais, RPC (sem escrita direta), sem envio de e-mail, alvos >= 44px", () => {
  const a = read("apps/web/app/[projectId]/integracoes/contatos-externos/actions.ts");
  const p = read("apps/web/app/[projectId]/integracoes/contatos-externos/page.tsx");
  ok(/tier !== "MANAGE" && tier !== "ADMIN"/.test(a) && /tier !== "MANAGE" && tier !== "ADMIN"/.test(p), "guarda de nível");
  ok(/notFound\(\)/.test(p), "404");
  ok(!/\.from\("external_[a-z_]+"\)\.(insert|update|delete|upsert)/.test(a), "ações não escrevem direto");
  for (const rpcName of ["acc_external_org_save", "acc_external_link_save", "acc_external_domain_set", "acc_external_contact_set", "acc_external_candidate_decide"]) ok(a.includes(rpcName), `usa ${rpcName}`);
  ok(!/sendMail|nodemailer|gmail|graph\.microsoft/i.test(a + p), "não envia e-mail");
  ok(/min-h-11/.test(p) && !/min-h-9\b/.test(p), "alvos de toque >= 44px");
  ok(/text-gray-900|text-emerald-900|text-amber-900/.test(p) && !/text-gray-400|text-gray-500/.test(p), "contraste AA (sem cinza claro)");
  ok(/integracoes\/contatos-externos/.test(read("apps/web/app/[projectId]/integracoes/page.tsx")), "link no card de Integrações");
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed === 0 ? 0 : 1);
