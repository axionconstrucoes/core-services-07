// FASE 6 / H2a — parte PURA (sem banco, sem rede): regras das telas de Competências e de Aprovações externas, validação das entradas das
// server actions, tradução de erros, leitura com cliente falso e fiação estática (só RPCs permitidas, nenhuma chamada de e-mail,
// guardas de rota, helpIds existentes). A paridade com o Postgres real está em scripts/test-f6-h2a-governanca-realpg.mjs.
// Uso: node --no-warnings --import ./scripts/lib/block-live-ai.mjs scripts/test-f6-h2a-governanca.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

register("./ts-module-resolver.mjs", import.meta.url);
const CU = await import("../apps/web/lib/governance/competence-ui.ts");
const OPS = await import("../apps/web/lib/governance/competence-request-ops.ts");
const AP = await import("../apps/web/lib/governance/external-approval-ui.ts");
const SB = await import("../apps/web/lib/governance/external-send-binding.ts");
const ER = await import("../apps/web/lib/governance/governance-errors.ts");
const OV = await import("../apps/web/lib/governance/overview-data.ts");
const { ACC_FEATURE_HELP } = await import("../apps/web/lib/ui/help/registry.ts");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const read = (rel) => readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`OK   ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`FAIL ${name}\n     ${String(error.message).split("\n")[0]}`);
    failed += 1;
  }
}

const U1 = "00000000-0000-4000-8000-000000000001";
const U2 = "00000000-0000-4000-8000-000000000002";
const U3 = "00000000-0000-4000-8000-000000000003";
const ID = "10000000-0000-4000-8000-0000000000aa";
const TODAY = "2026-11-21";
const row = (over = {}) => ({ status: "ACTIVE", habilitation_status: "VALIDATED", revalidation_status: "CURRENT", valid_from: "2026-01-01", valid_until: null, ...over });

await check("situação da competência (espelho de acc_user_has_competence): só 'Vale' concede poder; valor ausente/desconhecido nunca vale", () => {
  assert.equal(CU.deriveCompetenceState(row(), TODAY), "VALIDA");
  assert.equal(CU.deriveCompetenceState(row({ habilitation_status: "MAINTENANCE" }), TODAY), "VALIDA");
  assert.equal(CU.deriveCompetenceState(row({ revalidation_status: "REQUIRED" }), TODAY), "AGUARDA_REVALIDACAO");
  assert.equal(CU.deriveCompetenceState(row({ revalidation_status: null }), TODAY), "AGUARDA_REVALIDACAO");
  assert.equal(CU.deriveCompetenceState(row({ revalidation_status: "OUTRO" }), TODAY), "AGUARDA_REVALIDACAO");
  assert.equal(CU.deriveCompetenceState(row({ habilitation_status: "UNVALIDATED" }), TODAY), "SEM_VALIDACAO");
  assert.equal(CU.deriveCompetenceState(row({ habilitation_status: null }), TODAY), "SEM_VALIDACAO");
  assert.equal(CU.deriveCompetenceState(row({ valid_until: "2026-11-20" }), TODAY), "VENCIDA");
  assert.equal(CU.deriveCompetenceState(row({ valid_until: TODAY }), TODAY), "VALIDA");
  assert.equal(CU.deriveCompetenceState(row({ valid_from: "2026-11-22" }), TODAY), "FUTURA");
  assert.equal(CU.deriveCompetenceState(row({ status: "REVOKED" }), TODAY), "REVOGADA");
  assert.equal(CU.deriveCompetenceState(row({ status: "???" }), TODAY), "SEM_VALIDACAO");
});

await check("validador designado: estados e prazo máximo de 180 dias", () => {
  assert.equal(CU.deriveValidatorState({ status: "PROPOSED", valid_from: "2026-11-01", valid_until: "2026-12-01" }, TODAY), "PROPOSTA");
  assert.equal(CU.deriveValidatorState({ status: "ACTIVE", valid_from: "2026-11-01", valid_until: "2026-12-01" }, TODAY), "ATIVO");
  assert.equal(CU.deriveValidatorState({ status: "ACTIVE", valid_from: "2026-01-01", valid_until: "2026-11-20" }, TODAY), "VENCIDO");
  assert.equal(CU.deriveValidatorState({ status: "PROPOSED", valid_from: "2026-01-01", valid_until: "2026-11-20" }, TODAY), "VENCIDO");
  assert.equal(CU.deriveValidatorState({ status: "REVOKED", valid_from: "2026-11-01", valid_until: "2026-12-01" }, TODAY), "REVOGADO");
  assert.equal(CU.deriveValidatorState({ status: "XXX", valid_from: "2026-11-01", valid_until: "2026-12-01" }, TODAY), "REVOGADO");
  assert.equal(CU.VALIDATOR_MAX_DAYS, 180);
  assert.equal(CU.maxValidatorUntil("2026-11-21"), "2027-05-20");
  assert.equal(CU.addDaysIso("2026-12-31", 1), "2027-01-01");
});

await check("alçada de competências: só ADMIN solicita/gerencia; validar e revalidar exigem independência (nunca quem solicitou, receberá ou concedeu)", () => {
  assert.equal(CU.canManageCompetences("ADMIN"), true);
  for (const t of ["MANAGE", "REGISTER", "READ", "NONE"]) assert.equal(CU.canManageCompetences(t), false, t);
  const req = { requested_by: U1, target_user_id: U2 };
  assert.equal(CU.canDecideRequest({ userId: U3, tier: "ADMIN", isActiveDesignatedValidator: false }, req), true);
  assert.equal(CU.canDecideRequest({ userId: U3, tier: "NONE", isActiveDesignatedValidator: true }, req), true);
  assert.equal(CU.canDecideRequest({ userId: U1, tier: "ADMIN", isActiveDesignatedValidator: true }, req), false);
  assert.equal(CU.canDecideRequest({ userId: U2, tier: "ADMIN", isActiveDesignatedValidator: true }, req), false);
  for (const t of ["MANAGE", "REGISTER", "READ", "NONE"]) assert.equal(CU.canDecideRequest({ userId: U3, tier: t, isActiveDesignatedValidator: false }, req), false, t);
  const comp = { user_id: U2, granted_by: U1 };
  assert.equal(CU.canRevalidate({ userId: U3, tier: "ADMIN", isActiveDesignatedValidator: false }, comp), true);
  assert.equal(CU.canRevalidate({ userId: U3, tier: "READ", isActiveDesignatedValidator: true }, comp), true);
  assert.equal(CU.canRevalidate({ userId: U1, tier: "ADMIN", isActiveDesignatedValidator: false }, comp), false, "quem concedeu");
  assert.equal(CU.canRevalidate({ userId: U2, tier: "ADMIN", isActiveDesignatedValidator: false }, comp), false, "a própria pessoa");
  assert.equal(CU.canRevalidate({ userId: U3, tier: "MANAGE", isActiveDesignatedValidator: false }, comp), false, "gestão sem ser validador");
  assert.equal(CU.canCancelRequest({ userId: U1, tier: "ADMIN" }, { requested_by: U1, status: "PENDING" }), true);
  assert.equal(CU.canCancelRequest({ userId: U3, tier: "ADMIN" }, { requested_by: U1, status: "PENDING" }), false);
  assert.equal(CU.canCancelRequest({ userId: U1, tier: "ADMIN" }, { requested_by: U1, status: "APPROVED" }), false);
});

await check("operação de revalidação: allowlist, versão, nota >= 20 e confirmação de evidência obrigatórias", () => {
  assert.equal(OPS.isCompetenceRequestOp("competence_revalidate"), true);
  const ok = OPS.buildCompetenceRequestCall({ op: "competence_revalidate", id: ID, expectedRowVersion: 3, note: "Diploma e registro conferidos no documento anexado.", evidenceChecked: true });
  assert.equal(ok.rpc, "project_competence_revalidate");
  assert.deepEqual(Object.keys(ok.params).sort(), ["p_evidence_checked", "p_expected_row_version", "p_id", "p_note"]);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "competence_revalidate", id: ID, expectedRowVersion: 3, note: "curta", evidenceChecked: true }), /mínimo de 20/);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "competence_revalidate", id: ID, expectedRowVersion: 3, note: "x".repeat(30), evidenceChecked: false }), /evidência/);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "competence_revalidate", id: "nao-uuid", expectedRowVersion: 3, note: "x".repeat(30), evidenceChecked: true }), /Identificador inválido/);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "competence_revalidate", id: ID, note: "x".repeat(30), evidenceChecked: true }), /Versão/);
  assert.throws(() => OPS.buildCompetenceRequestCall({ op: "apagar_tudo" }), /desconhecida/);
  assert.equal(OPS.isCompetenceRequestOp("project_competence_grant"), false, "a RPC antiga de concessão direta não é alcançável");
});

await check("destinatários: um por linha/vírgula; inválido, injeção de cabeçalho, vazio e > 20 são recusados; normaliza e ordena", () => {
  assert.deepEqual(AP.parseRecipients(" B@Empresa.com.br \n a@empresa.com.br,\nA@empresa.com.br"), ["a@empresa.com.br", "b@empresa.com.br"]);
  assert.throws(() => AP.parseRecipients(""), /ao menos um/);
  assert.throws(() => AP.parseRecipients("sem-arroba"), /Destinatário/);
  assert.throws(() => AP.parseRecipients("a@empresa.com.br\r\nBcc: x@y.com"), /Destinatário/);
  assert.throws(() => AP.parseRecipients("a@example.com"), /reservado/);
  const many = Array.from({ length: 21 }, (_, i) => `p${i}@empresa.com.br`).join("\n");
  assert.throws(() => AP.parseRecipients(many), /No máximo 20/);
});

await check("conteúdo canônico: CRLF == LF, aparado, anexos ordenados; hash estável e sensível a qualquer mudança; recusa vazio e excesso", () => {
  const a = AP.canonicalContent({ subject: " Assunto ", body: "Linha 1\r\nLinha 2 \n", attachmentsText: "b.pdf\n a.pdf\n" });
  const b = AP.canonicalContent({ subject: "Assunto", body: "Linha 1\nLinha 2", attachmentsText: "a.pdf\nb.pdf" });
  assert.equal(a.hash, b.hash);
  assert.deepEqual(a.attachments, ["a.pdf", "b.pdf"]);
  assert.match(a.hash, /^[0-9a-f]{64}$/);
  assert.notEqual(AP.canonicalContent({ subject: "Assunto", body: "Linha 1\nLinha 2!" }).hash, b.hash);
  assert.notEqual(AP.canonicalContent({ subject: "Outro", body: "Linha 1\nLinha 2", attachmentsText: "a.pdf\nb.pdf" }).hash, b.hash);
  assert.notEqual(AP.canonicalContent({ subject: "Assunto", body: "Linha 1\nLinha 2", attachmentsText: "a.pdf" }).hash, b.hash);
  assert.throws(() => AP.canonicalContent({ body: "   " }), /Informe o texto/);
  assert.throws(() => AP.canonicalContent({ body: "x".repeat(20001) }), /20000/);
  assert.throws(() => AP.canonicalContent({ subject: "x".repeat(301), body: "ok" }), /300/);
  assert.equal(a.hash, SB.hashExternalSendContent({ subject: a.subject, body: a.body, attachments: a.attachments }), "mesma função usada pelo banco/TS de E");
  assert.equal(AP.verifyStoredHash(a, a.hash), true);
  assert.equal(AP.verifyStoredHash({ ...a, body: a.body + " " }, a.hash), true, "espaços nas pontas são normalizados pelo hash canônico");
  assert.equal(AP.verifyStoredHash({ ...a, body: "adulterado" }, a.hash), false);
});

await check("preparar: chamada à RPC com conteúdo (sem e-mail), contexto/ação em allowlist, versão obrigatória, projeto UUID", () => {
  const input = { projectId: ID, context: "SEGUROS_MINUTA", action: "ENVIO_NOVO", recipientsText: "a@empresa.com.br", subject: "S", body: "Texto", version: "v1" };
  const c = AP.buildPrepareCall(input);
  assert.equal(c.rpc, "acc_external_send_prepare_with_content");
  assert.equal(c.params.p_content_hash.length, 64);
  assert.deepEqual(c.params.p_recipients, ["a@empresa.com.br"]);
  for (const bad of [{ context: "QUALQUER" }, { action: "ENVIAR_AGORA" }, { version: "" }, { version: "v".repeat(61) }, { projectId: "x" }]) {
    assert.throws(() => AP.buildPrepareCall({ ...input, ...bad }), AP.ApprovalInputError);
  }
});

await check("decidir: aprovar exige motivo para externo; recusar e cancelar exigem 10+ caracteres; id UUID; operação desconhecida recusada", () => {
  assert.equal(AP.buildDecisionCall({ op: "approve", id: ID, reason: "Cliente pediu retorno formal.", externalCount: 1 }).params.p_decision, "APPROVE");
  assert.throws(() => AP.buildDecisionCall({ op: "approve", id: ID, reason: "", externalCount: 1 }), /exige motivo/);
  assert.equal(AP.buildDecisionCall({ op: "approve", id: ID, reason: "", externalCount: 0 }).params.p_reason, null);
  assert.throws(() => AP.buildDecisionCall({ op: "reject", id: ID, reason: "curto" }), /10/);
  assert.equal(AP.buildDecisionCall({ op: "reject", id: ID, reason: "Texto incompleto, refazer." }).params.p_decision, "REJECT");
  assert.equal(AP.buildDecisionCall({ op: "cancel", id: ID, reason: "Preparador desistiu do envio." }).rpc, "acc_external_send_cancel");
  assert.throws(() => AP.buildDecisionCall({ op: "cancel", id: "x", reason: "Preparador desistiu do envio." }), /inválida/);
  assert.throws(() => AP.buildDecisionCall({ op: "consume", id: ID, reason: "Preparador desistiu do envio." }), /desconhecida/);
});

await check("alçada de aprovação: prepara COLABORADOR+; decide gestão; minuta de Seguros só ADMIN; cancelar = preparador ou gestão", () => {
  for (const t of ["REGISTER", "MANAGE", "ADMIN"]) assert.equal(AP.canPrepare(t), true, t);
  for (const t of ["READ", "NONE"]) assert.equal(AP.canPrepare(t), false, t);
  for (const c of SB.SEND_CONTEXTS) {
    assert.equal(AP.canDecide("MANAGE", c), c !== "SEGUROS_MINUTA", `MANAGE/${c}`);
    assert.equal(AP.canDecide("ADMIN", c), true, `ADMIN/${c}`);
    for (const t of ["REGISTER", "READ", "NONE"]) assert.equal(AP.canDecide(t, c), false, `${t}/${c}`);
  }
  assert.equal(AP.requiredTierLabel("SEGUROS_MINUTA"), "ADMINISTRADOR");
  assert.equal(AP.canCancel({ userId: U1, tier: "REGISTER" }, { prepared_by: U1, status: "PREPARED" }), true);
  assert.equal(AP.canCancel({ userId: U2, tier: "REGISTER" }, { prepared_by: U1, status: "PREPARED" }), false);
  assert.equal(AP.canCancel({ userId: U2, tier: "MANAGE" }, { prepared_by: U1, status: "APPROVED" }), true);
  assert.equal(AP.canCancel({ userId: U1, tier: "ADMIN" }, { prepared_by: U1, status: "CONSUMED" }), false);
});

await check("erros: códigos das RPCs viram mensagem do catálogo; nunca vaza SQL; código desconhecido vira genérico; ?erro= só exibe catálogo", () => {
  assert.equal(ER.explainGovernanceError("INDEPENDENT_VALIDATOR_REQUIRED: quem solicitou ...").code, "INDEPENDENT_VALIDATOR_REQUIRED");
  assert.match(ER.explainGovernanceError("COMPETENCE_REVALIDATION_REQUIRED: x").message, /REVALIDADA/);
  assert.match(ER.explainGovernanceError("FORBIDDEN: a aprovação deste envio exige ADMINISTRADOR").message, /ADMINISTRADOR do projeto/);
  assert.match(ER.explainGovernanceError("FORBIDDEN: a aprovação deste envio exige gestão (GESTOR, GERENTE ou ADMINISTRADOR)").message, /gestão/);
  assert.equal(ER.explainGovernanceError('permission denied for table project_competences').code, "FORBIDDEN");
  const unknown = ER.explainGovernanceError('duplicate key value violates unique constraint "x" DETAIL: Key (a)=(b)');
  assert.doesNotMatch(unknown.message, /duplicate|constraint|DETAIL/);
  assert.equal(ER.explainGovernanceError(null).code, "FALHA");
  assert.match(ER.messageForErrorParam("<script>alert(1)</script>"), /Não foi possível/);
  assert.match(ER.messageForErrorParam("CONTENT_HASH_MISMATCH"), /hash/);
  for (const code of ["FORBIDDEN", "VERSION_CONFLICT", "EVIDENCE_REQUIRED", "COMPETENCE_REVALIDATION_REQUIRED", "CONFIRMATION_ALREADY_USED"]) assert.ok(ER.KNOWN_ERROR_CODES.includes(code), code);
});

// ---- leitura com cliente falso (nenhuma rede) ----
function fakeClient(tables, errors = {}) {
  const make = (table) => {
    const q = {
      select: () => q, eq: () => q, order: () => q, in: () => q,
      limit: () => q,
      then: (resolve) => resolve(errors[table] ? { data: null, error: { message: errors[table] } } : { data: tables[table] ?? [], error: null }),
    };
    return q;
  };
  return { from: make, rpc: async (fn) => (fn === "acc_am_designated_competence_validator" ? { data: tables.__designated === true, error: null } : { data: null, error: null }) };
}

await check("leitura: monta visão, nomes e validador designado; tabela ausente => unavailable (SEM DADOS), nunca inventa", async () => {
  const comp = { id: "c1", project_id: ID, user_id: U2, competence: "JURIDICO", status: "ACTIVE", habilitation_status: "MAINTENANCE", revalidation_status: "REQUIRED", valid_from: "2026-01-01", valid_until: null, granted_by: U1, granted_at: "2026-02-01T00:00:00Z", row_version: 1, evidence_document_id: null, registration_kind: null, revalidated_at: null, revoked_at: null };
  const ok = await OV.loadCompetencesOverview(fakeClient({ project_competences: [comp], profiles: [{ id: U2, name: "Maria" }], __designated: true }), ID);
  assert.equal(ok.unavailable, false);
  assert.equal(ok.competences.length, 1);
  assert.equal(ok.names[U2], "Maria");
  assert.equal(ok.isDesignatedValidator, true);
  assert.equal(OV.displayName(ok.names, U1), `usuário ${U1.slice(0, 8)}…`);
  assert.equal(CU.deriveCompetenceState(ok.competences[0], TODAY), "AGUARDA_REVALIDACAO");
  const miss = await OV.loadCompetencesOverview(fakeClient({}, { project_competences: 'relation "public.project_competences" does not exist' }), ID);
  assert.equal(miss.unavailable, true);
  assert.deepEqual(miss.competences, []);
  const ap = await OV.loadApprovalsOverview(fakeClient({}, { external_send_preparations: "permission denied for table external_send_preparations" }), ID);
  assert.equal(ap.unavailable, true);
  assert.deepEqual(ap.preparations, []);
});

// ---- fiação estática ----
const ALLOWED_RPCS = new Set([
  "project_competence_request_create", "project_competence_request_cancel", "project_competence_request_decide", "project_competence_validator_designate",
  "project_competence_validator_accept", "project_competence_validator_revoke", "project_competence_revalidate",
  "acc_external_send_prepare_with_content", "acc_external_send_decide", "acc_external_send_cancel",
]);

await check("fiação: as ações só chamam RPCs permitidas (nenhum consumo da autorização, nenhuma concessão direta), sem e-mail/rede/segredo e com guarda de nível", () => {
  for (const f of ["apps/web/app/[projectId]/competencias/actions.ts", "apps/web/app/[projectId]/aprovacoes-externas/actions.ts"]) {
    const src = read(f);
    assert.match(src, /^"use server";/, f);
    assert.match(src, /getProjectTier\(projectId\)/, f);
    assert.doesNotMatch(src, /acc_external_send_consume|project_competence_grant|insert\(|\.update\(|\.delete\(|from\("/, f);
    assert.doesNotMatch(src, /nodemailer|googleapis|gmail|smtp|sendMail|fetch\(|process\.env|SERVICE_ROLE|service_role/i, f);
    for (const m of src.matchAll(/rpc\(call\.rpc/g)) assert.ok(m);
  }
  const builders = read("apps/web/lib/governance/competence-request-ops.ts") + read("apps/web/lib/governance/external-approval-ui.ts");
  const used = [...builders.matchAll(/rpc: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(used.length >= 10);
  for (const r of used) assert.ok(ALLOWED_RPCS.has(r), `RPC fora da allowlist: ${r}`);
});

await check("fiação: guardas de rota nos dois segmentos, itens no menu e nível mínimo; páginas sem HTML injetado e sem segredo", () => {
  for (const [seg, min] of [["competencias", "READ"], ["aprovacoes-externas", "REGISTER"]]) {
    const layout = read(`apps/web/app/[projectId]/${seg}/layout.tsx`);
    assert.match(layout, new RegExp(`requireSegmentAccess\\(projectId, "${seg}"\\)`));
    assert.match(read("apps/web/lib/permissions/nav-access.ts"), new RegExp(`${seg.includes("-") ? `"${seg}"` : seg}: "${min}"`));
    assert.match(read("apps/web/lib/ui/nav-items.ts"), new RegExp(`href: "${seg}"`));
    const page = read(`apps/web/app/[projectId]/${seg}/page.tsx`);
    assert.doesNotMatch(page, /dangerouslySetInnerHTML|process\.env|SERVICE_ROLE/);
  }
  assert.match(read("apps/web/app/[projectId]/aprovacoes-externas/page.tsx"), /if \(!canPrepare\(tier\)\) notFound\(\)/);
  assert.match(read("apps/web/app/[projectId]/competencias/page.tsx"), /if \(tier === "NONE"\) notFound\(\)/);
});

await check("Hover Text: todo helpId usado nas páginas, nas ações e no menu existe no catálogo; cada controle tem alvo >= 44 px (min-h-11)", () => {
  const files = ["apps/web/app/[projectId]/competencias/page.tsx", "apps/web/app/[projectId]/aprovacoes-externas/page.tsx", "apps/web/lib/ui/nav-items.ts"];
  let n = 0;
  for (const f of files) {
    for (const m of read(f).matchAll(/helpId[=:]\s*"(governanca\.[a-z0-9.-]+)"/g)) {
      n += 1;
      assert.ok(ACC_FEATURE_HELP[m[1]], `${f}: helpId inexistente ${m[1]}`);
    }
  }
  assert.ok(n >= 40, `helpIds referenciados: ${n}`);
  const ui = read("apps/web/components/governance/governance-ui.tsx");
  for (const k of ["INPUT", "BTN", "BTN_ALT", "BTN_DANGER"]) assert.match(ui, new RegExp(`${k} = "[^"]*min-h-11`), k);
  const pages = read(files[0]) + read(files[1]);
  assert.doesNotMatch(pages, /<button[^>]*className="(?!\{)/, "botões usam as constantes de 44 px");
});

await check("migration H2a: arquivo, rollback e linhas de inventário (01) e rollback/validação (03) existem; RPCs só para authenticated; sem envio", () => {
  const mig = "supabase/migrations/20261208100000_competence_revalidation_send_content.sql";
  assert.ok(existsSync(path.join(root, mig)));
  assert.ok(existsSync(path.join(root, "supabase/rollbacks/20261208100000_competence_revalidation_send_content.rollback.sql")));
  const sql = read(mig);
  assert.match(sql, /add column if not exists revalidation_status text not null default 'REQUIRED'/);
  assert.match(sql, /alter column revalidation_status set default 'CURRENT'/);
  assert.match(sql, /revoke all on function public\.project_competence_revalidate\(uuid, integer, text, boolean\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.project_competence_revalidate\(uuid, integer, text, boolean\) to authenticated;/);
  assert.doesNotMatch(sql, /pg_net|http_post|net\.http|smtp|sendmail/i);
  assert.match(read("docs/implantacao/01-inventario-migrations.md"), /20261208100000_competence_revalidation_send_content/);
  assert.match(read("docs/implantacao/03-rollback-validacao.md"), /20261208100000_competence_revalidation_send_content/);
});

console.log(`\n${passed} ok, ${failed} falha(s)`);
process.exit(failed ? 1 : 0);
